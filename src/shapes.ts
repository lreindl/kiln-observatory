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
