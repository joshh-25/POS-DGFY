---
status: proposed
authority_level: reference
owner: architecture
date: 2026-07-29
last_reviewed: 2026-07-29
review_by: 2026-10-29
applies_to: architecture_decision_records
topic: adr_lifecycle_governance
---

# ADR 0039: ADR Lifecycle, Strictness Tiers, and Amendment Path

## Status

Proposed (2026-07-29)

This ADR governs how ADRs themselves are written, graded, amended, and retired.
It is a process decision in the same family as ADR 0004 (compliance automation)
and ADR 0035 (compatibility-seam governance).

## Context

The ADR corpus has grown to 47 documents. It is no longer functioning as a
decision log; it is functioning as an unbounded, append-only constraint set that
the product has outgrown. Concrete evidence from the current tree:

1. **Nothing ever exits.** 21 ADRs carry `Accepted` in their `## Status` block.
   Not one ADR carries `Superseded`, `Retired`, or `Deprecated` as its own
   status. Supersession exists only as prose buried inside *other* documents —
   ADR 0007 line 8, ADR 0028 line 73, ADR 0029 lines 52 and 61. A developer
   cannot learn that a decision is dead without reading the document that killed
   it.
2. **ADRs became specifications.** ADR 0037 is 589 lines. Several others exceed
   140. They encode endpoint paths, column names, phase sequencing, and test
   obligations. Once implementation detail is written into a governed document,
   ordinary refactoring reads as an architecture violation, and the only
   sanctioned response is to renegotiate a 500-line document.
3. **Strictness is uniform when the content is not.** "Only Inventory records
   stock effects" (ADR 0029) and "the physical `items` table remains unchanged
   in this phase" (same ADR, same authority) are graded identically. The first
   is a system invariant. The second is a snapshot of a migration phase that has
   since moved. Both are `classification: authoritative`, so a developer has no
   way to tell which lines are load-bearing.
4. **The gate has no cheap path.** `ARCHITECTURE_GOVERNANCE.md` step 3 and
   `AGENTS.md` "Planning Rules" both require an ADR create-or-update for any
   cross-boundary change. There is no lightweight amendment mechanism, so the
   marginal cost of any cross-boundary change is a full document negotiation.
   The predictable result is that people route around the boundary instead.
5. **ADR metadata is unenforced and inconsistent.** Exactly 1 of 47 ADRs is
   registered in `docs/_meta/document-registry.json`, so `npm run lint:docs`
   never validates the other 46. 19 ADRs have no front matter at all. The 28
   that do split across two incompatible schemas (`classification` vs
   `authority_level`). Eight ADR numbers are duplicated — 0010, 0022, 0023,
   0024, 0025, 0029, 0030, 0036 — so a code comment reading `ADR-0029` (there
   are two such comments in `backend/src`) does not resolve to one document.
6. **There is no index.** `docs/architecture/README.md` names exactly one ADR as
   a current planning reference. Mandatory lookup step 4, "relevant ADRs," is in
   practice a grep across 47 files.

The problem is not that governance is too strict. Boundary enforcement is
working — the guardrail scripts, the compat-seam manifest, and the allowlist
exception policy all have clear removal paths. The problem is that **ADRs apply
one permanent strictness level to a mixture of invariants, defaults, and
phase-in-time snapshots, and provide no exit.** Reducing strictness globally
would discard the enforcement that works. The correct move is to grade the
content and give it a lifecycle.

## Decision

### 1. Every Decision clause carries a strictness tier

Tiers are applied to individual clauses inside `## Decision`, not only to the
document. A single ADR normally contains clauses of more than one tier.

| Tier | Meaning | To change it |
| --- | --- | --- |
| `binding` | System invariant. Violating it is a defect, not a variation. Reserved for data-ownership truth, fail-closed security/compliance controls, money/audit integrity, and layer boundaries. | New ADR that supersedes it. Tech-lead approval. |
| `default` | The chosen approach. Do this unless the change records why not. Covers naming, module placement, contract shapes, rollout sequencing. | Amendment block on the same ADR, in the implementing PR. No new ADR. |
| `snapshot` | Describes state at a point in time (current tables, current phase, current compatibility posture). Documentation, never a constraint. | Ordinary implementation work. Update the clause when convenient; staleness is not a violation. |

