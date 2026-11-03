// The services contract (game-kiln ADR-0025): only each service's state, its
// days of check counts and its public site leave the Worker. No checked URL,
// status code or timing.

import { describe, expect, it } from "vitest";
import { isService, isServices, type Service } from "../shared/public";
import { uptimeDots } from "../src/levels";
import { GAMES, combine, probe, shown, sketchServices, summarize, type CheckRow, type GameEntry } from "../worker/services";

const NOW = Date.parse("2026-10-14T12:00:00Z");
const good: Service = { id: "pinhigh", name: "Hole High", site: "https://pinhigh.fun/", state: "up", checkedAt: "2026-10-14T11:55:00.000Z", days: [{ day: "2026-10-14", checks: 144, up: 140, degraded: 2 }] };

describe("the services contract", () => {
  it("accepts a well-formed service", () => {
    expect(isService(good)).toBe(true);
    expect(isServices([good, { ...good, id: "d2factory", name: "D2 Factory", site: "https://d2factory.gamekiln.dev/", state: null, checkedAt: null, days: [] }])).toBe(true);
  });

  it("takes a site only as a bare https origin", () => {
    expect(isService({ ...good, site: "https://pinhigh-api-production.lreindl01.workers.dev/daily" })).toBe(false);
    expect(isService({ ...good, site: "http://pinhigh.fun/" })).toBe(false);
    expect(isService({ ...good, site: "javascript:alert(1)//" })).toBe(false);
    expect(isService({ ...good, site: "https://pinhigh.fun/?ref=x" })).toBe(false);
    expect(isService({ ...good, site: "https://localhost/" })).toBe(false);
    const { site: _, ...noSite } = good;
    expect(isService(noSite)).toBe(false);
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
    const all = [...GAMES, ...sketchServices(GAMES_YAML)];
    for (const s of summarize(all, [], NOW, 90)) expect(isService(s)).toBe(true);
    expect(GAMES.map((s) => s.name)).toEqual(["Hole High", "D2 Factory"]);
    // Each link is a site the Worker already checks, never the API.
    for (const s of all) expect(s.checks).toContain(s.site);
  });
});

// The shape of game-kiln's games.yaml: games with a repo of their own, and sketches with a path in the sketches repo.
const GAMES_YAML: GameEntry[] = [
  { id: "pinhigh", name: "Pin High: Daily Golf", repo: "lreindl/pinhigh" },
  { id: "d2factory", name: "D2 Factory", repo: "lreindl/d2factory" },
  { id: "pact", name: "Pact: Daily Diplomacy", repo: "lreindl/kiln-sketches", path: "sketches/pact" },
  { id: "brick-breaker", name: "Brick Breaker", repo: "lreindl/kiln-sketches", path: "sketches/brick-breaker" },
];

describe("the sketches from games.yaml", () => {
  it("checks each sketch at its own subdomain, under its name without the subtitle", () => {
    expect(sketchServices(GAMES_YAML)).toEqual([
      { id: "pact", name: "Pact", site: "https://pact.gamekiln.dev/", checks: ["https://pact.gamekiln.dev/"] },
      { id: "brick-breaker", name: "Brick Breaker", site: "https://brick-breaker.gamekiln.dev/", checks: ["https://brick-breaker.gamekiln.dev/"] },
    ]);
  });

  it("skips an entry whose id or name couldn't be a public label or a subdomain", () => {
    const sketch = { repo: "lreindl/kiln-sketches", path: "sketches/x" };
    expect(sketchServices([
      { ...sketch, id: "evil.example.com/x", name: "Evil" },
      { ...sketch, id: "Caps", name: "Caps" },
      { ...sketch, id: "tagged", name: "<script>alert(1)</script>" },
      { ...sketch, id: "nameless" },
    ])).toEqual([]);
  });

  it("keeps the newest sketches when there are more than the contract takes", () => {
    const many = Array.from({ length: 15 }, (_, i) => ({ id: `s${i}`, name: `S${i}`, repo: "lreindl/kiln-sketches", path: `sketches/s${i}` }));
    const specs = sketchServices(many);
    expect(specs.map((s) => s.id)).toEqual(many.slice(5).map((g) => g.id));
    expect(isServices(summarize([...GAMES, ...specs], [], NOW, 90))).toBe(true);
  });

  it("shows a sketch only once its site has answered; the games always", () => {
    const specs = [...GAMES, ...sketchServices(GAMES_YAML)];
    const rows: CheckRow[] = [
      { service: "pact", at: "2026-10-14T00:00:00.000Z", state: "down" },
      { service: "pact", at: "2026-10-14T00:05:00.000Z", state: "up" },
      { service: "brick-breaker", at: "2026-10-14T00:05:00.000Z", state: "down" },
    ];
    expect(shown(specs, rows).map((s) => s.id)).toEqual(["pinhigh", "d2factory", "pact"]);
    expect(shown(specs, []).map((s) => s.id)).toEqual(["pinhigh", "d2factory"]);
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
    const [pin, d2] = summarize(GAMES, rows, NOW, 90);
    expect(pin.state).toBe("up");
    expect(pin.checkedAt).toBe("2026-10-14T00:10:00.000Z");
    expect(pin.days).toEqual([
      { day: "2026-10-13", checks: 1, up: 1, degraded: 0 },
      { day: "2026-10-14", checks: 3, up: 1, degraded: 1 },
    ]);
    expect(d2).toEqual({ id: "d2factory", name: "D2 Factory", site: "https://d2factory.gamekiln.dev/", state: null, checkedAt: null, days: [] });
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
