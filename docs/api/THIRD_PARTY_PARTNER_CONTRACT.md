---
status: reference
authority_level: reference
owner: architecture
date: 2026-10-10
last_reviewed: 2026-10-10
review_by: 2027-04-10
applies_to: third_party_partner_integrations
topic: third_party_partner_contract
contract_version: partner-contract/v0.1
---

# Third-Party Partner Contract

**Contract version:** `partner-contract/v0.1`

**Governance:** reference pending tech-lead approval of proposed [ADR 0091](../architecture/adr/0091-third-party-partner-integration-engine-authority-and-attachments.md).

**Scope:** future independent partner integrations. This document defines requirements; it does not claim that generic partner endpoints, client registries, allocation APIs, or demo qualification exist today.

## 1. Scope, versioning, and compatibility

This contract defines the minimum security, authority, operation, offline, financial, and qualification rules for a genuinely independent POS or commerce partner. It covers both DGFY-engine clients and partner-owned operational engines. It does not authorize a partner or grant access by itself.

The contract version uses semantic versioning after the `partner-contract/` prefix. `partner-contract/v0.1` is pre-1.0: a patch clarifies text without changing a requirement, while a minor version may add or break behavior. Every breaking 0.x change is labeled as such and ships with a migration guide; the previous 0.x version remains supported for at least 90 days after its replacement is generally available. After 1.0.0, patch releases preserve behavior, minor releases add compatible fields/capabilities, and major releases change or remove required behavior, fields, scopes, states, or security guarantees. Implementations negotiate and record the supported version; unknown major versions fail closed. A capability is enabled only when both parties declare support.

For a breaking 1.x change, DGFY maintains the prior major version for at least 12 months after the replacement is generally available and gives each connected merchant and partner at least 90 days' notice before the prior version is disabled. Security or legal incidents may require faster suspension, with the reason recorded and affected parties notified when safe. Deprecations name an owner, replacement, earliest removal date, and evidence that no active attachment still depends on the old behavior.

[`PARTNER_INTEGRATION_CONTRACT.md`](PARTNER_INTEGRATION_CONTRACT.md) remains the authoritative DGLaundry-specific contract. This generic contract does not replace its claims, routes, or current runtime. The DGLaundry integration is the compatibility adapter while the generic identity and attachment surfaces are introduced. It may be removed only after a separately reviewed cutover proves all DGLaundry clients use the generic contract, no active client depends on the legacy claim, route, or environment client triple, rollback has been exercised, and the ADR 0035 compatibility seam's removal criteria are satisfied. That seam record belongs to the implementation PR for #2311; this definition does not create a manifest entry.

**Non-goals:** implement endpoints or credentials; create registry or allocation tables; refactor OIDC; build Admin, OPIS, or partner UI; build a demo app; create an OpenAPI specification; decide tenant CRM or privacy policy; design a second allocation engine; settle web/mobile sync convergence; or file the P1–P11 implementation candidates.

## 2. Vocabulary and identity model

| Identity | Meaning | Authority it does not provide |
| --- | --- | --- |
| **App** | A stable named integration slug such as `dglaundry`, registered by DGFY. The slug is an identifier, not a secret. | Does not identify a deployment, merchant, location, employee, or grant access. |
| **Deployment client** | A browser, machine, or service client registered for one App and one deployment/environment. Each has its own client ID, keys, redirect registrations where applicable, and lifecycle. | Does not establish tenant membership or engine authority. |
| **Attachment** | An approved relationship between an App deployment and explicit tenant/location scopes, granted scopes, consent, and per-location engine authority. | Cannot be widened by a request header or by changing an App slug. |
| **Staff/operator identity** | A DGFY-authenticated person and their current tenant/location role, permission, terminal, and shift context. | Is not interchangeable with an App or client credential. |

These four identities remain separate in tokens, authorization checks, audit records, and persisted references. Tenant and location attachment is server-side. An App ID, client ID, callback value, or caller-supplied tenant/company/location header never grants access. Every operation derives tenant, location, attachment, staff, terminal, and scope from validated server state and checks their relationship again when an offline mutation is reconciled.

