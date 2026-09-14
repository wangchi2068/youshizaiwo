/**
 * 《优势在我》配图生成器（程序化 SVG，零外部依赖 / 零 API / 零成本）
 *
 *   node assets/campaigns/neike/art/make-art.mjs
 *
 * 产出（art/ 目录）：
 *   cover.svg              封面
 *   act1..act6.svg         六幕主图（1600×900）
 *   cast.svg               全科作战序列图（七科 + 护士长）
 *   rune.svg               纹样（800×800，可平铺）
 *
 * 美术方向：军事指挥所 + 病历档案。冷色调（青灰/铅白），台灯的一小点暖作唯一高光。
 * 一条铁律：**画面里没有人**——不画人体、手、背影、人影，也不画血、器官、侵入性器械。
 *          只用纸、地图、灯、表格、电话、钟来叙事。这条约束在代码层面即成立：
 *          本文件里没有任何一处绘制"人"的路径。
 */

import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const OUT = resolve(dirname(fileURLToPath(import.meta.url)));
mkdirSync(resolve(OUT, "png"), { recursive: true });

/* ── 确定性随机（固定种子：同一份脚本跑两次结果一致） ── */
let _seed = 20260913;
const rnd = () => ((_seed = (_seed * 1664525 + 1013904223) >>> 0) / 4294967296);
const n = (v) => Math.round(v * 100) / 100;
const between = (a, b) => a + rnd() * (b - a);

/* ── 调色板 ── */
const C = {
	bgTop: "#0b1119",
	bgMid: "#111a24",
	bgLow: "#070b10",
	paper: "#e8e3d7",
	paperAlt: "#dcd6c8",
	paperEdge: "#b9b2a2",
	ink: "#2b3138",
	inkSoft: "#6d7681",
	red: "#b4472f",
	blue: "#3f6b9c",
	lamp: "#ffb877",
	dawn: "#8fa8c4",
	grid: "#243040",
};

const defs = () => `
<defs>
  <linearGradient id="room" x1="0" y1="0" x2="0" y2="1">
    <stop offset="0%" stop-color="${C.bgTop}"/>
    <stop offset="55%" stop-color="${C.bgMid}"/>
    <stop offset="100%" stop-color="${C.bgLow}"/>
  </linearGradient>
  <radialGradient id="lamp" cx="50%" cy="50%" r="50%">
    <stop offset="0%" stop-color="${C.lamp}" stop-opacity="0.42"/>
    <stop offset="45%" stop-color="${C.lamp}" stop-opacity="0.14"/>
    <stop offset="100%" stop-color="${C.lamp}" stop-opacity="0"/>
  </radialGradient>
  <radialGradient id="dawn" cx="50%" cy="50%" r="60%">
    <stop offset="0%" stop-color="${C.dawn}" stop-opacity="0.40"/>
    <stop offset="100%" stop-color="${C.dawn}" stop-opacity="0"/>
  </radialGradient>
  <radialGradient id="vig" cx="50%" cy="48%" r="72%">
    <stop offset="55%" stop-color="#000" stop-opacity="0"/>
    <stop offset="100%" stop-color="#000" stop-opacity="0.62"/>
  </radialGradient>
  <linearGradient id="sheet" x1="0" y1="0" x2="0.2" y2="1">
    <stop offset="0%" stop-color="${C.paper}"/>
    <stop offset="100%" stop-color="${C.paperAlt}"/>
  </linearGradient>
  <filter id="soft" x="-25%" y="-25%" width="150%" height="150%">
    <feDropShadow dx="0" dy="7" stdDeviation="11" flood-color="#000" flood-opacity="0.55"/>
  </filter>
  <filter id="soft2" x="-25%" y="-25%" width="150%" height="150%">
    <feDropShadow dx="0" dy="3" stdDeviation="5" flood-color="#000" flood-opacity="0.5"/>
  </filter>
</defs>`;

const canvas = (w, h, body) => `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${w} ${h}" width="${w}" height="${h}">
${defs()}
<rect width="${w}" height="${h}" fill="url(#room)"/>
${body}
<rect width="${w}" height="${h}" fill="url(#vig)"/>
</svg>`;

