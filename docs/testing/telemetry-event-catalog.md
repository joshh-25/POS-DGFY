# Telemetry Event Catalog

## Scope
This catalog documents the current server-side events written to `engagement_events`.
Subscription/payment events are legacy and emitted only when payment workflows are enabled.

## Event Contract
Every emitted row should include:
- `event_type`
- `source`
- `event_time`
- `metadata`

Common optional fields:
- `tenant_id`
- `user_id`
- `subscription_id`
- `correlation_id`
- `idempotency_key`

Shared top-level fields used by newer events:
- `event_category`
- `event_version`
- `request_id`
- `trace_id`
- `outcome`
- `failure_code`
- `failure_reason`
- `surface`
- `platform`

## Event List

### Legacy Billing Events (payments-enabled mode only)

### `company_registration_attempted`
- Producer: `registerCompanyRequestUseCase`
- Source: `admin.tenants.register`
- Trigger: Public company registration request reaches the use case
- Classification: non-terminal attempt
- Meaning: The backend received a registration request payload and started processing it
- Does not prove: validation success, tenant creation, or user engagement

### `company_registration_blocked_missing_subscription`
- Producer: `registerCompanyRequestUseCase`
- Source: `admin.tenants.register`
- Trigger: Premium registration request omitted `subscriptionId`
- Classification: terminal blocked outcome
- Meaning: Registration was blocked before tenant creation because payment identity was missing

### `company_registration_blocked_unpaid`
- Producer: `registerCompanyRequestUseCase`
- Source: `admin.tenants.register`
- Trigger: PayPal subscription verification failed or returned a non-active result
- Classification: terminal blocked outcome
- Meaning: Registration was blocked because the subscription could not be validated as active

### `company_registration_succeeded`
- Producer: `registerCompanyRequestUseCase`
- Source: `admin.tenants.register`
- Trigger: Tenant record was created successfully
- Classification: terminal success outcome
- Meaning: The backend successfully created the tenant record
- Does not prove: sustained product usage after registration

### `company_registration_failed`
- Producer: `registerCompanyRequestUseCase`
- Source: `admin.tenants.register`
- Trigger: Validation failure, conflict, or unexpected exception in the registration flow
- Classification: terminal failure outcome
- Meaning: The registration flow terminated without success
- Common `failure_code` values:
  - `validation_failed`
  - `tenant_name_conflict`
  - `post_creation_failure`
  - `unexpected_error`

### `premium_upgrade_attempted`
- Producer: `upgradeToPremiumUseCase`
- Source: `payments.upgrade`
- Trigger: Upgrade route reaches the use case
- Classification: non-terminal attempt
- Meaning: The backend received an upgrade request and started processing it
- Does not prove: successful payment, durable upgrade, or user engagement

### `premium_upgrade_blocked_missing_subscription`
- Producer: `upgradeToPremiumUseCase`
- Source: `payments.upgrade`
- Trigger: Upgrade request omitted `subscriptionId`
- Classification: terminal blocked outcome
- Meaning: Upgrade was blocked before PayPal verification

### `premium_upgrade_blocked_unpaid`
- Producer: `upgradeToPremiumUseCase`
- Source: `payments.upgrade`
- Trigger: PayPal verification returned a non-active subscription
- Classification: terminal blocked outcome
- Meaning: Upgrade was blocked because the provider did not report an active subscription

### `premium_upgrade_failed_tenant_not_found`
- Producer: `upgradeToPremiumUseCase`
- Source: `payments.upgrade`
- Trigger: Verified subscription existed but the target tenant was not found
- Classification: terminal failure outcome
- Meaning: Business state prevented completion after verification

### `premium_upgrade_failed`
- Producer: `upgradeToPremiumUseCase`
- Source: `payments.upgrade`
- Trigger: Provider verification exception or local persistence failure
- Classification: terminal failure outcome
- Meaning: The upgrade flow terminated unexpectedly after the initial attempt
- Common `failure_code` values:
  - `verification_exception`
  - `billing_date_resolution_failed`
  - `persistence_failed`

