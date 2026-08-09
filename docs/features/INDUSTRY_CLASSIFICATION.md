---
status: reference
authority_level: reference
owner: architecture
last_reviewed: 2026-08-09
applies_to: catalog,settings,storefront
topic: dgfy_industry_classification
---

# DGFY Industry Classification Guide

This is DGFY's own "Sample Business Niches by Industry" reference guide,
transcribed here as the canonical source for the registration Industry
catalog (`packages/shared-constants/src/registrationIndustries.js`, issue
#178 Phases 31-33 — see "Registration Industry layer" in
`docs/features/STORE_TEMPLATES_AND_PROFILES.md`). It classifies a business
by its **main activity**, not simply the products or services it also
offers.

11 of the 12 industries below are modeled in the registration catalog, each
mapped to a `workflow_mode` and (where one is registerable) a
`template_key`. Industry #12 is deliberately out of scope — see its section
below.

## Classification principle

Classify each business according to its main activity — not simply the
products or services it also offers.

## Quick classification rule

| If the business mainly… | DGFY industry |
|---|---|
| Resells products | Retail |
| Runs a small neighborhood or home-based retail operation | Micro-Retail or Simple MSME |
| Provides appointments, labor, repairs, or professional work | Services |
| Prepares meals or drinks for immediate consumption | Food & Beverage |
| Operates a small food stall, carinderia, or home food business | Micro Food & Beverage |
| Produces packaged or processed food for resale | Food Manufacturing |
| Provides short-term accommodation | Hospitality |
| Provides medical consultation, testing, or treatment | Healthcare |
| Moves passengers or sells tickets | Ticketing and Transport |
| Moves, stores, or distributes products and cargo | Logistics and Distribution |
| Provides learning, training, or institutional services | Education and Institutions |
| Provides software, subscriptions, downloads, licenses, or online tools | Technology and Digital Products |

When a business fits more than one category, select the industry that
represents its largest or most important source of customer activity.

## The 12 industries

### 01 — Retail
Businesses that primarily resell products to customers without
manufacturing them.

Sample niches: Supermarket, Grocery store, Convenience store, Clothing
boutique, Shoe store, Hardware store, Electronics store, Computer and
gadget store, Furniture store, Appliance store, Bookstore,
School-supply store, Toy store, Sports equipment store, Beauty and
cosmetics store, Pet-supply store, Automotive parts store, Motorcycle
parts store, Home and kitchen store, Department store.

Recommended sample business: Iloilo Everyday Mart.

**Registration mapping**: `workflow_mode: retail`, `template_key: retail_store`.

### 02 — Micro-Retail or Simple MSME
Small, usually owner-managed neighborhood businesses with a simple product
catalog.

Sample niches: Sari-sari store, Small neighborhood grocery, Market stall,
Dry-goods stall, Rice retail store, Egg retail store, Fruit stand,
Vegetable stand, Ukay-ukay stall, Street-side accessories stall, Small
school-supply store, Small cellphone-accessories stall, Souvenir stall,
Pasalubong stall, Home-based online seller, Reseller business, Small
variety store, Community cooperative store, Small flower stall, Small
pet-supply stall.

Recommended sample business: Tindahan ni Doe.

**Registration mapping**: `workflow_mode: msme`, `template_key: msme_simple`.

### 03 — Services
Businesses that primarily sell skills, labor, appointments, repairs, or
professional services.

Sample niches: Hair salon, Barbershop, Nail salon, Spa and massage center,
Laundry shop, Cleaning service, Air-conditioning repair service, Appliance
repair shop, Computer repair shop, Mobile-phone repair shop, Motorcycle
repair shop, Car wash, Auto repair shop, Photography studio, Printing
shop, Tailoring and alteration shop, Event-planning service,
Graphic-design service, Accounting service, Legal consultancy,
Construction contractor, Pest-control service, Home-maintenance service,
Equipment-rental service, Motorcycle-rental service.

Recommended sample business: Gupit & Glow Studio.

**Registration mapping**: `workflow_mode: services`, `template_key: services_shop`.
The `services_with_parts_retail` preset (repair shops that also sell
parts) is a real, published refinement of this industry, applied
afterward by a platform admin rather than offered as a separate signup
choice — see `REGISTRATION_EXCLUDED_TEMPLATE_KEYS`.

### 04 — Food & Beverage
Established businesses preparing meals or drinks for immediate
consumption.

