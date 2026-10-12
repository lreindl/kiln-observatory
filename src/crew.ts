// The crew: one cell per routine plus the owner. Schedules mirror game-kiln's
// CLAUDE.md routine table (UTC); keep them in step when a routine changes.

import type { Agent, Kind, PublicEvent } from "../shared/public";

export type CellId = "owner" | "analyst" | "ops" | "growth" | "quality" | "pm" | "digest" | "implementer" | "reviewer" | "release";

export interface Cell {
  id: CellId;
  name: string;
  role: string;
  accent: string;
  /** Run times, [hour, minute] UTC. */
  times: [number, number][];
  /** UTC days it runs (0 = Sunday); omitted means every day. */
  days?: number[];
}

export const CELLS: Cell[] = [
  { id: "owner", name: "Owner", role: "Direction, merges, approvals", accent: "#ffd166", times: [] },
  { id: "analyst", name: "Analyst", role: "Researches with evidence", accent: "#f2b35b", times: [[11, 7]] },
  { id: "ops", name: "Ops", role: "Watches each game's health", accent: "#3fa9ff", times: [[6, 7], [18, 7]] },
  { id: "growth", name: "Growth", role: "Store listing, public drafts", accent: "#ff7ab8", times: [[14, 7]], days: [1, 4] },
  { id: "quality", name: "Quality auditor", role: "Files code-quality findings", accent: "#9fe8ff", times: [[9, 7]], days: [0] },
  { id: "pm", name: "PM", role: "Turns direction into next work", accent: "#b48cff", times: [[12, 7]] },
  { id: "digest", name: "Approval digest", role: "The owner's one queue", accent: "#e0a060", times: [[13, 7]] },
  { id: "implementer", name: "Implementer", role: "Turns an issue into a PR", accent: "#ffb020", times: [[3, 7], [9, 7], [15, 7], [21, 7]] },
  { id: "reviewer", name: "Reviewer", role: "Checks each PR against its spec", accent: "#e8e2d0", times: [[17, 7]] },
  { id: "release", name: "Release", role: "Fires releases in the Kiln", accent: "#ff6a1a", times: [[16, 7]], days: [1, 2, 3, 4, 5] },
];

/** Cells that take extra room when the grid doesn't divide evenly, in order. */
export const ROOMY: CellId[] = ["owner", "implementer", "pm", "release", "analyst"];

const RUN_WINDOW = 12 * 60_000;

/** Whether the routine is inside a scheduled run, and when it next runs. */
export function schedule(c: Cell, now = Date.now()): { running: boolean; next: number | null } {
  if (!c.times.length) return { running: false, next: null };
  let next: number | null = null;
  let running = false;
  const day0 = Date.UTC(new Date(now).getUTCFullYear(), new Date(now).getUTCMonth(), new Date(now).getUTCDate());
  for (let d = -1; d < 8; d++) {
    const day = day0 + d * 86_400_000;
    if (c.days && !c.days.includes(new Date(day).getUTCDay())) continue;
    for (const [h, m] of c.times) {
      const at = day + (h * 60 + m) * 60_000;
      if (at <= now && now < at + RUN_WINDOW) running = true;
      if (at > now && (next === null || at < next)) next = at;
    }
  }
  return { running, next };
}

/** Which cell shows an event. Actions' checks land on the implementer's bench; release workflows in the Kiln. */
export function cellFor(e: PublicEvent): CellId | null {
  const byActor: Partial<Record<Agent, CellId>> = {
    owner: "owner", analyst: "analyst", ops: "ops", growth: "growth", quality: "quality", pm: "pm",
    digest: "digest", implementer: "implementer", reviewer: "reviewer", release: "release",
  };
  if (e.actor === "actions") return e.kind.startsWith("workflow") ? "release" : "implementer";
  return byActor[e.actor] ?? null;
}

const VERB: Record<Kind, string> = {
  "issue.opened": "opened an issue",
  "issue.labelled": "labelled an issue",
  "issue.closed": "closed an issue",
  "pr.opened": "opened a pull request",
  "pr.updated": "pushed to a pull request",
  "pr.reviewed": "reviewed a pull request",
  "pr.merged": "merged a pull request",
  "pr.closed": "closed a pull request",
  "check.passed": "checks passed",
  "check.failed": "checks failed",
  "workflow.started": "started a release",
  "workflow.finished": "finished a release",
};
const STAGE_TEXT = { ready: "ready for an agent", approval: "waiting for approval", ops: "for ops", incident: "as an incident" } as const;

export function describe(e: PublicEvent): string {
  if (e.kind === "issue.labelled" && e.stage) return `marked an issue ${STAGE_TEXT[e.stage]}`;
  if (e.kind === "workflow.finished") return e.ok ? "release succeeded" : "release failed";
  return VERB[e.kind];
}
