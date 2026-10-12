// One Durable Object holds the public studio state and pushes every change to
// connected browsers over hibernating WebSockets.

import { DurableObject } from "cloudflare:workers";
import { isCounts, isPublicEvent, type Counts, type PublicEvent, type ServerMessage, type Snapshot } from "../shared/public";
import { fetchCounts, fetchCoveredRepos } from "./github";
import type { Env } from "./index";

const RECENT = 40;
const RECONCILE_EVERY = 10 * 60_000;
const RECONCILE_AFTER_EVENT = 20_000;

export class Studio extends DurableObject<Env> {
  async fetch(request: Request): Promise<Response> {
    if (request.headers.get("Upgrade") !== "websocket") return new Response("Expected a WebSocket", { status: 426 });
    const { 0: client, 1: server } = new WebSocketPair();
    this.ctx.acceptWebSocket(server);
    server.send(JSON.stringify({ type: "snapshot", snapshot: await this.snapshot() } satisfies ServerMessage));
    await this.ensureAlarm(RECONCILE_EVERY);
    return new Response(null, { status: 101, webSocket: client });
  }

  async snapshot(): Promise<Snapshot> {
    const [counts, recent, games, updatedAt] = await Promise.all([
      this.ctx.storage.get<Counts>("counts"),
      this.ctx.storage.get<PublicEvent[]>("recent"),
      this.ctx.storage.get<Map<string, string>>("games"),
      this.ctx.storage.get<string>("updatedAt"),
    ]);
    return { counts: counts ?? null, recent: recent ?? [], games: [...new Set((games ?? new Map()).values())], updatedAt: updatedAt ?? null };
  }

  /** Covered repos to public labels; loads them from GitHub the first time. */
  async coveredRepos(): Promise<Map<string, string>> {
    const stored = await this.ctx.storage.get<Map<string, string>>("games");
    if (stored?.size) return stored;
    await this.reconcile();
    return (await this.ctx.storage.get<Map<string, string>>("games")) ?? new Map([[this.env.FACTORY_REPO, "factory"]]);
  }

  async publish(event: PublicEvent): Promise<void> {
    if (!isPublicEvent(event)) return; // the contract is checked again at the last step before broadcast
    const recent = [event, ...((await this.ctx.storage.get<PublicEvent[]>("recent")) ?? [])].slice(0, RECENT);
    await this.ctx.storage.put({ recent, updatedAt: new Date().toISOString() });
    this.broadcast({ type: "event", event });
    await this.ensureAlarm(RECONCILE_AFTER_EVENT);
  }

  async alarm(): Promise<void> {
    await this.reconcile();
    if (this.ctx.getWebSockets().length) await this.ensureAlarm(RECONCILE_EVERY);
  }

  /** Rebuilds the game list and counts from GitHub, so a missed webhook heals. */
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
    } catch (e) {
      console.error("reconcile failed", e instanceof Error ? e.message : e);
    }
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
