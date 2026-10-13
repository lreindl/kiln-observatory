// The three levels as formations of dots, laid out for the current viewport.
// World origin is the centre of the screen at camera scale 1.

import type { PublicEvent } from "../shared/public";
import { CELLS, cellFor, flow, weight, type CellId } from "./crew";
import type { FPoint, Formation, Guide } from "./field";
import { electricKiln, rng } from "./kiln";
import { circle, glyph, line, resample, type Pt } from "./shapes";

export const HISTORY_START = Date.UTC(2026, 9, 7);
const DAY = 86_400_000;

// ---------- outside ----------

export interface Outside { formation: Formation; opening: Pt; diveZoom: number }

export function outside(w: number, h: number): Outside {
  const portrait = w < h;
  const H = portrait ? Math.min(w * 0.48, h * 0.22) : Math.min(h * 0.27, w * 0.3);
  const ground = portrait ? h * 0.04 : h * 0.1;
  const k = electricKiln(0, ground, H, Math.max(2.4, H / 70));
  const points: FPoint[] = k.dots.map((d) => ({ ...d, group: "kiln" }));
  const b = k.bounds;
  const dimX = b.right + H * 0.16;
  const guides: Guide[] = [
    { kind: "line", a: { x: -w, y: k.floor }, b: { x: w, y: k.floor }, alpha: 0.22 },
    { kind: "line", a: { x: 0, y: b.top - H * 0.1 }, b: { x: 0, y: ground + H * 0.12 }, alpha: 0.12, dash: [2, 6] },
    // Height, from the floor to the rim.
    { kind: "line", a: { x: dimX, y: ground - H }, b: { x: dimX, y: ground }, alpha: 0.25 },
    { kind: "line", a: { x: dimX - 5, y: ground - H }, b: { x: dimX + 5, y: ground - H }, alpha: 0.25 },
    { kind: "line", a: { x: dimX - 5, y: ground }, b: { x: dimX + 5, y: ground }, alpha: 0.25 },
    { kind: "text", at: { x: dimX + 9, y: ground - H / 2 + 3 }, text: "H 1.2 m", alpha: 0.35 },
    // Width, under the floor line.
    { kind: "line", a: { x: b.left, y: k.floor + H * 0.1 }, b: { x: b.right, y: k.floor + H * 0.1 }, alpha: 0.2 },
    { kind: "line", a: { x: b.left, y: k.floor + H * 0.1 - 5 }, b: { x: b.left, y: k.floor + H * 0.1 + 5 }, alpha: 0.2 },
    { kind: "line", a: { x: b.right, y: k.floor + H * 0.1 - 5 }, b: { x: b.right, y: k.floor + H * 0.1 + 5 }, alpha: 0.2 },
    { kind: "text", at: { x: (b.left + b.right) / 2, y: k.floor + H * 0.1 + 14 }, text: "W 0.9 m", alpha: 0.3, align: "center" },
    { kind: "text", at: { x: portrait ? 0 : b.left - H * 0.12, y: portrait ? b.top - 12 : b.top + H * 0.2 }, text: "KILN 01 · ELECTRIC · 3 SECTIONS", alpha: 0.32, align: portrait ? "center" : "right" },
    { kind: "circle", c: k.opening, r: H * 0.75, alpha: 0.07, dash: [1, 6] },
  ];
  return { formation: { points, guides, groups: { kiln: { x: 0, y: ground - H } } }, opening: k.opening, diveZoom: Math.max(14, Math.min(w, h) / (H * 0.2)) };
}

// ---------- the agents: a folder tree ----------

export interface Studio {
  /** The folder tree (the default, for scanning) or the constellation (for the flow of work). */
  kind: "tree" | "sky";
  formation: Formation;
  /** Glyph radius. */
  r: number;
  /** Glyph centres. */
  agents: Record<CellId, Pt>;
  /** Where each agent's label starts, and the row height. */
  labels: Record<CellId, Pt>;
  rowH: number;
  /** The kiln at the root of the tree, and the scale that makes it fill the screen. */
  core: Pt;
  coreZoom: number;
  folder: Pt;
  /** Each agent's circuit back up to the kiln: glyph, pad, bus, folder, trunk, root. */
  up: Record<CellId, Pt[]>;
  stripX: number;
  /** The lowest point of the content, in world units; on a phone the page scrolls to reach it. */
  contentBottom: number;
}

