---
status: accepted
authority_level: authoritative
owner: architecture
date: 2026-06-28
last_reviewed: 2026-06-30
review_by: 2026-12-28
applies_to: development_to_production_release_authorization
topic: free_tier_signed_release_authorization
---

# ADR 0030: Free-Tier Signed Release Authorization

## Status

Accepted (2026-06-28)

## Context

The repository is private and currently uses GitHub Free. Repository branch protection, rulesets, private-environment secrets, and required deployment reviewers are unavailable. GitHub Actions can economically run CI, create promotion pull requests, and publish candidate evidence, but it cannot be the production trust root.

The previous workflow described GitHub protection and environment approval as prerequisites while still retaining workflows and local commands capable of reaching production. PR #24 also demonstrated that a master merge can exist while GitHub checks are not successful. Production therefore needs an independent authorization boundary that fails closed even when GitHub cannot prevent a direct push or merge.

## Decision

1. GitHub Actions is an untrusted candidate-evidence producer. It never receives production SSH credentials, production tokens, or signing private keys.
2. A root-owned, version-pinned release controller installed outside candidate checkouts is the only supported promotion and production entrypoint.
3. Owner authorization uses standard GPG-signed annotated Git tags. Verification uses `git verify-tag --raw` and a root-owned allowlist of full signing-key fingerprints. No repository code implements signature primitives.
4. The controller verifies authorization before creating a candidate worktree or executing candidate code.
5. Promotion and production require different signed tags. A payment-sensitive release additionally requires a separate payment tag.
6. Every authorization tag points directly to the authorized commit and has the canonical message fields below:

```text
schema=sku-release-authorization/v1
repository=BBLabs-Albert/SKU-Inventory-Manager
phase=promotion|production|payment
target_sha=<40-character lowercase commit SHA>
expires_at=<UTC RFC3339 timestamp>
nonce=<32-or-more lowercase hexadecimal characters>
inventory_sha256=<64-character lowercase SHA-256>
evidence_sha256=<64-character lowercase SHA-256>
payment_sensitive=true|false
pr_number=<positive integer>
```