## 3. Engine tiers, authority, and coexistence

### 3.1 Tiers and authority

Each location attachment has an authority value: `dgfy` or `external`. This is an attachment attribute, not a workflow mode or a new `WORKFLOW_MODE_VALUES` entry. The selected engine identity is immutable for the life of an order, allocation, or financial record; changing location authority affects only new work after the transition is committed.

- **DGFY-engine tier:** DGFY owns catalog identity and operational order/inventory authority. A partner is a scoped client. Inventory alone commits DGFY stock effects (ADR 0029, binding Boundary Rule 1).
- **External-engine tier:** the named partner owns its operational engine for the attached location. DGFY may exchange approved projections and DGFY-origin payment/order events, but the partner must demonstrate its own stock authority and convergence. It must not consume the DGFY stock ledger as a second authority.

### 3.2 Authority transitions

Only a DGFY-authorized administrator may initiate a transition after merchant-owner consent in OPIS. The DGFY Admin/OPIS permission details are owned by #2379. Every transition is audited with actor, attachment, location, old/new authority, reason, timestamp, and reconciliation evidence.

| Transition | Preconditions | Actor and audit | DGFY POS effect |
| --- | --- | --- | --- |
| `dgfy` → `external` | No unresolved in-flight orders; queues are drained or explicitly quarantined; allocations are reconciled or remain quarantined with an owner and recovery plan; partner authority/convergence evidence is accepted. | DGFY Admin executes after merchant-owner consent in OPIS; record `partner.location_authority.changed`. | Disable DGFY POS at that location before external authority becomes active. Existing immutable records retain their original engine identity. |
| `external` → `dgfy` | Partner queues are drained or quarantined; in-flight partner orders are resolved; allocations are reconciled or quarantined; partner projection/outbox state has a reviewed cutover snapshot. | DGFY Admin executes after merchant-owner consent in OPIS; record the same event with direction and cutover evidence. | Keep DGFY POS disabled during cutover; enable it only when `dgfy` authority is committed. |

### 3.3 Routing and coexistence

Resolve every request to exactly one active attachment and one location authority from authenticated server context. Reject absent, multiple, stale, or conflicting matches with `ATTACHMENT_REQUIRED`, `AMBIGUOUS_ATTACHMENT`, or `AUTHORITY_CHANGED`; never guess from route name, App ID, tenant header, or data availability.

| Location authority | DGFY POS | Partner POS | Permitted operation ownership | Result |
| --- | --- | --- | --- | --- |
| `dgfy` | Enabled | May coexist as a client of the same DGFY engine | Both surfaces submit to one DGFY authority; Inventory commits stock effects once, with scoped idempotency and allocation controls for offline sales. | **Coexistence is allowed only under shared DGFY authority.** Two independent stock authorities are not allowed. |
| `external` | Disabled at attached locations | Enabled as the named external engine | Partner owns its operational effects; DGFY consumes only explicitly agreed, versioned projections/events. | No DGFY POS sale path at that location, preventing a second seller against the same stock. |

The `laundry` workflow remains the ADR 0079 external-engine shape: DGLaundry owns the operational engine (`ims=false`, `pos=false`), while DGFY retains the currently documented storefront and DGFY-origin payment responsibilities. It is represented by an external attachment and the DGLaundry compatibility adapter, not a new generic vertical or workflow mode.

## 4. Identity, sessions, and administration

### 4.1 Browser clients

Use Authorization Code with PAR and PKCE S256. Each deployment registers exact redirect, callback, and post-logout destinations. Matching is exact; wildcard, suffix, and prefix matching are prohibited. Partner sessions are independent from DGFY internal-app sessions. An external origin is never added to ADR 0026's trusted internal handoff or shared-cookie lists. Logout of one partner session does not log out another app or broaden cookie scope.

### 4.2 Machine and service clients