/** How many events an agent had on each of the last `days` days, oldest first. */
function perDay(events: PublicEvent[], id: CellId, days: number, now: number): number[] {
  const out = new Array(days).fill(0);
  const today = Math.floor(now / DAY);
  for (const e of events) {
    if (cellFor(e) !== id) continue;
    const ago = today - Math.floor(Date.parse(e.at) / DAY);
    if (ago >= 0 && ago < days) out[days - 1 - ago]++;
  }
  return out;
}

export function studio(w: number, h: number, events: PublicEvent[] = [], now = Date.now()): Studio {
  const narrow = w < 640;
  const days = narrow ? 7 : 14;
  const colW = narrow ? 10 : 13;
  // Centre the tree on its contents: trunk, pads, figures, labels, strips.
  const content = (narrow ? 40 + 26 + 24 + 22 + 128 : 56 + 38 + 30 + 22 + 250) + days * colW;
  const left = -Math.min(w - 36, content) / 2;
  const top = -h / 2 + (narrow ? 88 : 108);
  const bottom = h / 2 - (narrow ? 120 : 116); // room for the view switch and hint
  const kh = narrow ? 38 : 54;
  const step = 2.2;
  const points: FPoint[] = [];
  const guides: Guide[] = [];
  const groups: Record<string, Pt> = {};
  const trace = (pts: Pt[], group: string, alpha = 0.6) => { for (const p of resample(pts, step * 1.5)) points.push({ ...p, size: 1.05, alpha, group }); };
  const via = (p: Pt, group: string) => { for (const q of circle(p.x, p.y, 4.4, 1.9)) points.push({ ...q, size: 0.85, alpha: 0.9, group }); points.push({ ...p, size: 1.4, alpha: 1, group }); };

  // The root: a small kiln.
  const groundY = top + kh * 2.05;
  const kx = left + kh * 0.62;
  const k = electricKiln(kx, groundY, kh, 1.5, 0.45, 9);
  for (const d of k.dots) points.push({ ...d, size: d.size * 0.8, group: "root" });
  const core = { x: kx, y: groundY - kh * 0.9 };
  groups.root = core;
  guides.push({ kind: "text", at: { x: k.bounds.right + 14, y: groundY - kh * 0.45 }, text: "game-kiln/", alpha: 0.9, size: narrow ? 13 : 15 });

  // Trunk from the kiln down to agents/.
  const rows = CELLS.length;
  const rowH = narrow ? 60 : Math.min(74, (bottom - (groundY + 40)) / (rows + 0.6));
  const folder = { x: left + (narrow ? 40 : 56), y: groundY + rowH * 0.9 };
  const c = 9;
  const trunk = [{ x: kx, y: groundY + 6 }, { x: kx, y: folder.y - c }, { x: kx + c, y: folder.y }, { x: folder.x - 4, y: folder.y }];
  trace(trunk, "trunk");
  groups.trunk = folder;
  via(folder, "trunk");
  guides.push({ kind: "text", at: { x: folder.x + 12, y: folder.y + 4 }, text: "agents/", alpha: 0.9, size: narrow ? 13 : 15 });

  // The bus, and a branch to each agent.
  const rows0 = folder.y;
  const r = narrow ? 12 : 15;
  const busX = folder.x;
  const padX = busX + (narrow ? 26 : 38);
  const lastY = rows0 + rowH * rows;
  trace([{ x: busX, y: rows0 + 4 }, { x: busX, y: lastY - c }], "bus");
  groups.bus = folder;
  const labelX = padX + r * 2 + 22;
  const stripX = labelX + (narrow ? 128 : 250);
  const agents = {} as Record<CellId, Pt>;
  const labels = {} as Record<CellId, Pt>;
  const up = {} as Record<CellId, Pt[]>;
  CELLS.forEach((cell, i) => {
    const y = rows0 + rowH * (i + 1);
    const g = { x: padX + r + 10, y };
    agents[cell.id] = g;
    labels[cell.id] = { x: labelX, y };
    groups[cell.id] = g;
    trace([{ x: busX, y: y - c }, { x: busX + c, y }, { x: padX - 4.6, y }], `trace-${cell.id}`);
    groups[`trace-${cell.id}`] = { x: busX, y };
    via({ x: padX, y }, `trace-${cell.id}`);
    for (const q of glyph(cell.id, g.x, g.y, r, Math.max(1.6, r / 7))) points.push({ ...q, size: 1.15, alpha: 0.95, group: cell.id });
    up[cell.id] = [{ x: g.x - r - 2, y }, { x: padX, y }, { x: busX + c, y }, { x: busX, y: y - c }, { x: busX, y: rows0 }, ...trunk.slice().reverse(), core];
    // Activity: a halo of dust around the figure, denser the busier the agent, and a
    // dot matrix of the last days, densest where the work was.
    const daily = perDay(events, cell.id, days, now);
    const total = daily.reduce((a, b) => a + b, 0);
    const random = rng(i + 1);
    for (let k2 = 0; k2 < Math.min(narrow ? 50 : 90, total * 4); k2++) {
      const a = random() * Math.PI * 2, rr = r * (1.25 + Math.sqrt(random()) * 0.75);
      points.push({ x: g.x + Math.cos(a) * rr, y: g.y + Math.sin(a) * rr, size: 0.6, alpha: 0.32, group: `halo-${cell.id}` });
    }
    groups[`halo-${cell.id}`] = g;
    daily.forEach((n, d) => {
      for (let k2 = 0; k2 < 6; k2++) {
        const lit = k2 < n;
        points.push({ x: stripX + d * colW, y: y + 12 - k2 * 4.8, size: lit ? 1.5 : 0.8, alpha: lit ? 0.95 : 0.2, group: `strip-${cell.id}` });
      }
    });
    groups[`strip-${cell.id}`] = { x: stripX, y };
    guides.push({ kind: "line", a: { x: labelX, y: y + rowH / 2 }, b: { x: stripX + days * colW, y: y + rowH / 2 }, alpha: 0.05 });
  });
  guides.push({ kind: "text", at: { x: stripX, y: rows0 + 4 }, text: `last ${days} days`, alpha: 0.35, size: 12 });
  const coreZoom = Math.max(10, (Math.min(w, h) * 0.55) / kh);
  return { kind: "tree", formation: { points, guides, groups }, r, agents, labels, rowH, core, coreZoom, folder, up, stripX, contentBottom: lastY + rowH / 2 };
}

