# Billing Funnel Telemetry Definition

## Purpose
This document defines what the current `engagement_events` implementation actually measures.

## Current Operational Definition
The current system measures:
1. **Billing funnel telemetry**
2. **Limited server-side product usage telemetry**

Billing funnel telemetry means server-side events emitted during:
1. Company registration attempts and selected outcomes
2. Premium upgrade attempts and selected outcomes
3. Manual-to-PayPal migration attempts and selected outcomes
4. Inactive-account PayPal reactivation attempts and selected outcomes
5. Selected PayPal payment webhook outcomes

Limited product usage telemetry means server-side events emitted when authenticated users successfully access or execute selected core workflows such as:
1. Dashboard views
2. Inventory views and item/folder mutations
3. Purchase order views and lifecycle actions
4. Job order views and lifecycle actions
5. AI chat and selected AI workflow views/actions

These events answer questions like:
- Did an upgrade attempt reach the backend?
- Was a premium registration blocked because the subscription was missing or inactive?
- Did a migration/reactivation attempt fail due to PayPal plan mismatch or missing configuration?
- Did a payment sale webhook complete and persist?

## What The Current System Does Measure
1. Backend-observed registration attempts and some registration outcomes
2. Backend-observed premium upgrade attempts and some upgrade outcomes
3. Backend-observed migration/reactivation attempts and selected outcomes
4. Route-level persistence of telemetry rows for those flows
5. Server-side usage of selected core product workflows beyond billing/admin onboarding
6. Correlation, request, surface, and source fields when callers or middleware provide them
7. Idempotent suppression for some retried requests when the correlation identity is stable

## What The Current System Does Not Measure
1. Full product engagement coverage across every feature surface
2. Retention, active days, cohort behavior, or sustained usage depth over time
3. UI exposure, clicks, impressions, or browser-session behavior
4. User satisfaction or successful task completion in a causal sense
5. Causal impact of any feature on engagement
6. Real webhook ingress behavior end-to-end through production networking

## Allowed Claims
Today, the project may claim:
- "We record billing and registration funnel telemetry."
- "We record limited backend-observed product usage telemetry for selected core workflows."
- "We can verify selected backend funnel transitions and persisted evidence."
- "We have sandbox coverage for live subscription verification on the upgrade route."

The project may not yet claim:
- "This measures real-world engagement."
- "This proves feature adoption."
- "This proves retention."
- "This proves product usage depth."

## Evidence Required To Upgrade The Claim
To credibly claim real-world engagement measurement, the system still needs:
1. Broader product-usage event coverage with browser/session attribution
2. User/session/exposure attribution fields
3. Internal-user and bot filtering
4. Production reconciliation against logs and business state
5. Longitudinal evidence showing the metric tracks real user behavior over time
6. Controlled rollout or holdout evidence for causal claims

## Interpretation Rule
- Unit tests prove logic contracts.
- Integration tests prove controller and persistence wiring.
- Sandbox canaries prove selected provider-connected paths.
- Only production evidence can justify a real-world engagement claim.
