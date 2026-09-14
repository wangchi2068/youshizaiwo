/**
 * 记忆账本演示（内科版）：旁侧模型自动记账 + 账本快照注入。
 *
 * 流程：
 *  第 1 轮：用户输入一段有信息量的剧情 → harness 生成正文 → 旁侧模型记账 → 展示账本；
 *  第 2 轮：新输入 → 组装 system（角色设定 + 账本快照注入）→ 生成正文 → 再记账 → 展示合并后的账本。
 *
 * 用法：node scripts/ledger-demo.ts
 */
import { loadConfig } from "../src/config.ts";
import { LlmClient, type ChatMessage } from "../src/llm/client.ts";
import { ToolRegistry } from "../src/tools/registry.ts";
import { registerBuiltinTools } from "../src/tools/builtin.ts";
import { Harness } from "../src/harness/harness.ts";
import { LedgerService, snapshotText } from "../src/harness/memory-ledger.ts";

const CHARACTER_NAME = "林医生";
const CHARACTER_SYSTEM = `你是「${CHARACTER_NAME}」，寄居在古玉里的上古剑仙残魂，嘴毒心软，爱用网络梗怼人。
你与当班值班医生（用户）共处一间会诊室——他管着七个科室互相打架的意见，还要签字。用第一人称扮演，保持谨慎、讲条件、把话念完的人设，回应不超过 200 字。`;

const cfg = loadConfig();
if (!cfg.apiKey) {
  console.error("缺少 WANGDACHUI_API_KEY：请检查 .env 文件");
  process.exit(1);
}

const client = new LlmClient(cfg);
const registry = new ToolRegistry({ stateDir: cfg.stateDir });
registerBuiltinTools(registry, { stateDir: cfg.stateDir });
const harness = new Harness(client, registry, cfg);
const ledger = new LedgerService(client, cfg.stateDir);

/** 组装一回合的完整消息：system(角色 + 账本快照) + 历史 + 用户输入 */
function assemble(history: ChatMessage[], userInput: string): ChatMessage[] {
  const system = `${CHARACTER_SYSTEM}\n\n【当前世界状态（账本快照）】\n${snapshotText(ledger.load())}`;
  return [{ role: "system", content: system }, ...history, { role: "user", content: userInput }];
}

async function playTurn(history: ChatMessage[], userInput: string): Promise<ChatMessage[]> {
  console.log(`\n══════ 用户：${userInput}`);
  const messages = assemble(history, userInput);
  const result = await harness.runTurn(messages, {
    onNarrativeDelta: (d) => process.stdout.write(d),
  });
  console.log();
  if (result.stoppedBy === "max-turns") console.warn("〔警告〕本轮达到循环上限");

  const update = await ledger.updateAfterTurn({
    characterName: CHARACTER_NAME,
    userInput,
    narrative: result.content,
  });
  console.log(
    update.ok
      ? `〔记账〕旁侧模型已更新账本（新增/更新 ${update.touched ?? 0} 条）`
      : `〔记账〕跳过：${update.error}`,
  );
  return result.added;
}

// 第 1 轮：建立人物、物品、关系、伏笔
let history: ChatMessage[] = [];
history.push(
  ...(await playTurn(
    history,
    "我是当班主管医生。凌晨四点二十收进来一个病人，主诉含糊，查体拿不准。上午九点各科会诊：风湿科说要先压原发病，内分泌科说血糖这条链子不能断，血液科林医生把四项评估条件念完才肯动。",
  )),
);

console.log("\n──────────────── 第 1 轮后的账本 ────────────────");
console.log(JSON.stringify(ledger.load(), null, 2).slice(0, 900));

// 第 2 轮：新增物品 + 关系发展，验证合并与去重
history.push(
  ...(await playTurn(
    history,
    "上午会诊的时候，风湿科和内分泌科当着我的面顶上来了，一个说要先压原发病，一个说血糖这条链子不能断。林医生站在门口把四项评估条件又念了一遍。这一针到底打不打，我得在今天下班前给个话。",
  )),
);

console.log("\n──────────────── 第 2 轮后的账本（合并去重后） ────────────────");
console.log(JSON.stringify(ledger.load(), null, 2).slice(0, 1200));

console.log("\n──────────────── 下轮将注入的账本快照 ────────────────");
console.log(snapshotText(ledger.load()));
