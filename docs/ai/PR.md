# Git Conventions

## Commit format

Every commit message must follow [Conventional Commits](https://www.conventionalcommits.org/):

```
type(scope): subject
```

Types: `feat`, `fix`, `docs`, `style`, `refactor`, `perf`, `test`, `chore`, `build`, `ci`, `revert`

## PR body format

After a PR is created, the body must include these headers:

- `## Summary` — one or two sentences describing the change
- `## Motivation` — why the change is needed
- `## Testing` — how the change was tested

## PR base branch

- Non `rc/*` branches (features, fixes, chores, docs) target `develop` as base
- `rc/*` branches target `main` as base

## Pre-commit safety check

Before staging or committing any files, scan for "DO NOT COMMIT" markers in all changed files:

1. Run `rg "DO NOT COMMIT"` across the working tree
2. If any matches are found, exclude those files (or the affected lines) from the commit
3. If no matches are found, proceed normally

This prevents accidentally committing debug code, work-in-progress hacks, or temporary development aids.

## Batch commits by domain

When committing multiple changes, group files into batches by logical domain:

1. Run `git status` and `git diff --stat` to inventory all changed files
2. Group files by logical domain (e.g., new module, refactored module, docs, CI config)
3. Commit each batch separately with an appropriate Conventional Commits message
4. Commit order: new modules first → modules that depend on them → documentation → CI config

### Example

```
Batch 1: feat(auth-provider): add auth provider module with Clean Architecture
  - packages/kmp/mobile/authProvider/

Batch 2: refactor(umbrella): wire auth-provider, replace APIModule with HTTPModule
  - packages/kmp/mobile/build.gradle.kts
  - packages/kmp/mobile/src/.../HTTPModule.kt
  - packages/kmp/mobile/src/.../LugarService.kt
  - settings.gradle.kts

Batch 3: docs(architecture): update module docs for auth-provider
  - docs/architecture/
```

This keeps history bisectable and each commit reviewable in isolation.
