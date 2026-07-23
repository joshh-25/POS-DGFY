---
status: reference
authority_level: reference
owner: release
last_reviewed: 2026-07-23
applies_to: grandmatador_custom_storefront_pilot
topic: storefront_custom_domain_readiness
---

# Grand Matador Custom Domain Readiness

## Decision

Grand Matador can use the DGFY Storefront at `https://grandmatador.com` while
keeping that hostname visible in the browser. This is verified host routing with
TLS, not iframe masking and not a redirect to a DGFY URL.

The local implementation follows Radney's recommended lifecycle: one canonical
hostname, up to five aliases, exact DNS ownership proof, controller-owned
TLS/Nginx operations, host-bound tenant isolation, Premium eligibility grace,
DNS drift checks, renewal, audit evidence, and rollback.

The local pilot works. It is not production-live yet, and no PR should be created
until the user reviews the local result.

Only the DGFY repository requires a feature PR. `BBLabs-Albert/meats` remains the
old-site rollback source and does not require a PR unless that application is
intentionally changed.

## Current Readiness Snapshot

Snapshot date: 2026-07-23

| Area | State | Evidence or remaining work |
| --- | --- | --- |
| Local tenant | Ready locally | Grand Matador is an active Premium F&B tenant with an accepted owner membership. Credentials are stored as hashes. |
| Local storefront | Ready locally | Custom-localhost and DGFY slug fallback routes return the Grand Matador storefront. |
| Catalog | Ready locally | Exactly 18 available per-kilo products in Pork, Chicken, and Beef. |
| Customer transactions | Not enabled | Effective access mode is `catalog`; checkout, booking, and payment remain outside this launch. |
| Custom-domain backend | Implemented locally | Canonical/alias lifecycle, exact DNS/CAA proof, operation leases, retries, eligibility grace, drift, renewal, host isolation, CORS, and audit are implemented. |
| Admin UI | Implemented locally | Active Premium tenant rows expose a Domains workspace with DNS instructions and lifecycle controls. |
| Edge controller | Implemented locally | Root-run controller owns TLS/Nginx provisioning, aliases, health proof, suspension, removal, and renewal. |
| Local validation | In progress | Focused backend and frontend suites pass; full build, migration, and rendered QA remain before review. |
| PR | Intentionally not created | User requested local review first. No commit, push, or PR is authorized yet. |
| Production tenant/catalog | Not confirmed | Create or confirm the real production tenant, location, owner, and 18-product import. |
| Public DNS | Not cut over | Apex currently points to the existing host. Verification and DGFY routing records are not published. |
| Email DNS | Must be preserved | Existing MX, SPF, DKIM, and unrelated TXT records must remain unchanged. |
| Production TLS/health | Not done | Requires the root-owned controller on the deployed DGFY environment. |

Overall status: **local implementation under review; production launch blocked**.

## Ownership

| Owner | Responsibility |
| --- | --- |
| Developer | Present the local result, keep the diff reviewable, run final validation, and prepare a DGFY PR only after approval. |
| DGFY reviewer or team manager | Review and merge the later DGFY PR, coordinate promotion, and confirm the production tenant/catalog. |
| DGFY root operator/controller | Deploy the approved commit, apply migrations, configure the pilot, run TLS/Nginx operations, collect health proof, and handle rollback. |
| Grand Matador domain owner | Use the DNS-provider UI to publish only the exact DGFY TXT and web-routing records and preserve mail DNS. |

The team manager does not need access to `BBLabs-Albert/meats`. The manager needs
DGFY repository/deployment access and the production admin UI. The Grand Matador
domain owner separately needs DNS-provider access.

## Local Review Flow

Before any PR:

1. Apply both landlord migrations locally.
2. Start the DGFY backend, platform admin, and Storefront from this worktree.
3. Open **Platform Admin > Tenants > Grand Matador > Domains**.
4. Review canonical/alias creation, DNS instructions, status cards, operations,
   and lifecycle controls.
5. Open the custom-localhost storefront and DGFY slug fallback.
6. Confirm the 18-product catalog and corrected mobile hero layout.
7. Run focused/full automated tests, Storefront build, architecture checks,
   documentation lint, and desktop/mobile rendered QA.
8. Do not commit, push, or create a PR until the user approves this result.

## Later PR and Release Flow

After the user approves the local result:

1. Separate unrelated working-tree changes.
2. Scan changed files for repository commit-blocker markers.
3. Commit logical batches using Conventional Commits.
4. Push a `codex/*` branch and open one DGFY PR into `develop` using the required
   Summary, Motivation, and Testing sections.