/* ── 元件 ── */

/** 纸：带折痕与细边的纸片 */
const sheet = (x, y, w, h, rot = 0, lines = 6, tone = "url(#sheet)") => {
	let inner = "";
	for (let i = 1; i <= lines; i++) {
		const ly = n(y + (h / (lines + 1)) * i);
		const lw = between(w * 0.35, w * 0.82);
		inner += `<rect x="${n(x + w * 0.08)}" y="${ly}" width="${n(lw)}" height="2.5" rx="1.2" fill="${C.inkSoft}" opacity="0.42"/>`;
	}
	const fold = `<line x1="${n(x + w * 0.5)}" y1="${y}" x2="${n(x + w * 0.5)}" y2="${n(y + h)}" stroke="${C.paperEdge}" stroke-width="1" opacity="0.5"/>`;
	return `<g transform="rotate(${rot} ${n(x + w / 2)} ${n(y + h / 2)})" filter="url(#soft2)">
    <rect x="${x}" y="${y}" width="${w}" height="${h}" rx="2" fill="${tone}" stroke="${C.paperEdge}" stroke-width="1"/>
    ${fold}${inner}
    <rect x="${x}" y="${y}" width="${w}" height="14" fill="${C.red}" opacity="0.13"/>
  </g>`;
};

/** 值班室的钟 */
const clock = (cx, cy, r, hourDeg, minDeg) => {
	const hand = (deg, len, w) => {
		const a = ((deg - 90) * Math.PI) / 180;
		return `<line x1="${cx}" y1="${cy}" x2="${n(cx + Math.cos(a) * len)}" y2="${n(cy + Math.sin(a) * len)}" stroke="${C.ink}" stroke-width="${w}" stroke-linecap="round"/>`;
	};
	return `<g opacity="0.92">
    <circle cx="${cx}" cy="${cy}" r="${r}" fill="#f2eee3" stroke="${C.paperEdge}" stroke-width="2"/>
    <circle cx="${cx}" cy="${cy}" r="${n(r * 0.86)}" fill="none" stroke="${C.inkSoft}" stroke-width="1" opacity="0.5"/>
    ${Array.from({ length: 12 }, (_, i) => {
			const a = ((i * 30 - 90) * Math.PI) / 180;
			return `<line x1="${n(cx + Math.cos(a) * r * 0.72)}" y1="${n(cy + Math.sin(a) * r * 0.72)}" x2="${n(cx + Math.cos(a) * r * 0.84)}" y2="${n(cy + Math.sin(a) * r * 0.84)}" stroke="${C.inkSoft}" stroke-width="2"/>`;
		}).join("")}
    ${hand(hourDeg, r * 0.44, 4)}${hand(minDeg, r * 0.68, 2.5)}
    <circle cx="${cx}" cy="${cy}" r="3" fill="${C.ink}"/>
  </g>`;
};

/** 监护波形（示意，不是任何真实导联的形态） */
const waveform = (x, y, w, h, beats = 6) => {
	let d = `M ${x} ${n(y + h * 0.62)}`;
	const step = w / (beats * 10);
	for (let b = 0; b < beats; b++) {
		const bx = n(x + (b * w) / beats);
		d += ` L ${bx} ${n(y + h * 0.62)}`;
		d += ` L ${n(bx + step * 1.4)} ${n(y + h * 0.58)}`;
		d += ` L ${n(bx + step * 2.0)} ${n(y + h * 0.86)}`;
		d += ` L ${n(bx + step * 2.6)} ${n(y + h * 0.10)}`;
		d += ` L ${n(bx + step * 3.2)} ${n(y + h * 0.72)}`;
		d += ` L ${n(bx + step * 4.0)} ${n(y + h * 0.62)}`;
		d += ` L ${n(bx + w / beats)} ${n(y + h * 0.62)}`;
	}
	return `<path d="${d}" fill="none" stroke="#7fd4a0" stroke-width="2.6" stroke-linejoin="round" opacity="0.86"/>`;
};

