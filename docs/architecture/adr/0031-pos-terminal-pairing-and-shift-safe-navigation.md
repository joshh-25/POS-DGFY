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
3. Add an independent terminal password to each active terminal registry entry.
   Store only a bcrypt hash; never return the hash through settings or compliance
   evaluation payloads.
4. After DGFY or permitted legacy authentication, require terminal selection and
   terminal-password verification. Issue a signed, HttpOnly, SameSite=Lax
   pairing cookie bound to tenant, terminal, location, user, identity type,
   membership, and terminal-password fingerprint.
5. Use a dedicated `POS_TERMINAL_PAIRING_SECRET` in production. Do not reuse
   access-token or refresh-token secrets.
6. Revalidate terminal active state, location binding, password fingerprint,
   tenant authorization profile, and DGFY membership on paired requests. Fail
   closed when any binding changes.
7. Require valid pairing for checkout and every terminal mutation. Shift rules
   remain separate: pairing does not authorize checkout, drawer opening,
   receipt printing, or other transactional actions without an open shift.
8. Administrators may dismiss the open-shift prompt and navigate read-only or
   configuration surfaces. Cashier-role users remain in cashier-focused
   navigation, and no-shift transactional controls stay disabled.
9. POS Settings access PIN may guard configuration surfaces. Store only a hash,
   expose only a configured/not-configured read indicator, and require master
   admin authority to set or clear the PIN.

## Boundary Consequences

The Settings module owns terminal registry secret storage and POS Settings PIN
secret storage. The POS module owns pairing verification, cashier setup API
orchestration, cashier-login transport, and mutation guards. The Users service
owns tenant-local cashier user creation and location grants. DGFY owns account
and company membership. Tenant-local users remain authorization profiles inside
the selected tenant, not a separate credential authority.

## Validation

1. Pairing service, cookie, use-case, rejection, and settings-secret tests.
2. POS terminal identity, unlock, admin-navigation, shell, and settings tests.
3. POS and SKUpervisor production builds.
4. Rendered desktop, tablet, and mobile terminal evidence before merge approval.
5. Docs, architecture, compliance, merge-adoption, and reviewed-batch gates.
