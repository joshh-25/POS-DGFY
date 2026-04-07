---
status: historical
owner: compliance
last_reviewed: 2026-04-07
topic: compliance_pr_merge_packet
related_adr: 0007-dual-mode-pos-compliance-program.md
---

# Compliance PR Body, Strict Latest-State Merge Checklist, and Parallel Backlog

## Historical Record Note
This document is retained for traceability of the April 7, 2026 cleanup lane.

Final merged state:
1. Merged commit on `master`: `2c3a8a23c713abef01055899a1d4e2c72f4aec93`
2. CI status: passed (GitHub Actions run `24062846216`)
3. Branch-specific instructions in this file (`feat/compliance-clean`, `wip/parallel-changes`) are historical and no longer active workflow guidance.

## Authoritative Basis
1. `docs/START_HERE.md` (authoritative, last_reviewed 2026-03-06)
2. `docs/architecture/ARCHITECTURE_BOUNDARIES.md` (authoritative, last_reviewed 2026-03-06)
3. `docs/architecture/ARCHITECTURE_GOVERNANCE.md` (authoritative, last_reviewed 2026-03-06)
4. `docs/architecture/adr/0007-dual-mode-pos-compliance-program.md` (Accepted, updated 2026-04-07)

## PR Body (Ready to Paste)

### Title
`Dual-mode compliance hardening: clean split delivery with latest-safe validation`

### Change Classification
- `cross-boundary`

### Summary
This PR delivers the compliance hardening stack on a clean lane (`feat/compliance-clean`), split from unrelated work parked in `wip/parallel-changes`.

Delivered scope is aligned with ADR 0007 and includes:
1. compliance core + verification model,
2. runtime enforcement across POS/settings/payments/tenant lifecycle,
3. admin verification workflows,
4. compatibility and regression tests,
5. governance + declaration + preflight guardrails.

### Branch Hygiene and Scope Control
1. Safety snapshot preserved: `backup/all-dirty-2026-04-07`.
2. Parallel/unrelated edits isolated: `wip/parallel-changes`.
3. Compliance-only lane shipped: `feat/compliance-clean`.
4. Latest-state check completed: `origin/master...feat/compliance-clean = 0 5` (not behind).

### Stacked Commits and Finding Coverage
| Commit | Functional Intent | Findings Addressed |
|---|---|---|
| `222ebc7` | Compliance domain + lifecycle + verification core + migrations | Loophole resistance, irreversible mode state enforcement, verification trust model |
| `6749a77` | Runtime wiring across tenant/settings/POS/payments + document contract | Strict-toggle retirement path, non-fiscal/fiscal contract enforcement, cache/read consistency |
| `6690e53` | Platform admin compliance verification workflows | User readiness for verifier operations and operational activation path |
| `c441c54` | Integration/test compatibility updates | Regression containment, lifecycle and policy behavior verification |
| `ce49e93` | CI/pre-commit/docs governance and declarations | Guardrail depth, governance traceability, compliance preflight enforcement |

### One-by-One Finding Mapping (From Worktree Remediation Plan)
| Finding | Risk | Concrete Resolution in This PR |
|---|---|---|
| 1. Mixed-scope dirty tree | Review ambiguity and regression risk | Split to `feat/compliance-clean` vs `wip/parallel-changes`; deterministic lane isolation documented in `docs/archive/compliance/2026-04-07/worktree-remediation-manifest-2026-04-07.md` |
| 2. Untracked compliance files | Missing production behavior despite passing review | Included and wired via stacked commits (migrations, models, module index, routes, validators, frontend service/UI) |
| 3. Unrelated docs/test-history churn | Policy drift and noisy diff | Removed from compliance lane, preserved in `wip/parallel-changes` |
| 4. Mixed cross-cut integrations | Hidden dependency breaks | Kept only required adjacent integrations (tenant/settings/POS/admin/tests) and pruned unrelated image utility coupling |
| 5. Latest-version drift | Merge conflict/stale behavior | Latest-sync validation done; branch not behind `origin/master` |
| 6. EOL/format churn noise | Review friction and accidental rewrites | Non-functional churn excluded from compliance lane |
| 7. Gate inconsistency | False confidence | Full matrix executed on compliance lane (architecture, compliance, docs lint, backend/frontend lint+test, frontend build) |
| 8. Governance traceability gaps | Review rejection | ADR/control-matrix/preflight/declaration artifacts included and aligned with accepted ADR 0007 |

