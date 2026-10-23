---
status: reference
authority_level: reference
owner: product
last_reviewed: 2026-10-23
review_by: 2027-02-16
applies_to: external_discovery_redirects
---

# External discovery redirect foundation

This is the prepared handoff for external Sieitz listings in #2629. The event seed tool can extract a narrow, temporary set of pins from the received exports; it is not a live import pipeline. Live API integration, booking, job applications, and ride dispatch remain separate work.

## Current record and link contract

External pins reuse `storefront_discovery_index` with `entity_type = external_listing` and no tenant identity. The existing `external_provider` column holds one of `proventus`, `eytitu`, `mapviu`, or `synqcore`. The existing `external_reference_id` holds the source system's stable record ID. The existing `slug` is the DGFY public link ID; it must remain stable across updates. `external_record_origin` distinguishes `event_seed` from `manual`, allowing the post-event cleanup to remove only temporary records. Older curated records retain a null origin and their existing write path; that path refuses Admin-managed records. This uses the current schema vocabulary rather than adding `site` or `e_id` aliases.

The public listing and map pin expose `/e/{slug}` as `storefront_url` for newly managed records. The partner record ID stays internal. `GET /api/v1/storefront/discovery/external/redirect/{slug}` looks up a visible external record, finds its site's current Admin configuration, substitutes the encoded partner ID into its HTTPS URL template, checks the configured hostname, and returns a 302 redirect. The Storefront `/e/{slug}` route uses that endpoint so the destination can change without rebuilding the frontend image. Hidden records, disabled sites, missing configuration, or invalid templates return 404. Existing curated external rows with a direct `external_storefront_url` retain their old link behavior.

`external_redirect_sites` stores `site_key`, `url_template`, `allowed_hostname`, `enabled`, `updated_by_admin_id`, and timestamps. A master Platform Admin configures it under **External Map Pins**. Only HTTPS templates with exactly one `{id}` placeholder and a public hostname are accepted. No partner URL is seeded because actual URLs have not been supplied or approved.

The Admin page can add or update a pin by stable slug, partner ID, title, real coordinates, and optional public description/address. It also supports hide, delete, and event-only cleanup. Save actions audit the operator. Duplicate partner IDs within a provider are rejected; a slug belonging to a native DGFY storefront cannot be taken over.

## Map behavior

Partner pins use category-specific colors and icons: Proventus blue briefcase, Eytitu amber taxi, Mapviu pink house, and Synqcore magenta hotel. Selecting a map pin opens an external preview and highlights the pin without navigating. The preview's one action uses **View Job**, **Book This Taxi**, **Inquire**, or **Book Stay**, respectively. The action opens the public `storefront_url`, which is `/e/{slug}` for Admin-managed rows. Available address, short description, distance, and approved HTTPS image appear only when supplied; no unavailable field is fabricated. Native pins retain their existing selection and navigation behavior.

## Category chips

Storefront appends **Hotel**, **Real Estate**, **Taxi**, and **Job** after the existing category chips. Desktop users reach them with **More**; mobile users scroll to the end of the chip rail. Managed external discovery rows derive `storefront_categories` from their known provider when no explicit categories are stored: SynqCore → Hotel, MapViu → Real Estate, Eytitu → Taxi, and Proventus → Job. Explicit categories and native storefront rows are unchanged, and the existing search and client category filters use the derived value. The event seed contains SynqCore and MapViu records only, so Job and Taxi return no pins until Proventus or Eytitu records are manually configured in Admin.

### Source fields needed by later import, not stored today

Employer, vehicle/taxi ID, driver/provider name, ETA, availability, listing image with approved host, and price are not approved public fields in the managed external record. A later #2629 source contract must approve and supply them before a preview may show them. They are not a dependency for the current sparse preview.

### Event seed (2026-10-24 program)

`apps/dgfy-api/scripts/external-discovery-event-seed.js extract` reads the SynqCore and MapViu exports and writes an ignored `dgfy-external-event-seed/v1` file. It allow-lists only slug, provider, reference ID, title, coordinates, address, and short description. Test, unpublished, hidden-location, invalid-reference, contact-bearing title, and coordinate-less records are skipped with explicit reasons. No coordinates are inferred or geocoded. The raw exports, bookings, users, tokens, prices, and derived seed file must never enter git or be copied to the server except for the minimal seed file.

After the API and migration deploy, an operator enables the partner's real HTTPS `{id}` template in Admin. Run `node scripts/external-discovery-event-seed.js apply --file <minimal.json>` inside the API container for a dry run, then repeat with `--apply` after reviewing the sites and counts. After the event, use **Clear temporary event pins** in Admin. That action removes only `event_seed` pins and leaves manually managed pins intact.

## When source JSON arrives

Do not import raw files directly into the public table. First confirm the source's stable IDs, publish/removal semantics, public display fields, real coordinates, domain, and destination route with its owner. Define a versioned mapping and dry-run report, then upsert by `(external_provider, external_reference_id)` while preserving `slug`. Reject malformed or partial exports without deleting existing pins. Mark explicit unpublishes hidden; only apply deletions from an authoritative full snapshot. Track the source export/import run separately. These remain acceptance criteria of #2629 and are not implemented by this foundation.

The `event_seed` marker is for static program data; the Admin cleanup does not touch manual records or destination configuration. Future live feeds can project into the same discovery row with their own origin value and idempotent import path. If DGFY later handles booking or application natively, add an explicit action capability and route; do not infer that behavior merely from `external_provider`. Preserve existing `/e/{slug}` links as redirect links until a deliberate migration is approved.

## Operational verification

Run the migration before the API using the new model. Configure a partner's actual approved HTTPS template in Admin, then add a representative listing with real coordinates and source ID. Verify the pin, partner cue, stable `/e/{slug}` link, and final destination on desktop and mobile. Change the template without rebuilding Storefront and verify the same link resolves to the new destination. Disable the site and verify the link fails closed. After the program, use **Clear temporary event pins** and confirm manual pins remain.

Architecture: [ADR 0010](../architecture/adr/0010-storefront-discovery-item-match-index-and-union-query.md), [ADR 0047](../architecture/adr/0047-platform-admin-identity-and-page-rbac.md), [architecture boundaries](../architecture/ARCHITECTURE_BOUNDARIES.md), and [governance](../architecture/ARCHITECTURE_GOVERNANCE.md). ADR 0037 is still proposed and does not constrain this implementation.
