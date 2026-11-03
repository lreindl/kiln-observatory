// The services the studio runs, checked from outside every five minutes (the
// cron in wrangler.jsonc). Each check asks what a player's request would: does
// the page or API answer with a success? A service with several parts is up
// when all answer, down when none do, and degraded in between.
//
// The URLs mirror each game's kiln.yaml (`site`, and the production `api`).
// They stay in the Worker: only the outcome is public (game-kiln ADR-0025),
// plus the site's address, which players already know, as a link.
//
// The games with a repo of their own are listed here. The sketches come from
// game-kiln's games.yaml (one copy of each fact), so a launched sketch shows
// without a change here; sketch launches are approved as a kind, by name
// (game-kiln#115).

import { GAME_LABEL, type Service, type ServiceDay, type ServiceState } from "../shared/public";

export interface ServiceSpec {
  id: string;
  /** Public name; naming a game here is the owner's call (ADR-0025, amended 2026-10-14). */
  name: string;
  /** The public site the name links to: an origin, nothing after the slash. */
  site: string;
  /** Every URL that must answer for the service to be up. */
  checks: string[];
}

export const GAMES: ServiceSpec[] = [
  {
    // The id stays "pinhigh" so the stored checks keep their history.
    id: "pinhigh",
    name: "Hole High",
    site: "https://pinhigh.fun/",
    // The site, and today's Daily from the production API: what a player needs to play.
    checks: ["https://pinhigh.fun/", "https://pinhigh-api-production.lreindl01.workers.dev/daily"],
  },
  {
    id: "d2factory",
    name: "D2 Factory",
    site: "https://d2factory.gamekiln.dev/",
    checks: ["https://d2factory.gamekiln.dev/"],
  },
];

/** The public contract takes at most this many services (`isServices`). */
const MAX_SERVICES = 12;
const SKETCH_ID = /^[a-z0-9][a-z0-9-]{0,39}$/;

export interface GameEntry { id?: string; name?: string; repo?: string; path?: string }

/**
 * The sketches in games.yaml (the entries with a `path` in the sketches repo),
 * each checked at <id>.gamekiln.dev: a sketch's subdomain is its id. Each shows
 * its name before any subtitle ("Pact: Daily Diplomacy" is "Pact"), which fits
 * the row. In games.yaml order, keeping the newest when there are more than the
 * contract takes.
 */
export function sketchServices(games: GameEntry[]): ServiceSpec[] {
  const out: ServiceSpec[] = [];
  for (const g of games) {
    const name = g.name?.split(":")[0].trim();
    if (!g.path || !g.id || !SKETCH_ID.test(g.id) || !name || !GAME_LABEL.test(name)) continue;
    const site = `https://${g.id}.gamekiln.dev/`;
    out.push({ id: g.id, name, site, checks: [site] });
  }
  return out.slice(-(MAX_SERVICES - GAMES.length));
}

/**
 * A sketch is in games.yaml from the day it's started, but its address answers
 * only once it launches, so a sketch shows after a check has found it answering.
 * The games always show.
 */
export function shown(specs: ServiceSpec[], rows: CheckRow[]): ServiceSpec[] {
  const answered = new Set(rows.filter((r) => r.state !== "down").map((r) => r.service));
  return specs.filter((s) => GAMES.some((g) => g.id === s.id) || answered.has(s.id));
}

const TIMEOUT = 10_000;
const DAY = 86_400_000;

/** One request: up if it answers with a 2xx (after redirects) within the timeout. */
export async function probe(url: string, fetcher: typeof fetch = fetch): Promise<boolean> {
  try {
    const res = await fetcher(url, { signal: AbortSignal.timeout(TIMEOUT), headers: { "User-Agent": "kiln-observatory uptime" }, cf: { cacheTtl: 0 } } as RequestInit);
    await res.body?.cancel();
    return res.ok;
  } catch {
    return false;
  }
}

export function combine(parts: boolean[]): ServiceState {
  const up = parts.filter(Boolean).length;
  return up === parts.length ? "up" : up === 0 ? "down" : "degraded";
}

export interface CheckRow { service: string; at: string; state: ServiceState }

/** Builds the public view from stored checks: the latest state and one entry per UTC day with checks. */
export function summarize(specs: ServiceSpec[], rows: CheckRow[], now: number, days: number): Service[] {
  const since = new Date(now - days * DAY).toISOString().slice(0, 10);
  return specs.map((spec) => {
    const mine = rows.filter((r) => r.service === spec.id).sort((a, b) => a.at.localeCompare(b.at));
    const byDay = new Map<string, ServiceDay>();
    for (const r of mine) {
      const day = r.at.slice(0, 10);
      if (day < since) continue;
      const d = byDay.get(day) ?? { day, checks: 0, up: 0, degraded: 0 };
      d.checks++;
      if (r.state === "up") d.up++;
      if (r.state === "degraded") d.degraded++;
      byDay.set(day, d);
    }
    const last = mine[mine.length - 1];
    return { id: spec.id, name: spec.name, site: spec.site, state: last?.state ?? null, checkedAt: last?.at ?? null, days: [...byDay.values()] };
  });
}
