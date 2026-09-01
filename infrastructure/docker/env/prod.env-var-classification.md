---
status: draft
authority_level: default
owner: architecture
date: 2026-08-28
last_reviewed: 2026-08-28
review_by: 2027-02-28
applies_to: production_deployment, secrets_management
topic: prod_env_var_classification
---

# `dgfy-api` / `dgfy-migration-runner` — production env var classification (code-derived)

Supersedes `docs/ops/SOPS_SECRETS_CUTOVER_RUNBOOK.md` Appendix A for the purpose of
deciding what the SOPS+age cutover (#360, ADR 0060) must supply. Appendix A grepped the
live `.env`'s 93 names against source, which can only confirm or deny those 93 — it
cannot find a var the app reads that isn't already in `.env`. This file instead starts
from the code and works outward.

**Method:**
```bash
grep -rhoE '\benv\.[A-Z][A-Z0-9_]{2,}|process\.env\.[A-Z][A-Z0-9_]{2,}' \
  apps/dgfy-api/src apps/dgfy-api/scripts/sync-tenant-schemas.js \
  | sed -E 's/^(process\.)?env\.//' | sort -u
```
`sync-tenant-schemas.js` is the one script under `apps/dgfy-api/scripts/` included, since
it's what `infrastructure/docker/dgfy-api/entrypoint.sh` actually runs on every container
start. Everything else under `scripts/` (E2E/smoke/verify/CI tooling) never executes
inside the production container and is excluded from the counts below, listed separately
at the bottom instead of silently dropped.

**Result: 314 vars `dgfy-api` can read in its production runtime path** (325 total matches minus 11 CI/test/script-only names). `dgfy-migration-runner` reads 7, unchanged from Appendix A and confirmed correct.

**Scope note (#1236):** this file's method (`grep`-ing `process.env.*` reads) only ever
covers the two Node services above. `nginx`'s domain vars are never `process.env` reads —
they're Compose-level `${VAR}` template substitution, consumed by `envsubst` at container
start. Their classification/literal-baking lives in
`infrastructure/docker/env/prod.sops-cutover-fragment.yml`'s EDIT 4, not here — don't expect
this file to account for them.

## ⚠️ Still open — cannot be closed from code alone

This file establishes *what the app can read*. It does **not** establish *which of the
~74 non-secret vars actually need a non-default value in production* (many have a safe
code default and are fine unset) or *the bucket-B sensitivity call* (which values are
safe to commit as literals into `docker-compose.yml` versus belong in SOPS regardless of
whether they're a "credential" in the traditional sense). Both require the live Phase 0
capture (`docker exec dgfy-api env`) and Pat's sign-off per the cutover plan — this file
is the input to that step, not a replacement for it.

## Boot-required — omitting ANY of these crash-loops the container

`apps/dgfy-api/src/server.js:193-198` calls `validateProductionEnv` under
`NODE_ENV=production` (baked into the image) and `process.exit(1)` on failure, which
`restart: unless-stopped` turns into a crash loop, not a single failed deploy.

### Unconditional (`BASE_REQUIRED_KEYS`, `productionEnvValidation.cjs:8-23`)

- `AUTH_BLACKLIST_FAILURE_MODE`
- `CORS_ORIGIN`
- `DB_HOST`
- `DB_NAME` — **secret** (bucket A, Appendix A)
- `DB_PASSWORD` — **secret** (bucket A, Appendix A)
- `DB_USER` — **secret** (bucket A, Appendix A)
- `HOSTING_PROFILE`
- `JWT_SECRET` — **secret** (bucket A, Appendix A)
- `NODE_ENV`
- `RATE_LIMIT_TENANT_REGISTRATION_MAX_REQUESTS`
- `RATE_LIMIT_TENANT_REGISTRATION_WINDOW_MS`
- `REFRESH_TOKEN_SECRET` — **secret** (bucket A, Appendix A)
- `SESSION_COOKIE_SECURE`
- `TEMP_FILE_STORAGE`

### Conditionally required — depends on which features/profile are live

- **`vps` hosting profile** (inferred when `REDIS_URL` is set, `hostingProfile.js:13`):
  requires `REDIS_URL` **and** `AUTH_BLACKLIST_FAILURE_MODE=fail_closed`.
- **`shared` profile**: requires `AUTH_BLACKLIST_FAILURE_MODE=fail_open`,
  `TEMP_FILE_STORAGE=local`, and must **not** set `REDIS_URL`.
- **Payment gate** (`productionEnvValidation.cjs:265-379`), triggered if any of
  `PAYMENTS_ENABLED`, `COMMERCE_PAYMENTS_ENABLED`, `COMMERCE_QRPH_ENABLED`,
  `COMMERCE_PAYMONGO_SPLIT_ENABLED`, `TENANT_REVENUE_SHARING_ENABLED` is truthy, or
  `PAYMONGO_MODE=live`:
  - PayMongo: `PAYMONGO_MODE` (`test`|`live`) plus, **for that mode specifically**, a
    public key, secret key, and webhook secret (`PAYMONGO_{LIVE,TEST}_*` or the bare
    fallback name). Setting `PAYMONGO_LIVE_*` while `PAYMONGO_MODE` is unset defaults to
    `test` and the live keys are silently ignored.
  - PayPal: `PAYPAL_CLIENT_ID`, `PAYPAL_CLIENT_SECRET`, `PAYPAL_WEBHOOK_ID`,
    `PAYPAL_STANDARD_PLAN_ID`, and (`PAYPAL_PREMIUM_PLAN_ID` or legacy `PAYPAL_PLAN_ID`).
  - `PAYMONGO_DGFY_MERCHANT_ID` when commerce payments are on without revenue sharing.
  - `TENANT_REVENUE_SHARING_ENABLED` ⇒ `TENANT_PAYOUT_ENCRYPTION_KEY` ≥32 chars **and**
    `ADMIN_ACCOUNTS_JSON` with ≥2 distinct maker/checker `financial_role` identities.
  - `PAYMONGO_ALLOW_UNSIGNED_WEBHOOKS` must not be truthy.
- **`TENANT_SCHEMA_MUTATION_APPROVED`** — not a `validateProductionEnv` check, but
  `apps/dgfy-api/scripts/sync-tenant-schemas.js:23-32` throws without it when run in
  `repair-apply` mode (what `entrypoint.sh` always invokes). `entrypoint.sh` swallows the
  failure with `|| true`, so omitting this is a **silent** regression — tenant schema
  drift repair stops running and only a WARNING banner appears in the container log.
  Present in neither the fragment nor Appendix A's 19-secret list today.

## Full production runtime surface (314 vars)

Grouped by prefix for scanability. `**bold**` = one of the boot-required/conditional
vars above. `[SECRET]` = already in Appendix A's 19-secret bucket. Everything else needs
the bucket-B sensitivity call against the live Phase 0 capture.

<details><summary><code>ADMIN_*</code> (7)</summary>

- `ADMIN_ACCOUNTS_JSON` **[required]** `[SECRET]`
- `ADMIN_FINANCIAL_ROLE`
- `ADMIN_LOGIN_LOCKOUT_DURATION_MS`
- `ADMIN_LOGIN_LOCKOUT_MAX_ATTEMPTS`
- `ADMIN_LOGIN_LOCKOUT_WINDOW_MS`
- `ADMIN_PASSWORD_HASH` `[SECRET]`
- `ADMIN_USERNAME`

</details>

<details><summary><code>APP_*</code> (1)</summary>

- `APP_URL`

</details>

<details><summary><code>AUTH_*</code> (1)</summary>

- `AUTH_BLACKLIST_FAILURE_MODE` **[required]**

</details>

<details><summary><code>BACKUP_*</code> (3)</summary>

- `BACKUP_ENCRYPTION_ALGORITHM`
- `BACKUP_KEY_MANAGEMENT_EXTERNALIZED`
- `BACKUP_TRANSPORT_TLS_MIN_VERSION`

</details>

<details><summary><code>BILLING_*</code> (15)</summary>

- `BILLING_FUNNEL_AUDIT_ATTEMPT_GRACE_MINUTES`
- `BILLING_FUNNEL_AUDIT_ENABLED`
- `BILLING_FUNNEL_AUDIT_INTERVAL_MINUTES`
- `BILLING_FUNNEL_AUDIT_ISSUE_LIMIT`
- `BILLING_FUNNEL_AUDIT_LOOKBACK_HOURS`
- `BILLING_FUNNEL_THRESHOLD_DUPLICATE_EVENTS`
- `BILLING_FUNNEL_THRESHOLD_MISSING_CORRELATION`
- `BILLING_FUNNEL_THRESHOLD_MISSING_OUTCOME`
- `BILLING_FUNNEL_THRESHOLD_ORPHAN_ATTEMPTS`
- `BILLING_FUNNEL_THRESHOLD_PAYMENT_WITHOUT_TELEMETRY`
- `BILLING_FUNNEL_THRESHOLD_ROUTE_OUTCOME_MISMATCH`
- `BILLING_FUNNEL_THRESHOLD_SKIPS`
- `BILLING_FUNNEL_THRESHOLD_TENANT_STATE_MISMATCH`
- `BILLING_FUNNEL_THRESHOLD_WEBHOOK_WITHOUT_TELEMETRY`
- `BILLING_FUNNEL_THRESHOLD_WRITE_FAILURES`

</details>

<details><summary><code>CATALOG_*</code> (1)</summary>

- `CATALOG_IMAGE_UPLOAD_WORKER_CONCURRENCY`

</details>

<details><summary><code>COMMERCE_*</code> (3)</summary>

- `COMMERCE_PAYMENTS_ENABLED`
- `COMMERCE_PAYMONGO_SPLIT_ENABLED`
- `COMMERCE_QRPH_ENABLED`

</details>

<details><summary><code>COMPLIANCE_*</code> (9)</summary>

- `COMPLIANCE_DOCUMENTARY_SOURCE`
- `COMPLIANCE_EVIDENCE_DOCS_ROOT`
- `COMPLIANCE_EVIDENCE_MAX_AGE_DAYS`
- `COMPLIANCE_INCIDENT_EMAIL_TO`
- `COMPLIANCE_INCIDENT_NOTIFY_CHANNEL`
- `COMPLIANCE_INCIDENT_NOTIFY_SIMULATE`
- `COMPLIANCE_INCIDENT_NOTIFY_STRICT`
- `COMPLIANCE_INCIDENT_WEBHOOK_URL`
- `COMPLIANCE_SUBMISSION_DOCS_ROOT`

</details>

<details><summary><code>CORS_*</code> (1)</summary>

- `CORS_ORIGIN` **[required]**

</details>

<details><summary><code>CSV_*</code> (1)</summary>

- `CSV_TEMPLATE_SIGNING_SECRET`

</details>

<details><summary><code>CUSTOM_*</code> (5)</summary>

- `CUSTOM_STOREFRONT_APEX_IPV4`
- `CUSTOM_STOREFRONT_APEX_IPV6`
- `CUSTOM_STOREFRONT_CNAME_TARGET`
- `CUSTOM_STOREFRONT_DOMAINS_ENABLED`
- `CUSTOM_STOREFRONT_DOMAIN_PILOT_TENANT_IDS`

</details>

<details><summary><code>CUSTOMER_*</code> (2)</summary>

- `CUSTOMER_ACCESS_MODES_ENABLED`
- `CUSTOMER_ACCESS_MODES_ENABLED_TENANTS`

</details>

<details><summary><code>DB_*</code> (9)</summary>

- `DB_AUTO_SYNC`
- `DB_DIALECT`
- `DB_HOST` **[required]**
- `DB_MAX_CONNECTIONS`
- `DB_NAME` **[required]** `[SECRET]`
- `DB_NAME_TEST`
- `DB_PASSWORD` **[required]** `[SECRET]`
- `DB_PORT`
- `DB_USER` **[required]** `[SECRET]`

</details>

<details><summary><code>DEPLOY_*</code> (1)</summary>

- `DEPLOY_PAYMENT_PROVIDER`

</details>

<details><summary><code>DEVICE_*</code> (4)</summary>

- `DEVICE_BRIDGE_API_KEY`
- `DEVICE_BRIDGE_BASE_URL`
- `DEVICE_BRIDGE_ENABLED`
- `DEVICE_BRIDGE_TIMEOUT_MS`

</details>

<details><summary><code>DGFY_*</code> (13)</summary>

- `DGFY_BUSINESS_STEP_UP_WINDOW_MINUTES`
- `DGFY_DIRECT_INVITE_ACCEPTANCE_ENABLED`
- `DGFY_HANDOFF_JWT_EXPIRY`
- `DGFY_HISTORICAL_BACKFILL_ORDER_BATCH_SIZE`
- `DGFY_HISTORICAL_BACKFILL_TENANT_PAGE_SIZE`
- `DGFY_JWT_EXPIRY`
- `DGFY_LEGACY_TENANT_REGISTRATION_ENABLED`
- `DGFY_LEGACY_USER_INVITES_ENABLED`
- `DGFY_REVIEW_INVITE_TTL_HOURS`
- `DGFY_TENANT_USER_EMAIL_REPAIR_ENABLED`
- `DGFY_TRACKING_RECOVERY_COOLDOWN_SECONDS`
- `DGFY_TRACKING_RECOVERY_MAX_ATTEMPTS`
- `DGFY_TRACKING_RECOVERY_TTL_MINUTES`

</details>

<details><summary><code>DISABLE_*</code> (1)</summary>

- `DISABLE_RATE_LIMIT`

</details>

<details><summary><code>EMAIL_*</code> (9)</summary>

- `EMAIL_DELIVERY_LOG_ENABLED`
- `EMAIL_FROM`
- `EMAIL_FROM_NAME`
- `EMAIL_MESSAGE_ID_DOMAIN`
- `EMAIL_OTP_DEV_FALLBACK_ENABLED`
- `EMAIL_OTP_ENFORCEMENT_ENABLED`
- `EMAIL_OTP_MAX_ATTEMPTS`
- `EMAIL_OTP_SECRET`
- `EMAIL_OTP_TTL_MINUTES`

</details>

<details><summary><code>ENFORCE_*</code> (1)</summary>

- `ENFORCE_HTTPS`

</details>

<details><summary><code>ERROR_*</code> (1)</summary>

- `ERROR_LOG_STACKS`

</details>

<details><summary><code>EXPORT_*</code> (1)</summary>

- `EXPORT_ENCRYPTION_REQUIRED`

</details>

<details><summary><code>FRONTEND_*</code> (1)</summary>

- `FRONTEND_URL`

</details>

<details><summary><code>GEO_*</code> (2)</summary>

- `GEO_SEARCH_REDIS_CACHE_ENABLED`
- `GEO_SEARCH_REDIS_CACHE_TTL_SECONDS`

</details>

<details><summary><code>HOSTING_*</code> (2)</summary>

- `HOSTING_INSTANCE_COUNT`
- `HOSTING_PROFILE` **[required]**

</details>

<details><summary><code>HTTP_*</code> (1)</summary>

- `HTTP_REQUEST_TIMEOUT_MS`

</details>

<details><summary><code>ITEM_*</code> (6)</summary>

- `ITEM_IMAGE_DAILY_USD_BUDGET`
- `ITEM_IMAGE_GENERATION_ENABLED`
- `ITEM_IMAGE_GENERATION_MODEL`
- `ITEM_IMAGE_MAX_PER_BATCH`
- `ITEM_IMAGE_SIZE_TIER`
- `ITEM_IMAGE_WORKER_CONCURRENCY`

</details>

<details><summary><code>JWT_*</code> (2)</summary>

- `JWT_EXPIRY`
- `JWT_SECRET` **[required]** `[SECRET]`

</details>

<details><summary><code>LANDLORD_*</code> (1)</summary>

- `LANDLORD_DB_POOL_MAX`

</details>

<details><summary><code>LEGACY_*</code> (2)</summary>

- `LEGACY_TENANT_LOGIN_GRACE_ENABLED`
- `LEGACY_TENANT_LOGIN_GRACE_END`

</details>

<details><summary><code>LOG_*</code> (1)</summary>

- `LOG_LEVEL`

</details>

<details><summary><code>MENU_*</code> (12)</summary>

- `MENU_IMPORT_BATCH_ENABLED`
- `MENU_IMPORT_DAILY_USD_BUDGET`
- `MENU_IMPORT_ENABLED`
- `MENU_IMPORT_LEGACY_SINGLE_FILE_ENABLED`
- `MENU_IMPORT_LEGACY_SUNSET_DATE`
- `MENU_IMPORT_MAX_FILES_PER_BATCH`
- `MENU_IMPORT_MAX_MERGED_ITEMS`
- `MENU_IMPORT_MAX_PDF_PAGES`
- `MENU_IMPORT_MAX_VISION_CALLS_PER_BATCH`
- `MENU_IMPORT_MODEL`
- `MENU_IMPORT_PDF_RASTER_ENABLED`
- `MENU_IMPORT_WORKER_CONCURRENCY`

</details>

<details><summary><code>METRICS_*</code> (1)</summary>

- `METRICS_ENABLED`

</details>

<details><summary><code>MOBILE_*</code> (1)</summary>

- `MOBILE_POS_POLICY_SIGNING_SECRET`

</details>

<details><summary><code>MOCK_*</code> (1)</summary>

- `MOCK_PAYPAL`

</details>

<details><summary><code>MODE_*</code> (1)</summary>

- `MODE_RBAC_GENERIC_FALLBACK_ENABLED`

</details>

<details><summary><code>NODE_*</code> (1)</summary>

- `NODE_ENV` **[required]**

</details>

<details><summary><code>OBSERVABILITY_*</code> (1)</summary>

- `OBSERVABILITY_HASH_SALT`

</details>

<details><summary><code>ONLINE_*</code> (1)</summary>

- `ONLINE_INVENTORY_RESERVATION_TTL_MINUTES`

</details>

<details><summary><code>OPEN_*</code> (7)</summary>

- `OPEN_FOOD_FACTS_BASE_URL`
- `OPEN_FOOD_FACTS_IMAGE_TIMEOUT_MS`
- `OPEN_FOOD_FACTS_TIMEOUT_MS`
- `OPEN_FOOD_FACTS_USER_AGENT`
- `OPEN_PRICES_BASE_URL`
- `OPEN_PRICES_MAX_AGE_DAYS`
- `OPEN_PRICES_TIMEOUT_MS`

</details>

<details><summary><code>OPENAI_*</code> (2)</summary>

- `OPENAI_API_KEY` `[SECRET]`
- `OPENAI_MODEL`

</details>

<details><summary><code>OPERATIONAL_*</code> (1)</summary>

- `OPERATIONAL_ALERT_THROTTLE_SECONDS`

</details>

<details><summary><code>PAYMENT_*</code> (1)</summary>

- `PAYMENT_PROVIDER`

</details>

<details><summary><code>PAYMENTS_*</code> (1)</summary>

- `PAYMENTS_ENABLED`

</details>

<details><summary><code>PAYMONGO_*</code> (22)</summary>

- `PAYMONGO_ACCOUNTS_API_BASE_URL`
- `PAYMONGO_ALLOW_UNSIGNED_WEBHOOKS` **[required]**
- `PAYMONGO_API_BASE_URL`
- `PAYMONGO_AUTO_CREATE_CHILD_ACCOUNTS`
- `PAYMONGO_CHECKOUT_URL`
- `PAYMONGO_DGFY_MERCHANT_ID` **[required]**
- `PAYMONGO_LIVE_PLATFORM_SPLIT_CONFIRMED`
- `PAYMONGO_LIVE_PUBLIC_KEY` **[required]** `[SECRET]`
- `PAYMONGO_LIVE_SECRET_KEY` **[required]** `[SECRET]`
- `PAYMONGO_LIVE_WEBHOOK_SECRET` **[required]** `[SECRET]`
- `PAYMONGO_MODE` **[required]**
- `PAYMONGO_PLATFORM_SPLIT_CONFIRMED`
- `PAYMONGO_PREMIUM_PLAN_ID`
- `PAYMONGO_PUBLIC_KEY` **[required]**
- `PAYMONGO_SECRET_KEY` **[required]**
- `PAYMONGO_SERVICE_CHECKOUT_URL`
- `PAYMONGO_STANDARD_PLAN_ID`
- `PAYMONGO_TEST_PUBLIC_KEY` **[required]**
- `PAYMONGO_TEST_SECRET_KEY` **[required]**
- `PAYMONGO_TEST_WEBHOOK_SECRET` **[required]**
- `PAYMONGO_WEBHOOK_SECRET` **[required]**
- `PAYMONGO_WEBHOOK_TIMESTAMP_TOLERANCE_SECONDS`

</details>

<details><summary><code>PAYPAL_*</code> (7)</summary>

- `PAYPAL_CLIENT_ID` **[required]** `[SECRET]`
- `PAYPAL_CLIENT_SECRET` **[required]** `[SECRET]`
- `PAYPAL_MODE`
- `PAYPAL_PLAN_ID` **[required]**
- `PAYPAL_PREMIUM_PLAN_ID` **[required]**
- `PAYPAL_STANDARD_PLAN_ID` **[required]**
- `PAYPAL_WEBHOOK_ID` **[required]**

</details>

<details><summary><code>PHONE_*</code> (2)</summary>

- `PHONE_COMPLETION_ENFORCED_TENANTS`
- `PHONE_COMPLETION_ENFORCEMENT_MODE`

</details>

<details><summary><code>PLATFORM_*</code> (6)</summary>

- `PLATFORM_ADMIN_EMAIL`
- `PLATFORM_INVOICE_ARTIFACT_ROOT`
- `PLATFORM_INVOICE_QA_EMAIL_ALLOWLIST`
- `PLATFORM_INVOICE_QA_MAIL_SINK`
- `PLATFORM_INVOICING_LIVE_CONFIRMED`
- `PLATFORM_INVOICING_MODE`

</details>

<details><summary><code>PORT_*</code> (1)</summary>

- `PORT`

</details>

<details><summary><code>POS_*</code> (6)</summary>

- `POS_DEVICE_DRIVER`
- `POS_DRAWER_AUTHORIZATION_SECRET`
- `POS_OPERATOR_AUTHORITY_SECRET`
- `POS_PAYMENT_CONFIRMATION_SECRET`
- `POS_STALE_SHIFT_HOURS`
- `POS_TERMINAL_PAIRING_SECRET`

</details>

<details><summary><code>RATE_*</code> (50)</summary>

- `RATE_LIMIT_ADMIN_AUTH_MAX_REQUESTS`
- `RATE_LIMIT_ADMIN_AUTH_WINDOW_MS`
- `RATE_LIMIT_ALERT_THRESHOLD`
- `RATE_LIMIT_AUTH_MAX_REQUESTS`
- `RATE_LIMIT_AUTH_WINDOW_MS`
- `RATE_LIMIT_DGFY_ACCOUNT_SEARCH_MAX_REQUESTS`
- `RATE_LIMIT_DGFY_ACCOUNT_SEARCH_WINDOW_MS`
- `RATE_LIMIT_DGFY_TENANT_SESSION_MAX_REQUESTS`
- `RATE_LIMIT_DGFY_TENANT_SESSION_WINDOW_MS`
- `RATE_LIMIT_EMAIL_OTP_MAX_REQUESTS`
- `RATE_LIMIT_EMAIL_OTP_WINDOW_MS`
- `RATE_LIMIT_GEO_SEARCH_MAX_REQUESTS`
- `RATE_LIMIT_GEO_SEARCH_WINDOW_MS`
- `RATE_LIMIT_INVENTORY_PUSH_MAX_REQUESTS`
- `RATE_LIMIT_INVENTORY_PUSH_WINDOW_MS`
- `RATE_LIMIT_ITEM_OPERATIONS_MAX_REQUESTS`
- `RATE_LIMIT_ITEM_OPERATIONS_WINDOW_MS`
- `RATE_LIMIT_LOOKUP_MAX_REQUESTS`
- `RATE_LIMIT_LOOKUP_WINDOW_MS`
- `RATE_LIMIT_MAX_REQUESTS`
- `RATE_LIMIT_MIN_PROD_REQUESTS`
- `RATE_LIMIT_MOBILE_POS_FREE_SYNC_MAX_REQUESTS`
- `RATE_LIMIT_MOBILE_POS_FREE_SYNC_WINDOW_MS`
- `RATE_LIMIT_ONBOARDING_EVENTS_MAX_REQUESTS`
- `RATE_LIMIT_ONBOARDING_EVENTS_WINDOW_MS`
- `RATE_LIMIT_POS_DRAWER_AUTH_MAX_REQUESTS`
- `RATE_LIMIT_POS_DRAWER_AUTH_WINDOW_MS`
- `RATE_LIMIT_POS_MAX_REQUESTS`
- `RATE_LIMIT_POS_WINDOW_MS`
- `RATE_LIMIT_ROUTE_CALCULATOR_MAX_REQUESTS`
- `RATE_LIMIT_ROUTE_CALCULATOR_WINDOW_MS`
- `RATE_LIMIT_STOREFRONT_DISCOVERY_MAX_REQUESTS`
- `RATE_LIMIT_STOREFRONT_DISCOVERY_WINDOW_MS`
- `RATE_LIMIT_STOREFRONT_FOLLOW_MAX_REQUESTS`
- `RATE_LIMIT_STOREFRONT_FOLLOW_WINDOW_MS`
- `RATE_LIMIT_STORE_AUTH_MAX_REQUESTS`
- `RATE_LIMIT_STORE_AUTH_WINDOW_MS`
- `RATE_LIMIT_STORE_LOCATIONS_MAX_REQUESTS`
- `RATE_LIMIT_STORE_LOCATIONS_WINDOW_MS`
- `RATE_LIMIT_STORE_TRACKING_MAX_REQUESTS`
- `RATE_LIMIT_STORE_TRACKING_READ_MAX_REQUESTS`
- `RATE_LIMIT_STORE_TRACKING_READ_WINDOW_MS`
- `RATE_LIMIT_STORE_TRACKING_WINDOW_MS`
- `RATE_LIMIT_STORE_VOUCHER_LOOKUP_MAX_REQUESTS`
- `RATE_LIMIT_STORE_VOUCHER_LOOKUP_WINDOW_MS`
- `RATE_LIMIT_TENANT_FINANCIAL_MAX_REQUESTS`
- `RATE_LIMIT_TENANT_FINANCIAL_WINDOW_MS`
- `RATE_LIMIT_TENANT_REGISTRATION_MAX_REQUESTS` **[required]**
- `RATE_LIMIT_TENANT_REGISTRATION_WINDOW_MS` **[required]**
- `RATE_LIMIT_WINDOW_MS`

</details>

<details><summary><code>REDIS_*</code> (1)</summary>

- `REDIS_URL` **[required]**

</details>

<details><summary><code>REFRESH_*</code> (2)</summary>

- `REFRESH_TOKEN_EXPIRY`
- `REFRESH_TOKEN_SECRET` **[required]** `[SECRET]`

</details>

<details><summary><code>ROUTE_*</code> (3)</summary>

- `ROUTE_CALCULATOR_ENDPOINT`
- `ROUTE_CALCULATOR_PROFILE`
- `ROUTE_CALCULATOR_TIMEOUT_MS`

</details>

<details><summary><code>RUNTIME_*</code> (3)</summary>

- `RUNTIME_SCHEMA_AUDIT_ENABLED`
- `RUNTIME_SCHEMA_AUDIT_INTERVAL_MINUTES`
- `RUNTIME_SCHEMA_PREFLIGHT_REQUIRED`

</details>

<details><summary><code>SCHEMA_*</code> (5)</summary>

- `SCHEMA_INDEX_AUDIT_ENABLED`
- `SCHEMA_INDEX_AUDIT_EXCLUDE_TEST_TENANTS`
- `SCHEMA_INDEX_AUDIT_INTERVAL_MINUTES`
- `SCHEMA_INDEX_AUDIT_MODE`
- `SCHEMA_INDEX_AUDIT_TIMEOUT_MS`

</details>

<details><summary><code>SENTRY_*</code> (8)</summary>

- `SENTRY_BACKEND_DSN` `[SECRET]`
- `SENTRY_DEBUG`
- `SENTRY_DSN`
- `SENTRY_ENABLED`
- `SENTRY_ENVIRONMENT`
- `SENTRY_RELEASE`
- `SENTRY_SEND_DEFAULT_PII`
- `SENTRY_TRACES_SAMPLE_RATE`

</details>

<details><summary><code>SESSION_*</code> (2)</summary>

- `SESSION_COOKIE_DOMAIN`
- `SESSION_COOKIE_SECURE` **[required]**

</details>

<details><summary><code>SKIP_*</code> (1)</summary>

- `SKIP_SERVER_START`

</details>

<details><summary><code>SKUPERVISOR_*</code> (1)</summary>

- `SKUPERVISOR_PUBLIC_ORIGIN`

</details>

<details><summary><code>SMTP_*</code> (8)</summary>

- `SMTP_CONNECTION_TIMEOUT_MS`
- `SMTP_GREETING_TIMEOUT_MS`
- `SMTP_HOST`
- `SMTP_PASS` `[SECRET]`
- `SMTP_PORT`
- `SMTP_SECURE`
- `SMTP_SOCKET_TIMEOUT_MS`
- `SMTP_USER` `[SECRET]`

</details>

<details><summary><code>STORE_*</code> (9)</summary>

- `STORE_CANCEL_PROOF_EXPIRY`
- `STORE_CANCEL_PROOF_SECRET`
- `STORE_CLAIM_TOKEN_EXPIRY`
- `STORE_CLAIM_TOKEN_SECRET`
- `STORE_GUEST_CHECKOUT_PROOF_EXPIRY`
- `STORE_GUEST_CHECKOUT_PROOF_SECRET`
- `STORE_JWT_EXPIRY`
- `STORE_JWT_SECRET`
- `STORE_TRACKING_ALERT_THRESHOLD`

</details>

<details><summary><code>STOREFRONT_*</code> (26)</summary>

- `STOREFRONT_DIRECT_CARD_ENABLED`
- `STOREFRONT_DIRECT_CARD_LIVE_CONFIRMED`
- `STOREFRONT_DIRECT_GCASH_ENABLED`
- `STOREFRONT_DIRECT_GCASH_LIVE_CONFIRMED`
- `STOREFRONT_DIRECT_MAYA_ENABLED`
- `STOREFRONT_DIRECT_MAYA_LIVE_CONFIRMED`
- `STOREFRONT_DIRECT_PAYMENT_REQUIRED`
- `STOREFRONT_DISCOVERY_FANOUT_FALLBACK_ENABLED`
- `STOREFRONT_DISCOVERY_INDEX_AUTO_REPAIR_ON_EMPTY`
- `STOREFRONT_DISCOVERY_INDEX_RECONCILE_ENABLED`
- `STOREFRONT_DISCOVERY_INDEX_RECONCILE_MINUTES`
- `STOREFRONT_DISCOVERY_INDEX_SYNC_CONCURRENCY`
- `STOREFRONT_DISCOVERY_PROFILE_REDIS_CACHE_TTL_SECONDS`
- `STOREFRONT_DISCOVERY_PROFILE_SETTINGS_REDIS_CACHE_TTL_SECONDS`
- `STOREFRONT_DISCOVERY_REDIS_CACHE_ENABLED`
- `STOREFRONT_DISCOVERY_REDIS_CACHE_TTL_SECONDS`
- `STOREFRONT_DISCOVERY_SIGNATURE_TTL_MS`
- `STOREFRONT_DISCOVERY_SYNC_RETRY_DELAYS_MS`
- `STOREFRONT_DOMAIN_CONTROLLER_ALLOWED_IPS`
- `STOREFRONT_DOMAIN_CONTROLLER_TOKEN`
- `STOREFRONT_DOMAIN_MAINTENANCE_ENABLED`
- `STOREFRONT_DOMAIN_MAINTENANCE_INTERVAL_MS`
- `STOREFRONT_GUEST_OTP_REQUIRED`
- `STOREFRONT_PAYMENT_RETURN_URL`
- `STOREFRONT_PUBLIC_ORIGIN`
- `STOREFRONT_RESERVED_HOSTNAMES`

</details>

<details><summary><code>STRUCTURED_*</code> (1)</summary>

- `STRUCTURED_REQUEST_LOGS`

</details>

<details><summary><code>TEMP_*</code> (1)</summary>

- `TEMP_FILE_STORAGE` **[required]**

</details>

<details><summary><code>TENANT_*</code> (9)</summary>

- `TENANT_AUTOMATIC_PAYOUT_ENABLED`
- `TENANT_DB_POOL_MAX`
- `TENANT_EXTERNAL_PAYOUT_APPROVED`
- `TENANT_MAX_CACHED_CONNECTIONS`
- `TENANT_PAYOUT_ENCRYPTION_KEY` **[required]** `[SECRET]`
- `TENANT_REGISTRATION_APPROVAL_MODE`
- `TENANT_REVENUE_SHARING_ENABLED` **[required]**
- `TENANT_SCHEMA_PREFLIGHT_REQUIRED`
- `TENANT_SCHEMA_SYNC_MODE`

</details>

<details><summary><code>TRUST_*</code> (2)</summary>

- `TRUST_FORWARDED_HOST_FOR_STOREFRONT_DOMAINS`
- `TRUST_PROXY`

</details>

## `dgfy-migration-runner` — 7 vars (unchanged from Appendix A, confirmed correct)

- `DB_HOST`
- `DB_NAME` — **secret**
- `DB_NAME_TEST`
- `DB_PASSWORD` — **secret**
- `DB_PORT`
- `DB_USER` — **secret**
- `SEQUELIZE_LOG_SQL`

Only `DB_USER`, `DB_PASSWORD`, `DB_NAME`, `DB_HOST`, `DB_PORT` are read under
`NODE_ENV=production` (`apps/dgfy-migration-runner/src/config/sequelize.config.cjs:27-40`);
`DB_NAME_TEST`/`SEQUELIZE_LOG_SQL` are dev/test-only. Seeders read zero env vars.

## Excluded — CI/test/script-only, never read by the production container (11)

Read by `apps/dgfy-api/scripts/*` files other than `sync-tenant-schemas.js` (E2E, smoke,
verify tooling) or by deploy-metadata detection code paths that only fire in CI. Listed so
nothing from the raw grep is silently unaccounted for — **do not** carry these into any
bucket for the cutover.

`COMMIT_SHA`, `DEPLOYED_COMMIT`, `GITHUB_SHA`, `GIT_COMMIT`, `GIT_SHA`, `RELEASE_SHA`, `RELEASE_TARGET_SHA`, `RENDER_GIT_COMMIT`, `RUNTIME_SHA_DEPLOY_STATE_FALLBACK`, `SOURCE_VERSION`, `VERCEL_GIT_COMMIT_SHA`

