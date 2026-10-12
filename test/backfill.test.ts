// History goes through the same allowlist as webhooks; these check the replayed
// payloads map to the right events and carry no private text.

import { describe, expect, it } from "vitest";
import { isPublicEvent } from "../shared/public";
import { itemKey, toPublicEvent } from "../worker/allowlist";
import { fromIssue, fromIssueEvent, fromPull, fromReview, fromWorkflowRun, type Replay } from "../worker/backfill";

const SECRET = "PRIVATE: unreleased Horde Royale pricing";
const REPO = "lreindl/pinhigh";
const games = new Map([["lreindl/game-kiln", "factory"], [REPO, "game-1"]]);

async function map(replays: Replay[]) {
  const ctx = { games, itemKey: await itemKey("test-secret") };
  return Promise.all(replays.map(([n, p]) => toPublicEvent(n, p, ctx)));
}

describe("backfill", () => {
  it("replays an issue, its labels and its close", async () => {
    const issue = { number: 12, title: SECRET, body: SECRET, user: { login: "gk-agent" }, labels: [{ name: "ops", description: SECRET }], created_at: "2026-10-08T06:09:00Z" };
    const events = await map([
      ...fromIssue(REPO, issue),
      ...fromIssueEvent(REPO, { event: "labeled", actor: { login: "gk-agent" }, label: { name: "incident" }, issue, created_at: "2026-10-08T06:10:00Z" }),
      ...fromIssueEvent(REPO, { event: "closed", actor: { login: "lreindl" }, issue, created_at: "2026-10-09T10:00:00Z" }),
      ...fromIssueEvent(REPO, { event: "renamed", actor: { login: "lreindl" }, issue, created_at: "2026-10-09T10:00:00Z" }),
    ]);
    expect(events.map((e) => e && `${e.kind}:${e.actor}:${e.at}`)).toEqual([
      "issue.opened:ops:2026-10-08T06:09:00.000Z",
      "issue.labelled:ops:2026-10-08T06:10:00.000Z",
      "issue.closed:owner:2026-10-09T10:00:00.000Z",
    ]);
  });

  it("replays a PR, its review and its merge, attributed by branch", async () => {
    const pr = { number: 44, title: SECRET, body: SECRET, user: { login: "gk-agent" }, head: { ref: "claude/43-secret-slug" }, labels: [], created_at: "2026-10-10T15:20:00Z", merged_at: "2026-10-11T02:00:00Z" };
    const events = await map([...fromPull(REPO, pr), ...fromReview(REPO, 44, { user: { login: "gk-agent" }, body: SECRET, submitted_at: "2026-10-10T17:10:00Z" })]);
    expect(events.map((e) => e && `${e.kind}:${e.actor}`)).toEqual(["pr.opened:implementer", "pr.merged:owner", "pr.reviewed:reviewer"]);
    expect(new Set(events.map((e) => e!.item)).size).toBe(1);
  });

  it("skips pull requests in the issues list and undispatched workflow runs", () => {
    expect(fromIssue(REPO, { number: 1, pull_request: {}, user: { login: "gk-agent" } })).toEqual([]);
    expect(fromWorkflowRun(REPO, { event: "push", status: "completed" })).toEqual([]);
  });

  it("replays a release run", async () => {
    const run = { event: "workflow_dispatch", name: SECRET, status: "completed", conclusion: "failure", triggering_actor: { login: "gk-agent" }, actor: { login: "gk-agent" }, created_at: "2026-10-12T16:08:00Z", updated_at: "2026-10-12T16:20:00Z", head_commit: { message: SECRET } };
    const events = await map(fromWorkflowRun(REPO, run));
    expect(events.map((e) => e && `${e.kind}:${e.actor}:${e.ok ?? ""}`)).toEqual(["workflow.started:release:", "workflow.finished:release:false"]);
  });

  it("never lets private text through", async () => {
    const all = await map([
      ...fromIssue(REPO, { number: 3, title: SECRET, user: { login: "gk-agent" }, labels: [], created_at: "2026-10-08T00:00:00Z" }),
      ...fromPull(REPO, { number: 4, title: SECRET, user: { login: "gk-agent" }, head: { ref: "claude/research-9-secret" }, labels: [], created_at: "2026-10-08T00:00:00Z" }),
    ]);
    for (const e of all) {
      expect(isPublicEvent(e)).toBe(true);
      expect(JSON.stringify(e)).not.toMatch(/PRIVATE|Horde|secret|pinhigh/);
    }
  });
});
