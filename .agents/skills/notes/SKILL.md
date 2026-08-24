---
name: notes
description: Prime on stakeholder-meeting topics before the meeting, capture pasted notes verbatim during it with live ADR/doc conflict flagging, then compile a routed slate afterward — the Notes/Intake role from issue #331/#645. Use this whenever Pat is about to sit in a stakeholder meeting and wants repo context pre-loaded, is pasting live meeting notes a few at a time, or says a meeting has adjourned and the notes need compiling. Not for filing or editing issues directly (that's `pm`, which this role hands off to at compile) and not for implementing anything the meeting decided (that's `implement`).
---

# Notes/Intake

**Portability**: this is the canonical definition of this role (#442).
`.claude/skills/notes/SKILL.md` is a thin pointer back here — edit here, not there.

Prime → capture → compile, for one stakeholder meeting at a time on `dgfy-platform`. This is the
role named in #645, sitting **upstream** of `pm` in the #331 roster: the interval between "a
stakeholder says something" and "a correctly-shaped GitHub issue exists," previously closed by
Pat's memory and a manual re-briefing session after the fact.

## Why phase 2 is the payoff, not the note-taking

Notes can be taken in any editor. What only a primed agent can do is catch a contradiction with an
authoritative doc or an accepted ADR **while the stakeholder is still in the room**. #566 is a real
worked example of exactly this, and its own history is worth knowing rather than assuming: filed
from a 2026-08-16 product discussion, it proposed reversing ADR 0050's then-authoritative statement
that promo codes stack with affiliate discounts — and its own body records a next-day
self-correction, because the issue as first filed cited the wrong clause (`Decision 5`, unrelated,
instead of `Consequences item 5`, the actual stacking rule). A primed agent holding ADR 0050 and
its clause tiers would have caught both the reversal and the correct clause, live, instead of a day
later. **The substance has since been resolved** (PR #617, 2026-08-17): ADR 0050 was amended with a
nuanced rule — most vouchers still stack with affiliate pricing, warned — and a new ADR (0066)
governs voucher price resolution specifically, with its own `[binding]` fail-closed clause for the
one case that doesn't stack. That amendment, via a dated `## Amendments` block on the existing ADR
rather than a new superseding one, is the compile phase's R3 route working as designed — read it
(`docs/architecture/adr/0050-affiliate-buyer-facing-pricing-rule-engine.md`, `## Amendments`) as the
template for what a good routed amendment looks like. **Do not treat #566 as a currently-open
contradiction** — it stays open only because PR #617 used `Refs`, not `Closes` (correct per
`docs/process/ISSUE-TAXONOMY.md`'s linkage rule: the change needs deployed verification), so it is
mid-lifecycle, not unresolved.

## The three phases

### 1. Prime

Pat names topics before the meeting (`/notes bring me topic about the voucher and affiliates
system`). Expand each into slugs and synonyms, then run, in order:

1. `docs/architecture/adr/INDEX.md` — machine-generated, 104 lines, always current. Match on
   `Topic`/`Title`; carry `Status`, `Review by` (note the `:warning:` on passed dates), and
   **binding-clause count** per match.
2. `grep -rn '^topic:\|^applies_to:\|^related_adr:' docs` — the reliable discovery mechanism.
   **`docs/INDEX.md` is not sufficient on its own** — it omits both of the repo's own worked
   examples (affiliates, vouchers); treat a prose-index hit as a bonus, not a router.
3. Read matched ADRs in full (`status: accepted` or `amended` only) — they're short and the clause
   tiers are the point. Extract every `[binding]`/`[default]`/untagged Decision clause and every
   Consequences item verbatim; this extracted set is the entire flag corpus for phase 2. Keep
   `superseded`/`retired` ADRs as a visible do-not-cite list rather than dropping them — a
   stakeholder may cite the old number.
4. Matched docs, ranked `authoritative` > `reference`; skip `historical` unless nothing else exists.
5. `docs/compliance/impact-declarations/`, matched by `surfaces:`/`related_adr:`, for change
   history the doc corpus itself won't show.
6. **`gh issue list --search`, at least two framings per topic, always** — not optional, not
   tier-gated. Some topics have no doc or ADR yet and the whole design lives in open issues
   instead — confirmed true of vouchers as late as 2026-08-16, epic #453's early phases, before
   ADR 0066 and real code landed a day later (PR #617, Phases 101–102). A topic that looks
   uncovered by docs today can ship an ADR overnight; that's exactly why this step runs every time,
   not just when steps 1–5 came back empty. Run one `in:title` pass and one broad pass; mark
   broad-only hits **weak** — a bare `--search "voucher"` also returns unrelated tenant-schema
   issues that merely contain the word.
7. Staleness sweep — any loaded doc asserting "not implemented"/"planned" gets a quick
   `grep -ril <term> apps/*/src`; if code exists, mark that doc **SUSPECT** and drop it from the
   flag corpus rather than citing a claim the code has already falsified.
8. **Zero-coverage is a finding, not a silent empty result.** If a topic produces no doc and no
   ADR, say so explicitly and name the issue-only fallback.

**Tiers**, budget-bounded, never silently truncated — if a tier's budget would be exceeded, prune
lowest-authority items first and name what was pruned:

| Tier | Budget | What loads |
|---|---|---|
| `cheap` | ~15k | ADR index + full ADR bodies + issue **titles** only. No clause-level flagging is possible at this tier — say so if chosen |
| `stakeholder` (default) | ~50–65k | the above + matched docs + full issue **bodies**. The only tier where live flagging works |
| `implementation` | ~163k | adds API/web code. Opt-in only, not needed for a business conversation |

Never read `docs/features/IMPLEMENTATION_PHASE_LEDGER.md` whole (4,955 lines — `grep '^## Phase'`
only). Never treat `docs/archive/**` as current (AGENTS.md's Prohibited Behavior). See
`references/prime-recipes.md` for exact commands and the trap list (the space in
`docs/Radney Suggestions/`, `docs/release/` vs `docs/releases/`, ADR renumbering stubs).

**Report the prime and stop before the meeting starts.** Per topic: matched ADRs with status and
binding count, doc coverage, open-issue count, the zero-coverage and stale-doc findings, and the
searches actually run. End with one question: *is anything on the agenda missing from this list?*
— cheaper to answer now than mid-meeting as an `[UNPRIMED]` tag.

### 2. Capture

Pasted notes append to `docs/meetings/<date>-<topic-slug>.md`, **verbatim, timestamped, numbered**
(`N001`, `N002`, …) — never paraphrased, never summarized. Capture is zero-tool: no Read, no Grep,
no `gh`, during this phase. If capture needs to look something up, priming already failed at its
one job — the latency saved is the entire premise.

**The hard-conflict test**, run once per note, against the phase-1 flag corpus only (nothing
recalled from outside it qualifies):

1. The note asserts a decision or constraint — a question, complaint, or status update asserts
   nothing and never flags.
2. A loaded clause directly negates it, on the same subject.
3. The clause's source is still citable: ADR `status ∈ {accepted, amended}` (never `proposed` —
   constrains nothing — never `superseded`/`retired`, per AGENTS.md); non-ADR doc
   `authority_level ∈ {authoritative, reference}` and not marked SUSPECT.
4. Severity follows ADR 0039's tiers, and changes what the flag says, not whether it fires:
   `[binding]` (not decayed) → new superseding ADR + tech-lead approval; `[binding]` with a passed
   `review_by` → decayed to `[default]`, say so; `[default]`/untagged, including a **Consequences**
   item (untagged by construction — ADR 0039's tiers govern Decisions, not Consequences) → a dated
   `## Amendments` block on the same ADR in the same PR; `[snapshot]` → no flag.

#566 is the calibration case: its clause is an untagged Consequences item, not `[binding]` — a
test that only fired on `[binding]` clauses would have missed the one case this role exists for.

A second, independent flag — **`[FILED]`** — fires when a note re-decides something an *open
issue* already tracks as unresolved. This is the only flag type available for a topic priming found
zero-coverage on (step 8 of phase 1) — no doc or ADR exists yet to cite; treat it as first-class,
not a fallback.

One flag maximum per note. Never re-flag the same clause twice in one meeting. State the
"unprimed, no conflict-checking possible" caveat once per topic, not per note. On a fired flag,
state it and stop — no arguing, no proposing a resolution — then record whatever Pat and the
stakeholder decide, verbatim, beneath the flag.

Contradictions across notes in the same meeting resolve by timestamp: the later note wins, the
earlier is marked `superseded by N0xx`, never deleted.

### 3. Compile

Triggered only when Pat says the meeting is done — never by inactivity.

1. Backfill-prime any `[UNPRIMED]` topic now, at full depth; report any finding as a **late flag**,
   named as such rather than silently folded in as if it had been caught live.
2. Resolve the stream (later note wins on a shared subject, per above).
3. Group by root intent — not one row per note — and route each group to exactly one of: **new
   issue**, **update an existing issue**, **ADR amendment**, **docs edit**, **discard**
   (context-only; listed with its reason, never dropped silently).
4. Every new-issue candidate gets `pm`'s search-before-filing treatment first, ≥2 framings — the
   guard against the #244/#250/#280 triple-filing failure — and gets demoted to an update if a hit
   turns up. Show the searches run in the slate.
5. An issue-update route splits by authorship per
   `docs/process/ISSUE-TAXONOMY.md`'s "Updating an existing issue or epic": Pat's own issues may be
   edited; anyone else's gets a comment, never a rewrite.
6. **Emit the routed slate and stop.** One confirmation for the whole meeting, not one per item.
7. On confirmation, hand the confirmed slate to `pm` in the same session and follow its SKILL.md —
   this role never calls `gh issue create` itself. `pm`'s own checkpoints still apply regardless of
   what the slate said: closing an issue asks, bulk re-parenting an epic's children asks, editing
   another author's issue body is forbidden. Slate confirmation is not blanket approval for those.
8. Redaction pass (named individuals beyond the attendee list, tenant/customer identifiers,
   credentials, commercial terms marked off the record), one confirmation, then commit the note
   file: `docs(meetings): <date> <topic>`.

This role never edits an ADR or a governed doc itself — it produces the amendment spec and hands
the actual edit to `implement`.

## Unattended vs. checkpoint — stop and ask before proceeding

| Unattended — proceed without asking | Checkpoint — ask first |
|---|---|
| Run the prime at any tier; report it; run searches | **Committing the note file** — raw stakeholder words enter git history permanently; redaction pass first |
| Append a pasted note verbatim, timestamped and numbered, to the working-tree file | **The routed slate** — one confirmation per meeting, before anything is filed |
| Raise a `[CONFLICT]` or `[FILED]` flag against the loaded corpus, record the live resolution | **Anything `pm`'s own checkpoint table marks as a checkpoint** — closing, bulk re-parenting, editing another author's body |
| Backfill-prime an `[UNPRIMED]` topic at compile and report late findings | **Any ADR amendment or governed-doc edit** — this role writes the spec, never the edit |
| Hand the confirmed slate to `pm` in the same session | **The first live run** — see below |

## First live use

The first real meeting is capture-and-report-only: prime, capture, flags, and the slate all run,
but nothing is filed and nothing is committed until Pat has read the note file end to end and
agrees the flag calibration is right. The failure mode being calibrated against is not
under-flagging — it's **flagging too confidently in front of a stakeholder**; one false positive in
a live meeting is enough to lose the room's trust in the role. Two flags in a twelve-note meeting is
plausible; five is a bug in the hard-conflict test, not a well-governed repo. Mirrors the
calibration already used for `implement`, `pr-reviewer`, `observer`, `verifier`, and `promoter`.

## Reference files

- `references/prime-recipes.md` — copy-paste discovery commands, the tier budget table, and the
  known-traps list. Load before running a real prime, don't reconstruct these from memory.
