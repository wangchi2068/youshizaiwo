/**
 * 把 art/*.svg 光栅化成 PNG（并用无头 Chrome 另出六幕的 JPEG）。
 * 免费：只用本机 Chrome，不调任何外部 API。
 *
 *   node assets/campaigns/neike/art/rasterize.mjs
 */
import { spawn } from "node:child_process";
import { createRequire } from "node:module";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const require = createRequire("D:/trae/youshizaiwo/package.json");
const WebSocket = require("ws");

const ART = resolve(dirname(fileURLToPath(import.meta.url)));
const PORT = 9391;

const CHROME_CANDIDATES = [
	"C:/Program Files (x86)/Google/Chrome/Application/chrome.exe",
	"C:/Program Files/Google/Chrome/Application/chrome.exe",
	"/usr/bin/google-chrome",
	"/usr/bin/chromium",
];
const chromePath = CHROME_CANDIDATES.find((p) => existsSync(p));
if (!chromePath) { console.error("找不到 Chrome，无法光栅化（SVG 已生成，可跳过这步）"); process.exit(1); }
console.log("使用 Chrome:", chromePath);

const chrome = spawn(chromePath, [
	"--headless=new", "--disable-gpu", "--hide-scrollbars", "--allow-file-access-from-files",
	`--remote-debugging-port=${PORT}`, "--window-size=1600,900",
	`--user-data-dir=${resolve(ART, ".chrome-profile")}`, "about:blank",
], { stdio: "ignore" });

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
async function target() {
	for (let i = 0; i < 60; i++) {
		try {
			const list = await (await fetch(`http://127.0.0.1:${PORT}/json/list`)).json();
			const page = list.find((t) => t.type === "page");
			if (page?.webSocketDebuggerUrl) return page.webSocketDebuggerUrl;
		} catch { /* 等它起来 */ }
		await sleep(300);
	}
	throw new Error("Chrome 未就绪");
}

const ws = new WebSocket(await target(), { maxPayload: 1 << 28 });
let id = 0;
const pending = new Map();
const send = (method, params = {}) => new Promise((r) => {
	const i = ++id; pending.set(i, r);
	ws.send(JSON.stringify({ id: i, method, params }));
});
ws.on("message", (b) => {
	const m = JSON.parse(b.toString());
	if (m.id && pending.has(m.id)) { pending.get(m.id)(m.result || m.error); pending.delete(m.id); }
});
await new Promise((r) => ws.on("open", r));
await send("Page.enable");

const JOBS = [
	{ file: "cover.svg", size: [1600, 900], jpeg: true },
	{ file: "act1.svg", size: [1600, 900], jpeg: true },
	{ file: "act2.svg", size: [1600, 900], jpeg: true },
	{ file: "act3.svg", size: [1600, 900], jpeg: true },
	{ file: "act4.svg", size: [1600, 900], jpeg: true },
	{ file: "act5.svg", size: [1600, 900], jpeg: true },
	{ file: "act6.svg", size: [1600, 900], jpeg: true },
	{ file: "cast.svg", size: [1600, 900], jpeg: false },
	{ file: "rune.svg", size: [800, 800], jpeg: false },
];

for (const job of JOBS) {
	const [w, h] = job.size;
	await send("Emulation.setDeviceMetricsOverride", { width: w, height: h, deviceScaleFactor: 1, mobile: false });
	const url = "file:///" + resolve(ART, job.file).replace(/\\/g, "/");
	await send("Page.navigate", { url });
	await sleep(700);

	const png = await send("Page.captureScreenshot", { format: "png" });
	const base = job.file.replace(/\.svg$/, "");
	writeFileSync(resolve(ART, "png", `${base}.png`), Buffer.from(png.data, "base64"));
	let extra = "";
	if (job.jpeg) {
		const jpg = await send("Page.captureScreenshot", { format: "jpeg", quality: 82 });
		writeFileSync(resolve(ART, `${base}.jpg`), Buffer.from(jpg.data, "base64"));
		extra = `  + ${base}.jpg`;
	}
	console.log(`  ✓ png/${base}.png${extra}`);
}

ws.close();
chrome.kill();
console.log("\n光栅化完成");
