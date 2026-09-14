import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Director } from "../src/director/director.ts";
import { MAIN_ARC, type Phase } from "../src/director/arc.ts";
import { openStore } from "../src/store.ts";

function freshDir(): string {
	return mkdtempSync(join(tmpdir(), "rph-dir-"));
}

test("导演：初始在第一幕·开场，directive 含当前目标", () => {
	const dir = freshDir();
	try {
		const d = new Director(dir);
		assert.equal(d.currentPhase().id, "p1-opening");
		const directive = d.buildDirective();
		assert.ok(directive.includes("第一幕"));
		assert.ok(directive.includes("当前目标"));
		assert.ok(
			directive.includes("主线事件"),
			"事件钩子常驻注入，第一幕也有钩子",
		);
	} finally {
		rmSync(dir, { recursive: true, force: true });
	}
});

test("导演：关键词命中 + 回合门槛达标才推进；事件钩子常驻注入", () => {
	const dir = freshDir();
	try {
		const d = new Director(dir);
		// 无关键词命中：即使回合数达标也不推进
		assert.equal(
			d.advance("今天天气不错，我们去喝碗豆花吧", 3).advanced,
			false,
		);
		// 回合数达标且命中 → 推进到 p2
		const r = d.advance("我第一次来到这个地方，见到了那个人", 3);
		assert.equal(r.advanced, true);
		assert.equal(r.to?.id, "p2-deepen");
		// 事件钩子常驻：多次调用每次都出现（作为持续主线锚）
		const d1 = d.buildDirective();
		assert.ok(d1.includes("主线事件"));
		const d2 = d.buildDirective();
		assert.ok(
			d2.includes("主线事件"),
			"事件钩子应常驻注入（当前幕每回合可见）",
		);
	} finally {
		rmSync(dir, { recursive: true, force: true });
	}
});

test("导演：autoAdvance 幕忽略关键词，回合达标即强制推进", () => {
	const dir = freshDir();
	try {
		const arc: Phase[] = [
			{
				id: "a",
				act: 1,
				title: "幕A",
				summary: "",
				objectives: [],
				unlockKeywords: ["绝不会出现的词"],
				minTurns: 3,
				autoAdvance: true,
			},
			{
				id: "b",
				act: 1,
				title: "幕B",
				summary: "",
				objectives: [],
				unlockKeywords: ["x"],
				minTurns: 5,
			},
		];
		const d = new Director(dir, arc);
		// 回合未达标：即使 autoAdvance 也不推进
		assert.equal(d.advance("完全无关的文本", 2).advanced, false);
		// 回合达标：无需关键词命中，强制推进
		const r = d.advance("完全无关的文本", 3);
		assert.equal(r.advanced, true);
		assert.equal(d.currentPhase().id, "b");
	} finally {
		rmSync(dir, { recursive: true, force: true });
	}
});

test("导演：autoAdvance 仍受防连跳约束", () => {
	const dir = freshDir();
	try {
		const arc: Phase[] = [
			{
				id: "a",
				act: 1,
				title: "幕A",
				summary: "",
				objectives: [],
				unlockKeywords: ["x"],
				minTurns: 1,
				autoAdvance: true,
			},
			{
				id: "b",
				act: 1,
				title: "幕B",
				summary: "",
				objectives: [],
				unlockKeywords: ["x"],
				minTurns: 1,
				autoAdvance: true,
			},
			{
				id: "c",
				act: 1,
				title: "幕C",
				summary: "",
				objectives: [],
				unlockKeywords: ["x"],
				minTurns: 1,
			},
		];
		const d = new Director(dir, arc);
		assert.equal(d.advance("x", 1).advanced, true); // → b
		assert.equal(d.advance("x", 2).advanced, false); // 间隔 1 < 2
		assert.equal(d.advance("x", 3).advanced, true); // 间隔 2 → c
		assert.equal(d.currentPhase().id, "c");
	} finally {
		rmSync(dir, { recursive: true, force: true });
	}
});

test("导演：minTurnsInPhase 按「本幕停留回合数」判定，防止强制幕一进来就被推走", () => {
	const dir = freshDir();
	try {
		const arc: Phase[] = [
			{
				id: "a",
				act: 1,
				title: "幕A",
				summary: "",
				objectives: [],
				unlockKeywords: ["x"],
				minTurns: 1,
			},
			{
				id: "b",
				act: 1,
				title: "幕B",
				summary: "",
				objectives: [],
				unlockKeywords: [],
				minTurns: 7, // 全局门槛故意设得很低，模拟"玩家前面聊太久、早就达标"
				minTurnsInPhase: 5, // 但本幕必须至少演 5 回合
				autoAdvance: true,
			},
			{ id: "c", act: 1, title: "幕C", summary: "", objectives: [], unlockKeywords: ["x"], minTurns: 1 },
		];
		const d = new Director(dir, arc);
		// 玩家磨蹭到第 20 回合才进幕B（全局计数远超 minTurns=7）
		assert.equal(d.advance("x", 20).advanced, true);
		assert.equal(d.currentPhase().id, "b");
		// 进入幕B后必须待满 5 回合：第 21~24 回合都不推进
		for (const t of [21, 22, 23, 24]) {
			assert.equal(d.advance("完全无关的文本", t).advanced, false, `第${t}回合不该推进`);
		}
		// 第 25 回合（本幕第 5 回合）才推进
		assert.equal(d.advance("完全无关的文本", 25).advanced, true);
		assert.equal(d.currentPhase().id, "c");
	} finally {
		rmSync(dir, { recursive: true, force: true });
	}
});