7. Tag names use `release-authorization/<phase>/<target_sha>/<nonce>`. The tag target, message `target_sha`, current remote branch SHA, PR evidence, inventory SHA-256, and evidence SHA-256 must all agree.
8. Promotion authorization targets the exact `origin/staging` candidate. `staging` is an aggregate integration branch: developer feature branches, conflict-resolution commits, and owner direct-staging fixes are valid release inputs after they are present in the final staging SHA and covered by reviewed inventory. The trusted controller validates the final `staging -> master` PR, required successful checks, reviewed batch documentation, exact QA proof, and current master base before invoking a head-SHA-pinned merge.
9. Production authorization targets the resulting exact `origin/master` SHA. A green staging SHA is not production authorization.
10. Payment-sensitive inventory requires `payment_sensitive=true` in promotion and production tags plus a separate valid `phase=payment` tag bound to the same SHA, inventory hash, evidence hash, PR, expiry rules, and an independent nonce.
11. The root-owned nonce ledger records signer fingerprint, phase, target SHA, tag, timestamps, and terminal status. A nonce is reserved atomically before a privileged action and is never reusable, including after a failed action. Retrying requires a new signed tag and nonce.
12. The controller refuses authorization that is expired, not yet valid, replayed, signed by a non-allowlisted key, malformed, bound to a different repository/SHA/PR/hash/payment flag, or attached to a lightweight tag.
13. The controller independently confirms remote branch state and required GitHub PR/check evidence. Candidate-provided summaries are not sufficient authority.
14. Production deployment is refused when master moved, qualification failed, QA differs from the target, production credentials are unavailable, deployment evidence is missing, or per-slice production accuracy proof is unresolved.
15. Controller secrets live only in an OS-protected secret store. The supported Unix installation uses root ownership, `0700` directories, `0600` configuration/key material, a dedicated controller checkout or package version, and a separate bare Git mirror.
16. Production deploy code may run only after signed authorization and trusted qualification. Candidate code never receives the controller signing key or raw production SSH private key.
17. Direct master pushes and merges cannot be prevented on this GitHub plan, so they are detected and reported. They remain undeployable until they are reconciled through `staging` and governed promotion evidence exists. A future direct-master override would require a separate ADR and controller tests proving equivalent exact-SHA, inventory, QA, local qualification, evidence-hash, payment, and production-authorization controls.
18. `ENABLE_AUTO_PRODUCTION_DEPLOY` remains `0`. GitHub production workflows only build dry-run candidate bundles.
19. GitHub may create or update the promotion PR, but only the external promotion controller may merge it.
20. Every reviewed release slice carries a non-bypassable `documentation_closure` decision. The controller rejects missing, placeholder, untracked, unchanged-as-updated, or cross-boundary-without-ADR documentation claims.
21. Candidate evidence uses `sku-release-evidence/v2` and hash-binds the passing documentation-closure artifact and Regression Risk Notice to the exact reviewed inventory and target SHA.
22. Production authorization is a two-phase lifecycle: `authorized -> reserved -> deployed_pending_accuracy -> completed`. Successful SSH deployment never directly produces `completed`.
23. A failure before production mutation transitions `reserved -> failed`. A missing, failed, stale, or wrong-SHA post-deploy proof leaves the consumed authorization in `deployed_pending_accuracy` and records residual risk; it does not falsely report completion.
24. A separate trusted finalization operation recollects current production proof, verifies production still runs the exact target SHA, validates hash-verified proof for every release slice, and only then transitions to `completed`.
25. Every production deployment writes root-owned, mode `0600`, machine-readable and human-readable records beneath `/var/lib/skupervisor-release-controller/releases/<target_sha>/`. These records are outside the deployed checkout and are never committed as proof of their own deployed SHA.
26. The deployment record is immutable and records `deployed_pending_accuracy`. Successful finalization creates separate immutable accuracy-finalization JSON and Markdown records rather than rewriting the deployment record.
27. The first trusted controller installation is a bootstrap ceremony. The operator must independently record and approve the controller source SHA, package checksum, installer version, validation evidence, full signer fingerprint, root ownership, and installed version before production authority is enabled.
28. GitHub Actions billing or spending-limit exhaustion may substitute controller-local exact-SHA qualification for a required GitHub check only when the controller independently proves all of the following from GitHub APIs: the check belongs to GitHub Actions, the job received no runner, the job executed zero steps, the conclusion is `failure`, and the check annotation explicitly identifies failed account payments or a spending-limit allocation denial.
29. The billing fallback must be explicitly enabled in root-owned controller configuration, hash-bound into the signed candidate evidence, and covered by the same fresh owner authorization. The controller still reruns its configured qualification commands in an ephemeral exact-SHA worktree.
30. The billing fallback never substitutes for a check that started, a missing check, a code or test failure, local qualification, reviewed inventory, documentation closure, Regression Risk Notice, merge-adoption proof, isolated QA, human review, payment authorization, production proof, or deployed-change accuracy finalization.
31. Feature PRs into `staging` may use the same machine-readable billing-unavailability proof plus an exact-head clean-worktree qualification and explicit human approval. The merge must remain head-SHA-pinned; any branch movement invalidates the evidence. The resulting staging SHA must still pass the complete staging qualification and isolated QA requirements before signed promotion.
32. A signed emergency QA lane may substitute for isolated QA only when root-owned controller configuration explicitly enables it and candidate evidence hash-binds a `sku-emergency-qa-authorization/v1` report. The report must identify `reason_code=isolated_qa_unavailable`, the exact SHA, owner approval, actor, concrete reason, no payment-sensitive scope, no migrations, passing trusted local qualification, rollback readiness, planned read-only production smoke, and mandatory post-deploy accuracy finalization.
33. The emergency QA lane never executes QA against the production host and never treats production as QA. It accepts degraded pre-production assurance only through fresh, separate signed promotion and production tags. Failed tests, source drift, inventory/documentation/risk failures, merge-adoption failures, payment changes, migrations, missing rollback readiness, missing production proof, and missing accuracy finalization remain non-bypassable.

## Threat Model

The controls address:

1. A compromised contributor or candidate checkout attempting to deploy arbitrary code.
2. A compromised GitHub workflow attempting to forge approval or exfiltrate production credentials.
3. A direct push or manually merged PR reaching master without successful governed evidence.
4. Reuse of an old approval tag for a later release.
5. Substitution of inventory, QA, PR, check, or deployment evidence after owner approval.
6. Payment-channel changes being hidden in a general release approval.
7. A moved branch being deployed under authorization for an earlier SHA.
8. A release claiming documentation closure through nonexistent, untracked, unchanged, placeholder, or unreviewed documents.
9. A successful deploy command being mistaken for verified production behavior.
10. Post-deploy evidence being committed into a later Git SHA and misrepresented as proof contained by the deployed SHA itself.
11. A generic GitHub check failure being mislabeled as billing unavailability to avoid running tests.

The controls do not protect against a fully compromised controller root account, production root account, or owner signing private key. Those are explicit trust anchors requiring host security and incident procedures.

## Key Rotation And Revocation

1. The signer allowlist contains full fingerprints, never short key IDs.
2. Adding a key requires an out-of-band owner-reviewed controller configuration change and controller version record.
3. Rotation overlaps old and new public keys only for a bounded migration window. New authorizations use the new key immediately.
4. Revocation removes the fingerprint from the controller allowlist, archives the previous allowlist with an incident/change reference, and invalidates every unconsumed tag signed by that key.
5. Signing private keys are never generated, stored, imported, or used by GitHub Actions.