/** 地图网格 */
const grid = (x, y, w, h, step = 40, op = 0.5) =>
	`<g opacity="${op}">${Array.from({ length: Math.floor(w / step) + 1 }, (_, i) => `<line x1="${n(x + i * step)}" y1="${y}" x2="${n(x + i * step)}" y2="${n(y + h)}" stroke="${C.grid}" stroke-width="1"/>`).join("")}${Array.from({ length: Math.floor(h / step) + 1 }, (_, i) => `<line x1="${x}" y1="${n(y + i * step)}" x2="${n(x + w)}" y2="${n(y + i * step)}" stroke="${C.grid}" stroke-width="1"/>`).join("")}</g>`;

/** 推进箭头（红蓝铅笔） */
const arrow = (x1, y1, x2, y2, color, dashed = false, sw = 3) =>
	`<g><line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" stroke="${color}" stroke-width="${sw}" ${dashed ? 'stroke-dasharray="10 8"' : ""} stroke-linecap="round"/><circle cx="${x2}" cy="${y2}" r="5" fill="none" stroke="${color}" stroke-width="${sw}"/></g>`;

/** 浮尘 */
const dust = (x, y, w, h, k = 70) =>
	`<g>${Array.from({ length: k }, () => `<circle cx="${n(between(x, x + w))}" cy="${n(between(y, y + h))}" r="${n(between(0.6, 1.9))}" fill="#fff" opacity="${n(between(0.05, 0.20))}"/>`).join("")}</g>`;

/** 台灯光池（左上） */
const lampPool = (cx, cy, r, op = 1) =>
	`<ellipse cx="${cx}" cy="${cy}" rx="${r}" ry="${n(r * 0.78)}" fill="url(#lamp)" opacity="${op}"/>`;

/** 走廊尽头的灯（右侧竖长条） */
const corridor = (x, y, w, h) =>
	`<g><rect x="${x}" y="${y}" width="${w}" height="${h}" fill="${C.dawn}" opacity="0.10"/><rect x="${n(x + w * 0.28)}" y="${y}" width="${n(w * 0.44)}" height="${h}" fill="#dfe8f2" opacity="0.16"/><rect x="${n(x + w * 0.42)}" y="${y}" width="${n(w * 0.16)}" height="${h}" fill="#f2f6fa" opacity="0.22"/></g>`;

/** 老式电话（几何化，无手） */
const phone = (x, y, s = 1) => `<g transform="translate(${x} ${y}) scale(${s})" filter="url(#soft2)">
  <rect x="0" y="0" width="132" height="60" rx="8" fill="#20262e" stroke="#39414c" stroke-width="2"/>
  <rect x="14" y="-20" width="104" height="24" rx="12" fill="#2a313a" stroke="#39414c" stroke-width="2"/>
  <circle cx="34" cy="41" r="5" fill="${C.inkSoft}" opacity="0.7"/>
  <circle cx="52" cy="41" r="5" fill="${C.inkSoft}" opacity="0.7"/>
  <circle cx="70" cy="41" r="5" fill="${C.inkSoft}" opacity="0.7"/>
  <path d="M92 34 q22 26 -14 30" fill="none" stroke="#4b5563" stroke-width="3" stroke-linecap="round"/>
</g>`;

/* ── 六幕 ── */

// 一 · 入院：凌晨留观区。加床、未填完的病历、墙上的钟、走廊尽头的灯。
const act1 = () => canvas(1600, 900, `
  ${corridor(1420, 0, 180, 900)}
  ${lampPool(360, 210, 620, 0.9)}
  <g opacity="0.5">${grid(60, 620, 1500, 260, 48, 0.4)}</g>
  ${sheet(430, 330, 400, 520, -4, 9)}
  ${sheet(880, 400, 330, 430, 5, 7)}
  <g filter="url(#soft)"><rect x="300" y="700" width="1000" height="26" rx="4" fill="#1b222b" opacity="0.9"/></g>
  ${clock(1310, 190, 78, 128, 246)}
  <rect x="1268" y="300" width="86" height="4" rx="2" fill="${C.red}" opacity="0.5"/>
  ${dust(120, 120, 1300, 700)}
`);

