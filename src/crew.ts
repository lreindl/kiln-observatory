// The crew on the floor: one station per routine, plus the owner's office and
// the Actions bay. Schedules mirror game-kiln's CLAUDE.md (UTC).

import type { Agent, Kind, PublicEvent } from "../shared/public";

export type Group = "sense" | "plan" | "build" | "owner" | "machine";

export interface Station {
  agent: Agent;
  name: string;
  group: Group;
  /** Floor position, in world units, around the Kiln at the origin. */
  x: number;
  z: number;
  /** Raised platforms (the owner's office). */
  y?: number;
}

export const STATIONS: Station[] = [
  { agent: "owner", name: "Owner", group: "owner", x: 0, z: -11, y: 1.6 },
  { agent: "analyst", name: "Analyst", group: "sense", x: -10, z: -5 },
  { agent: "ops", name: "Ops", group: "sense", x: -10.5, z: 1.5 },
  { agent: "growth", name: "Growth", group: "sense", x: 10.5, z: 1.5 },
  { agent: "quality", name: "Quality auditor", group: "sense", x: 10, z: -5 },
  { agent: "pm", name: "PM", group: "plan", x: -5, z: -8 },
  { agent: "digest", name: "Approval digest", group: "plan", x: 5, z: -8 },
  { agent: "implementer", name: "Implementer", group: "build", x: -6.5, z: 8 },
  { agent: "reviewer", name: "Reviewer", group: "build", x: 0, z: 10 },
  { agent: "release", name: "Release", group: "build", x: 6.5, z: 8 },
  { agent: "actions", name: "GitHub Actions", group: "machine", x: 0, z: 4.6 },
];

export const GROUP_COLOR: Record<Group, number> = {
  sense: 0x19e3ff,
  plan: 0xb46bff,
  build: 0xff2f92,
  owner: 0xffd166,
  machine: 0x4dffa6,
};

export const stationFor = (agent: Agent): Station =>
  STATIONS.find((s) => s.agent === agent) ?? STATIONS.find((s) => s.agent === "actions")!;

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
  "workflow.started": "started a release workflow",
  "workflow.finished": "release workflow finished",
};

const STAGE_TEXT = { ready: "ready for an agent", approval: "waiting for approval", ops: "ops", incident: "incident" } as const;

export function describe(e: PublicEvent): string {
  const who = e.actor === "agent" ? "An agent" : stationFor(e.actor).name;
  let what = VERB[e.kind];
  if (e.kind === "issue.labelled" && e.stage) what = `marked an issue ${STAGE_TEXT[e.stage]}`;
  if (e.kind === "workflow.finished") what = e.ok ? "release workflow succeeded" : "release workflow failed";
  return `${who} ${what}`;
}
