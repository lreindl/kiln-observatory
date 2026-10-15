// Internal temp: a cosmetic reading of how busy the studio is, in °F. Recent
// events and agents at work add heat; it fades over a few hours. It measures
// nothing real.

import type { PublicEvent } from "../shared/public";

export const AMBIENT = 68;
/** About where stoneware fires (cone 10, ~2345 °F). */
export const PEAK = 2372;
/** An event's heat falls to about a third over this many ms. */
const FADE = 3 * 3_600_000;
/** Heat at which the kiln is ~63% of the way from ambient to peak. */
const SCALE = 8;
/** An agent at work counts as this many fresh events. */
const PER_AGENT = 2.5;

/** Where the kiln is heading, in °F, from the recent history and how many agents are working. */
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
