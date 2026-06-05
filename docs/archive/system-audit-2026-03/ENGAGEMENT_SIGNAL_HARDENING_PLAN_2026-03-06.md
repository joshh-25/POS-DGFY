# Engagement Signal Hardening Plan (2026-03-06)

## Objective
Raise the current real-world engagement-measurement confidence from **3/10** to the highest defensible level by closing every identified gap across:

1. Metric definition
2. Instrumentation correctness
3. Data model completeness
4. Test design
5. Verification rigor
6. Environment parity
7. Production rollout evidence

This plan is intentionally phased so implementation can proceed without losing context.

## Current Truth
- The current system does **not** measure general product engagement.
- It currently measures a narrow subset of **billing and registration funnel telemetry**:
  - `company_registration_*`
  - `premium_upgrade_*`
  - `paypal_payment_sale_completed`
- The current setup is useful, but it is not sufficient to support claims about:
  - Retention
  - Feature adoption
  - Usage depth
  - Session quality
  - Real product engagement

## Non-Negotiable Rules
1. Do not label a metric as "engagement" unless the operational definition is documented and proven.
2. Do not ship new telemetry without a documented schema, ownership, and acceptance tests.
3. Do not accept green tests as proof of engagement unless production evidence exists.
4. Do not allow instrumentation failures to remain silent.
5. Do not close this plan until every phase gate has explicit evidence.

## Root Findings To Close
1. Metric semantics are overstated. The system records funnel telemetry, not engagement.
2. Terminal outcome instrumentation is incomplete on validation and exception paths.
3. Webhook coverage is overstated in tests and docs.
4. Telemetry writes can fail open without a hard health signal.
5. Event schema is too thin for attribution, dedupe auditing, bot/internal filtering, and causal analysis.
6. Idempotency depends too heavily on caller-supplied request IDs.
7. Test coverage is strong for controller wiring, but weak for production-parity claims.
8. Canary coverage does not prove real webhook ingress or provider-origin event fidelity.
9. Environment differences can hide migration, proxy, signature, and traffic-shape issues.
10. There is no production verification program strong enough to justify a real engagement claim.

## Finding-To-Phase Matrix
1. Metric semantics overstated -> Phases 0, 7
2. Missing terminal outcomes -> Phases 1, 3, 5
3. Webhook coverage overstated -> Phases 0, 1, 5, 6
4. Telemetry fail-open behavior -> Phases 3, 8
5. Thin schema -> Phases 2, 3, 7
6. Fragile idempotency/request identity -> Phases 4, 5, 6
7. Test design over-claims -> Phases 0, 5
8. Canary does not prove provider-origin webhook fidelity -> Phases 5, 6, 7
9. Test/staging vs production parity gaps -> Phases 6, 7
10. No causal evidence for engagement claim -> Phases 7, 8

## Confidence Ladder
- Current state: **3/10**
- After Phases 0-2: **5/10**
- After Phases 3-4: **6.5/10**
- After Phases 5-6: **8/10**
- After Phase 7 production evidence: **9/10**
- **10/10 is not defensible without longitudinal production evidence across time, cohorts, and counterfactual checks.**

## Phase 0 - Metric Reset And Documentation Truthfulness

### Goal
Stop overstating what the current implementation measures.

### Work
1. Reclassify current `engagement_events` as `billing_funnel_telemetry` in documentation and internal language until broader instrumentation exists.
2. Add a formal operational definition document:
   - What "billing funnel telemetry" means
   - What "product engagement" means
   - What each current event does and does not prove
3. Correct overclaims in docs and test descriptions:
   - `backend/tests/README.md`
   - `docs/testing/production-readiness-audit.md`
   - `docs/guides/SCRIPTS_GUIDE.md`
   - `docs/testing/receive-token-fix-evaluation.md`
4. Add a telemetry event catalog document with:
   - Event name
   - Producer
   - Trigger condition
   - Required fields
   - Terminal/non-terminal classification
   - Allowed outcomes

### Acceptance Gate
1. No project docs describe the current telemetry as general engagement.
2. Every existing event has an explicit meaning and limitation.
3. Docs clearly distinguish:
   - syntax/contract tests
   - integration tests
   - canaries
   - production evidence