### `premium_upgrade_succeeded`
- Producer: `upgradeToPremiumUseCase`
- Source: `payments.upgrade`
- Trigger: Tenant was updated to premium successfully
- Classification: terminal success outcome
- Meaning: The backend persisted the premium upgrade state
- Does not prove: later feature usage or retained customer value

### `paypal_migration_attempted`
- Producer: `migrateToPayPalUseCase`
- Source: `payments.migrate`
- Trigger: Migration route reaches the use case
- Classification: non-terminal attempt
- Meaning: Backend received a request to switch a manual tenant to PayPal recurring

### `paypal_migration_blocked_*`
- Producer: `migrateToPayPalUseCase`
- Source: `payments.migrate`
- Trigger: Migration blocked by business validation (for example: missing subscription, not active, already PayPal, invalid plan, plan mismatch)
- Classification: terminal blocked outcome
- Meaning: Migration request was rejected before persistence

### `paypal_migration_failed`
- Producer: `migrateToPayPalUseCase`
- Source: `payments.migrate`
- Trigger: Provider verification exception, missing server plan configuration, or other non-validation failure
- Classification: terminal failure outcome
- Meaning: Migration terminated due to operational failure

### `paypal_migration_succeeded`
- Producer: `migrateToPayPalUseCase`
- Source: `payments.migrate`
- Trigger: Tenant billing method was updated to PayPal recurring
- Classification: terminal success outcome
- Meaning: Migration state persisted successfully

### `paypal_reactivation_attempted`
- Producer: `reactivateWithPayPalUseCase`
- Source: `payments.reactivate_with_paypal`
- Trigger: Public reactivation route reaches the use case
- Classification: non-terminal attempt
- Meaning: Backend received an inactive-account self-reactivation request

### `paypal_reactivation_blocked_*`
- Producer: `reactivateWithPayPalUseCase`
- Source: `payments.reactivate_with_paypal`
- Trigger: Reactivation blocked by business validation (for example: missing subscription, tenant not inactive, unpaid subscription, invalid plan)
- Classification: terminal blocked outcome
- Meaning: Reactivation request was rejected before persistence

### `paypal_reactivation_failed`
- Producer: `reactivateWithPayPalUseCase`
- Source: `payments.reactivate_with_paypal`
- Trigger: Provider verification exception or missing server plan configuration
- Classification: terminal failure outcome
- Meaning: Reactivation terminated due to operational failure

### `paypal_reactivation_succeeded`
- Producer: `reactivateWithPayPalUseCase`
- Source: `payments.reactivate_with_paypal`
- Trigger: Tenant reactivation state was persisted successfully
- Classification: terminal success outcome
- Meaning: Account was restored with PayPal recurring billing

### `paypal_payment_sale_completed`
- Producer: `handleWebhookUseCase`
- Source: `payments.webhook`
- Trigger: `PAYMENT.SALE.COMPLETED` webhook processed successfully for a known tenant
- Classification: terminal provider-success outcome
- Meaning: Payment completion was processed and recorded after webhook handling
- Does not prove: webhook ingress coverage in every environment or downstream product engagement

### `paypal_payment_sale_failed_missing_subscription`
- Producer: `handleWebhookUseCase`
- Source: `payments.webhook`
- Trigger: Payment sale webhook arrived without `billing_agreement_id`
- Classification: terminal failure outcome
- Meaning: The provider payload was insufficient to map the payment to a subscription

### `paypal_payment_sale_ignored_unknown_tenant`
- Producer: `handleWebhookUseCase`
- Source: `payments.webhook`
- Trigger: Payment sale webhook referenced a subscription that did not map to a tenant
- Classification: terminal ignored outcome
- Meaning: The payment event was seen but could not be applied to local business state

### `paypal_subscription_activated`
- Producer: `handleWebhookUseCase`
- Source: `payments.webhook`
- Trigger: `BILLING.SUBSCRIPTION.ACTIVATED` processed successfully for a known tenant
- Classification: terminal provider-success outcome
- Meaning: Subscription activation was applied to local tenant state

### `paypal_subscription_cancelled`
- Producer: `handleWebhookUseCase`
- Source: `payments.webhook`
- Trigger: `BILLING.SUBSCRIPTION.CANCELLED`, `SUSPENDED`, or `EXPIRED` processed successfully for a known tenant
- Classification: terminal provider-success outcome
- Meaning: Subscription cancellation-style events were applied to local tenant state

