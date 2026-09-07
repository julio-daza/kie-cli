## Checklist

- [ ] Target branch is `develop` (unless this is a `develop` → `staging` or `staging` → `main` promotion PR)
- [ ] Tests pass locally (`cd kie && npm test && npm run typecheck`)
- [ ] No new runtime dependencies added to `kie/package.json`
- [ ] Any catalog/model changes were verified against the current docs at https://docs.kie.ai
- [ ] `CHANGELOG.md` and `VERSION`/`package.json` version bumped if this PR is user-facing
