// Kiln temp: a cosmetic reading of how busy the studio is. Recent events and
// agents at work add heat; it fades over a few hours. It measures nothing real.

import type { PublicEvent } from "../shared/public";

export const AMBIENT = 20;
/** About where stoneware fires (cone 10, ~1285 °C). */
export const PEAK = 1300;
/** An event's heat falls to about a third over this many ms. */
const FADE = 3 * 3_600_000;
/** Heat at which the kiln is ~63% of the way from ambient to peak. */
const SCALE = 8;
/** An agent at work counts as this many fresh events. */
const PER_AGENT = 2.5;

/** Where the kiln is heading, in °C, from the recent history and how many agents are working. */
export function target(history: PublicEvent[], working: number, now = Date.now()): number {
  let heat = working * PER_AGENT;
  for (const e of history) {
    const age = now - Date.parse(e.at);
    if (age < 0) continue;
    if (age > FADE * 4) break; // history is newest first
    heat += Math.exp(-age / FADE);
  }
  return AMBIENT + (PEAK - AMBIENT) * (1 - Math.exp(-heat / SCALE));
}

/** One step of a kiln's thermal lag: the reading creeps toward the target, faster heating than cooling. */
export function approach(current: number, goal: number, dt: number): number {
  const rate = goal > current ? 0.35 : 0.08;
  return goal + (current - goal) * Math.exp(-rate * dt);
}

/** The colour of the heat, roughly as a kiln glows: white while cold, dull red, orange, then yellow-white. */
const GLOW: [number, number, number, number][] = [
  // °C, hue, saturation %, lightness %
  [450, 0, 0, 90],
  [600, 0, 75, 42],
  [850, 14, 90, 50],
  [1100, 30, 100, 56],
  [PEAK, 48, 100, 82],
];
export function glow(c: number): string {
  if (c <= GLOW[0][0]) return "#fff";
  const i = GLOW.findIndex(([t]) => t >= c);
  if (i < 0) { const [, h, s, l] = GLOW[GLOW.length - 1]; return `hsl(${h} ${s}% ${l}%)`; }
  const [t0, h0, s0, l0] = GLOW[i - 1], [t1, h1, s1, l1] = GLOW[i];
  const k = (c - t0) / (t1 - t0), mix = (a: number, b: number) => (a + (b - a) * k).toFixed(1);
  return `hsl(${mix(h0, h1)} ${mix(s0, s1)}% ${mix(l0, l1)}%)`;
}

/** A potter's name for the temperature. */
export function stage(c: number): string {
  if (c < 100) return "cold";
  if (c < 573) return "warming";
  if (c < 900) return "red heat";
  if (c < 1100) return "bisque";
  if (c < 1250) return "glaze";
  return "cone 10";
}
