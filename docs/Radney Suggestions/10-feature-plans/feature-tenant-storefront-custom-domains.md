# Tenant Storefront Custom Domains

## Metadata

- title: Tenant storefront custom domains
- status: draft
- owner: Collaborators
- created: 2026-07-22
- last updated: 2026-07-22
- source reviewed at: 2026-07-22
- source revision: `4c9ba07b7b21beb9b1ed6cd8b1cbe643bf9b38ca`
- last validated: 2026-07-22
- related code areas: `backend/src/modules/tenants/`,
  `backend/src/modules/store/`, `backend/src/modules/storefrontDiscovery/`,
  `backend/src/config/corsPolicy.js`, `frontend/apps/store/`,
  `frontend/src/pages/`, `infrastructure/docker/nginx/`,
  `infrastructure/docker/docker-compose.yml`, external production controller
- related docs or dependencies: `docs/START_HERE.md`,
  `docs/architecture/ARCHITECTURE_BOUNDARIES.md`,
  `docs/architecture/ARCHITECTURE_GOVERNANCE.md`,
  `docs/architecture/adr/0023-front-facing-dgfy-customer-account.md`,
  `docs/architecture/adr/0026-browser-session-cookie-authority.md`,
  `docs/features/TENANT_MANAGEMENT.md`, `docs/api/specification.md`,
  `docs/database/schema.md`, `docs/ops/HOSTING_PROFILES.md`,
  `docs/ops/DEVELOPMENT_TO_PRODUCTION_WORKFLOW.md`

## 1. Problem And Desired Outcome

Tenant clients may own public domains such as `grandmatador.com` and want those
domains to present their DGFY Storefront without exposing the shared
`dgfy.ph/tenant-store/<slug>` URL in the browser.

This capability is custom-domain host routing, not HTTP redirection or legacy
URL-frame masking. The desired result is:

- the client points a verified hostname to the DGFY edge
- DGFY terminates HTTPS for that hostname
- the hostname resolves to exactly one tenant Storefront
- the browser retains the custom hostname throughout supported Storefront flows
- DGFY slug URLs remain available as an operational fallback
- custom-domain traffic preserves tenant isolation, authentication, payment,
  cache, capability, and Storefront-mode contracts

The first release supports full Storefront parity for active premium tenants,
one canonical hostname per tenant, and up to five active alias hostnames.

## 2. Current Behavior And Evidence

Current source behavior establishes these constraints:

- `infrastructure/docker/nginx/nginx.conf.template` recognizes a fixed set of
  DGFY hostnames and deliberately returns `444` for unknown Host headers.
- The current Certbot bootstrap issues certificates for a fixed environment
  domain set. Arbitrary customer domains are not provisioned or reloaded.
- Storefront routing derives the tenant slug from paths such as
  `/tenant-store/<slug>` and `/store/<slug>`.
- Storefront API requests carry `x-store-slug`; the backend resolves tenants by
  Storefront slug rather than by verified request hostname.
- `frontend/apps/store/src/businessRegistrationUrl.js` derives sibling DGFY
  origins from the current hostname. On `grandmatador.com`, that would produce
  invalid destinations such as `skupervisor.grandmatador.com`.
- Production CORS policy recognizes configured DGFY origins, not dynamic
  verified customer origins.
- Storefront payment creation uses a global
  `STOREFRONT_PAYMENT_RETURN_URL`, not a request-bound verified custom origin.
- ADR 0023 requires a one-time handoff token for cross-origin Storefront account
  returns while ADR 0026 keeps browser cookies host-only.
- `backend/src/models/Landlord/Tenant.js` already contains `domain` and
  `subdomain`, and tenant provisioning currently uses these for tenant
  subdomain identity. They must not be repurposed as the custom-domain registry.
- `docs/features/TENANT_MANAGEMENT.md` mentions an optional tenant domain but
  does not define verified DNS ownership, TLS, proxy routing, lifecycle, or
  Storefront custom-domain behavior. This is a documentation gap, not an
  existing implementation.

