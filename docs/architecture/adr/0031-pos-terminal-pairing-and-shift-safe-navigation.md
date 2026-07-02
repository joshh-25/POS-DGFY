---
status: accepted
date: 2026-06-29
last_reviewed: 2026-07-01
classification: authoritative
---

# ADR 0031: POS Terminal Pairing and Shift-Safe Navigation

## Context

Standalone POS unlock already authenticates a DGFY account or a grace-eligible
legacy tenant user and resolves a tenant-local authorization profile. PR #25
proposed a richer setup and cashier user experience. The original unsafe shape
was a second credential authority outside the existing tenant-user lifecycle.
The valid requirement is richer operator setup and cashier-focused unlock while
preserving DGFY tenant context and current terminal possession proof.

## Decision

1. Keep DGFY membership as the primary identity and company-access authority.
2. Allow POS setup to create and list cashier profiles only as normal tenant
   users with the existing `cashier` role, existing location grants, and tenant
   database context. Do not create a separate cashier credential table or bypass
   DGFY tenant resolution.
3. Do not create tenant-local cashier credentials from POS setup. POS setup uses
   the DGFY account search/invitation contract from ADR 0028, forces the cashier
   role, and persists active tenant-location grants with the pending invitation.
4. Terminal pairing is administrator-authorized device enrollment, not a reusable
   terminal password. A master admin signs in with DGFY on the physical device,
   selects an active registered terminal, and receives a signed, HttpOnly,
   SameSite=Lax pairing cookie bound to tenant, terminal, location, and a rotatable
   pairing version. Cashiers never receive or enter a terminal secret.
5. Use a dedicated `POS_TERMINAL_PAIRING_SECRET` in production. Do not reuse
   access-token or refresh-token secrets.
6. Revalidate terminal active state, location binding, pairing version, tenant
   authorization profile, and DGFY membership on paired requests. Fail closed
   when any binding changes. Terminal removal, deactivation, location reassignment,
   or explicit re-pair rotates/revokes the device binding.
7. Require valid pairing for checkout and every terminal mutation. Shift rules
   remain separate: pairing does not authorize checkout, drawer opening,
   receipt printing, or other transactional actions without an open shift.
   The POS UI must freshly verify pairing before shift open and must direct the
   master admin to re-pair instead of submitting or refreshing authentication
   when a migrated, expired, or rotated pairing is invalid.
8. Administrators may dismiss the open-shift prompt and navigate read-only or
   configuration surfaces. Cashier-role users remain in cashier-focused
   navigation, and no-shift transactional controls stay disabled.
9. POS Settings access PIN may guard configuration surfaces. Store only a hash,
   expose only a configured/not-configured read indicator, and require master
   admin authority to set or clear the PIN.
10. A location may own multiple active terminals/counters. Terminal IDs remain
    unique and exactly one active terminal may be the tenant default.
11. The company founder/master admin remains an administrator and is treated as
    POS-operator ready without creating a duplicate cashier role or user row.
12. Cashier defaults follow least privilege: catalog view, checkout, shift open
    and shift close, and receipt reprint. Day close, governed reset, void, cash
    drawer adjustment, price override, eSales administration, fiscal-terminal
    administration, and location switching require separately granted authority.

## Boundary Consequences

The Settings module owns terminal registry configuration and pairing-version
rotation. The POS module owns device enrollment, pairing verification, and
mutation guards. DGFY owns account invitation and company membership. The Users
service owns tenant-local authorization profiles and location grants created by
accepted DGFY invitations. Tenant-local users remain authorization profiles
inside the selected tenant, not a separate credential authority.

## Validation

1. Pairing service, cookie, use-case, rejection, and settings-secret tests.
2. POS terminal identity, unlock, admin-navigation, shell, and settings tests.
3. POS and SKUpervisor production builds.
4. Rendered desktop, tablet, and mobile terminal evidence before merge approval.
5. Docs, architecture, compliance, merge-adoption, and reviewed-batch gates.
