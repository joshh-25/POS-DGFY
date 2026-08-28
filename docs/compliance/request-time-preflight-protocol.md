---
status: reference
authority_level: reference
owner: compliance
last_reviewed: 2026-08-25
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
`preflight_request_ref` against a real run remains a human step.

### Where live preflight actually runs (#884, 2026-08-22; token minting automated #1121, 2026-08-28)

The endpoint requires an authenticated session against a running backend
(`SYSTEM.EDIT_SETTINGS`), which no `develop`-merge PR ever has — so a per-PR
live call was never realistic, and #884 named the consequence: every
`major`/`regulatory` PR in the downpayment epic shipped with a
`NOT-EXECUTED-*` placeholder and no stage ever converted it to a real run.

**The resolution: a `NOT-EXECUTED-*` placeholder is the accepted, expected
state for a `develop`-targeting PR.** It is not a defect and `pr-reviewer`
should not raise it as a should-fix at that stage (see
`.agents/skills/pr-reviewer/SKILL.md`, "Compliance"). The real preflight runs
once per promotion batch, before `release/<label>` is cut — since ADR 0074/#980
(2026-08-25), that means the `develop → main` leg by default, or the
`develop → staging` leg first if a promoter chooses the optional soak for that
batch — against a **deployed non-production host**. **Target STAGING** (#1121,
2026-08-28) — DEV is being made optional and intentionally allowed to go stale
(#982), so it can no longer be assumed to reflect anything current; STAGING is
named first here ahead of #982's own docs amendment landing, per Pat's explicit
redirect on #1121. DEV remains named below only as a still-valid fallback for
testing the mechanism itself. Note both hosts share a real, unresolved
limitation: `docs/ops/DEV_STAGING_ENVIRONMENT_HEALTH_2026-08-08.md` (#304,
diagnosed not fixed) found the office network path truncates large responses on
both `dev.dgfy.ph` and `stage.dgfy.ph` — this doesn't affect the small JSON
calls below, but is worth knowing if either host looks unreachable for a larger
request. The endpoint evaluates the change *proposal* carried in the
declaration's `impact_declaration` payload against the policy engine; it does
not need the change's code to be running anywhere, so the target host's
currently-deployed version is irrelevant and production is never required.
`.agents/skills/promoter/SKILL.md` owns the executable form of this sweep;
`docs/ops/RELEASE_CANDIDATE_POLICY.md`'s 2026-08-22 amendment (superseded in
part by its 2026-08-25 amendment) owns the ladder this sits in.

**Minting `DGFY_DEV_TOKEN` is automated (#1121).** The primary path is
dispatching `.github/workflows/compliance-preflight-sweep.yml`:

```bash
gh workflow run compliance-preflight-sweep.yml -f environment=STAGING
```

It mints a fresh token per declaration (via `scripts/mint-preflight-token.js`,
below) from credentials held only in that GitHub Environment's own secrets —
never a human's or Claude's local shell — calls the preflight endpoint for
every outstanding `NOT-EXECUTED-*` declaration in the `develop → main` (or
`develop → staging`) diff, and writes the results to the run's step summary
and a `compliance-preflight-sweep-results` artifact. It does **not** write
back to the declaration files or open a PR — reconciling
`preflight_result`/`preflight_reason_code`/`preflight_run_at`/
`preflight_request_ref` from that artifact into each declaration, and landing
it via a cut branch + PR into `develop`, stays a separate step (unchanged from
before, see below).

For local debugging only (e.g. exercising the mechanism against DEV without
dispatching the workflow), mint a token directly:

```bash
DGFY_DEV_TOKEN=$(node scripts/mint-preflight-token.js)
```

`scripts/mint-preflight-token.js` reads `PREFLIGHT_HOST`,
`PREFLIGHT_COMPANY_TOKEN`, `PREFLIGHT_BOT_EMAIL`, `PREFLIGHT_BOT_PASSWORD` from
the environment and logs in as the dedicated, least-privilege bot account
(`SYSTEM.EDIT_SETTINGS` only, never `role: admin`) via
`POST /api/v1/auth/login`, printing only the resulting JWT to stdout. Neither
this script nor the workflow above stores, caches, or reuses a token — a fresh
one is minted per call, matching the 24h `JWT_EXPIRY` default
(`apps/dgfy-api/src/services/authService.js`) and the "cheap to mint, lower
exposure than a long-lived token" reasoning #1121 raised.

**Provisioning the bot account itself is a manual, one-time step, not part of
this automation** — `authService.loginUser`'s `requireTenantAuthContext()`
resolves a **per-tenant** database connection from the `x-company-token`
header, and `apps/dgfy-migration-runner` (the only migration/seed tooling this
repo has) is scoped to the **landlord** database only
(`apps/dgfy-migration-runner/README.md`) — it has no path to create a
tenant-scoped user. Create the account through the tenant's own existing
user-management flow instead (`POST /api/v1/auth/register`, or the
invite/`accept-invite` pair), then edit its `permissions` down to exactly
`["settings:edit"]` via the existing user-management surface — never leave it
on a broader role. Record the chosen tenant and its `x-company-token` value as
`PREFLIGHT_COMPANY_TOKEN` alongside the bot's `PREFLIGHT_BOT_EMAIL`/
`PREFLIGHT_BOT_PASSWORD` in the target GitHub Environment's secrets (`STAGING`,
and optionally `DEV` for testing this workflow) — never in this repo.

