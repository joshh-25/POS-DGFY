---
status: reference
owner: engineering
last_reviewed: 2026-07-25
related_adr: docs/architecture/adr/0036-affiliates-program-commission-and-cashout.md
declaration_id: 2026-07-25-pos-affiliate-invite-links
classification: major
surfaces: pos,terminal
reason_codes_impacted: ALLOWED
policy_version: 2026.07.25
verification_evidence: npm --prefix frontend run build,npm run check:architecture-guardrails,npm run check:controller-boundaries,npm run check:tenant-schema-coverage,npm run check:compliance
rollback_note: Revert this PR's diff. The POS change is additive - a net-new "Invite Affiliate" form plus a pending-invites list inside the existing admin-gated AffiliatesWorkspacePanel, and three flat API-client wrappers (inviteAffiliate/listAffiliateInvites/cancelAffiliateInvite) in affiliateService.js. It does not touch checkout, totals, tax, payments, discounts, fiscal documents, or existing affiliate provisioning; reverting removes the invite UI cleanly and the backend dgfy_affiliate_invites table is inert without it.
preflight_result: no_breach
preflight_reason_code: ALLOWED
preflight_run_at: 2026-07-25T00:00:00+08:00
preflight_request_ref: POS-AFFILIATE-INVITE-LINKS-2026-07-25
---

# POS Affiliate Invite Links

## Compliance Impact Classification

Major. This adds an email-invite flow to the Affiliates Program so a merchant can invite an affiliate
by email even when that person has no DGFY account yet. Classified `major` per the `pos`/`terminal`
surface floor because two POS-surface files are touched
(`frontend/src/features/pos/components/AffiliatesWorkspacePanel.jsx` and
`frontend/src/features/pos/services/affiliateService.js`). No payments, settings, compliance, or
fiscal-document file is touched anywhere in this PR.

## Affected Surfaces

- `frontend/src/features/pos/components/AffiliatesWorkspacePanel.jsx`: adds an admin-gated "Invite
  Affiliate" form (email + optional rate override) and a pending-invites list with a cancel action.
  Update: the separate instant "Provision Affiliate" section was removed and its behavior consolidated
  into this single invite action (the invite flow already auto-detects whether the email has a DGFY
  account and routes existing accounts through an explicit accept step) - so an existing account is no
  longer instantly enrolled without acknowledgment. Gated by the same `affiliates:manage` /
  `affiliates:view` checks already used by this panel; the backend provision endpoint is left intact but
  is no longer surfaced in the POS.
- `frontend/src/features/pos/services/affiliateService.js`: adds `inviteAffiliate`,
  `listAffiliateInvites`, and `cancelAffiliateInvite` API-client wrappers for the new admin invite
  endpoints; no existing wrapper is modified.
- Backend (non-POS-surface, landlord DB only): new `dgfy_affiliate_invites` table/model/migration, new
  invite/accept/preview/list/cancel use cases and repository methods in the existing `dgfyAffiliate*`
  domain trio, admin routes under `/affiliates/invites`, public preview + authenticated accept routes
  under `/dgfy/affiliate/invites`, an invite email template/sender, and a register-time auto-enroll
  hook that mirrors the existing `mirrorPendingInvitationsForAccount` pattern (matched by email).
- Storefront (`frontend/apps/store`, non-POS-surface): `/register` locks the prefilled email and shows
  an affiliate banner when opened from an invite link; a new `/affiliate/accept` page lets an existing
  account explicitly accept.

## Compliance Preconditions

1. Checkout, cart totals, VAT/convenience-fee calculation, discounts/promos, payment handling, order
   submission, and fiscal-document generation are entirely untouched - this PR adds no code on any of
   those paths.
2. All invite creation/list/cancel mutations are server-side gated by the existing
   `affiliates:manage` / `affiliates:view` permissions via `checkPermission(...)` on the admin routes;
   no new unauthenticated or under-permissioned mutation path is introduced.
3. The accept endpoint requires an authenticated DGFY account and asserts the account's email matches
   the invited email exactly (403 otherwise); the register-time auto-enroll matches by email only after
   the platform's existing email-OTP verification has proven control of that email - so an invite can
   never bind an enrollment to the wrong account.
4. Invite tokens are opaque random values; only their SHA-256 hash is persisted (mirroring
   `UserInvitation`/`DgfyReviewInvite`), the raw token travels only in the emailed link, and invites
   carry a 7-day expiry.
5. All new tables/models live in the landlord DB behind the existing `dgfyAffiliate*` domain and are
   unrelated to stock/inventory records, fiscal-document generation, or the payment provider - see
   `docs/architecture/adr/0036-affiliates-program-commission-and-cashout.md`.

## Verification Evidence

The commands in front matter must pass before deployment. For this PR, `check:architecture-guardrails`,
`check:controller-boundaries`, and `check:tenant-schema-coverage` were run locally and pass; the store
and POS frontend bundles were rebuilt successfully via the local-test Docker stack (Vite build clean);
and the full invite flow was exercised end-to-end against that stack - new-user auto-enroll on register
(enrollment `source=invite`, `status=active`, invite flips to `accepted`), existing-account explicit
accept, the email-mismatch guard (403), and bogus/expired token rejection - all passing.
