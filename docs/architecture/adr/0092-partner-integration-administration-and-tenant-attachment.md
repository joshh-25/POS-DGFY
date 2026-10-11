---
status: proposed
authority_level: authoritative
owner: architecture
date: 2026-10-10
last_reviewed: 2026-10-10
review_by: 2027-04-10
topic: partner_integration_administration_and_tenant_attachment
---

# ADR 0092: Partner Integration Administration and Tenant Attachment

## Status

Proposed. This ADR constrains nothing until Pat accepts it. The detailed permissions and lifecycle
matrix is in [`docs/api/PARTNER_ADMINISTRATION_MATRIX.md`](../../api/PARTNER_ADMINISTRATION_MATRIX.md).

## Context

The partner integration work separates a stable named App, deployment clients, platform credentials,
merchant-consented tenant/location attachments, and tenant staff permissions. ADRs 0047/0089 govern
Platform Admin identity and page grants; ADR 0087 assigns merchant back-office work to OPIS. Issues
#2311, #801, #802, and #803 own the registry, credential/attachment lifecycle, browser origins, and
wire contract. No existing ADR defines the administration boundary or first-release portal scope.

## Decision

1. DGFY Admin is the first-release platform control surface for approved-pilot partner/App/client
   registration and approval, platform credential lifecycle and client suspension, platform audit,
   and plan/entitlement authority. Platform Master grants delegated page permissions; a delegated
   admin can exercise only its live `admin.partner_integrations` grant and cannot self-grant.
   `[default]`
2. OPIS is the first-release merchant surface for explicit owner/admin consent to attach an approved
   App to named tenant locations and scopes; connection/credential/sync/allocation health; tenant
   disconnection; and plan-bounded allocation and sync-round inputs. OPIS cannot approve Apps or
   issue platform credentials. `[default]`
3. A stable App ID, deployment client, credential, tenant/location attachment, and tenant staff
   permission are distinct identities and authorization grants. An App ID or request-supplied tenant
   header alone never authorizes access. `[default]`
4. Tenant attachment requires explicit merchant owner/admin consent for the tenant, locations, and
   scopes. Every API operation revalidates authenticated identity, tenant/location membership,
   lifecycle state, plan bounds, and granted scope server-side; a UI or surface selector is not
   authorization. `[default]`
5. The partner portal is deferred from first release. DGFY operators onboard pilots and manage
   platform credentials; no marketplace or partner self-registration is included. Revisit only when
   #796 schedules a scoped portal candidate with an approved identity and security design.
   `[default]`
6. Platform and tenant audit records remain in their respective landlord and tenant stores, exclude
   secrets, and record administrative lifecycle changes. Credential issuance is show-once; private
   keys remain in an approved secret store and are never exposed through partner administration.
   `[default]`
7. #803 remains the owner of wire-level partner behavior and offline authorization/reconciliation;
   #997/#998 own allocation policy and #1484 owns sync convergence/accounting. This decision assigns
   administration surfaces and does not duplicate those contracts. `[default]`

Tenant-isolation and “App ID/header never authorizes” clauses are security-sensitive candidates for
the strictest ADR tier, but are proposed as `[default]` here pending explicit tech-lead review. If
the tech lead determines either is a system invariant, acceptance must use the superseding-decision
path required by ADR 0039. No binding clause is introduced by this proposed ADR.

## Consequences

- The permission matrix and lifecycle detail live in the API documentation rather than expanding
  this ADR into a route or field specification.
- Admin and OPIS implementation slices remain candidates for #796 and depend on the backend issues
  named above; this ADR and matrix do not claim those routes or checks are implemented.
- Partner self-service is excluded from first release and requires a new scheduled scope decision.

## References

- [ADR 0039](0039-adr-lifecycle-strictness-tiers-and-amendment-path.md) — strictness and amendment governance.
- [ADR 0047](0047-platform-admin-identity-and-page-rbac.md), [ADR 0087](0087-dedicated-back-office-fourth-frontend-app-opis.md), [ADR 0089](0089-platform-admin-fifth-frontend-app-cross-host-admin-routing.md).
- [Partner administration matrix](../../api/PARTNER_ADMINISTRATION_MATRIX.md).
- Issues #796, #801, #802, #803, #2311, #2378, and #2379.