No overlapping active custom-domain plan or accepted ADR was found during the
2026-07-22 duplicate-prevention review.

## 3. Scope And Exclusions

### Included

- platform-admin-only domain management
- canonical and alias hostname registration
- mandatory DNS ownership and routing verification
- automated TLS and Nginx provisioning through a privileged external controller
- hostname-to-tenant Storefront resolution
- full Storefront catalog, checkout, payment, tracking, account, booking, asset,
  map, service-worker, and tenant-mode behavior
- custom canonical URLs for SEO, discovery, sharing, and QR codes
- premium eligibility, seven-day loss-of-eligibility grace, suspension, removal,
  audit, monitoring, rollback, and DGFY fallback behavior

### Excluded From V1

- tenant-admin self-service or tenant-submitted approval requests
- wildcard domains
- platform-admin bypass of DNS ownership verification
- registrar API integration or automatic Namecheap DNS editing
- email, nameserver, or MX hosting
- custom domains for IMS, POS, DGFY authentication, or the DGFY API
- iframe-based URL masking
- more than one canonical hostname or more than five aliases per tenant
- replacing the existing DGFY Storefront hostname

## 4. Proposed User Flow

1. A platform admin opens **Admin > Custom Domains** and selects an active
   premium tenant.
2. The admin enters a hostname without a scheme, path, query, fragment, port, or
   wildcard and chooses `canonical` or `alias`.
3. DGFY normalizes the hostname and returns provider-neutral DNS instructions:
   - TXT host: `_dgfy-verification.<hostname>`
   - TXT value: `dgfy-domain-verification=<random-token>`
   - apex routing: A record to the configured stable DGFY edge IPv4 address
   - subdomain routing: CNAME to the configured DGFY custom-domain target
   - AAAA only when DGFY publishes an approved IPv6 target
4. The UI warns the admin not to delete unrelated MX/TXT records and to remove
   conflicting A, AAAA, CNAME, ALIAS, or URL-redirect records for the same host.
5. **Verify DNS** checks the exact TXT token, routing target, conflicting IPv6,
   and relevant CAA restrictions. Failure remains `pending_dns` and returns
   actionable, non-secret diagnostics.
6. Successful verification creates one idempotent `provision` operation. The
   external controller obtains TLS, generates and validates Nginx configuration,
   reloads safely, performs a domain health check, and reports the result.
7. A canonical hostname becomes `active` only after HTTPS and Storefront host
   resolution both pass. An alias becomes active only after its own ownership,
   routing, TLS, and redirect checks pass.
8. Requests to the canonical hostname serve the tenant Storefront at `/`.
   Aliases permanently redirect to the canonical hostname while preserving the
   path and query.
9. The admin may retry failed provisioning, promote a verified alias to
   canonical, suspend a hostname, or remove it. Every mutation requires an
   audit reason.
10. Loss of active-premium eligibility starts a seven-day grace period shown in
    Admin. Regaining eligibility restores normal state; expiration suspends the
    custom-domain mapping while the DGFY slug URL remains available.

## 5. Proposed Technical Flow

### Domain registry and operations

Create additive landlord-owned persistence for domain mappings and controller
operations. The domain registry must contain:

- immutable id and tenant id
- normalized ASCII hostname with a global unique constraint
- role (`canonical` or `alias`) and canonical mapping reference
- ownership TXT token and verification timestamps
- lifecycle status: `pending_dns`, `verified`, `provisioning`, `active`,
  `eligibility_grace`, `suspended`, `failed`, `removing`, or `removed`
- DNS observations, TLS issuance/expiry state, health timestamps, safe error
  code/message, grace deadline, and lifecycle timestamps
- creating/updating platform-admin identity

Enforce one non-removed canonical mapping and no more than five non-removed
aliases per tenant inside a transaction with row locking. Hostnames remain
globally reserved until removal completes. Rebinding a removed hostname requires
a new token and complete verification.