**No `NOT-EXECUTED-*` declaration may reach `main`** — the promotion-time sweep
must have reconciled every one in the batch first, unless `promoter`'s #1007
phrase-gated expedited override is explicitly invoked for that specific
promotion (`docs/ops/RELEASE_CANDIDATE_POLICY.md`'s 2026-08-25 amendment — the
one case where a `NOT-EXECUTED-*` declaration may legitimately still reach
`main`, logged and authorized, not silent).

Recipe (adapted from the worked example in
`docs/compliance/impact-declarations/2026-08-07-pos-sentry-independent-debugging.md`,
run once per outstanding declaration in the batch):

```bash
curl -sS -X POST https://<target-host>/api/v1/compliance/preflight \
  -H 'Content-Type: application/json' \
  -H "x-company-token: ${PREFLIGHT_COMPANY_TOKEN}" \
  -H "Authorization: Bearer ${DGFY_DEV_TOKEN}" \
  -d '{
    "request_name": "<PR title or declaration_id>",
    "surfaces": [<declaration.surfaces>],
    "impact_declaration": { <the declaration'"'"'s own fields, verbatim> }
  }'
```

Note the `x-company-token` header — the original recipe omitted it, but the same tenant-resolution
middleware that requires it for the login call above (`requireTenantAuthContext()`) also gates
`/api/v1/compliance/preflight` itself, so it's required here too.

Record the response's `result`, `reason_code`, and a run timestamp into the
declaration's `preflight_result` / `preflight_reason_code` / `preflight_run_at`
/ `preflight_request_ref` fields, replacing the `NOT-EXECUTED-*` placeholder.
**Land the reconciled front matter via a small cut branch and PR into
`develop`, never a direct commit** — the same cut-branch discipline
`RELEASE_CANDIDATE_POLICY.md`'s hotfix/back-port amendment already requires
for anything landing on `develop` outside the normal feature-PR path; this is
regulator-facing evidence and gets the same review, not an exception. Merge
that PR before `release/<label>` is cut (or before `to-staging/<label>`, if
the optional soak is used for this batch). If the response is
`breach` or `review_required`, do not write `no_breach` — record the actual
result and treat the change as blocked from promotion pending review, per the
Mandatory Workflow above.

## Dirty Worktree Handling
1. Use path-scoped diffs while preparing declaration evidence:
   - `git diff -- backend/src/modules/compliance`
   - `git diff -- frontend/Pages/Settings.jsx`
2. Stage only files belonging to declared surfaces.
3. If unrelated dirty files exist, do not include them in declaration evidence.
4. If declaration surfaces do not match staged sensitive files, treat as preflight failure.

## Operational Rule
When a user request conflicts with policy decisions, communicate the breach reason code first and block execution until controls are satisfied.
