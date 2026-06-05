---
status: reference
owner: storefront
last_reviewed: 2026-05-29
topic: storefront_mapviu_public_api
---

# Storefront MapViu Public API Notes (2026-05-29)

## Purpose
Record the production change requested for MapViu API Sources so the external map tool can fetch DGFY public storefront pins without opening authenticated backend APIs.

## What Changed
- Added a flat, public, auto-parser-friendly map feed:
  - `GET /api/v1/storefront/discovery/map-pins`
- The response maps public discovery rows into fields that external map tools can infer directly:
  - `title`
  - `latitude`
  - `longitude`
  - `subtitle`
  - `description`
  - `category`
  - `address`
  - storefront metadata such as `slug`, `storefront_url`, `tenant_id`, `location_id`, open state, fulfillment flags, and `catalog_count`
- The map-pins feed reuses the existing Storefront discovery validator/query contract and defaults to `limit=100` with `include_match_meta=false`.
- Item availability is opt-in so existing MapViu parsing stays stable:
  - `include_items=true` adds public available item fields per pin.
  - `item_limit` caps the structured item list, defaults to `5`, and has a public max of `10`.
  - `available_item_names` is a comma-separated field for flat auto-parsers.
  - `available_items` is a structured array with `name`, `category`, and `availability_status`.
  - `available_item_count` is the total public available item count found in the indexed snapshot for that pin location.
- The item fields are built from the existing Storefront discovery item snapshot. They do not query tenant inventory tables at request time and do not expose exact stock quantities, unit cost, supplier data, company tokens, or unpublished catalog rows.

## CORS Scope
- Added `PUBLIC_API_CORS_ORIGIN` as a separate public API allowlist.
- MapViu is configured with:
  - `PUBLIC_API_CORS_ORIGIN=https://mapviu.com,https://*.mapviu.com`
- This allowlist is intentionally path- and method-limited to public reads only:
  - methods: `GET`, `HEAD`, `OPTIONS`
  - paths:
    - `/api/v1/storefront/discovery`
    - `/api/v1/storefront/discovery/map-pins`
    - `/api/v1/storefront/geo-search`
- Existing `CORS_ORIGIN` remains the global frontend allowlist for DGFY/SKUpervisor/POS/Storefront surfaces.
- Unsupported public API CORS methods are rejected as client errors (`403`, `CORS_NOT_ALLOWED`) rather than server failures.

## Production Readiness Evaluation (2026-06-01)
Overall rating: **9.4/10 - production ready**.

| Area | Rating | Evidence |
|---|---:|---|
| API compatibility | 10/10 | Default `map-pins` payload remains pin-only unless `include_items=true` is requested. |
| Parser usability | 9/10 | Opt-in response includes flat `available_item_names` and structured `available_items`. |
| Data privacy | 10/10 | Public item fields omit exact stock, unit cost, suppliers, company tokens, and unpublished catalog rows. |
| Architecture fit | 10/10 | Runtime reads reuse the existing Storefront discovery snapshot and avoid tenant inventory fanout. |
| Validation and limits | 9/10 | `item_limit` defaults to `5`, caps at `10`, and invalid values fail validation. |
| CORS safety | 9/10 | MapViu origins are path- and method-limited to public read endpoints; unsupported methods return explicit client errors. |
| Operational readiness | 9/10 | Governed checks cover focused backend tests, docs lint, architecture guardrails, compliance checks, production deploy, and live smoke. |

Residual risk:
- Item category is available for newly reconciled discovery snapshots. Older snapshot rows can still return an empty item category until the storefront discovery index reconciliation refreshes them.
- The item list is intentionally capped for third-party map payload size. Consumers needing full catalogs should use the public Storefront catalog contract rather than this map feed.

Final assessment:
- No blocking issues remain for the MapViu public API use case.
- The endpoint is production ready when the governed release checks pass and the live production smoke confirms default payload compatibility, opt-in item fields, CORS GET preflight allow, unsupported method rejection, and absence of sensitive item fields.

## Files Changed
- `backend/src/config/corsPolicy.js`
- `backend/src/server.js`
- `backend/src/routes/storefrontDiscovery.js`
- `backend/src/validators/storefrontDiscoveryValidator.js`
- `backend/src/modules/storefrontDiscovery/usecases/storefrontDiscoveryUseCases.js`
- `backend/src/modules/storefrontDiscovery/controllers/storefrontDiscoveryHandlers.js`
- `backend/src/controllers/storefrontDiscoveryController.js`
- `backend/.env.example`
- `backend/.env.vps.example`
- `docs/api/specification.md`
- `docs/ops/DEPLOYMENT_GUIDE.md`

## Validation Before Deploy
- `npm --prefix backend test -- --runTestsByPath tests/corsPolicy.test.js tests/storefrontDiscoveryMapPins.usecase.test.js tests/storefrontDiscoveryValidator.test.js`
- `npm run check:architecture`
- `npm run lint:docs`

## Operator Notes
- Production must include `PUBLIC_API_CORS_ORIGIN` in the backend runtime environment before or during deploy.
- Use `https://dgfy.ph/api/v1/storefront/discovery/map-pins?limit=100` in MapViu's API URL field.
- To include available public items, use `https://dgfy.ph/api/v1/storefront/discovery/map-pins?limit=100&include_items=true&item_limit=5`.
- Do not add MapViu to `CORS_ORIGIN`; that would grant broader cross-origin access than the public map use case requires.
