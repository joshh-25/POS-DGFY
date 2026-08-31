---
status: reference
authority_level: reference
owner: compliance
last_reviewed: 2026-08-31
applies_to: compliance_sensitive_feature_work
topic: request_time_preflight_protocol
related_adr: 0007-dual-mode-pos-compliance-program.md
---

# Request-Time Compliance Preflight Protocol

## Purpose
Ensure all compliance-sensitive feature work is classified and evaluated before implementation starts.

## Regulatory Source Chain (2026-04-07 Refresh)
1. BIR RR 7-2024, RR 11-2025, RR 26-2025
2. BIR RMO 24-2023, RMC 72-2025
3. NPC Circular 2022-04 + current NPC operational/security updates
4. BSP Circular 1049 + PSOF/MORPS framework context

Reference URLs:
- https://bir-cdn.bir.gov.ph/BIR/pdf/RR%207-2024%20%28final%29.pdf
- https://bir-cdn.bir.gov.ph/BIR/pdf/RR%2011-2025%20Digest.pdf
- https://bir-cdn.bir.gov.ph/BIR/pdf/RR%20No.%2026-2025%20Digest.pdf
- https://bir-cdn.bir.gov.ph/local/pdf/RMO%20No.%2024-2023%20Digest%20FINAL.pdf
- https://www.bir-cdn.bir.gov.ph/BIR/pdf/RMC%20No.%2072-2025%20Digest.pdf
- https://privacy.gov.ph/wp-content/uploads/2023/05/Circular-2022-04.pdf
- https://privacy.gov.ph/
- https://www.bsp.gov.ph/Regulations/Issuances/2019/c1049.pdf
- https://www.bsp.gov.ph/Regulations/Issuances/2020/1089.pdf
- https://www.bsp.gov.ph/Regulations/Issuances/2024/1191.pdf

## Mandatory Workflow
1. Classify requested work surfaces (`pos`, `terminal`, `settings`, `payments`, `compliance`).
   - Classification floor is computed from changed paths/surfaces (see `docs/compliance/compliance-classification-matrix.md`).
2. Prepare `impact_declaration` payload with:
   - `declaration_id`
   - `classification`
   - `summary`
   - `affected_surfaces`
   - `reason_codes_impacted`
   - `policy_version`
   - `verification_evidence`
   - `rollback_note`
3. Call `POST /api/v1/compliance/preflight`.
4. Execute only if response is:
   - `result=no_breach`, `can_proceed=true`.
5. Block implementation when response is:
   - `result=breach` or `result=review_required`.

### Runtime Scope Clarification
1. This preflight protocol is a feature-development governance control, not an end-user runtime UX gate.
2. Product runtime operations remain enforced by compliance policy decisions in use-cases and middleware.
3. Do not add implicit UI preflight prompts for normal tenant/admin operations unless ADR/governance explicitly changes scope.

## API Contract Summary
- Endpoint: `POST /api/v1/compliance/preflight`
- Request body keys:
  - `request_name`
  - `surfaces`
  - `setting_keys`
  - `setting_updates`
  - `requested_document_type`
  - `terminal_id`
  - `impact_declaration`
- Response keys:
  - `result`
  - `can_proceed`
  - `reason_code`
  - `decisions[]`
  - `required_actions[]`
  - `declaration_id`

## CI/Developer Gates
1. `npm run check:compliance` enforces declaration quality for sensitive file changes.
   - Enforces computed minimum classification floor from changed paths/surfaces.
   - Enforces strict preflight evidence semantics for `major|regulatory` declarations.
2. `.husky/pre-commit` enforces declaration checks on staged sensitive files.
   This is **bypassable** with `git commit --no-verify` and, as of 2026-08-07,
   is the *only* thing enforcing this — treat it as a developer convenience,
   not a gate.
3. CI does **not** currently enforce this. `pr-checks.yml`'s `changes` job has
   a blocking `check:compliance` step wired up behind
   `enforce_compliance_declarations` in
   `.github/workflows/shared-changed-paths.yml`, but `pr-checks.yml` passes it
   as `false`. It was briefly `true` the same day it was added, and was
   immediately used to block an in-flight release over two already-merged PRs
   with no fast way to clear it — see `docs/ops/RELEASE_CANDIDATE_POLICY.md`
   for the full history. Re-enabling it needs a faster path to a real
   `no_breach` result than "someone with backend access manually runs curl,"
   or the same situation recurs the next time it's flipped on.

### What the guardrail does and does not verify

