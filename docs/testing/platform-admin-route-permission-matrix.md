---
status: authoritative
authority_level: authoritative
owner: platform-security
last_reviewed: 2026-10-24
applies_to: platform_admin_routes
topic: platform_admin_page_authorization
---

# Platform Admin Route Permission Matrix

The backend resolves current session and database permissions on every Platform Admin request. Frontend navigation is only a usability layer; every direct route and API request must independently enforce this matrix.

| Route family | Required authority |
| --- | --- |
| `/api/v1/admin/contact-inquiries*` | `admin.contact_inquiries` |
| `/api/v1/admin/feedback*` | `admin.feedback` |
| `/api/v1/admin/push-diagnostics*` | `admin.push_diagnostics` |
| `/api/v1/admin/partner-integrations*` | `admin.partner_integrations` |
| `/api/v1/admin/tenant-intake*` | `admin.tenants` and `admin.dgfy_accounts` |
| `/api/v1/admin/tenants/pricing*` | `admin.pricing` |
| `GET /api/v1/admin/tenants/:id` (single-tenant detail read) | `admin.tenants` |
| `/api/v1/admin/tenants/*` | `admin.tenants` |
| `/api/v1/admin/tenants/admin-provision-with-account`, `/:id/owner` | `admin.tenants` and `admin.dgfy_accounts` |
| `/api/v1/admin/tenants/registration-drafts/:draftId/approve`, `/:draftId/retry-materialization` | `admin.tenants` (via the generic tenant rule) |
| `/api/v1/dgfy/admin/accounts*` | `admin.dgfy_accounts` |
| `/api/v1/commerce-payments/admin*` | `admin.payments` |
| `/api/v1/admin/templates*` | Platform Master Admin only |
| `/api/v1/admin/external-discovery*` | Platform Master Admin only |
| `/api/v1/admin/registration-industries*` | Platform Master Admin only through fallback; no explicit classification |
| `/api/v1/tenant-revenue/admin/*` | Platform Master Admin only through fallback; no explicit classification |
| `/api/v1/admin/platform-admins*` | Platform Master Admin only |
| `/api/v1/admin/invoices*` | `admin.invoices` |
| Unclassified protected legacy Platform Admin endpoints | Platform Master Admin only until explicitly classified here and in middleware tests |

`/api/v1/admin/me`, `/logout`, and `/change-password` require an active Platform Admin session but no page grant. The bootstrap master has all grants implicitly; permissions are never trusted from a JWT claim.

The mounted registration-draft approval routes are `/api/v1/admin/tenants/registration-drafts/:draftId/approve` and `/retry-materialization`; they are covered by the generic `admin.tenants` rule. `auth.js` also contains a rule for `/api/v1/registration/drafts/:id/(approve|retry-materialization)`, but no route is mounted at that path. The `registration-industries` and tenant-revenue admin paths are master-only only because they reach the fallback above; the middleware has no explicit rule for them.