test("导演：终局阶段不再推进；状态持久化", () => {
	const dir = freshDir();
	try {
		const d = new Director(dir);
		// 直接推进到终局（用足够的回合与关键词链）
		let guard = 0;
		while (
			d.currentPhase().id !== MAIN_ARC[MAIN_ARC.length - 1]!.id &&
			guard++ < 20
		) {
			const p = d.currentPhase();
			const kw = p.unlockKeywords[0] ?? "抉择";
			d.advance(
				"剧情中提到" + kw + "相关的内容，继续往下查",
				p.minTurns + 1,
			);
		}
		assert.equal(d.currentPhase().id, MAIN_ARC[MAIN_ARC.length - 1]!.id);
		assert.equal(d.advance("任何内容", 999).advanced, false); // 终局不再推进

		// 持久化：新实例从存储恢复
		const d2 = new Director(dir);
		assert.equal(d2.currentPhase().id, MAIN_ARC[MAIN_ARC.length - 1]!.id);
		const store = openStore(dir);
		const persisted = JSON.parse(store.kvGet("director") ?? "{}");
		store.close();
		assert.ok(persisted.unlocked.length >= 2);
	} finally {
		rmSync(dir, { recursive: true, force: true });
	}
});

test("导演：reset 回到第一幕", () => {
	const dir = freshDir();
	try {
		const d = new Director(dir);
		d.advance("我第一次来到这个地方，见到了那个人", 5);
		assert.notEqual(d.currentPhase().id, "p1-opening");
		d.reset();
		assert.equal(d.currentPhase().id, "p1-opening");
		const d2 = new Director(dir);
		assert.equal(d2.currentPhase().id, "p1-opening");
	} finally {
		rmSync(dir, { recursive: true, force: true });
	}
});

test("导演：自定义 arc（战役包）——初始用 arc[0]，推进按战役关键词", () => {
	const dir = freshDir();
	try {
		const neikeArc: Phase[] = [
			{
				id: "m1-admission",
				act: 1,
				title: "第一幕·入院",
				summary: "",
				objectives: ["定下收治方向"],
				unlockKeywords: ["入院", "主诉"],
				minTurns: 1,
			},
			{
				id: "m2-consult",
				act: 1,
				title: "第二幕·会诊",
				summary: "",
				objectives: ["听完各科部署"],
				unlockKeywords: ["会诊"],
				minTurns: 1,
			},
		];
		const d = new Director(dir, neikeArc);
		assert.equal(d.currentPhase().id, "m1-admission");
		const r = d.advance("病人入院，主诉含糊", 2);
		assert.equal(r.advanced, true);
		assert.equal(d.currentPhase().id, "m2-consult");
		const directive = d.buildDirective();
		assert.ok(directive.includes("会诊"));
	} finally {
		rmSync(dir, { recursive: true, force: true });
	}
});

test("导演：防连跳——间隔不足 2 回合不推进", () => {
	const dir = freshDir();
	try {
		const arc: Phase[] = [
			{
				id: "a",
				act: 1,
				title: "幕A",
				summary: "",
				objectives: [],
				unlockKeywords: ["x"],
				minTurns: 1,
			},
			{
				id: "b",
				act: 1,
				title: "幕B",
				summary: "",
				objectives: [],
				unlockKeywords: ["x"],
				minTurns: 1,
			},
			{
				id: "c",
				act: 1,
				title: "幕C",
				summary: "",
				objectives: [],
				unlockKeywords: ["x"],
				minTurns: 1,
			},
		];
		const d = new Director(dir, arc);
		// 回合1：推进到 B
		assert.equal(d.advance("x", 1).advanced, true);
		// 回合1 再次调用：间隔 0 < 2，不推进
		assert.equal(d.advance("x", 1).advanced, false);
		// 回合2：间隔 1 < 2，仍不推进
		assert.equal(d.advance("x", 2).advanced, false);
		// 回合3：间隔 2 >= 2，推进到 C
		assert.equal(d.advance("x", 3).advanced, true);
		assert.equal(d.currentPhase().id, "c");
	} finally {
		rmSync(dir, { recursive: true, force: true });
	}
});
