# DGLaundry deployment update

`@patterueldev` — the DGLaundry-side package and connection-pending deployment
are ready for provider qualification.

- Exact qualified/deployed application SHA: `253cfcfa771d15942d28b80c73a577b02c58259b`
  (DGLaundry PR [#3](https://github.com/Sieitzz/dglaundry/pull/3)), deployed at
  <https://laundry.surebizcorp.com> with `DGFY_MODE=disabled`.
- `GET https://laundry.surebizcorp.com/api/v1/integrations/dgfy/health` returns
  `external-runtime-v0.1`, `ready: true`, `connection: disabled`.
- Contract manifest SHA-256:
  `a295bed55bfe1d4c98f4613b27bdd239fc83fea181628f00bacfeec700db4df3`.
- Migration head: `075_mock_provider_credentials.sql`.
- Host gates passed: preflight, migration, API/worker/gateway readiness, HTTPS,
  private-port denial, MySQL restart, worker restart, and the 10 GiB reserve /
  768 MiB memory-headroom checks.

The handoff PR includes the DGLaundry public PEM files. Fingerprints below are
SHA-256 over DER-encoded SubjectPublicKeyInfo:

| Purpose | Key ID | Fingerprint |
| --- | --- | --- |
| Partner request verification (P-256) | `dgfy-partner-p256-20260910` | `913bfd2594af5fa8f4b5924f801fa357102654ead2e8acc8edb61afa8b7f7d03` |
| Outbound events (Ed25519) | `dglaundry-events-ed25519-20260910` | `4a9d9cb1a524dc25cc7e5a5afafd0ba12308f76dec51ce2f5dba40cd476a554e` |
| Machine assertions (RSA) | `dglaundry-machine-rsa-20260910` | `261b7de775689cf72c8cf5aef56f84b575fd2f8dd48c5eeb09f5714928f661a2` |

DGFY remains the provider-side gate. Please assign named owners and attach
deployed SHAs plus evidence for valid OIDC JWKS/discovery, exact callback
registration, separate browser and machine clients, P-256 request verification,
Ed25519 event verification, replay/key rotation, onboarding approval and
mapping, storefront behavior, and quote-to-refund order reconciliation.
Staff activation and the one-branch commerce canary remain disabled until the
shared tests, recovery, and monitoring gates pass.