Sample niches: Full-service restaurant, Casual-dining restaurant,
Fast-food restaurant, Café, Coffee shop, Milk-tea shop, Bakery café, Pizza
restaurant, Seafood restaurant, Grill house, Buffet restaurant,
Samgyupsal restaurant, Indian restaurant, Chinese restaurant, Japanese
restaurant, Filipino restaurant, Dessert café, Ice-cream shop, Bar and
restaurant, Catering business, Cloud kitchen, Multi-branch food business.

Recommended sample business: Eatery ni Doe or Sy Side Resto.

**Registration mapping**: `workflow_mode: fnb`, `template_key: fnb_full_service`.

### 05 — Micro Food & Beverage
Small or home-based food businesses with limited menus and simpler
operations.

Sample niches: Carinderia, Small eatery, Turo-turo, Food cart, Food
kiosk, Street-food stall, Barbecue stall, Lugawan, Pares stall, Silog
stall, Burger stand, Siomai stall, Halo-halo stand, Juice stand, Small
milk-tea kiosk, Home-based baker, Home-based food seller, Packed-lunch
seller, Bilao-order business, Merienda seller, Weekend food-market
vendor, Made-to-order cake seller, Online food seller, Small catering
business.

Recommended sample business: Kusina ni Nena.

**Registration mapping**: `workflow_mode: fnb`, `template_key: fnb_counter_service`.
This is the industry that proves the registration-Industry-layer thesis:
it existed in the platform only as a template, with no mode of its own,
before issue #178 Phases 31-33 made it reachable at signup — see
"Registration Industry layer" in `docs/features/STORE_TEMPLATES_AND_PROFILES.md`.

### 06 — Food Manufacturing
Businesses that produce packaged, processed, preserved, or bulk food
products for resale or distribution.

Sample niches: Bottled-sauce manufacturer, Condiment manufacturer,
Packaged-snack producer, Chips manufacturer, Biscuit manufacturer, Bread
and pastry commissary, Frozen-food manufacturer, Processed-meat
manufacturer, Longganisa producer, Canned-food manufacturer, Dried-fish
processor, Coffee-roasting company, Chocolate manufacturer, Ice-cream
manufacturer, Beverage manufacturer, Bottled-juice producer,
Dairy-products manufacturer, Noodle and pasta manufacturer, Rice-products
manufacturer, Pasalubong-products manufacturer, Ready-to-cook meal
producer, Food-packaging commissary, Central kitchen supplying branches,
Wholesale baked-goods producer.

Recommended sample business: Panay Pantry Foods.

**Classification note**: a restaurant belongs to Food & Beverage. A
company producing packaged food for stores, resellers, or distributors
belongs to Food Manufacturing.

**Registration mapping**: `workflow_mode: food_manufacturing`,
`template_key: food_manufacturer`. Engine classification: `transitional`
(`WORKFLOW_MODE_ENGINE`) — runs fully inside DGFY today; the product
direction is to eventually move it to a sibling app ("Skupervisor"). See
`docs/development/STORE_TEMPLATES_HANDOFF.md` §4.

### 07 — Hospitality
Businesses primarily offering short-term accommodation and guest
experiences.

Sample niches: Hotel, Resort, Beach resort, Boutique hotel, Business
hotel, Hostel, Inn, Pension house, Bed and breakfast, Transient house,
Guesthouse, Homestay, Farm stay, Glamping site, Campsite, Serviced
accommodation, Vacation-rental property, Mountain resort, Wellness
resort, Events resort, Hotel with function rooms, Conference and
accommodation facility.

Recommended sample business: Isla Vista Beach Resort.

**Registration mapping**: `workflow_mode: hospitality`,
`template_key: hospitality_property`. Engine classification:
`transitional` — planned to move to a sibling app ("Sync Core"). The
`hospitality_guesthouse` preset (a smaller hospitality tier) is a real,
published refinement, applied afterward by a platform admin rather than
offered as a separate signup choice.

### 08 — Healthcare
Licensed health facilities and providers offering consultation,
treatment, testing, or wellness-related care.

Sample niches: Family clinic, Medical clinic, Pediatric clinic, Dental
clinic, Eye clinic, Dermatology clinic, Women's health clinic, Maternity
clinic, Physical-therapy clinic, Rehabilitation center, Diagnostic
laboratory, Imaging center, Dialysis center, Vaccination center,
Animal-bite treatment center, Mental-health clinic, Nutrition clinic,
Occupational-health clinic, Home healthcare provider, Hospital, Community
health center, Veterinary clinic.

Recommended sample business: CarePoint Family Clinic.

**Classification note**: pharmacies mainly selling medicines can be
classified under Retail. Clinics providing consultations or treatments
belong to Healthcare.

