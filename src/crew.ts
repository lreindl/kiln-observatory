// The crew: one figure per routine plus the owner, in ring order. Schedules
// mirror game-kiln's CLAUDE.md routine table (UTC); keep them in step when a
// routine changes.

import type { Agent, Kind, PublicEvent } from "../shared/public";

export type CellId = "owner" | "design" | "analyst" | "verdicts" | "ops" | "growth" | "quality" | "pm" | "digest" | "implementer" | "reviewer" | "release";

export interface Cell {
  id: CellId;
  name: string;
  short: string;
  role: string;
  /** Run times, [hour, minute] UTC. */
  times: [number, number][];
  /** UTC days it runs (0 = Sunday); omitted means every day. */
  days?: number[];
}

// Ring order follows the work: the designer's ideas reach the analyst, findings,
// research and readings reach the PM, the PM readies work, the implementer builds,
// the reviewer checks and passes, release fires.
export const CELLS: Cell[] = [
  { id: "owner", name: "Owner", short: "Owner", role: "Sets direction, approves gated actions, merges the rules and the routines.", times: [] },
  { id: "release", name: "Release", short: "Release", role: "Decides when a game ships, fires the release and watches the week after.", times: [[16, 7]], days: [1, 2, 3, 4, 5] },
  { id: "growth", name: "Growth", short: "Growth", role: "Keeps each store listing sharp and drafts what the owner says in public.", times: [[14, 7]], days: [1, 4] },
  { id: "ops", name: "Ops", short: "Ops", role: "Reads each game's health report and turns problems into issues.", times: [[6, 7], [18, 7]] },
  { id: "quality", name: "Quality auditor", short: "Quality", role: "Reads every codebase whole each week and files what's worth fixing.", times: [[9, 7]], days: [0] },
  { id: "design", name: "Designer", short: "Designer", role: "Writes new game ideas and their prototypes, for the analyst to rank.", times: [[2, 7], [8, 7], [14, 7], [20, 7]] },
  { id: "analyst", name: "Analyst", short: "Analyst", role: "Answers one research question at a time, with sources from outside the studio.", times: [[11, 7]] },
  { id: "verdicts", name: "Verdicts analyst", short: "Verdicts", role: "Reads each game's own numbers and writes what they show: verdicts, retrospectives, readouts.", times: [[10, 7]] },
  { id: "pm", name: "PM", short: "PM", role: "Turns direction into the next work and readies it for the agents.", times: [[0, 7], [6, 7], [12, 7], [18, 7]] },
  { id: "implementer", name: "Implementer", short: "Implementer", role: "Turns one ready issue into one pull request.", times: Array.from({ length: 24 }, (_, h): [number, number] => [h, 7]) },
  { id: "reviewer", name: "Reviewer", short: "Reviewer", role: "Checks each pull request against the spec it claims to meet.", times: [[17, 7]] },
  { id: "digest", name: "Approval digest", short: "Digest", role: "Keeps the owner's one daily queue of everything waiting on them.", times: [[13, 7]] },
];

const RUN_WINDOW = 12 * 60_000;

/** Whether the routine is inside a scheduled run, and when it next runs. */
export function schedule(c: Cell, now = Date.now()): { running: boolean; next: number | null } {
  if (!c.times.length) return { running: false, next: null };
  let next: number | null = null;
  let running = false;
  const d0 = new Date(now);
  const day0 = Date.UTC(d0.getUTCFullYear(), d0.getUTCMonth(), d0.getUTCDate());
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

/** Which figure an event belongs to. Actions' checks land with the implementer; release workflows with Release. */
export function cellFor(e: PublicEvent): CellId | null {
  if (e.actor === "actions") return e.kind.startsWith("workflow") ? "release" : "implementer";
  if (e.actor === "agent") return null;
  return e.actor as CellId;
}

/** Where a piece of work goes next, for the packet that carries it across the studio. */
export function flow(e: PublicEvent): [CellId | "core", CellId | "core"] {
  const from = cellFor(e) ?? "core";
  if (e.kind === "issue.labelled" && e.stage === "ready") return ["pm", "implementer"];
  if (e.stage === "approval") return [from, "digest"];
  if (e.kind === "issue.opened" && ["ops", "quality", "analyst", "verdicts", "growth"].includes(from)) return [from, "pm"];
  if (e.kind === "issue.opened" && from === "design") return ["design", "analyst"];
  if (e.kind === "pr.opened" || e.kind === "pr.updated") return [from, "reviewer"];
  if (e.kind === "pr.reviewed") return ["reviewer", "core"];
  if (e.kind === "pr.merged") return [from, "release"];
  if (e.kind.startsWith("check")) return ["core", "implementer"];
  if (e.kind.startsWith("workflow")) return ["release", "core"];
  if (from === "digest") return ["digest", "owner"];
  return [from, "core"];
}

const VERB: Record<Kind, string> = {
  "issue.opened": "Opened an issue",
  "issue.labelled": "Labelled an issue",
  "issue.closed": "Closed an issue",
  "pr.opened": "Opened a pull request",
  "pr.updated": "Pushed to a pull request",
  "pr.reviewed": "Reviewed a pull request",
  "pr.merged": "Merged a pull request",
  "pr.closed": "Closed a pull request",
  "check.passed": "Checks passed",
  "check.failed": "Checks failed",
  "workflow.started": "Started a release",
  "workflow.finished": "Finished a release",
};
const STAGE_TEXT = { ready: "ready for an agent", approval: "for the owner's approval", ops: "for ops", incident: "as an incident" } as const;

export function describe(e: PublicEvent): string {
  if (e.kind === "issue.labelled" && e.stage) return `Marked an issue ${STAGE_TEXT[e.stage]}`;
  if (e.kind === "workflow.finished") return e.ok ? "Release succeeded" : "Release failed";
  return VERB[e.kind];
}

/** How an event is drawn in an agent's history: bigger and brighter for bigger moments. */
export function weight(e: PublicEvent): { size: number; alpha: number; label: string } {
  if (e.ok === false || e.kind === "check.failed") return { size: 1, alpha: 0.45, label: "a failure" };
  if (e.kind === "pr.merged" || e.kind === "workflow.finished" || e.kind === "pr.opened") return { size: 2.3, alpha: 1, label: "a pull request, merge or release" };
  if (e.kind === "issue.opened" || e.kind === "pr.reviewed" || e.kind === "workflow.started") return { size: 1.7, alpha: 0.95, label: "an issue or review" };
  return { size: 1.1, alpha: 0.7, label: "a label, push or close" };
}