## Phase 1 - Instrumentation Correctness And Completeness

### Goal
Guarantee every tracked flow emits coherent, terminally complete telemetry.

### Work
1. Replace ad hoc event emission with a shared funnel-instrumentation helper for:
   - attempt
   - success
   - blocked
   - failure
2. Close terminal gaps in `registerCompanyRequestUseCase`:
   - missing required fields
   - duplicate company conflict
   - provisioning failures
   - email side-effect failures if they are relevant to the funnel
3. Close terminal gaps in `upgradeToPremiumUseCase`:
   - PayPal verification exception path
   - unresolved next billing date path
   - any unexpected repository/update failure
4. Add webhook-side instrumentation for:
   - unknown tenant for subscription
   - invalid signature
   - duplicate webhook replay
   - webhook processing failure
   - subscription activated/cancelled/suspended/expired outcomes
5. Standardize outcome metadata:
   - `outcome`
   - `failure_code`
   - `failure_reason`
   - `provider_status`
   - `route`
   - `http_status` where applicable

### Acceptance Gate
1. Every funnel has a complete event grammar.
2. No attempt event can exist without either:
   - a terminal outcome event, or
   - an explicit documented in-progress state with expiration rules
3. Tests assert exact outcome pairs and failure-path behavior, not only happy paths.

## Phase 2 - Event Schema Hardening

### Goal
Make the event model analyzable, attributable, and auditable.

### Work
1. Extend `engagement_events` schema with fields required for trustworthy measurement. Minimum target set:
   - `event_category`
   - `event_version`
   - `outcome`
   - `failure_code`
   - `failure_reason`
   - `request_id`
   - `trace_id`
   - `provider_event_id`
   - `provider_event_time`
   - `ingested_at`
   - `processed_at`
   - `environment`
   - `surface`
   - `platform`
   - `actor_type`
   - `is_internal_actor`
   - `is_bot_suspected`
   - `session_id` when available
   - `experiment_key`
   - `variant_key`
   - `exposure_id`
2. Add indexes needed for integrity and analysis:
   - `correlation_id`
   - `request_id`
   - `provider_event_id`
   - `(event_type, event_time)`
   - `(tenant_id, event_time)`
   - `(subscription_id, event_time)`
3. Define event-versioning rules so schema evolution is safe.
4. Decide whether to:
   - keep `engagement_events` and reinterpret it, or
   - create a new canonical telemetry table and backfill/migrate

### Acceptance Gate
1. Event schema supports dedupe, attribution, provider reconciliation, and environment separation.
2. Migrations are applied through real migrations only, not `sync({ alter: true })`.
3. Schema contract is documented and test-covered.

### Phase 2 Progress Notes (2026-03-06)
Completed:
1. Added additive migration `20260306000001-expand-engagement-events-schema.cjs`.
2. Expanded the Sequelize model with schema-contract fields needed for attribution and reconciliation.
3. Updated the telemetry writer to populate the expanded fields for billing-funnel events.
4. Added legacy-schema fallback writes so pre-migration environments do not fail during rollout.
5. Added model and payload contract tests plus legacy-read-safe test queries.

Still pending in this phase:
1. Backfill strategy for historical rows if analytics will rely on the new columns.
2. Full environment rollout where all databases have the new migration applied and compatibility fallback can eventually be retired.

## Phase 3 - Data Integrity Controls

### Goal
Detect silent corruption, missingness, and double-counting before analytics consumers rely on the data.

### Work
1. Add telemetry health checks:
   - recent write-failure count
   - recent skip count
   - missing-table detection
   - terminal-completeness failure rate
2. Add reconciliation jobs:
   - upgrade success events vs tenant premium state
   - registration success events vs tenant creation
   - webhook payment events vs payments table
   - webhook logs vs engagement events
3. Add dedupe audits:
   - duplicate provider event IDs
   - duplicate request IDs
   - repeated attempt events without terminal outcome
4. Add missingness audits:
   - null rates for tenant/user/request/correlation/provider fields
