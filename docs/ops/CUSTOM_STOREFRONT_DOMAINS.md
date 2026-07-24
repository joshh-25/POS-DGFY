# Custom Storefront Domain Operations

Status: reference
last_reviewed: 2026-07-23

## Safety Contract

Domain registration does not alter DNS or production traffic. Preserve unrelated
DNS records, especially MX, SPF, DKIM, and email-validation TXT records. Do not
change a tenant apex until the DGFY deployment, fallback slug, tenant data, and
rollback path have passed QA.

The application must never run the provisioning scripts. A root-owned external
controller owns certificates, generated Nginx configuration, validation, reload,
health proof, renewal, and deprovisioning. The backend only validates business
state, records audit evidence, and exposes durable controller operations.

## Required Configuration

Backend:

- `CUSTOM_STOREFRONT_DOMAINS_ENABLED=true`
- `CUSTOM_STOREFRONT_DOMAIN_PILOT_TENANT_IDS=<comma-separated tenant UUIDs>`
- `CUSTOM_STOREFRONT_APEX_IPV4` and/or
  `CUSTOM_STOREFRONT_CNAME_TARGET`
- `STOREFRONT_DOMAIN_CONTROLLER_TOKEN=<32+ character secret>`
- `STOREFRONT_DOMAIN_CONTROLLER_ALLOWED_IPS=<controller IPs>`
- `STOREFRONT_DOMAIN_MAINTENANCE_ENABLED=true`

Controller host:

- `STOREFRONT_DOMAIN_CONTROLLER_API_URL=https://<api-host>`
- `STOREFRONT_DOMAIN_CONTROLLER_TOKEN=<same secret>`
- `STOREFRONT_DOMAIN_CONTROLLER_ID=<stable controller identity>`
- `STOREFRONT_DOMAIN_LEASE_SECONDS=120`
- `CUSTOM_STOREFRONT_CERTBOT_STAGING=1` for the first QA issuance only

Never commit any token, DNS-provider credential, certificate, private key, or
plaintext tenant password.

## Lifecycle

1. Platform admin opens **Tenants > Domains** for an active Premium tenant.
2. Register one canonical hostname. The backend returns exact TXT and A/CNAME
   instructions.
3. The domain owner changes only the supplied records in the DNS-provider UI.
4. Platform admin selects **Verify**. Exact TXT, route, IPv6-conflict, and CAA
   checks must pass.
5. Successful verification changes the domain to `provisioning` and queues an
   idempotent `provision` operation.
6. The root-owned controller leases the operation, provisions TLS/Nginx, proves
   the expected tenant/domain context over HTTPS, and reports success.
7. Only that trusted report changes the mapping to `active`.
8. Up to five separately verified aliases may be added. Each alias receives its
   own TLS certificate and redirects to the canonical hostname.

Platform admins cannot manually bypass controller health proof.

## Controller

Run the controller from the DGFY infrastructure host, not from the Node container:

```bash
bash infrastructure/docker/nginx/storefront-domain-controller.sh
```

The controller supports:

- `provision` and `restore` using
  `provision-custom-storefront.sh`;
- `renew` with certificate issuance and Nginx reload;
- `suspend` and `remove` using
  `deprovision-custom-storefront.sh`;
- canonical HTTPS domain-context health proof;
- alias redirect proof;
- bounded retry through server-issued operation attempts and backoff.

Controller credentials are accepted only by
`/api/v1/internal/storefront-domain-operations/*`. Production requests also
require an allowlisted source IP.

## Monitoring and Recovery

The maintenance service periodically:

- reconciles active Premium eligibility and applies a seven-day grace window;
- checks active/grace mappings for DNS drift;
- queues renewal within 30 days of certificate expiry;
- queues cleanup when eligibility grace expires.

Platform admins can also run **Check DNS**, **Retry**, **Suspend**, **Remove**, or
**Make canonical** from the Domains UI. Suspending removes host-to-tenant
resolution immediately and queues edge cleanup. Removing a canonical hostname is
blocked while aliases still reference it.

Operational alerts should cover:

- failed or exhausted controller operations;
- domains in `provisioning`, `removing`, or `eligibility_grace` too long;
- DNS drift suspension;
- TLS expiry within 30 days;
- controller authentication failures.

## Grand Matador Pilot

Grand Matador currently has an approved local catalog of 18 available per-kilo
products across Pork, Chicken, and Beef. The production tenant, location, catalog
import, DNS proof, certificate, and public health proof remain production gates.
The storefront is catalog-only until transaction mode receives separate approval.

Recommended sequence:

1. Deploy the approved DGFY release and apply both custom-domain migrations.
2. Confirm the active Premium Grand Matador production tenant and fallback slug.
3. Import and verify exactly 18 public products.
4. Add the tenant UUID to the production pilot allowlist.
5. Register `grandmatador.com` as canonical in the Domains UI.
6. Publish the exact verification and route records without changing mail DNS.
7. Verify, let the controller provision in staging ACME mode, and complete QA.
8. Repeat using production ACME, then prove the public HTTPS storefront.
9. Add `www.grandmatador.com` as a verified alias if desired.

## Rollback

1. Select **Suspend** in the Domains UI. This immediately stops application
   resolution and queues edge cleanup.
2. Confirm the controller removed or disabled the generated host config, passed
   `nginx -t`, and reloaded Nginx.
3. Direct customers to the unchanged DGFY slug fallback.
4. Restore the previous web-routing DNS record if traffic must return to the old
   site.
5. Keep registry, operation, audit, migration, and release evidence.

DNS rollback is delayed by resolver TTL and caches. Do not delete evidence during
recovery.
