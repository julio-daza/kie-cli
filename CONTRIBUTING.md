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
   and `kie/skill/kie-media/references/kie-api.md`.

## Workflow

```bash
cd kie
npm install
npm test            # tsc + node:test
npm run typecheck
```

Commits: short imperative subject, body explaining *why*. Bump `VERSION` in `src/index.ts`
and `package.json` together, and add a line to `CHANGELOG.md`.

## Releasing (maintainers)

1. Bump `version` in `kie/package.json` and `VERSION` in `kie/src/index.ts`; add a `CHANGELOG.md` entry.
2. Commit, then `git tag vX.Y.Z && git push origin main --tags`.
3. `.github/workflows/release.yml` runs the tests and publishes `@uxdata-co/kie` to npm with
   provenance via trusted publishing (no token stored anywhere). The GitHub release is created
   automatically with the CHANGELOG section as notes.