Untiered clauses in existing ADRs default to `default`, **not** `binding`. This
is the single largest strictness reduction in this proposal and it is deliberate:
today every sentence is effectively binding by omission, which is why the corpus
locks people in.

Format — a tier tag at the end of the clause:

```markdown
## Decision

1. Inventory owns stock truth: `stock_movements`, `item_location_stocks`,
   location-scoped FIFO batches, transfers, receiving, and valuation.
   `[binding]`
2. Catalog ownership is introduced through module boundaries and repository
   facades before any schema split. `[default]`
3. The physical `items` table is unchanged as of Phase 13. `[snapshot]`
```

### 2. ADRs get a real lifecycle

`status` in front matter is the ADR's lifecycle state and is distinct from
`authority_level`, which is the document-authority level that
`docs/START_HERE.md` and `scripts/lint-docs.js` already define. They are not
the same axis and must stop sharing a field name's meaning.

| `status` | Meaning |
| --- | --- |
| `proposed` | Under discussion. Not a constraint on anyone. |
| `accepted` | In force at the tiers its clauses declare. |
| `amended` | Accepted, with dated amendments appended. Read the amendments last. |
| `superseded` | Replaced. Requires `superseded_by`. Must not be cited in new plans. |
| `retired` | The decision no longer applies to any live surface (feature removed, or the constraint dissolved). Requires `retired_reason`. No replacement needed. |

`retired` is new and it matters: today the only way to end a decision is to
replace it, which forces teams to invent a successor decision they do not
actually need.

### 3. Amendment is a first-class, cheap path

To change a `default` or `snapshot` clause, append to the ADR in the same PR
that implements the change. Do not open a new ADR.

```markdown
## Amendments

### 2026-07-29 — Storefront order storage
- Clause amended: Decision 3 (`default`)
- Change: Storefront orders move from `pos_transactions` to `availments`.
- Reason: unified sales reporting no longer requires shared POS storage.
- PR: #1234
```

Set `status: amended` and refresh `last_reviewed`. Tech-lead approval is not
required for `default`/`snapshot` amendments; normal code review is sufficient.
Only `binding` clauses require supersession and tech-lead approval.

### 4. Binding clauses expire unless renewed

Every ADR carries `review_by` (default: 6 months from acceptance). Past that
date without a `last_reviewed` refresh, **`binding` clauses decay to `default`**
automatically. They do not vanish, and `snapshot`/`default` clauses are
unaffected.

This inverts the current default. Today an unreviewed constraint stays maximally
strict forever, which is exactly how a 2026-03 decision ends up blocking 2026-07
work. Under this rule, the strictest tier is the one that requires ongoing
ownership to keep.

### 5. ADRs record decisions; specs live elsewhere

An ADR states context, the decision, the tier, and the consequences. Endpoint
inventories, column lists, phase plans, and test matrices belong in
`docs/features`, `docs/api`, or `docs/database`, linked from the ADR. Target
length is under 150 lines. This is a convention for new and rewritten ADRs, not
a mandate to retrofit the existing corpus.

### 6. ADR hygiene becomes machine-checked

Add `scripts/check-adr.js`, wired as `npm run check:adr` and included in
`npm run lint:docs`. It enforces:

1. Unique ADR number across the directory (currently 8 collisions).
2. Required front matter: `status`, `authority_level`, `owner`, `date`,
   `last_reviewed`, `review_by`, `topic`.
3. `status: superseded` requires `superseded_by` pointing at an existing file;
   `status: retired` requires `retired_reason`.
4. No two `accepted`/`amended` ADRs declare `binding` clauses on the same
   `topic` — the same single-authoritative-source rule `lint-docs.js` already
   applies to governed docs.
