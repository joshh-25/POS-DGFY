---
status: draft_pr
owner: DGFY Platform
last_reviewed: 2026-10-26
related_adr: docs/architecture/adr/0014-multi-template-modes-pos-offline-sync-and-storefront-cache-contracts.md
declaration_id: 2026-10-26-workflow-mode-last-known-good-fallback
classification: major
surfaces: pos,terminal
reason_codes_impacted: NONE
policy_version: 2026.10.16
verification_evidence: PENDING
rollback_note: Revert the workflow-mode cache module, the WorkflowModeProvider fallback and recovery changes, the new tests, and the ADR 0014 amendment together; the cached localStorage records are inert once unread and need no data rollback.
preflight_result: no_breach
preflight_reason_code: ALLOWED
preflight_run_at: 2026-10-26T00:00:00.000Z
preflight_request_ref: NOT-EXECUTED-2026-10-26-WORKFLOW-MODE-LAST-KNOWN-GOOD
---

# POS workflow-mode last-known-good fallback and recovery (#2824)

## Compliance Impact Classification

The path-based floor is major because the new regression test sits under
packages/web-core/src/features/pos/, which maps to the pos,terminal surfaces. The behavior change
itself lives in packages/web-core/src/features/settings/ and decides which POS workflow (and so
which order methods) a terminal offers when the tenant-settings load fails. It is declared at the
same level because it changes what an F&B terminal sells and how those sales are labelled.

## Affected Surfaces

- POS and terminal: after a failed settings load, an F&B terminal now keeps the tenant's
  last-known-good workflow (Dine In, Table #) instead of dropping to the Counter workflow
  (Walk-in/Pickup/Delivery), and re-fetches settings when connectivity returns.
- Every app that mounts WorkflowModeProvider (POS, IMS, OPIS) receives the same fallback and
  recovery behavior; no route, permission, or capability rule changes.

## Compliance Preconditions

This is client-side state handling only. It changes no endpoint, authorization rule, payment
processing, tax calculation, fiscal numbering, discount rule, compliance policy, schema, or
persisted server record. The API remains the authority that accepts or rejects each operation and
still enforces capabilities; the cached workflow drives terminal affordances only.

The cache holds only the tenant's own four workflow setting values (ops_workflow_mode, enabled and
disabled capability overlays, ops_store_profile). It is written only after a successful settings
response, is keyed by a non-reversible hash of the company token (the raw token appears in neither
key nor value), is applied only when the stored tenant key matches the current session, and is
never written from a fallback. It contains no customer, payment, user, or transaction data. The
carve-out from ADR 0014's "settings remain online-only" snapshot clause is recorded as a dated
amendment to that ADR in the same change. The re-fetch reads settings only and submits no queued
record, so the manual-only replay policy is unchanged.

The NOT-EXECUTED-* reference records that request-time preflight was not run when this declaration
was authored. It is reconciled locally with npm run compliance:reconcile-local before the pull
request opens, because the base branch is main.

## Verification Evidence

PENDING

## Residual Risks

A terminal with no cached bundle (no successful load yet on this build) that fails its first load
still renders the Counter workflow; a reconnect-required checkout state for that case is deferred
to a follow-up. A workflow-mode change made on the server while a terminal is offline is not shown
until the next successful fetch.

## Rollback

Revert the cache module, the provider changes, the tests, and the ADR amendment. Previously written
cache records are never read once the code is reverted and can be ignored.
