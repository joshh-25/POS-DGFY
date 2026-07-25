---
status: reference
owner: engineering
last_reviewed: 2026-07-25
related_adr: 0031-pos-terminal-pairing-and-shift-safe-navigation.md
declaration_id: 2026-07-25-pos-shift-ownership-and-branch-monitor
classification: major
surfaces: pos,terminal,orders,settings
reason_codes_impacted: POS_SHIFT_CLOSE_ACTOR_MISMATCH,POS_SHIFT_RECOVERY_FORBIDDEN,POS_SHIFT_RECOVERY_NOT_STALE
policy_version: 2026.07.25
verification_evidence: pos-terminal-readiness-tests,pos-shift-policy-tests,architecture-guardrails,controller-boundaries,diff-check
rollback_note: Revert the shift authorization and stale-recovery policies, operator uniqueness migration, branch-monitor endpoint, and dependent POS terminal UI together; existing transaction, receipt, payment, and inventory records are not rewritten.
preflight_result: no_breach
preflight_reason_code: ALLOWED
preflight_run_at: 2026-07-25T15:20:00+08:00
preflight_request_ref: POS-SHIFT-OWNERSHIP-BRANCH-MONITOR-2026-07-25
---

# POS Shift Ownership And Branch Monitor Hardening

## Compliance Impact Classification

Major. This work makes shift ownership explicit, adds master-admin stale-shift recovery with audit evidence, prevents one operator from holding multiple open shifts, and provides a read-only branch monitor without transferring cashier shift ownership. It does not change fiscal calculations, payment authorization, receipt numbering, or Storefront request contracts.

## Affected Surfaces

- POS shift open, close, location switch, cash drawer, and stale-shift recovery actions.
- Master-admin branch order and occupied-terminal monitoring.
- Terminal selection and shift ownership indicators in the POS interface.
- Tenant schema readiness and operator uniqueness enforcement for open shifts.

## Compliance Preconditions

- Shift mutation authorization remains server-authoritative and is not inferred from UI visibility.
- Admin monitoring remains read-only and does not assume ownership of another cashier's drawer.
- Forced stale-shift closure requires a master administrator, a governed stale threshold, a reason, an idempotency key, and an audit record.
- At most one open shift may exist for an operator within a tenant schema after migration readiness checks pass.
- Branch-monitor responses contain plain serializable records and do not expose ORM metadata.

## Verification Evidence

- POS terminal readiness regression suite passes, including circular Sequelize metadata serialization coverage.
- Shift authorization and recovery policy tests are included with the implementation batch.
- Architecture guardrails and controller-boundary checks pass.
- Changed-file `DO NOT COMMIT` scan and `git diff --check` pass.
