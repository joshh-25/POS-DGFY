---
status: reference
owner: engineering
last_reviewed: 2026-06-11
related_adr: docs/architecture/adr/0025-pos-application-shells-and-lan-host-runtime.md
declaration_id: 2026-06-11-pos-tablet-runtime-offline-history
classification: regulatory
surfaces: settings,compliance,payments,pos,terminal
reason_codes_impacted: ALLOWED,VALIDATION_FAILED,SERVICE_UNAVAILABLE,CONFLICT,RESOURCE_NOT_FOUND
policy_version: 2026.06.11
verification_evidence: npm --prefix frontend run build:pos,git diff --staged --stat,backend architecture guardrails,backend controller boundary guardrails
rollback_note: Revert the POS tablet runtime, item-management, device-bridge, APK wrapper, and offline-history changes together so checkout, history, printing, and terminal runtime assumptions remain aligned across frontend, backend, and wrapper surfaces.
preflight_result: no_breach
preflight_reason_code: ALLOWED
preflight_run_at: 2026-06-11T00:00:00+08:00
preflight_request_ref: POS-TABLET-RUNTIME-OFFLINE-HISTORY-2026-06-11
---

# POS Tablet Runtime And Offline History

## Compliance Impact Classification

Regulatory.

This release changes POS terminal behavior across tablet/APK runtime, item-management actions, local hardware bridge handling, offline checkout persistence, and synced transaction history presentation. It is compliance-sensitive because it affects terminal operations, user-visible checkout state, local transaction capture, and operational fallbacks that can influence how regulated sales activity is displayed and replayed.

## Affected Surfaces

- POS tablet and APK runtime behavior, including startup, bridge probing, retry, and device integration messaging.
- POS item-management actions inside the terminal, including edit/delete workflows and shared SKUpervisor item updates.
- POS notifications, terminal workspace layout, and history rendering for tablet operators.
- Offline POS checkout queue behavior and immediate local history visibility with pending-sync markers.
- Terminal/device bridge backend endpoints used for status, receipt printing, and drawer actions.
- Shared settings/compliance/admin-connected client service flows that participate in terminal runtime configuration or governed routing.

## Compliance Preconditions

1. Offline checkout entries must keep a stable idempotency key so replayed transactions can reconcile against local pending history rows.
2. Pending-sync history rows must never be represented as finalized synced fiscal output before server replay succeeds.
3. Device bridge failures that are optional in tablet/APK mode may fail silently, but explicit print/drawer actions must still return actionable errors when they fail.
4. Shared item edit/delete actions from POS must continue to target the same underlying item records governed by SKUpervisor access controls.
5. Terminal runtime changes must not bypass existing compliance, payment, or settings gate logic already enforced by backend policy handlers.

## Verification Evidence

Local validation recorded for this update set:

1. POS production build passed with `npm --prefix frontend run build:pos`.
2. Backend architecture guardrails passed during pre-commit for staged POS/backend changes.
3. Backend controller boundary guardrails passed during pre-commit for staged POS/backend changes.
4. Manual implementation review confirmed the offline history flow stores pending local rows, disables receipt viewing until sync, and refreshes history after replay.

