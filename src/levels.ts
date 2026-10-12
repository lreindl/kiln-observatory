// The three levels as formations of dots, laid out for the current viewport.
// World origin is the centre of the screen at camera scale 1.

import type { PublicEvent } from "../shared/public";
import { CELLS, weight, type CellId } from "./crew";
import type { FPoint, Formation, Guide } from "./field";
import { circle, glyph, kiln, line, type Pt } from "./shapes";

export const HISTORY_START = Date.UTC(2026, 9, 7);
const DAY = 86_400_000;

// ---------- outside ----------

export interface Outside { formation: Formation; door: Pt; doorZoom: number }

export function outside(w: number, h: number): Outside {
  const portrait = w < h;
  const H = Math.min(h * (portrait ? 0.42 : 0.56), w * (portrait ? 0.8 : 0.5));
  const ground = H * (portrait ? 0.12 : 0.36);
  const cx = 0;
  const k = kiln(cx, ground, H, Math.max(3.4, H / 120));
  const points: FPoint[] = [
    ...k.outline.map((p) => ({ ...p, size: 1.35, alpha: 0.95, group: "kiln" })),
    ...k.courses.map((p) => ({ ...p, size: 0.9, alpha: 0.32, group: "kiln" })),
  ];
  const door = { x: cx, y: k.door.y + k.door.h * 0.6 };
  const right = cx + k.halfBase + H * (portrait ? 0.06 : 0.12);
  const guides: Guide[] = [
    { kind: "line", a: { x: -w, y: ground }, b: { x: w, y: ground }, alpha: 0.22 },
    { kind: "line", a: { x: cx, y: k.top - H * 0.12 }, b: { x: cx, y: ground + H * 0.08 }, alpha: 0.14, dash: [2, 6] },
    { kind: "ellipse", c: { x: k.rim.x, y: k.rim.y }, rx: k.rim.rx, ry: k.rim.ry, alpha: 0.35 },
    { kind: "circle", c: door, r: k.door.w * 1.6, alpha: 0.12, dash: [2, 5] },
    { kind: "circle", c: door, r: k.door.w * 3.4, alpha: 0.07, dash: [1, 7] },
    // Dimension line with ticks.
    { kind: "line", a: { x: right, y: k.top }, b: { x: right, y: ground }, alpha: 0.25 },
    { kind: "line", a: { x: right - 6, y: k.top }, b: { x: right + 6, y: k.top }, alpha: 0.25 },
    { kind: "line", a: { x: right - 6, y: ground }, b: { x: right + 6, y: ground }, alpha: 0.25 },
    { kind: "text", at: { x: right + 10, y: (k.top + ground) / 2 }, text: "H 14.0 m", alpha: 0.35 },
    portrait
      ? { kind: "text", at: { x: cx, y: k.top - H * 0.06 }, text: "KILN 01 · BOTTLE TYPE", alpha: 0.32, align: "center" }
      : { kind: "text", at: { x: cx - k.halfBase - H * 0.1, y: k.top + 4 }, text: "KILN 01 · BOTTLE TYPE", alpha: 0.32, align: "right" },
    { kind: "text", at: { x: cx + k.door.w * 1.7, y: door.y - k.door.w * 1.2 }, text: "ENTRY", alpha: 0.3 },
  ];
  return { formation: { points, guides, groups: { kiln: { x: cx, y: ground - H / 2 } } }, door, doorZoom: Math.max(12, (Math.min(w, h) * 0.9) / k.door.w) };
}

// ---------- the studio ----------

export interface Studio {
  formation: Formation;
  r: number;
  agents: Record<CellId, Pt>;
  core: Pt;
  coreR: number;
}

export function studio(w: number, h: number): Studio {
  const portrait = w < h * 0.9;
  const rx = portrait ? w * 0.34 : Math.min(w * 0.36, h * 0.52);
  const ry = portrait ? Math.min(h * 0.31, w * 0.62) : h * 0.33;
  const r = Math.max(13, Math.min(30, Math.min(w, h) * 0.038));
  const step = Math.max(2.6, r / 7.5);
  const agents = {} as Record<CellId, Pt>;
  const points: FPoint[] = [];
  const groups: Record<string, Pt> = {};
  const guides: Guide[] = [
    { kind: "ellipse", c: { x: 0, y: 0 }, rx, ry, alpha: 0.1, dash: [2, 6] },
    { kind: "ellipse", c: { x: 0, y: 0 }, rx: rx * 1.18, ry: ry * 1.18, alpha: 0.06 },
    { kind: "line", a: { x: -rx * 1.3, y: 0 }, b: { x: rx * 1.3, y: 0 }, alpha: 0.06 },
    { kind: "line", a: { x: 0, y: -ry * 1.3 }, b: { x: 0, y: ry * 1.3 }, alpha: 0.06 },
  ];
  CELLS.forEach((c, i) => {
    const a = -Math.PI / 2 + (i / CELLS.length) * Math.PI * 2;
    const p = { x: Math.cos(a) * rx, y: Math.sin(a) * ry };
    agents[c.id] = p;
    groups[c.id] = p;
    for (const q of glyph(c.id, p.x, p.y, r, step)) points.push({ ...q, size: 1.25, alpha: 0.95, group: c.id });
    // A dotted spoke from the core to each agent.
    const from = { x: p.x * 0.2, y: p.y * 0.2 }, to = { x: p.x * (1 - (r * 1.9) / Math.hypot(p.x, p.y)), y: p.y * (1 - (r * 1.9) / Math.hypot(p.x, p.y)) };
    for (const q of line(from, to, step * 3.2)) points.push({ ...q, size: 0.8, alpha: 0.28 });
    guides.push({ kind: "text", at: { x: p.x - r * 1.5, y: p.y - r * 1.15 }, text: `A-${String(i + 1).padStart(2, "0")}`, alpha: 0.25, align: "right", size: 9 });
  });
  // The kiln at the centre: the studio's core.
  const coreH = r * 3.6;
  const k = kiln(0, coreH * 0.45, coreH, step * 0.85);
  for (const q of k.outline) points.push({ ...q, size: 1.15, alpha: 0.9, group: "core" });
  groups.core = { x: 0, y: 0 };
  guides.push({ kind: "circle", c: { x: 0, y: 0 }, r: coreH * 0.75, alpha: 0.1, dash: [1, 4] });
  return { formation: { points, guides, groups }, r, agents, core: { x: 0, y: -coreH * 0.05 }, coreR: coreH * 0.6 };
}