5. Add lag audits:
   - provider timestamp to ingestion
   - ingestion to persistence
6. Add counterfactual sanity checks:
   - route hit count vs event count
   - successful 2xx responses vs success events
   - failed 4xx/5xx responses vs failure/blocked events

### Acceptance Gate
1. Telemetry health appears in `/health` or equivalent audit output.
2. Integrity scripts can fail CI/staging when thresholds are exceeded.
3. Reconciliation and missingness results are reproducible.

### Phase 3 Progress Notes (2026-03-06)
Completed:
1. Added a runtime billing-funnel integrity audit on recent `engagement_events`.
2. Added `/health` exposure for:
   - missing correlation IDs
   - missing outcomes
   - orphan attempt rows
   - duplicate event keys
3. Added direct tests for the audit logic and health payload contract.

Still pending in this phase:
1. Select final threshold values for each target environment if they should diverge from the current zero-drift CI/canary policy.
2. Run the new CI/canary gates in the real pipeline and confirm they stay green under normal traffic.

Updated status (2026-03-06):
1. Payment-state reconciliation is now implemented for completed PayPal payments without matching telemetry.
2. Tenant-state reconciliation is now implemented for success events that do not match durable tenant state.
3. Webhook-log reconciliation is now implemented for processed webhook logs without matching telemetry.
4. Threshold-driven degradation policy is now implemented for integrity metrics.
5. Route-vs-telemetry counterfactual checks are now implemented for billing registration and upgrade routes.
6. Telemetry write-failure and skip-rate health is now sourced from the telemetry write path.
7. CI and the PayPal sandbox canary workflow now fail on billing-funnel integrity drift using explicit threshold configuration.
5. Counterfactual route-vs-event checks are now implemented for upgrade and registration flows.
Remaining work in this phase is now primarily:
   - CI/staging enforcement using chosen threshold values

## Phase 4 - Idempotency And Identity Robustness

### Goal
Make event identity stable under retries, provider replays, and infrastructure noise.

### Work
1. Stop relying only on caller-supplied `x-request-id` for dedupe.
2. Define per-flow idempotency rules:
   - HTTP retry identity
   - provider webhook identity
   - business-operation identity
3. Introduce flow-specific idempotency key builders:
   - registration keys
   - upgrade keys
   - webhook keys
4. Propagate request IDs consistently through middleware and downstream services.
5. Persist provider-native IDs for webhook events.
6. Add tests for:
   - same request retried with missing client request ID
   - same provider event replayed with different headers
   - same business operation repeated from UI refresh

### Acceptance Gate
1. Duplicate traffic cannot inflate counts under common retry patterns.
2. Replays are detectable and classifiable.
3. Dedupe logic is documented and verified.

## Phase 5 - Test System Redesign

### Goal
Ensure each test proves exactly what it claims, no more and no less.

### Work
1. Split telemetry tests into clear layers:
   - contract/unit
   - route integration
   - provider integration
   - environment parity
   - production canary
2. Update `subscriptionIntegration.test.js` claims to explicitly state:
   - mocked PayPal transport
   - real Express + DB persistence
   - not a real engagement proof
3. Expand tests for all missing failure paths identified in Phase 1.
4. Replace canary overclaiming with exact assertions.
5. Add a new webhook-focused parity test pack that covers:
   - signature verification branch
   - duplicate webhook replay
   - payment completion event persistence
   - orphan subscription handling
6. Remove `sequelize.sync({ alter: true })` from canary/test flows that claim production parity.
7. Add schema contract tests for the telemetry model and migration.

### Acceptance Gate
1. Every test file has a precise purpose statement.
2. No test claims to prove real engagement unless it uses real production evidence.
3. Test names, README, and workflow descriptions are aligned with actual coverage.

## Phase 6 - Environment Parity Hardening

### Goal
Reduce the gap between staging/test execution and production behavior.

### Work
1. Run canary and staging tests using migrations, not dynamic schema alteration.
2. Validate telemetry under deployment-like conditions:
   - reverse proxy headers
   - real request ID propagation
   - production-equivalent env configuration
   - realistic MySQL and Redis settings