// 二 · 会诊：多科到场。长桌、摊开的地图式病历、红蓝铅笔、老式电话。
const act2 = () => canvas(1600, 900, `
  ${lampPool(500, 250, 700, 0.85)}
  <g filter="url(#soft)"><rect x="180" y="300" width="1240" height="440" rx="10" fill="#1a212a" stroke="#2b3543" stroke-width="2"/></g>
  <g opacity="0.55">${grid(200, 320, 1200, 400, 44, 0.5)}</g>
  ${sheet(300, 360, 300, 180, -3, 4)}
  ${sheet(660, 340, 320, 200, 2, 5)}
  ${sheet(1040, 380, 300, 170, -2, 4)}
  <g stroke="${C.red}" stroke-width="2.5" opacity="0.8" fill="none">
    <path d="M360 500 q60 -70 150 -40 t140 30"/>
  </g>
  <g stroke="${C.blue}" stroke-width="2.5" opacity="0.8" fill="none">
    <path d="M700 520 q90 40 200 -10 t180 40"/>
  </g>
  ${arrow(560, 640, 980, 700, C.red, true)}
  <rect x="1240" y="470" width="120" height="9" rx="4" fill="${C.red}" opacity="0.55" transform="rotate(-18 1300 474)"/>
  <rect x="1250" y="500" width="120" height="9" rx="4" fill="${C.blue}" opacity="0.55" transform="rotate(-14 1310 504)"/>
  ${phone(250, 620, 1.15)}
  <g opacity="0.35">${grid(1180, 640, 380, 240, 40, 0.5)}</g>
  ${dust(100, 100, 1400, 760)}
`);

// 三 · 战报：化验单雪片般回来。叠放、折角、批注、墙上的钟。
const act3 = () => canvas(1600, 900, `
  ${lampPool(1180, 200, 620, 0.8)}
  <g opacity="0.4">${grid(80, 660, 700, 220, 44, 0.4)}</g>
  ${Array.from({ length: 7 }, (_, i) => sheet(180 + i * 46, 470 - i * 26, 360, 230, between(-7, 7), 5)).join("")}
  ${sheet(760, 300, 340, 460, -3, 9)}
  <g stroke="${C.red}" stroke-width="2" opacity="0.75" fill="none">
    <path d="M800 380 h180"/><path d="M800 430 h120"/><path d="M800 480 h200"/><path d="M800 530 h90"/>
  </g>
  <g stroke="${C.blue}" stroke-width="2" opacity="0.7" fill="none">
    <circle cx="1010" cy="384" r="17"/><circle cx="940" cy="434" r="17"/>
  </g>
  ${clock(1310, 250, 82, 92, 318)}
  ${sheet(1130, 520, 300, 200, 6, 4)}
  ${dust(100, 100, 1400, 700)}
`);

// 四 · 矛盾：互斥的抉择。地图上两条岔开的箭头、压着的一支笔、签字的横线。
const act4 = () => canvas(1600, 900, `
  ${lampPool(420, 220, 640, 0.85)}
  ${sheet(240, 180, 1120, 640, -1, 0)}
  <g opacity="0.5">${grid(270, 210, 1060, 580, 46, 0.5)}</g>
  <g stroke="${C.inkSoft}" stroke-width="1.6" fill="none" opacity="0.55">
    <path d="M300 700 q200 -160 380 -150 t300 -180"/>
    <path d="M330 250 q180 90 300 60 t260 150"/>
  </g>
  ${arrow(800, 480, 520, 300, C.red, false, 4)}
  ${arrow(800, 480, 520, 690, C.blue, false, 4)}
  <circle cx="800" cy="480" r="13" fill="none" stroke="${C.ink}" stroke-width="3"/>
  <circle cx="800" cy="480" r="4.5" fill="${C.ink}"/>
  <g transform="rotate(-24 1080 620)" filter="url(#soft2)">
    <rect x="960" y="612" width="250" height="17" rx="8" fill="#151a21" stroke="#39414c" stroke-width="1.5"/>
    <path d="M1210 612 l34 8.5 -34 8.5 z" fill="#c9c2b2"/>
  </g>
  <line x1="1060" y1="742" x2="1300" y2="742" stroke="${C.ink}" stroke-width="2" opacity="0.65"/>
  <text x="1062" y="735" font-family="monospace" font-size="15" fill="${C.inkSoft}" opacity="0.8">____ / ____</text>
  ${dust(150, 130, 1250, 640, 50)}
`);

