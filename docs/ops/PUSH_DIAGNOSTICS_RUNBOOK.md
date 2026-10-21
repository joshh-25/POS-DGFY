---
status: reference
authority_level: reference
owner: operations
last_reviewed: 2026-10-19
review_by: 2027-04-19
applies_to: platform_admin_push_diagnostics
topic: push_diagnostics_runbook
related_adr: 0097-outbound-push-notification-delivery-contract.md
---

# Platform Admin push diagnostics runbook

Use this page in DGFY Platform Admin at `/admin/push-diagnostics` to find where an outbound push
stops. The page and API show only the connected deployment's landlord data. The provider remains
`unconfigured` until its credentials and configuration are provisioned through the normal release
process.

The page never displays raw push tokens, secret values, tenant or owner identifiers, tracking PINs,
order ids, or provider ticket ids. Registration and correlation references are pseudonymous. Do not
copy those references into customer-facing messages.

## Identify the connected environment

The persistent banner uses `DEPLOY_ENV_LABEL`, falling back to `SENTRY_ENVIRONMENT`, then `unknown`.
`NODE_ENV=production` is shared by staging and production and must not be used to infer the label.
Each deployment reads its own API database; the page does not combine staging and production data.

Set `DEPLOY_ENV_LABEL=staging` or `DEPLOY_ENV_LABEL=production` in that deployment's managed API
environment file, then restart the API through the normal release process. Do not put this setting
in a Docker Compose `environment:` override: an unset override can replace the value supplied by the
API env file with an empty value. The label is not a credential. Never add secret values to this
file as part of push diagnostics work.

If the banner says `unknown`, treat the data as belonging to the API currently connected in your
browser, but confirm the host before taking an operational action. Ask the release owner to set
`DEPLOY_ENV_LABEL`; do not infer the environment from the page URL or `NODE_ENV`.

## What each status means

### Readiness indicators

- **Effective mode** is the adapter selected by the API. `unconfigured` does not send through Expo.
  `fake` is simulated and blocked in production. `expo` selects the Expo adapter.
- **Expo access token present** reports only whether `EXPO_ACCESS_TOKEN` is non-empty.
- **Push token hash secret present / ready** reports whether `PUSH_TOKEN_HASH_SECRET` can support
  keyed token hashing. Production requires this secret.
- **Guest push proof secret present** reports presence only; it does not indicate that every guest
  order has a push proof available.
- **Delivery log enabled** and **retention cleanup enabled** report the API's push-log settings.
- **Receipt scheduler** reports whether receipt polling is scheduled and its last completed cycle.
  A scheduled worker with no recent completion still needs operational investigation.

No readiness indicator exposes a credential or tests a provider send.

### Delivery attempt states

| State | Meaning | Next check |
| --- | --- | --- |
| `no_provider` | Provider is unconfigured or the outcome was simulated; no real provider send occurred. | Check effective mode and provider setup with the release owner. |
| `pending_dispatch` | The delivery row exists but has no terminal send result yet. | Check API/provider request progress and retry only through the approved operational path. |
| `send_failed` | The provider request failed before acceptance. | Inspect the sanitized provider error code and API logs for the same time. |
| `rejected_by_expo` | Expo rejected the send request. | Inspect the sanitized provider error code and correct the registration or request issue. |
| `accepted_receipt_pending` | Expo accepted the request, but no receipt result is recorded yet. | Check that the receipt scheduler is running, then refresh after polling. |
| `receipt_ok` | Expo reported an OK receipt, meaning it handed the notification to APNs or FCM. | Confirm app and OS behavior on the enrolled device; this does not prove app display. |
| `receipt_error` | The receipt contains an error. | Inspect the sanitized provider error code; `DeviceNotRegistered` should cause token revocation. |
| `receipt_other` | A receipt result exists but is not `ok` or `error`. | Check the provider's receipt status and sanitized error code. |

These states describe provider acceptance and receipt processing. A receipt cannot confirm that the
operating system displayed a notification or that a person saw it.

### Dispatch decisions