## Incident Response

1. Disable controller promotion and production units.
2. Remove or revoke the affected signer fingerprint or production credential.
3. Preserve the append-only nonce ledger, authorization tags, controller logs, candidate bundles, and production proof.
4. Compare remote master, deployed markers, runtime SHA, and the last valid ledger completion.
5. Preserve the external deployment and finalization records. A `deployed_pending_accuracy` record is an incomplete release, not evidence of completion.
6. Rotate affected keys/credentials and install a newly pinned controller version.
7. Resume only with fresh signed tags and nonces. Never delete a ledger entry to make an old authorization reusable.

## Future Migration

When the repository plan supports native branch protection, rulesets, private environment secrets, and required deployment reviewers, enable those controls as defense in depth. Do not remove signed external authorization until a new ADR demonstrates equivalent exact-SHA, replay, evidence-binding, payment-separation, and independent-credential guarantees.

## Amendment (2026-07-02)

For the specific case of Docker/GHCR-based platform deployment, the owner
decided to supersede rules 1, 16, 18, and 22 above and accept a simpler,
directly GitHub-held credential instead of the external signed-release
controller:

- `.github/workflows/build-main.yml` builds and pushes the `backend` and
  `frontend` images to GHCR, then invokes
  `.github/workflows/deployment-orchestrator.yml`'s `publish` job, which
  calls `.github/workflows/publish-platform.yml`.
- `publish-platform.yml` holds a production SSH private key
  (`secrets.SSH_PRIVATE_KEY`, scoped to the `PROD` GitHub Environment) and
  uses it to SSH into the production server and run
  `docker compose pull && docker compose up -d` directly from the
  workflow run.
- This is a deliberate, narrow exception: it applies only to this
  image-build-and-pull deployment path. It does not amend or relax any
  other rule in this ADR (signed release tags, the promotion/production
  authorization lifecycle, payment-sensitive gating, the nonce ledger,
  etc.), none of which currently have a working implementation outside
  this document. It also does not bless holding any other production
  credential (database, signing keys, payment secrets) in GitHub.
- QA/DEV environments are expected to follow a similar or shared SSH-pull
  pattern later; this ADR was not written with a non-production carve-out,
  so extending this exception to QA/DEV does not require a further
  amendment, but a genuinely different production-adjacent risk (e.g.
  broader credentials, additional services) should get its own review.

## Amendment (2026-07-06)

The DEV and STAGING servers are not directly reachable from GitHub Actions
runners; they sit behind a VPN. This amendment covers adding a VPN hop to
the `publish-platform.yml` deploy path introduced by the 2026-07-02
amendment above, for those two environments only:

- `.github/workflows/publish-platform.yml` gained an optional `vpn_required`
  input. When true, it writes a provided `.ovpn` config to disk and runs
  `kota65535/github-openvpn-connect-action` (with `OVPN_USERNAME`/
  `OVPN_PASSWORD`) to bring up a VPN tunnel *before* the existing
  SSH-configure and `docker compose pull && docker compose up -d` steps.
  The SSH steps themselves are unchanged; `SSH_TARGET` for these
  environments simply resolves to a private address only reachable once
  the tunnel is up.
- `.github/workflows/deployment-orchestrator.yml`, `build-develop.yml`, and
  `build-staging.yml` set `vpn_required: true`. `build-main.yml` and
  `build-beta-manual.yml` (BETA, standing in for prod) are unchanged and
  keep direct SSH access, since that server is already reachable.
- New environment-scoped credentials `OVPN_CONFIG`, `OVPN_USERNAME`, and
  `OVPN_PASSWORD` are added only to the `DEV` and `STAGING` GitHub
  Environments -- never to `PROD`/`BETA`.
- This is the "genuinely different production-adjacent risk" the
  2026-07-02 amendment anticipated needing its own review before extending
  the SSH-pull pattern to QA/DEV. It is addressed here as a narrow,
  reviewed extension: it does not touch the production/BETA credential
  path, and it only adds network reachability (a VPN tunnel) ahead of the
  same already-authorized SSH-pull deploy step -- it does not grant any
  new deploy authority or broaden the production trust boundary.

## Consequences

1. GitHub failures or bypassable repository settings cannot independently authorize production.
2. Release operation requires an external Linux controller and owner signing-key operations.
3. Owner authorization occurs after immutable evidence hashes are known, which adds an explicit release ceremony.
4. Privileged operators with root access remain capable of bypassing any software control; root access must be tightly limited and audited.
5. The change is cross-boundary because production trust and deployment topology move outside GitHub. It does not add an application architecture allowlist exception.
6. Post-deploy documentation cannot be part of the same deployed Git SHA. Repository follow-up documentation may summarize an external record, but it must identify the already-deployed SHA and cannot serve as self-proof for its own commit.