// ---------- the agents: a constellation ----------

// Where each star sits, in a frame where work flows left to right: findings and
// research on the left, the PM gathering them, the build in the middle, the
// owner and release on the right. Portrait screens turn it to flow downward.
const SKY: Record<CellId, [number, number]> = {
  growth: [-0.52, -0.78], analyst: [-0.82, -0.36], ops: [-0.92, 0.18], quality: [-0.6, 0.66],
  pm: [-0.3, 0.02], implementer: [0.04, 0.4], digest: [0.18, -0.62], reviewer: [0.38, 0.06],
  owner: [0.66, -0.42], release: [0.88, 0.36],
};
const CORE: [number, number] = [0.5, 0.92];
// Portrait: x across (-1..1), y down the page (0..1+).
const SKY_TALL: Record<CellId, [number, number]> = {
  ops: [-0.62, 0], analyst: [0.62, 0], quality: [-0.62, 0.15], growth: [0.62, 0.15],
  pm: [-0.1, 0.32], digest: [0.66, 0.42], implementer: [-0.55, 0.5],
  reviewer: [-0.05, 0.66], owner: [0.6, 0.8], release: [-0.5, 0.94],
};
const CORE_TALL: [number, number] = [0.25, 1.1];
/** The routes work is meant to take, drawn faintly whether or not anything has moved on them yet. */
const LANES: [CellId | "core", CellId | "core"][] = [
  ["analyst", "pm"], ["ops", "pm"], ["quality", "pm"], ["growth", "pm"], ["growth", "digest"], ["pm", "implementer"],
  ["implementer", "reviewer"], ["reviewer", "owner"], ["digest", "owner"], ["owner", "release"], ["release", "core"],
];

