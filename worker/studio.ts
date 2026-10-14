// One Durable Object holds the public studio state: every public event (in
// SQLite), the counts and the covered repos. It pushes each change to connected
// browsers over hibernating WebSockets, and rebuilds history from GitHub once.

import { DurableObject } from "cloudflare:workers";
import { isCounts, isPublicEvent, isServices, type Counts, type PublicEvent, type ServerMessage, type Service, type ServiceState, type Snapshot } from "../shared/public";
import { toPublicEvent, itemKey } from "./allowlist";
import { history } from "./backfill";
import { fetchCounts, fetchCoveredRepos } from "./github";
import type { Env } from "./index";
import { SERVICES, combine, probe, summarize, type CheckRow } from "./services";

const RECENT = 40;
const HISTORY_LIMIT = 5000;
const RECONCILE_EVERY = 10 * 60_000;
const RECONCILE_AFTER_EVENT = 20_000;
/** How often the services are checked. The alarm drives it; the cron is a backstop. */
const CHECK_EVERY = 5 * 60_000;
const BACKFILL_VERSION = "backfill-v1";
/** Uptime shown and kept, in days. */
const UPTIME_DAYS = 90;

export class Studio extends DurableObject<Env> {
  constructor(ctx: DurableObjectState, env: Env) {
    super(ctx, env);
    ctx.storage.sql.exec("CREATE TABLE IF NOT EXISTS events (key TEXT PRIMARY KEY, at TEXT NOT NULL, json TEXT NOT NULL)");
    ctx.storage.sql.exec("CREATE INDEX IF NOT EXISTS events_at ON events (at)");
    ctx.storage.sql.exec("CREATE TABLE IF NOT EXISTS checks (service TEXT NOT NULL, at TEXT NOT NULL, state TEXT NOT NULL, PRIMARY KEY (service, at))");
  }

  async fetch(request: Request): Promise<Response> {
    if (request.headers.get("Upgrade") !== "websocket") return new Response("Expected a WebSocket", { status: 426 });
    const { 0: client, 1: server } = new WebSocketPair();
    this.ctx.acceptWebSocket(server);
    server.send(JSON.stringify({ type: "snapshot", snapshot: await this.snapshot() } satisfies ServerMessage));
    // A new studio (or one whose counts never loaded) reconciles at once rather than in ten minutes.
    await this.wantReconcile((await this.ctx.storage.get("counts")) ? RECONCILE_EVERY : 1000);
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
    await this.wantReconcile(RECONCILE_AFTER_EVENT);
  }

  /**
   * One alarm serves two clocks: a reconcile when one is due (asked for by a
   * browser connecting or a new event), and the service checks every five
   * minutes, which keep the alarm going whether or not anyone is watching.
   */
  async alarm(): Promise<void> {
    const due = await this.ctx.storage.get<number>("reconcileAt");
    if (due !== undefined && due <= Date.now() + 1000) {
      await this.ctx.storage.delete("reconcileAt");
      await this.reconcile();
      if (this.ctx.getWebSockets().length) await this.wantReconcile(RECONCILE_EVERY);
    }
    await this.checkServices();
  }

  private async wantReconcile(inMs: number): Promise<void> {
    const due = Date.now() + inMs;
    const cur = await this.ctx.storage.get<number>("reconcileAt");
    if (cur === undefined || cur > due) await this.ctx.storage.put("reconcileAt", due);
    await this.ensureAlarm(inMs);
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

  /**
   * Checks every service unless they were checked in the last five minutes,
   * stores the outcome, pushes the new view and sets the alarm for the next round.
   * The alarm calls it, and the cron as a backstop that restarts the alarm.
   */
  async checkServices(): Promise<void> {
    const last = (await this.ctx.storage.get<number>("checkedAt")) ?? 0;
    if (Date.now() - last < CHECK_EVERY - 30_000) {
      await this.ensureAlarm(Math.max(1000, last + CHECK_EVERY - Date.now()));
      return;
    }
    await this.ctx.storage.put("checkedAt", Date.now());
    await this.ensureAlarm(CHECK_EVERY);
    const at = new Date().toISOString();
    const states = await Promise.all(SERVICES.map(async (s) => combine(await Promise.all(s.checks.map((u) => probe(u))))));
    SERVICES.forEach((s, i) => this.ctx.storage.sql.exec("INSERT OR REPLACE INTO checks (service, at, state) VALUES (?, ?, ?)", s.id, at, states[i]));
    this.ctx.storage.sql.exec("DELETE FROM checks WHERE at < ?", new Date(Date.now() - (UPTIME_DAYS + 1) * 86_400_000).toISOString());
    const services = this.view();
    if (isServices(services)) this.broadcast({ type: "services", services });
  }

  /** Each service's latest state and its days of checks; starts the checks if they have stopped. */
  async services(): Promise<Service[]> {
    if ((await this.ctx.storage.getAlarm()) === null) await this.ctx.storage.setAlarm(Date.now() + 1000);
    return this.view();
  }

  private view(): Service[] {
    const since = new Date(Date.now() - UPTIME_DAYS * 86_400_000).toISOString();
    const rows = this.ctx.storage.sql.exec<{ service: string; at: string; state: string }>("SELECT service, at, state FROM checks WHERE at >= ?", since).toArray();
    const out = summarize(SERVICES, rows.map((r) => ({ ...r, state: r.state as ServiceState }) satisfies CheckRow), Date.now(), UPTIME_DAYS);
    return isServices(out) ? out : []; // the contract is checked again at the last step
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
