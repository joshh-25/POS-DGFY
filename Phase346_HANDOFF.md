# Phase 346 handoff

**Repository:** `C:\xampp\htdocs\POS-DGFY`
**Branch:** `POS-Development`
**As of:** 2026-09-14
**Current phase:** Phase 346 completed locally. Phase 344 is still `in_progress` pending authenticated visual acceptance; Phase 347 is next eligible after that gate.

## Architecture

- Multi-tenant API: `tenantHandler` resolves the landlord `Tenant`, opens the tenant database, and binds models through `dbStore`/`getTenantModels`.
- Backend boundary: `routes -> controllers -> usecases -> repositories -> models`.
- Frontends: `apps/dgfy-pos`, `apps/dgfy-storefront`, `apps/dgfy-ims`; shared trunk is `packages/web-core`; Android code is under `apps/dgfy-android-bridge`.
- Local stack ports: SKUpervisor `5173`, POS `5174`, Storefront `5175`, API `5000`, device bridge `5101`, MySQL `3306`.
- Authoritative device contract: `docs/features/POS_DEVICE_LOCATION_ACCESS_CONTRACT.md`. “Area” means tenant branch/location (`location_id`) plus operator grant; GPS, Wi-Fi, IP, and fingerprints are not enforcement signals.

## Work already completed

Earlier phases repaired POS/Storefront history and delivery contracts, multi-location inventory and branch controls, MapLibre security, POS security-test coverage, and the Phase 344 POS catalog presentation. Phase 345 recorded the device/location policy contract and amended the related ADRs.

Phase 346 added:

- Tenant-local enrollment, activation, and challenge models with additive migration and schema-repair registration: `apps/dgfy-migration-runner/migrations/20260914000004-create-pos-terminal-device-enrollment.cjs`, `apps/dgfy-api/scripts/sync-tenant-schemas.js`, and `apps/dgfy-api/src/models/PosTerminalDevice{Enrollment,Activation,Challenge}.js`.
- `posTerminalDeviceEnrollmentService.js` and repository/use-case/controller layers for ES256 public-key enrollment, hashed one-use activation/challenge state, transaction locks, atomic consumption, terminal/location/tenant/session/purpose/path/body binding, revocation/replacement, and audit logging.
- `posDeviceProof.js` plus route gates for POS cashier login, protected POS operations, mobile POS sync/bootstrap, DGFY POS SSO, and POS-aware refresh/logout. Policy-off requests remain compatible.
- Admin activation-code issue/list/revoke/replace APIs and pre-auth bootstrap activation at `/api/v1/pos/terminal/devices/activate`.
- `device_enforcement: off|strict` settings support, DGFY terminal-policy integration, runtime schema requirements, validators, and focused security/transport tests.
- Phase ledger and compliance declaration updates: `docs/features/IMPLEMENTATION_PHASE_LEDGER.md`, `docs/compliance/impact-declarations/2026-09-14-pos-device-enrollment-phase-346.md`.

## Binding decisions

- Strict mode is opt-in per registered terminal and fails closed when enabled.
- One active enrolled device per strict terminal; one device key cannot silently move across tenants, terminals, or locations. Replacement/revocation are administrator-only and audited.
- Activation codes live for 10 minutes and are one-use; challenges/request proofs live for 60 seconds and are one-use.
- Only `android`/`mobile` clients may enroll on strict terminals until later client phases. Browser, Electron, and bridge clients stay policy-off.
- Private keys, raw activation codes/challenges, signatures, passwords, and bearer tokens must not be logged or exposed in settings. The API returns only public-key fingerprints for enrollment listings.
- Recovery/control routes under `/terminal/devices` intentionally bypass device proof but still require authenticated administrator permissions, reason, and audit.
- The bridge is a transport, not cashier identity; bridge command authorization is Phase 349.

## Validation evidence

Run from `apps/dgfy-api`:

```text
npm test -- --runInBand tests/posTerminalDeviceEnrollment.service.test.js tests/posTerminalDeviceEnrollment.migration.test.js tests/posDeviceProof.middleware.test.js tests/posTerminalDeviceRoute.transport.test.js tests/dgfyPosDeviceUseCases.test.js tests/posTerminalDeviceUseCases.test.js tests/posTerminalRegistrySecrets.test.js tests/posCashierLoginUseCase.test.js tests/dgfyAuthUseCases.test.js tests/runtimeSchemaAuditService.test.js tests/tenantSchemaSyncScripts.test.js tests/posCashierLoginRoute.transport.test.js tests/mobilePosSettingsBootstrap.contract.test.js tests/mobilePosHandlers.transport.test.js --silent
npm run lint
```

Results: **14 suites / 148 tests passed**; API lint **0 errors, 12 pre-existing warnings**.

From the repository root, the following passed:

```text
npm run check:architecture
npm run check:docs
node scripts/check-compliance-api-contracts.js
git diff --check
```

`node --check` passed for 93 changed/new backend and migration files. Isolated Phase 346 compliance passed for 12 sensitive files. The aggregate `npm run check:compliance` currently fails because the dirty worktree combines unrelated Phase 333/334/338/339 surfaces; do not widen the Phase 346 declaration to mask those unrelated changes.

## Remaining work / next agent

1. Close Phase 344 authenticated desktop/mobile visual acceptance.
2. Implement Phase 347 iMin Android Keystore signing and physical-device interoperability/recovery tests.
3. Implement Phase 348 POS device administration UI and rendered recovery/location-policy flows.
4. Implement Phase 349 authenticated bridge command tickets and hardware replay/audit protection.
5. Implement Phase 350 rollout hardening, CI evidence, staging pilot, and explicit production opt-in.
6. Before production, review DGFY SSO proof ordering: `buildStartDgfyPosSessionUseCase` currently creates the tenant session before `validateDgfyPosTerminalPolicy` verifies strict device proof; failed requests do not return tokens, but ordering/persistence should be tightened or explicitly accepted with tests.

## Git and safety notes

- The worktree is intentionally very dirty with prior phase changes, user files, temporary worktrees, and untracked artifacts. **Do not reset, clean, or stage all changes.** Inspect paths and batch only the intended phase files.
- Phase 346 has not been committed, pushed, PR’d, migrated against the local database, or deployed. The migration is tested but not executed in this handoff session.
- Read `AGENTS.md`, `docs/START_HERE.md`, `docs/architecture/ARCHITECTURE_BOUNDARIES.md`, `docs/architecture/ARCHITECTURE_GOVERNANCE.md`, and `docs/ai/PR.md` before planning a follow-up or creating a PR.
- Preserve continuous numbering in `docs/features/IMPLEMENTATION_PHASE_LEDGER.md`; do not start a new initiative at Phase 1.