// 五 · 夜班：后半夜。监护波形、内线电话、走廊尽头一盏灯。
const act5 = () => canvas(1600, 900, `
  ${corridor(1460, 0, 140, 900)}
  <g filter="url(#soft)"><rect x="220" y="250" width="860" height="420" rx="10" fill="#0d1319" stroke="#26313d" stroke-width="2"/></g>
  <g opacity="0.5">${grid(240, 270, 820, 380, 40, 0.45)}</g>
  ${waveform(280, 300, 740, 320, 7)}
  <g opacity="0.75">
    <rect x="250" y="707" width="300" height="14" rx="7" fill="#1b2430"/>
    <rect x="250" y="707" width="212" height="14" rx="7" fill="#7fd4a0" opacity="0.55"/>
  </g>
  ${phone(1180, 610, 1.3)}
  <g opacity="0.9">
    <path d="M1180 596 q120 -46 236 -8" fill="none" stroke="#4b5563" stroke-width="3" stroke-dasharray="7 7"/>
    <circle cx="1420" cy="586" r="7" fill="${C.red}" opacity="0.85"/>
  </g>
  ${clock(1360, 200, 62, 66, 30)}
  ${dust(120, 100, 1300, 740, 55)}
`);

// 六 · 交班：晨会。叠好的病历、印章、窗外将亮的天色。
const act6 = () => canvas(1600, 900, `
  <rect x="980" y="0" width="620" height="900" fill="url(#dawn)" opacity="0.55"/>
  <g opacity="0.85"><rect x="1040" y="120" width="480" height="640" rx="6" fill="#c9d6e4" opacity="0.16" stroke="#8fa8c4" stroke-width="2"/><line x1="1280" y1="120" x2="1280" y2="760" stroke="#8fa8c4" stroke-width="2" opacity="0.6"/><line x1="1040" y1="440" x2="1520" y2="440" stroke="#8fa8c4" stroke-width="2" opacity="0.6"/></g>
  ${lampPool(320, 220, 560, 0.6)}
  ${Array.from({ length: 5 }, (_, i) => sheet(180 + i * 22, 600 - i * 34, 380, 250, between(-4, 4), 5, i === 4 ? C.paper : "url(#sheet)")).join("")}
  <g filter="url(#soft2)" transform="rotate(-8 700 300)">
    <rect x="600" y="250" width="150" height="96" rx="6" fill="#8c2f22" opacity="0.9"/>
    <rect x="614" y="266" width="122" height="64" rx="3" fill="none" stroke="#e8b4a6" stroke-width="2" opacity="0.7"/>
  </g>
  <rect x="200" y="820" width="700" height="5" rx="2.5" fill="${C.inkSoft}" opacity="0.35"/>
  ${dust(100, 120, 800, 700, 45)}
`);

/* ── 封面 ── */
const cover = () => canvas(1600, 900, `
  ${lampPool(430, 190, 720, 1)}
  <g opacity="0.45">${grid(80, 560, 1460, 320, 52, 0.45)}</g>
  ${sheet(210, 190, 700, 560, -3, 10)}
  ${sheet(700, 300, 620, 440, 4, 8)}
  <g opacity="0.6">${grid(730, 330, 560, 380, 42, 0.5)}</g>
  ${arrow(1180, 640, 900, 440, C.red, true, 3.4)}
  <g filter="url(#soft)"><rect x="240" y="800" width="1120" height="20" rx="6" fill="#1b222b" opacity="0.85"/></g>
  ${clock(1330, 210, 66, 122, 252)}
  ${dust(100, 90, 1400, 760, 90)}
`);