3. Add a staging smoke path for webhook ingress through the real HTTP endpoint.
4. Validate that proxy/load balancer behavior does not alter:
   - headers
   - request IDs
   - webhook signature verification inputs
5. Record environment differences explicitly in docs when they remain.

### Acceptance Gate
1. A staging-like run exists that exercises deployment-relevant telemetry behavior.
2. Canary no longer depends on non-production shortcuts.
3. Environment assumptions are documented and verified.

## Phase 7 - Production Verification Program

### Goal
Generate the evidence required to claim that telemetry tracks real user behavior rather than harness artifacts.

### Work
1. Introduce shadow logging for a limited period:
   - HTTP access/request logs
   - business mutation logs
   - telemetry writes
2. Perform user-level trace audits:
   - sample 20-50 real upgrade/registration/payment flows
   - verify step-by-step alignment across logs, DB state, and telemetry rows
3. Run backfill/reconciliation reports for at least one meaningful production window.
4. Add internal-user and bot filtering rules before any metric is used in decision-making.
5. If the goal is true engagement measurement, add downstream product events for core workflows:
   - inventory actions
   - purchase order lifecycle
   - job order lifecycle
   - AI assistant usage
   - repeat visits/active days
6. If the goal is causal claims, introduce:
   - exposure events
   - variant assignment
   - holdout or controlled rollout design

### Acceptance Gate
1. Production spot checks show event truth against user-level traces.
2. Reconciliation pass rates are within defined thresholds.
3. Internal/bot traffic is filtered or explicitly segmented.
4. Product-level engagement events exist before any engagement claim is made.

## Phase 8 - Final Closure Gates

### Goal
Lock a defensible final rating and prevent regression.

### Work
1. Publish a final audit review with:
   - evidence commands
   - evidence files
   - reconciliation outputs
   - known residual risks
2. Add CI/staging gates for:
   - telemetry schema contract
   - integrity audits
   - parity tests
   - canary assertions
3. Add regression alerts for:
   - telemetry write failures
   - missing terminal outcomes
   - replay spikes
   - schema drift
4. Freeze acceptance criteria for future telemetry changes.

### Acceptance Gate
1. Final audit file exists with reproducible proof.
2. CI prevents telemetry regressions.
3. Residual risk is explicitly accepted, not implicit.

## Deliverables By Phase

### Documentation Deliverables
- Metric definition spec
- Event catalog
- Updated test README
- Updated production-readiness audit wording
- Final closure report

### Code Deliverables
- Shared funnel telemetry helper
- Expanded event schema and migration(s)
- Integrity audit scripts/jobs
- Health/status reporting
- Stronger idempotency keying
- Expanded webhook instrumentation

### Test Deliverables
- Failure-path integration tests
- Webhook parity tests
- Schema contract tests
- Reconciliation/integrity tests
- Production canary corrections

## Required Evidence Before User Testing
1. Phase 0-5 complete and merged.
2. Full test suite green.
3. New telemetry-specific suites green.
4. Integrity audits green.
5. Staging/parity verification green.
6. No documentation overclaims remain.

## Explicit Items That Must Not Be Forgotten
1. Orphan "attempted" events caused by early validation returns.
2. Orphan "attempted" events caused by thrown PayPal exceptions.
3. Webhook duplicate/replay classification.
4. Unknown-tenant webhook telemetry visibility.
5. Telemetry write-failure observability.
6. Removal of `sync({ alter: true })` from parity-sensitive tests.
7. Request ID propagation beyond idealized test scenarios.
8. Provider-event IDs and provider timestamps.
9. Internal-user and bot filtering.
10. Product-event coverage if "engagement" remains the desired end-state claim.

## Recommended Execution Order
1. Phase 0
2. Phase 1
3. Phase 2
4. Phase 3
5. Phase 4
6. Phase 5
7. Phase 6
8. Phase 7
9. Phase 8

## Hard Reality Check
If we complete only Phases 0-5, the system becomes a strong and honest **billing funnel telemetry** system.

If we want a near-10 score for **real-world engagement measurement**, we must also complete Phases 6-8 and add real product-usage instrumentation. Without that, any score above **6.5/10** would be overstated.
