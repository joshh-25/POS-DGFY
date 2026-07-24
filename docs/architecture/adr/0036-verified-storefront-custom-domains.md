# ADR 0036: Verified Storefront Custom Domains

Status: Proposed
Date: 2026-07-22
last_reviewed: 2026-07-23
doc_type: authoritative

## Context

Premium tenants need a branded hostname such as `grandmatador.com` to serve the
DGFY Storefront while retaining the branded URL. A redirect to a DGFY slug cannot
satisfy that requirement, and trusting a client-provided slug or hostname would
weaken tenant isolation. The edge must also reject unknown hosts and manage TLS
without granting infrastructure access to the application process.

## Decision

Custom Storefront hostnames are landlord-owned records, separate from legacy
`tenants.domain` and `tenants.subdomain` fields. An eligible tenant has one
canonical hostname and may have up to five aliases. Alias requests permanently
redirect to the active canonical hostname while preserving the path and query.

The platform requires exact TXT ownership proof, a configured A/CNAME route, no
conflicting IPv6 route, and compatible CAA policy before provisioning is queued.
Verification never serves traffic directly. It creates an idempotent operation
for a root-owned external controller. That controller owns certificate issuance,
hostname-specific Nginx configuration, config validation, reload, HTTPS health
proof, retry, renewal, suspension, removal, and rollback. The controller leases
operations from a private authenticated API and reports safe evidence; it never
returns certificate or private-key material to Node.

For `/api/v1/store/*`, an active verified request host is authoritative. A supplied
slug must match the host-bound tenant or the request returns a safe not-found
response. DGFY slug routes remain the operational fallback. Unknown hosts
continue to receive Nginx `444` behavior. Production CORS accepts a custom
Storefront origin only when the exact HTTPS request origin and host resolve to an
active verified mapping.

The Node process does not receive shell, Docker socket, Nginx write, certificate,
or private-key access. Controller authentication uses a dedicated bearer token,
controller identity, and a required production IP allowlist. Generated host
configurations are mounted read-only into Nginx. Browser cookies remain host-only
under ADR 0026. Payment return URLs must be derived only from the server-side
active canonical domain context.

The capability is gated in production by
`CUSTOM_STOREFRONT_DOMAINS_ENABLED=true` and an explicit tenant UUID pilot
allowlist. Eligibility requires an active Premium tenant. A tenant that becomes
ineligible enters a seven-day `eligibility_grace` state before edge cleanup is
queued; recovery within the window restores the previous active state. DNS drift
checks suspend unsafe mappings. Certificate renewal operations are queued before
expiry. Every lifecycle mutation and controller result is auditable.

## Consequences

- Domain lifecycle changes and before/after states are audited in landlord
  storage.
- Controller work is durable, leased, idempotent, retryable, and observable.
- Discovery and share URLs prefer the active canonical origin.
- Storefront frontend routes become `/`, `/order`, `/track`, `/book`, `/service`,
  and `/item` on a custom host, while DGFY paths remain unchanged.
- DNS, TLS, and production cutover remain privileged operational actions;
  creating a registry row cannot change public traffic.
- Aliases receive their own verified ownership proof and TLS certificate before
  redirecting to the canonical hostname.
- Grand Matador remains catalog-only until its customer access mode and
  transaction readiness are separately approved.

## Validation

- `npm --prefix backend test -- --runInBand`
- `npm --prefix frontend test -- --run`
- `npm --prefix frontend run build:store`
- `npm run check:architecture`
- `npm run lint:docs`
- `bash -n infrastructure/docker/nginx/provision-custom-storefront.sh`
- `bash -n infrastructure/docker/nginx/deprovision-custom-storefront.sh`
- `bash -n infrastructure/docker/nginx/storefront-domain-controller.sh`
