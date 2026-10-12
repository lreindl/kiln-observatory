// Reads from GitHub with the Worker's read-only token: the game list from the
// factory repo (ADR-0011: one copy of each fact) and the counts per stage.

import { parse } from "yaml";
import { GAME_LABEL, type Counts } from "../shared/public";

const API = "https://api.github.com";

function headers(token: string, accept = "application/vnd.github+json"): HeadersInit {
  return { Authorization: `Bearer ${token}`, Accept: accept, "User-Agent": "kiln-observatory", "X-GitHub-Api-Version": "2022-11-28" };
}

/**
 * Covered repos to their public label: the factory repo is "factory"; each game
 * is "game-N" in games.yaml order unless its id is in `named` (its store
 * listing is public), when it shows its name.
 */
export async function fetchCoveredRepos(token: string, factoryRepo: string, named: string[]): Promise<Map<string, string>> {
  const res = await fetch(`${API}/repos/${factoryRepo}/contents/games.yaml`, { headers: headers(token, "application/vnd.github.raw+json") });
  if (!res.ok) throw new Error(`games.yaml: GitHub returned ${res.status}`);
  const doc = parse(await res.text()) as { games?: { id?: string; name?: string; repo?: string }[] };
  const covered = new Map([[factoryRepo, "factory"]]);
  (doc.games ?? []).forEach((g, i) => {
    if (!g.repo) return;
    const name = g.id && named.includes(g.id) && g.name && GAME_LABEL.test(g.name) ? g.name : `game-${i + 1}`;
    covered.set(g.repo, name);
  });
  return covered;
}

async function count(token: string, query: string): Promise<number> {
  const res = await fetch(`${API}/search/issues?per_page=1&q=${encodeURIComponent(query)}`, { headers: headers(token) });
  if (!res.ok) throw new Error(`search: GitHub returned ${res.status}`);
  return ((await res.json()) as { total_count: number }).total_count;
}

export async function fetchCounts(token: string, repos: string[]): Promise<Counts> {
  const scope = repos.map((r) => `repo:${r}`).join(" ");
  const [ready, openPRs, approvals] = await Promise.all([
    count(token, `${scope} is:issue is:open label:ready-for-agent`),
    count(token, `${scope} is:pr is:open author:gk-agent`),
    count(token, `${scope} is:issue is:open label:approval`),
  ]);
  return { ready, openPRs, approvals };
}
