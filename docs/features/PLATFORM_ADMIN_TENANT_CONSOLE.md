---
status: reference
authority_level: reference
owner: product
last_reviewed: 2026-10-24
applies_to: platform_admin_tenant_console
topic: platform_admin_tenant_console
---

# Platform Admin Tenant Console Inventory and Decisions

This document records the landlord Platform Admin tenant console's current actions and the agreed
contracts for epic #2696. It is a reference for product and implementation work;
the route permission matrix and accepted ADRs remain authoritative when a statement here differs.
Current placement notes were updated for Phase 544 (#2756), implemented on the #2696 epic branch
from base SHA `48e1cadf513304eed607ee517b8b8c4cd46266ab`. Access & storefront now owns the existing
capability controls and audit entry point. Unavailable capability reads remain explicitly unknown
and disable writes. #1923's STAGING persistence/publication checks and the PROD read failure remain
external verification; they do not block integrating this route into the epic branch. The optional
combined Activity page remains deferred.

## Scope and authority

The tenant console is the landlord Platform Admin surface in `apps/dgfy-admin`. It is not the
merchant Back Office OPIS. ADR 0089 establishes the separate Platform Admin app and supersedes
parts of ADR 0087's earlier app placement framing; OPIS continues to own merchant back-office
authoring and administration. Page-level Platform Admin authorization remains governed by
[ADR 0047](../architecture/adr/0047-platform-admin-identity-and-page-rbac.md), and the current
API route classifications are recorded in the
[Platform Admin Route Permission Matrix](../testing/platform-admin-route-permission-matrix.md).
See also [ADR 0089](../architecture/adr/0089-platform-admin-fifth-frontend-app-cross-host-admin-routing.md)
and [ADR 0087](../architecture/adr/0087-dedicated-back-office-fourth-frontend-app-opis.md).

The grants relevant to this inventory are `admin.tenants`, `admin.dgfy_accounts`,
`admin.payments`, `admin.invoices`, `admin.pricing`, and Platform Master-only authority. The
tenant owner and combined account-plus-company provisioning paths require both
`admin.tenants` and `admin.dgfy_accounts`. Store-template curation and unclassified protected
legacy routes remain Platform Master-only. `/admin/me`, `/admin/logout`, and
`/admin/change-password` require an active Platform Admin session but no page grant. The backend
checks authority on direct requests; hiding a control is only a navigation aid.

## Tenant-specific action inventory

`T` below means `admin.tenants`. All tenant routes in this table are mounted below
`/api/v1/admin/tenants` unless a different prefix is shown. UI entry points describe current
placement after Phase 544. Audit names describe existing writes;
read-only actions have no write audit. “None” means no audit write was found for that action in the
current route/use-case path.

| # | UI entry point | Endpoint | Page grant | Reason / confirmation today | Audit record today | Related issue | Destination or reason to stay |
|---:|---|---|---|---|---|---|---|
| 1 | Tenant detail → Lifecycle: Approve | `POST /:id/approve` | T | Confirmation dialog; invoice creation is a separate action | `company_registration_events` | #1824 | Lifecycle. The invoice link is shown only to admins with `admin.invoices`. |
| 2 | Tenant detail → Lifecycle: Reject | `POST /:id/reject` | T | Confirmation dialog; reason required (at least 3 characters) and shown to the applicant | `company_registration_events` and `tenants.rejection_reason` | — | Lifecycle. |
| 3 | Tenant detail → Lifecycle: Retry setup | `POST /:id/retry-provisioning` | T | Confirmation dialog | `company_registration_events` | #1824 | Lifecycle. |
| 4 | Tenant detail → Lifecycle: Reactivate | `POST /:id/reactivate` | T | Confirmation dialog | None | — | Lifecycle. The endpoint currently has no tenant-status guard. |
| 5 | Tenant detail → Lifecycle: Edit status | `PUT /:id` | T | Confirmation dialog; no reason required | None | — | Lifecycle. |
| 6 | Tenant detail → Lifecycle: Delete | `DELETE /:id` | T | Type the company name. Registration history requires the existing force option; outstanding platform invoices block deletion. UI never escalates with force. | `tenant_admin_audit_logs` only on the force-registration-history path; tenant audit rows cascade on tenant deletion | #2005 | Lifecycle danger zone. Preserve the invoice/history guards and resolve audit-retention policy separately. |
| 7 | Tenant detail → Registration: View evidence | `GET /:id/registration` | T | None | None | — | Registration. |
| 8 | Tenant detail → Registration: Files / download | `GET /:id/registration-uploads`, `GET /:id/registration-uploads/download-all`, and `GET /:id/registration-uploads/:uploadId/download` | T | None | `tenant_admin_audit_logs` (`registration_upload_download`) for tenant file downloads | — | Registration. Private previews use authenticated download responses and clean up object URLs. |
| 9 | Tenant detail → Registration: Revoke upload | `POST /:id/registration/uploads/:uploadId/revoke` | T | Confirmation dialog; optional reason | `company_registration_events` (`upload_revoked`) | — | Registration. |
| 10 | Submitted registration-draft queue | `GET /registration-drafts`; `GET /registration-drafts/:draftId/uploads`, `/registration-drafts/:draftId/uploads/download-all`, and `/registration-drafts/:draftId/uploads/:uploadId/download`; `POST /registration-drafts/:draftId/approve`; `POST /registration-drafts/:draftId/retry-materialization` | T | `window.confirm()` for approve/retry | Company registration events | — | Stays on the directory: a draft has no tenant row until it is materialized. |
| 11 | Tenant detail → Access & storefront: capability controls | `PATCH /:id/capabilities` | T | Confirmation modal, reason 3–500 characters, and impact preview. `downpayment_allowed` must be sent alone; active tenants only. | `tenant_admin_audit_logs` (`capability_update`) | #1923, #2633, #2639 | Access section. Unknown/unavailable reads are shown as such and disable capability writes. STAGING persistence/publication and PROD read-recovery evidence remain external verification. |
| 12 | Tenant detail → Access & storefront: capability audit | `GET /:id/capabilities/audit-logs` | T | None | Reads `tenant_admin_audit_logs` | — | Remains beside the controls; combined Activity is deferred. |
| 13 | Tenant detail → Compliance: Mode control | `POST /:id/compliance/mode/select`, `POST /:id/compliance/mode/upgrade`, `POST /:id/force-non-compliant` | T | Confirmation dialog and required reason (3–255 characters); force action follows server eligibility | `tenant_compliance_audit_logs` | — | Compliance. |
| 14 | Tenant detail → Compliance: Review reads | `GET /:id/compliance/artifacts`, `/peripherals`, `/checklist`, `/audit-logs`, and `/security-incidents` | T | None | Reads compliance records and audit logs | — | Compliance. Lazy loads retain panel-specific errors and successful panels. |
| 15 | Tenant detail → Compliance: Verify/reject/revoke artifact or peripheral | `POST /:id/compliance/artifacts/:artifact_id/verification`; `POST /:id/compliance/peripherals/:peripheral_id/verification` | T | Optional verification note and evidence reference | `tenant_compliance_audit_logs` (`preflight_evaluation`, operation `compliance.artifacts.verification` or `compliance.peripherals.verification`) | — | Compliance. The code read confirms these audit writes; the seed's “not verified” note was stale. |
| 16 | Tenant detail → Compliance: Acknowledge/resolve security incident | `POST /:id/compliance/security-incidents/:incident_id/acknowledge` or `/resolve` | T | Optional note and evidence reference | `tenant_compliance_audit_logs` security-signal event | — | Compliance. |
| 17 | Tenant detail → Store setup: Apply store template | `POST /:id/apply-template` | T; template catalog `GET /api/v1/admin/templates` is Platform Master-only | Confirmation dialog and reason 3–500 characters; active tenants only | `tenant_admin_audit_logs` (`apply_template`) | #2719 | Store setup. Delegates receive an explanation and no catalog request. Tenant apply remains distinct from global template curation. |
| 18 | Tenant detail → Store setup: POS metadata | `GET /:id/pos-metadata`, `PATCH /:id/pos-metadata`, and `GET /:id/pos-metadata/audit-logs` | T | Required reason, 3–500 characters | `tenant_admin_audit_logs` (`pos_metadata_update`) | — | Store setup; the audit view remains here while Activity is deferred. |
| 19 | Tenant detail → Store setup: Custom domains | `GET/POST /:id/storefront-domains`; `POST /:id/storefront-domains/:domainId/{verify,make-canonical,retry,check-dns,suspend}`; `DELETE /:id/storefront-domains/:domainId`; `POST /:id/storefront-domains/reconcile-eligibility` | T; creation requires active Premium eligibility; other operations use their per-domain guards | Existing domain modal reasons and per-action guards | `storefront_custom_domain_audit_logs` | — | Store setup. |
| 20 | Revenue & Settlement panel on the Tenant Manager directory | `/api/v1/tenant-revenue/admin/*` | Platform Master-only through fallback; no explicit route classification | Varies by operation; mutating panel actions collect a reason | Revenue ledger/reconciliation audit records, depending on operation | #2536, #2531, #2534 | Stays a cross-tenant global tool. Overview links to the directory's stable `#revenue-settlement` anchor with `tenant_id`; authorized tenant data validates preselection. |
| 21 | Payment account readiness / PayMongo child-account tools | `GET /api/v1/commerce-payments/admin/tenant-payment-accounts`; `PUT /api/v1/commerce-payments/admin/tenants/:tenant_id/payment-account`; `POST /api/v1/commerce-payments/admin/tenants/:tenant_id/paymongo-child-account` and `POST .../paymongo-child-account/:action` | `admin.payments` | Readiness upsert has no reason field; provider operations use their own controls | `AuditLog` | — | Stays in Payment Operations (`/admin/payments`) under its own grant. A URL tenant is selected only after matching the loaded authorized tenant list; a failed list leaves it unset and can be retried. Preselection never fills a mutation form. |
| 22 | Platform invoice after tenant approval | `/api/v1/admin/invoices/*` | `admin.invoices` | Separate invoice flow; approval never creates an invoice | `platform_invoice_events` (for example, `draft_created` and `issued`) | — | Stays in Invoices (`/admin/invoices`) under its own grant. Application preselection requires current eligibility and tenant match; tenant-only context selects only one unique eligible application. |
| 23 | Tenant detail → Overview: Assign owner | `POST /:id/owner` | T and `admin.dgfy_accounts` | Existing active account, required reason, explicit force acknowledgement, and preview | `tenant_admin_audit_logs` (`admin_assign_owner` or `admin_force_assign_owner`) | #2742 | Available for active tenants only; Platform Master or both page grants are required. The endpoint payload deliberately sends `force: true`; this does not imply a stronger backend concurrency guarantee. |
| 24 | No current page caller | `GET/PATCH /:id/affiliate-slots` and `GET /:id/affiliate-slots/audit-logs` | T | Required reason, 3–500 characters; audit and cap write share a transaction | `tenant_admin_audit_logs` (`affiliate_slots_update`) | #1190 | API-only for now; no detail-page UI is approved in this decision. |
| 25 | No current page caller | `POST /:id/compliance/final-review/documents/:document_id/review` | T | Review note is optional in the API | `tenant_compliance_audit_logs` (`compliance.final_review.review_document`) | — | API-only for now; keep the existing review API outside this UI migration. |
| 26 | No active page control; legacy service wrappers/routes remain | `POST /:id/change-plan`, `POST /:id/setup-paypal-recurring`, and `POST /api/v1/admin/tenants/provision` | T | Legacy billing actions are disabled under current billing policy; no current reason/confirmation flow | No tenant-admin audit write found in these legacy paths | — | Out of UI scope. Route API removal to PM rather than reviving deprecated controls. |
| 27 | Add tenant page at `/admin/tenants/new` | `POST /api/v1/admin/tenants/admin-provision` or `/admin-provision-with-account` | T; the combined account path also requires `admin.dgfy_accounts` | Required reason; success remains visible with an explicit Overview link; the returned temporary password stays in component memory | `tenant_admin_audit_logs` (`admin_create_*`) | — | Wave 2 keeps the entry point separate from the directory and does not auto-navigate after provisioning. |

## Search and filter contract

Free-text search matches tenant name, admin email, domain, and tenant ID. It never searches
`company_token`: that credential routes tenant requests and is not returned by `GET /admin/tenants`.
Structured filters cover status, `effective_plan`, compliance mode, ownership, and capability state
for IMS, POS, and Storefront. `effective_plan` is the display/filter value; the stored `plan` can be
historical metadata.

Capability facets have four display states: enabled, disabled, `unavailable`, and `n/a`.
`capabilities.unavailable` means the active tenant capability read failed. A `null` capabilities
object for a non-active tenant means `n/a`. Unknown or unavailable values must never count as off.

Only the free-text URL parameter name `q` is fixed by this decision. #2743 owns the names and
serialization of the other filter parameters. Filters may combine, and the directory must keep
search/filter context when returning from a detail page.
If the UI displays a result count as “N of M”, it must define what `M` counts (the full tenant set,
the filtered match set, or the visible non-archived set); do not leave the denominator ambiguous.

The directory hides archived tenants from the default view and shows them when the Archived status
filter is selected. Summary tiles count the whole tenant set, including archived rows, rather than
the currently visible/search-filtered subset. `GET /admin/tenants/:id` is available to the existing
`admin.tenants` grant and returns one item with the same enrichment and safe presentation as the
directory read. A detail URL remains directly addressable and is presented read-only for an
archived tenant. This read-only UI rule is not a uniform API restriction; see
[Archived tenant API behavior](#archived-tenant-api-behavior).

## Detail-page sections and URL shape

The detail page uses one bookmarkable route per section:

| Section | Route |
|---|---|
| Overview | `/admin/tenants/:id` |
| Lifecycle | `/admin/tenants/:id/lifecycle` |
| Registration | `/admin/tenants/:id/registration` |
| Access & storefront | `/admin/tenants/:id/access` |
| Compliance | `/admin/tenants/:id/compliance` |
| Store setup | `/admin/tenants/:id/store-setup` |
| Activity | Deferred; no route is mounted. Audit access stays with the section that owns each action. |
| Billing | Link group to global billing tools; no detail route |

Add tenant uses `/admin/tenants/new`, declared before `/admin/tenants/:id`. Admin route access and
sidebar highlighting resolve exact paths and slash-delimited descendants through the same policy;
denied child pages do not mount during the redirect. The detail shell links Overview, Lifecycle,
Registration, Compliance, Store setup, and Access & storefront. That section owns the existing
capability controls and audit history. An unavailable capability read is never shown as On or Off
and all related writes stay disabled until a fresh read succeeds. The #1923 STAGING
persistence/publication checks and PROD capability-read recovery remain external verification
before release qualification. Activity is deferred, with audit history kept in the section that
owns each action.
A section the current admin cannot use is hidden or has its permission explained; the page must not
show an action and then rely on a 403 to explain the missing grant. Owner assignment requires both
`admin.tenants` and `admin.dgfy_accounts`. Billing links keep their target pages' independent grants.

Directory Add tenant and tenant-name links carry the complete current query string, including
unrecognized parameters. Overview/Add tenant return links use the fixed local directory path with
that same query string; a direct detail URL without search context returns to the default
directory. Admin analytics and Sentry route labels replace tenant IDs with `:id`, while Add tenant
remains `/admin/tenants/new`. This label normalization does not scrub SDK-captured URLs or query
strings; URL privacy remediation remains tracked by [#2748](https://github.com/Sieitzz/dgfy-platform/issues/2748)
and is required before the final DEV soak.

## Decisions log

| # | Decision | Status |
|---:|---|---|
| 1 | Search name, admin email, domain, and tenant ID; structured status, effective plan, compliance mode, capability, and ownership filters; never search `company_token`. | Settled by Pat on 2026-10-24. |
| 2 | Keep capability filters derived client-side from the list payload, with `unavailable` and `n/a` states. | Provisional until a healthy-path measurement exists. |
| 3 | Do not add API search or pagination now. The 67-row, 91.5 KB sample does not justify it by itself; investigate per-tenant DB-read decoupling if healthy PROD p95 exceeds 1 second or the 3-second poll is visible in tenant-pool pressure (#2560). The p95 threshold is a Worker proposal, not an accepted service-level objective. | Provisional. |
| 4 | Use one URL per section with the slugs in the detail-page map above. | Settled by Pat on 2026-10-24. |
| 5 | Tenant details include Overview, Lifecycle, Registration, Access & storefront, Compliance, Store setup, and links to global Billing tools. The combined Activity page is deferred; audit entry points stay in their owning sections. | Decided; Activity deferral recorded for Phase 544. |
| 6 | Owner assignment belongs on the detail page to close the Company-only ownership dead end and requires both tenant and DGFY-account grants. Affiliate slots (#1190) and final-review document review remain API-only. Legacy change-plan, PayPal, and provision controls stay out of UI scope; route API removal to PM. | Decided. |
| 7 | Assisted provisioning gets `/admin/tenants/new` and an Add tenant directory button; retain its required reason and the dual grant for the with-account path. | Decided; issue recommendation adopted. |
| 8 | Registration-draft review stays on the directory; pricing, template curation, Revenue & Settlement, Payment Operations, and Invoices remain global tools with their own authority. Tenant overview links may preselect authorized tenant/application data after validating it; opening a global tool never submits a mutation. | Decided. |
| 9 | Hide archived tenants by default and expose them under an Archived filter. Count all statuses in the summary tiles. Keep archived details directly addressable and present the page read-only, while documenting the API's existing status-specific write behavior. | Decided by Pat on 2026-10-24. |
| 10 | Move existing capability/readiness controls and their audit entry point into Access & storefront on the epic branch. Unknown/unavailable values stay distinct and disable writes; #1923 STAGING checks and PROD read recovery remain external verification, not a child-PR deployment gate. | Wave 3 implementation sequencing recorded 2026-10-24. |

## What stays outside the detail page

| Tool | Why it stays out | Current tenant preselection |
|---|---|---|
| Submitted registration-draft queue | A draft has no tenant row before materialization, so it remains part of the directory workflow. | Not applicable. |
| Pricing | Platform-wide policy, protected by `admin.pricing`; it is not a tenant-specific setting. | Not applicable. |
| Store-template curation | Published templates shape future provisioning platform-wide and are Platform Master-only. Applying a published template to one active tenant is in Store setup. | Not applicable. |
| Revenue & Settlement | Cross-tenant ledger, reconciliation, and payout tooling with master-only fallback authority. | Tenant overview links to `/admin/tenants?tenant_id=<id>#revenue-settlement`; authorized directory data validates the selection. |
| Payment Operations | Cross-tenant payment account and provider operations with `admin.payments`. | `/admin/payments?tenant_id=<id>` selects only after matching the authorized tenant list; a failed read leaves selection unset and can be retried. |
| Invoices | Cross-tenant invoice workflow with `admin.invoices`; issuance is tied to eligible registration applications. | `/admin/invoices?tenant_id=<id>&registration_application_id=<id>` validates tenant match and current eligibility. Tenant-only context selects only one unique eligible application. |
| Affiliate slots | Decision 6 leaves the API available but does not approve a new tenant-console UI. | Not applicable. |
| Final-review document review | Decision 6 leaves the existing compliance review API available but does not approve a new tenant-console UI. | Not applicable. |
| Legacy plan, PayPal, and provision routes | Billing policy disables these controls and provisioning is legacy. Their API lifecycle is a separate PM decision. | Not applicable. |

## Slice order and dependencies

Wave 1 delivered the inventory/decision record (#2742) and searchable directory (#2743). Wave 2
delivered the targeted single-tenant read, Overview route, nested authorization, query restoration,
Add tenant page, and ID-free route labels. Wave 3 is in progress on the registered epic branch;
Phase 544 implements the required detail sections, including Access & storefront:

1. **Wave 2 — detail foundation:** `GET /admin/tenants/:id` uses the list-item shape, enrichment,
   and `admin.tenants` grant. Overview loads that endpoint directly and is independent of directory
   state. Add tenant lives at `/admin/tenants/new`; its combined path requires the additional
   `admin.dgfy_accounts` grant. Preserve the full directory query through navigation and return
   links. API list-payload decoupling remains deferred until a healthy active-capability-read sample
   establishes that it is warranted.
2. **Wave 3 — section moves:** Lifecycle and Registration actions are on their detail routes, while
   the registration-draft queue stays on the directory. Compliance controls and history are on the
   Compliance route. Template application, POS metadata, and custom domains are on Store setup;
   template curation remains Platform Master-only. Overview owns owner assignment and validated
global billing links. Affiliate slots and final-review remain API-only. Access & storefront owns
the existing capability/readiness controls and audit. Failed or incomplete reads show unknown and
disable writes; #1923's STAGING persistence/publication checks and PROD capability-read recovery
remain external release verification. Activity is deferred, with audit access preserved in each
section.
3. **Wave 4 — integration and cleanup:** continue with integration cleanup and verify the complete
   find → open → manage journey across desktop and mobile. Complete the shared URL/query privacy
   remediation in #2748 before final DEV soak.

## Measurements

The following sample was measured on 2026-10-24 using three sequential authorized PROD requests
about 10 seconds apart with `status=all`. The timings describe a failed capability-read path, not
healthy list cost.

| Environment | Rows and status mix | Server wait (ms) | Total (ms) | Payload | Capability reads |
|---|---|---:|---:|---:|---|
| PROD (`dgfy.ph`) | 67 total: 53 active, 6 pending, 4 archived, 2 inactive, 2 rejected | 72, 68, 74 | 83, 86, 205 | 91,563 bytes | 53/53 active rows returned `unavailable: true` |
| STAGING (`stage.dgfy.ph`) | Not measured | — | — | — | Request returned 401 because no admin session was available |

All active capability reads failed in the PROD sample, and the UI consequently displayed “Settings
unavailable” 53 times. These timings cannot estimate the healthy path or establish that the list is
fast when capability reads succeed. The suspected first failing call is a landlord
`TenantDownpaymentSettings.findByPk` lookup in `readTenantCapabilities`; that remains a hypothesis
until the API warning `[ListTenants] Failed to load tenant capability settings` is checked. The
91,563-byte payload and row counts are valid for this sample. The #2560 tenant-pool-pressure
cross-check remains unanswered while reads fail before reaching tenant databases.

## Archived tenant API behavior

“Read-only” is the agreed detail-page presentation for archived tenants. The API does not yet
enforce that as a global write prohibition. The following behavior was verified in the current
code:

- `GET /admin/tenants?status=archived` can return archived rows. The status filter is passed
  directly to the repository without query-value validation.
- `PUT /admin/tenants/:id` has no archived-state guard; it accepts a status update, with the
  existing special guard only preventing a pending public registration from being set active by
  this route.
- `POST /admin/tenants/:id/reactivate` has no status guard and sets the tenant active, including
  when called for an archived row.
- `DELETE /admin/tenants/:id` has no archived-state guard. Registration-history and outstanding
  invoice checks still apply; force deletion can remove registration history.
- Capability updates, template application, and owner assignment explicitly require an active
  tenant. Approval/rejection require pending status; provisioning retry accepts its supported
  pending/active retry states, not archived. Storefront-domain creation requires active Premium
  eligibility; follow-on domain actions use per-domain checks, and no shared archived-state guard
  was found for them.
- POS-metadata, affiliate-slot, registration-upload, and compliance write use cases do not apply a
  general archived-state guard. They remain subject to their endpoint validation and
  `admin.tenants` route authority.

The detail UI should hide mutation controls on archived tenants, but that does not protect direct
API requests. The API behavior is routed as a finding below; this docs-only issue does not change
those endpoints.

## Findings routed, not fixed

1. **High — PROD capability reads fail for 53/53 active tenants** in the 2026-10-24 sample, making
   capability controls unusable there. Coordinate with #1923, #2633, #2639, and #2560; cause is not
   established.
2. Lifecycle writes for status edit, reactivate, approve, retry, and non-force delete do not take a
   reason or write a `tenant_admin_audit_logs` row. Approve/retry/reject have separate registration
   events.
3. `tenant_admin_audit_logs.tenant_id` is `ON DELETE CASCADE`; tenant deletion removes those audit
   rows. Resolve the retention policy with #2005.
4. Revenue & Settlement and the store-template picker are visible inside the `admin.tenants`
   surface, while Revenue APIs and the template-catalog read are master-only. Applying a template
   to one tenant remains covered by `admin.tenants`. The access mismatch must be addressed when
   those surfaces move or are hidden.
5. Native `confirm()`/`prompt()` is used for reason capture across 10+ actions; later slices should
   use the shared confirmation/reason UI.
6. `auth.js` contains a registration-draft approval rule for the unmounted
   `/api/v1/registration/drafts/:id/...` path. The live endpoints are under
   `/api/v1/admin/tenants/registration-drafts/...` and use the generic `admin.tenants` rule.
   `registration-industries` and `/tenant-revenue/admin/*` use the Platform Master fallback with
   no explicit classification or test case. The route matrix is corrected to describe this
   behavior; `auth.js` and its tests are unchanged.
7. `assignTenantOwner` has a service wrapper but no page caller. This decision assigns it to the
   detail-page owner area; implementation remains a later slice.
8. Archived details are intended to look read-only, but status update, reactivation, deletion, and
   several other tenant write endpoints do not reject archived rows. Decide whether API-level
   archived-state guards are needed before the UI relies on read-only presentation as an operational
   safeguard.
