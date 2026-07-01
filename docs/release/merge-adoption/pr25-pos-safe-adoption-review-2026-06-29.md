---
status: reference
owner: engineering
last_reviewed: 2026-07-01
source_pr: 25
source_head: 1f0809803c663f53a6e848f00ca4015f4ec5193b
merge_base: 5b443043e30c7366fdecba3bb8ac8492b4acf074
target_base: 1f378f2ca5a8c2165964ca81d5ae1d8b089e51ce
---

# PR #25 POS Safe-Adoption Review

## Critical Assessment

PR #25 is not safe to merge or cherry-pick. It is a 281-file, conflict-heavy
branch that mixes POS behavior with DGFY, Storefront, onboarding, mobile,
generated bundles, screenshots, local Android configuration, and a SQL helper.
Its tenant-local cashier credential model conflicts with ADR 0028 and current
staging. Current staging already owns shift enforcement, location-scoped
Inventory movements, barcode readiness, DGFY company access, and separate POS
and Storefront visibility.

## Requirement Matrix

| Requirement | Current staging | PR #25 | Adopted result |
|---|---|---|---|
| DGFY primary identity | Present | Partly bypassed by local cashier login | Preserve staging; explicitly reject local cashier auth |
| Terminal possession proof | Missing | Cashier/terminal concepts coupled | Reimplement as independent hashed terminal password and pairing cookie |
| Company before terminal | Present in DGFY flow | Inconsistent across flows | Preserve company selection, then pair selected terminal |
| Admin navigation without shift | Shift modal blocks navigation | Proposed bypass mixed with permissions | Allow safe admin navigation; keep transactional guards |
| Cashier-focused navigation | Partial | Proposed | Reimplement from current staging roles/permissions |
| Always Available | Missing explicit product exemption | Proposed stock bypass | Add explicit POS-only flag and immutable stock-effect snapshot |
| Multiple terminals per location | Supported | Restrictive assumptions | Preserve staging support |
| Storefront separation | Present | Broad mixed changes | Preserve staging; no Storefront behavior adoption |

## Recommendation and Plan

Proceed only through a fresh branch from `origin/staging`, reimplement the valid
behaviors in three reviewable slices, and use the accompanying machine-readable
file disposition and merge-adoption manifests. Do not merge PR #25 and do not
promote or deploy this branch from this review.

## Explicit Rejections

1. Tenant-local cashier tables, create/login/setup use cases, passwords, and UI.
2. Generated Android bundle, timestamp helper, screenshots, `local.properties`,
   ad hoc SQL, and unrelated mobile/Storefront/onboarding rewrites.
3. Any behavior that replaces current staging shift, DGFY, location, Inventory,
   visibility, compliance, fiscal receipt, or release-governance contracts.

The companion `pr25-pos-file-disposition-2026-06-29.json` classifies every
PR-changed path as direct reuse, reimplementation, split, or rejection.
