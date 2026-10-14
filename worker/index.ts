// The Worker: receives GitHub webhooks, maps them through the allowlist and
// hands them to the Studio object; serves the live feed and the built site.
// The Studio checks the services from outside for the uptime level; a cron backs it up.

import { toPublicEvent, itemKey } from "./allowlist";
import { verifySignature } from "./signature";
import type { Studio } from "./studio";

export { Studio } from "./studio";

export interface Env {
  STUDIO: DurableObjectNamespace<Studio>;
  ASSETS: Fetcher;
  /** Shared with the GitHub webhooks. */
  WEBHOOK_SECRET: string;
  /** Fine-grained, read-only: contents, issues, pull requests, metadata. Optional in local dev. */
  GITHUB_TOKEN?: string;
  FACTORY_REPO: string;
  /** Comma-separated game ids whose store listing is public, so their names may show. */
  NAMED_GAMES?: string;
  /** ISO date the backfill starts from: when the studio began. */
  HISTORY_SINCE: string;
}

export default {
  async fetch(request, env): Promise<Response> {
    const url = new URL(request.url);
    const studio = env.STUDIO.get(env.STUDIO.idFromName("studio"));

    if (url.pathname === "/api/webhook") {
      if (request.method !== "POST") return new Response(null, { status: 405 });
      const body = await request.arrayBuffer();
      if (!env.WEBHOOK_SECRET || !(await verifySignature(env.WEBHOOK_SECRET, body, request.headers.get("X-Hub-Signature-256")))) {
        return new Response("Bad signature", { status: 401 });
      }
      const name = request.headers.get("X-GitHub-Event") ?? "";
      if (name === "ping") return new Response("pong");
      const event = await toPublicEvent(name, JSON.parse(new TextDecoder().decode(body)), {
        games: await studio.coveredRepos(),
        itemKey: await itemKey(env.WEBHOOK_SECRET),
      });
      if (event) await studio.publish(event);
      return new Response(event ? "shown" : "ignored");
    }

    if (url.pathname === "/api/live") return studio.fetch(request);
    if (url.pathname === "/api/history") return Response.json({ events: await studio.history() }, { headers: { "Cache-Control": "public, max-age=30" } });
    if (url.pathname === "/api/services") return Response.json({ services: await studio.services() }, { headers: { "Cache-Control": "public, max-age=60" } });
    if (url.pathname === "/api/state") return Response.json(await studio.snapshot(), { headers: { "Cache-Control": "no-store" } });
    if (url.pathname.startsWith("/api/")) return new Response("Not found", { status: 404 });
    return env.ASSETS.fetch(request);
  },

  /** The five-minute cron: a backstop for the Studio's own alarm, which runs the checks. */
  async scheduled(_event, env, ctx): Promise<void> {
    ctx.waitUntil(env.STUDIO.get(env.STUDIO.idFromName("studio")).checkServices());
  },
} satisfies ExportedHandler<Env>;
