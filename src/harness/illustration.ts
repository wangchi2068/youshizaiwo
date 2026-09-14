import type { Config } from "../config.ts";
import { LlmClient, type ChatMessage } from "../llm/client.ts";
import { metrics } from "../metrics.ts";

/**
 * 回合配图：把一段剧情正文变成一张插画。
 *
 * 两步走——
 *  1. 旁侧模型把中文正文提炼成一句画面描述（提炼不出就退回模板，保证不空手）；
 *  2. 调 provider 的图像接口出图，返回 data URL（Vercel 无持久盘，不落盘）。
 *
 * 设计约束（见 README「配图」节）：
 *  - 全程异步、不阻塞正文：正文先流式给用户，图好了再补上；
 *  - 任何一步失败都静默降级（返回 ok:false），绝不打断对话；
 *  - 铁律「画面里没有人」写进提示词，且禁止出现任何文字水印。
 */
export interface IllustrationResult {
  ok: boolean;
  /** 成功时的图（原始字节 + 真实 MIME）。不转 base64：那会白白撑大 33% 体积 */
  image?: { buf: Buffer; mime: string };
  /** 实际用于出图的画面描述（诊断/展示用） */
  prompt?: string;
  /** 失败原因：disabled / empty / cap / daily-cap / prompt-failed / image-failed */
  reason?: string;
  /** 出图耗时（毫秒） */
  ms?: number;
}

/** 美术方向：与 assets/campaigns/neike/art/README.md 保持一致 */
const ART_DIRECTION = `军事指挥所与病历档案风格：冷色调（青灰、铅白，台灯的一小点暖），纸张的纹理与折痕，红蓝铅笔的批注，作战地图与沙盘，老式电话、电报稿，夜间走廊尽头的一盏灯。
铁律：画面里绝对不能出现人——不出现人体、人体局部、背影、手、血液、器官、伤口，也不出现任何侵入性操作（针管、导管、手术器械）。只用物、纸、光、地图来叙事。
画面中不得出现可辨认的文字、字幕、水印、UI 元素；地图与病历上的字迹可以是模糊示意性的。
写实、克制、档案感；不要卡通、不要漫画式夸张、不要血腥恐怖。
构图把"纸与地图"放在画面中间，四周留出可裁切的余量。`;

const PROMPT_SYSTEM = `你是《优势在我》的配图提示词作者。这部作品讲一个内科当班主管医生，在七个科室互相打架的意见里拍板，故事发生在深夜的病房走廊、会诊室与主任办公室之间。

把你收到的剧情片段，改写成一句可以直接交给文生图模型的画面描述。写成一整句连贯的话（不要换行、不要引号、不要任何括号或字段标签、不要解释），依次交代三件事：这句话里最显眼的那几件东西是什么、摆在什么位置（病历纸、化验单、作战地图、沙盘、红蓝铅笔、老式电话、值班室的钟、走廊尽头的一盏灯）；周围的环境（会诊室／走廊／护士站／办公室）；光从哪个方向来。最后缀上"冷色调，档案感，写实"。

硬性要求：
1. 必须落在一件具体的物上（纸、地图、灯、电话、钟、桌、笔），不要只写情绪或气氛；
2. 全句 60-120 字，信息密度要高；
3. 严格遵守美术方向：${ART_DIRECTION}
4. 不要写心理活动、对白、比喻；**绝对不要出现人**——不写医生、护士、病人，也不写手、背影、人影。

如果剧情里没有明显画面（纯对话、纯内心活动），就画"这段剧情正在发生的那间会诊室／走廊的空镜（桌上有摊开的病历与一盏台灯）"，不要省略具体物件。`;

interface ImageApiResponse {
  data?: { b64_json?: string; url?: string }[];
  error?: { message?: string };
}

/**
 * 把模型返回的正文清洗成一行画面描述：
 * 剥掉内联思考块与引号，合并所有非空行（模型常把描述拆成好几行，
 * 只取第一行会得到半句话），压平空白。
 */
