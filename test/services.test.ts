// The services contract (game-kiln ADR-0025): only each service's state and its
// days of check counts leave the Worker. No URL, status code or timing.

import { describe, expect, it } from "vitest";
import { isService, isServices, type Service } from "../shared/public";
import { uptimeDots } from "../src/levels";
import { SERVICES, combine, probe, summarize, type CheckRow } from "../worker/services";

const NOW = Date.parse("2026-10-14T12:00:00Z");
const good: Service = { id: "pinhigh", name: "Pin High", state: "up", checkedAt: "2026-10-14T11:55:00.000Z", days: [{ day: "2026-10-14", checks: 144, up: 140, degraded: 2 }] };

describe("the services contract", () => {
  it("accepts a well-formed service", () => {
    expect(isService(good)).toBe(true);
    expect(isServices([good, { ...good, id: "d2factory", name: "D2 Factory", state: null, checkedAt: null, days: [] }])).toBe(true);
  });

  it("rejects anything that would carry more than the outcome", () => {
    expect(isService({ ...good, url: "https://pinhigh-api-production.lreindl01.workers.dev/daily" })).toBe(false);
    expect(isService({ ...good, status: 503 })).toBe(false);
    expect(isService({ ...good, days: [{ ...good.days[0], ms: 840 }] })).toBe(false);
    expect(isService({ ...good, state: "on fire" })).toBe(false);
    expect(isService({ ...good, name: "<script>alert(1)</script>" })).toBe(false);
    expect(isService({ ...good, days: [{ ...good.days[0], up: 200 }] })).toBe(false);
    expect(isService({ ...good, days: [{ ...good.days[0], day: "today" }] })).toBe(false);
  });

  it("names only what the Worker lists", () => {
    for (const s of summarize(SERVICES, [], NOW, 90)) expect(isService(s)).toBe(true);
    expect(SERVICES.map((s) => s.name)).toEqual(["Pin High", "D2 Factory"]);
  });
});

describe("checks", () => {
  it("combines parts: all up, some up, none up", () => {
    expect(combine([true, true])).toBe("up");
    expect(combine([true, false])).toBe("degraded");
    expect(combine([false, false])).toBe("down");
  });

  it("counts a 2xx as up, anything else or no answer as down", async () => {
    const answer = (status: number) => (async () => new Response("x", { status })) as unknown as typeof fetch;
    expect(await probe("https://example.test/", answer(200))).toBe(true);
    expect(await probe("https://example.test/", answer(404))).toBe(false);
    expect(await probe("https://example.test/", answer(503))).toBe(false);
    expect(await probe("https://example.test/", (async () => { throw new Error("timeout"); }) as unknown as typeof fetch)).toBe(false);
  });

  it("summarizes checks into days and the latest state", () => {
    const rows: CheckRow[] = [
      { service: "pinhigh", at: "2026-10-13T23:55:00.000Z", state: "up" },
      { service: "pinhigh", at: "2026-10-14T00:00:00.000Z", state: "down" },
      { service: "pinhigh", at: "2026-10-14T00:05:00.000Z", state: "degraded" },
      { service: "pinhigh", at: "2026-10-14T00:10:00.000Z", state: "up" },
      { service: "pinhigh", at: "2026-01-01T00:00:00.000Z", state: "down" }, // older than the window
      { service: "elsewhere", at: "2026-10-14T00:10:00.000Z", state: "down" },
    ];
    const [pin, d2] = summarize(SERVICES, rows, NOW, 90);
    expect(pin.state).toBe("up");
    expect(pin.checkedAt).toBe("2026-10-14T00:10:00.000Z");
    expect(pin.days).toEqual([
      { day: "2026-10-13", checks: 1, up: 1, degraded: 0 },
      { day: "2026-10-14", checks: 3, up: 1, degraded: 1 },
    ]);
    expect(d2).toEqual({ id: "d2factory", name: "D2 Factory", state: null, checkedAt: null, days: [] });
  });
});

describe("the strip", () => {
  it("fills a column only for a day without downtime", () => {
    expect(uptimeDots(288, 288, 0)).toBe(6);
    expect(uptimeDots(288, 287, 0)).toBe(5);
    expect(uptimeDots(288, 144, 0)).toBe(3);
    expect(uptimeDots(288, 0, 0)).toBe(0);
    expect(uptimeDots(0, 0, 0)).toBe(0);
  });
});
