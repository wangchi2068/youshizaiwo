# 计划：拆出独立的《大决战·内科》项目（无蚂蚁版）

> 日期：2026-09-12
> 决策：**新建独立项目，只保留内科战役，不含任何蚂蚁内容**
> 关联：战役设定见 [`2026-09-12-neike-campaign-design.md`](2026-09-12-neike-campaign-design.md)

---

## 一、为什么走独立项目（以及放弃了什么）

上一轮比较过两条路：共用运行时只补 80 行硬编码，或另起一个项目。**本次选择另起项目**，理由是用户希望这份内科版**完全不含蚂蚁内容**——共用运行时的话，蚂蚁战役包会一直躺在同一个仓库里，达不到「无蚂蚁版」。

**要接受的代价**：运行时被复制成两份（8734 行：src 4423 + 前端 2628 + 测试 1683）。**2026-09-12 当天修的四个 bug**（第四幕只停留 2 回合、HTTP 路径没有串行锁、token 护栏漏了 HTTP、前端未连接时静默吞输入）都已在新项目里（复制发生在修复之后），**但从今往后每一条运行时修复都要改两遍**。缓解办法见第五节。

---

## 二、需要你拍板的四件事

| # | 事项 | 我的建议 | 备选 |
| --- | --- | --- | --- |
| 1 | 文件夹 / 仓库名 | `neike` | `dajuezhan-neike` |
| 2 | 显示标题 | 《大决战·内科》 | 《优势在我》（更短，且**避开电影《大决战》的片名**，戏仿风险更低） |
| 3 | 环境变量前缀 | 保留 `WANGDACHUI_`（零改动，`.env`、Vercel、文档全不用动） | 改 `NEIKE_`（更干净，但要改 config + 全文档 + Vercel 变量） |
| 4 | 仓库可见性 | 公开（沿用蚂蚁包的做法，方便队友 fork） | 私有 |

**第 2 项我倾向《优势在我》**：它取自原回答的收尾包袱（「二氧化碳分压是 40 对 50，优势在我」），记忆点更强，而且不必背上电影片名的戏仿包袱。你定。

---

## 三、阶段一：搭骨架（约半天）

### 3.1 复制（保留）

从 `D:\trae\quanchaozhili` 复制到 `D:\trae\neike`，**排除** `.git`、`state/`、`.env`、`.env.local`、`.vercel/`、`node_modules/`、`assets/campaigns/ants/`。

保留清单：

```
src/                 运行时（4423 行，逐字复制，除 3.4 的三处外不做任何改动）
web/index.html       前端（2628 行，除里 3.4 的三处外不改）
test/                67 个单测（逐字复制）
scripts/             辅助脚本（3.3 需改引用路径）
docs/adr/            7 篇架构决策（与战役无关，原样保留）
docs/DESIGN.md       运行时设计文档（改标题，见 3.3）
reports/             评测报告（改措辞，见 3.3）
deploy/              部署辅助（Prometheus 配置等）
Dockerfile / docker-compose*.yml / vercel.json / tsconfig.json / .dockerignore / .vercelignore
package.json / package-lock.json
```

### 3.2 删除（蚂蚁专属）

```
assets/campaigns/ants/          12MB，全部（六幕配图、SVG 生成器、角色卡、世界书、九个 NPC、结局清单）
docs/RESUME.md                  已移出，不再带入
docs/PLAN-cpolar-deploy.md      个人部署记录（或带入脱敏版，建议不带）
reports/EVALUATION.md 中与蚂蚁战役绑定的场景描述（保留框架性数字，删具体战役引用）
```

### 3.3 改名（去蚂蚁、去旧项目名）

| 文件 | 改什么 |
| --- | --- |
| `package.json` | `name: "neike"`；`description` 换成内科版 |
| `README.md` | 整篇重写为内科版（标题、六幕表、机制、版权与免责声明） |
| `README.en.md` | 同步或直接删除 |
| `docs/DESIGN.md` | 标题 `wangdachui.pi 设计文档` → 本项目名 |
| `scripts/*-demo.ts` | 三处硬编码路径 `assets/campaigns/ants/card-ants.json` → `assets/campaigns/neike/card-neike.json`（`card-demo.ts:16,28`、`context-demo.ts:31`、`decision-demo.ts:34`） |

### 3.4 四处硬编码改成内科（**本阶段的核心工作**）

