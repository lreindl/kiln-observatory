// The Game Kiln mark (C4): a kiln seen from directly above, two octagonal rings
// around an octagonal G. One source for every place it appears: the dotted
// version on the field, and the line version in the header (public/logo.svg
// and public/favicon.svg are the same paths).

import { resample, type Pt } from "./shapes";

type Path = { points: [number, number][]; closed: boolean };

/** In a 100 × 100 box, centred on (50, 50). */
export const MARK: Path[] = [
  { closed: true, points: [[90.6, 66.8], [66.8, 90.6], [33.2, 90.6], [9.4, 66.8], [9.4, 33.2], [33.2, 9.4], [66.8, 9.4], [90.6, 33.2]] },
  { closed: true, points: [[79.6, 62.3], [62.3, 79.6], [37.7, 79.6], [20.4, 62.3], [20.4, 37.7], [37.7, 20.4], [62.3, 20.4], [79.6, 37.7]] },
  { closed: false, points: [[68.5, 42.3], [57.7, 31.5], [42.3, 31.5], [31.5, 42.3], [31.5, 57.7], [42.3, 68.5], [57.7, 68.5], [68.5, 57.7], [68.5, 50], [50, 50], [50, 57]] },
];

/** The mark as dots, centred on (cx, cy), `size` across. */
export function markDots(cx: number, cy: number, size: number, step: number): Pt[] {
  const k = size / 100;
  return MARK.flatMap((p) => resample(p.points.map(([x, y]) => ({ x: cx + (x - 50) * k, y: cy + (y - 50) * k })), step, p.closed));
}

/** The mark as inline SVG, in the current text colour. */
export function markSvg(size: number, stroke = 4): string {
  const shapes = MARK.map((p) => {
    const pts = p.points.map((q) => q.join(",")).join(" ");
    return p.closed ? `<polygon points="${pts}"/>` : `<polyline points="${pts}"/>`;
  }).join("");
  return `<svg viewBox="0 0 100 100" width="${size}" height="${size}" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="${stroke}" stroke-linejoin="round" stroke-linecap="round">${shapes}</svg>`;
}
