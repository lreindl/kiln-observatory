// The allowlist is the public contract (game-kiln ADR-0025): these tests feed it
// payloads full of private text and check none of it comes out.

import { describe, expect, it } from "vitest";
import { EVENT_KEYS, isPublicEvent } from "../shared/public";
import { itemKey, routineFor, toPublicEvent, type MapContext } from "../worker/allowlist";

const SECRET_TEXT = "TOP-SECRET unreleased feature: Horde Royale pricing";
const games = new Map([["lreindl/game-kiln", "factory"], ["lreindl/pinhigh", "game-1"]]);
const ctx = async (): Promise<MapContext> => ({ games, itemKey: await itemKey("test-secret") });

const repo = (name = "lreindl/pinhigh") => ({ full_name: name, name: name.split("/")[1], private: true, html_url: `https://github.com/${name}` });
const label = (name: string) => ({ name, description: SECRET_TEXT });

const PAYLOADS: [string, unknown][] = [
  ["issues", { action: "opened", sender: { login: "gk-agent" }, repository: repo(), issue: { number: 42, title: SECRET_TEXT, body: SECRET_TEXT, html_url: "https://github.com/lreindl/pinhigh/issues/42", labels: [label("ops")], updated_at: "2026-10-12T15:07:00Z" } }],
  ["issues", { action: "labeled", sender: { login: "gk-agent" }, repository: repo(), label: label("ready-for-agent"), issue: { number: 43, title: SECRET_TEXT, labels: [label("ready-for-agent"), label("fn:engineering")], updated_at: "2026-10-12T12:07:00Z" } }],
  ["pull_request", { action: "opened", sender: { login: "gk-agent" }, repository: repo(), pull_request: { number: 44, title: SECRET_TEXT, body: SECRET_TEXT, head: { ref: "claude/43-secret-branch-name" }, labels: [], updated_at: "2026-10-12T15:30:00Z" } }],
  ["pull_request", { action: "closed", sender: { login: "lreindl" }, repository: repo("lreindl/game-kiln"), pull_request: { number: 45, title: SECRET_TEXT, merged: true, head: { ref: "claude/research-12-secret" }, labels: [], updated_at: "2026-10-12T18:00:00Z" } }],
  ["pull_request_review", { action: "submitted", sender: { login: "gk-agent" }, repository: repo(), review: { user: { login: "gk-agent" }, body: `Spec review: changes needed. ${SECRET_TEXT}`, submitted_at: "2026-10-12T17:10:00Z" }, pull_request: { number: 44, title: SECRET_TEXT } }],
  ["check_suite", { action: "completed", sender: { login: "github-actions[bot]" }, repository: repo(), check_suite: { conclusion: "failure", head_branch: "claude/43-secret-branch-name", head_commit: { message: SECRET_TEXT }, pull_requests: [{ number: 44 }], updated_at: "2026-10-12T15:35:00Z" } }],
  ["workflow_run", { action: "completed", sender: { login: "gk-agent" }, repository: repo(), workflow_run: { event: "workflow_dispatch", name: SECRET_TEXT, conclusion: "success", triggering_actor: { login: "gk-agent" }, head_commit: { message: SECRET_TEXT }, updated_at: "2026-10-12T16:30:00Z" } }],
  ["pull_request", { action: "opened", sender: { login: "gk-agent" }, repository: repo("lreindl/game-kiln"), pull_request: { number: 46, title: `Verdict: ${SECRET_TEXT}`, body: SECRET_TEXT, head: { ref: "claude/verdicts-46-secret-sketch" }, labels: [label("fn:verdicts")], updated_at: "2026-10-22T10:20:00Z" } }],
  ["pull_request", { action: "closed", sender: { login: "gk-spec-approver[bot]" }, repository: repo(), pull_request: { number: 48, title: SECRET_TEXT, merged: true, merged_by: { login: "gk-spec-approver[bot]", name: SECRET_TEXT }, head: { ref: "claude/43-secret-branch-name" }, labels: [], updated_at: "2026-10-27T18:00:00Z" } }],
  ["issues", { action: "opened", sender: { login: "gk-agent" }, repository: repo("lreindl/game-kiln"), issue: { number: 47, title: `Idea brief: ${SECRET_TEXT}`, body: SECRET_TEXT, labels: [label("fn:design"), label("ready-for-agent")], updated_at: "2026-10-22T12:10:00Z" } }],
];