Use `private_key_jwt` with asymmetric keys. Inbound and outbound credentials are separate, scoped to direction and environment, and independently rotatable. Validate the authenticated client, intended audience, signature, issuer, time bounds, and registered key. Select verification keys by the declared algorithm and `keyid`; never select a key from an untrusted route or payload. One-use grants and replay state are isolated per client and deployment. Shared authorization/replay state is mandatory and fails closed when unavailable.

### 4.3 Neutral session and tenant context

Any future neutral context schema is server-issued and derived from validated identity, attachment, membership, and location records. It is never copied from callback parameters. DGLaundry's `external-runtime-v0.1` is a reference to assess for compatibility, not an automatic replacement for current security rules or the generic schema. Its fields must be reviewed from the provider contract before adoption; this document invents none.

### 4.4 Lifecycle and revocation effects

| Lifecycle action | New grants | Active sessions | Queued offline work |
| --- | --- | --- | --- |
| Approve App and deployment | None until a merchant attachment is consented and enabled. | None. | None. |
| Issue client credential | Allowed only for the approved client, audience, environment, and attachment policy. | Existing sessions are unaffected. | No authority is implied for queued work. |
| Rotate credential | New credential only after overlap/activation is recorded; old credential is rejected after the bounded rotation window. | Reauthenticate when the old credential is retired. | Preserve records; replay only after fresh authentication and authorization checks. |
| Suspend App/client | Denied immediately. | Revoke or expire access tokens and sessions; no new operation is authorized. | Preserve and quarantine; do not discard or replay until explicit reinstatement/reconciliation. |
| Revoke one credential | Denied for that credential; other client credentials remain governed independently. | Revoke sessions/grants minted by it where supported; reject subsequent use. | Preserve and quarantine work attributable to it pending review. |
| Disconnect attachment | Denied for that tenant/location attachment, even if the App remains approved elsewhere. | Revoke attachment-bound sessions and grants. | Preserve and quarantine; require explicit reconciliation before release or replay. |

### 4.5 Administration and consent

Approved pilots only. DGFY Admin registers and approves Apps and deployment clients. The merchant owner gives tenant/location/scope consent in OPIS under ADRs 0087 and 0089. Partner self-service registration is deferred. Staff permissions remain separate from application identity. The detailed role, permission, and consent matrix belongs to #2379. Approval by DGFY is not merchant consent; merchant consent is not staff authorization.

### 4.6 DGLaundry compatibility adapter

| Seam | Current shape | Owner | Evidence before removal | Rollback | Removal condition |
| --- | --- | --- | --- | --- | --- |
| `dglaundry_company_context` claim | Vendor-specific identity claim | #2311; DGLaundry contract owner for provider compatibility | Generic-client integration proves identical tenant/location isolation and DGLaundry accepts the replacement claim/context. | Restore the prior claim/client configuration without changing DGLaundry contract authority. | All clients migrated; no token consumer reads the legacy claim; ADR 0035 seam criteria pass. |
| `/api/v1/partners/dglaundry` routes | Vendor-specific route namespace | #2311 | Contract tests and production-like qualification show generic routing preserves behavior and rejects ambiguous attachment. | Route traffic back to the prior module. | No active DGLaundry client calls the legacy namespace and rollback evidence is retained. |
| Environment client triple | `DGFY_DGLAUNDRY_CLIENT_ID`, `_MACHINE_CLIENT_ID`, `_SERVICE_CLIENT_ID` | #2311 | All deployments use registered generic clients with independently rotated credentials. | Restore secret/config snapshot and old client mapping. | No running deployment reads the triple; secret retirement is verified. |

The #2311 implementation PR owns the `compatibility-seams.json` entry, tests, rollback, and removal criteria required by ADR 0035. This contract does not add that entry.

## 5. Operation matrix — DGFY-engine tier

All operations are scoped to one approved attachment, tenant, location, and staff/operator authority. Inventory alone commits DGFY stock effects. No partner mutation may update a stock balance directly.