The operation table must support `provision`, `renew`, `suspend`, `restore`, and
`remove` with an idempotency key, lease owner/expiry, bounded attempts,
`next_attempt_at`, status, and sanitized result. Admin actions also write the
existing landlord tenant-admin audit log with before/after snapshots.

### Host resolution

Add a public Storefront domain-context read that resolves the normalized Host or
trusted forwarded host only when the mapping is active or in eligibility grace.
It returns the public store slug, canonical origin, and custom-domain routing
mode without exposing company tokens, database names, or private tenant data.

For a verified custom host, backend Storefront resolution uses the host-bound
tenant as authority. A supplied `x-store-slug` must match that tenant; mismatch
returns a safe `404`/domain-context error and never resolves another store.
Existing DGFY hosts continue to use path/header slug behavior.

The Storefront frontend resolves domain context when no route slug is present.
Custom-host routes are:

- `/` — tenant catalog or mode landing page
- `/book`, `/order`, `/track`, `/service`, `/item` — existing Storefront
  subflows with current query parameters

DGFY routes remain unchanged. Navigation helpers must produce custom-host paths
when domain context is active and DGFY slug paths otherwise.

### Edge and certificate controller

Keep Nginx as the edge. Add a root-owned external controller rather than shell
or Docker access in the web application. The controller:

- leases operations through a private, dedicated-credential API
- rechecks registry eligibility and DNS routing immediately before issuance
- creates a temporary allowlisted HTTP block for ACME HTTP-01
- issues one certificate per hostname using Certbot
- renders generated configuration into a dedicated host-mounted directory
- reuses shared Storefront proxy snippets for `/api`, `/uploads`,
  `/openfreemap`, static assets, service worker, and SPA fallback
- runs `nginx -t` before every atomic replace/reload
- retains the last-known-good configuration on failure
- performs HTTPS and domain-context health checks after reload
- renews certificates with bounded retries and reloads Nginx after success
- removes retired config/certificates only after routing is disabled
- reports sanitized state without returning private keys or controller secrets

Unknown hosts must continue to hit the existing `444` default. The generated
configuration accepts only database-verified hostnames; it must never use a
wildcard catch-all for customer traffic.

### Authentication, CORS, payment, and URLs

- Configure explicit DGFY authentication, password-reset, business-registration,
  and POS origins; never derive DGFY sibling hosts from a customer hostname.
- Extend absolute Storefront return validation to active verified custom
  origins. Continue using single-use DGFY handoff tokens and host-only cookies.
- Permit CORS only when normalized Origin equals the request host and that host
  resolves to an active verified mapping. Never reflect an arbitrary origin or
  allow custom domains for IMS/POS/admin APIs.
- Derive payment return URLs from verified domain context. Ignore client-supplied
  origins and fall back to the DGFY slug URL when no active mapping exists.
- Prefer the canonical custom origin in discovery results, canonical metadata,
  share URLs, QR codes, customer activity links, and Storefront navigation.
- Keep DGFY slug URLs functional and add canonical metadata pointing to the
  custom domain; do not globally redirect DGFY fallback routes.
- Preserve `Vary: X-Store-Slug` and add host-aware cache partitioning where a
  response can differ by verified hostname. Service-worker caches remain
  isolated by browser origin.

## 6. Proposed Interfaces

### Platform-admin API

Under the existing authenticated admin-tenant boundary:

- `GET /api/v1/admin/tenants/:tenant_id/storefront-domains`
- `POST /api/v1/admin/tenants/:tenant_id/storefront-domains`
- `POST /api/v1/admin/tenants/:tenant_id/storefront-domains/:domain_id/verify`
- `POST /api/v1/admin/tenants/:tenant_id/storefront-domains/:domain_id/make-canonical`
- `POST /api/v1/admin/tenants/:tenant_id/storefront-domains/:domain_id/retry`
- `POST /api/v1/admin/tenants/:tenant_id/storefront-domains/:domain_id/suspend`
- `DELETE /api/v1/admin/tenants/:tenant_id/storefront-domains/:domain_id`