export function constellation(w: number, h: number, events: PublicEvent[] = [], now = Date.now()): Studio {
  const portrait = w < h * 0.9;
  const sx = portrait ? Math.min(w * 0.36, 220) : Math.min(w * 0.4, 640);
  const sy = portrait ? 560 : h * 0.31;
  const top = -h / 2 + 120;
  const place = ([u, v]: [number, number]): Pt => (portrait ? { x: u * sx, y: top + v * sy } : { x: u * sx, y: v * sy });
  const spot = (id: CellId): Pt => place(portrait ? SKY_TALL[id] : SKY[id]);
  const r = portrait ? 12 : 15;
  const points: FPoint[] = [];
  const guides: Guide[] = [];
  const groups: Record<string, Pt> = {};
  const agents = {} as Record<CellId, Pt>;
  const labels = {} as Record<CellId, Pt>;
  const up = {} as Record<CellId, Pt[]>;
  const core = place(portrait ? CORE_TALL : CORE);
  const kh = portrait ? 34 : 44;
  const k = electricKiln(core.x, core.y + kh * 0.55, kh, 1.5, 0.45, 9);
  for (const d of k.dots) points.push({ ...d, size: d.size * 0.85, group: "root" });
  groups.root = core;
  const at = (id: CellId | "core") => (id === "core" ? core : agents[id]);

  // Traffic per route, from the history: how often work actually moved along it.
  const traffic = new Map<string, number>();
  const totals = new Map<CellId, number>();
  for (const e of events) {
    const [a, b] = flow(e);
    if (a !== b) { const key = [a, b].sort().join(">"); traffic.set(key, (traffic.get(key) ?? 0) + 1); }
    const id = cellFor(e);
    if (id) totals.set(id, (totals.get(id) ?? 0) + 1);
  }

  CELLS.forEach((cell, i) => {
    const p = spot(cell.id);
    agents[cell.id] = p;
    labels[cell.id] = { x: p.x, y: p.y + r * 1.6 };
    groups[cell.id] = p;
    for (const q of glyph(cell.id, p.x, p.y, r, Math.max(1.6, r / 7))) points.push({ ...q, size: 1.15, alpha: 1, group: cell.id });
    // Brightness as density: a busier star gathers more dust.
    const random = rng(40 + i);
    for (let n = 0; n < Math.min(120, (totals.get(cell.id) ?? 0) * 5); n++) {
      const a = random() * Math.PI * 2, rr = r * (1.3 + Math.pow(random(), 1.6) * 1.4);
      points.push({ x: p.x + Math.cos(a) * rr, y: p.y + Math.sin(a) * rr, size: 0.6, alpha: 0.35, group: `halo-${cell.id}` });
    }
    groups[`halo-${cell.id}`] = p;
    up[cell.id] = [p, core];
  });

  const lanes = new Set<string>();
  for (const [a, b] of LANES) {
    const A = at(a), B = at(b);
    lanes.add([a, b].sort().join(">"));
    guides.push({ kind: "line", a: A, b: B, alpha: 0.07, dash: [2, 6] });
  }
  // Each route that carried work is a line of dots, closer together the more it carried.
  for (const [key, n] of traffic) {
    const [a, b] = key.split(">") as (CellId | "core")[];
    const A = at(a), B = at(b);
    const len = Math.hypot(B.x - A.x, B.y - A.y);
    const pad = r * 1.8;
    if (len < pad * 2.2) continue;
    const ux = (B.x - A.x) / len, uy = (B.y - A.y) / len;
    const from = { x: A.x + ux * pad, y: A.y + uy * pad }, to = { x: B.x - ux * (b === "core" || a === "core" ? kh * 0.8 : pad), y: B.y - uy * (b === "core" || a === "core" ? kh * 0.8 : pad) };
    const spacing = Math.max(3.2, 16 / Math.sqrt(n));
    const group = `edge-${a}-${b}`;
    for (const q of line(from, to, spacing)) points.push({ ...q, size: 0.9 + Math.min(0.9, n / 25), alpha: Math.min(0.95, 0.35 + n * 0.04), group });
    groups[group] = { x: (A.x + B.x) / 2, y: (A.y + B.y) / 2 };
    // On a phone the counts crowd the labels; the density of the line carries it.
    if (!portrait) guides.push({ kind: "text", at: { x: (A.x + B.x) / 2 + uy * 12, y: (A.y + B.y) / 2 - ux * 12 + 4 }, text: String(n), alpha: 0.4, align: "center", size: 11 });
  }
  void lanes;
  const coreZoom = Math.max(10, (Math.min(w, h) * 0.55) / kh);
  const contentBottom = Math.max(core.y + kh * 0.9, ...Object.values(labels).map((l) => l.y + 44));
  return { kind: "sky", formation: { points, guides, groups }, r, agents, labels, rowH: 0, core, coreZoom, folder: core, up, stripX: 0, contentBottom };
}

