---
status: authoritative
authority_level: authoritative
owner: engineering
last_reviewed: 2026-08-12
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

---

## Pull requests

Every PR needs a linked issue, and uses `Closes #N` for each distinct piece of work it completes.
A PR that advances an epic without finishing it should reference the **child** issue, not the epic
— epics close when their children do.

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