// ---------- one agent ----------

export interface AgentView { formation: Formation; camera: { x: number; y: number; s: number }; screen: Pt; ringR: number }

/** Local time of day as an angle, midnight at the top. */
const dayAngle = (t: number) => {
  const d = new Date(t);
  return -Math.PI / 2 + ((d.getHours() * 60 + d.getMinutes()) / 1440) * Math.PI * 2;
};

/**
 * The agent's figure, large, wrapped in rings of days: each ring is a day since
 * the studio began (oldest inside), each dot an event at its time of day.
 */
export function agent(w: number, h: number, st: Studio, id: CellId, events: PublicEvent[], now: number): AgentView {
  const portrait = w < h * 0.9;
  const screen = portrait ? { x: w / 2, y: h * 0.3 } : { x: w * 0.32, y: h / 2 + 10 };
  const ringScreen = portrait ? Math.min(w * 0.38, h * 0.22) : Math.min(h * 0.34, w * 0.24);
  const s = Math.max(2.4, Math.min(8, (ringScreen * 0.33) / st.r));
  const c = st.agents[id];
  const camera = { x: c.x - (screen.x - w / 2) / s, y: c.y - (screen.y - h / 2) / s, s };
  const base = studio(w, h).formation;
  // Swap in a denser version of this agent's figure.
  const points: FPoint[] = base.points.filter((p) => p.group !== id);
  for (const q of glyph(id, c.x, c.y, st.r, Math.max(1.2, st.r / 16))) points.push({ ...q, size: 0.9, alpha: 1, group: id });

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
  // The hand: now.
  const na = dayAngle(now);
  guides.push({ kind: "line", a: { x: c.x + Math.cos(na) * R0, y: c.y + Math.sin(na) * R0 }, b: { x: c.x + Math.cos(na) * (R1 + 2.6 * dr), y: c.y + Math.sin(na) * (R1 + 2.6 * dr) }, alpha: 0.5 });
  // Scheduled runs, as dotted rays on today's ring.
  const cell = CELLS.find((x) => x.id === id)!;
  const today = Date.UTC(new Date(now).getUTCFullYear(), new Date(now).getUTCMonth(), new Date(now).getUTCDate());
  for (const [hh, mm] of cell.times) {
    const a = dayAngle(today + (hh * 60 + mm) * 60_000);
    for (const q of line({ x: c.x + Math.cos(a) * (R1 - dr * 0.5), y: c.y + Math.sin(a) * (R1 - dr * 0.5) }, { x: c.x + Math.cos(a) * (R1 + dr * 1.8), y: c.y + Math.sin(a) * (R1 + dr * 1.8) }, dr * 0.45)) points.push({ ...q, size: 0.8, alpha: 0.6, group: `${id}-hist` });
  }
  for (const e of events) {
    const t = Date.parse(e.at);
    const d = Math.min(days - 1, Math.max(0, Math.floor((t - HISTORY_START) / DAY)));
    const a = dayAngle(t);
    const rr = R0 + (d + 0.5) * dr;
    const wt = weight(e);
    points.push({ x: c.x + Math.cos(a) * rr, y: c.y + Math.sin(a) * rr, size: wt.size * Math.min(1, dr * s / 9) + 0.3, alpha: wt.alpha, group: `${id}-hist` });
  }
  for (const q of circle(c.x, c.y, R1 + 2.6 * dr, Math.max(dr * 0.8, 2 / s))) points.push({ ...q, size: 0.6, alpha: 0.22, group: `${id}-hist` });
  const groups = { ...base.groups, [`${id}-hist`]: c };
  return { formation: { points, guides: [...base.guides.filter((g) => g.kind !== "text"), ...guides], groups }, camera, screen, ringR: ringScreen };
}
