---
status: proposed
authority_level: authoritative
owner: architecture
date: 2026-10-10
last_reviewed: 2026-10-10
review_by: 2027-04-10
applies_to: third_party_partner_integrations
topic: third_party_partner_integration_contract
---

# ADR 0093: Third-Party Partner Integration, Engine Authority, and Attachments

## Status

Proposed — awaiting explicit tech-lead approval. Under ADR 0039, a proposed ADR constrains nothing. Until accepted, dependent work must treat [the partner contract](../../api/THIRD_PARTY_PARTNER_CONTRACT.md) as reference. No approval is implied by this PR.

## Context

Issue #803 defines a generic contract for independent POS and commerce partners. DGLaundry's existing integration is a useful compatibility precedent, but it has a different engine polarity and vendor-specific claims, routes, and environment clients. A generic contract must make location authority, identity, consent, stock ownership, offline recovery, money, fiscal authority, and qualification explicit without implementing endpoints or changing current DGLaundry behavior.

## Decisions

1. A location's selected engine authority is an attachment attribute with values `dgfy` or `external`, not a workflow mode. Orders, allocations, and financial records retain immutable engine identity. Under shared `dgfy` authority, DGFY POS and a partner client may coexist against one DGFY engine. Under `external` authority, DGFY POS is disabled at attached locations. Authority changes require reconciled or quarantined allocations, drained or quarantined queues, resolved in-flight orders, merchant-owner consent, a DGFY-authorized actor, and an audit event. `[default]`
2. App, deployment client, tenant/location attachment, and staff/operator are separate identities and authorization inputs. An App/client identifier or caller-supplied tenant header grants no access. Merchant consent is explicit and location/scope-bound; application approval does not replace staff permission. This separation is required to preserve tenant ownership and prevent a credential from becoming authority over a person or business. `[binding]`
3. **DGFY stock truth remains Inventory-owned.** A DGFY-engine partner may request permitted operations, but only Inventory records stock effects. An external-engine partner demonstrates its own stock authority and convergence and never consumes DGFY's ledger as a second authority. This preserves ADR 0029's data-ownership invariant. `[binding]`
4. A previously authenticated terminal/operator may continue only within the 24-hour authorization window and an already server-opened shift. Expiry, revocation, disconnect, or device loss stops new operations, preserves queued records, and quarantines unresolved allocation quantities until explicit reconciliation; stock is never auto-released when an unsynced terminal may have sold it. This is binding because premature release can duplicate stock effects and destroy audit evidence. The detailed allocation engine remains owned by #997/#998. `[binding]`
5. Reconnect does not transfer financial or fiscal authority to a partner client. Provider verification and existing server settlement/fiscal gates remain authoritative; local receipts stay immutable, provisional non-cash/refund/void states remain explicit, disconnected slips remain non-fiscal, and divergent totals are surfaced with both values. This protects money and audit integrity and does not amend ADRs 0042, 0052, 0075, or 0076. `[binding]`
6. Qualification uses separate source, hosted, isolated-demo, and real-partner claim levels. Demo evidence never establishes production readiness for a real partner. Each claim is tied to its own SHA, environment, and evidence; this is the default qualification process, not a new runtime invariant. `[default]`
7. Browser clients use Authorization Code with PAR and PKCE S256, exact registered destinations, and independent sessions; machine/service clients use direction-specific `private_key_jwt` credentials, client/audience/signature validation, per-client replay isolation, and fail-closed shared authorization state. External origins do not enter ADR 0026's internal handoff or shared-cookie trust lists. `[binding]`
8. DGLaundry remains governed by its existing authoritative contract while it is served through a compatibility adapter. The adapter has an owner, evidence, rollback, and removal criteria under ADR 0035. `laundry` remains the ADR 0079 external-engine shape and adds no workflow mode. `[default]`

## Consequences