Creation accepts `hostname`, `role`, optional `canonical_domain_id`, and required
admin reason. Lifecycle mutations require a reason and reject stale state
transitions. Responses expose DNS instructions and safe status only.

### Public Storefront API

- `GET /api/v1/store/domain-context`

The server derives the hostname from the trusted request boundary; there is no
client hostname parameter. Unknown or inactive mappings return a safe not-found
response.

### Private controller API

- `POST /api/v1/internal/storefront-domain-operations/lease`
- `POST /api/v1/internal/storefront-domain-operations/:operation_id/result`

These routes require a dedicated scoped controller credential, private-network
restriction, strict schemas, short leases, request IDs, rate limits, and audit
logging. They do not accept platform-admin browser tokens.

## 7. Architecture And ADR Impact

Classification: **cross-boundary**.

A new authoritative ADR is mandatory before implementation because this changes:

- public URL ownership and canonical URL policy
- edge TLS and Nginx configuration ownership
- privileged external-controller responsibilities
- landlord tenant-domain persistence
- Storefront tenant resolution and cache boundaries
- browser authentication handoff allowlisting
- payment return URL construction
- production rollout, monitoring, and rollback behavior

The ADR must decide the external controller owner, trust/credential boundary,
generated-config location, certificate storage/backup policy, failure authority,
and production recovery procedure. No architecture allowlist exception is
expected; backend work must use module controllers, use cases, repositories,
and landlord models.

## 8. Security And Tenant-Isolation Impact

- Normalize hostnames with IDNA/domain-to-ASCII rules and reject schemes, paths,
  ports, wildcards, IP literals, localhost/private pseudo-hosts, platform-owned
  DGFY/SureBiz domains, invalid public suffixes, and control characters.
- Require exact TXT proof for every canonical and alias hostname. There is no
  admin bypass.
- Require DNS routing to configured DGFY edge targets before certificate work.
  Reject unexpected AAAA records that could route ACME or users elsewhere.
- Check CAA compatibility and surface remediation without loosening ownership.
- Do not perform arbitrary application-layer HTTP fetches to unverified hosts.
- Make Host-bound tenant context authoritative and reject slug/header mismatch
  to prevent cross-tenant storefront substitution.
- Keep controller credentials outside GitHub and browser-accessible config.
  Never grant the Node process shell, Docker socket, private-key, or unrestricted
  certificate-directory access.
- Redact DNS/controller errors, tokens after verification, filesystem paths,
  private keys, account identifiers, and internal topology from public responses.
- Prove one-time auth handoff replay rejection and validate custom return origins
  from the active registry at consumption time, not only issuance time.
- Preserve CSRF rules, host-only cookies, rate limiting, audit logs, payment
  webhook verification, capability gates, and Storefront tenant isolation.

## 9. Risks, Edge Cases, And Dependencies

- DNS propagation can be slow or inconsistent across resolvers.
- Existing Namecheap shared-hosting website traffic moves to DGFY when its apex
  A record changes; DGFY does not proxy the old shared-hosting site.
- MX/email records can remain, but incorrect CNAME use at the apex or deleted MX
  records can disrupt mail.
- Conflicting or stale AAAA records can send IPv6 users and ACME validation to
  the wrong server.
- Certificate issuance and authorization failures are rate-limited. QA must use
  the Let's Encrypt staging directory and retries must honor backoff.
- Failed Nginx generation/reload must retain last-known-good configuration.
- Payment providers and DGFY auth returns must accept only current active custom
  origins; suspension during a live checkout must fall back safely.
- Canonical changes require share/SEO/cache invalidation and alias redirect
  updates without breaking active sessions.
- Domain expiration or reassignment outside DGFY can cause takeover risk;
  periodic TXT/routing drift checks must suspend unsafe mappings.
- Certificate transparency exposes issued hostnames publicly; admin instructions
  must disclose this normal TLS property.