| Operation | Actor and scope | Read/write granularity | Idempotency and expected version | Snapshot semantics | Errors and recovery |
| --- | --- | --- | --- | --- | --- |
| Catalog and availability read | App client plus authorized attachment; one location | Read only; expose sellable item identity, price, and approved availability fields; never cost or unrestricted stock internals | No mutation key; include snapshot/version cursor | Complete versioned snapshot or a gap-free delta; failed pulls retain last valid snapshot | `ATTACHMENT_REQUIRED`, `SCOPE_DENIED`, `SNAPSHOT_EXPIRED`; reacquire a full snapshot. |
| Checkout | App client plus authenticated staff, terminal, open shift, and location | Create one sale with explicit lines, quantities, tender intent, customer reference if permitted; no catalog authoring | Required stable key per logical sale; same key/payload returns prior result, different payload conflicts; expected catalog/availability version required | Immutable sale-time line, price, discount-evidence, and receipt snapshot | `IDEMPOTENCY_CONFLICT`, `VERSION_CONFLICT`, `INSUFFICIENT_STOCK`, `SHIFT_REQUIRED`; refresh or enter operator resolution; never silently retry with changed facts. |
| Online-order intake and actions | App client and attachment; action additionally requires staff/terminal authority where applicable | Read server-origin orders; submit allowed accept/fulfillment/cash-collection intents; no client-created authority over order totals | Required stable key per action; expected status, payment state, and server version required | Server order snapshot plus append-only action request; stale client projections cannot overwrite current state | `ORDER_NOT_FOUND`, `VERSION_CONFLICT`, `INVALID_TRANSITION`, `PAYMENT_PENDING`; refresh and surface conflict, retain the action record. |
| Controlled void/return | App client plus staff permission, original transaction, shift, and location | Append a void/return intent; only existing governed use cases decide stock reversal/refund | Required unique intent key and expected transaction/payment/version state | Original transaction and receipt remain immutable; reversal is a linked append-only record | `VOID_NOT_ALLOWED`, `REFUND_REVIEW_REQUIRED`, `VERSION_CONFLICT`; keep pending intent, reconcile through existing server authority. |

**Excluded:** catalog authoring, arbitrary stock adjustment, direct ledger movement, settlement administration, provider credential handling, and final fiscal issuance. Those remain with their owning DGFY surfaces and governed services.

### Error contract

New generic partner API slices should emit `application/problem+json` following RFC 9457, with stable `code` and `request_id` extensions. This is a **candidate-slice obligation** for P1, not a claim about current routes. ADR 0002 remains the shared domain error basis and preserves existing response compatibility through additive `error_code` and `request_id`; existing DGLaundry partner routes do not currently emit RFC 9457 and remain governed by their own contract until migrated.

## 6. Operation matrix — external-engine tier (reciprocity)

An external-engine partner owns its operational effects and supplies evidence of its own authority, deduplication, ordering, and convergence rules. It does not consume the DGFY stock ledger as a second authority. DGFY publishes only the agreed availability and order events for the attachment. The adapter validates and records partner events but does not execute the partner's operational effects.

| Partner obligation | Minimum contract | DGFY adapter responsibility | Failure handling |
| --- | --- | --- | --- |
| Availability events | Signed, tenant/location-scoped availability snapshots or events with monotonic version and source identity | Verify signature, attachment, version, and allowed fields; publish only agreed projections | Reject invalid signatures; quarantine gaps, stale versions, and conflicting snapshots. |
| Order intake and status callbacks | Authenticated, signed order references and status transitions with stable event IDs and expected versions | Deduplicate and apply only approved DGFY-origin order/payment lifecycle transitions | Duplicate is idempotent; invalid transition or stale version is quarantined for reconciliation. |
| Signed inbox/outbox | Durable delivery records, direction-specific keys, replay rejection, dedupe, retry metadata, quarantine, and dead-letter state | Provide auditable delivery acknowledgement and bounded retry policy | No silent drop; dead-letter retains payload digest and reason under data-retention policy. |
| Authority/convergence evidence | Demonstrate partner-owned stock/order authority, recovery, conflict resolution, and audit trail | Qualify evidence before enabling `external` authority; continuously monitor agreed health | Missing or divergent evidence suspends new operations and requires explicit reconciliation. |

