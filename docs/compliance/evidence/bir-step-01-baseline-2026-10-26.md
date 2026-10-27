---
status: reference
authority_level: reference
owner: architecture
last_reviewed: 2026-10-26
applies_to: opis_pos_bir_step_01_baseline
topic: opis_pos_bir_step_01_baseline
related_adr: 0007-dual-mode-pos-compliance-program.md,0014-multi-template-modes-pos-offline-sync-and-storefront-cache-contracts.md,0042-bir-rmo-24-2023-fiscal-document-and-accreditation-closure.md,0045-shared-pos-receipt-renderer.md,0087-dedicated-back-office-fourth-frontend-app-opis.md
---

# OPIS & POS BIR Step 01 Baseline Evidence

Date: 2026-10-26

## Scope

This records the Step 01 source-completeness, build, test, database, and local-runtime
checks executed against the current working checkout. It is evidence for the G0 gate only;
it is not fiscal certification or BIR accreditation evidence.

## Source revision and completeness

- Repository: `POS-DGFY`
- HEAD: `d56cee18700989e75fac3ba8c1fce334c6224145`
- Branch: `codex/updates-pos`
- Working tree: not clean; pre-existing user changes remain, and Step 01 added only the
  narrow POS controller-facade/test-mock compatibility repair described below.
- Present source units: `apps/dgfy-pos`, `apps/dgfy-opis`, `apps/dgfy-api`,
  `apps/dgfy-migration-runner`, `packages/pos-receipt`, `packages/web-core`, and
  `packages/shared-constants`.
- `docs/ai/PR.md` is present in the complete checkout.
- The plan's ZIP description is therefore stale for this checkout; no source restoration
  was required during Step 01.
- The original `OPIS_POS_BIR_SOURCE_AUDIT_2026-10-26.md` was not available in the
  supplied Downloads/workspace paths. An independent current-checkout replacement audit is
  recorded at [OPIS_POS_BIR_SOURCE_AUDIT_2026-10-26.md](OPIS_POS_BIR_SOURCE_AUDIT_2026-10-26.md);
  it does not claim to reproduce the missing A01–A15 findings.

## Validation executed

| Check | Result |
|---|---|
| `npm run check:architecture` | PASS — architecture guardrails and controller boundaries |
| `npm run lint:docs` | PASS — governed docs and 106 ADRs |
| `npm run check:compliance` | BLOCKED — Docker-backed local preflight could not run because Docker Desktop's engine/service is unavailable |
| POS, OPIS, Storefront, and IMS production builds | PASS |
| POS Vitest suite | PASS — 15 files / 60 tests |
| OPIS Vitest suite | PASS — 41 files / 178 tests |
| Backend BIR/compliance/fiscal/offline-focused run | PASS — 29 suites / 234 tests |
| Local migration status | PASS — all discovered migrations are `up` |
| MySQL | PASS — listener on `3306` |
| Local runtime health | PASS — ports `5000`, `5101`, `5173`–`5177` returned HTTP 200; Redis connected and the bounded local profile is within MySQL `151` |
| `git diff --check` | PASS |

## Superseding local-only closure — 2026-10-27

The Docker-backed result above records the environment available during the
2026-10-26 baseline run. It is superseded for this local change by the direct
authenticated worktree preflight on `127.0.0.1:5002`, which returned HTTP 200,
`result=no_breach`, `can_proceed=true`, and `reason_code=ALLOWED` for all three
current sensitive declarations. No staging or deployed environment was used.

## Baseline repair, blockers, and observations

1. Step 01 repaired the POS controller facade by exposing the already-imported
   `completeDirectDeliveryOrder` and `failDirectDeliveryOrder` handlers, and updated the
   route-test auth mock with the existing `invalidateUserCache` export. The focused void/
   refund transport suite then passed all 13 tests. No financial logic or schema changed.
2. The original source-audit file was not available. The independent replacement audit
   records the current source findings and keeps the original A01–A15 distinction explicit.
3. The local API starts and answers health checks. Redis was started on `127.0.0.1:6379`, and
   the bounded local test profile reports `10 tenants x 4 + 20 landlord = 60`, within MySQL
   `max_connections=151`. The final release environment must be checked independently.
4. The compliance gate requires local preflight reconciliation for the pre-existing sensitive
   working-tree changes declared in `2026-10-26-pre-existing-payment-rbac-esales-hardening.md`.
   The sanctioned Docker-backed reconciler could not run because Docker Desktop's Linux engine
   and Windows service were unavailable. This is not caused by the Step 01 repair.
5. Runtime logs are retained locally under `.tmp/dev-stack/`; no secrets or credentials are
   included in this evidence document.

## G0 decision

**G0: Code/test baseline PASS; release-evidence HOLD.** The source baseline is complete and
launchable, all targeted critical suites execute and pass, migrations are up, the source audit
has an independent replacement, and the local Redis/connection-budget profile is healthy.
The historical Docker hold is no longer a local implementation blocker. Formal
release/regulatory evidence remains a separate later gate.

## Next step

Step 02 may prepare the reviewed `FISCAL_DOCUMENT_SPEC_V1.md`, but implementation of tax,
numbering, discount, or fiscal-print behavior remains gated on that specification and external
tax/accounting review. No legal requirement or statutory rate is inferred by this baseline.
