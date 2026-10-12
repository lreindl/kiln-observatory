// The public contract (game-kiln ADR-0025). Nothing leaves the Worker except
// these shapes, and isPublicEvent() is the gate: an event with any other key,
// or a value outside its allowed set, is dropped.

export const AGENTS = [
  "owner", "analyst", "ops", "growth", "quality", "pm",
  "implementer", "reviewer", "release", "digest", "actions", "agent",
] as const;
export type Agent = (typeof AGENTS)[number];

export const KINDS = [
  "issue.opened", "issue.labelled", "issue.closed",
  "pr.opened", "pr.updated", "pr.reviewed", "pr.merged", "pr.closed",
  "check.passed", "check.failed",
  "workflow.started", "workflow.finished",
] as const;
export type Kind = (typeof KINDS)[number];

/** The `fn:` labels, without the prefix. */
export const FUNCTIONS = ["engineering", "ops", "analyst", "pm", "growth", "quality"] as const;
export type Fn = (typeof FUNCTIONS)[number];

/** Labels that mark where an item is: ready-for-agent, approval, ops, incident. */
export const STAGES = ["ready", "approval", "ops", "incident"] as const;
export type Stage = (typeof STAGES)[number];

export interface PublicEvent {
  kind: Kind;
  actor: Agent;
  /** "factory", "game-N", or a game's name once its store listing is public. */
  game: string;
  /** ISO time the event happened. */
  at: string;
  fn?: Fn;
  stage?: Stage;
  /** Opaque id for the issue or PR, stable across its events. */
  item?: string;
  /** Outcome of a check or workflow. */
  ok?: boolean;
}

export interface Counts {
  ready: number;
  openPRs: number;
  approvals: number;
}

export interface Snapshot {
  counts: Counts | null;
  recent: PublicEvent[];
  games: string[];
  updatedAt: string | null;
}

export type ServerMessage =
  | { type: "snapshot"; snapshot: Snapshot }
  | { type: "event"; event: PublicEvent }
  | { type: "counts"; counts: Counts };

export const GAME_LABEL = /^(factory|game-\d{1,3}|[A-Za-z0-9][A-Za-z0-9 :'&!.-]{0,39})$/;
const ITEM = /^[0-9a-f]{12}$/;
const ISO = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d{3})?Z$/;

const REQUIRED = ["kind", "actor", "game", "at"] as const;
const OPTIONAL = ["fn", "stage", "item", "ok"] as const;
export const EVENT_KEYS: readonly string[] = [...REQUIRED, ...OPTIONAL];

const oneOf = <T extends string>(list: readonly T[], v: unknown): v is T =>
  typeof v === "string" && (list as readonly string[]).includes(v);

export function isPublicEvent(e: unknown): e is PublicEvent {
  if (typeof e !== "object" || e === null || Array.isArray(e)) return false;
  const o = e as Record<string, unknown>;
  if (Object.keys(o).some((k) => !EVENT_KEYS.includes(k))) return false;
  if (!oneOf(KINDS, o.kind) || !oneOf(AGENTS, o.actor)) return false;
  if (typeof o.game !== "string" || !GAME_LABEL.test(o.game)) return false;
  if (typeof o.at !== "string" || !ISO.test(o.at)) return false;
  if ("fn" in o && !oneOf(FUNCTIONS, o.fn)) return false;
  if ("stage" in o && !oneOf(STAGES, o.stage)) return false;
  if ("item" in o && (typeof o.item !== "string" || !ITEM.test(o.item))) return false;
  if ("ok" in o && typeof o.ok !== "boolean") return false;
  return true;
}

export function isCounts(c: unknown): c is Counts {
  if (typeof c !== "object" || c === null) return false;
  const o = c as Record<string, unknown>;
  const keys = Object.keys(o);
  return keys.length === 3 && ["ready", "openPRs", "approvals"].every((k) => Number.isInteger(o[k]) && (o[k] as number) >= 0);
}
