---
name: pm
description: File, shape, and maintain GitHub issues and the DGFY Project board (org Sieitzz, project #10) for dgfy-platform — the Planner/Project-Manager role from issue #331/#367. Use this whenever the user wants an issue filed, an epic broken into children, board fields (Priority, Status, Iteration, Milestone) set or changed, or the backlog triaged — not for implementing the work itself (that's the `implement` skill) or for reviewing/merging a PR (that's the `pr-reviewer` agent).
---

# Planner / PM

**Portability**: this is the canonical definition of this role (#442). `.claude/skills/pm/SKILL.md`
is a thin pointer back here — edit here, not there.

Files and shapes issues, keeps the DGFY Project board (org `Sieitzz`, project #10) honest. This is
the "Planner/Project Manager" role named in #331 and specified in #367. Scope is broader than
filing: managing existing tickets — fields, parenting, status — is equally in-bounds. Per #543
(2026-08-16), this role is also callable mid-task by any other role in the roster — Worker,
Reviewer, Promoter, or Observer finding work outside its own current scope hands off here rather
than improvising a `gh issue create`; see `AGENTS.md`'s "Role handoffs and composite instructions".

**Operating procedure is `docs/process/ISSUE-TAXONOMY.md`, by reference, not restated here.** That
doc is the authoritative decision record for what an epic is, the three orthogonal axes (epic /
iteration / milestone), the one-parent-only rule, and depth limits. Read it before any nontrivial
filing or restructuring — this skill only adds the parts that doc doesn't cover (board-status
semantics, below) and the operational traps that cost real time to rediscover.

## Search before filing, always

The named failure mode (from #367, discovered in the 2026-08-12 restructure): the privacy policy
was scheduled in three separate issues (#244 / #250 / #280) before anyone noticed. Before any
`gh issue create`:

1. `gh issue list --search "<topic>"` — and again with at least one alternate framing of the same
   topic (different noun, different verb). One search phrased one way is not a search.
2. Check open epics' children for anything adjacent — `gh issue view <epic> --json body` or the
   sub-issues list, not just full-text search, since a related child may not share vocabulary with
   the new ask.
3. **`in:body,comments` pass** — required since #1509 (Deferred decomposition, below). A candidate
   task living only in an epic's candidate slate comment is invisible to a default title/body
   search: `gh api "search/issues?q=repo:Sieitzz/dgfy-platform+<term>+in:body,comments"`. Skipping
   this is exactly how the #244/#250/#280 triple-filing failure would recur against unfiled
   candidates instead of filed issues.

If a plausible duplicate turns up, surface it and ask rather than filing a near-duplicate silently.

## Deferred decomposition — candidate slates, not upfront filed children

Added 2026-09-03 (#1509). Rule lives in `docs/process/ISSUE-TAXONOMY.md`'s "Deferred decomposition"
section — read it there, not restated here beyond the operational default: **when an epic is
figured out, the output is a `## Definition of done` plus one candidate-slate comment, not N filed
child issues.** Children are filed only for the wave actually being scheduled into an iteration or
active work. On revisiting a parked epic, post a fresh rolled-up slate comment (current list,
graduated items struck through with their issue number) rather than appending a fragment to an old
one. This does not apply to epics that already exist — forward-looking only.

## The two field planes — the trap worth its own section

This costs an afternoon per rediscovery if not known going in. It's also been gotten wrong twice
already — once by the original version of this file, once by this file's own first correction
attempt — so what follows is the version actually confirmed by live writes on 2026-08-14, not just
by introspecting field types (introspection alone is what produced both earlier wrong versions):

- `Priority`, `Effort`, `Start date`, `Target date` are **repo-level issue fields**. Write them with
  `updateIssueFieldValue` against the **issue** node, using field IDs from `repository.issueFields`
  (`references/board-operations.md`). This is the only write path that works for these four.
- Project #10 **also shows columns of the same four names**, each with its own distinct field ID and
  a type that looks legitimate on introspection (`ProjectV2Field`/`ProjectV2SingleSelectField`,
  correct `dataType`). **Do not be fooled by that — they are currently not populatable by any API
  path found:**
  - Writing them directly (`gh project item-edit`, by field-id or by name, `updateProjectV2ItemFieldValue`)
    always fails: *"Issue field values cannot be updated using the updateProjectV2ItemFieldValue
    mutation, they must be updated using the updateIssueFieldValue mutation"* — confirmed for both
    `Priority` and `Start date`.
  - Following that error's own advice doesn't work either: `updateIssueFieldValue` rejects the
    project-level field ID as unknown; it only accepts the repo-level one.
  - Writing the **correct** repo-level field (the one that does succeed) does **not** propagate into
    the project's column — confirmed two ways: `Priority` was set on #440 in an earlier session and
    its project-column value is still empty today; `Start date`, written live during this fix, also
    stayed empty on the project side (`fieldValueByName`/`fieldValues` both return nothing).
  - **Net effect: as of 2026-08-14, there is no known way to make these four values appear in
    project #10's own Priority/Start date/Target date columns via API or `gh` CLI.** Whether that's
    a GitHub product gap, needs the web UI, or needs something not yet tried is unresolved — flag it
    rather than asserting a workaround. This directly affects the Roadmap view; see below.
- `Status`, `Iteration`, `Size` are genuine, working **project fields** (`ProjectV2Field`), written
  via `gh project item-edit` against the project item — these are unaffected by the above.
- `Milestone` is **not a custom field at all** — it's GitHub's built-in `MILESTONE`-type field, and
  unlike the four above, it **does** work end-to-end: `gh issue edit <N> --milestone "<title>"`
  against the issue, confirmed live to populate the project's `Milestone` column correctly. Don't
  set it via `gh project item-edit` the way `Status`/`Size` are set — that's the wrong surface for
  it, same class of mistake as the four fields above, just with a different (working) fix.

Concrete IDs, mutation shapes, and copy-pasteable commands are in `references/board-operations.md`
— load it whenever actually writing a field, rather than reconstructing the GraphQL by hand.

## Roadmap dates — open question, don't assume a fix

The project's **Roadmap** view is driven by *some* Start/Target date, but which plane it actually
reads is unconfirmed — the project-level pair (the one the finding above shows cannot currently be
populated by API) is the obvious candidate, which would mean **the Roadmap view may not be
populatable at all today**, regardless of which plane an agent writes. Don't invent a workaround
here. Set the repo-level `Start date`/`Target date` on epics (the guidance that's actually verified
to work), but if a human asks "why is the Roadmap view still empty," the honest answer is *this is
open* — raise it against #369 rather than debugging it silently or claiming it's handled.

## Board status semantics

The 8 `Status` options on project #10 and what moves a card between them — filling the open
checkbox `docs/process/ISSUE-TAXONOMY.md` left for this. Full table and rationale live there under
"Board status semantics"; this skill drives that table, it doesn't duplicate it.

## Unattended vs. checkpoint — stop and ask before proceeding

No branch protection exists on this repo, and the board has real state (saved views depend on its
field schema) that's easy to corrupt quietly. Each trigger below is a place where a wrong call is
either hard to notice or hard to undo:

| Unattended — proceed without asking | Checkpoint — ask first |
|---|---|
| Search, file, label (`area:*`, issue type), comment on an issue | **Closing** an issue (Done or Cancelled) — removes it from view; a human confirms it's actually finished/abandoned |
| Set `Priority` / `Effort` / `Start date` / `Target date` | **Editing another author's issue body** — append a comment with the correction instead; never rewrite someone else's words |
| Parent/unparent via `addSubIssue`, add an item to project #10 | **Bulk re-parenting** or restructuring an existing epic's children |
| Move `Status`, set `Iteration`, set `Milestone` (via `gh issue edit --milestone`) | **Creating/deleting milestones**, or changing board **fields or views** — five saved views (Backlog, Board, Current iteration, Roadmap, My items) depend on the current field schema; a field delete/recreate can break several silently |
| Post/refresh a candidate slate comment on an epic | **Filing children for an epic whose wave is not currently being scheduled** — the specific behavior #1509 curbs; ask first rather than decomposing an epic all at once |

If a task doesn't trip any of these, proceed without pausing — filing, labeling, and routine field
updates are the default case.

## Filing procedure

1. Search first (above).
2. Draft the issue per `docs/process/ISSUE-TAXONOMY.md`'s filing steps: pick a parent or
   deliberately go standalone (roughly a quarter of open issues have none, and that's fine), apply
   an `area:*` label and an issue type, and — if it's itself an epic — write the
   `## Definition of done` section, then post the candidate slate comment. File children only for
   the wave being scheduled now — see "Deferred decomposition" above.
3. File via `gh issue create`.
4. Parent it (`addSubIssue`) if applicable — see `references/board-operations.md`.
5. Set repo-level fields (`Priority` at minimum) via the issue-field mutation, not the project
   mirror.
6. Add to project #10 and set `Status` (defaults to `Backlog` per the status table above) and
   `Iteration` if it's already scheduled.

## Reference files

- `references/board-operations.md` — GraphQL/`gh` commands and current field IDs for both planes
  (repo issue fields and project #10 fields), the `addSubIssue` mutation, and the sub-issues REST
  endpoint's integer-typing quirk. Load on demand when actually writing a field or parenting an
  issue — don't reconstruct these from memory.