The guardrail is a **document check, not a runtime check**. For a
`major|regulatory` declaration it requires four front-matter fields —
`preflight_result` (must literally equal `no_breach`), `preflight_reason_code`,
`preflight_run_at`, `preflight_request_ref` — and validates only their *shape*.
It never calls `POST /api/v1/compliance/preflight` and cannot distinguish a
recorded real preflight from a typed one.

So a passing `check:compliance` proves a declaration exists and is well-formed.
It does not prove the policy engine ever evaluated the change. If a declaration
is written without a live preflight, say so explicitly in its body rather than
leaving the front matter to imply otherwise — see
`docs/compliance/impact-declarations/2026-07-29-pos-batch-menu-import.md` for
the established shape of that caveat. Reconciling `preflight_run_at` /
`preflight_request_ref` against a real run is automated as of #1163/#1248
(2026-08-31) — see the next section — but note this section's own point still
holds regardless: `check:compliance` itself still cannot tell a reconciled ref
from a hand-typed one that merely matches the accepted pattern. Automating the
sweep closes the "nothing ever converts the placeholder" gap; it does not by
itself make `check:compliance` able to verify a ref's authenticity — that
remains open, tracked as a follow-up rather than solved here.

### Where live preflight actually runs (#884, 2026-08-22; token minting automated #1121, 2026-08-28;
### run against an ephemeral CI instance, no secrets, #1163/#1248, 2026-08-31)

The endpoint requires an authenticated session against a running backend
(`SYSTEM.EDIT_SETTINGS`), which no `develop`-merge PR ever has — so a per-PR
live call was never realistic, and #884 named the consequence: every
`major`/`regulatory` PR in the downpayment epic shipped with a
`NOT-EXECUTED-*` placeholder and no stage ever converted it to a real run.

**The resolution: a `NOT-EXECUTED-*` placeholder is the accepted, expected
state at PR-open time.** It is not a defect and `pr-reviewer` should not raise
it as a should-fix (see `.agents/skills/pr-reviewer/SKILL.md`, "Compliance").
What changed since #1121, though, is *when* it gets cleared: the sweep is no
longer a promotion-time-only step a batch can still get blocked on — it now
also runs **continuously**, triggered automatically whenever a declaration
lands on `develop` (`.github/workflows/compliance-preflight-sweep.yml`'s
`push` trigger, path-filtered to
`docs/compliance/impact-declarations/**`). In the ordinary case a
`NOT-EXECUTED-*` ref is cleared within minutes of merge, well before any
promotion is cut — the promotion-time run described below is what a promoter
still explicitly verifies (per `.agents/skills/promoter/SKILL.md`), not the
only place the sweep executes.

