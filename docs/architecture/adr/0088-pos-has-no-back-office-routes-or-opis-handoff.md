---
status: proposed
authority_level: authoritative
owner: architecture
date: 2026-09-30
last_reviewed: 2026-09-30
review_by: 2027-03-30
applies_to: apps/dgfy-pos, apps/dgfy-opis
topic: opis_fourth_frontend_app
supersedes_in_part: docs/architecture/adr/0087-dedicated-back-office-fourth-frontend-app-opis.md (Decision 1 only)
---

# ADR 0088: POS Has No Back Office Routes or OPIS Handoff

## Status

Proposed. Tech-lead approval is required before merge because this decision
supersedes a binding clause in ADR 0087. The operator's product direction is
that the current production POS surface remains free of Back Office routes and
direct OPIS links while OPIS remains the permanent, independently accessible
Back Office.

## Context

ADR 0087 established OPIS as the dedicated Back Office and directed former POS
Back Office URLs to redirect to OPIS. The production baseline on `origin/main`
has no `/backoffice/*` or `/business-admin/*` routes, no POS Back Office launch
controls, and no POS-to-OPIS redirect. Issue #2140 and its implementation
handoff were written against a different, earlier interpretation and requested
restoring POS administration. The corrected product direction is to match
`origin/main` and remove those POS references. Merchants access OPIS manually
at its own app origin during the transition. This does not make OPIS temporary
or remove it from the product.

## Decision

1. POS registers no Back Office or Business Admin route, alias, compatibility
   redirect, or navigation control. Requests for historical POS hash routes
   use the ordinary POS not-found handling. `[binding]`
2. POS emits no direct link or handoff to OPIS. The POS `/sales` route retains
   its production handoff to SKUpervisor. `[binding]`
3. OPIS remains the permanent, independently buildable and deployable Back
   Office. Users access it manually at its own app origin until future product
   work introduces an explicitly reviewed transition. Its routing, session
   namespace, authentication, and API contracts remain unchanged. `[binding]`
4. This decision supersedes only ADR 0087 Decision 1's requirement that former
   POS Back Office routes redirect to OPIS. ADR 0087's remaining decisions,
   including app isolation, shared-trunk ownership, OPIS session separation,
   and the IMS-to-OPIS handoff, remain in force. `[binding]`

## Consequences

- POS users cannot discover or enter OPIS through POS navigation or historical
  POS Back Office URLs.
- OPIS continues independently; no API, data, session, deployment, or OPIS route
  change is required.
- Any later staged POS-to-OPIS discovery or workflow integration needs its own
  product and architecture review.

## Validation

1. Confirm the POS route tree has no `/backoffice/*`, `/business-admin/*`, or
   OPIS redirect and still hands `/sales` to SKUpervisor.
2. Confirm the POS sidebar, locked-terminal UI, and terminal handlers expose no
   Back Office launch action.
3. Build POS and run its route-boundary contracts; build OPIS to confirm its
   standalone app remains intact.
4. Run the architecture, ADR, compatibility-seam, and compliance checks.

## References

- ADR 0087 — Dedicated DGFY Back Office as a Fourth Frontend App
- Issue #2140 — original implementation request; acceptance text needs product
  reconciliation with this corrected direction