Dispatch decisions record work that did not create a per-token delivery attempt, such as a policy
skip, no eligible registration, a token cap, a hash failure, or a dispatch failure. The `outcome`,
`reason_code`, and eligible-device count explain why there is no corresponding attempt row. A
correlation reference may be present when the source event can be correlated safely.

## Triage decision tree

1. **Confirm the environment first.** Compare the banner with the staging or production host you
   intended to inspect. If it is `unknown`, confirm the host with the release owner before changing
   configuration or sending a test notification.
2. **Look for an active registration.** Filter registrations by state, app, brand, or platform. If
   none is active, the client has not registered an active token in this environment, or its token
   was revoked. Check the client registration request and its server response. A registration does
   not prove that OS notification permission is enabled.
3. **Check dispatch decisions for the same time window.** A `skipped` or `suppressed` event and its
   reason code explain why no delivery row exists. For example, `no_active_tokens` means dispatch
   found no eligible active registration. Address the reason at its source before investigating Expo.
4. **If there is a delivery attempt, read its state.** `no_provider` points to provider configuration
   or simulation. `send_failed` and `rejected_by_expo` point to the provider request or its input.
   Compare the sanitized error code and timestamp with API logs.
5. **If Expo accepted the request, check receipt processing.** `accepted_receipt_pending` may be
   waiting for the next scheduler cycle. `receipt_error` means inspect the safe error code and
   registration health. `receipt_ok` means Expo reported handoff to APNs/FCM; it does not prove the
   app displayed the notification.
6. **Use a diagnostic test only when needed.** If a registered customer or staff device has an
   attempt but its state is unclear, enroll a controlled operator device and send the fixed-copy test
   below. Do not use customer registrations as test targets.

The page refreshes on demand. If a refresh fails, it keeps the last successful snapshot and marks the
refresh error. A snapshot older than five minutes is flagged; refresh before using it for a live
incident decision.

## Mobile visibility switch

The **Mobile app visibility** section controls whether the `storefront`, `pos`, and `fiscalpos` apps
show their push diagnostics screen for this deployment. A change requires confirmation and is
audited with the Platform Admin identity. Each deployment reads its own landlord setting; a missing
setting defaults off.

The mobile availability endpoint caches a successful value for up to 30 seconds. Devices may keep
showing a recently enabled screen for that period after an operator turns it off. Visibility is a UI
switch only: turning it off does not revoke enrolled devices, invalidate outstanding enrollment codes,
or change enrollment and test-send rules. Clients must keep the diagnostics screen hidden when the
availability call returns a non-200 response.

The `brand` query value must be present and well-formed, but it is a client-supplied label and does not
select a separate setting. Any well-formed brand receives the app-level switch; missing or malformed
values and unknown query keys fail closed to `{ "enabled": false }`.

## Enroll an operator diagnostic device

A client must implement the device-side call; the admin page does not collect or accept an Expo
token. Until a mobile or POS client calls the endpoint, no diagnostic device can be enrolled and
all test-send actions remain disabled.

1. Sign in to the Platform Admin environment where the device should be enrolled and open Push
   Diagnostics.
2. Select **Generate enrollment code**. The code is single-use, expires after 10 minutes, and is
   displayed once. Deliver it to the operator holding the controlled device through the approved
   secure channel. Do not paste it into a ticket, chat, or log.
3. In the device client, call the session-less endpoint with the code and the device's own Expo token:

   ```http
   POST /api/v1/push-diagnostics/enroll
   Content-Type: application/json

   {
     "code": "<one-time-code>",
     "token": "<device Expo push token>",
     "platform": "ios|android",
     "app": "<client app name>",
     "brand": "<client brand>"
   }
   ```

   The endpoint is limited per IP. Code failures have the same response so callers cannot distinguish
   unknown from expired or previously used codes. A successful response contains only an enrolled
   result and a pseudonymous reference; the token is not returned.
4. Refresh the diagnostics page and confirm the new device appears as active. Revoke it when the
   operator no longer controls the device.

## Send a controlled test notification

1. Confirm the banner names the intended environment and choose an active row under Diagnostic
   devices.