| Tier | Minimum obligation from partner | Why DGFY needs it |
| --- | --- | --- |
| DGFY-engine | Use registered clients and attachment scopes; bind each operation to staff/terminal/location; send idempotency keys and expected versions; report order status; preserve auditable responses. | Protect DGFY-owned data and prevent duplicate or stale writes while DGFY remains the sole operational authority. |
| External-engine | Publish signed availability and order/status events; maintain durable deduplicated inbox/outbox; enforce monotonic versions; quarantine conflicts; demonstrate partner-owned authority and recovery. | Establish trustworthy projections and lifecycle coordination without creating a second DGFY stock authority. |

## 7. Customers — gated: #2378

This section defines reference classes only. Customer field access, CRM policy, privacy policy, and customer operations are owned by #2378, #243, and OPIS. No customer endpoint or field permission is authorized here.

| Reference class | Meaning | Join rule |
| --- | --- | --- |
| Guest snapshot | Contact/name values captured for one transaction without asserting an account identity. | Snapshot is transaction-scoped; do not promote or join automatically. |
| Global DGFY identity | A DGFY account/customer subject that can exist across businesses. | Resolve only through an explicitly authorized identity flow; never by email matching. |
| Tenant customer record | A merchant-owned CRM record scoped to one tenant. | Resolve only within that tenant; never join across tenants. |

Future partner references must use an issuer-qualified immutable partner subject (`partner_issuer`, `partner_subject`) and an explicit mapping record. Order linkage must carry the order ID, attachment ID, customer reference class, and nullable mapped customer-record ID. Omit customer linkage when permission or consent is absent. No implicit email joins, cross-tenant joins, or inferred account conversion are permitted. The section remains `gated: #2378` until that ticket approves concrete fields and permissions.

## 8. Offline allocations and 24-hour authorization

This contract reuses #997/#998; it does not define another allocation engine. The partner allocation section is gated on #997's ADR-path decision. If allocation is an Inventory-owned reservation extension, it can follow ADR 0029's default amendment path; if it changes a binding ownership rule, a superseding ADR and tech-lead approval are required.

For partner-facing and native consumers, use the same governed allocation lifecycle: a **grant** binds quantity/effects to tenant, location, terminal, App attachment, and operator; **consumption** records the sale against that grant; **release** returns only quantity proven unused; **reconciliation** compares queued operations with server authority and records the outcome. Stock-bearing SKUs and recipe/modifier effects are included. Stock-exempt behavior follows ADR 0029 Boundary Rule 8 and is not reserved.

The 24-hour window starts at the last successful online authentication/authorization and uses a server-issued absolute deadline; it does not roll forward while offline. It permits continuing a previously authenticated terminal/operator session with an already server-opened shift. It does not permit offline login, offline shift opening, or renewed authority after expiry. On expiry, stop new operations, preserve the queue, and quarantine all unresolved allocation quantities until explicit reconciliation. Never automatically release stock that an unsynced terminal may have sold. Revocation, disconnect, and device loss use the same preserve-and-quarantine rule; recovery requires an authorized operator to reconcile the device queue and outstanding grant evidence.

Native consumers must atomically persist each granted sale with its immutable receipt, stock-movement evidence, and sync outbox mutation in the local transaction, then reconcile the same grant with the server. This is the future #997/P8 consumer contract, not a claim that native partner allocation support exists. External-engine partners demonstrate equivalent authority and convergence in their own engine and do not consume DGFY allocations as a second ledger.

## 9. Sync accounting

The three-channel semantics follow `dgfy-mobile/docs/architecture/SYNC-ARCHITECTURE.md` and ADR 0043; #1484 owns the shared web/mobile sync contract. This section does not specify wire payloads.

