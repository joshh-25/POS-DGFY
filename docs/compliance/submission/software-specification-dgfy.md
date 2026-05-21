# DGFY Software Specification Packet

Last updated: 2026-04-22
Owner: Engineering / Compliance

## 1. Product Scope
SKU Inventory Manager supports dual-mode compliance lifecycle:
1. `non_compliant_active`
2. `compliant_pending`
3. `compliant_active`

Lifecycle is governed toward compliant states with controlled downgrade exceptions enforced by policy and database constraints:
1. Platform force: `POST /api/v1/admin/tenants/:id/force-non-compliant`
2. Tenant one-per-cycle revert: `POST /api/v1/compliance/mode/revert-to-non-compliant`

## 2. Runtime Architecture
Module boundary contract:
`routes -> controllers -> usecases -> repositories -> models`

Primary compliance runtime modules:
- `backend/src/modules/compliance/**`
- `backend/src/modules/pos/**`
- `backend/src/modules/reports/**`
- `frontend/src/features/compliance/**`
- `frontend/src/features/pos/**`

## 3. Compliance-Critical Runtime Contracts
1. Activation confirmation:
- `POST /api/v1/compliance/activate`
- Requires `confirmation_text = "ACTIVATE COMPLIANT"`

2. Checklist API:
- `GET /api/v1/compliance/checklist`
- Includes guided requirements, section progress, blockers, and documentary readiness.

3. Receipt contract:
- Server-controlled fiscal/non-fiscal contract and document context enforcement.
- Non-fiscal context displays explicit non-fiscal marker.

4. POS non-volatile operation replay:
- Idempotency-backed replay for shift open/cash events/shift close/order status update.
- Browser queue and backend replay store prevent duplicate mutations.

5. Security incident audit evidence:
- Immutable `security_signal` audit events.
- Admin acknowledgment and resolution append additional audit entries.

6. Compliance package export:
- `GET /api/v1/reports/compliance-package`
- `GET /api/v1/reports/compliance-package/export`
- Submission manifest includes checksums for filing integrity.

## 4. Data Protection and Transport Security
1. HTTPS enforcement policy in production context:
- Insecure requests receive `426 HTTPS_REQUIRED`.
- Proxy-aware (`X-Forwarded-Proto`).

2. Strict transport security:
- HSTS enabled when HTTPS enforcement is active.

3. At-rest protection evidence:
- Backup and export encryption controls are specified in `backup-disaster-recovery-plan.md`.

## 5. Role-Based Access Control
RBAC is enforced through:
- `authenticate` / `authenticateAdmin`
- `checkPermission(...)`
- route-level and usecase-level authorization checks

Sensitive flows include POS transact/close-day, compliance profile edits, activation, and admin verification actions.

## 6. Filing Evidence References
- Control matrix: `docs/compliance/control-matrix.md`
- Compliance controls evidence matrix: `docs/compliance/evidence/open-controls-matrix.md`
- System flow diagram: `docs/compliance/submission/system-flow-diagram.mmd`
- DR plan: `docs/compliance/submission/backup-disaster-recovery-plan.md`
- Filing instructions: `docs/compliance/submission/filing-instructions.md`

## 7. Sign-off Metadata
- Engineering lead: pending final release sign-off
- Compliance lead: pending final filing sign-off
- Last quality gate run: `npm run check:architecture && npm run check:compliance && npm run lint:docs`
