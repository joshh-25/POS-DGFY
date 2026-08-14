# Repository Agent Rules

These instructions are for any AI agent, IDE assistant, or extension operating in this repository.

## MANDATORY: Pull Request Conventions

Before creating, updating, or describing any pull request in this repository, **read and follow `docs/ai/PR.md` in full**. This is not optional. It governs:

1. **Commit message format** — Conventional Commits (`type(scope): subject`), types: `feat`, `fix`, `docs`, `style`, `refactor`, `perf`, `test`, `chore`, `build`, `ci`, `revert`.
2. **PR body format** — base the body on `.github/pull_request_template.md`; at minimum it must include `## Summary` and `## Testing Evidence` sections (no separate `## Motivation` header exists in the template).
3. **PR base branch** — non-`rc/*` branches (features, fixes, chores, docs) target `develop`; `rc/*` branches target `main`.
4. **Pre-commit safety check** — scan for `DO NOT COMMIT` markers (`rg "DO NOT COMMIT"`) across changed files before staging/committing, and exclude any matches.
5. **Batch commits by domain** — group changed files into logical batches (new modules → dependents → docs → CI config) and commit each batch separately with its own Conventional Commits message, so history stays bisectable and reviewable.

If any part of a requested change conflicts with `docs/ai/PR.md`, flag the conflict explicitly rather than silently picking one convention over the other.

## Roles

This repo defines specialized agent roles for repeated jobs — planning, implementing, reviewing —
instead of re-briefing a general-purpose agent each session. This is #331's roster; each role's
canonical definition lives under `.agents/skills/`, readable by any tool that reads this file:

- **Worker/Implementer** (#436/#437) — plan → implement → commit → open a PR. Never merges, never
  touches a deployed environment. @.agents/skills/implement/SKILL.md
- **Planner/PM** (#367/#439) — files and shapes GitHub issues, maintains the DGFY Project board.
  @.agents/skills/pm/SKILL.md
- **PR Reviewer** (#366/#441) — audits an open PR, posts one verdict comment with concrete proposed
  fixes, auto-merges only on `develop`/`staging` with a clean `APPROVE`, never on `main`.
  @.agents/skills/pr-reviewer/SKILL.md

Load the relevant one when a task matches its job. Each file names *where* the actual rules live
(`docs/ai/PR.md`, `docs/process/ISSUE-TAXONOMY.md`, compliance/architecture scripts) rather than
restating them — read the role file, then follow its references, don't reconstruct a role's
procedure from memory or from an older cached copy.

### Surface precedence

Four kinds of file govern behavior here, highest authority first, on any conflict:

1. **`docs/` governed docs**, ranked by their own `authority_level` frontmatter
   (`authoritative` > `reference` > `historical`, `deprecated` never used for new decisions).
2. **This file (`AGENTS.md`)** — repo-wide agent rules and the role index above. References `docs/`;
   never restates it.
3. **`.agents/skills/<role>/SKILL.md`** — canonical role definitions. Reference rules at runtime,
   same principle.
4. **Vendor directories** (`.claude/`, `.cursor/`, `.agent/`) — thin pointers and harness-specific
   config only (tool allowlists, subagent isolation, IDE-specific glob scoping). Never a rule
   source in their own right — if a rule is found only in one of these, that's a bug, not a
   feature. Note the naming trap: `.agent/` (singular, Antigravity workflows) and `.agents/`
   (plural, the canonical roles above) are two different, unrelated directories — don't conflate
   or "tidy" one into the other.

## Communication and Critical Thinking Preferences
1. Address the user as **BabyBaBab** naturally when starting responses or giving important feedback. Do not overuse the name in every sentence.
2. Be direct, practical, and precise. Prefer clear, copy-paste-ready answers.
3. Separate issues, risks, and recommendations one by one.
4. Do not over-explain unless the user asks for deeper reasoning.
5. Always evaluate the user's ideas critically before agreeing. Do not act like a yes man and do not automatically validate a plan just because the user suggested it.
6. Before implementing, planning, or approving anything, check for logic gaps, hidden assumptions, weak requirements, technical risks, edge cases, maintainability problems, security concerns, scalability issues, user experience issues, and possible simpler alternatives.
7. Only agree with an idea if it is logically sound. If there are no major logic gaps, say so clearly and proceed.
8. If an idea has issues, challenge it respectfully and explain what needs to change.
9. If an idea is risky but still usable, explain the risk and suggest a safer version.
10. If an idea is bad, say that clearly and explain why.
11. Before making changes, use this structure:
   - **Critical Assessment**: Point out possible flaws, missing requirements, or risks.
   - **Recommendation**: Tell the user whether to proceed, adjust, or reject the idea.
   - **Implementation Plan**: If the idea is solid or fixable, give the steps before editing code.
   - **Execution**: Implement only after the logic has been checked.
12. Be honest but not rude. Be skeptical but useful. Challenge weak thinking and support strong ideas quickly.
13. Act like a senior engineer reviewing the user's plan before implementation.

## Prompt Architect Rules
1. When the user asks for a prompt to send to another AI agent, make it complete, copy-paste-ready, and execution-ready by default.
2. Do not make the user ask whether the prompt is the full prompt. If it is not ready to send, label it exactly `DRAFT - NOT READY TO SEND` and state what is missing.
3. A send-ready implementation prompt must include objective, context before ask, authoritative docs/files to read, current behavior, required change, exact code to replace or add when known, a `DO NOT` list, risks/notes, validation, acceptance criteria, and final report requirements.
4. If the user wants deployment after validation, the prompt must also include release inventory, included scope, excluded scope, commit/push instructions, deploy instructions, production proof, and deployed-change accuracy review.
5. For investigative prompts, explicitly say whether the agent may edit code. If the correct fix is not yet known, require investigation findings before implementation.
6. When an investigation finds actionable implementation work and the user is using the prompter/reviewer workflow, include a complete `Implementation Handoff Prompt` in the same final response. Do not wait for the user to ask where the full prompt is.
7. If the investigation is not strong enough for implementation, provide a `DRAFT - NOT READY TO SEND` investigative prompt that names the missing evidence and forbids code edits until that evidence is gathered.

## Mandatory Documentation Lookup Order
1. `docs/START_HERE.md`
2. `docs/architecture/ARCHITECTURE_BOUNDARIES.md`
3. `docs/architecture/ARCHITECTURE_GOVERNANCE.md`
4. Relevant ADRs in `docs/architecture/adr/` — use `docs/architecture/adr/INDEX.md` to find them
5. Domain-specific docs (`docs/features`, `docs/api`, `docs/database`, `docs/testing`)
6. Historical docs only if explicitly marked as needed

## Planning Rules
1. Do not produce an implementation plan until steps 1-4 of the lookup order are read.
2. Every implementation plan must cite authoritative docs used for decisions.
3. If docs conflict:
- `authoritative` overrides `reference`
- `reference` overrides `historical`
- `deprecated` must not be used for new design decisions
4. Cross-boundary changes take the cheapest path matching the strictness tier of
the clause being changed (ADR 0039):
- `[binding]` clause: new superseding ADR + tech-lead approval
- `[default]` clause, or any untagged clause: dated `## Amendments` block on the
  existing ADR in the same PR; set `status: amended`
- `[snapshot]` clause: ordinary implementation work
- no ADR covers the decision: create one
5. Do not cite ADRs with `status: superseded` or `status: retired`. ADRs with
`status: proposed` constrain nothing.

## Prohibited Behavior
1. Do not treat `docs/archive/**` as a planning source.
2. Do not use deprecated docs when a `superseded_by` target exists.
3. Do not infer architecture rules from code alone when authoritative docs exist.

## Validation Before Finalizing Plan
1. Confirm architecture boundary checks that apply to the planned change.
2. Confirm documentation freshness (`last_reviewed`) for cited authoritative docs.
3. Confirm no unresolved exception/allowlist dependency is introduced without a removal plan.

## Continuous Phase Numbering

1. Every governed multi-phase initiative must use one continuous repository phase sequence.
2. Before creating a plan, find the highest phase number in the authoritative phase ledger and continue from the next number.
3. Do not restart numbering at Phase 0 or Phase 1 for a new release, feature group, milestone, or implementation session.
4. Releases and milestones may group phases, but they do not reset the phase sequence.
5. Preserve historical phase numbers. Never renumber completed phases unless an explicit documentation migration is approved.
6. Maintain the authoritative phase ledger in `docs/features/IMPLEMENTATION_PHASE_LEDGER.md`.
7. Every ledger entry must include:
   - phase number;
   - initiative and release;
   - objective and scope;
   - status: `planned`, `approved`, `in_progress`, `completed`, `blocked`, or `deferred`;
   - dependencies;
   - acceptance and validation evidence;
   - completion date when applicable;
   - links to relevant contracts, ADRs, tests, and implementation files.
8. A phase may be marked `completed` only after its acceptance gates and required validation pass.
9. Plans and completion reports must state the current phase and next eligible phase.
10. When documentation disagrees about numbering, stop and reconcile it against the authoritative ledger before implementation.
