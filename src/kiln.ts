// Seeded randomness and stippling, for dot textures that look the same on every load.

import type { Pt } from "./shapes";

/** A seeded random source, so stippling is the same on every load. */
export function rng(seed: number): () => number {
  let s = seed >>> 0;
  return () => ((s = (s * 1664525 + 1013904223) >>> 0) / 4294967296);
}

export function inside(p: Pt, shape: Pt[]): boolean {
  let hit = false;
  for (let i = 0, j = shape.length - 1; i < shape.length; j = i++) {
    const a = shape[i], b = shape[j];
    if (a.y > p.y !== b.y > p.y && p.x < ((b.x - a.x) * (p.y - a.y)) / (b.y - a.y) + a.x) hit = !hit;
  }
  return hit;
}

/** Scatters dots inside a polygon; `spacing` is the mean distance between them. */
export function stipple(shape: Pt[], spacing: number, random: () => number, keep?: (p: Pt) => number): Pt[] {
  const xs = shape.map((p) => p.x), ys = shape.map((p) => p.y);
  const x0 = Math.min(...xs), x1 = Math.max(...xs), y0 = Math.min(...ys), y1 = Math.max(...ys);
  const n = Math.round(((x1 - x0) * (y1 - y0)) / (spacing * spacing));
  const out: Pt[] = [];
  for (let i = 0; i < n; i++) {
    const p = { x: x0 + random() * (x1 - x0), y: y0 + random() * (y1 - y0) };
    if (inside(p, shape) && (!keep || random() < keep(p))) out.push(p);
  }
  return out;
}