- This feature depends on a stable DGFY edge address/target, port 80 and 443
  reachability, persistent certificate/config storage, DNS resolver health, and
  an externally operated privileged controller.

Provider guidance:

- [Namecheap A-record routing](https://www.namecheap.com/support/knowledgebase/article.aspx/208/32/i-dont-want-to-change-nameservers-are-there-any-other-ways-to-point-my-domain-to-your-servers/)
- [Namecheap CNAME guidance and bare-domain warning](https://www.namecheap.com/support/knowledgebase/article.aspx/9646/2237/how-to-create-a-cname-record-for-your-domain/)
- [Let's Encrypt challenge types](https://letsencrypt.org/ca/docs/challenge-types/)
- [Let's Encrypt rate limits](https://letsencrypt.org/docs/rate-limits/)

## 10. Acceptance Criteria

- A platform admin can bind one verified canonical hostname and up to five
  verified aliases to an eligible tenant.
- An unverified or incorrectly routed hostname cannot enter provisioning.
- HTTPS on the canonical hostname serves the correct tenant at `/` and preserves
  the custom hostname throughout all supported Storefront flows.
- Each alias redirects over HTTPS to the canonical hostname with path/query
  preservation.
- Unknown hosts retain `444`; inactive/removed mappings cannot resolve a tenant.
- A custom host cannot select another tenant using path, query, or
  `x-store-slug` manipulation.
- Customer auth handoff, logout, account context, checkout, payment return,
  tracking, bookings, uploads, maps, deep links, and service worker work from the
  custom hostname.
- Discovery, SEO, share, and QR outputs prefer the custom canonical origin while
  the DGFY slug URL remains usable.
- Loss of premium eligibility produces a seven-day grace state and eventual
  suspension; restored eligibility recovers safely.
- Controller operations are idempotent, leased, retryable, audited, and cannot
  expose shell/Docker/private-key capabilities to the web app.
- All changed authoritative docs, API/database contracts, ops runbooks, ADR,
  tests, builds, architecture gates, and rendered UI evidence are complete.

## 11. Validation Plan

### Backend and database

- hostname normalization, IDNA, reserved/wildcard/IP/platform-host rejection
- global uniqueness, one-canonical invariant, five-alias limit, row locking,
  concurrent creation, removal/rebinding, and tenant isolation
- valid/invalid TXT, routing target, CAA, IPv4/IPv6, propagation, and DNS timeout
- eligibility, seven-day grace, suspension/restoration, and DGFY fallback
- admin authentication, reasons, audit snapshots, invalid transitions, and
  response redaction
- public host context, DGFY fallback, host/slug mismatch, inactive mapping, CORS,
  cache partitioning, and rate limits
- auth return allowlisting and replay rejection
- payment return URL validation and safe fallback
- controller credential, lease concurrency, idempotency, retry/backoff, stale
  results, and result-schema tests

### Infrastructure

- generated Nginx configuration snapshots and injection-resistant hostname use
- ACME staging issuance, renewal, expiry warning, removal, and rate-limit errors
- failed `nginx -t`, failed reload, controller crash, expired lease, DNS drift,
  and last-known-good recovery
- unknown Host `444`, HTTP challenge behavior, HTTP-to-HTTPS redirect, canonical
  serving, alias redirect, `/api`, `/uploads`, `/openfreemap`, assets, service
  worker, and SPA fallback
- certificate/config persistence across container recreation and deploy rollback

### Frontend and full Storefront behavior

- Custom Domains admin page: loading, empty, validation, pending, verified,
  provisioning, active, grace, failed, suspended, retry, remove, and audit states
- responsive desktop/mobile layouts, keyboard access, readable copy, and both
  light and dark themes
- catalog and every enabled Storefront mode, checkout, payment return, tracking,
  account login/signup handoff, logout, bookings, assets, maps, deep links,
  history navigation, refresh, share, QR, and canonical metadata
- negative proof that DGFY auth/POS links never become subdomains of the
  customer hostname
- browser proof for one canonical and one alias at desktop and mobile widths:
  page identity, nonblank content, no overlay, console health, primary
  interaction, API tenant correctness, and URL preservation/redirect behavior

### Repository and release gates

- `npm run check:architecture`
- `npm run lint:docs`
- `npm run check:compliance` when classified paths require it
- focused backend and frontend suites plus every affected app build
- Nginx/controller unit and integration checks
- isolated-QA exact-SHA deploy and real test-domain evidence before production
- release inventory, rollback notes, production health, certificate proof,
  storefront smoke, and deployed-change accuracy review

## 12. Rollout, Monitoring, And Rollback

1. Land and approve the ADR plus authoritative contract updates.
2. Add landlord schema, models, APIs, feature flag, audit, and inactive controller
   operations with no production domain serving.
3. Add Admin UI and dry-run DNS/controller visibility.
4. Deploy Nginx generated-config support and external controller disabled.
5. Validate in isolated QA with Let's Encrypt staging and disposable domains.
6. Enable `CUSTOM_STOREFRONT_DOMAINS_ENABLED` only for an explicit pilot-tenant
   allowlist.
7. Provision one canonical pilot domain, then one alias, and prove full
   Storefront/auth/payment flows.
8. Expand only after certificate renewal, DNS drift, rollback, and monitoring
   evidence pass.

Monitor operation queue age/failures, DNS drift, certificate issuance/expiry,
renewal failures, Nginx validation/reload failures, host/slug mismatch attempts,
custom-domain request volume and 4xx/5xx rates, auth handoff failures, payment
return failures, and tenant eligibility grace deadlines.

Rollback disables the feature flag and generated custom-host blocks, validates
and reloads Nginx, suspends outstanding operations, and directs operators to the
unchanged DGFY slug URLs. Do not delete registry/audit evidence or certificates
during emergency rollback. Removal and secret/certificate cleanup occur only
after recovery review.

## 13. Open Questions And Approval Blockers

Product behavior is decision-complete for this proposal. The following are
governance/implementation prerequisites, not choices for an implementer:

- architecture must approve a new ADR
- operations must name the root-owned external controller owner and recovery
  on-call
- release owners must provide environment-specific edge IPv4/optional IPv6,
  custom-domain CNAME target, ACME account/email, certificate storage, and
  private controller credential through protected configuration
- security must approve controller network/credential boundaries and custom
  return-origin validation

The plan stays `draft` until those approvals are recorded. It must be
revalidated against the then-current source revision before moving to `ready`.

## 14. Developer Handoff

Before implementation:

1. Read `AGENTS.md`, `docs/START_HERE.md`, architecture boundaries/governance,
   ADRs 0023 and 0026, hosting/release docs, and current Storefront, tenant,
   payment, auth, CORS, Nginx, and Certbot source.
2. Confirm this plan's source paths, current behavior, and external-provider
   guidance remain current.
3. Create and obtain approval for the required authoritative ADR before runtime
   work.
4. Classify compliance impact and map all changed files into the governed
   release inventory.
5. Implement additive schema and modular backend boundaries first, then
   Storefront/admin behavior, then external controller and edge changes.
6. Never grant the Node process shell, Docker-socket, private-key, or arbitrary
   Nginx configuration write access.
7. Do not accept routing proof without TXT ownership, use wildcard customer
   routing, repurpose `tenants.domain`, reflect arbitrary CORS origins, trust a
   client-supplied payment return origin, or remove DGFY fallback URLs.

The final implementation report must record changed files, migrations, ADR and
documentation updates, commands and observed results, QA domain/DNS/TLS proof,
rendered desktop/mobile evidence, architecture/compliance/release gates,
deferred checks, residual risks, rollout state, rollback proof, production
accuracy evidence, and an **Implementation Deviations** section even when the
value is `None`.

## Implementation Deviations

None. This document is a proposal and no runtime implementation has occurred.
