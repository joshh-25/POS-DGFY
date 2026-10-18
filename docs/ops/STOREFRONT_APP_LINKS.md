---
status: reference
authority_level: reference
owner: engineering
last_reviewed: 2026-10-17
applies_to: production_nginx,storefront_app_links
topic: storefront_app_links
---

# Storefront App Links

The production Storefront host `https://dgfy.ph` serves Apple's Universal Links association file
and Android's Digital Asset Links file from exact-match locations in
`infrastructure/docker/nginx/nginx.conf.template`:

- `/.well-known/apple-app-site-association`
- `/.well-known/assetlinks.json`

Both return `200 application/json` directly from nginx, with a five-minute public cache policy.
They do not redirect or fall through to the Storefront SPA. The response bodies are inline in the
production `STOREFRONT_DOMAIN_PROD` server block so this change does not require a file bind mount.

## Scope and current verification state

This change serves the apex `dgfy.ph` only. `www.dgfy.ph` is deferred: the production TLS
certificate does not currently include that host, and this handoff excludes a `www` server block,
HTTP-01 entry, and certificate SAN expansion. The current dgfy-mobile configuration still declares
`www.dgfy.ph` for iOS Universal Links and Android `autoVerify`; do not claim full app-link
verification until mobile removes that host or a separate change serves it with a valid certificate.
Android 11 and lower fail verification for all hosts in an `autoVerify` filter if any host in that
filter cannot be verified ([Android App Links intent filter guidance](https://developer.android.com/training/app-links/add-applinks)).

The AASA file includes the production, staging, and development Storefront app identifiers:

- Apple Team ID: `4JDU3J7T75`, from dgfy-mobile `eas.json` →
  `submit.base-testflight.ios.appleTeamId`.
- Bundle IDs: `com.dgfy.storefront`, `com.dgfy.storefront.staging`, and
  `com.dgfy.storefront.dev`, from dgfy-mobile's brand/app identity configuration.
- AASA paths: `/tenant-store/*` and `/store/*`, matching the Storefront mobile intent filters.

The Android file currently returns `[]` because the Play App Signing SHA-256 fingerprints were not
provided in #2552 or the mobile repository when this change was prepared. This is valid JSON but
does not establish an Android app association. The mobile/Android release owner must supply the
verified fingerprints before Android App Links can be considered complete. For Play-distributed
builds, use the Google-held App signing key certificate fingerprint from Play Console → select the
app → Release → Setup → App signing → App signing key certificate → SHA-256; include the upload-key
fingerprint only for builds distributed with that key, such as Firebase or sideload builds. Do not
infer the Play fingerprint from a local upload keystore. See Google's
[website-association guide](https://developer.android.com/training/app-links/configure-assetlinks)
and [Play App Signing guide](https://support.google.com/googleplay/android-developer/answer/9842756).

Apple's `appIDs` use the Team ID plus each bundle ID, as described in Apple's
[Universal Links association format](https://developer.apple.com/documentation/bundleresources/applinks).

## Deployment

**Merging this PR does not deploy the nginx template.** The production nginx template is copied to
the host manually. Use a checkout of the reviewed commit and follow the production nginx gate in
[`PRODUCTION_CHECKLIST.md`](PRODUCTION_CHECKLIST.md) and the latest update in
[`PRODUCTION_READINESS_POSTHOG_AND_NGINX_DRIFT.md`](PRODUCTION_READINESS_POSTHOG_AND_NGINX_DRIFT.md).
The old `_PROD` drift finding was recorded as reconciled in the drift document; still compare the
current live and repository files before every copy, and stop to reconcile any current difference.

From the repository checkout:

1. Fetch the live template and compare it with the reviewed repository file. Do not copy if the
   diff contains unexplained changes:

   ```bash
   ssh dgfy-gha 'cat /opt/dgfy-platform/nginx/nginx.conf.template' > /tmp/nginx.conf.template.live
   diff -u /tmp/nginx.conf.template.live infrastructure/docker/nginx/nginx.conf.template
   ```

2. Back up the live template and record the printed backup path:

   ```bash
   ssh dgfy-gha 'cd /opt/dgfy-platform && backup="nginx/nginx.conf.template.bak.$(date +%Y%m%d-%H%M%S)" && cp nginx/nginx.conf.template "$backup" && echo "$backup"'
   ```

3. Copy the reviewed template and restart nginx so the container entrypoint re-runs `envsubst`:

   ```bash
   scp infrastructure/docker/nginx/nginx.conf.template dgfy-gha:/opt/dgfy-platform/nginx/nginx.conf.template
   ssh dgfy-gha 'cd /opt/dgfy-platform && docker compose restart nginx && docker compose exec nginx nginx -t'
   ```

   A plain `nginx -s reload` does not re-render the mounted template in this container setup.
   No certificate expansion is part of this apex-only change; the existing production certificate
   already covers `dgfy.ph`.

4. Confirm both endpoints return `200`, `Content-Type: application/json`, the expected
   `Cache-Control`, and no `Location` header:

   ```bash
   curl -sS -D - -o /dev/null https://dgfy.ph/.well-known/apple-app-site-association
   curl -sS -D - -o /dev/null https://dgfy.ph/.well-known/assetlinks.json
   curl -fsS https://dgfy.ph/.well-known/apple-app-site-association | jq .
   curl -fsS https://dgfy.ph/.well-known/assetlinks.json | jq .
   ```

   With the current empty Android list, Google's Digital Asset Links API should return no app
   statements yet. Recheck after fingerprints are added:

   ```bash
   curl -fsS 'https://digitalassetlinks.googleapis.com/v1/statements:list?source.web.site=https://dgfy.ph&relation=delegate_permission/common.handle_all_urls' | jq .
   curl -fsS https://app-site-association.cdn-apple.com/a/v1/dgfy.ph | jq .
   ```

5. Check representative existing Storefront routes: `/`, `/tenant-store/`, `/s/`, `/api`, and
   `/ingest/`. Allow for Apple's CDN cache when checking the AASA body.

If nginx does not start or the config check fails, restore the exact backup created in step 2 and
restart nginx:

```bash
ssh dgfy-gha 'cd /opt/dgfy-platform && cp nginx/nginx.conf.template.bak.<timestamp> nginx/nginx.conf.template && docker compose restart nginx'
```

## Updating Android fingerprints

When the Android release owner supplies the values, update the inline `assetlinks.json` body in the
production Storefront server block. Add one statement for each supported package:
`com.dgfy.storefront`, `com.dgfy.storefront.staging`, and `com.dgfy.storefront.dev`. Each statement
uses the `delegate_permission/common.handle_all_urls` relation, the `android_app` namespace, and
the exact uppercase colon-separated SHA-256 fingerprint for the certificate that signs that build.
For Play builds, copy the Play App Signing certificate fingerprint from Play Console. Add the upload
key fingerprint only where that key signs a separate sideload/Firebase build. Update
`apps/dgfy-api/tests/nginxStorefrontAppLinks.test.js`, run the documented checks, and repeat the
manual nginx deployment and verification above.

## Related

- `docs/ops/PRODUCTION_CHECKLIST.md` — production deployment gates.
- `docs/ops/PRODUCTION_READINESS_POSTHOG_AND_NGINX_DRIFT.md` — nginx topology, manual sync, and
  historical drift reconciliation.
- `docs/architecture/adr/0046-verified-storefront-custom-domains.md` — custom storefront hostnames;
  those hostnames are outside this association-file scope.
