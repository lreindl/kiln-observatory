// The Worker: receives GitHub webhooks, maps them through the allowlist and
// hands them to the Studio object; serves the live feed and the built site.

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
    if (url.pathname === "/api/state") return Response.json(await studio.snapshot(), { headers: { "Cache-Control": "no-store" } });
    if (url.pathname.startsWith("/api/")) return new Response("Not found", { status: 404 });
    return env.ASSETS.fetch(request);
  },
} satisfies ExportedHandler<Env>;
