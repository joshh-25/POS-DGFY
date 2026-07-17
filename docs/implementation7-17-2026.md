---
status: proposed
date: 2026-07-17
last_reviewed: 2026-07-17
classification: reference
---

# POS Remediation Implementation Plan - 2026-07-17

## Purpose

Stabilize production-critical POS behavior before adding features or redesigning the interface. The recurring failures indicate schema drift, session/bootstrap races, weak financial state controls, and inconsistent client/server availability rules.

New feature work and redesign work should remain frozen until Phases 0 through 4 pass their completion criteria.

## Decision Basis

This plan follows the authoritative repository architecture documentation and is supplemented by current industry practices for authorization, idempotency, payment webhooks, inventory events, payment security, and browser offline constraints.

Primary references:

- [OWASP Authorization Cheat Sheet](https://cheatsheetseries.owasp.org/cheatsheets/Authorization_Cheat_Sheet.html)
- [Stripe idempotent requests](https://docs.stripe.com/api/idempotent_requests)
- [Square inventory API concepts](https://developer.squareup.com/docs/inventory-api/what-it-does)
- [PCI DSS v4.0.1](https://www.pcisecuritystandards.org/document_library/)
- [PayMongo webhooks](https://developers.paymongo.com/docs/webhooks)
- [MDN Background Sync API](https://developer.mozilla.org/en-US/docs/Web/API/Background_Synchronization_API)

## Phase 0: Evidence And Release Freeze

**Priority and affected area:** P0, all production-critical POS flows.

**Root cause:** Changes are being added while migrations, authentication, payment, and shift behavior remain inconsistent.

**Recommended implementation:**

- Create a flow inventory for login, shift, sale, void, pickup payment, online order, promo, stock, receipt, offline sync, and PayMongo.
- Record the API, database tables, state transitions, and accountable owner for every flow.
- Freeze new features and redesign work until Phases 0 through 4 are complete.

**Dependencies:** Production-like database snapshot and a test tenant.

**Validation steps:** Reproduce each current error with request IDs and database evidence.

**Completion criteria:** Every critical defect has a confirmed owner, reproduction, severity, and rollback plan.

## Phase 1: Database Integrity And Backend Boundaries

**Priority and affected area:** P0, migrations, tenant schemas, and backend architecture.

**Root cause:** Missing columns such as `pos_best_seller_mode`, `payment_collected_at`, and `delivery_jobs` indicate migration drift between tenants.

**Recommended implementation:**

- Use versioned, checksum-verified migrations for landlord and tenant schemas.
- Add deployment locks, schema-health checks, backup/restore validation, and expand-contract migrations.
- Enforce `route -> controller -> use case -> repository -> model`; prohibit direct controller model writes.

**Dependencies:** Database backup and a tenant provisioning baseline.

**Validation steps:** Apply every migration to fresh and upgraded tenant schemas; rerun safely; test restore; and confirm no unknown-column errors.

**Completion criteria:** All active tenants report the same required schema capability set and migrations are deployment-gated.

## Phase 2: Authentication, Permissions, And Tenant Isolation

**Priority and affected area:** P0, login, cashier/admin access, company switching, and rate limiting.

**Root cause:** Session bootstrap requests race before authentication is ready; permissions are sometimes UI-led; and generic IP throttling blocks normal item editing.

**Recommended implementation:**

- Make server session state authoritative with HttpOnly cookies and CSRF protection.
- Add a backend policy layer checking tenant membership, permission, terminal, location, shift, and action on every protected request.
- Rate-limit login, OTP, and public endpoints separately from authenticated CRUD operations.

**Dependencies:** Phase 1 schema health and a permission inventory.

**Validation steps:** Test cross-company access, direct API calls, cashier restrictions, admin shift-bypass limits, expired sessions, invitations, and normal edit bursts without `429` responses.

**Completion criteria:** No cross-tenant data access is possible; only abuse is rate-limited; and normal users never see bootstrap `401` noise.

## Phase 3: Financial POS State Machine

**Priority and affected area:** P0, shifts, checkout, voids, cash pickup, receipts, and refunds.

**Root cause:** Payment, fulfillment, stock, and receipt actions can become disconnected or retried without a single authoritative transaction.

**Recommended implementation:**

- Define guarded state machines for order, payment, shift, and fulfillment.
- Require an idempotency key and one database transaction for each money action to write payment, transaction/order, audit log, stock command, receipt record, and outbox event.
- Make voids and refunds create reversals; never delete financial history.

**Dependencies:** Phases 1 and 2, plus the existing cash-pickup rules in ADR 0033.

**Validation steps:** Test duplicate requests, failed transaction rollback, unpaid pickup rejection, paid pickup completion, closed-shift rejection, void reversal, and receipt audit tracing.

**Completion criteria:** A transaction cannot be paid twice, released unpaid, voided without audit evidence, or lose its terminal, cashier, or shift record.

## Phase 4: Catalog, Inventory, Promotions, And Storefront Availability

**Priority and affected area:** P0, items, categories, stock, promotions, and Storefront.

**Root cause:** POS `Always Available`, Storefront availability, business hours, branch status, and actual stock are being interpreted as the same rule.

**Recommended implementation:**

- Keep inventory authoritative per item-location ledger.
- Keep POS `Always Available` POS-only.
- Make Storefront availability evaluate active location, manual open state, operating hours, item-location availability, and sellable stock independently.
- Validate promotions on the server during both quote and checkout, including scheduled-order time windows.

**Dependencies:** Phases 1 and 3.

**Validation steps:** Run multi-branch stock tests, concurrent sales, zero-stock Storefront behavior, category filtering, promotion expiry/inactive/time-window tests, and report category zero-sales visibility.

**Completion criteria:** No oversell, stale promotion, incorrect `store closed` state, or POS metadata leakage into Storefront rules.

## Phase 5: Payments And Delivery Integrations

**Priority and affected area:** P0, PayMongo, QRPH, refunds, and delivery jobs.

**Root cause:** Payment status depends on client refreshes instead of verified provider events; integrations lack a durable retry boundary.

**Recommended implementation:**

- Isolate PayMongo behind a provider adapter.
- Verify signed raw-body webhooks, deduplicate provider event IDs, acknowledge quickly, and process through an inbox/outbox worker.
- Reconcile payment and refund status with the provider.
- Use provider-hosted or tokenized payment flows; never store PAN or CVV.
- Keep delivery jobs separate from transactions with provider, rider, status, fee, and retry metadata.

**Dependencies:** Phases 1 and 3; PayMongo live-account approval is an external dependency.

**Validation steps:** Run sandbox paid, failed, refund, replay, and stale-signature tests; webhook retry tests; provider-outage recovery; and delivery-job retry tests.

**Completion criteria:** Payment or delivery events cannot create duplicate orders, duplicate payments, or false paid statuses.

## Phase 6: Offline POS And Manual Synchronization

**Priority and affected area:** P1, PWA, offline sales, and provisional receipts.

**Root cause:** Offline behavior risks duplicate or conflicting financial records if browser storage and sync are treated as authoritative.

**Recommended implementation:**

- Permit offline use only after a successful online login and scoped catalog snapshot.
- Store an immutable IndexedDB transaction journal with client UUIDs and idempotency keys.
- Keep synchronization manual through one universal Sync action, with clear conflict and outcome visibility.
- Do not rely on Background Sync for money operations because browser support is incomplete.

**Dependencies:** Phases 1 through 4.

**Validation steps:** Test airplane-mode cash sale, receipt view, app restart, duplicate-sync prevention, stock conflict handling, and iPhone/Android behavior.

**Completion criteria:** Offline records are provisional locally, synchronize exactly once only when manually requested, and server reconciliation is authoritative.

## Phase 7: Reliability, Error Handling, And Performance

**Priority and affected area:** P1, API reliability, PWA refresh, and observability.

**Root cause:** SQL and auth failures surface directly to users; white screens and stale modules lack recovery telemetry.

**Recommended implementation:**

- Standardize domain error responses with correlation IDs and actionable UI messages.
- Add structured logs, metrics, traces, and alerting for migrations, webhooks, `401`, `429`, and queue failures.
- Add query indexes, cursor pagination, and service-worker version recovery.

**Dependencies:** Phases 1 through 6.

**Validation steps:** Fault-inject MySQL, Redis, PayMongo, image upload, and slow API failures; measure p95 menu, queue, and report response times.

**Completion criteria:** Users receive safe recovery messages, operators can trace every failure, and refreshes do not produce blank or stuck screens.

## Phase 8: Responsive UI And Media Hardening

**Priority and affected area:** P2, desktop, tablet, iPhone, and uploads.

**Root cause:** Responsive layouts and duplicated presentation logic were changed before stable shared component contracts existed.

**Recommended implementation:**

- Consolidate shared status badges, item cards, filters, modals, loading states, and empty states.
- Validate touch targets, 16px mobile input text, viewport-safe modals, and no overflow.
- Optimize uploads client-side for usability, while enforcing server-side format, dimension, malware, and final-size validation.

**Dependencies:** Stable APIs and rules from Phases 1 through 7.

**Validation steps:** Run Playwright visual tests at laptop, tablet, and iPhone widths; upload large JPG, PNG, and WebP files; and verify fallback images.

**Completion criteria:** No hidden actions, overlapping tags, cropped controls, input zoom, or broken image cards across supported screens.

## Phase 9: Test, Deployment, And Governance Gates

**Priority and affected area:** Continuous, CI/CD and production release.

**Root cause:** Historical checks do not prove the current commit is safe.

**Recommended implementation:**

- Require migration tests, architecture checks, backend unit/integration tests, Storefront contract tests, payment webhook tests, state-machine tests, offline E2E tests, security tests, and responsive visual tests for every release candidate.
- Attach release evidence to the exact commit SHA.
- Require migrations to be proven reversible or forward-fixable and use canary-tenant monitoring for rollout.

**Dependencies:** All previous phases.

**Validation steps:** Run the current-candidate architecture, controller-boundary, documentation, backend matrix, frontend contract/build, and release-gate checks.

**Completion criteria:** Release evidence is attached to the exact commit SHA, migrations are proven reversible or forward-fixable, and rollout uses canary-tenant monitoring.

## Required Decisions Before Implementation

- Keep offline reports, settings, and final item management online-only during stabilization. Expanding them conflicts with the current offline governance and requires a new ADR.
- Categories should be company-owned, with branch-specific item availability, price, and stock. Categories must not leak between separate companies.
- PayMongo production requires a stable HTTPS endpoint, live secrets, verified webhooks, and merchant readiness. ngrok is local-test only.
- Do not add more UI features until Phases 0 through 4 are complete and passing.

## Required Order

`0 -> 1 -> 2 -> 3 -> 4` is mandatory. Phases 5 through 7 can start once their dependencies pass. Phase 8 follows functional stabilization. Phase 9 runs continuously and blocks release.
