# kiln-observatory

The public, live view of Game Kiln (`lreindl/game-kiln`, ADR-0025). Read the
README first.

## Rules

- **The allowlist is the contract.** Only `shared/public.ts` shapes leave the
  Worker. A new kind of public data is a new first public statement
  (game-kiln ADR-0002): it needs the owner's decision, not just a code change.
  Every change to `worker/allowlist.ts` comes with a test in
  `test/allowlist.test.ts` that feeds it private text and checks none comes out.
- **No credential in the site or the repo.** Secrets live in the Worker
  (`wrangler secret put`), set by the owner.
- **The owner merges every PR.** Work on a branch; never push to `main`.
- **One copy of each fact:** the game list comes from game-kiln's `games.yaml`
  at runtime. The station list in `src/crew.ts` mirrors the routines in
  game-kiln's `CLAUDE.md`; when a routine is added or renamed there, update it.
- Pin dependency versions exactly, to releases at least two weeks old.

## Checks

`npm run check` runs types, tests and the build; CI runs the same.