/* ── 全科作战序列：地图上七个阵地 + 一个旁置标记（护士长，不属于任何派系） ── */
const cast = () => canvas(1600, 900, `
  ${lampPool(800, 420, 820, 0.7)}
  ${sheet(150, 120, 1300, 660, 0, 0)}
  <g opacity="0.5">${grid(180, 150, 1240, 600, 48, 0.5)}</g>
  <g stroke="${C.inkSoft}" stroke-width="1.5" fill="none" opacity="0.5">
    <path d="M200 640 q240 -180 420 -120 t360 -220"/>
    <path d="M220 250 q300 120 460 90 t420 200"/>
  </g>
  ${[
		[430, 330, C.red],
		[700, 260, C.red],
		[1030, 330, C.blue],
		[380, 560, C.blue],
		[720, 520, C.red],
		[1060, 570, C.blue],
		[900, 690, C.ink],
	].map(([x, y, col], i) => `
    <g>
      <rect x="${x - 26}" y="${y - 26}" width="52" height="52" rx="4" fill="none" stroke="${col}" stroke-width="3"/>
      <line x1="${x - 40}" y1="${y}" x2="${x + 40}" y2="${y}" stroke="${col}" stroke-width="1.6" opacity="0.75"/>
      <line x1="${x}" y1="${y - 40}" x2="${x}" y2="${y + 40}" stroke="${col}" stroke-width="1.6" opacity="0.75"/>
      <circle cx="${x}" cy="${y}" r="6" fill="${col}"/>
      <text x="${x - 20}" y="${y + 62}" font-family="monospace" font-size="19" fill="${C.ink}" opacity="0.72">${String(i + 1).padStart(2, "0")}</text>
    </g>`).join("")}
  <g stroke="${C.ink}" stroke-width="2.6" fill="none" stroke-dasharray="9 7" opacity="0.85">
    <circle cx="1330" cy="700" r="46"/>
  </g>
  <circle cx="1330" cy="700" r="9" fill="${C.ink}"/>
  <text x="1276" y="775" font-family="monospace" font-size="19" fill="${C.ink}" opacity="0.72">--</text>
  ${dust(160, 130, 1280, 620, 60)}
`);

/* ── 纹样：心电基线 + 网格，可平铺 ── */
const rune = () => {
	const W = 800, H = 800;
	let tiles = "";
	for (let gy = 0; gy < H; gy += 100) {
		for (let gx = 0; gx < W; gx += 100) {
			tiles += `<rect x="${gx + 6}" y="${gy + 6}" width="88" height="88" rx="3" fill="none" stroke="${C.grid}" stroke-width="1.4" opacity="0.75"/>`;
			tiles += `<path d="M${gx + 20} ${gy + 50} h16 l6 -20 l7 34 l6 -14 h18" fill="none" stroke="#31506b" stroke-width="1.8" opacity="0.55"/>`;
		}
	}
	return canvas(W, H, `
  ${tiles}
  <rect x="0" y="0" width="${W}" height="${H}" fill="none" stroke="${C.grid}" stroke-width="2" opacity="0.6"/>
  <circle cx="400" cy="400" r="250" fill="none" stroke="#31506b" stroke-width="2" opacity="0.45"/>
  <circle cx="400" cy="400" r="160" fill="none" stroke="#31506b" stroke-width="1.6" opacity="0.35"/>
`);
};

/* ── 输出 ── */
const files = {
	"cover.svg": cover(),
	"act1.svg": act1(),
	"act2.svg": act2(),
	"act3.svg": act3(),
	"act4.svg": act4(),
	"act5.svg": act5(),
	"act6.svg": act6(),
	"cast.svg": cast(),
	"rune.svg": rune(),
};
for (const [name, svg] of Object.entries(files)) {
	writeFileSync(resolve(OUT, name), svg);
	console.log(`  ✓ ${name}  ${(Buffer.byteLength(svg) / 1024).toFixed(0)} KB`);
}
console.log(`\n共 ${Object.keys(files).length} 个 SVG 写入 ${OUT}`);
