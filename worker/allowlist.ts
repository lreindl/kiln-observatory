// Maps a GitHub webhook to a PublicEvent (game-kiln ADR-0025). It reads only
// the fields it needs and builds the event from scratch; nothing from the
// payload is copied through, so titles, bodies and numbers can't leak.

import { FUNCTIONS, isPublicEvent, type Agent, type Fn, type Kind, type PublicEvent, type Stage } from "../shared/public";

export interface MapContext {
  /** Covered repos ("owner/name") to their public game label. Others are dropped. */
  games: Map<string, string>;
  /** HMAC key for opaque item ids. */
  itemKey: CryptoKey;
}

const OWNER = "lreindl";
const AGENT = "gk-agent";

const STAGE_FOR_LABEL: Record<string, Stage> = {
  "ready-for-agent": "ready",
  approval: "approval",
  ops: "ops",
  incident: "incident",
};

/** Which routine acted, from the actor and the routine conventions (branch prefixes, labels). */
export function routineFor(actor: string, hints: { kind: Kind; branch?: string; labels?: string[]; label?: string }): Agent {
  if (actor === OWNER) return "owner";
  if (actor !== AGENT) return actor.endsWith("[bot]") ? "actions" : "agent";
  const { kind, branch = "", labels = [], label } = hints;
  if (kind === "pr.reviewed") return "reviewer";
  if (branch.startsWith("claude/research-")) return "analyst";
  if (branch.startsWith("claude/growth-")) return "growth";
  if (branch.startsWith("claude/pm-")) return "pm";
  if (branch.startsWith("claude/release-")) return "release";
  if (/^claude\/\d+-/.test(branch)) return "implementer";
  if (label === "ready-for-agent") return "pm";
  if (labels.includes("digest")) return "digest";
  if (labels.includes("fn:quality")) return "quality";
  if (labels.includes("incident")) return "release";
  if (labels.includes("ops")) return "ops";
  if (labels.includes("fn:growth")) return "growth";
  if (labels.includes("fn:analyst")) return "analyst";
  if (labels.includes("ready-for-agent")) return "pm";
  return "agent";
}

export async function itemId(key: CryptoKey, repo: string, number: number): Promise<string> {
  const mac = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(`${repo}#${number}`));
  return [...new Uint8Array(mac).slice(0, 6)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

export function itemKey(secret: string): Promise<CryptoKey> {
  return crypto.subtle.importKey("raw", new TextEncoder().encode(`${secret}:item-id`), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
}

const str = (v: unknown): string => (typeof v === "string" ? v : "");
const labelNames = (labels: unknown): string[] =>
  Array.isArray(labels) ? labels.map((l) => str((l as { name?: unknown })?.name)).filter(Boolean) : [];
const fnOf = (labels: string[]): Fn | undefined =>
  labels.map((l) => l.replace(/^fn:/, "")).find((l): l is Fn => (FUNCTIONS as readonly string[]).includes(l));
const iso = (v: unknown): string => {
  const d = new Date(str(v) || Date.now());
  return (isNaN(+d) ? new Date() : d).toISOString();
};

/** Returns the public event for a webhook, or null if it isn't one the Observatory shows. */
export async function toPublicEvent(name: string, p: any, ctx: MapContext): Promise<PublicEvent | null> {
  const repo = str(p?.repository?.full_name);
  const game = ctx.games.get(repo);
  if (!game) return null;
  const sender = str(p?.sender?.login);
  let event: PublicEvent | null = null;

  if (name === "issues") {
    const labels = labelNames(p.issue?.labels);
    const base = { game, fn: fnOf(labels), item: await itemId(ctx.itemKey, repo, Number(p.issue?.number)), at: iso(p.issue?.updated_at) };
    if (p.action === "opened" || p.action === "closed") {
      const kind: Kind = p.action === "opened" ? "issue.opened" : "issue.closed";
      const stage = labels.map((l) => STAGE_FOR_LABEL[l]).find(Boolean);
      event = { kind, actor: routineFor(sender, { kind, labels }), ...base, stage };
    } else if (p.action === "labeled") {
      const label = str(p.label?.name);
      const stage = STAGE_FOR_LABEL[label];
      if (!stage) return null;
      event = { kind: "issue.labelled", actor: routineFor(sender, { kind: "issue.labelled", labels, label }), ...base, stage };
    }
  } else if (name === "pull_request") {
    const pr = p.pull_request;
    const branch = str(pr?.head?.ref);
    const kind: Kind | undefined =
      p.action === "opened" ? "pr.opened"
      : p.action === "synchronize" ? "pr.updated"
      : p.action === "closed" ? (pr?.merged ? "pr.merged" : "pr.closed")
      : undefined;
    if (!kind) return null;
    // A merge is the owner's act; the PR's branch says whose work it was.
    const actor = kind === "pr.merged" ? "owner" : routineFor(sender, { kind, branch, labels: labelNames(pr?.labels) });
    event = { kind, actor, game, fn: fnOf(labelNames(pr?.labels)), item: await itemId(ctx.itemKey, repo, Number(pr?.number)), at: iso(pr?.updated_at) };
  } else if (name === "pull_request_review" && p.action === "submitted") {
    const actor = routineFor(str(p.review?.user?.login) || sender, { kind: "pr.reviewed" });
    event = { kind: "pr.reviewed", actor, game, item: await itemId(ctx.itemKey, repo, Number(p.pull_request?.number)), at: iso(p.review?.submitted_at) };
  } else if (name === "check_suite" && p.action === "completed") {
    const ok = p.check_suite?.conclusion === "success";
    const prNumber = p.check_suite?.pull_requests?.[0]?.number;
    event = {
      kind: ok ? "check.passed" : "check.failed", actor: "actions", game, ok, at: iso(p.check_suite?.updated_at),
      ...(Number.isInteger(prNumber) ? { item: await itemId(ctx.itemKey, repo, prNumber) } : {}),
    };
  } else if (name === "workflow_run" && p.workflow_run?.event === "workflow_dispatch") {
    // Dispatched workflows are releases and rollbacks started by the Release routine (ADR-0019); CI shows up as check_suite.
    const run = p.workflow_run;
    const actor = routineFor(str(run?.triggering_actor?.login) || sender, { kind: "workflow.started", branch: "claude/release-" });
    if (p.action === "requested") event = { kind: "workflow.started", actor, game, at: iso(run?.created_at) };
    if (p.action === "completed") event = { kind: "workflow.finished", actor, game, ok: run?.conclusion === "success", at: iso(run?.updated_at) };
  }

  if (!event) return null;
  for (const k of Object.keys(event) as (keyof PublicEvent)[]) if (event[k] === undefined) delete event[k];
  return isPublicEvent(event) ? event : null;
}
