// One Durable Object holds the public studio state: every public event (in
// SQLite), the counts and the covered repos. It pushes each change to connected
// browsers over hibernating WebSockets, and rebuilds history from GitHub once.

import { DurableObject } from "cloudflare:workers";
import { isCounts, isPublicEvent, type Counts, type PublicEvent, type ServerMessage, type Snapshot } from "../shared/public";
import { toPublicEvent, itemKey } from "./allowlist";
import { history } from "./backfill";
import { fetchCounts, fetchCoveredRepos } from "./github";
import type { Env } from "./index";

const RECENT = 40;
const HISTORY_LIMIT = 5000;
const RECONCILE_EVERY = 10 * 60_000;
const RECONCILE_AFTER_EVENT = 20_000;
const BACKFILL_VERSION = "backfill-v1";

export class Studio extends DurableObject<Env> {
  constructor(ctx: DurableObjectState, env: Env) {
    super(ctx, env);
    ctx.storage.sql.exec("CREATE TABLE IF NOT EXISTS events (key TEXT PRIMARY KEY, at TEXT NOT NULL, json TEXT NOT NULL)");
    ctx.storage.sql.exec("CREATE INDEX IF NOT EXISTS events_at ON events (at)");
  }

  async fetch(request: Request): Promise<Response> {
    if (request.headers.get("Upgrade") !== "websocket") return new Response("Expected a WebSocket", { status: 426 });
    const { 0: client, 1: server } = new WebSocketPair();
    this.ctx.acceptWebSocket(server);
    server.send(JSON.stringify({ type: "snapshot", snapshot: await this.snapshot() } satisfies ServerMessage));
    // A new studio (or one whose counts never loaded) reconciles at once rather than in ten minutes.
    await this.ensureAlarm((await this.ctx.storage.get("counts")) ? RECONCILE_EVERY : 1000);
    return new Response(null, { status: 101, webSocket: client });
  }

  private events(limit: number): PublicEvent[] {
    const rows = this.ctx.storage.sql.exec<{ json: string }>("SELECT json FROM events ORDER BY at DESC LIMIT ?", limit).toArray();
    return rows.map((r) => JSON.parse(r.json)).filter(isPublicEvent);
  }

  async snapshot(): Promise<Snapshot> {
    const [counts, games, updatedAt] = await Promise.all([
      this.ctx.storage.get<Counts>("counts"),
      this.ctx.storage.get<Map<string, string>>("games"),
      this.ctx.storage.get<string>("updatedAt"),
    ]);
    return { counts: counts ?? null, recent: this.events(RECENT), games: [...new Set((games ?? new Map()).values())], updatedAt: updatedAt ?? null };
  }

  /** Every public event, newest first. */
  async history(): Promise<PublicEvent[]> {
    return this.events(HISTORY_LIMIT);
  }

  /** Covered repos to public labels; loads them from GitHub the first time. */
  async coveredRepos(): Promise<Map<string, string>> {
    const stored = await this.ctx.storage.get<Map<string, string>>("games");
    if (stored?.size) return stored;
    await this.reconcile();
    return (await this.ctx.storage.get<Map<string, string>>("games")) ?? new Map([[this.env.FACTORY_REPO, "factory"]]);
  }

  /**
   * Stores an event once. History and webhooks can describe the same moment, so
   * the key is the kind, the item and the minute it happened.
   */
  private store(e: PublicEvent): boolean {
    if (!isPublicEvent(e)) return false; // the contract is checked again at the last step
    const key = `${e.kind}|${e.item ?? e.actor}|${e.at.slice(0, 16)}`;
    const cur = this.ctx.storage.sql.exec("INSERT OR IGNORE INTO events (key, at, json) VALUES (?, ?, ?)", key, e.at, JSON.stringify(e));
    return cur.rowsWritten > 0;
  }

  async publish(event: PublicEvent): Promise<void> {
    if (!this.store(event)) return;
    await this.ctx.storage.put("updatedAt", new Date().toISOString());
    this.broadcast({ type: "event", event });
    await this.ensureAlarm(RECONCILE_AFTER_EVENT);
  }

  async alarm(): Promise<void> {
    await this.reconcile();
    if (this.ctx.getWebSockets().length) await this.ensureAlarm(RECONCILE_EVERY);
  }

  /** Rebuilds the game list and counts from GitHub, so a missed webhook heals; backfills history once. */
  private async reconcile(): Promise<void> {
    const token = this.env.GITHUB_TOKEN;
    if (!token) return;
    try {
      const named = (this.env.NAMED_GAMES ?? "").split(",").map((s) => s.trim()).filter(Boolean);
      const games = await fetchCoveredRepos(token, this.env.FACTORY_REPO, named);
      const counts = await fetchCounts(token, [...games.keys()]);
      await this.ctx.storage.put({ games, updatedAt: new Date().toISOString() });
      if (isCounts(counts)) {
        await this.ctx.storage.put("counts", counts);
        this.broadcast({ type: "counts", counts });
      }
      if (!(await this.ctx.storage.get(BACKFILL_VERSION))) await this.backfill(token, games);
    } catch (e) {
      console.error("reconcile failed", e instanceof Error ? e.message : e);
    }
  }

  private async backfill(token: string, games: Map<string, string>): Promise<void> {
    const ctx = { games, itemKey: await itemKey(this.env.WEBHOOK_SECRET) };
    let n = 0;
    for (const repo of games.keys()) {
      for await (const [name, payload] of history(token, repo, this.env.HISTORY_SINCE)) {
        const e = await toPublicEvent(name, payload, ctx);
        if (e && this.store(e)) n++;
      }
    }
    await this.ctx.storage.put(BACKFILL_VERSION, new Date().toISOString());
    console.log(`backfill stored ${n} events`);
    this.broadcast({ type: "history" });
  }

  private async ensureAlarm(inMs: number): Promise<void> {
    const at = await this.ctx.storage.getAlarm();
    if (at === null || at > Date.now() + inMs) await this.ctx.storage.setAlarm(Date.now() + inMs);
  }

  private broadcast(message: ServerMessage): void {
    const text = JSON.stringify(message);
    for (const ws of this.ctx.getWebSockets()) {
      try { ws.send(text); } catch { /* closed; the runtime drops it */ }
    }
  }

  async webSocketMessage(): Promise<void> {
    // Browsers only listen.
  }

  async webSocketClose(ws: WebSocket, code: number): Promise<void> {
    ws.close(code, "bye");
  }
}
