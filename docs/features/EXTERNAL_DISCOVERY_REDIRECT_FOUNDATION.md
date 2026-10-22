---
status: reference
authority_level: reference
owner: product
last_reviewed: 2026-10-22
review_by: 2027-02-16
applies_to: external_discovery_redirects
---

# External discovery redirect foundation

This is the prepared handoff for external Sieitz listings in #2629. It does not claim that a source export has been received or imported. Live API integration, booking, job applications, and ride dispatch remain separate work.

## Current record and link contract

External pins reuse `storefront_discovery_index` with `entity_type = external_listing` and no tenant identity. The existing `external_provider` column holds one of `proventus`, `eytitu`, `mapviu`, or `synqcore`. The existing `external_reference_id` holds the source system's stable record ID. The existing `slug` is the DGFY public link ID; it must remain stable across updates. `external_record_origin` distinguishes `event_seed` from `manual`, allowing the post-event cleanup to remove only temporary records. Older curated records retain a null origin and their existing write path; that path refuses Admin-managed records. This uses the current schema vocabulary rather than adding `site` or `e_id` aliases.

The public listing and map pin expose `/e/{slug}` as `storefront_url` for newly managed records. The partner record ID stays internal. `GET /api/v1/storefront/discovery/external/redirect/{slug}` looks up a visible external record, finds its site's current Admin configuration, substitutes the encoded partner ID into its HTTPS URL template, checks the configured hostname, and returns a 302 redirect. The Storefront `/e/{slug}` route uses that endpoint so the destination can change without rebuilding the frontend image. Hidden records, disabled sites, missing configuration, or invalid templates return 404. Existing curated external rows with a direct `external_storefront_url` retain their old link behavior.

`external_redirect_sites` stores `site_key`, `url_template`, `allowed_hostname`, `enabled`, `updated_by_admin_id`, and timestamps. A master Platform Admin configures it under **External Map Pins**. Only HTTPS templates with exactly one `{id}` placeholder and a public hostname are accepted. No partner URL is seeded because actual URLs have not been supplied or approved.

The Admin page can add or update a pin by stable slug, partner ID, title, real coordinates, and optional public description/address. It also supports hide, delete, and event-only cleanup. Save actions audit the operator. Duplicate partner IDs within a provider are rejected; a slug belonging to a native DGFY storefront cannot be taken over.

## Map behavior

Partner pins use distinct icons and identify their source in the popup. Proventus uses **View job**, Eytitu **Book ride**, Mapviu **Inquire**, and Synqcore **Book stay**. Discovery cards and popups say the action opens a partner site. They do not show native order or store actions for these records.

## When source JSON arrives

Do not import raw files directly into the public table. First confirm the source's stable IDs, publish/removal semantics, public display fields, real coordinates, domain, and destination route with its owner. Define a versioned mapping and dry-run report, then upsert by `(external_provider, external_reference_id)` while preserving `slug`. Reject malformed or partial exports without deleting existing pins. Mark explicit unpublishes hidden; only apply deletions from an authoritative full snapshot. Track the source export/import run separately. These remain acceptance criteria of #2629 and are not implemented by this foundation.

The `event_seed` marker is for static program data; the Admin cleanup does not touch manual records or destination configuration. Future live feeds can project into the same discovery row with their own origin value and idempotent import path. If DGFY later handles booking or application natively, add an explicit action capability and route; do not infer that behavior merely from `external_provider`. Preserve existing `/e/{slug}` links as redirect links until a deliberate migration is approved.

## Operational verification

Run the migration before the API using the new model. Configure a partner's actual approved HTTPS template in Admin, then add a representative listing with real coordinates and source ID. Verify the pin, partner cue, stable `/e/{slug}` link, and final destination on desktop and mobile. Change the template without rebuilding Storefront and verify the same link resolves to the new destination. Disable the site and verify the link fails closed. After the program, use **Clear temporary event pins** and confirm manual pins remain.

Architecture: [ADR 0010](../architecture/adr/0010-storefront-discovery-item-match-index-and-union-query.md), [ADR 0047](../architecture/adr/0047-platform-admin-identity-and-page-rbac.md), [architecture boundaries](../architecture/ARCHITECTURE_BOUNDARIES.md), and [governance](../architecture/ARCHITECTURE_GOVERNANCE.md). ADR 0037 is still proposed and does not constrain this implementation.