| Channel | Semantics | Partner participation and accounting |
| --- | --- | --- |
| A — Ledger writes | Sales, inventory movements, shifts, cash events, voids, and order actions; mutations reconcile through one ordered, idempotent path. | Current baseline: at most two successful rounds per device per day; premium tenants may use real-time cadence. Planned 5/10 entitlements are new, owned by #1484/#2379, and are not current behavior. Every dependency wave in one drain uses the same stable `client_sync_run_id` within the bounded 15-minute reuse window. |
| B — Reference pulls | Catalog, prices, settings, schedules, and device policy flow server to client. | Opportunistic and uncapped; not charged to Channel A. Failed pulls preserve the last valid snapshot. |
| C — Online-order discovery | Discover server-origin orders while online; order mutations are provisional and join Channel A. | Discovery is not a ledger round. Mutations receive no unlimited exemption and use Channel A accounting. |

Preserve existing server day-window accounting keyed by tenant and device. A failed validation, authentication, or server attempt spends no successful round. A partner cannot self-grant premium status or change its entitlement. There is no merchant-wide counter.

## 10. Money and fiscal authority

Partner checkout and offline work preserve the existing payment, settlement, and fiscal authority boundaries. A verified provider result is required before server-authoritative payment state is final. Fiscal finalization occurs only after reconnection and existing server checks. Disconnected slips are explicitly non-fiscal.

Cash may be represented locally as `paid_local` only where the applicable offline ADR permits it. Other tenders, refunds, and voids remain explicit `pending_server` or equivalent provisional states until acknowledged. Preserve immutable local receipt and line snapshots, signed discount evidence (ADR 0033 and ADR 0075 Decisions 3–4), and append-only void/refund intents. At synchronization, recheck staff permission, tenant/location identity, attachment state, and expected versions. A divergent total records both the locally shown and server-calculated amounts and surfaces a conflict; never silently replace what the operator or customer saw.

This contract changes none of the current settlement or fiscal gates in ADR 0042 and ADR 0052, including provider verification, tenant revenue settlement controls, fiscal document authority, accreditation, and release requirements. ADR 0075's binding financial clauses currently govern the native app; applying them to partner clients is proposed adoption by reference in ADR 0091 and requires approval before dependent implementation treats them as binding.

Historical #993-family proposals for automatic background mutation replay, client-authoritative totals, or offline fiscal numbering do not override current amendments. Follow ADR 0043's policy-governed replay rules, ADR 0075's explicit provisional settlement and non-fiscal slip rules, and the divergence-conflict rule above.

## 11. Security and implementation hardening

Every implementation must reject replay and cross-client/cross-tenant/cross-audience use; complete approve, issue, rotate, suspend, revoke, and disconnect lifecycle transitions; and fail closed when required shared authorization state is unavailable. Deferred verification must be named in the API response and evidence, never described as passing. Tests must prove tenant, location, attachment, staff, client, audience, origin, and key isolation. Financial paths must prove idempotency, append-only audit, expected-version conflict behavior, and no duplicate stock, settlement, refund, or fiscal effects. These are minimum implementation obligations under `ARCHITECTURE_GOVERNANCE.md`'s Implementation Hardening Contract.

## 12. Qualification contract

Qualification has four distinct claim levels:

| Claim | Evidence | What it proves |
| --- | --- | --- |
| Source | Commit-SHA-bound tests, static checks, and reviewed code | The source passed the named checks; it does not prove hosting or provider configuration. |
| Hosted | SHA- and environment-bound deployment/configuration evidence | The named build and configuration ran in the named environment; it does not prove partner interoperability. |
| Isolated demo | Repeatable demo run in its own runtime, database, credentials, and signing keys using public contracts only | Both engine tiers and contract flows work in the isolated demonstration. It does not prove real-partner readiness. |
| Real partner | Partner-specific security, provider, operational, and production evidence with named environment and accountable owners | Readiness only for that partner and approved attachment. |