/** The circuit from one agent to another: up to agents/, then down. */
export function route(st: Studio, from: CellId | "core", to: CellId | "core"): Pt[] {
  if (st.kind === "sky") return [from === "core" ? st.core : st.agents[from], to === "core" ? st.core : st.agents[to]];
  const toFolder = (id: CellId) => st.up[id].slice(0, 5);
  if (from === "core" && to === "core") return [st.core, st.core];
  if (to === "core") return st.up[from as CellId];
  if (from === "core") return st.up[to].slice().reverse();
  return [...toFolder(from), ...toFolder(to).slice().reverse()];
}

// ---------- one agent ----------

export interface AgentView { formation: Formation; camera: { x: number; y: number; s: number } }

/** Local time of day as an angle, midnight at the top. */
const dayAngle = (t: number) => {
  const d = new Date(t);
  return -Math.PI / 2 + ((d.getHours() * 60 + d.getMinutes()) / 1440) * Math.PI * 2;
};

/**
 * The agent's figure, large, wrapped in rings of days: each ring a day since
 * the studio began (oldest inside), each dot an event at its time of day. Its
 * circuit back to agents/ and the kiln stays lit.
 */
export function agent(w: number, h: number, st: Studio, id: CellId, events: PublicEvent[], now: number): AgentView {
  const portrait = w < h * 0.9;
  const screen = portrait ? { x: w / 2, y: h * 0.3 } : { x: w * 0.32, y: h / 2 + 10 };
  const ringScreen = portrait ? Math.min(w * 0.38, h * 0.22) : Math.min(h * 0.34, w * 0.24);
  const s = Math.max(2.4, Math.min(9, (ringScreen * 0.3) / st.r));
  const c = st.agents[id];
  const camera = { x: c.x - (screen.x - w / 2) / s, y: c.y - (screen.y - h / 2) / s, s };
  const base = st.formation;
  // This agent's own dots come first, so they always get a dot from the pool; the
  // other rows keep their figures and traces but not their strips and halos.
  const points: FPoint[] = [];
  const rest = base.points.filter((p) => p.group !== id && !(p.group && /^(strip|halo)-/.test(p.group) && !p.group.endsWith(`-${id}`)) && !(p.group?.startsWith("edge-") && !p.group.split("-").includes(id)));

  const R0 = st.r * 1.75, R1 = ringScreen / s;
  const days = Math.max(7, Math.ceil((now - HISTORY_START) / DAY));
  const dr = (R1 - R0) / days;
  const guides: Guide[] = [];
  for (let d = 0; d <= days; d++) guides.push({ kind: "circle", c, r: R0 + d * dr, alpha: d === days ? 0.22 : 0.06 });
  for (let hr = 0; hr < 24; hr++) {
    const a = -Math.PI / 2 + (hr / 24) * Math.PI * 2;
    const inner = R1 + (hr % 6 === 0 ? 0 : 0.6 * dr), outer = R1 + (hr % 6 === 0 ? 2.2 * dr : 1.2 * dr);
    guides.push({ kind: "line", a: { x: c.x + Math.cos(a) * inner, y: c.y + Math.sin(a) * inner }, b: { x: c.x + Math.cos(a) * outer, y: c.y + Math.sin(a) * outer }, alpha: hr % 6 === 0 ? 0.35 : 0.15 });
    if (hr % 6 === 0) guides.push({ kind: "text", at: { x: c.x + Math.cos(a) * (outer + 1.6 * dr), y: c.y + Math.sin(a) * (outer + 1.6 * dr) + 3 }, text: String(hr).padStart(2, "0"), alpha: 0.4, align: "center", size: 9 });
  }
  const na = dayAngle(now);
  guides.push({ kind: "line", a: { x: c.x + Math.cos(na) * R0, y: c.y + Math.sin(na) * R0 }, b: { x: c.x + Math.cos(na) * (R1 + 2.6 * dr), y: c.y + Math.sin(na) * (R1 + 2.6 * dr) }, alpha: 0.5 });
  const cell = CELLS.find((x) => x.id === id)!;
  const today = Date.UTC(new Date(now).getUTCFullYear(), new Date(now).getUTCMonth(), new Date(now).getUTCDate());
  for (const [hh, mm] of cell.times) {
    const a = dayAngle(today + (hh * 60 + mm) * 60_000);
    for (const q of line({ x: c.x + Math.cos(a) * (R1 - dr * 0.5), y: c.y + Math.sin(a) * (R1 - dr * 0.5) }, { x: c.x + Math.cos(a) * (R1 + dr * 1.8), y: c.y + Math.sin(a) * (R1 + dr * 1.8) }, dr * 0.45)) points.push({ ...q, size: 0.8, alpha: 0.6, group: `${id}-hist` });
  }
  // Every event a dot, with a little dust around it, so busy hours read as dense.
  let seed = 11;
  const rnd = () => ((seed = (seed * 1664525 + 1013904223) >>> 0) / 4294967296);
  for (const e of events) {
    const t = Date.parse(e.at);
    const d = Math.min(days - 1, Math.max(0, Math.floor((t - HISTORY_START) / DAY)));
    const a = dayAngle(t);
    const rr = R0 + (d + 0.5) * dr;
    const wt = weight(e);
    const p = { x: c.x + Math.cos(a) * rr, y: c.y + Math.sin(a) * rr };
    points.push({ ...p, size: wt.size * Math.min(1, (dr * s) / 9) + 0.3, alpha: wt.alpha, group: `${id}-hist` });
    for (let k = 0; k < 3; k++) points.push({ x: p.x + (rnd() - 0.5) * dr * 1.6, y: p.y + (rnd() - 0.5) * dr * 1.6, size: 0.45, alpha: 0.28, group: `${id}-hist` });
  }
  for (const q of circle(c.x, c.y, R1 + 2.6 * dr, Math.max(dr * 0.8, 2 / s))) points.push({ ...q, size: 0.6, alpha: 0.22, group: `${id}-hist` });
  // A denser figure for this agent, and its circuit home, brighter.
  for (const q of glyph(id, c.x, c.y, st.r, Math.max(0.5, st.r / 22))) points.push({ ...q, size: 0.75, alpha: 1, group: id });
  for (const q of resample(st.up[id], 1.4)) points.push({ ...q, size: 0.6, alpha: 0.9, group: `${id}-home` });
  points.push(...rest);
  const groups = { ...base.groups, [`${id}-hist`]: c, [`${id}-home`]: c };
  return { formation: { points, guides: [...base.guides.filter((g) => g.kind !== "text"), ...guides], groups }, camera };
}
