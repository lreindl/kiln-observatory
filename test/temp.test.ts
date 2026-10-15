// Kiln temp is cosmetic, but it should stay in range and follow activity.

import { describe, expect, it } from "vitest";
import type { PublicEvent } from "../shared/public";
import { AMBIENT, PEAK, approach, glow, stage, target } from "../src/temp";

const NOW = Date.parse("2026-10-15T12:00:00Z");
const ev = (minutesAgo: number): PublicEvent => ({ kind: "pr.opened", actor: "implementer", game: "factory", at: new Date(NOW - minutesAgo * 60_000).toISOString() }) as PublicEvent;
const burst = (n: number, minutesAgo = 5) => Array.from({ length: n }, () => ev(minutesAgo));

describe("kiln temp", () => {
  it("sits at room temperature when nothing has happened", () => {
    expect(target([], 0, NOW)).toBe(AMBIENT);
    expect(target([ev(60 * 24)], 0, NOW)).toBeCloseTo(AMBIENT, 0);
  });

  it("rises with activity and never passes the peak", () => {
    const quiet = target(burst(2), 0, NOW), busy = target(burst(12), 2, NOW), wild = target(burst(500), 10, NOW);
    expect(quiet).toBeGreaterThan(AMBIENT);
    expect(busy).toBeGreaterThan(quiet);
    expect(wild).toBeLessThanOrEqual(PEAK);
    expect(wild).toBeGreaterThan(1250);
  });

  it("cools as events age", () => {
    expect(target(burst(10, 5), 0, NOW)).toBeGreaterThan(target(burst(10, 240), 0, NOW));
  });

  it("heats faster than it cools", () => {
    const up = approach(AMBIENT, 1000, 1) - AMBIENT, down = 1000 - approach(1000, AMBIENT, 1);
    expect(up).toBeGreaterThan(down);
  });

  it("names and colours each range", () => {
    expect(stage(20)).toBe("cold");
    expect(stage(1290)).toBe("cone 10");
    expect(glow(20)).toBe("#fff");
    expect(glow(PEAK)).toMatch(/^hsl\(48/);
  });
});
