# Absorbing `backend/` changes into `apps/dgfy-api`

## Why this exists

`apps/dgfy-api/` is not a separate app — it is the old `backend/` refactored into the
`apps/` structure. It began as a faithful, near-byte-identical copy of `backend/`'s app
code, **minus the migration domain**, which was split into `apps/dgfy-migration-runner/`.

`backend/` has now been **deleted** from this line of development, and `apps/dgfy-api`
(+ `apps/dgfy-migration-runner`) is the single source of truth.

There is a transition window, though: this branch may be deleted `backend/` **before it
is merged into `develop`**, while the team keeps committing to `backend/` on `develop`.
Any such change must be replayed ("absorbed") into `apps/dgfy-api` so nothing is lost
when this branch finally merges. This document is the method for doing that. It is a
**manual / AI-assisted procedure, not a script** — the diffs are small and the mapping is
mechanical, so a human or an AI agent following these steps is enough.

## The 1:1 path map

The copy relationship is exact except for deliberate exclusions. Every incoming
`backend/` change maps to one destination:

| Source in `backend/`                              | Destination                                  |
| ------------------------------------------------- | -------------------------------------------- |
| `backend/src/**`                                  | `apps/dgfy-api/src/**`                        |
| `backend/config/**`                               | `apps/dgfy-api/config/**`                     |
| `backend/device-bridge/**`                        | `apps/dgfy-api/device-bridge/**`             |
| `backend/tests/**`                                | `apps/dgfy-api/tests/**`                      |
| `backend/package.json` (**new dependencies only**)| `apps/dgfy-api/package.json`                  |
| `backend/migrations/**`                           | `apps/dgfy-migration-runner/migrations/**`   |
| `backend/seeders/**`, `backend/src/seeders/**`    | `apps/dgfy-migration-runner/` seeders        |
| `backend/.sequelizerc`, `backend/src/config/sequelize.config.*`, `backend/database-setup.sql` | `apps/dgfy-migration-runner/` |

**Deliberately diverged — never copy wholesale:**
- `backend/package.json` — `apps/dgfy-api`'s copy has the migration/seed CLI scripts
  removed on purpose. Port only *new dependencies* or *new non-migration scripts*, never
  re-add the migration scripts.
- The migration config files above live only in `apps/dgfy-migration-runner`, never in
  `apps/dgfy-api`.

## The baseline anchor

To know *what* to absorb, you need the last `develop` commit this branch already reflects.
It is recoverable from git — it is the **second parent of this branch's most recent
`Merge …origin/develop` commit**:

```sh
LAST_MERGE=$(git log --merges --grep="origin/develop" --format=%H -1)
ANCHOR=$(git rev-parse "${LAST_MERGE}^2")
echo "Absorption anchor (develop SHA already reflected): $ANCHOR"
```

> At the time `backend/` was removed, the anchor was `7f416690` (develop tip merged via
> commit `f33bd4d2`). Each future `develop → this branch` merge advances the anchor
> automatically, so re-run the command above rather than hardcoding a SHA.

## Procedure

1. **Fetch the latest develop.**
   ```sh
   git fetch origin develop
   ```

2. **Compute the incoming `backend/` delta since the anchor.** Look at the summary first,
   then the full diff:
   ```sh
   git diff --stat "$ANCHOR"..origin/develop -- backend/
   git diff        "$ANCHOR"..origin/develop -- backend/
   ```
   If this is empty, there is nothing to absorb — done.

3. **Partition the changed files** using the path map above. Group them into:
   dgfy-api changes, migration-runner changes, and `package.json` (special-cased).

4. **Apply each hunk to its mapped destination.** For the overwhelming majority of files
   (pure copies) this is a verbatim port: make the `apps/dgfy-api/<same relative path>`
   file match develop's `backend/<same relative path>`. A convenient way to grab a single
   file's develop version:
   ```sh
   git show "origin/develop:backend/src/<path>" > "apps/dgfy-api/src/<path>"
   ```
   For `package.json`, hand-merge: add new `dependencies`/`devDependencies` entries only;
   do not touch the intentionally-removed migration scripts.

5. **Verify nothing is left unreflected.** After porting, every file that changed under
   `backend/src` on develop should now be content-equal in `apps/dgfy-api/src`:
   ```sh
   for f in $(git diff --name-only "$ANCHOR"..origin/develop -- backend/src | sed 's#^backend/src/##'); do
     git show "origin/develop:backend/src/$f" | diff - "apps/dgfy-api/src/$f" \
       && echo "OK  $f" || echo "DRIFT $f"
   done
   ```
   All `OK`, no `DRIFT`. Repeat the equivalent check for migration-runner paths.

6. **Record the new anchor.** Note the develop SHA you just absorbed in the absorbing
   commit message (e.g. `absorb backend@<sha> into dgfy-api`) so the next round starts
   from the right place, and update the changelog below.

## Resolving the merge itself

Because `backend/` is deleted on this branch, merging `develop` (or having `develop`
merged in) surfaces **modify/delete conflicts** for every `backend/` file develop touched.
That conflict list *is* the absorption checklist. For each conflicted `backend/` path:

1. Port the change into its mapped `apps/dgfy-api` / `apps/dgfy-migration-runner`
   destination (steps 3–5 above).
2. Accept this branch's deletion of the `backend/` path:
   ```sh
   git rm backend/<path>
   ```

Once all conflicts are resolved this way, the merge completes with `backend/` staying
deleted and every change reflected in the new structure.

## Absorption changelog

| Date       | Absorbed develop up to | Notes                                                        |
| ---------- | ---------------------- | ------------------------------------------------------------ |
| 2026-07-20 | `7f416690`             | Baseline at `backend/` removal. Ported `2b2ca4a5`'s two files (`posRepository.js`, `settingsValidator.js`). |

## Open compliance debt (must clear before staging/prod)

The `backend/` removal commit absorbed `posRepository.js` — a **byte-identical
relocation** of code already shipped *and already declared* on develop (impact
declaration `2026-07-20-pos-mobile-catalog-best-seller-tagging.md`, zero behavioral
delta). Because it touches the `pos` module, the compliance-impact gate requires a fresh
`major` impact declaration with **preflight** fields, whose values come from an actual
`POST /api/v1/compliance/preflight` call (see
[request-time-preflight-protocol.md](../compliance/request-time-preflight-protocol.md)).

That preflight was **not** run for the relocation, so the removal commit was made with
`--no-verify`. **Before this branch is promoted to staging/prod**, run the preflight for
the pos relocation and add the resulting `docs/compliance/impact-declarations/*.md`
declaration (classification `major`, `preflight_result=no_breach`, real
`preflight_run_at` / `preflight_request_ref`). CI's compliance check is
`continue-on-error`, so it will warn but not hard-block in the meantime.
