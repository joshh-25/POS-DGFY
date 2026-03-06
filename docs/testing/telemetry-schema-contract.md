# Telemetry Schema Contract

This document defines the current `engagement_events` schema contract for billing-funnel telemetry and limited product-usage telemetry.

## Current Interpretation

`engagement_events` now stores:
1. billing-funnel telemetry
2. limited server-side product-usage telemetry

It is still not a full general-purpose product-engagement table.

## Core Columns

Existing/stable columns:

- `event_type`
- `tenant_id`
- `user_id`
- `source`
- `subscription_id`
- `correlation_id`
- `idempotency_key`
- `metadata`
- `event_time`

Expanded Phase 2 columns:

- `event_category`
- `event_version`
- `request_id`
- `trace_id`
- `outcome`
- `failure_code`
- `failure_reason`
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
- `session_id`
- `experiment_key`
- `variant_key`
- `exposure_id`

## Required Population Rules For Billing Funnel Events

For billing-funnel events emitted through the shared helper:

- `event_category = billing_funnel`
- `event_version = 1`
- `outcome` must be populated
- `request_id` defaults to `correlation_id` when no separate request ID is available
- `environment` must reflect `NODE_ENV`
- `surface` should identify the route or interaction surface

## Required Population Rules For Product Usage Events

For product-usage events emitted through the shared helper:

- `event_category = product_usage`
- `event_version = 1`
- `outcome` must be populated
- `tenant_id` and `user_id` must be present or the event is skipped
- `surface` identifies the product area (`dashboard`, `inventory`, `purchase_orders`, `job_orders`, `ai`)
- `metadata.action` identifies the workflow executed

## Compatibility Rule

The writer is intentionally backward-compatible during rollout:

1. If the expanded columns exist, writes use the expanded schema.
2. If the database is still on the legacy table shape, writes fall back to the legacy column set.
3. This compatibility mode is temporary and exists only to keep pre-migration environments functional while migrations are being applied.

## Index Contract Added In Phase 2

- `correlation_id`
- `request_id`
- `provider_event_id`
- `(event_type, event_time)`
- `(tenant_id, event_time)`
- `(subscription_id, event_time)`

## Verification

Code contract:
- `backend/src/models/Landlord/EngagementEvent.js`
- `backend/migrations/20260306000001-expand-engagement-events-schema.cjs`

Tests:
- `backend/tests/engagementEventModel.test.js`
- `backend/tests/engagementService.test.js`
- `backend/tests/subscriptionIntegration.test.js`
- `backend/tests/productUsageTelemetryService.test.js`
