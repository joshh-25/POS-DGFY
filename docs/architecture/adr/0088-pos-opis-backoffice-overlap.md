---
status: proposed
authority_level: authoritative
owner: architecture
date: 2026-09-29
last_reviewed: 2026-09-30
review_by: 2027-03-29
applies_to: frontend_architecture
topic: pos_opis_backoffice_overlap
supersedes_in_part: docs/architecture/adr/0087-dedicated-back-office-fourth-frontend-app-opis.md
---

# ADR 0088: POS and OPIS Business Admin overlap

## Status

Proposed for issue #2140. Tech-lead approval is pending. This proposal does
not take effect until accepted; ADR 0087 remains authoritative in the meantime.

## Context

ADR 0087 established OPIS as the dedicated Back Office and requires POS
administrative routes to redirect to OPIS. Issue #2140 records the later product
direction to restore the POS Business Admin workflows that existed immediately
before PR #2054 while retaining OPIS, its independent deployment, root routes,
and session namespace. The selected source baseline is
[`e4af6b7`](https://github.com/Sieitzz/dgfy-platform/tree/e4af6b768b3cfe3f114bde9a1af6394cc89a6b84),
not the merge parent of PR #2054.

## Decision

1. POS may serve the inventoried pre-#2054 Business Admin workflows at the
   POS-native `/business-admin/*` route, plus the historical `/sales` and
   `/reports` aliases. POS does not link to OPIS; OPIS is accessed manually
   while the existing POS workflows remain available during a gradual,
   user-aware transition. OPIS remains the permanent Back Office destination.
   This narrowly supersedes ADR 0087 Decision 1's POS redirect requirement
   only for this inventory. `[binding]`
2. OPIS remains an independently buildable, deployable Back Office with its
   canonical root-level routes, app-owned account actions, and independent
   `opis_*` session namespace. POS retains its `sku_*` session namespace.
   `[binding]`
3. The shared Business Admin presentation, route models, and service client
   live in `packages/web-core`. POS and OPIS select surface behavior through
   app-owned adapters; that selection affects route presentation only and
   grants no authorization. `[binding]`
4. The server remains the authority for tenant, branch, and permission checks.
   Business Admin calls existing canonical API and command owners; it adds no
   API, schema, migration, or permission contract. `[binding]`
5. New back-office-level feature work continues to default to OPIS under
   accepted ADR 0087 and the repository feature-placement policy. The overlap
   does not decide the open structural question in #358. `[default]`

## Consequences

- POS and OPIS may expose the same inventoried workflows while preserving
  separate routers, deployments, and browser sessions. POS presents these as
  Business Admin and does not link to the OPIS Back Office.
- OPIS remains the permanent Back Office product. This POS restoration is a
  transition step; future migration of administrative functions into OPIS will
  be gradual and user-aware, with scope and sequencing determined separately.
- OPIS-only Taxes and Discounts settings and OPIS account controls remain
  unavailable in POS. Existing terminal tax and discount behavior is unchanged.
- The capability-level availability, owner, and permission inventory lives in
  [`docs/features/pos-opis-business-admin-overlap.md`](../../features/pos-opis-business-admin-overlap.md).
- Required acceptance evidence and release inclusion are tracked in issue
  #2140 and its implementing PR.

## Approval

Tech-lead approval: pending. Required before merge under ADR 0039.
