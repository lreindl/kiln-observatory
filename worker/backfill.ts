// Rebuilds the studio's past activity from the GitHub API. Each historical
// record is reshaped into the webhook payload GitHub would have sent, then goes
// through the same allowlist as live events (toPublicEvent), so history can't
// carry anything a live event couldn't.

/** A [webhook event name, payload] pair, as GitHub would have sent it. */
export type Replay = [string, Record<string, unknown>];

// These take GitHub REST objects (untyped JSON) and build only the fields the allowlist reads.

export function fromIssue(repo: string, issue: any): Replay[] {
  if (issue.pull_request) return []; // PRs come from the pulls list, which has their branch
  return [["issues", { action: "opened", sender: { login: issue.user?.login }, repository: { full_name: repo }, issue: { number: issue.number, labels: issue.labels, updated_at: issue.created_at } }]];
}

export function fromPull(repo: string, pr: any): Replay[] {
  const base = { number: pr.number, head: { ref: pr.head?.ref }, labels: pr.labels };
  const out: Replay[] = [["pull_request", { action: "opened", sender: { login: pr.user?.login }, repository: { full_name: repo }, pull_request: { ...base, updated_at: pr.created_at } }]];
  if (pr.merged_at) out.push(["pull_request", { action: "closed", sender: { login: "lreindl" }, repository: { full_name: repo }, pull_request: { ...base, merged: true, updated_at: pr.merged_at } }]);
  return out;
}

export function fromReview(repo: string, prNumber: number, review: any): Replay[] {
  if (!review.submitted_at) return [];
  return [["pull_request_review", { action: "submitted", sender: { login: review.user?.login }, repository: { full_name: repo }, review: { user: { login: review.user?.login }, submitted_at: review.submitted_at }, pull_request: { number: prNumber } }]];
}

export function fromIssueEvent(repo: string, ev: any): Replay[] {
  if (ev.issue?.pull_request) return [];
  const issue = { number: ev.issue?.number, labels: ev.issue?.labels, updated_at: ev.created_at };
  if (ev.event === "labeled") return [["issues", { action: "labeled", sender: { login: ev.actor?.login }, repository: { full_name: repo }, label: { name: ev.label?.name }, issue }]];
  if (ev.event === "closed") return [["issues", { action: "closed", sender: { login: ev.actor?.login }, repository: { full_name: repo }, issue }]];
  return [];
}

export function fromWorkflowRun(repo: string, run: any): Replay[] {
  if (run.event !== "workflow_dispatch") return [];
  const wr = { event: run.event, triggering_actor: { login: run.triggering_actor?.login }, conclusion: run.conclusion };
  const out: Replay[] = [["workflow_run", { action: "requested", sender: { login: run.actor?.login }, repository: { full_name: repo }, workflow_run: { ...wr, created_at: run.created_at } }]];
  if (run.status === "completed") out.push(["workflow_run", { action: "completed", sender: { login: run.actor?.login }, repository: { full_name: repo }, workflow_run: { ...wr, updated_at: run.updated_at } }]);
  return out;
}

const API = "https://api.github.com";

async function* pages(token: string, path: string, stop?: (item: { created_at?: string }) => boolean): AsyncGenerator<any> {
  for (let page = 1; page <= 30; page++) {
    const sep = path.includes("?") ? "&" : "?";
    const res = await fetch(`${API}${path}${sep}per_page=100&page=${page}`, {
      headers: { Authorization: `Bearer ${token}`, Accept: "application/vnd.github+json", "User-Agent": "kiln-observatory", "X-GitHub-Api-Version": "2022-11-28" },
    });
    if (!res.ok) throw new Error(`${path.split("?")[0]}: GitHub returned ${res.status}`);
    const body = (await res.json()) as unknown;
    const items: any[] = Array.isArray(body) ? body : ((body as { workflow_runs?: any[] }).workflow_runs ?? []);
    for (const item of items) {
      if (stop?.(item)) return;
      yield item;
    }
    if (items.length < 100) return;
  }
}

/** Every replayable record for a repo since `since` (ISO date). Sources the token can't read are skipped. */
export async function* history(token: string, repo: string, since: string): AsyncGenerator<Replay> {
  const before = (item: { created_at?: string }) => !!item.created_at && item.created_at < since;
  const guarded = async function* (src: AsyncGenerator<Replay>) {
    try { yield* src; } catch (e) { console.error("backfill skipped a source", e instanceof Error ? e.message : e); }
  };
  yield* guarded((async function* () {
    for await (const i of pages(token, `/repos/${repo}/issues?state=all&since=${since}`)) if (i.created_at >= since) yield* fromIssue(repo, i);
  })());
  yield* guarded((async function* () {
    for await (const pr of pages(token, `/repos/${repo}/pulls?state=all&sort=created&direction=desc`, before)) {
      yield* fromPull(repo, pr);
      for await (const rv of pages(token, `/repos/${repo}/pulls/${pr.number}/reviews`)) yield* fromReview(repo, pr.number, rv);
    }
  })());
  yield* guarded((async function* () {
    for await (const ev of pages(token, `/repos/${repo}/issues/events`, before)) yield* fromIssueEvent(repo, ev);
  })());
  yield* guarded((async function* () {
    for await (const run of pages(token, `/repos/${repo}/actions/runs?event=workflow_dispatch&created=%3E%3D${since}`)) yield* fromWorkflowRun(repo, run);
  })());
}
