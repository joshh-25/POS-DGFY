# POS E2E UAT Evidence Template

Status: in_progress

Use this template to append evidence to `docs/testing/pos-e2e-uat-run-2026-03-28.md` (or a new dated run file).

## 1) Metadata

- Date:
- Environment:
- Tenant/company token:
- Cashier tester:
- Admin tester:
- App commit SHA:

## 2) Preconditions

| Check | Result (PASS/FAIL) | Evidence |
|---|---|---|
| `doctor:runtime` healthy |  |  |
| `smoke:pos-local` all `200` |  |  |
| POS prerequisites (VAT items, stock, roles) |  |  |

## 3) Admin Scenarios

| Scenario | Result (PASS/FAIL) | Evidence | Notes |
|---|---|---|---|
| POS Setup save/reload |  |  |  |
| Dual-mode compliance blocking (`compliant_pending`/`compliant_active`) |  |  |  |
| Dual-mode compliance recovery after required field fix |  |  |  |
| Non-compliant continuity (`non_fiscal_slip` contract) |  |  |  |
| Terminal identity policy response (`warn`/`enforce`) |  |  |  |

## 4) Cashier Scenarios

| Scenario | Result (PASS/FAIL) | Evidence | Notes |
|---|---|---|---|
| Mixed VAT cart + checkout |  |  |  |
| Receipt compliance and VAT lines |  |  |  |
| Stock deduction after checkout |  |  |  |
| POS History filters + reprint |  |  |  |
| Z-reading reconciliation |  |  |  |

## 5) Sales Scenarios

| Scenario | Result (PASS/FAIL) | Evidence | Notes |
|---|---|---|---|
| POS row visible in unified sales |  |  |  |
| History-to-Sales handoff query fidelity |  |  |  |
| Sales CSV export correctness |  |  |  |
| POS source-separation filter parity (History vs Sales) |  |  |  |
| CSV `pos_order_source` channel auditability |  |  |  |

## 6) Blocker Ledger

| Blocker ID | Class (`ENV_BLOCKER`, `DATA_SETUP_BLOCKER`, `UX_BLOCKER`, `LOGIC_BLOCKER`, `SECURITY_BLOCKER`) | Description | Owner | Status |
|---|---|---|---|---|
|  |  |  |  |  |

## 7) Signoff

- Cashier signoff: PASS / FAIL
- Admin signoff: PASS / FAIL
- Final readiness recommendation: PASS / FAIL
