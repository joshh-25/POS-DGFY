---
status: authoritative
authority_level: authoritative
owner: engineering
last_reviewed: 2026-08-18
applies_to: issue_and_backlog_organization
topic: issue_taxonomy
---

# Issue taxonomy

How work is grouped in this repo and on the [DGFY Project board](https://github.com/orgs/Sieitzz/projects/10).

Adopted 2026-08-12. This is the answer to the "anchor issue" question raised in #330 section A and
#331 — the mechanism is GitHub's **native sub-issues**, not hand-maintained checklists.

---

## The three axes

An issue can carry all three at once. They never conflict, because each answers a different question.

| Axis | Mechanism | Question it answers |
|---|---|---|
| **Epic** | Native sub-issue parent | *What body of work is this part of?* |
| **Iteration** | Project board `Iteration` field | *Which sprint is this in?* |
| **Milestone** | GitHub milestone | *Which release does this ship in?* |

Do not use one as a substitute for another. Milestones-as-epics loses release tracking; epics-as-
sprints loses the ability to span sprints.

A fourth axis, **`area:*` labels**, answers *what part of the system does this touch?* — see below.

### Roadmap dates go on epics only

The project's **Roadmap** view is driven by `Start date` / `Target date`. Set these on **epics**,
not on leaf issues — the roadmap answers "what are we doing this quarter", and populating it with
individual tickets makes it unreadable. Sprint-level detail belongs on the board via `Iteration`.

### Where the fields actually live (this is not obvious)

`Priority`, `Start date`, `Target date`, and `Effort` are **repo-level issue fields**, not project
fields. Set them via the `updateIssueFieldValue` GraphQL mutation against the **issue** node, using
field IDs from `repository.issueFields`, not `projectV2.field`.

Consequences worth knowing before you waste an afternoon (corrected 2026-08-14 after live write
tests — the previous version of this note, based on introspection alone, understated how broken the
project-side columns are):

- Project #10 **also shows columns of the same three names** (`Priority`, `Start date`, `Target
  date`), each with its own field ID and a plausible-looking `dataType` on introspection. **They are
  not ordinary writable project fields and not simple read-only mirrors either — every write path
  tried against them fails or silently no-ops.** Writing the field directly
  (`updateProjectV2ItemFieldValue`, i.e. `gh project item-edit`) errors: *"Issue field values cannot
  be updated using the updateProjectV2ItemFieldValue mutation, they must be updated using the
  updateIssueFieldValue mutation"* — for every one of the three, not just `Priority`. Following that
  error's own advice doesn't work either: `updateIssueFieldValue` rejects the project-level field ID
  as not found; it only accepts the repo-level one. And writing the **correct** repo-level field
  does **not** propagate into the project's column — confirmed on a real issue whose repo-level
  `Priority` was set in an earlier session, whose project-column `Priority` is still empty.
- **Net effect: there is currently no known API/CLI path that populates these three project-side
  columns at all.** Set only the repo-level fields (the one path that works) and do not assume doing
  so makes the value appear on the board — it doesn't, as far as has been tested. Whether this is a
  GitHub product gap or needs the web UI is open; track under #369 rather than re-investigating this
  per session.
- Do not "fix" the empty project `Priority` field by deleting and recreating it regardless of the
  above — five saved views depend on the current field schema (**Backlog**, **Board** sorts by
  `Priority`, **Current iteration** groups by it, **Roadmap**, **My items** shows it), and a
  delete/recreate can break several of them silently even though the field itself isn't currently
  writable.
- `Milestone` looks like it belongs in this same broken group but does not — it's GitHub's built-in
  `MILESTONE`-type field, set via `gh issue edit --milestone`, and it works end-to-end: confirmed
  live that the project's own `Milestone` column updates immediately after that write.

---

## What qualifies as an epic

> **An epic is a bounded initiative with a done state.**

If you cannot write its definition of done, it is not an epic — it is a domain, and domains are
`area:*` labels.

This is the rule that keeps the hierarchy useful. A permanent bucket named "POS" would collect
issues forever and never close, which reproduces the flat backlog one level up while adding a
layer of indirection. An epic like "Onboarding & registration funnel" can actually finish.

Every epic must have:

- A **`## Definition of done`** section stating what "finished" means
- The `epic` label
- At least two children (one child is just an issue with extra steps)

### If two candidate epics share a dependency chain, they are one epic

This rule was learned the expensive way. "Transactional email" (#177, #279) and "observability
accounts" (#222, #229) looked like two clean epics by topic. They are not: email-failure alerting
raises a `Sentry.captureException` (ADR 0054), so the email work depends on the Sentry account the
observability work is migrating. Splitting them would have produced two two-child epics that each
break if the other moves.

They became one epic (#364) whose through-line is a *condition* — "external services are on
temporary, personal, or incorrect footing" — not a topic. Prefer that framing. **Topic similarity
is a weak signal for grouping; a shared dependency or a shared done state is a strong one.**

Splitting work to satisfy the "at least two children" rule is the failure this guards against.

Epics are marked with the `epic` label rather than a custom issue type, because `createIssueType`
requires the `admin:org` token scope which we do not currently grant. If that scope is ever added,
migrating to a real **Epic** issue type is a clean upgrade.

### Epics never enter an iteration

They span sprints by definition. Only leaf issues get an `Iteration` value. An epic sitting in a
sprint is a sign it should have been an ordinary issue.

---

## Depth

**Two levels by default. Three only where it earns it.**

```
Epic
└── Issue
    └── Sub-issue        ← only when the middle issue is itself a real body of work
```

The current three-level branch is #351 → #322 → the three extraction issues. That is justified
because "split `apps/dgfy-web`" is a substantial project in its own right with three independently
schedulable outcomes.

Do not nest for tidiness. Each level has to earn its existence by being separately plannable.

### One parent only

GitHub sub-issues allow exactly one parent per issue. When an issue plausibly belongs to two
epics, pick the one whose *definition of done* depends on it, and cross-reference the other in
prose. Example: #226 (DB rename) sits under Architecture (#351) because it is structural work,
and is cross-referenced from Legacy-name retirement (#352) rather than parented there.

---

## `area:*` labels — the domain axis

Permanent, non-closing groupings. These describe *where in the system*, and are orthogonal to
which initiative the work belongs to.

| Label | Covers |
|---|---|
| `area:dgfy-api` | Backend (`apps/dgfy-api`) |
| `area:skupervisor` | Admin / back-office surface |
| `area:pos` | POS terminal surface |
| `area:store` | Storefront surface |
| `area:dgfy-migration-runner` | DB migration tooling |
| `area:dgfy-android-bridge` | Android / imin wrapper |
| `area:infra` | `infrastructure/` — nginx, docker, deploy |
| `area:docs` | `docs/` |

These name the **product surface**, not the directory, so they survive the `apps/dgfy-web` split —
`area:pos` will simply start pointing at a different code path.

### Other labels with specific meaning

| Label | Meaning |
|---|---|
| `epic` | A bounded initiative with children and a definition of done |
| `blocked` | Cannot proceed until a named dependency clears — say which, in the body |
| `ops-followup` | Engineering shipped; a manual action (rotate a key, flip a setting) remains |
| `security`, `security:*`, `privacy`, `assurance`, `supply-chain` | Security program classification |

---

## Filing a new issue

1. **Search first.** The most common failure mode here has been the same work filed twice under
   different framing — at one point the privacy policy was scheduled in three separate issues.
2. **Pick a parent, or deliberately don't.** Standalone is a legitimate outcome; roughly a quarter
   of open issues have no epic and should not be forced into one.
3. **Apply an `area:*` label** and an issue type (Bug / Feature / Task).
4. **If it is an epic**, write the definition of done before filing the children.

### Linking a child to a parent

Native sub-issues are set through the GitHub UI ("Create sub-issue" / "Add existing issue" on the
parent), or via GraphQL:

```graphql
mutation {
  addSubIssue(input: { issueId: "<parent-node-id>", subIssueId: "<child-node-id>" }) {
    issue { number subIssuesSummary { total completed } }
  }
}
```

`Parent issue` and `Sub-issues progress` on the project board populate automatically. Do not also
hand-maintain a checklist of issue numbers in the parent body — it will drift. A prose list is
fine as *narrative*; the sub-issue links are the source of truth.

## Updating an existing issue or epic

Added 2026-08-18 (#645), closing a gap this document previously left to be inferred piecemeal from
individual skill files' checkpoint tables — a rule found only in a skill file is a bug per this
file's own Surface precedence in `AGENTS.md`, not a feature. This section is the authoritative one;
skill files reference it rather than restating it.

1. **Whose body it is decides who may edit it.** If you authored the issue, editing the body is
   fine. If someone else did, **append a comment instead** — never rewrite another author's words,
   even to fix a stale reference or add a missed detail.
2. **Additive scope changes** — a newly discovered constraint, new acceptance criteria — go in a
   dated `## Update YYYY-MM-DD` section appended to the body, not rewoven into the original prose.
   The original stays legible as a record of what was asked at filing time.
3. **Scope reduction or splitting.** If the removed scope is still wanted, file it as a sibling
   issue and cross-reference both directions before narrowing the original — the same principle
   the "one parent only" rule above already applies to filing.
4. **Re-parenting a single issue** is routine, addressed the same way as initial parenting, above.
   **Bulk re-parenting, or restructuring an existing epic's children, is a checkpoint** — a human
   confirms the restructuring before it happens, not after.
5. **Re-scoping an epic** requires updating its `## Definition of done` in the same edit. An epic
   whose children no longer match its stated definition of done is the specific failure mode this
   rule exists to prevent.
6. **Closing an issue** (`Done` or `Cancelled`) is always a checkpoint — see "Board status
   semantics," below, for the `Cancelled` reason-comment requirement.

---

## Board status semantics

The eight `Status` options on project #10, and what moves a card between them. Adopted 2026-08-14,
answering the open checkbox #331 left unresolved ("the 8 existing Status options — keep all, and
define what moves a card between each"). The `pm` skill (#367) drives this table; it is not
reinvented per session.

**Ownership added 2026-08-15 (#331 board-lane wiring), closing the remaining box on #369** —
*"decide whether Status transitions should be automated via a project workflow, or stay manual."*
The answer: **agent-driven, not project-workflow-driven.** See "What the board automates already"
below for the two transitions that *are* a native GitHub Projects workflow — everything else in the
`Who moves it` column is an agent or human action, and no new project workflow was added to cover it.

| Status | A card arrives here when | Who moves it | Leaves for |
|---|---|---|---|
| **Backlog** | Filed, not yet scheduled. Default for every new issue. | automatic (workflow) | `Todo`, once accepted into an iteration |
| **Todo** | Accepted for the current/next iteration, no unresolved blocker | `pm` | `In progress` |
| **In progress** | A branch exists or work has genuinely started | `implement` (Worker) | `For Review`, when a PR opens |
| **For Review** | PR open, awaiting review/merge | `implement` (Worker) | `For QA` on merge; back to `In progress` if changes are requested |
| **For QA** | Merged to `develop`, needs verification on a deployed environment | `pr-reviewer` (Reviewer), only when the PR used `Refs #N` — see "Issue linkage" below | `Done`, or `Failed` |
| **Failed** | QA rejected it | `verifier` (Verifier/QA) | `In progress` — **never** back to `Backlog`; the failed attempt stays visible rather than disappearing |
| **Done** | Verified. Issue closes. | `verifier` (Verifier/QA), or automatic (workflow) when a `Closes #N` PR merges | — |
| **Cancelled** | Won't do. Issue closes, **with a reason left as a comment** — a bare status flip with no explanation is not enough. | `pm`, or a human | — |

No WIP limit is defined — #331 said "consider" one, but nothing in this repo enforces it, so adding
one to the table would be decoration rather than policy. Revisit if the board actually needs one in
practice, not preemptively.

Added 2026-08-16 (#512/#546): `promoter` and `incident-responder` own no lane in this table.
Promotion PRs aren't per-issue cards, and `incident-responder` orchestrates the five existing roles
rather than moving Status itself — each sub-step's move is made by the role that already owns it
above.

### What the board automates already

Project #10 has 7 built-in GitHub Projects workflows, all enabled. Their exact config isn't exposed
by the API, so this table is empirical — confirmed 2026-08-15 by cross-referencing every closed
issue's Status (76/76 closed issues were `Done`, one exception) and every issue with a linked-but-
unmerged PR (`In progress` in every case checked):

| Workflow | Effect | Row above it satisfies |
|---|---|---|
| Auto-add to project / Item added | New issue → `Backlog` | `Backlog`'s "automatic (workflow)" |
| Pull request linked to issue | → `In progress` | Redundant with Worker's own branch-time write below; harmless, just late (fires only once a PR exists) — but note this fires on the *same* event (PR opened with a linking keyword) as Worker's separate PR-open-time `For Review` write. Which lands last is unconfirmed; if this native workflow lands after `For Review`, it would silently revert the card to `In progress`. No write actually fails in that case, so the existing "report a failed write" clause wouldn't catch it. Flag if seen in practice — not yet observed, not yet mitigated. |
| Item closed / Auto-close issue / Pull request merged | Closing an issue → `Done` | `Done`'s "automatic (workflow)" |

**The one consequence every agent role must respect:** `Closes #N` on a merging PR closes the issue,
and closing an issue is forced to `Done` by the workflow above — **there is no way to land on `For
QA` if the issue closes at merge.** The QA lane only exists for issues that stay open through merge.
This is why "Issue linkage" below splits `Closes` vs. `Refs` rather than using `Closes` uniformly.

**The reverse direction does not happen automatically.** A `For QA` issue is still *open* when
`verifier` acts on it — none of the three native workflows above fire from a Status field write
alone, only from the issue actually closing. So a `verifier` `Done` write is **two actions, not
one**: the project Status field write (`Done`, option `98236657`) *and* an explicit `gh issue close
<N>` on the issue itself. Skipping the second half leaves the card reading `Done` while the issue
stays open indefinitely — a `Failed` write, by contrast, is Status-only, since the issue is
supposed to stay open in that case.

---

## Pull requests

Every PR needs a linked issue. A PR that advances an epic without finishing it should reference the
**child** issue, not the epic — epics close when their children do.

### Issue linkage: `Closes #N` vs. `Refs #N`

Amended 2026-08-15 (#331 board-lane wiring). Which verb a PR uses decides whether its issue passes
through the `For QA` lane at all — see "What the board automates already" above for why: closing an
issue forces `Status = Done`, which skips QA entirely.

- **`Closes #N`** — only for a diff that needs no deployed verification: docs-only, CI/workflow-only,
  or a pure `chore:` with no runtime behavior change. Merge closes the issue immediately, workflow
  sets `Done`.
- **`Refs #N`** — everything else, which in practice means anything user-facing or behavior-changing.
  The issue **stays open** through merge; the Reviewer sets `For QA` on it (see `pr-reviewer`'s merge
  policy); a Verifier later flips it to `Done` (which closes it) or `Failed`.
- **When genuinely unsure, use `Refs`.** An issue that lingers in `For QA` an extra day is
  recoverable; an issue that auto-closes on `Done` without anyone verifying it is not.

This is a repo-wide rule, not just the `implement` skill's — any PR, agent-authored or not, follows
it.

---

## Anti-patterns

| Don't | Why |
|---|---|
| Create a permanent "Payments" / "POS" epic | Domains are `area:*` labels. Epics that cannot close are dashboards. |
| Nest three levels for neatness | Each level must be separately plannable. |
| Put an epic in a sprint | Epics span sprints; that's what makes them epics. |
| Maintain a checklist of issue numbers in an epic body | It drifts. Use sub-issue links. |
| Rewrite 25 issue bodies for a path rename | Write one decoder note and pin it — see #363. |
| Close a stale issue because its file paths moved | Mis-addressed ≠ invalid. Fix the reference or leave a note. |

---

## Related

- #330 — contribution, deployment, and audit governance (section A consumes this document)
- #331 — repo-specialized agents and task management (where this decision was made)
- #363 — pinned decoder note for pre-`apps/` paths in older issues