### `paypal_subscription_event_ignored_unknown_tenant`
- Producer: `handleWebhookUseCase`
- Source: `payments.webhook`
- Trigger: Subscription lifecycle webhook referenced a subscription that did not map to a tenant
- Classification: terminal ignored outcome
- Meaning: The lifecycle event was seen but could not be linked to local business state

### `paypal_webhook_invalid_signature`
- Producer: `handleWebhookUseCase`
- Source: `payments.webhook`
- Trigger: Signature verification failed
- Classification: terminal blocked outcome
- Meaning: The webhook was rejected before business processing

### `paypal_webhook_replayed`
- Producer: `handleWebhookUseCase`
- Source: `payments.webhook`
- Trigger: A webhook with an already-processed dedupe key was received again
- Classification: terminal ignored outcome
- Meaning: The replay was detected and skipped intentionally

### `paypal_webhook_failed`
- Producer: `handleWebhookUseCase`
- Source: `payments.webhook`
- Trigger: Webhook processing failed after the log record was created
- Classification: terminal failure outcome
- Meaning: The webhook entered business processing but could not complete successfully

## Product Usage Event List

These events are emitted from controller-level product workflows and reflect backend-observed feature usage, not browser exposure.

### Dashboard

#### `dashboard_stats_viewed`
- Producer: `dashboardHandlers.getStats`
- Trigger: Dashboard stats endpoint returns a result
- Meaning: An authenticated user requested dashboard summary stats

#### `dashboard_low_stock_viewed`
- Producer: `dashboardHandlers.getLowStock`
- Trigger: Low-stock dashboard endpoint returns a result
- Meaning: An authenticated user requested low-stock visibility

#### `dashboard_recent_movements_viewed`
- Producer: `dashboardHandlers.getRecentMovements`
- Trigger: Recent movements endpoint returns a result
- Meaning: An authenticated user requested recent stock movement history

### Inventory

#### `inventory_items_viewed`
#### `inventory_item_viewed`
#### `inventory_item_created`
#### `inventory_item_updated`
#### `inventory_item_finalized`
#### `inventory_item_deleted`
#### `inventory_folders_viewed`
#### `inventory_folder_created`
#### `inventory_folder_deleted`
- Producer: `itemHandlers`
- Trigger: Corresponding inventory controller returns a result
- Meaning: Backend-observed usage of inventory read/write workflows

### Purchase Orders

#### `purchase_orders_viewed`
#### `purchase_order_viewed`
#### `purchase_order_created`
#### `purchase_order_finalized`
#### `purchase_order_received`
#### `purchase_order_archived`
- Producer: `purchaseOrderHandlers`
- Trigger: Corresponding purchase-order controller returns a result
- Meaning: Backend-observed usage of PO read/write lifecycle flows

### Job Orders

#### `job_orders_viewed`
#### `job_order_viewed`
#### `job_order_created`
#### `job_order_finalized`
#### `job_order_completed`
#### `job_order_archived`
- Producer: `jobOrderHandlers`
- Trigger: Corresponding job-order controller returns a result
- Meaning: Backend-observed usage of JO read/write lifecycle flows

### AI

#### `ai_chat_interaction_recorded`
#### `ai_action_confirmation_recorded`
#### `ai_action_cancellation_recorded`
#### `ai_conversations_viewed`
#### `ai_conversation_viewed`
#### `ai_diagnostics_viewed`
- Producer: `aiTransportHandlers`
- Trigger: Corresponding AI controller returns a result
- Meaning: Backend-observed usage of conversational AI surfaces and selected follow-up actions

## Known Gaps In The Current Catalog
1. The current schema is still too narrow for session-level or causal engagement analysis.
2. Browser exposure and front-end interaction telemetry are still missing.
3. Product-usage coverage is still selective, not universal.
4. Some failure modes are still grouped under generic `*_failed` events and rely on `failure_code` metadata for specificity.

## Interpretation Notes
1. This catalog now includes billing-funnel telemetry plus limited product-usage telemetry.
2. Event presence should be reconciled against business state, logs, and provider data before being used operationally.
