// Geometry as dots: every shape on the page is sampled into evenly spaced
// points. Coordinates are world units (CSS pixels at camera scale 1), y down.

export interface Pt { x: number; y: number }

/** Resamples a polyline into points `step` apart. */
export function resample(path: Pt[], step: number, closed = false): Pt[] {
  const pts = closed ? [...path, path[0]] : path;
  const out: Pt[] = [];
  let carry = 0;
  for (let i = 0; i < pts.length - 1; i++) {
    const a = pts[i], b = pts[i + 1];
    const len = Math.hypot(b.x - a.x, b.y - a.y);
    let d = carry;
    while (d < len) {
      const k = d / len;
      out.push({ x: a.x + (b.x - a.x) * k, y: a.y + (b.y - a.y) * k });
      d += step;
    }
    carry = d - len;
  }
  if (!closed) out.push(pts[pts.length - 1]);
  return out;
}

export const line = (a: Pt, b: Pt, step: number) => resample([a, b], step);

export function arc(cx: number, cy: number, r: number, a0: number, a1: number, step: number): Pt[] {
  const n = Math.max(2, Math.ceil((Math.abs(a1 - a0) * r) / step));
  return Array.from({ length: n + 1 }, (_, i) => {
    const a = a0 + ((a1 - a0) * i) / n;
    return { x: cx + Math.cos(a) * r, y: cy + Math.sin(a) * r };
  });
}

export function circle(cx: number, cy: number, r: number, step: number): Pt[] {
  const n = Math.max(6, Math.round((Math.PI * 2 * r) / step));
  return Array.from({ length: n }, (_, i) => ({ x: cx + Math.cos((i / n) * Math.PI * 2) * r, y: cy + Math.sin((i / n) * Math.PI * 2) * r }));
}

export const poly = (pts: Pt[], step: number) => resample(pts, step, true);

export function regular(cx: number, cy: number, r: number, sides: number, rot: number, step: number): Pt[] {
  return poly(Array.from({ length: sides }, (_, i) => ({ x: cx + Math.cos(rot + (i / sides) * Math.PI * 2) * r, y: cy + Math.sin(rot + (i / sides) * Math.PI * 2) * r })), step);
}

export const rect = (x: number, y: number, w: number, h: number, step: number) =>
  poly([{ x, y }, { x: x + w, y }, { x: x + w, y: y + h }, { x, y: y + h }], step);

// ---------- the kiln ----------

// A bottle kiln's right-hand profile: [half-width, height], both as fractions of the kiln's height.
const PROFILE: [number, number][] = [[0.3, 0], [0.32, 0.05], [0.315, 0.16], [0.28, 0.34], [0.21, 0.55], [0.13, 0.76], [0.095, 0.88], [0.1, 0.95], [0.12, 0.985], [0.12, 1]];

function profileAt(t: number): number {
  for (let i = 0; i < PROFILE.length - 1; i++) {
    const [w0, h0] = PROFILE[i], [w1, h1] = PROFILE[i + 1];
    if (t <= h1) {
      const k = (t - h0) / (h1 - h0);
      return w0 + (w1 - w0) * (k * k * (3 - 2 * k));
    }
  }
  return PROFILE[PROFILE.length - 1][0];
}

export interface Kiln {
  outline: Pt[];
  courses: Pt[];
  door: { x: number; y: number; w: number; h: number };
  rim: { x: number; y: number; rx: number; ry: number };
  top: number;
  halfBase: number;
}

/** A bottle kiln standing on `ground`, centred on `cx`, `h` tall. */
export function kiln(cx: number, ground: number, h: number, step: number): Kiln {
  const right: Pt[] = [];
  for (let t = 0; t <= 1.0001; t += 0.01) right.push({ x: cx + profileAt(t) * h, y: ground - t * h });
  const left = right.map((p) => ({ x: 2 * cx - p.x, y: p.y })).reverse();
  const doorW = h * 0.15, doorH = h * 0.2;
  const door = { x: cx - doorW / 2, y: ground - doorH, w: doorW, h: doorH };
  // Outline: up the right side, across the rim, down the left; the door arch cut into the base.
  const outline = [
    ...resample(right, step),
    ...resample(left, step),
    ...line({ x: cx - profileAt(0) * h, y: ground }, { x: door.x, y: ground }, step),
    ...line({ x: door.x + door.w, y: ground }, { x: cx + profileAt(0) * h, y: ground }, step),
    ...line({ x: door.x, y: ground }, { x: door.x, y: ground - doorH + doorW / 2 }, step),
    ...arc(cx, ground - doorH + doorW / 2, doorW / 2, Math.PI, Math.PI * 2, step),
    ...line({ x: door.x + door.w, y: ground - doorH + doorW / 2 }, { x: door.x + door.w, y: ground }, step),
  ];
  // Brick courses: sparse dotted bands across the body.
  const courses: Pt[] = [];
  for (const t of [0.12, 0.24, 0.36, 0.48, 0.6, 0.7]) {
    const half = profileAt(t) * h * 0.92;
    const y = ground - t * h;
    for (const p of line({ x: cx - half, y }, { x: cx + half, y }, step * 1.6)) if (!(t < 0.2 && Math.abs(p.x - cx) < doorW * 0.7)) courses.push(p);
  }
  return { outline, courses, door, rim: { x: cx, y: ground - h, rx: profileAt(1) * h, ry: h * 0.022 }, top: ground - h, halfBase: profileAt(0.05) * h };
}

