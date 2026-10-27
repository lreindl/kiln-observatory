// Plausible history for when no studio is reachable (local dev). The page
// labels it "demo data"; it is never mixed with real history.

import type { Kind, PublicEvent, Service } from "../shared/public";
import { CELLS, type CellId } from "./crew";
import { HISTORY_START } from "./levels";

const KINDS: Partial<Record<CellId, Kind[]>> = {
  owner: ["pr.merged", "pr.merged", "issue.closed"],
  release: ["workflow.started", "workflow.finished"],
  growth: ["issue.opened", "pr.opened"],
  ops: ["issue.opened", "issue.labelled"],
  quality: ["issue.opened", "issue.opened", "issue.opened"],
  design: ["issue.closed"],
  analyst: ["pr.opened", "issue.closed"],
  verdicts: ["pr.opened", "issue.closed"],
  pm: ["issue.labelled", "issue.labelled", "issue.opened"],
  implementer: ["pr.opened", "pr.updated", "pr.updated"],
  reviewer: ["pr.reviewed", "pr.reviewed"],
  digest: ["issue.labelled"],
};

export function demoHistory(now: number): PublicEvent[] {
  let seed = 7;
  const rnd = () => ((seed = (seed * 1664525 + 1013904223) >>> 0) / 4294967296);
  const out: PublicEvent[] = [];
  for (let day = HISTORY_START; day < now; day += 86_400_000) {
    for (const c of CELLS) {
      const times = c.times.length ? c.times : [[2 + Math.floor(rnd() * 20), 30] as [number, number]];
      if (c.days && !c.days.includes(new Date(day).getUTCDay())) continue;
      for (const [h, m] of times) {
        for (const kind of KINDS[c.id] ?? []) {
          if (rnd() < 0.35) continue;
          const at = day + (h * 60 + m + Math.floor(rnd() * 40)) * 60_000;
          if (at > now) continue;
          out.push({ kind, actor: c.id, game: rnd() < 0.7 ? "factory" : "game-1", at: new Date(at).toISOString(), ...(kind === "workflow.finished" ? { ok: rnd() > 0.15 } : {}), ...(kind === "issue.labelled" ? { stage: c.id === "pm" ? "ready" : "approval" } : {}) } as PublicEvent);
        }
      }
    }
  }
  return out.sort((a, b) => b.at.localeCompare(a.at));
}

/** Plausible uptime: mostly clean days, a couple with an outage. */
export function demoServices(now: number): Service[] {
  const day = (ago: number) => new Date(now - ago * 86_400_000).toISOString().slice(0, 10);
  const make = (id: string, name: string, site: string, bad: Record<number, [number, number]>, since: number): Service => ({
    id, name, site, state: "up", checkedAt: new Date(now - 90_000).toISOString(),
    days: Array.from({ length: since }, (_, i) => since - 1 - i).map((ago) => {
      const checks = ago === 0 ? Math.floor(((now % 86_400_000) / 86_400_000) * 288) || 1 : 288;
      const [down, degraded] = bad[ago] ?? [0, 0];
      return { day: day(ago), checks, up: checks - down - degraded, degraded };
    }),
  });
  return [
    make("pinhigh", "Hole High", "https://pinhigh.fun/", { 4: [6, 0], 11: [0, 9] }, 30),
    make("d2factory", "D2 Factory", "https://d2factory.gamekiln.dev/", { 1: [40, 0] }, 2),
    make("pact", "Pact", "https://pact.gamekiln.dev/", {}, 1),
    make("brick-breaker", "Brick Breaker", "https://brick-breaker.gamekiln.dev/", {}, 1),
  ];
}
