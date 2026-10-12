# Kiln Observatory

A live view of **Game Kiln**, an agentic game studio. Scheduled Claude Code
routines (an analyst, ops, growth, a quality auditor, a PM, an implementer, a
reviewer, release and an approval digest) build and run mobile games, handing
work to each other through GitHub. The Observatory is a
black field of white dots and hairline geometry, in three levels you zoom
between: outside the kiln, the agents as a folder tree wired by circuit traces, and one
agent's record, drawn as rings of days with a dot for every event. Live events
travel between the agents as packets of dots. `#studio` and `#agent-<id>`
(for example `#agent-implementer`) link straight to a level.

It shows **activity only**: what the agents do, never what they write. The
studio's repos are private; titles, bodies, numbers, branch names and money
never leave the Worker. The decision and its allowlist are ADR-0025 in the
studio repo.

## How it works

```
private repos ──webhooks──▶ Worker ──allowlist──▶ Studio (Durable Object) ──WebSocket──▶ browsers
                            │ verifies the signature            │ every 10 min: counts from the GitHub API
                            └ holds the secrets                 └ keeps the last 40 public events
```

- **`worker/allowlist.ts`** builds each public event from scratch out of a
  GitHub webhook. Nothing in the payload is copied through, and
  `shared/public.ts#isPublicEvent` rejects any event with an unknown key or a
  value outside its allowed set, both before storing and before broadcasting.
- **`worker/studio.ts`** keeps every public event in the Durable Object's
  SQLite and pushes changes over hibernating WebSockets. Its alarm rebuilds the
  game list and the counts from the GitHub API, so a missed webhook heals.
- **`worker/backfill.ts`** rebuilds history once, back to `HISTORY_SINCE`: each
  issue, pull request, review, label and release run becomes the webhook
  payload GitHub would have sent and goes through the same allowlist.
  `/api/history` serves it.
- **`src/`** is the site, on a plain 2D canvas: `field.ts` is a pool of dots
  springing between formations under a zooming camera, `shapes.ts` samples the
  kiln and the agents' figures into dots, `levels.ts` lays out each level for
  the viewport. Without a reachable Worker the site shows labelled demo data.

## Develop

```bash
npm install
npm run dev        # the scene alone, with the demo feed
npm run worker     # build, then serve site + Worker on :8787 (needs .dev.vars)
npm run check      # types, tests, build (what CI runs)
```

For `npm run worker`, create `.dev.vars` (gitignored) with a local secret,
plus `GITHUB_TOKEN=...` if you want real counts:

```
WEBHOOK_SECRET=local-dev-only
```

## Deploy (owner)

1. `npx wrangler login`, then `npm run deploy`. It serves at
   `https://kiln-observatory.<account>.workers.dev`.
2. Set the secrets at the interactive prompt (piping adds a line break):
   - `npx wrangler secret put WEBHOOK_SECRET`: a long random string.
   - `npx wrangler secret put GITHUB_TOKEN`: a fine-grained token, read-only,
     for `game-kiln` and each game repo, with *Contents*, *Issues*, *Pull
     requests* and *Metadata* (add *Actions* to backfill past release runs).
3. On `lreindl/game-kiln` and each repo in its `games.yaml`, add a webhook:
   payload URL `https://<worker>/api/webhook`, content type
   `application/json`, the same secret, and the events *Issues*, *Pull
   requests*, *Pull request reviews*, *Check suites* and *Workflow runs*.
4. GitHub sends a ping; the Worker answers `pong`.

A game's name shows only once its store listing is public: add its id to
`NAMED_GAMES` in `wrangler.jsonc`.