**Registration mapping**: `workflow_mode: healthcare`, `template_key: null`.
Deliberately preset-less (`STORE_TEMPLATE_PRESETLESS_MODES`) and engine
classification `external` — a candidate for a vertical eventually powered
by a separate sibling app, with DGFY providing registration and UI/UX
visibility only. Fully registerable and listable today; provisions with
null template provenance.

### 09 — Ticketing and Transport
Businesses transporting passengers or managing routes, reservations,
seats, and tickets.

Sample niches: Bus operator, Provincial bus company, Ferry operator,
Passenger-ship operator, Airline ticketing agency, Van shuttle service,
Airport shuttle service, Tourist-transport service, Car-rental company,
Motorcycle-rental company, Taxi operator, Tourist boat operator,
Island-hopping operator, Railway ticketing service, Terminal operator,
Event-ticketing provider, Cinema-ticketing provider, Concert-ticketing
provider, Theme-park ticketing service, Tour and activity booking
service.

Recommended sample business: PanayLink Bus.

**Registration mapping**: `workflow_mode: ticketing_transport`,
`template_key: null`. Preset-less, engine classification `external` — see
industry #08's mapping note.

### 10 — Logistics and Distribution
Businesses moving, storing, supplying, or delivering goods rather than
passengers.

Sample niches: Courier service, Parcel-delivery company, Same-day
delivery service, Motorcycle delivery service, Trucking company,
Freight-forwarding company, Cargo transport service, Cold-chain logistics
company, Warehousing company, Fulfillment center, Distribution center,
Food distributor, Beverage distributor, Grocery distributor,
Pharmaceutical distributor, Agricultural-supply distributor,
Construction-material distributor, Wholesale consumer-goods distributor,
Import and distribution company, Moving service, Last-mile delivery
provider, Business-to-business supplier, Inventory and fulfillment
provider, Provincial cargo service.

Recommended sample business: SwiftIsland Logistics.

**Classification note**: passenger movement belongs to Ticketing and
Transport. Product, parcel, and cargo movement belongs to Logistics and
Distribution.

**Registration mapping**: `workflow_mode: logistics_distribution`,
`template_key: null`. Preset-less, engine classification `external` — see
industry #08's mapping note.

### 11 — Education and Institutions
Schools, training providers, organizations, and institutions offering
programs, facilities, events, or public services.

Sample niches: Preschool, Elementary school, High school, College,
University, Tutorial center, Review center, Training center, Language
school, Music school, Dance school, Driving school, Vocational school,
Technical-training institute, Online learning provider, Special-education
center, Corporate-training provider, Research institution, Government
training facility, Professional association, Nonprofit organization,
Community organization, Religious institution, Campus bookstore, School
canteen, School-events office, Campus facility-rental service, Museum or
cultural institution.

Recommended sample business: Westbridge Learning Center.

**Registration mapping**: `workflow_mode: education_institutions`,
`template_key: null`. Preset-less, engine classification `external` — see
industry #08's mapping note.

### 12 — Technology and Digital Products (out of scope)
Businesses that create or sell software, online tools, subscriptions, and
products delivered through the internet.

Sample niches: SaaS platform, Business management software, Mobile or web
application, Subscription-based digital tool, Cloud service, AI-powered
tool, Website or e-commerce builder, POS and inventory software, HR,
payroll, or accounting system, CRM platform, Project-management tool,
Online booking system, Cybersecurity software, API service, Software
license, Plugin or browser extension, Digital templates, e-books, or
design assets, Online course platform, Game credits and digital items.

Recommended sample business: CloudDesk PH.

**Classification note**: this should be its own industry because digital
products work differently from normal Services and Retail. Services
usually depend on a person doing work for a customer. Retail usually
sells physical products that need stock, pickup, or delivery. Technology
businesses provide software, subscriptions, downloads, licenses, or
online tools. They need different steps for plans, accounts, access,
renewals, and downloads.

**Not modeled in `REGISTRATION_INDUSTRIES`.** It needs its own lifecycle
(licensing, renewals, entitlement), not a POS/stock template — none of
the platform's three existing transaction lifecycles (Order, Booking,
Folio) fit it. Tracked by the draft "software sales as a new way to sell"
GitHub issue referenced in `docs/development/STORE_TEMPLATES_HANDOFF.md`
§6 (not yet filed — pending explicit approval).

## Registration visibility (issue #178 Phase 39)

An admin can hide any of the 11 modeled industries from the merchant-facing
signup surfaces without touching this classification guide or the
`REGISTRATION_INDUSTRIES` catalog constant — visibility is landlord-database
curation state, not a catalog edit:

- Store: `registration_industry_visibility` (landlord-only, one row per
  industry an admin has deliberately touched; row absence means visible).
  `registration_industry_visibility_audit_logs` records every hide/unhide
  with an actor and a required reason.
- Admin surface: the "Registration industries" panel on the Store Template
  Manager page (`frontend/Pages/admin/StoreTemplateManager.jsx`), and the
  `GET/PATCH /api/v1/admin/registration-industries*` endpoints behind it.
- Merchant contract: `GET /api/v1/registration/industries` always returns
  all 11 entries — it never shortens the array — with a `hidden: boolean`
  field per entry. The merchant-facing `IndustrySelect` dropdown
  (`frontend/src/features/registration/IndustrySelect.jsx`) filters out any
  `hidden: true` entry; the admin-only `IndustryPicker`
  (`frontend/src/features/registration/IndustryPicker.jsx`, TenantManager's
  assisted-provisioning panel) instead annotates it "Hidden from
  registration" and leaves it selectable.
- Server enforcement: `registerCompanyRequestUseCase.js` rejects a hidden
  `industryKey` with a 400 (`hidden_industry_key`) even if the client
  bypasses the dropdown's own filtering. Admin assisted provisioning is
  unaffected by construction — it sends `workflowMode`/`templateKey`
  directly, never `industryKey`.
- **Fail-open everywhere.** A landlord-DB outage never blocks or reshapes
  registration: the catalog read degrades to `hidden: false` on every
  entry, and the write-side rejection is skipped entirely, on any lookup
  failure.
- The pre-existing `visibility` ENUM on `store_configuration_templates`
  (write-only since it shipped, never read anywhere) is **not** the
  mechanism here — it only covers the 7 template-backed industries, and
  four (Healthcare, Ticketing and Transport, Logistics and Distribution,
  Education and Institutions) have no template row at all. See
  `docs/development/STORE_TEMPLATES_HANDOFF.md` §5 for the fuller writeup
  and that column's superseded status.

## Roadmap: hierarchical industry grouping (not yet built)

Today's catalog is a flat list of 11 industries. Feedback after Phase
38-40 shipped asked for grouping — e.g. Food & Beverage → {Full-service
restaurant, Micro Food & Beverage / carinderia}, Retail → {Retail
(supermarket-scale), Micro-Retail or Simple MSME (tiangge-scale)} — so the
registration dropdown can present a two-level picker instead of 11 flat
options.

The catalog already has this shape implicitly: `fnb` and `micro_fnb` are
two industries sharing one `workflow_mode` (`fnb`) — a two-member group in
everything but name. `retail`/`micro_retail` is the same pattern for
retail.

**Planned approach when this is built** (ADR 0057's code-owned-constant
pattern, not a database change): a new frozen constant
`REGISTRATION_INDUSTRY_GROUPS` in
`packages/shared-constants/src/registrationIndustries.js`, shaped like the
existing `CAPABILITY_MODULE_GROUPS` (`{label, order}` per group key, plus a
`members: [industryKey, ...]` list this constant would add). The merchant
dropdown (`IndustrySelect.jsx`) would render `<optgroup>` elements sourced
from it — zero API change, since the public catalog response already
carries every industry's key. Consequences to plan for when this lands:

- `backend/tests/registrationIndustries.contract.test.js`'s "unique,
  contiguous 1-based `order` values" pin
  (`orders` must equal `[1..N]` with no gaps) needs re-scoping to
  per-group ordering, or a second, group-level order field.
- The visibility store above stays industry-keyed, not group-keyed — hiding
  a whole group would mean toggling each member individually, which is
  probably fine at 11 industries but worth revisiting if the catalog grows.

This is deliberately **not a phase** — documented as a roadmap item only,
per the same "code-owned constant first, template/DB linkage only behind a
future, separately-authorized decision" posture ADR 0057 established for
the fulfillment-profile vocabulary.

## See also

- `docs/features/STORE_TEMPLATES_AND_PROFILES.md` — the "Registration
  Industry layer" section: how this guide becomes the registration
  catalog, how the server derives `workflow_mode`/`store_template_key`,
  and the two deliberately-excluded post-approval-only presets.
- `docs/development/STORE_TEMPLATES_HANDOFF.md` §4 — the
  native/transitional/external engine classification referenced
  throughout the mappings above.
- `packages/shared-constants/src/registrationIndustries.js` — the code
  transcription of this guide, contract-tested against
  `backend/tests/registrationIndustries.contract.test.js`.