2. Select **Send test notification** and confirm the action in the dialog.
3. The request identifies only the enrolled diagnostic-device id and carries no body. The API sends
   fixed generic copy, records the test in the delivery log, and audits the action.
4. The Platform Admin is limited to three test sends per ten minutes; each device is limited to ten
   per hour. On HTTP 429, wait for the stated limit window before retrying. Repeated retries do not
   bypass the limit.
5. Read the resulting provider state and receipt. Report **accepted by Expo** or **receipt OK** when
   those are the observed states. Never report that the notification was delivered, displayed, or
   seen based only on an API response or receipt.

## Provision production push configuration

Production secrets use SOPS+age ([ADR 0060](../architecture/adr/0060-sops-age-encrypted-secrets-at-rest.md),
[cutover runbook](SOPS_SECRETS_CUTOVER_RUNBOOK.md)). Staging keeps its push settings in its `.env`; this
section is production only. No step below needs, prints, or records a secret value.

| Variable | Class | Where it goes |
|---|---|---|
| `PUSH_PROVIDER=expo` | non-secret | literal in the live PROD `docker-compose.api.yml` `environment:` block (PROD-scoped; never the shared template) |
| `PUSH_TOKEN_HASH_SECRET` | secret, required | `secrets/dgfy-api.env` (SOPS) |
| `EXPO_ACCESS_TOKEN` | secret, optional | `secrets/dgfy-api.env` (SOPS) |

Order matters, because nothing in the boot validator checks these (see
[`prod.env-var-classification.md`](../../infrastructure/docker/env/prod.env-var-classification.md)):

1. **Secrets first.** On the production host, with `SOPS_AGE_KEY_FILE=/etc/dgfy/age/keys.txt`, add the
   keys with `sops set --value-stdin` (the value must be piped in as a JSON string, e.g. through
   `jq -Rs .`) or interactively with `sops /opt/dgfy-platform/secrets/dgfy-api.env`. Generate
   `PUSH_TOKEN_HASH_SECRET` on the host (`openssl rand -hex 32`, 64 hex characters) and never reuse the
   staging value. Take a ciphertext backup first; keep the file at `pat:docker 640`.
2. **Verify without printing.** Decrypt and report only key presence and value length, or a short
   `sha256` fingerprint compared against the source value.
3. **Mirror the ciphertext** into the private `Sieitzz/dgfy-secrets` repository at
   `prod/dgfy/dgfy-api.env` (branch + PR; compare `sha256sum` of server and committed file).
4. **Then compose.** Add `PUSH_PROVIDER: expo`, `EXPO_ACCESS_TOKEN: ${EXPO_ACCESS_TOKEN:-}` and
   `PUSH_TOKEN_HASH_SECRET: ${PUSH_TOKEN_HASH_SECRET}` to the live PROD compose file, matching
   `infrastructure/docker/env/prod.sops-cutover-fragment.yml`. This changes nothing until the next
   `deploy-sops.sh` run.
5. **Deploy through the normal controlled PROD procedure**, then confirm in Platform Admin push
   diagnostics that the mode is `expo` and the hash-secret readiness indicator is ready.

## Operational boundaries

- Only Platform Admins granted `admin.push_diagnostics` can use the page and its protected APIs.
  Platform Master manages delegated grants.
- Opening the overview, issuing a code, enrolling or revoking a device, and test sends are audited.
- The diagnostics page does not change when mobile apps request OS notification permission and does
  not infer permission from server-side registration state.
- No provider credential, real device, or production environment is provisioned by this feature.
  Follow the normal provider onboarding and release approvals before enabling Expo delivery.

## References

- [ADR 0097 — outbound push-notification delivery contract](../architecture/adr/0097-outbound-push-notification-delivery-contract.md)
- [ADR 0047 — Platform Admin identity and page RBAC](../architecture/adr/0047-platform-admin-identity-and-page-rbac.md)
- [Push diagnostics API and data handling](../../apps/dgfy-api/src/modules/pushDiagnostics/README.md)
- [API specification: Push diagnostics (Platform Admin)](../api/specification.md#push-diagnostics-platform-admin)