// ---------- agent glyphs ----------

/** Each agent's figure, centred on (cx, cy) with radius r. No two alike. */
export function glyph(id: string, cx: number, cy: number, r: number, step: number): Pt[] {
  const s = step;
  switch (id) {
    case "owner": // a diamond with a seat at its centre
      return [...regular(cx, cy, r, 4, -Math.PI / 2, s), ...circle(cx, cy, r * 0.28, s * 0.8)];
    case "analyst": // ripples: three concentric rings
      return [...circle(cx, cy, r, s), ...circle(cx, cy, r * 0.64, s), ...circle(cx, cy, r * 0.28, s)];
    case "ops": { // a hexagon crossed by a heartbeat
      const beat: Pt[] = [{ x: cx - r * 0.86, y: cy }, { x: cx - r * 0.3, y: cy }, { x: cx - r * 0.15, y: cy - r * 0.45 }, { x: cx + r * 0.05, y: cy + r * 0.4 }, { x: cx + r * 0.2, y: cy }, { x: cx + r * 0.86, y: cy }];
      return [...regular(cx, cy, r, 6, 0, s), ...resample(beat, s * 0.8)];
    }
    case "growth": // three rising bars on a baseline
      return [
        ...line({ x: cx - r, y: cy + r * 0.7 }, { x: cx + r, y: cy + r * 0.7 }, s),
        ...[0.35, 0.7, 1.15].flatMap((hgt, i) => rect(cx - r * 0.75 + i * r * 0.55, cy + r * 0.7 - hgt * r, r * 0.38, hgt * r, s * 0.8)),
      ];
    case "quality": // an inspection reticle
      return [
        ...circle(cx, cy, r, s),
        ...line({ x: cx - r * 1.25, y: cy }, { x: cx - r * 0.35, y: cy }, s), ...line({ x: cx + r * 0.35, y: cy }, { x: cx + r * 1.25, y: cy }, s),
        ...line({ x: cx, y: cy - r * 1.25 }, { x: cx, y: cy - r * 0.35 }, s), ...line({ x: cx, y: cy + r * 0.35 }, { x: cx, y: cy + r * 1.25 }, s),
        { x: cx, y: cy },
      ];
    case "pm": // a board: three lanes of cards
      return [0, 1, 2].flatMap((lane) => Array.from({ length: 3 - lane }, (_, k) => rect(cx - r + lane * r * 0.72, cy - r * 0.8 + k * r * 0.58, r * 0.56, r * 0.4, s * 0.75)).flat());
    case "digest": // an envelope
      return [...rect(cx - r, cy - r * 0.65, r * 2, r * 1.3, s), ...resample([{ x: cx - r, y: cy - r * 0.65 }, { x: cx, y: cy + r * 0.15 }, { x: cx + r, y: cy - r * 0.65 }], s)];
    case "implementer": { // a gear
      const teeth = Array.from({ length: 10 }, (_, i) => {
        const a = (i / 10) * Math.PI * 2;
        return line({ x: cx + Math.cos(a) * r * 0.66, y: cy + Math.sin(a) * r * 0.66 }, { x: cx + Math.cos(a) * r, y: cy + Math.sin(a) * r }, s * 0.7);
      }).flat();
      return [...circle(cx, cy, r * 0.66, s), ...circle(cx, cy, r * 0.22, s * 0.8), ...teeth];
    }
    case "reviewer": // an ensō, with the brush lifted
      return [...arc(cx, cy, r, -Math.PI * 0.35, Math.PI * 1.45, s), { x: cx + Math.cos(-Math.PI * 0.45) * r * 1.1, y: cy + Math.sin(-Math.PI * 0.45) * r * 1.1 }];
    case "release": // a fired piece leaving: a triangle lifting off two chevrons
      return [
        ...regular(cx, cy - r * 0.25, r * 0.75, 3, -Math.PI / 2, s),
        ...resample([{ x: cx - r * 0.6, y: cy + r * 0.75 }, { x: cx, y: cy + r * 0.45 }, { x: cx + r * 0.6, y: cy + r * 0.75 }], s * 0.8),
        ...resample([{ x: cx - r * 0.6, y: cy + r * 1.05 }, { x: cx, y: cy + r * 0.75 }, { x: cx + r * 0.6, y: cy + r * 1.05 }], s * 0.8),
      ];
    default:
      return circle(cx, cy, r, s);
  }
}