Demo success never equals real-partner production readiness. The demo must exercise both authority tiers and may not use private APIs, shared databases, or production keys.

| Acceptance probe | Required evidence form |
| --- | --- |
| Tenant/location/client isolation and ambiguous routing | Automated negative tests with distinct fixtures and persisted authorization/audit assertions. |
| Signature validation, `keyid` selection, replay, and duplicate delivery | Deterministic signed-request/event test vectors and replay/dedupe state assertions. |
| Approve, rotate, suspend, revoke, and disconnect | Lifecycle state-transition tests covering new grants, active sessions, and queued work. |
| Unregistered origin and redirect rejection | Browser/OIDC integration tests proving exact-match rejection and no cookie/session sharing. |
| Shared authorization/replay state unavailable | Fault-injection test proving fail-closed behavior and no fallback authorization. |
| Allocation loss, device loss, and expiry | Recovery tests proving queue preservation, quarantine, no auto-release, and explicit reconciliation. |
| Duplicate financial and fiscal replay | Idempotency tests proving one settlement/refund/fiscal effect and durable conflict reporting. |
| `dgfy` and `external` authority modes | Hosted or isolated-demo evidence for each mode, including DGFY POS disabled in external mode and single DGFY stock authority in shared mode. |

Any probe not run is reported as unverified with its owner and blocking consequence; no claim level silently inherits a higher one.

## 13. Ownership and traceability

| Behavior | Owner | Definition boundary |
| --- | --- | --- |
| Generic contract and ADR definition | #803 | Current scope; no runtime implementation. |
| Compatibility-preserving App/client registry and identity generalization | #2311 | Implements seams and compatibility manifest; blocked on accepted identity/context decisions. |
| App IDs, clients, credentials, tenant attachments, lifecycle | #801 | Implements registry and attachment lifecycle after #2311. |
| External browser origins and session behavior | #802 | Exact origins and isolated browser sessions. |
| Admin approval, merchant consent, permissions, and entitlement administration | #2379 | DGFY Admin and OPIS ownership; no partner self-service. |
| Customer identity, tenant CRM fields, and privacy | #2378, #243, OPIS | Gates customer-specific capabilities only. |
| Allocation and conservative availability | #997/#998 under #993 | Reuse their model and reconcile current ADR amendments. |
| Shared web/mobile sync contract | #1484 | Owns convergence and entitlement semantics; partner participates without a second counter. |
| Partner DGFY-engine operational API | Candidate P1 | Scoped reads, checkout, and order operations. |
| Partner bootstrap and sync participation | Candidate P2 | Channel and accounting integration. |
| Partner allocation protocol | Candidate P3 | Uses #997 model; no parallel engine. |
| Financial reconciliation | Candidate P4 | Reuses current money services and policies. |
| Fiscal finalization after reconnect | Candidate P5 | Existing fiscal controls remain authoritative. |
| Generic external-engine adapter | Candidate P6 | Authority routing and DGLaundry compatibility. |
| Isolated demo partner | Candidate P7 | Public contracts, independent runtime/database/keys, both tiers. |
| Native POS allocation consumer | Candidate P8 | Linked `dgfy-mobile` work consumes the shared allocation protocol. |
| DGFY Admin pilot controls | Candidate P9 | Implements #2379's platform controls. |
| OPIS merchant partner connections | Candidate P10 | Merchant consent and connection health. |
| Generic integration qualification | Candidate P11 | SHA/environment-bound claims and probes. |

Candidates P1–P11 are the 2026-10-09 slate in #796, not new issues or commitments created by this contract. File only the selected wave after duplicate and phase checks.

## 14. ADR mapping and reconciliation

`proposed` ADR 0091 identifies the decisions that await tech-lead approval. “Owner / PR” below names the governing ticket or candidate; implementation PR numbers do not exist yet.