- DGFY POS and a partner POS coexist only when both use the same DGFY authority and Inventory stock truth. An external-authority location disables DGFY POS.
- App approval, merchant consent, attachment scope, staff permission, and engine authority must be separately represented and audited.
- Partner allocation must reuse #997/#998. If their decision changes a binding ADR 0029 rule, the required superseding ADR and tech-lead approval are not provided by this proposal.
- ADR 0075 and 0076 currently govern native offline flows. Their principles are referenced for partner design, but extending their binding scope requires this ADR's approval and must be stated by the implementing slice.
- ADR 0043's two-successful-round baseline and stable `client_sync_run_id` accounting remain current. Proposed 5/10 entitlements are planned work owned by #1484/#2379.
- RFC 9457 emission on generic partner endpoints is a future P1 candidate obligation; existing DGLaundry routes retain their current error contract until a governed migration.
- DGLaundry's current `dglaundry_company_context` claim, `/api/v1/partners/dglaundry` routes, and environment client triple remain in place until #2311 proves generic replacement and the ADR 0035 removal criteria pass.
- A proposed ADR does not satisfy approval-dependent implementation prerequisites. The contract remains reference until this record is accepted.

## ADR mapping

| ADR | Clauses touched | Tier | Treatment | Owner / implementation PR |
| --- | --- | --- | --- | --- |
| 0002 | Domain errors and compatible response envelope | default | adopted-by-reference; RFC 9457 is a future P1 requirement | #803 / P1 |
| 0014 | Web POS offline queue and replay | default | adopted-by-reference; no new background replay authority | #803 / #802/P3 |
| 0026 | Browser cookie authority and origin trust | binding | unchanged | #802 |
| 0029 | Inventory stock ownership and reservations | binding | adopted-by-reference; no ownership change | #997/#998 / P3 |
| 0031 | Terminal/operator/location/shift context | default | adopted-by-reference | P3/P8 |
| 0033 | Governed discount evidence | default | adopted-by-reference | P4 |
| 0035 | Compatibility-seam governance | binding | unchanged; #2311 records the seam | #2311 |
| 0039 | Strictness and approval rules | binding | unchanged; governs this proposal | #803 / approval pending |
| 0042 | Fiscal authority and accreditation | default | unchanged | P5 |
| 0043 | Native per-device sync accounting | default | dated amendment in this PR; partner accounting follows current rule, 5/10 remains planned | #803 / #1484/#2379 |
| 0047 | Platform Admin authority and RBAC | default | adopted-by-reference for approval surface | #2379 |
| 0052 | Tenant revenue and settlement | binding | unchanged | P4/P5 |
| 0075 | Native offline financial reconciliation | binding | adopted-by-reference as proposed partner guidance, subject to approval | #803 / P4 |
| 0076 | Native offline order actions | binding | adopted-by-reference as proposed partner guidance, subject to approval | #803 / P1/P4 |
| 0079 | DGLaundry external runtime and provider contract | default | dated amendment in this PR; retain `laundry` shape and add generic adapter reference | #803 / #2311 |
| 0087 | OPIS ownership and merchant consent surface | binding | unchanged | #2379 |
| 0089 | DGFY Admin app and independent sessions | binding | unchanged | #2379 |

The #993-family issue text about automatic background mutations, client-authoritative totals, and offline fiscal numbering is stale against current amendments. ADR 0043 and ADR 0075 govern those behaviors; the contract retains only the requirement to surface both figures on divergent totals.

## Supersession and amendment targets

- **Supersedes:** none.
- **Amends:** ADR 0043 and ADR 0079 receive dated `[default]` amendments in the implementing PR for #803. This proposed ADR does not amend either binding clause.
- **Adopts by reference:** ADRs 0002, 0014, 0026, 0029, 0031, 0033, 0035, 0039, 0042, 0047, 0052, 0075, 0076, 0087, and 0089 as mapped above. Adoption of native ADR 0075/0076 principles for partner clients is not binding until this ADR is accepted.

## Approval Record

- Tech-lead approval: **pending**
- Approver:
- Approval date:
- Recorded in:

## References

- [Third-Party Partner Contract](../../api/THIRD_PARTY_PARTNER_CONTRACT.md)
- [DGLaundry Partner Integration Contract](../../api/PARTNER_INTEGRATION_CONTRACT.md)
- [Issue #803](https://github.com/Sieitzz/dgfy-platform/issues/803)
- [Issue #796 and P1–P11 candidate slate](https://github.com/Sieitzz/dgfy-platform/issues/796)
