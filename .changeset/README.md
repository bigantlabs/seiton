# Changesets

This directory is used by [changesets](https://github.com/changesets/changesets) to manage versioning and changelog generation for `@bigantlabs/seiton`.

## Adding a changeset

When your PR includes a user-visible change (feature, fix, or breaking change), run:

```sh
npx changeset
```

You will be prompted to:

1. Select the package (`@bigantlabs/seiton`).
2. Pick a bump type:
   - **patch** — bug fixes, internal improvements
   - **minor** — new features, new CLI flags, new config keys
   - **major** — breaking changes (removed flags, changed defaults, schema version bumps)
3. Write a short summary of the change (this appears in CHANGELOG.md).

The command creates a markdown file in this directory (e.g., `.changeset/happy-dogs-dance.md`). Commit it with your PR.

## When to skip

No changeset is needed for:

- Documentation-only changes
- Test-only changes
- CI/tooling changes that don't affect the published package
- Refactors with no observable behavior change

## Versioning

Maintainers run `npm run changeset:version` to consume pending changesets, bump `package.json`, and update `CHANGELOG.md`, `src/version.ts`, and `VERSION` in lockstep.
