# Git Conventions

## Commit format

Every commit message must follow [Conventional Commits](https://www.conventionalcommits.org/):

```
type(scope): subject
```

Types: `feat`, `fix`, `docs`, `style`, `refactor`, `perf`, `test`, `chore`, `build`, `ci`, `revert`

## PR body format

The PR body must use `.github/pull_request_template.md` as its base, and at minimum
must include the two headers the `changes` job in `.github/workflows/shared-changed-paths.yml`
(PR mode, `validate_pr_metadata`) checks for:

- `## Summary` — what changed and why (the template's own bullets are "What changed" / "Why this change is needed" — there is no separate Motivation header)
- `## Testing Evidence` — how the change was tested

Fill in whichever other template sections apply to the change (Architecture Impact,
Compliance Evidence, Batch Inventory, etc.) — leave inapplicable ones as unchecked
boxes rather than deleting them.

### Verified AI/model attribution

When the current runtime has a valid local attribution session, the first content line under
`## Summary` must be formatter output, for example `Opened by (Codex GPT-5.6 Terra, worker)`.
Use `node scripts/ai-attribution.js format <runtime> <session-id> Opened <role>`. The session ID
isn't something to hunt for — Claude Code and Codex both print it, and the exact command to run,
as plain-text context at session start (`docs/ai/AI_MODEL_ATTRIBUTION.md`). Do not guess a model,
reuse another session's record, or write `unknown-AI`: if it emits no line, omit attribution.

## PR base branch

- Ordinary branches (features, fixes, chores, docs) target `develop` as base
- A promotion PR targets `staging`, headed from a `to-staging/<label>` branch, or targets `main`,
  headed from a `release/<label>` branch — per `docs/ops/RELEASE_CANDIDATE_POLICY.md`
  (authoritative) and the `promoter` role (`.agents/skills/promoter/SKILL.md`, #512)

Corrected 2026-08-16: this previously referenced an `rc/*` prefix that is not used anywhere else in
the repo — the actual promotion-branch prefixes are `to-staging/*` and `release/*`, which is also
what `scripts/check-compliance-impact.js`'s `PROMOTION_HEAD_PREFIX_BY_BASE` and
`.github/branch-cleanup-policy.json`'s `protectedHeadPrefixes` already match against.

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