5. Promote through `develop -> staging -> main`; do not push directly to `main`.
6. Deploy the exact approved commit and apply:

   ```bash
   npm --prefix backend run migrate
   ```

7. Configure the custom-domain feature flag, explicit Grand Matador tenant pilot
   UUID, DNS targets, controller credentials/IP allowlist, and maintenance job.

## Production Provisioning

1. Confirm the production tenant is active, Premium, F&B, Storefront-visible,
   owner-linked, and has a valid primary location and public DGFY slug fallback.
2. Dry-run, approve, and apply the idempotent ready-catalog import for that exact
   tenant/location.
3. Confirm exactly 18 public catalog products.
4. In **Tenants > Grand Matador > Domains**, register `grandmatador.com` as the
   canonical hostname.
5. Give the domain owner the exact displayed TXT and A/CNAME records.
6. The domain owner publishes those records without deleting MX, SPF, DKIM, or
   unrelated TXT records.
7. Select **Verify** after propagation. Successful proof queues provisioning;
   platform admins cannot manually activate the hostname.
8. The external controller leases the operation, provisions staging ACME first,
   validates Nginx, proves the expected tenant/domain HTTPS response, and reports
   the result.
9. Repeat with production ACME and complete the launch checklist.
10. Optionally register `www.grandmatador.com` as a separately verified alias.

## Production Launch Checklist

- [ ] `https://grandmatador.com/` retains the Grand Matador hostname.
- [ ] Domain context resolves the exact production tenant and slug.
- [ ] Unknown hosts and tenant-slug mismatches are rejected.
- [ ] Pork, Chicken, and Beef show exactly 18 approved products.
- [ ] Prices, units, names, and availability match the approved catalog.
- [ ] Root and supported deep links survive direct refresh.
- [ ] Alias path/query redirects to the canonical HTTPS hostname.
- [ ] Desktop and mobile layouts pass, including the hero/store-name area.
- [ ] Browser console and critical network requests are clean.
- [ ] TLS chain, expiry monitoring, and renewal path are healthy.
- [ ] Mail delivery and existing DNS records still work.
- [ ] The DGFY slug fallback remains reachable.
- [ ] Release evidence identifies the deployed commit and controller proof.

Catalog-only is the approved current scope. Enabling cart/checkout later requires
separate transaction, stock, hours, payment-return, tracking, and failure-path QA.

## Rollback

1. Select **Suspend** in the Domains UI. Resolution stops immediately and an edge
   cleanup operation is queued.
2. Confirm the controller restores/removes the generated Nginx configuration,
   passes `nginx -t`, and reloads.
3. Keep the DGFY slug fallback available.
4. Restore the previous Grand Matador web-routing DNS record if traffic must
   return to the old site.
5. Keep registry, operation, audit, import, and release evidence.

DNS rollback may be delayed by TTL and resolver caches.

## Remaining Production Blockers

| Blocker | Owner | Completion proof |
| --- | --- | --- |
| Local result has not received final user approval | User and developer | Reviewed local UI/storefront and explicit approval to prepare PR |
| Production tenant/location are not confirmed | DGFY team manager | Production identifiers and admin readback |
| Production 18-item import is not complete | DGFY team manager | Import evidence and public catalog readback |
| Production feature/controller configuration is absent | DGFY root operator | Deployment configuration and authenticated lease proof |
| DNS owner proof and DGFY route are absent | Grand Matador domain owner | Public DNS matches displayed records |
| TLS and public health proof are absent | DGFY root operator/controller | Active state, certificate evidence, and HTTPS context proof |

## Governing References

- `docs/START_HERE.md`
- `docs/architecture/ARCHITECTURE_BOUNDARIES.md`
- `docs/architecture/ARCHITECTURE_GOVERNANCE.md`
- `docs/architecture/adr/0013-tenant-first-login-onboarding-and-storefront-readiness-contract.md`
- `docs/architecture/adr/0036-verified-storefront-custom-domains.md`
- `docs/ai/PR.md`
- `docs/ops/CUSTOM_STOREFRONT_DOMAINS.md`
- `docs/ops/DEVELOPMENT_TO_PRODUCTION_WORKFLOW.md`

Architecture classification: `cross-boundary`. ADR 0036 defines the lifecycle,
tenant-isolation, DNS/TLS-controller, rollout, and rollback contract. The
production pilot allowlist is intentional and must be removed or generalized only
through a later reviewed rollout decision.