| ADR | Clauses touched | Tier | Treatment | Owner / PR |
| --- | --- | --- | --- | --- |
| 0002 | Shared domain errors; additive `error_code` and `request_id` | default | adopted-by-reference; RFC 9457 emission is a future P1 candidate obligation | #803 definition; P1 implementation |
| 0014 | Web POS offline replay, scoped queue, online shift-open, manual sync | default | adopted-by-reference; no background replay or offline login/shift-open added | #803 definition; #802/P3 as applicable |
| 0026 | Browser cookie/session authority and internal-origin trust | binding | unchanged; exact partner origins remain outside trusted handoff/shared-cookie lists | #802 |
| 0029 | Inventory stock ownership, reservation boundaries, stock-exempt behavior | binding | adopted-by-reference; no binding ownership change | #997/#998; P3 |
| 0031 | Terminal pairing, operator, location, and shift context | default | adopted-by-reference; 24-hour continuation does not create offline login or shift-open | P3/P8 |
| 0033 | Discount authority and signed evidence | default | adopted-by-reference; existing governed discount rules remain | P4 |
| 0035 | Compatibility seam manifest, rollback, removal criteria | binding | unchanged; #2311 implementation PR records the DGLaundry seam | #2311 |
| 0039 | ADR strictness tiers, approval and amendment paths | binding | unchanged; governs proposed ADR 0091 | #803; tech-lead approval pending |
| 0042 | Fiscal document authority and accreditation gates | default | unchanged | P5 |
| 0043 | Per-device sync rounds and stable run accounting | default | amend [default] in this PR; record partner participation and planned 5/10 entitlements | #803 amendment; #1484/#2379 own entitlement implementation |
| 0047 | Platform Admin identity and page RBAC | default | adopted-by-reference for DGFY Admin approval; no new permissions decided | #2379 |
| 0052 | Tenant revenue, collection, and settlement controls | binding | unchanged; partner has no settlement administration | P4/P5 |
| 0075 | Native offline financial and refund evidence | binding | adopted-by-reference as proposed guidance for partner clients; approval required before implementation treats it as binding | #803 / ADR 0091; #1484 and P4 |
| 0076 | Native offline order-action records and expected versions | binding | adopted-by-reference as proposed guidance for partner clients; approval required before implementation treats it as binding | #803 / ADR 0091; P1/P4 |
| 0079 | `laundry` external-engine shape and DGLaundry contract | default | amend [default] in this PR with generic-contract/adapter reference; `laundry` remains external authority | #803 amendment; #2311 |
| 0087 | OPIS merchant back-office ownership and consent surface | binding | unchanged; OPIS owns merchant consent | #2379 |
| 0089 | DGFY Admin app and independent host sessions | binding | unchanged; DGFY Admin owns platform approval | #2379 |

### #993-family stale-text reconciliation

Historical #993-family text proposing automatic background mutation sync, client-authoritative totals, or offline fiscal numbering is not adopted. Current ADR 0043 controls replay policy, ADR 0075 controls provisional financial authority and excludes offline fiscal finalization, and ADR 0029 controls Inventory stock effects. The surviving requirement is to record and surface both values on divergent totals without silent overwrite. #997/#998 and #1484 own their respective allocation and sync decisions.

## 15. Open items and known gaps

- ADR 0091 is proposed and awaits tech-lead approval. Until accepted, dependent implementation issues #2311, #801, and #802 must treat this contract as reference.
- #997 must decide the allocation ADR path before partner allocation implementation; this contract does not decide it.
- #2378/#243 must approve customer field-level permissions and privacy policy before customer operations are implemented.
- #1484/#2379 must decide and fund the planned 5/10 sync entitlements; they are not shipped behavior.
- Generic RFC 9457 error emission, client registry, neutral context schema, partner routes, allocation protocol, demo, hosted qualification, and real-partner evidence remain future work.
- DGLaundry's `external-runtime-v0.1` schema must be assessed from its source contract before any generic adoption; no unverified fields are specified here.
- No implementation or qualification claim follows from this document alone.