**No deployed host, no GitHub Environment, no secrets (#1163/#1248, 2026-08-31,
ADR 0074 Decision 5 amendment).** The original design (#1121) called for the
sweep to hit a manually provisioned bot account on `stage.dgfy.ph`, with its
credentials stored as four `PREFLIGHT_*` GitHub Environment secrets. Those
secrets were never actually provisioned — confirmed empty on both `STAGING`
and `DEV` as of 2026-08-29 (#1163) — and blocked the 2026-08-29
`develop → main` promotion outright, requiring #1007's expedited override to
ship. Investigating why led to the finding that made this section's rewrite
necessary: **a deployed host bought no compliance property to begin with.**
The endpoint evaluates the change *proposal* carried in the declaration's
`impact_declaration` payload against the target tenant's own compliance
posture — it writes nothing (no audit row is persisted), never executes the
change's code, and its response carries no server-generated request id
(`preflight_request_ref` was always entirely operator-authored). See
`docs/ops/RELEASE_CANDIDATE_POLICY.md`'s governing principle: "A merge gate
... must be satisfiable without a deployed environment, or every leg that
needs one becomes circular."

So the sweep now provisions its own throwaway target instead: it boots an
ephemeral `mysql` + `redis` + `dgfy-api` on the CI runner (the same
container-per-step pattern `promotion-quality-gate.yml` already uses), seeds a
fixture tenant + `settings:edit` bot
(`apps/dgfy-api/scripts/seed-preflight-fixture.js`, built on the existing
`provisionTenant()` service — not a new provisioning path), calls the real
endpoint over `127.0.0.1`, and tears both down at the end of the run
(`apps/dgfy-api/scripts/teardown-preflight-fixture.js`). Confirmed live
end to end (#1163/#1248 spike, 2026-08-31): a real declaration from the
2026-08-31 batch returned `result: no_breach`, `can_proceed: true` from the
real endpoint. The fixture's pinned posture
(`complianceMode: 'non_compliant'`, `plan: 'premium'`,
`subscription_status: 'active'`) is strictly more reproducible than the
deployed host it replaces — a tenant on `stage.dgfy.ph` was unpinned and drifts
with whoever last edited its settings; this one is recreated identically
every run.

`apps/dgfy-migration-runner` remains landlord-DB-only and still has no path to
create a tenant-scoped user directly — that fact hasn't changed. What changed
is that `provisionTenant()` (`apps/dgfy-api/src/services/
tenantProvisioningService.js`), already used by the real tenant-onboarding
flow, does have that path, and the seeder script above uses it. Provisioning a
bot account by hand on a real tenant is no longer part of this protocol at
all — see the note at the end of this section on what stays deleted below.

**Run it.** The primary path is now automatic (the `push` trigger above); to
run it manually (backfill, or exercising the mechanism without waiting for a
push):

```bash
gh workflow run compliance-preflight-sweep.yml
```

Mints a fresh token per declaration (`scripts/mint-preflight-token.js`,
unchanged since #1121 — it still just reads `PREFLIGHT_HOST`/
`PREFLIGHT_COMPANY_TOKEN`/`PREFLIGHT_BOT_EMAIL`/`PREFLIGHT_BOT_PASSWORD` from
env, now supplied by the fixture seeder rather than a GitHub Environment),
calls the preflight endpoint for every outstanding `NOT-EXECUTED-*`
declaration in the `develop → main` diff, and — unlike the #1121 design —
**does** write back: it reconciles `preflight_result`/`preflight_reason_code`/
`preflight_run_at`/`preflight_request_ref` into each declaration
(`scripts/reconcile-preflight-declarations.js`) and opens + auto-merges a PR
into `develop`, but only when every declaration in the run actually passed
(`result: no_breach`, `can_proceed: true`) — a real `breach`/`review_required`
result is never written over, and that declaration's `NOT-EXECUTED-*` ref
stays intact for a human to look at. The cut-branch-and-PR discipline itself
is unchanged: still never a direct commit to `develop`, this is
regulator-facing evidence and gets the same review path as everything else —
what changed is who opens and merges that PR (the workflow, once every result
passes) rather than a human every time.

For local debugging (exercising the mechanism without dispatching the
workflow — e.g. against a local `dgfy-api` you've stood up yourself), the
underlying scripts are directly runnable:

```bash
node apps/dgfy-api/scripts/seed-preflight-fixture.js   # prints PREFLIGHT_* + FIXTURE_TENANT_ID
DGFY_DEV_TOKEN=$(node scripts/mint-preflight-token.js)
```

**No `NOT-EXECUTED-*` declaration may reach `main`** — unchanged. In the
ordinary case the continuous trigger above already clears every declaration
well before a promotion is cut, so this is now rarely something a promoter
has to actively wait on; `promoter`'s own procedure still verifies zero
outstanding declarations before cutting `release/<label>`, and #1007's
phrase-gated expedited override remains the one case a `NOT-EXECUTED-*`
declaration may legitimately still reach `main`, logged and authorized, not
silent (`docs/ops/RELEASE_CANDIDATE_POLICY.md`'s 2026-08-25 amendment).

**What's deleted from this protocol, not just changed:** the manual
bot-account-provisioning procedure (register on the tenant's own
`POST /api/v1/auth/register` flow, trim `permissions` by hand, paste
credentials into a GitHub Environment); the "GitHub Environment secrets vs.
SOPS+age" storage-mechanism decision (there's no secret to store); and the
"not yet designed: rotation/revocation" open gap (there's no durable
credential to rotate — every fixture credential is generated fresh per run
and destroyed with the tenant that held it). None of these apply to the
current design; they're preserved only in this doc's own git history and in
#1121/#1163's issue history, not restated here as if still live.

## Dirty Worktree Handling
1. Use path-scoped diffs while preparing declaration evidence:
   - `git diff -- backend/src/modules/compliance`
   - `git diff -- frontend/Pages/Settings.jsx`
2. Stage only files belonging to declared surfaces.
3. If unrelated dirty files exist, do not include them in declaration evidence.
4. If declaration surfaces do not match staged sensitive files, treat as preflight failure.

## Operational Rule
When a user request conflicts with policy decisions, communicate the breach reason code first and block execution until controls are satisfied.
