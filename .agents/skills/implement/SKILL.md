---
name: implement
description: Plan, implement, commit, and open a PR for a scoped engineering task on dgfy-platform — the Worker/Implementer role from issue #331/#436. Use this whenever the user asks for a change to ship as a PR (a fix, a small feature, a workflow edit, a doc correction) and wants it carried from plan through an opened pull request without re-explaining this repo's git/PR/compliance conventions each time. This skill never merges and never touches a deployed environment — it stops and asks before either.
---

# Worker/Implementer

**Portability**: this is the canonical definition of this role (#442).
`.claude/skills/implement/SKILL.md` is a thin pointer back here — edit here, not there.

Plan → implement → commit → PR, for one scoped task at a time on `dgfy-platform`. This is the
"Worker" role named in #331 and specified in #436. Two things this skill will **never** do on its
own, decided before this skill existed and not reopened here: it does not merge its own PR, and it
does not touch a deployed environment (no deploy dispatch, no SSH mutation). Both are always a
human's call — see the checkpoint policy below for the full boundary.

## Checkpoint policy — stop and ask before proceeding

No branch protection exists on this repo (no CODEOWNERS, no required-review config) — a self-imposed
gate here is the only gate. Each trigger below reuses a mechanism that already exists rather than
inventing new detection:

| Trigger | Why | What "stop" means |
|---|---|---|
| New/changed files under `apps/dgfy-migration-runner/migrations/` | High blast radius, effectively irreversible once run | Ask before committing; a human confirms direction/correctness first |
| `.husky/pre-commit`'s `check:compliance` step reports a missing/required declaration | Classifying `major`/`regulatory` impact is a human judgment call, not something to self-certify | Ask; a human writes or approves the `docs/compliance/impact-declarations/*.md` file (shape: `scripts/check-compliance-impact.js:196-220`) |
| The PR's base would be `staging` or `main` | Those are promotion PRs — human-initiated every time so far | Never open one; this skill's PRs always target `develop` (already `docs/ai/PR.md`'s rule — never deviate). **Sole named exception:** a hand-off from `incident-responder`'s loop (`.agents/skills/incident-responder/SKILL.md`, #546/#861) explicitly directs branching a hotfix off `main` or `staging` per that role's own base-branch rule — when acting under that hand-off, follow it rather than refusing here, the same way `pr-reviewer`/`promoter`/`AGENTS.md` all cross-reference incident-responder's `main`-merge override instead of leaving it a silent contradiction in one file |
| Anything that would dispatch a deploy workflow, SSH to a server, or mutate `/opt/dgfy-platform` | No approval gate exists on a deploy dispatch; a mistake there is live | Ask, always. Read-only checks (log tail, `docker buildx imagetools inspect`) are fine — nothing that changes server state runs unattended. This row is Worker-scoped — `promoter` (#331/#512) holds its own, narrower tier that permits unattended DEV/STAGING deploy dispatch as part of a promotion; that's a different role's checkpoint table, not a carve-out in this one |
| Force-push, branch deletion, or rewriting already-pushed shared history | Not recoverable by a second party | Ask |
| No GitHub issue exists yet for the work | Repo SOP (`docs/process/ISSUE-TAXONOMY.md`) — every PR needs a linked issue | File one first, then proceed |
| Moving the issue's board card (`In progress`, `For Review`) | Not high-risk or hard to reverse — the opposite of every other row here | **Unattended, never a checkpoint.** See "Board transitions" below |
| A merge-shaped action comes up while executing this skill | This skill never merges its own PR (see above) — but if a task drifts into one, `AGENTS.md`'s repo-wide Merge Safety rule applies regardless of role | Don't merge. Follow `AGENTS.md`'s rule if any check state needs confirming first, then hand off — merging stays out of scope for this skill either way |

If a task doesn't trip any of these, proceed through commit/push/PR without pausing — that's the
default case, not the exception. See `references/checkpoint-examples.md` for four worked examples
of these triggers actually firing (or correctly not firing) in practice.

## Workflow

1. **Branch off fresh `origin/develop`**, one branch per logical change, in a dedicated worktree
   when working on more than one thing in parallel (e.g. `git worktree add ../dgfy-platform-<x>`).
   Never commit directly to a local `develop` — always branch first, even for something small.
   Once branched, set the linked issue's board `Status` to `In progress` — see "Board transitions"
   below.
2. **Name the branch** using one of `.github/branch-cleanup-policy.json`'s eligible prefixes —
   `feature/`, `fix/`, `chore/`, `docs/`, `test/`, `ci/`, among others — matching the change's
   actual kind. (`ci/` was previously missing from that file despite being in heavy real use for
   workflow-only changes; it has since been added — confirmed live in the file, 2026-08-16 — so
   this is no longer a gap to route around.)
3. **Commit** using Conventional Commits, batched by domain, per `docs/ai/PR.md` — read that file
   for the exact format rather than relying on this summary; it's short and it's the source of
   truth, not this skill.
4. **Self-verify in tiers.** Tier 0 is required, every time. Tiers 1-2 are opportunistic — run them
   when it's cheap to, skip them to save tokens/time otherwise, but never silently pretend a skip
   didn't happen.

   **Tier 0 — required, before opening the PR:**
   - **The code builds / does not break.** What this means differs by app, because only the
     frontend has a real compiler:
     - `apps/dgfy-ims`, `apps/dgfy-pos`, `apps/dgfy-storefront`, or `packages/web-core` changed →
       `npm run build:<affected-app>` (`build:skupervisor` / `build:pos` / `build:store`) for each
       app actually touched — a `packages/web-core` change can affect more than one app, since it's
       the shared trunk all three depend on; there is no single `build:all` command, run the build
       for each affected app. This is a real Vite/esbuild build: it catches syntax errors,
       unresolved imports, and JSX errors.
     - `apps/dgfy-api` or `apps/dgfy-migration-runner` changed → neither app has a real build step
       (`apps/dgfy-api`'s own `build` script is a literal no-op: `echo 'No backend build
       required'`). The equivalent minimum check is `node --check <each changed .js file>` —
       syntax-only, zero side effects, near-zero cost. It will not catch a bad `require()` path or
       a missing export; that level of confidence is Tier 1/2 (lint, tests), not Tier 0.
   - **`package-lock.json` is in sync**, only if a `package.json` was touched. This repo has
     **per-app lockfiles**, not one root lockfile — check the one matching whatever changed
     (`package-lock.json`, `apps/dgfy-ims/package-lock.json`, `apps/dgfy-pos/package-lock.json`,
     `apps/dgfy-storefront/package-lock.json`, `apps/dgfy-api/package-lock.json`,
     `apps/dgfy-migration-runner/package-lock.json` — `packages/web-core` has no lockfile of its
     own, it's plain-ESM with no `node_modules`). Run `npm install` in that workspace
     (**never** `rm` the lockfile first — that regenerates unrelated version drift, not just the
     intended change; this happened for real earlier tonight and had to be undone), then confirm
     `git diff --exit-code -- <that lockfile>` is clean before including it in the commit.
   - Post Tier 0's results in the PR body's `## Testing Evidence` section at creation — it's
     already a required section per `docs/ai/PR.md`, so this doesn't add new ceremony.

   **Tier 1 — optional, cheap:** lint (`npm run lint` in the affected workspace). Skipped by
   default to save tokens; run it when asked, or when the diff is lint-relevant and the extra run
   is genuinely cheap.

   **Tier 2 — optional, heavier:** a local test subset (`npm test` in the affected workspace, or
   specific `gate:release:local` gates run individually — `scripts/gate-release-local.js` has no
   `--only` flag, so this means invoking the underlying `npm run <script>` commands directly, not
   the aggregate). Opt-in only, not run by default — this repo doesn't yet have a documented split
   between its cheap/fast tests and its slow/DB-reliant ones (tracked in #438), so "run the tests"
   today means either running all of them or guessing, and guessing isn't Tier 2's job. Once #438
   lands, prefer whatever fast/no-dependency subset it defines. If a DB-backed check can't run for
   lack of local credentials, say so explicitly rather than omitting it.

   **Whichever tiers actually ran, post the results as a PR comment** (`gh pr comment`) once the
   PR exists — not folded into the original body after the fact. Tier 0 is the exception: it runs
   *before* the PR exists, so it lands in the initial body instead, per above.
5. **Open the PR** against `develop`, following `docs/ai/PR.md`'s body format (`## Summary` +
   `## Testing Evidence` at minimum), linking the issue with `Closes #N` or `Refs #N` per
   `docs/process/ISSUE-TAXONOMY.md`'s linkage rule. Then set the board card to `For Review` — see
   "Board transitions" below.
6. **Picking up review findings**, if the `pr-reviewer` agent (#331/#366) has already run on this
   PR: read the newest `## Review` comment (`gh pr view <N> --comments`), address every row marked
   `blocker`, then reply in the same thread naming which `RF-` IDs were fixed and, for any
   deliberately left unfixed, why — don't fix silently and leave the comment looking unanswered.
   `should-fix` and `nit` rows are judgment calls, not required, but say what was done with them
   too rather than ignoring them without comment. Push once addressed.
7. **Stop.** Report what was done and where. Merging is a separate decision by a separate party.

If a task surfaces work outside this PR's own scope (a correction, a bug, a gap), hand it to `pm`
to shape and file rather than improvising a `gh issue create` mid-task — see `AGENTS.md`'s "Role
handoffs and composite instructions".

## Board transitions

Added 2026-08-15 (#331 board-lane wiring). Worker owns two of the eight `Status` lanes on project
#10 — the full lifecycle and the `Who moves it` ownership table live in
`docs/process/ISSUE-TAXONOMY.md`'s "Board status semantics"; read it there rather than expecting
this section to restate it.

- **`In progress`**, at branch time (Workflow step 1). The project's own "Pull request linked to
  issue" workflow would eventually set this too, but only once a PR exists — too late to reflect
  that work has actually started. Setting it explicitly at branch time is the point.
- **`For Review`**, at PR-open time (Workflow step 5). Nothing else in the system sets this lane;
  without this write it stays permanently empty.
- **A PR that doesn't finish the issue** (a partial/continuous ticket) stays `In progress` and uses
  `Refs #N` — do not advance it to `For Review` until a PR that actually completes the work opens.
  **An epic never moves at all** — epics don't enter iterations and close only when their children
  do (taxonomy, "Epics never enter an iteration").
- **Field IDs and the write mutation** are in `.agents/skills/pm/references/board-operations.md`
  (`Status` field `PVTSSF_lADODOdIe84BfZ_pzhZtHYs`; option IDs for each lane) — don't re-derive or
  copy them here.
- **Best-effort.** A failed board write is reported in the final summary, never a reason to hold
  back the commit, push, or PR.

## Reference files

- `references/checkpoint-examples.md` — four worked examples of the checkpoint policy actually
  firing (or correctly not firing) during a real session, for calibration on borderline cases.
