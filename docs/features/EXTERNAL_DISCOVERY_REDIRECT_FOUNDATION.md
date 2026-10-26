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

## Admin visibility controls

The master-only **External Map Pins** page has two independent visibility switches. Each partner card has **Show on discovery map**, stored as `external_redirect_sites.show_on_map`; each pin has its existing **Visible on discovery map** state, stored as `storefront_discovery_index.is_visible`. A pin appears in public discovery only when its own `is_visible` value is true and its partner's `show_on_map` value is not false. Missing `show_on_map` values default to shown for additive rollout compatibility.

The partner card's `visible_pin_count` reports effective public visibility after both switches are applied, so it is zero while the partner type is hidden even when some individual pin switches remain on.

Hiding a partner type removes its managed pins from discovery search, map pins, and the profile-by-slug read, and makes their `/e/{slug}` links unavailable. Showing the type restores only pins whose individual visibility remains on. Hiding one pin leaves it in Admin as `Hidden` and makes its `/e/{slug}` link unavailable; showing it restores that pin even if its partner's redirect switch is disabled. `Enable redirects` remains separate: it controls destination resolution, not map visibility. Both visibility changes are audited and refresh the existing discovery cache version/signature.

The type switch is available after that partner's destination configuration has been saved. Saving a destination does not change `show_on_map`. Re-applying an event seed does not resend `is_visible`, so it cannot show a pin an operator hid. The additive migration `20261023000001-add-show-on-map-to-external-redirect-sites.cjs` adds a non-null boolean with default `true`; run the migration runner before starting the API. During a mixed-version rollout, an API whose database has not received the column logs the lookup failure and fails open by treating all partner types as shown.

## Map behavior

Partner pins use category-specific colors and icons: Proventus blue briefcase, Eytitu amber taxi, Mapviu pink house, and Synqcore magenta hotel. Selecting a map pin opens an external preview and highlights the pin without navigating. The preview's one action uses **View Job**, **Book This Taxi**, **Inquire**, or **Book Stay**, respectively. The action opens the public `storefront_url`, which is `/e/{slug}` for Admin-managed rows. Available address, short description, distance, and approved HTTPS image appear only when supplied; no unavailable field is fabricated. Native pins retain their existing selection and navigation behavior.

## Category chips

Storefront appends **Hotel**, **Real Estate**, **Taxi**, and **Job** after the existing category chips. Desktop users reach them with **More**; mobile users scroll to the end of the chip rail. Managed external discovery rows derive `storefront_categories` from their known provider when no explicit categories are stored: SynqCore → Hotel, MapViu → Real Estate, Eytitu → Taxi, and Proventus → Job. Explicit categories and native storefront rows are unchanged, and the existing search and client category filters use the derived value. The event seed tool supports SynqCore, MapViu, and Proventus records; the supplied Proventus export produces six employer pins for Job. This is company data, not job-posting data. Eytitu has no records in this event seed, so Taxi remains empty until Eytitu listings are configured.

### Source fields needed by later import, not stored today

Employer, vehicle/taxi ID, driver/provider name, ETA, availability, listing image with approved host, and price are not approved public fields in the managed external record. A later #2629 source contract must approve and supply them before a preview may show them. They are not a dependency for the current sparse preview.

### Event seed (2026-10-24 program)

`apps/dgfy-api/scripts/external-discovery-event-seed.js extract` reads SynqCore, MapViu, and Proventus sources and writes an ignored `dgfy-external-event-seed/v1` file. SynqCore extraction requires both `--synqcore <properties.json>` and `--synqcore-rooms <rooms.json>`: it makes one pin per property, preserves the property-based DGFY slug, and uses that property's lowest numeric `room_id` as the redirect reference. It uses the selected room's coordinates only when property coordinates are absent, and skips properties without a matching room ID rather than falling back to the property ID. When the SynqCore properties export also contains bookings, hosts, or accounts, the extractor reads only the `properties` array and does not copy those sections into the seed. Pass a Proventus company export with `--proventus <json>`; it may be a top-level array or an object with a `companies` array. The output allow-list is exactly slug, provider, reference ID, title, coordinates, address, and short description. Proventus rows with an invalid or missing ID/title, a test name, contact-bearing title, inactive status, or no coordinates are skipped as `invalid_reference`, `test_record`, `pii_in_title`, `not_active`, or `no_coordinates`. Address and description text containing contact details is removed. No coordinates are inferred or geocoded. The supplied 2026-10-23 Proventus company export extracts six listings and skips two for missing coordinates; these are employer pins, not job postings, and the export does not provide an individual job destination. The source's website and logo are not imported or used as redirects. Pat must supply the approved HTTPS `{id}` destination template in Admin; no Proventus route is inferred from the source host.

The raw exports, bookings, users, tokens, prices, and derived seed file must never enter git. Copy only the reviewed minimal seed file to the target server. In Admin, open **External Map Pins → Proventus**, set the operator-confirmed HTTPS URL template with one `{id}` slot, and enable redirects. Review addresses before applying because some sole-proprietor listings may use a personal address. Run `apply --file <minimal.json>` as a dry run first, then repeat with `--apply` in DEV before any separately authorized production load.

After the API and migration deploy, an operator enables each partner's real HTTPS `{id}` template in Admin. Run `node scripts/external-discovery-event-seed.js apply --file <minimal.json>` inside the API container for a dry run, then repeat with `--apply` after reviewing the sites and counts. After the event, use **Clear temporary event pins** in Admin. That action removes only `event_seed` pins and leaves manually managed pins intact.

## When source JSON arrives

Do not import raw files directly into the public table. First confirm the source's stable IDs, publish/removal semantics, public display fields, real coordinates, domain, and destination route with its owner. Define a versioned mapping and dry-run report, then upsert by `(external_provider, external_reference_id)` while preserving `slug`. Reject malformed or partial exports without deleting existing pins. Mark explicit unpublishes hidden; only apply deletions from an authoritative full snapshot. Track the source export/import run separately. These remain acceptance criteria of #2629 and are not implemented by this foundation.

The `event_seed` marker is for static program data; the Admin cleanup does not touch manual records or destination configuration. Future live feeds can project into the same discovery row with their own origin value and idempotent import path. If DGFY later handles booking or application natively, add an explicit action capability and route; do not infer that behavior merely from `external_provider`. Preserve existing `/e/{slug}` links as redirect links until a deliberate migration is approved.

## Operational verification

Run the migration before the API using the new model. Configure a partner's actual approved HTTPS template in Admin, then add a representative listing with real coordinates and source ID. Verify the pin, partner cue, stable `/e/{slug}` link, and final destination on desktop and mobile. Change the template without rebuilding Storefront and verify the same link resolves to the new destination. Disable the site and verify the link fails closed. After the program, use **Clear temporary event pins** and confirm manual pins remain.

Architecture: [ADR 0010](../architecture/adr/0010-storefront-discovery-item-match-index-and-union-query.md), [ADR 0047](../architecture/adr/0047-platform-admin-identity-and-page-rbac.md), [architecture boundaries](../architecture/ARCHITECTURE_BOUNDARIES.md), and [governance](../architecture/ARCHITECTURE_GOVERNANCE.md). ADR 0037 is still proposed and does not constrain this implementation.