### ADR 0007 Acceptance Criteria Coverage
| ADR Acceptance Criterion | Evidence Path |
|---|---|
| 1. No self-attested path to `compliant_active` | compliance verification states in compliance module + migration + policy tests |
| 2. Non-compliant tenants cannot emit fiscal output | POS usecase + receipt rendering contract updates + frontend terminal contract tests |
| 3. Terminal-required classes enforced with shared fallback | policy engine + policy engine tests |
| 4. Legacy mode choice enforced once and irreversible | tenant state fields + transition guard layers + lifecycle tests |
| 5. Deterministic denials with reason codes | compliance policy constants/engine + middleware/usecase contracts |
| 6. Compliance-sensitive diffs fail without declaration quality | `scripts/check-compliance-impact.js`, `.husky/pre-commit`, `.github/workflows/ci.yml` |
| 7. Architecture/compliance/docs gates mandatory | matrix outputs and CI policy changes |

### Validation Matrix (Executed on `feat/compliance-clean`)
1. `npm run check:architecture` passed.
2. `npm run check:compliance` passed.
3. `npm run lint:docs` passed.
4. `npm -C backend run lint` passed.
5. `npm -C backend test` passed.
6. `npm -C frontend run lint` passed.
7. `npm -C frontend test` passed.
8. `npm -C frontend run build` passed.

### Rollback Notes
1. Revert top commit first for docs/governance rollback (`ce49e93`), then descend commit stack by functional slice.
2. If runtime rollback is required, revert from `6749a77` then `222ebc7`, then apply migration rollback sequence in reverse order under release policy.
3. Do not violate DB irreversible mode transition trigger constraints when performing partial rollback.

## Strict Latest-State Merge Checklist (Project Must Stay Latest)

### A. Pre-Merge Synchronization
1. `git fetch origin --prune`
2. `git checkout feat/compliance-clean`
3. `git rev-list --left-right --count origin/master...feat/compliance-clean`
4. If left count is non-zero (branch behind):
- `git rebase origin/master`
- resolve conflicts preserving architecture flow (`routes -> controllers -> usecases -> repositories -> models`)
- rerun full validation matrix

### B. Mandatory Re-Validation on Latest HEAD
1. `npm run check:architecture`
2. `npm run check:compliance`
3. `npm run lint:docs`
4. `npm -C backend run lint`
5. `npm -C backend test`
6. `npm -C frontend run lint`
7. `npm -C frontend test`
8. `npm -C frontend run build`

### C. Merge Safety Rules
1. Do not squash this PR; preserve stacked commit rollback boundaries.
2. Confirm no untracked or unstaged changes:
- `git status --short`
3. Confirm latest-state before merge (left count must remain `0`):
- `git rev-list --left-right --count origin/master...feat/compliance-clean`
4. Merge into master with preserved history:
- `git checkout master`
- `git pull --ff-only origin master`
- `git merge --no-ff feat/compliance-clean`
- `git push origin master`

### D. Post-Merge Validation
1. Confirm CI green on merged `master`.
2. Tag release candidate only after CI completion and deployment smoke checks.

## Separate Follow-up Ticket Backlog for `wip/parallel-changes`

### PAR-001: Storefront Image Utility Integration
- Branch source: `wip/parallel-changes`
- Files: `frontend/src/utils/imageUrl.js`, `frontend/src/features/pos/utils/posImageState.js`, store app image component/tests
- Objective: land image URL and fallback behavior as a dedicated feature PR
- Acceptance:
1. tests for POS/store image fallback pass,
2. no impact on compliance receipt/mode contracts,
3. no new dependencies added to compliance lane.

### PAR-002: Vite Config Alignment Across Apps
- Files: `frontend/apps/pos/vite.config.js`, `frontend/apps/skupervisor/vite.config.js`, `frontend/apps/store/src/main.jsx`
- Objective: isolate and validate bundler/runtime config changes
- Acceptance:
1. all app builds pass,
2. no route or environment regression,
3. performance baseline captured pre/post.

### PAR-003: Documentation Churn Normalization
- Files: `README.md`, `CLAUDE.md`, `backend/CREDENTIALS.md`, `docs/setup/ADMIN_SETUP.md`, `docs/development/environment-setup.md`
- Objective: reconcile large doc rewrites against authoritative architecture/compliance docs
- Acceptance:
1. docs lint passes,
2. no contradiction with `docs/START_HERE.md` and architecture governance,
3. security-sensitive setup text reviewed.

### PAR-004: Testing-History Doc Cleanup
- Files: `docs/testing/*.md` and `docs/archive/testing/*`
- Objective: move historical records to archive, keep active readiness docs minimal and current
- Acceptance:
1. active docs contain only current release evidence,
2. archival status/front matter correct,
3. links remain valid.

### PAR-005: Parallel Branch Integration Protocol
- Objective: rebase `wip/parallel-changes` on latest `master` and split into small PRs
- Acceptance:
1. no PR mixes docs, build tooling, and image features in one diff,
2. each PR has focused tests,
3. each PR passes architecture/compliance checks when touching sensitive surfaces.