export function cleanSceneLine(raw: string): string {
  return (raw || "")
    .replace(/<think>[\s\S]*?<\/think>/g, "")
    .split("\n")
    .map((s) => s.replace(/^[\s\-*#>0-9.、)]+/, "").trim())
    .filter(Boolean)
    .join(" ")
    // 模型会照抄提示词模板里的 <主体：…> 尖括号与字段名，去掉再交给图像模型
    .replace(/[<>]/g, "")
    .replace(/(主体|环境|光|镜头|画面|构图)\s*[:：]/g, "")
    .replace(/^["'「『]|["'」』]$/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * 出图器：无状态，进程内共享一个实例即可。
 * 提示词提炼用便宜的非思考模型（可用 WANGDACHUI_ILLUSTRATION_PROMPT_MODEL 换），
 * 出图按 provider 列表逐个重试（主 provider 失败自动落到兜底）。
 *
 * 延迟构成（实测）：提炼约 2.4s + 出图约 6s（gemini-3.1-flash-lite-image）。
 * 出图那一步受上游负载影响波动很大——同一个模型可能 6s 也可能 23s，
 * 所以默认选了最快且体积最小的 lite 版；换模型前先拿真实提示词量一遍。
 */
export class Illustrator {
  private cfg: Config;
  private promptClient: LlmClient;

  constructor(cfg: Config) {
    this.cfg = cfg;
    this.promptClient = new LlmClient({
      ...cfg,
      model: cfg.illustrationPromptModel ?? cfg.model,
    });
  }

  get enabled(): boolean {
    return this.cfg.illustrationEnabled;
  }

  /** 出图上限（每会话），0 = 不限 */
  get maxPerSession(): number {
    return this.cfg.illustrationMaxPerSession;
  }

  /** 出图上限（全局每日，进程内计数），0 = 不限 */
  get dailyMax(): number {
    return this.cfg.illustrationDailyMax;
  }

  async render(narrative: string): Promise<IllustrationResult> {
    const text = (narrative || "").trim();
    if (!text) return { ok: false, reason: "empty" };
    const t0 = Date.now();

    const prompt = await this.buildPrompt(text);
    if (!prompt) {
      metrics.inc("illustration.fail", 1);
      return { ok: false, reason: "prompt-failed" };
    }

    const image = await this.generate(prompt);
    if (!image) {
      metrics.inc("illustration.fail", 1);
      return { ok: false, reason: "image-failed", prompt, ms: Date.now() - t0 };
    }
    metrics.inc("illustration.ok", 1);
    return { ok: true, image, prompt, ms: Date.now() - t0 };
  }

  /** 第一步：正文 → 画面描述（失败回退到截断正文，保证仍能出图） */
  private async buildPrompt(narrative: string): Promise<string> {
    const excerpt = narrative.slice(0, 800);
    const messages: ChatMessage[] = [
      { role: "system", content: PROMPT_SYSTEM },
      { role: "user", content: excerpt },
    ];
    // 两次机会：思考型模型会把输出预算烧在思维链上（实测 gemini-3.8-flash 用 289/296
    // 的 token 做推理，正文只剩十个字），所以第一次太短就加大预算再来一次。
    for (const maxTokens of [600, 1800]) {
      try {
        const r = await this.promptClient.chat(messages, { temperature: 0.6, maxTokens });
        const line = cleanSceneLine(r.content);
        // 合格线：够长、且落在具体物件上——否则出的图会是一张没有主角的抽象空镜
        if (line.length >= 25 && /纸|图|灯|单|桌|笔|钟|电话|走廊|办公室|会诊|病历|沙盘|窗|门|墙|椅|柜|屏/.test(line))
          return line.slice(0, 300);
      } catch {
        /* 换更大预算再试 */
      }
    }
    // 兜底：直接拿正文前段当画面描述，并补一句主体锚点，避免出成纯环境空镜
    const fallback = excerpt.replace(/\s+/g, " ").trim().slice(0, 150);
    return fallback ? `指挥所与档案风格，画面里是会议桌、摊开的病历纸与一盏台灯。${fallback}` : "";
  }

  /** 第二步：画面描述 → 图（原始字节 + MIME）。所有 provider 共用一份超时预算。 */
  private async generate(
    prompt: string,
  ): Promise<{ buf: Buffer; mime: string } | null> {
    const providers = [
      { apiBase: this.cfg.apiBase, apiKey: this.cfg.apiKey },
      ...(this.cfg.fallbacks ?? []).map((f) => ({ apiBase: f.apiBase, apiKey: f.apiKey })),
    ];
    // 单一截止时间：以前每个 provider 各给一份超时，主 provider 卡满 60s 后
    // 兜底再卡 60s，一次出图能拖到 127s。图像模型是网关特有的，拿同一个模型名
    // 去别家兜底多半没用，所以让所有尝试共享一份预算，到点就放弃。
    const deadline = Date.now() + this.cfg.illustrationTimeoutMs;
    for (const p of providers) {
      if (!p.apiBase || !p.apiKey) continue;
      const remain = deadline - Date.now();
      if (remain < 1000) break;
      try {
        const ctrl = new AbortController();
        const timer = setTimeout(() => ctrl.abort(), remain);
        let res: Response;
        try {
          res = await fetch(`${p.apiBase.replace(/\/+$/, "")}/images/generations`, {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              Authorization: `Bearer ${p.apiKey}`,
            },
            body: JSON.stringify({
              model: this.cfg.illustrationModel,
              prompt: `${prompt}\n\n${ART_DIRECTION}`,
              size: this.cfg.illustrationSize,
              n: 1,
            }),
            signal: ctrl.signal,
          });
        } finally {
          clearTimeout(timer);
        }
        if (!res.ok) continue;
        const data = (await res.json()) as ImageApiResponse;
        const item = data.data?.[0];
        if (item?.b64_json) {
          const buf = Buffer.from(item.b64_json, "base64");
          return { buf, mime: mimeOf(buf.subarray(0, 12)) };
        }
        if (item?.url) {
          const imgRemain = deadline - Date.now();
          if (imgRemain < 1000) break;
          const ictrl = new AbortController();
          const itimer = setTimeout(() => ictrl.abort(), imgRemain);
          try {
            const img = await fetch(item.url, { signal: ictrl.signal });
            if (!img.ok) continue;
            const buf = Buffer.from(await img.arrayBuffer());
            return { buf, mime: mimeOf(buf.subarray(0, 12)) };
          } finally {
            clearTimeout(itimer);
          }
        }
      } catch {
        /* 换下一个 provider */
      }
    }
    return null;
  }
}

/**
 * 按文件头判定真实 MIME。
 * 注意：网关（至少这一个）即使请求的是 png，实际回的是带 C2PA 签名的 JPEG；
 * 一律标成 image/png 虽然靠浏览器嗅探也能显示，但类型是错的。
 */
function mimeOf(head: Buffer): string {
  if (head[0] === 0xff && head[1] === 0xd8) return "image/jpeg";
  if (head[0] === 0x89 && head[1] === 0x50) return "image/png";
  if (head[0] === 0x52 && head[1] === 0x49 && head[8] === 0x57) return "image/webp";
  if (head[0] === 0x47 && head[1] === 0x49) return "image/gif";
  return "image/png";
}
