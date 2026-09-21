---
status: draft_pr
owner: DGFY identity/integration
last_reviewed: 2026-09-11
related_adr: docs/architecture/adr/0079-dglaundry-external-runtime-and-provider-contract.md
declaration_id: 2026-09-11-dglaundry-contract-authentication
classification: major
surfaces: dgfy-laundry,identity,security,integrations
reason_codes_impacted: ALLOWED,VALIDATION_FAILED,SERVICE_UNAVAILABLE,INTEGRATION_SIGNATURE_REPLAY
policy_version: 2026.09.11
verification_evidence: node --check changed provider files,npm test --prefix apps/dgfy-api -- --runInBand tests/dgfyLaundryProviderUseCases.test.js tests/dglaundryEventSignature.test.js tests/dglaundryPartnerClient.test.js,git diff --check
rollback_note: Keep the DGLaundry integration disabled and DGLAUNDRY_BOOKING_PAYMENTS_ENABLED=false; revert this change with the provider key/configuration update if asymmetric client or signature qualification fails.
preflight_result: no_breach
preflight_reason_code: ALLOWED
preflight_run_at: 2026-09-11T00:00:00+08:00
preflight_request_ref: DGLAUNDRY-COMPLETION-2026-09-11
---

# DGLaundry contract authentication and Surebizcorp handoff

## Compliance Impact Classification

Major. This change makes the DGLaundry provider contract use separate
`Signature-Input` and `Signature` headers, adds private-key JWT machine-client
authentication with one-time assertion replay protection, and fixes the
Surebizcorp staff origin. It does not change DGFY's ordinary tenant services or
payment authority.

## Compliance Preconditions

1. Provider OIDC signing JWKS and DGLaundry event verification public keys are
   installed through the secret manager; only IDs and fingerprints are recorded
   in evidence.
2. Production uses separate browser and machine clients. Static partner tokens
   are not used for the asymmetric path.
3. DGLaundry storefront and booking payment flags remain dark until provider,
   hosted, and approved-branch qualification passes.
4. DGFY and DGLaundry retain separate databases, runtimes, private networks,
   and signing private keys.

## Verification Evidence

- Targeted provider foundation, signature, and partner-client tests.
- Node syntax checks for changed provider files.
- Provider discovery/JWKS and staging end-to-end evidence remain external gates
  and are not claimed by this declaration.
