# Contributing

Thanks for helping. A few ground rules keep this tool trustworthy for people who
hand it a paid API key.

## Non-negotiables

1. **Zero runtime dependencies.** PRs that add a `dependencies` entry to `kie/package.json`
   will not be merged. Dev dependencies (TypeScript, types) are fine.
2. **Only KIE hosts.** The CLI talks to `api.kie.ai`, `kieai.redpandaai.co` and the result
   URLs KIE returns. No telemetry, no proxies, no default webhooks, no `callBackUrl`.
3. **The key never leaves the keystore.** Don't log it, don't write it to config or ledger,
   don't pass it through argv.
4. **Spend guard stays in front of every request.** New commands that create tasks go
   through `checkSpend()` and the ledger.
5. **Tests pass, no network.** `npm test` mocks `fetch`; keep it that way.

## Adding a model

1. Verify the input schema on `https://docs.kie.ai/market/<vendor>/<model>` — do not copy
   field names from memory or from other projects.
2. Add one entry to `kie/src/catalog.ts` with a `build()` that maps the generic flags
   (`prompt`, `ref`, `image`, `end-image`, `aspect`, `resolution`, `duration`, `sound`, `fast`,
   `format`, `--set`) to the model's `input`. Throw clear errors for invalid combinations.
3. Only set `estimate` when the price is documented somewhere citable; otherwise leave `null`
   so the guard requires `--max-credits`.
4. Add a test in `kie/test/catalog.test.ts` and a row to the catalog table in `kie/README.md`
   and `skills/kie-media/references/kie-api.md`.

## Workflow

Branches flow one way: `feature/*` → `develop` → `staging` → `main`. `main` no longer
accepts direct pushes — every change reaches it through this chain.

```bash
cd kie
npm install
npm test            # tsc + node:test
npm run typecheck
```

Commits: short imperative subject, body explaining *why*. Bump `VERSION` in `src/index.ts`
and `package.json` together, and add a line to `CHANGELOG.md`.

1. **Feature branch → PR to `develop`.** `ci.yml` runs typecheck + tests on Node 20/22 and
   checks the zero-runtime-deps invariant. An `enforce-flow` job blocks PRs opened directly
   against `staging` (must come from `develop`) or `main` (must come from `staging`) — any
   branch can target `develop`.
2. **PR `develop` → `staging`.** `full-battery.yml` runs the full test battery on Node
   20/22/24, plus packaging checks: `npm pack --dry-run` contents, the built `skills/`
   output matches the source skill, `VERSION` in `src/index.ts` matches `package.json`,
   `CHANGELOG.md` has a matching `## [x.y.z]` section, a `--version` smoke test, and
   `npm audit`.
3. **PR `staging` → `main`.** Once merged, `release.yml` runs on `push` to `main`. It reads
   the version from `package.json`; if that version has no `vX.Y.Z` tag and isn't already on
   npm, it publishes `@uxdata-co/kie` to npm (trusted publishing / OIDC, with provenance),
   then creates and pushes the `vX.Y.Z` tag and a GitHub release with the CHANGELOG section
   as notes. If the version was already released, the workflow skips publishing/tagging —
   this makes `staging` → `main` promotions safe to merge even when no version bump is needed.

## Releasing (maintainers)

Releases are no longer triggered by pushing a tag by hand — tags and GitHub releases are
created by CI.

1. On (or before) the `develop` → `staging` promotion, bump `version` in `kie/package.json`
   and `VERSION` in `kie/src/index.ts` together, and add a `CHANGELOG.md` entry.
2. Merge `develop` → `staging` (full battery must pass), then merge `staging` → `main`.
3. `.github/workflows/release.yml` detects the new version on `main`, publishes
   `@uxdata-co/kie` to npm with provenance via trusted publishing (no token stored anywhere),
   and creates the `vX.Y.Z` tag and GitHub release automatically.
