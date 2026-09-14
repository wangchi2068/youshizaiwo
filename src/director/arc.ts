/**
 * 三幕主线大纲——导演层的地基。
 * 设计原则：主线是"软骨架"，只提供方向与事件钩子，绝不强制剧情。
 * 推进靠规则（关键词命中 + 回合数门槛），保证模型自由发挥的同时主线不漂。
 */

export interface Phase {
  id: string;
  act: 1 | 2 | 3;
  title: string;
  /** 注入 system 的阶段指引（模型据此知道当前该往哪使劲） */
  summary: string;
  /** 当前阶段的目标清单 */
  objectives: string[];
  /** 任一关键词出现在最近剧情文本中即视为满足推进条件 */
  unlockKeywords: string[];
  /** 至少经过的回合数（防过早推进） */
  minTurns: number;
  /**
   * 本幕至少停留的回合数（按"进入本幕后的回合数"算，与全局累计的 minTurns 不同）。
   * 用于「这一幕必须慢慢演」的场合：只靠 minTurns 的话，玩家在前几幕多聊几句
   * 就会让全局计数提前达标，导致本幕一进来就被推走。
   */
  minTurnsInPhase?: number;
  /**
   * 强制推进：忽略 unlockKeywords，只要回合数达标（且满足防连跳间隔）就推进到下一幕。
   * 用于「不可回避的主线锚点」——例如玩家可能不会主动选择的悲剧转折。
   */
  autoAdvance?: boolean;
  /** 刚推进到本阶段时，注入一次的事件钩子（把剧情推向下一幕） */
  eventHint?: string;
  /** 本幕情绪基调（导演注入 system，防平铺流水账） */
  mood?: string;
  /** 本幕张力（1-10，注入后模型据此把握节奏） */
  tension?: number;
  /** 本幕节奏要点（可选，如"开场给虚假安全感 → 中段揭露背叛 → 结尾逼玩家选择"） */
  beats?: string[];
  /** 本幕必发生事件（原著锚点）：模型推进时须按序落实，防自创架空线 */
  mustEvents?: string[];
}

/**
 * 通用兜底大纲：**仅在未加载战役包时使用**（战役模式下由 assets/campaigns/<name>/arc.json 覆盖）。
 * 刻意不含任何具体作品的专有名词——它只保证服务能起来、主线不空转。
 * 本作《优势在我》的实际六幕见 assets/campaigns/neike/arc.json。
 */
export const MAIN_ARC: Phase[] = [
	{
		id: "p1-opening",
		act: 1,
		title: "第一幕·开场",
		summary: "交代处境：主角在哪、手上有什么、眼下必须先做什么。",
		objectives: ["建立场景与处境", "引出第一个必须回应的对象"],
		unlockKeywords: ["开始", "开场", "第一次", "来到", "见到"],
		minTurns: 1,
		eventHint: "先把处境摆清楚：主角身处何地、手上有什么、眼前第一件事是什么。",
	},
	{
		id: "p2-deepen",
		act: 1,
		title: "第二幕·深入",
		summary: "处境比预想的复杂：出现第二方立场，主角发现事情不止一面。",
		objectives: ["引出第二方立场", "让主角发现一个与初判不符的细节"],
		unlockKeywords: ["但是", "原来", "发现", "另有", "不同意"],
		minTurns: 3,
		eventHint: "让第二个立场出现，并且它也有道理——不要把冲突写成谁对谁错。",
	},
	{
		id: "p3-turn",
		act: 2,
		title: "第三幕·转折",
		summary: "一次不可忽略的变化打破平衡，主角必须重新评估。",
		objectives: ["发生一次改变局势的事件", "主角重新评估先前的判断"],
		unlockKeywords: ["变化", "转折", "忽然", "结果", "意外"],
		minTurns: 5,
		eventHint: "让一件无法忽略的事发生，逼主角回头修正自己的判断。",
	},
	{
		id: "p4-pressure",
		act: 2,
		title: "第四幕·压力",
		summary: "多方诉求无法同时满足，必须有人让路。",
		objectives: ["让两个诉求正面冲突", "把选择权交给主角"],
		unlockKeywords: ["冲突", "抉择", "必须", "让路", "取舍"],
		minTurns: 7,
		minTurnsInPhase: 2,
		eventHint: "把互斥讲清楚：不是谁错了，是它们不可能同时成立。选择必须由主角自己做出。",
	},
	{
		id: "p5-crisis",
		act: 3,
		title: "第五幕·危机",
		summary: "不可回避的危机到来，主角只能决定以何种姿态面对。",
		objectives: ["发生一次无法回避的危机", "主角在压力下作出决定"],
		unlockKeywords: ["危机", "急", "失守", "夜里", "最后"],
		autoAdvance: true,
		minTurns: 9,
		minTurnsInPhase: 2,
		eventHint: "危机躲不掉，只能决定怎么面对。不要给任何能绕开它的选项。",
	},
	{
		id: "p6-final",
		act: 3,
		title: "第六幕·终局",
		summary: "收束：主角的处境回到原点，但一切都不同了。",
		objectives: ["回收前面的伏笔", "让主角作出最后一次选择"],
		unlockKeywords: [],
		minTurns: 11,
		eventHint: "收束全篇：让主角面对自己一系列选择的结果，并作出最后一次选择。",
	},
];
