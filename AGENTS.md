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
4. Relevant ADRs in `docs/architecture/adr/`
5. Domain-specific docs (`docs/features`, `docs/api`, `docs/database`, `docs/testing`)
6. Historical docs only if explicitly marked as needed

## Planning Rules
1. Do not produce an implementation plan until steps 1-4 of the lookup order are read.
2. Every implementation plan must cite authoritative docs used for decisions.
3. If docs conflict:
- `authoritative` overrides `reference`
- `reference` overrides `historical`
- `deprecated` must not be used for new design decisions
4. Cross-boundary changes require ADR update or new ADR.

## Prohibited Behavior
1. Do not treat `docs/archive/**` as a planning source.
2. Do not use deprecated docs when a `superseded_by` target exists.
3. Do not infer architecture rules from code alone when authoritative docs exist.

## Validation Before Finalizing Plan
1. Confirm architecture boundary checks that apply to the planned change.
2. Confirm documentation freshness (`last_reviewed`) for cited authoritative docs.
3. Confirm no unresolved exception/allowlist dependency is introduced without a removal plan.
