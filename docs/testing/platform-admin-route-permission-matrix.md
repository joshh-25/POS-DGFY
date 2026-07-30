---
status: authoritative
authority_level: authoritative
owner: platform-security
last_reviewed: 2026-07-28
applies_to: platform_admin_routes
topic: platform_admin_page_authorization
---

# Platform Admin Route Permission Matrix

The backend resolves current session and database permissions on every Platform Admin request. Frontend navigation is only a usability layer; every direct route and API request must independently enforce this matrix.

| Route family | Required authority |
| --- | --- |
| `/api/v1/admin/feedback*` | `admin.feedback` |
| `/api/v1/admin/tenants/pricing*` | `admin.pricing` |
| `/api/v1/admin/tenants/*` | `admin.tenants` |
| `/api/v1/admin/tenants/admin-provision-with-account`, `/:id/owner` | `admin.tenants` and `admin.dgfy_accounts` |
| `/api/v1/dgfy/admin/accounts*` | `admin.dgfy_accounts` |
| `/api/v1/commerce-payments/admin*` | `admin.payments` |
| `/api/v1/admin/platform-admins*` | Platform Master Admin only |
| `/api/v1/admin/invoices*` | `admin.invoices` |
| Unclassified protected legacy Platform Admin endpoints | Platform Master Admin only until explicitly classified here and in middleware tests |

`/api/v1/admin/me` and `/logout` require an active Platform Admin session but no page grant. The bootstrap master has all grants implicitly; permissions are never trusted from a JWT claim.
