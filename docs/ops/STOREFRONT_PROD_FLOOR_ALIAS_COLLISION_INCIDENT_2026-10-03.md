---
status: reference
authority_level: reference
owner: release
last_reviewed: 2026-10-03
applies_to: production_release_incidents
topic: storefront_prod_floor_alias_collision_2026_10_03
---

# Storefront PROD Floor Alias Collision (2026-10-03)

## Summary

The `2026-10-03-02` production dispatch built Storefront `1.28.0-r3`, then correctly refused to
replace the already-published immutable floor alias `1.28.0`. The alias had been created by the
earlier, successful but partial PROD dispatch for `2026-10-03-01`, which published Storefront
`1.28.0-r2`. The failed run did not publish to the server: the `publish` job is gated on successful
alias promotion and was skipped.

The production incident was subsequently repaired. Hotfix PR #2239 advanced Storefront to `1.28.1`
on `main`; PROD run [37129886672](https://github.com/Sieitzz/dgfy-platform/actions/runs/37129886672)
completed, published all six floor aliases, and deployed all six containers. Health verification
[37130468152](https://github.com/Sieitzz/dgfy-platform/actions/runs/37130468152) passed 15/15 polls.
The `1.28.1` floor was back-ported to `develop` by PR #2242. This report records the failure and
recovery; it does not claim a new deployment.

## Timestamped event and workflow table

| UTC time | Event | Evidence and result | Server rollout |
|---|---|---|---|
| 2026-10-03 05:37 | Partial PROD dispatch for candidate `2026-10-03-01` | [Run 37100411642](https://github.com/Sieitzz/dgfy-platform/actions/runs/37100411642), main SHA `3af877106e7ab268be8a4a82e5417ace6636313b`. It created Storefront floor alias `1.28.0` from `1.28.0-r2`, digest `sha256:189ab024b7694d1b03a4ce8a6244aa71ea378904251a3380f48cde268e4942ca`. | The selected app set deployed successfully; this was the first creation of Storefront's bare PROD floor alias. |
| 2026-10-03 11:03 | Promotion Quality Gate for candidate `2026-10-03-02` | [Run 37118411003](https://github.com/Sieitzz/dgfy-platform/actions/runs/37118411003) passed. It validated source, tests, lint, compliance, and architecture; it did not inspect GHCR or the PROD floor aliases. | No deploy. |
| 2026-10-03 12:33 | Full PROD dispatch for candidate `2026-10-03-02` | [Run 37123238861](https://github.com/Sieitzz/dgfy-platform/actions/runs/37123238861), main SHA `f67084d9be90b5fb03a8dd90c9dcf371b43b3889`. Five aliases were created successfully; Storefront `1.28.0` refused the new `1.28.0-r3` digest `sha256:169550c355eb65efe214d23ea0596f2ef85bc71d8466d328484ac46cc1d2cd14` because the floor already pointed at `sha256:189ab024b7694d1b03a4ce8a6244aa71ea378904251a3380f48cde268e4942ca`. | `publish` was skipped. No server state changed. |
| 2026-10-03 14:26 | Storefront floor hotfix | PR [#2239](https://github.com/Sieitzz/dgfy-platform/pull/2239) was authorized via `/hotfix` and merged to `main` at `9c672e0cf3d84a598e6f1eeaf512ca84a4dac78e`, advancing Storefront from `1.28.0` to `1.28.1`. | Version-only repair; no deploy by this PR. |
| 2026-10-03 14:31 | PROD retry | [Run 37129886672](https://github.com/Sieitzz/dgfy-platform/actions/runs/37129886672) succeeded. It reused the five valid aliases created by the failed run, built Storefront `1.28.1-r1` at `sha256:41cd0a2750e68b1bd61f900c9b285e4920793b9442a933994b56d2d81cc5924f`, promoted all six aliases, and published all six apps. | Successful all-app rollout. |
| 2026-10-03 14:40 | Production health verification | [Run 37130468152](https://github.com/Sieitzz/dgfy-platform/actions/runs/37130468152) passed 15/15 health polls; API, database, Redis, runtime schema, and tenant schema checks were healthy. | Verified. |
| 2026-10-03 | Separate STAGING observation failure | [Run 37052184223](https://github.com/Sieitzz/dgfy-platform/actions/runs/37052184223) failed because the observation job ran a candidate checker requiring `madge` without installing repository dependencies. | No GHCR mutation and no PROD rollout. |

## Six-app artifact lineage

Candidate `2026-10-03-01` froze source SHA
`da86dd025c60311950da12eb53a62fed50205f76` ([PR #2226](https://github.com/Sieitzz/dgfy-platform/pull/2226));
its PROD dispatch ran at main SHA `3af877106e7ab268be8a4a82e5417ace6636313b` (run 37100411642).
Candidate `2026-10-03-02` froze source SHA
`e10e363a11f2db00e3d6be20c4c17e5e3fface45` ([PR #2235](https://github.com/Sieitzz/dgfy-platform/pull/2235));
its STAGING release head was `a142b2d10f5228dff0cad7c609bbff3284c4a2da` (run 37117016358), and its
failed PROD dispatch ran at main SHA `f67084d9be90b5fb03a8dd90c9dcf371b43b3889` (run 37123238861).
Candidate source SHA is the OCI candidate-source label; the workflow run SHA is the image build's
revision identity. They are different fields and are listed separately above.

| App | Candidate `2026-10-03-01` PROD artifact | Candidate `2026-10-03-02` STAGING artifact | Failed PROD candidate artifact and floor result | Final PROD artifact after retry |
|---|---|---|---|---|
| `dgfy-api` | `1.34.0-r2` → `1.34.0`, `sha256:f5c6fa93e5ad8db3d3e74b7fc86a5552a80a18f595fe15980447468467cffea8`; run 37100411642 | `1.35.0-r1`, environment-neutral backend tag; candidate source `e10e363a…`; run 37117016358 | `1.35.0-r1` → `1.35.0`, `sha256:45bc102f81d3c44cf021fce796042204866ae1662ad1515cff973aa8717402cc`; alias created by run 37123238861 | Same `1.35.0` digest; reused by run 37129886672 |
| `dgfy-migration-runner` | `1.23.0-r2` → `1.23.0`, `sha256:b071306d4490131a00e62021480436a7e535710c5e23c312588179fa20a90d5f`; run 37100411642 | `1.24.0-r1`, environment-neutral backend tag; candidate source `e10e363a…`; run 37117016358 | `1.24.0-r1` → `1.24.0`, `sha256:4e3134eef51299a32870bfb722f9aa3ac9a681ef7faee42254db332788147e5b`; alias created by run 37123238861 | Same `1.24.0` digest; reused by run 37129886672 |
| `dgfy-ims` | Not selected in the partial dispatch; no alias created by run 37100411642 | `1.32.0-r2-staging`; candidate source `e10e363a…`; run 37117016358 | `1.32.0-r2` → `1.32.0`, `sha256:256c463b9562c70c1ce718ba1746f58008b216b6d843e41e1d4941c99e3d6d8e`; alias created by run 37123238861 | Same `1.32.0` digest; reused by run 37129886672 |
| `dgfy-pos` | Not selected in the partial dispatch; no alias created by run 37100411642 | `1.32.0-r2-staging`; candidate source `e10e363a…`; run 37117016358 | `1.32.0-r2` → `1.32.0`, `sha256:5b03434f15afa5dd060f4053ca713e7bd780fff7784faf42ee4950c7b8b5fa1d`; alias created by run 37123238861 | Same `1.32.0` digest; reused by run 37129886672 |
| `dgfy-storefront` | `1.28.0-r2` → `1.28.0`, `sha256:189ab024b7694d1b03a4ce8a6244aa71ea378904251a3380f48cde268e4942ca`; run 37100411642 | `1.28.0-r3-staging`; candidate source `e10e363a…`; run 37117016358 | `1.28.0-r3`, `sha256:169550c355eb65efe214d23ea0596f2ef85bc71d8466d328484ac46cc1d2cd14`; promotion to existing `1.28.0` refused by run 37123238861 | Hotfix `1.28.1-r1` → `1.28.1`, `sha256:41cd0a2750e68b1bd61f900c9b285e4920793b9442a933994b56d2d81cc5924f`; run 37129886672 |
| `dgfy-opis` | Not selected in the partial dispatch; no alias created by run 37100411642 | `1.5.0-r2-staging`; candidate source `e10e363a…`; run 37117016358 | `1.5.0-r2` → `1.5.0`, `sha256:3d36756babd84aee8b88eba5b4b6a56e16edc3981efe232cca72614cc957b945`; alias created by run 37123238861 | Same `1.5.0` digest; reused by run 37129886672 |

The candidate's image floors at the time of the failed PROD dispatch were API `1.35.0`, migration
runner `1.24.0`, IMS `1.32.0`, POS `1.32.0`, Storefront `1.28.0`, and OPIS `1.5.0`. Storefront's
floor was later advanced to `1.28.1` by PR #2239 and back-ported by PR #2242. The staging artifact
tags and candidate-source identities above are recorded in PR #2235; the PROD digests and alias
decisions are from the run logs linked in the event table. Read-only image parity checks recorded in
the [#2238 issue update](https://github.com/Sieitzz/dgfy-platform/issues/2238#issuecomment-5970340994)
confirmed each candidate PROD revision tag matched its candidate-source label and each floor alias
matched its PROD revision digest.

## Root cause and gate gap

ADR 0081 Decision 7 correctly forbids changing an already-published version tag to a different
artifact digest. Run 37100411642 created Storefront `1.28.0` from `1.28.0-r2`. Later, the `#2227`
amendment required the next candidate to carry forward every app in the candidate's touched-app
history, so candidate `2026-10-03-02` correctly included Storefront even though its floor remained
`1.28.0`. The new `1.28.0-r3` artifact had a different digest, so the refusal was expected.

The checks behaved according to their scope. `scripts/check-app-version-bump.js` compares package
version text between Git refs; it has no registry lookup and therefore cannot know an alias was
created by a separate earlier dispatch. The Promotion Quality Gate is a source/test/compliance gate
and does not inspect GHCR. `scripts/resolve-build-skip-plan.js` inspected the selected immutable
revision tag (`1.28.0-r3`), not the canonical floor alias (`1.28.0`) that the later alias-promotion
job would move. No check compared the existing floor's source revision and app build inputs with
the incoming source before the jobs built images or mutated aliases.

The current `buildInputPathsForApp` scope includes `apps/<app>/`, its `file:` dependencies, and
`infrastructure/docker/<app>/`. Between the earlier PROD revision and the failed candidate, the
only changed Storefront-relevant tracked path was a POS-only shared web-core test. The existing
reachability resolver reports that file is not reachable from Storefront's production entry. The
new floor preflight therefore reuses the existing semantic narrowing rule: it can safely reuse the
Storefront floor alias for this exact carry-forward case, while a real reachable app or Docker build
input change produces a fatal pre-build collision result.

## Registry moving-tag consistency

The six PROD build jobs previously passed `image_tags: "latest"`, so they moved `latest` while
building, before floor-alias promotion ran. During failed run 37123238861, Storefront's `latest`
pointed at the unpromoted `1.28.0-r3` digest while the immutable floor `1.28.0` still pointed at
`1.28.0-r2`. This was a real registry inconsistency and was repaired by the successful retry. The
other five aliases changed by the failed run were valid; run 37129886672 reused them successfully.

Backend `latest` was also updated in the `promote-aliases` loop regardless of whether that app's
floor-alias promotion had failed. The fix removes build-time `latest` pushes and advances `latest`
for any app only after its floor alias was verified or safely reused. A failed app no longer moves
its own `latest` pointer to an unpromoted digest.

## Separate `madge` failure and related incidents

Run 37052184223 is a separate workflow dependency/setup defect: its staging observation `validate`
job invokes `check-promotion-candidate.js`, whose dependency chain loads `madge`, without running
`actions/setup-node` or `npm ci`. `madge` is declared in the root package manifest. This did not
touch GHCR and did not block or mutate a PROD rollout; it is not part of the floor-alias fix.

Related recurrence records:

- [#1610](https://github.com/Sieitzz/dgfy-platform/issues/1610) tracks repeated immutable-tag
  collisions and remains open; the new preflight addresses the occupied-floor class and safe reuse
  of unchanged carry-forward apps.
- [#2181](https://github.com/Sieitzz/dgfy-platform/issues/2181) records an earlier Storefront floor
  collision and per-incident floor bump.
- [#2186](https://github.com/Sieitzz/dgfy-platform/issues/2186) records the separate backend
  revision-pairing / OPIS gating defect in the same artifact-identity family.

No follow-up issues are created by this PR. PM follow-up remains recommended for the unresolved
Definition of Done in #1610 and for a separate `madge` dependency-setup issue against
`staging-candidate-observation.yml`.
