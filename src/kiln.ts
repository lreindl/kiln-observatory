// The kiln: a top-loading electric kiln, three stacked octagonal sections on a
// stand, lid open on its hinge, control box on the front-right face. Drawn in a
// light oblique projection as dots, with faces shaded by dot density.

import { circle, line, poly, type Pt } from "./shapes";

export interface DotPt extends Pt { size: number; alpha: number }

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

export interface ElectricKiln {
  dots: DotPt[];
  /** The middle of the open top, where the many go in. */
  opening: Pt;
  /** Where the floor meets the front of the stand. */
  floor: number;
  bounds: { left: number; right: number; top: number; bottom: number };
}

/**
 * `h` is the body plus stand; the open lid rises above it. `detail` scales the
 * stippling (1 for the big kiln, lower for the small one in the tree).
 */
export function electricKiln(cx: number, ground: number, h: number, step: number, detail = 1, seed = 3): ElectricKiln {
  const random = rng(seed);
  const R = h * 0.5, legH = h * 0.3, bodyH = h * 0.7, top = legH + bodyH, K = 0.32;
  const P = (x: number, y: number, z: number): Pt => ({ x: cx + x, y: ground - y + z * K });
  const ang = (i: number) => ((22.5 + 45 * i) * Math.PI) / 180;
  const V = (i: number, r = R) => ({ x: r * Math.cos(ang(i)), z: r * Math.sin(ang(i)) });
  const dots: DotPt[] = [];
  const add = (pts: Pt[], size: number, alpha: number) => { for (const p of pts) dots.push({ ...p, size, alpha }); };
  const edge = (a: Pt, b: Pt, size = 1.3, alpha = 0.95, st = step) => add(line(a, b, st), size, alpha);
  const ring = [0, 1, 2, 3, 4, 5, 6, 7];

  // Top rim, the opening inside it, and the visible verticals. The two side
  // silhouettes run from the back rim corner down to the front bottom corner.
  for (const i of ring) edge(P(V(i).x, top, V(i).z), P(V(i + 1).x, top, V(i + 1).z));
  for (const i of ring) edge(P(V(i, R * 0.84).x, top, V(i, R * 0.84).z), P(V(i + 1, R * 0.84).x, top, V(i + 1, R * 0.84).z), 1, 0.7);
  edge(P(V(7).x, top, V(7).z), P(V(0).x, legH, V(0).z));
  edge(P(V(4).x, top, V(4).z), P(V(3).x, legH, V(3).z));
  for (const i of [1, 2]) edge(P(V(i).x, top, V(i).z), P(V(i).x, legH, V(i).z));
  // Bottom edge and the two section bands, doubled like steel straps.
  for (const y of [legH, legH + bodyH / 3, legH + (bodyH * 2) / 3]) {
    for (const i of [0, 1, 2]) edge(P(V(i).x, y, V(i).z), P(V(i + 1).x, y, V(i + 1).z), y === legH ? 1.3 : 1, y === legH ? 0.95 : 0.75);
    if (y !== legH) for (const i of [0, 1, 2]) edge(P(V(i).x, y + h * 0.018, V(i).z), P(V(i + 1).x, y + h * 0.018, V(i + 1).z), 0.8, 0.45, step * 1.4);
  }

  // Faces shaded by dot density, lit from the upper left.
  for (const [a, b, sparse] of [[2, 3, 1.05], [1, 2, 1.5], [0, 1, 2.6]] as const) {
    for (let sec = 0; sec < 3; sec++) {
      const y0 = legH + (sec * bodyH) / 3 + h * 0.03, y1 = legH + ((sec + 1) * bodyH) / 3 - h * 0.012;
      const face = [P(V(a).x, y0, V(a).z), P(V(b).x, y0, V(b).z), P(V(b).x, y1, V(b).z), P(V(a).x, y1, V(a).z)];
      add(stipple(face, (step * sparse * 1.5) / detail, random), 0.7, 0.42);
    }
  }

  // Inside the open top: the back walls with element grooves, fading toward the floor.
  const opening = ring.map((i) => P(V(i, R * 0.84).x, top, V(i, R * 0.84).z));
  const near = Math.max(...opening.map((p) => p.y)), far = Math.min(...opening.map((p) => p.y));
  for (const d of [0.1, 0.2, 0.3, 0.4, 0.5]) {
    for (const i of [3, 4, 5, 6, 7]) {
      const a = V(i, R * 0.84), b = V(i + 1, R * 0.84);
      add(line(P(a.x, top - bodyH * d, a.z), P(b.x, top - bodyH * d, b.z), step * 1.1).filter((p) => inside(p, opening)), 0.8, 0.6 - d * 0.7);
    }
  }
  add(stipple(opening, (step * 2.6) / detail, random, (p) => 0.25 + 0.75 * ((p.y - far) / (near - far))), 0.6, 0.25);

  // The lid, hinged at the back and swung up past vertical, with brick joints.
  const hingeZ = -R * Math.cos(Math.PI / 8), phi = (100 * Math.PI) / 180, span = 2 * R * Math.cos(Math.PI / 8);
  const L = (x: number, dz: number) => P(x, top + dz * Math.sin(phi), hingeZ + dz * Math.cos(phi));
  const lid = ring.map((i) => L(V(i).x, V(i).z - hingeZ));
  add(poly(lid, step), 1.3, 0.95);
  for (const f of [0.25, 0.5, 0.75]) add(line(L(-R, f * span), L(R, f * span), step * 1.3).filter((p) => inside(p, lid)), 0.8, 0.4);
  for (let k = 0; k < 4; k++) for (const x of [-0.5, 0, 0.5]) {
    const xx = (x + (k % 2 ? 0.25 : 0)) * R;
    add(line(L(xx, k * 0.25 * span), L(xx, (k + 1) * 0.25 * span), step * 1.3).filter((p) => inside(p, lid)), 0.8, 0.35);
  }
  add(stipple(lid, (step * 2.2) / detail, random), 0.65, 0.3);
  const hy = h * 0.05;
  edge(L(-R * 0.18, span + hy), L(R * 0.18, span + hy), 1.1, 0.9);
  edge(L(-R * 0.18, span), L(-R * 0.18, span + hy), 1.1, 0.9);
  edge(L(R * 0.18, span), L(R * 0.18, span + hy), 1.1, 0.9);

  // Control box on the front-right face: a screen and a vent grille.
  const a = V(0), b = V(1);
  const n = { x: Math.cos(Math.PI / 4), z: Math.sin(Math.PI / 4) };
  const F = (u: number, y: number, out: number) => P(a.x + (b.x - a.x) * u + n.x * out, y, a.z + (b.z - a.z) * u + n.z * out);
  const d = R * 0.16, by0 = legH + bodyH * 0.12, by1 = legH + bodyH * 0.9;
  add(poly([F(0.14, by0, d), F(0.86, by0, d), F(0.86, by1, d), F(0.14, by1, d)], step), 1.2, 0.95);
  edge(F(0.14, by1, 0), F(0.14, by1, d), 1, 0.7);
  edge(F(0.86, by1, 0), F(0.86, by1, d), 1, 0.7);
  edge(F(0.14, by0, 0), F(0.14, by0, d), 1, 0.5);
  const screen = [F(0.3, legH + bodyH * 0.62, d), F(0.7, legH + bodyH * 0.62, d), F(0.7, legH + bodyH * 0.82, d), F(0.3, legH + bodyH * 0.82, d)];
  add(poly(screen, step * 0.8), 0.9, 0.9);
  add(stipple(screen, (step * 0.9) / detail, random), 0.6, 0.75);
  for (let row = 0; row < 7; row++) for (let col = 0; col < 6; col++) dots.push({ ...F(0.24 + col * 0.1, legH + bodyH * (0.18 + row * 0.045), d), size: 0.75, alpha: 0.7 });

  // Peepholes on the front face; a latch on the left.
  for (const sec of [0, 2]) {
    const c = P(0, legH + (bodyH * (sec + 0.5)) / 3, V(1).z);
    add(circle(c.x, c.y, h * 0.035, step * 0.6), 0.9, 0.85);
  }
  edge(P(V(3).x * 0.92, top - bodyH * 0.05, V(3).z), P(V(3).x * 0.92, top - bodyH * 0.16, V(3).z), 1, 0.8);

  // Stand: four legs with feet, and a brace ring.
  for (const [deg, alpha] of [[30, 0.95], [150, 0.95], [210, 0.4], [330, 0.4]] as const) {
    const t = (deg * Math.PI) / 180, x = R * 0.78 * Math.cos(t), z = R * 0.78 * Math.sin(t);
    edge(P(x, legH, z), P(x, 0, z), 1.2, alpha);
    edge(P(x - h * 0.03, 0, z), P(x + h * 0.03, 0, z), 1, alpha);
  }
  for (const i of [0, 1, 2, 3]) edge(P(V(i, R * 0.8).x, legH * 0.55, V(i, R * 0.8).z), P(V(i + 1, R * 0.8).x, legH * 0.55, V(i + 1, R * 0.8).z), 0.8, 0.5, step * 1.4);

  return { dots, opening: P(0, top, 0), floor: ground + R * K, bounds: { left: cx - R, right: cx + R + d * 1.4, top: Math.min(...lid.map((p) => p.y)) - hy, bottom: ground } };
}