5. Tier tags resolve to one of the three known tiers.
6. Generates `docs/architecture/adr/INDEX.md`: number, title, status, topic,
   `review_by`, and binding-clause count.

The script ships in report-only mode and is promoted to a CI gate after the
backfill in the migration plan lands. Registering ADRs into
`document-registry.json` happens at that same promotion point, not before —
registering them today would fail `lint:docs` on 46 documents.

## Migration Plan

Sequenced so nothing breaks CI mid-flight.

1. **Resolve number collisions.** Renumber the 8 duplicates to free numbers
   above 0038, leaving a one-line stub at each old path pointing at the new
   number. Update the `ADR-0029` and other in-code references found in
   `backend/src`. Mechanical; no decision content changes.
2. **Backfill front matter** across all 47 ADRs on the unified schema. Set
   `review_by` to `date + 6 months`. Anything already past that date is
   accurate — those decisions genuinely have not been reviewed.
3. **Tier the top ADRs only.** Tag clauses in the ~10 ADRs actually cited by
   code and by the mandatory lookup order (0001, 0004, 0011, 0017, 0029, 0035,
   0037, and the mode ADRs). Everything else inherits `default` by the rule in
   Decision 1 and needs no edit.
4. **Sweep the dead.** Any ADR whose decision has been overtaken gets
   `status: superseded` + `superseded_by`, or `status: retired` +
   `retired_reason`. On current evidence this applies to at least the
   partially-superseded clauses in ADR 0007, 0028, and 0029.
5. **Ship `check-adr.js`** in report-only mode; generate `INDEX.md`.
6. **Promote to a gate** and register ADRs in `document-registry.json` once the
   report is clean.
7. **Update the governing docs** — `ARCHITECTURE_GOVERNANCE.md` step 3 and the
   `AGENTS.md` planning rules — so "cross-boundary requires an ADR" becomes
   "cross-boundary requires an ADR *or* an amendment block, depending on the
   tier of the clause being changed."

Steps 1, 2, 5, and 6 are mechanical. Steps 3 and 4 need architecture judgment
and are the real cost.

## Consequences

1. Developers can tell which lines are load-bearing. Most current ADR prose
   turns out to be `default` or `snapshot`, and can be changed in the PR that
   changes the code.
2. Cross-boundary work stops requiring document negotiation by default. Only
   `binding` clauses do, and those are a small minority.
3. Invariants that genuinely matter get *stronger*, because they become
   identifiable, few, owned, and periodically re-affirmed instead of drowning in
   500 lines of neighbouring detail.
4. The corpus becomes readable via `INDEX.md` and shrinks in effective size as
   superseded and retired ADRs stop being mandatory reading.
5. Ongoing cost: `review_by` renewal is real recurring work for whoever owns a
   `binding` clause. That cost is the point — an invariant nobody will re-affirm
   every six months was not an invariant.
6. Risk: tier tags can be misapplied, and a clause marked `default` that is
   truly an invariant will erode quietly. Mitigation is that the guardrail
   scripts, the compat-seam manifest, and the DB-level fail-closed triggers
   enforce the highest-stakes invariants in code, independent of ADR prose. ADR
   tiers are the human-readable layer over enforcement that already exists.
7. This ADR does not relax `ARCHITECTURE_GOVERNANCE.md` guardrails, the
   allowlist exception policy, or the Implementation Hardening Contract. Those
   are code-enforced and out of scope.

## References

1. `docs/architecture/ARCHITECTURE_GOVERNANCE.md` — mandatory process, exception
   policy
2. `docs/START_HERE.md` — authority levels and lookup order
3. `AGENTS.md` — planning rules and documentation lookup order
4. `scripts/lint-docs.js`, `docs/_meta/document-registry.json` — existing
   governed-doc validation this proposal extends
5. ADR 0004 — architecture compliance automation (precedent for process ADRs)
6. ADR 0035 — compatibility-seam governance (precedent for manifest + gate +
   removal-path design)
