# Kiln Observatory

A live view of **Game Kiln**, an agentic game studio. Scheduled Claude Code
routines (an analyst, ops, growth, a quality auditor, a PM, an implementer, a
reviewer, release and an approval digest) build and run mobile games, handing
work to each other through GitHub. The Observatory gives each of them, and
the owner, an office of their own, side by side in a responsive grid: a night
penthouse, an archive library, a network operations centre, a rooftop
billboard, a clean room, a war room, a pneumatic mail room, a workshop, a zen
study and the Kiln itself. Each room has its own animation for working and for
finishing a piece of work, driven by the studio's real activity and the
routines' schedules. Select an office to preview it; `#<office>` (for example
`#release`) opens one on its own.

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
- **`worker/studio.ts`** holds the state and pushes changes over hibernating
  WebSockets. Its alarm rebuilds the game list (from the studio's
  `games.yaml`) and the counts from the GitHub API, so a missed webhook heals.
- **`src/`** is the site: one three.js WebGPU renderer (WebGL 2 fallback)
  behind a CSS grid, drawing each office's own scene into its cell with
  scissor rendering. The offices live in `src/offices/`, one file each, on a
  shared base class in `kit.ts`. Without a reachable Worker the site runs a
  labelled demo feed.

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
     requests* and *Metadata*.
3. On `lreindl/game-kiln` and each repo in its `games.yaml`, add a webhook:
   payload URL `https://<worker>/api/webhook`, content type
   `application/json`, the same secret, and the events *Issues*, *Pull
   requests*, *Pull request reviews*, *Check suites* and *Workflow runs*.
4. GitHub sends a ping; the Worker answers `pong`.

A game's name shows only once its store listing is public: add its id to
`NAMED_GAMES` in `wrangler.jsonc`.