describe("toPublicEvent", () => {
  it.each(PAYLOADS)("keeps %s events to the allowlist", async (name, payload) => {
    const event = await toPublicEvent(name, payload, await ctx());
    expect(event).not.toBeNull();
    expect(isPublicEvent(event)).toBe(true);
    for (const key of Object.keys(event!)) expect(EVENT_KEYS).toContain(key);
    const text = JSON.stringify(event);
    for (const leak of ["SECRET", "Horde", "secret-branch", "github.com", "\"42\"", "#4", "pinhigh"]) expect(text).not.toContain(leak);
  });

  it("names who acted from the routine conventions", async () => {
    const out = await Promise.all(PAYLOADS.map(async ([n, p]) => (await toPublicEvent(n, p, await ctx()))!.actor));
    expect(out).toEqual(["ops", "pm", "implementer", "owner", "reviewer", "actions", "release", "verdicts", "reviewer", "design"]);
  });

  it("drops repos it doesn't cover, such as kiln-ideas", async () => {
    const [name, payload] = PAYLOADS[0];
    expect(await toPublicEvent(name, { ...(payload as object), repository: repo("lreindl/kiln-ideas") }, await ctx())).toBeNull();
  });

  it("drops labels that aren't a stage", async () => {
    const p = { action: "labeled", sender: { login: "gk-agent" }, repository: repo(), label: label("needs-decision"), issue: { number: 1, labels: [] } };
    expect(await toPublicEvent("issues", p, await ctx())).toBeNull();
  });

  it("gives an issue the same opaque id on every event", async () => {
    const c = await ctx();
    const a = await toPublicEvent("issues", { action: "opened", sender: { login: "gk-agent" }, repository: repo(), issue: { number: 7, labels: [] } }, c);
    const b = await toPublicEvent("issues", { action: "closed", sender: { login: "lreindl" }, repository: repo(), issue: { number: 7, labels: [] } }, c);
    expect(a!.item).toMatch(/^[0-9a-f]{12}$/);
    expect(a!.item).toBe(b!.item);
  });
});

describe("isPublicEvent", () => {
  const ok = { kind: "pr.opened", actor: "implementer", game: "factory", at: "2026-10-12T15:07:00.000Z" };
  it("accepts a minimal event", () => expect(isPublicEvent(ok)).toBe(true));
  it("rejects any extra key", () => expect(isPublicEvent({ ...ok, title: "x" })).toBe(false));
  it("rejects free text in a known key", () => expect(isPublicEvent({ ...ok, game: "lreindl/pinhigh#42 <script>" })).toBe(false));
  it("rejects a raw number as an item", () => expect(isPublicEvent({ ...ok, item: "42" })).toBe(false));
});

describe("routineFor", () => {
  it("treats other people as unnamed", () => expect(routineFor("someone", { kind: "issue.opened" })).toBe("agent"));
  it("finds the analyst by branch", () => expect(routineFor("gk-agent", { kind: "pr.opened", branch: "claude/research-3-x" })).toBe("analyst"));
  it("finds the quality auditor by label", () => expect(routineFor("gk-agent", { kind: "issue.opened", labels: ["fn:quality"] })).toBe("quality"));
  it.each(["claude/verdict-pact", "claude/retrospective-c01", "claude/verdicts-9-hole-high-d7"])("finds the verdicts analyst by branch %s", (branch) =>
    expect(routineFor("gk-agent", { kind: "pr.opened", branch })).toBe("verdicts"));
  it("finds the verdicts analyst by label", () => expect(routineFor("gk-agent", { kind: "issue.closed", labels: ["fn:verdicts"] })).toBe("verdicts"));
  it("finds the designer by branch and by label", () => {
    expect(routineFor("gk-agent", { kind: "pr.opened", branch: "claude/idea-word-ladder" })).toBe("design");
    expect(routineFor("gk-agent", { kind: "issue.closed", labels: ["fn:design"] })).toBe("design");
  });
  it("lets a branch prefix win over a label", () =>
    expect(routineFor("gk-agent", { kind: "pr.opened", branch: "claude/research-8-x", labels: ["fn:verdicts"] })).toBe("analyst"));
});