| # | 位置 | 现状（蚂蚁） | 改成（内科） |
| --- | --- | --- | --- |
| 1 | `web/index.html` 的 `ACT_ART` 表（73 行） | 六幕标题/副标/引文/描述/图源全是蚂蚁 | 换成内科六幕，图源指向 `/assets/campaigns/neike/art/actN.*` |
| 2 | `web/index.html` 两处 `<img src=".../campaigns/ants/...">` | 硬编码蚂蚁图 | 指向内科图 |
| 3 | `src/harness/illustration.ts` 的 `ART_DIRECTION`（4 行） | 「把蚂蚁放在画面中间」「神不在人类画面里」 | 换成内科美术方向（地图/纸张/走廊，**明确禁止人体、血、器官**） |
| 4 | `src/server.ts:374` 默认卡回退路径 | `assets/campaigns/ants/card-ants.json` | `assets/campaigns/neike/card-neike.json` |

> 这四处**只改字面值，不改结构**——保持与上游逐行可对比，日后同步 bug 修复时 diff 才干净。

### 3.5 环境与密钥

- `src/config.ts:89` 默认战役名 `"ants"` → `"neike"`
- `.env.example` 沿用（只改注释里的战役名）
- `git init`，**单一初始提交**（无历史包袱，也就没有需要重写的历史）
- 提交身份沿用：`wangdachui2068 <211684579+wangchi2068@users.noreply.github.com>`

**阶段一验收（硬性）**：
1. `npm test` 67/67（或按改名后的数量）全过
2. `WANGDACHUI_CAMPAIGN=neike npm run web` 能起服务不报错
3. **全仓库 `grep -ri "蚂蚁\|ants\|全巢之力"` 只在 `docs/plans/` 两份计划文档里出现，代码、资源、README 零命中**
4. 页面能打开、幕图横幅显示占位图（此时内科配图还没做，允许 404 但有兜底）

---

## 四、阶段二～四：内容、配图、上线

**战役内容（arc / 角色卡 / 世界书 / 九张 NPC / 结局 / 机制文档）完全按
[`2026-09-12-neike-campaign-design.md`](2026-09-12-neike-campaign-design.md) 执行**，本计划不重复罗列。要点：

- 目标目录 `assets/campaigns/neike/`，文件命名沿用蚂蚁包的约定（`card-neike.json`、`worldbook.json`、`npcs/*.json`、`endings.md`、`MECHANICS.md`）
- 美术方向按设计文档第九节：指挥所/档案路线，**硬性禁止画人体、血、器官、侵入性操作**（这条同时解决队友「看虫子不适」的问题）
- 三条铁律写进角色卡：不给诊疗建议、病人的痛苦不是笑料、不替玩家做决定

**配图**：`art/make-art.mjs` 程序化 SVG（零 API），六幕 + 作战序列图 + 封面。每回合现场配图沿用现有链路，只换 `ART_DIRECTION`。

**上线**：Vercel 建**独立项目** `neike`（与原站互不影响），环境变量复用同一套 key。首屏与结局页加版权声明（不逐字复制原答、署名 + 原链、标注 AI 演绎）与「非医疗建议」声明。

**阶段四验收**：本地脚本 + 人工各跑一遍完整六幕；随机抽 5 个回合出图，视觉复核断言画面中无人体/血/器官；线上站点可访问。

---

## 五、双份维护的缓解（别省这一步）

复制之后两份运行时必然漂移。三个低成本措施：

1. **记录上游基点**：在新项目 `docs/upstream.md` 写下
   `forked from wangchi2068/quanchaozhili @ 568df57 (2026-09-12)`，并列出本计划 3.4 那四处字面值差异。日后同步时 `git diff` 一眼看出哪些是「有意的差异」、哪些是「漏同步的修复」。
2. **加一个上游 remote**（只读，不推）：
   `git remote add upstream https://github.com/wangchi2068/quanchaozhili.git`
   以后修运行时 bug 可以直接 `git cherry-pick <sha>`，只处理冲突的那几处字面值。
3. **约定**：**战役内容只在 `assets/campaigns/<name>/` 下增删，绝不改 `src/`**。这条守住了，两边几乎不会冲突。

> 如果哪天觉得两份维护吃不消，可以随时回头做「共用运行时」方案——那时 3.4 的四处差异正好就是需要抽象出来的接口，改动量仍然是那 80 行。

---

## 六、执行顺序

```
阶段一  复制 + 剥离 + 四处硬编码改内科            ← 先做，可独立验收
   ↓
阶段二  内科战役包文本（arc/卡/世界书/九 NPC/结局）
   ↓
阶段三  配图（六幕 + 序列图 + 现场配图风格）
   ↓
阶段四  端到端验证 + 独立部署
```

**先确认第二节那四件事**（尤其第 2 项标题），我就能开工。阶段一做完整仓库应该已经「只有内科、没有蚂蚁」，你可以先验一遍，再决定投不投文本量。
