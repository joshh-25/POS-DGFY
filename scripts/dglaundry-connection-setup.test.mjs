import { execFileSync } from "node:child_process";
import { createHash, generateKeyPairSync, randomUUID } from "node:crypto";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, statSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import assert from "node:assert/strict";

const script = join(process.cwd(), "scripts", "dglaundry-connection-setup.mjs");
const defaultManifest = join(process.cwd(), "docs", "integrations", "dglaundry-connection-manifest.json");
const testRegistrationEnvironments = {
  development: {
    DGFY_DGLAUNDRY_CLIENT_ID: "dglaundry-web-dev",
    DGFY_DGLAUNDRY_MACHINE_CLIENT_ID: "dglaundry-machine-dev",
    DGFY_DGLAUNDRY_SERVICE_CLIENT_ID: "dglaundry-service-dev",
    DGFY_DGLAUNDRY_PARTNER_APP_ID: "dglaundry",
    DGFY_OIDC_KEY_ID: "dgfy-oidc-dev-2026-10",
    DGFY_DGLAUNDRY_EVENT_SIGNING_KEY_ID: "dgfy-event-dev-ed25519",
    DGLAUNDRY_PARTNER_SIGNING_KEY_ID: "dgfy-request-dev-p256"
  },
  staging: {
  DGFY_DGLAUNDRY_CLIENT_ID: "dglaundry-web",
  DGFY_DGLAUNDRY_MACHINE_CLIENT_ID: "dglaundry-machine",
  DGFY_DGLAUNDRY_SERVICE_CLIENT_ID: "dglaundry-service",
  DGFY_DGLAUNDRY_PARTNER_APP_ID: "dglaundry",
  DGFY_OIDC_KEY_ID: "dgfy-oidc-stage-2026-10",
  DGFY_DGLAUNDRY_EVENT_SIGNING_KEY_ID: "dgfy-event-stage-ed25519",
  DGLAUNDRY_PARTNER_SIGNING_KEY_ID: "dgfy-request-stage-p256"
  }
};
const testRegistrationEnv = testRegistrationEnvironments.staging;
function run(action, root, extra = [], env = null, environment = "staging", manifestOverride = null) {
  try {
    if (action === "prepare") ensureDglaundryMachinePublicKey(root);
    const manifestPath = manifestOverride || (action === "inspect" ? defaultManifest : ensureTestManifest(root, environment));
    const registrationEnv = env || testRegistrationEnvironments[environment] || testRegistrationEnv;
    const testEnv = { ...registrationEnv, DGLAUNDRY_CONNECTION_MANIFEST: manifestPath };
    return { status: 0, output: execFileSync(process.execPath, [script, action, "--environment", environment, "--config-dir", root, ...extra], { encoding: "utf8", env: { ...process.env, ...testEnv } }) };
  }
  catch (error) { return { status: error.status ?? 1, output: String(error.stdout ?? "") + String(error.stderr ?? "") }; }
}
function ensureTestManifest(root, environment = "staging") {
  const manifestPath = join(root, `${environment}-test-registered-manifest.json`);
  if (existsSync(manifestPath)) return manifestPath;
  writeFileSync(join(root, "dglaundry-oidc-client-secret"), "test-only-browser-client-secret\n", { mode: 0o600 });
  ensureDglaundryMachinePublicKey(root);
  const registrationEnv = testRegistrationEnvironments[environment] || testRegistrationEnv;
  let prepared;
  try {
    prepared = execFileSync(process.execPath, [script, "prepare", "--environment", environment, "--config-dir", root], {
      encoding: "utf8",
      env: { ...process.env, ...registrationEnv, DGLAUNDRY_CONNECTION_MANIFEST: defaultManifest }
    });
  } catch { return null; }
  const report = JSON.parse(prepared);
  const manifest = JSON.parse(readFileSync(defaultManifest, "utf8"));
  const target = manifest.environments[environment];
  target.registrationStatus = "registered";
  target.registrationEvidence = "https://example.invalid/test-fixture-only";
  for (const entry of report.publicKeys) target.keyFingerprintsSha256[entry.role] = entry.fingerprintSha256;
  writeFileSync(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`, { mode: 0o600 });
  return manifestPath;
}
function ensureDglaundryMachinePublicKey(root) {
  mkdirSync(join(root, "keys"), { recursive: true });
  const roles = [
    ["dglaundry-machine-assertion.pub.pem", () => generateKeyPairSync("rsa", { modulusLength: 2048, publicKeyEncoding: { type: "spki", format: "pem" } })],
    ["dglaundry-request-signing.pub.pem", () => generateKeyPairSync("ec", { namedCurve: "prime256v1", publicKeyEncoding: { type: "spki", format: "pem" } })],
    ["dglaundry-event-signing.pub.pem", () => generateKeyPairSync("ed25519", { publicKeyEncoding: { type: "spki", format: "pem" } })],
  ];
  for (const [name, createPair] of roles) {
    const file = join(root, "keys", name);
    if (!existsSync(file)) writeFileSync(file, createPair().publicKey, { mode: 0o644 });
  }
}

test("setup package is safe, repeatable, and rollback-capable", () => {
  const root = mkdtempSync(join(tmpdir(), "dglaundry-setup-"));
  try {
    writeFileSync(join(root, "dglaundry-connection.env"), "# preserve operator settings\nDGFY_OIDC_JWKS_KEYS_JSON=retired\nDGLAUNDRY_CUSTOM_SETTING=keep-this-value\n", { mode: 0o600 });
    const missingRegistration = run("prepare", root, [], { ...testRegistrationEnv, DGFY_DGLAUNDRY_SERVICE_CLIENT_ID: "" });
    assert.equal(missingRegistration.status, 2);
    assert.match(missingRegistration.output, /REGISTRATION_IDS_REQUIRED/);
    const mismatchedApp = run("prepare", root, [], { ...testRegistrationEnv, DGFY_DGLAUNDRY_PARTNER_APP_ID: "laundry" });
    assert.equal(mismatchedApp.status, 2);
    assert.match(mismatchedApp.output, /REGISTRATION_ID_MISMATCH/);
    const prepared = run("prepare", root);
    assert.equal(prepared.status, 0);
    const preparedReport = JSON.parse(prepared.output);
    assert.equal(preparedReport.privateValues, "not-reported");
    assert.match(readFileSync(join(root, "dglaundry-connection.env.candidate"), "utf8"), /DGFY_OIDC_ISSUER=https:\/\/api\.stage\.dgfy\.ph\/oidc/);
    const candidate = readFileSync(join(root, "dglaundry-connection.env.candidate"), "utf8");
    assert.match(candidate, /DGFY_DGLAUNDRY_SERVICE_CLIENT_ID=dglaundry-service/);
    assert.match(candidate, /DGFY_DGLAUNDRY_PARTNER_APP_ID=dglaundry/);
    assert.match(candidate, /DGLAUNDRY_CONNECTION_SECRET_SOURCE_DIR=\/run\/dgfy-connection-source/);
    assert.match(candidate, /NODE_ENV=production/);
    assert.match(candidate, /DEPLOY_ENV_LABEL=staging/);
    assert.match(candidate, /PAYMONGO_MODE=test/);
    assert.match(candidate, /DGFY_DGLAUNDRY_MACHINE_CLIENT_PUBLIC_KEY_FILE=\/run\/dgfy-secrets\/dglaundry-machine-assertion\.pub\.pem/);
    assert.match(candidate, /DGLAUNDRY_PARTNER_REQUEST_PUBLIC_KEY_FILE=\/run\/dgfy-secrets\/dglaundry-request-signing\.pub\.pem/);
    assert.match(candidate, /DGLAUNDRY_INTEGRATION_PUBLIC_KEYS_JSON=.*dglaundry-event-stage-ed25519/);
    assert.match(candidate, /DGFY_OIDC_PRIVATE_KEY_FILE=\/run\/dgfy-secrets\/dgfy-oidc-private\.pem/);
    assert.match(candidate, /DGFY_OIDC_PUBLIC_KEY_FILE=\/run\/dgfy-secrets\/dgfy-oidc-public\.pem/);
    assert.doesNotMatch(candidate, /DGFY_OIDC_JWKS_KEYS_JSON=/);
    assert.match(candidate, /DGLAUNDRY_CUSTOM_SETTING=keep-this-value/);
    assert.match(candidate, /DGFY_OIDC_KEY_ID=dgfy-oidc-stage-2026-10/);
    assert.match(candidate, /DGLAUNDRY_PARTNER_SIGNING_KEY_ID=dgfy-request-stage-p256/);
    assert.match(candidate, /DGLAUNDRY_PARTNER_AUDIENCE=https:\/\/dglaundry\.stage\.dgfy\.ph/);
    assert.match(candidate, /DGLAUNDRY_PARTNER_BASE_URL=https:\/\/dglaundry\.stage\.dgfy\.ph/);
    assert.match(candidate, /DGFY_DGLAUNDRY_REDIRECT_URI=https:\/\/dglaundry\.stage\.dgfy\.ph\/api\/v1\/session\/dgfy\/callback/);
    assert.match(candidate, /DGLAUNDRY_SIGNATURE_PROFILE=http-message-signatures-v1/);
    assert.equal(run("apply", root).status, 2);
    assert.equal(run("apply", root, ["--confirm"]).status, 0);
    assert.equal(run("verify", root).status, 0);
    const appliedEnv = readFileSync(join(root, "dglaundry-connection.env"), "utf8");
    const appliedState = readFileSync(join(root, "dglaundry-connection-state.json"), "utf8");
    assert.match(run("prepare", root).output, /"alreadyApplied": true/);
    assert.match(run("apply", root, ["--confirm"]).output, /"status": "already-applied"/);
    assert.equal(readFileSync(join(root, "dglaundry-connection.env"), "utf8"), appliedEnv);
    assert.equal(readFileSync(join(root, "dglaundry-connection-state.json"), "utf8"), appliedState);
    writeFileSync(join(root, "dglaundry-connection.env"), "legacy=true\n", { mode: 0o600 });
    const reapplied = run("prepare", root);
    assert.equal(reapplied.status, 0);
    assert.equal(run("apply", root, ["--confirm"]).status, 0);
    assert.equal(run("rollback", root).status, 0);
    assert.equal(readFileSync(join(root, "dglaundry-connection.env"), "utf8"), "legacy=true\n");
  } finally { rmSync(root, { recursive: true, force: true }); }
});

test("development inspection and prepare bind Surebiz to DEV and keep registration proposed until verified", () => {
  const root = mkdtempSync(join(tmpdir(), "dglaundry-setup-development-proposed-"));
  try {
    const inspected = run("inspect", root, [], testRegistrationEnvironments.development, "development", defaultManifest);
    assert.equal(inspected.status, 0);
    const report = JSON.parse(inspected.output);
    assert.equal(report.registrationStatus, "proposed");
    assert.equal(report.target.issuer, "https://api.dev.dgfy.ph/oidc");
    assert.equal(report.target.partnerApiOrigin, "https://api.dev.dgfy.ph");
    assert.equal(report.target.staffOrigin, "https://laundry.surebizcorp.com");
    assert.equal(report.target.apiOrigin, "https://laundry.surebizcorp.com");
    assert.equal(report.target.callback, "https://laundry.surebizcorp.com/api/v1/session/dgfy/callback");
    assert.equal(report.target.storefrontOrigin, "https://dev.dgfy.ph");
    assert.equal(report.target.paymentMode, "sandbox");
    assert.equal(report.target.clientIds.browser, "dglaundry-web-dev");
    assert.equal(report.target.clientIds.machine, "dglaundry-machine-dev");
    assert.equal(report.target.clientIds.service, "dglaundry-service-dev");

    const prepared = run("prepare", root, [], testRegistrationEnvironments.development, "development", defaultManifest);
    assert.equal(prepared.status, 0);
    const candidate = readFileSync(join(root, "dglaundry-connection.env.candidate"), "utf8");
    assert.match(candidate, /DGFY_OIDC_ISSUER=https:\/\/api\.dev\.dgfy\.ph\/oidc/);
    assert.match(candidate, /DGFY_DGLAUNDRY_REDIRECT_URI=https:\/\/laundry\.surebizcorp\.com\/api\/v1\/session\/dgfy\/callback/);
    assert.match(candidate, /DGLAUNDRY_PARTNER_BASE_URL=https:\/\/laundry\.surebizcorp\.com/);
    assert.match(candidate, /DGLAUNDRY_PARTNER_AUDIENCE=https:\/\/laundry\.surebizcorp\.com/);
    assert.match(candidate, /DGLAUNDRY_INTEGRATION_ENVIRONMENT=development/);
    assert.match(candidate, /DGLAUNDRY_CONNECTION_ENVIRONMENT=development/);
    assert.match(candidate, /NODE_ENV=production/);
    assert.match(candidate, /DEPLOY_ENV_LABEL=dev/);
    assert.match(candidate, /PAYMONGO_MODE=test/);
    const blocked = run("apply", root, ["--confirm"], testRegistrationEnvironments.development, "development", defaultManifest);
    assert.equal(blocked.status, 2);
    assert.match(blocked.output, /PROVIDER_REGISTRATION_UNCONFIRMED/);
  } finally { rmSync(root, { recursive: true, force: true }); }
});

test("development apply, verify, Compose sync, drift protection, and rollback stay environment-bound", () => {
  const root = mkdtempSync(join(tmpdir(), "dglaundry-setup-development-"));
  const composeDir = mkdtempSync(join(tmpdir(), "dglaundry-development-compose-"));
  const composeEnvPath = join(composeDir, ".env");
  const previousComposeEnv = "UNRELATED_APP_SETTING=keep-me\nNODE_ENV=development\nDGLAUNDRY_INTEGRATION_ENABLED=false\nDEPLOY_ENV_LABEL=development\nPAYMONGO_MODE=test\n";
  try {
    writeFileSync(join(root, "dglaundry-connection.env"), "# prior connection config\nDGLAUNDRY_CUSTOM_SETTING=preserve-on-rollback\n", { mode: 0o600 });
    writeFileSync(composeEnvPath, previousComposeEnv, { mode: 0o640 });
    const prepared = run("prepare", root, [], testRegistrationEnvironments.development, "development");
    assert.equal(prepared.status, 0);
    const candidate = readFileSync(join(root, "dglaundry-connection.env.candidate"), "utf8");
    assert.match(candidate, /DGFY_OIDC_ISSUER=https:\/\/api\.dev\.dgfy\.ph\/oidc/);
    assert.match(candidate, /DGLAUNDRY_PARTNER_AUDIENCE=https:\/\/laundry\.surebizcorp\.com/);
    assert.match(candidate, /DGLAUNDRY_INTEGRATION_PUBLIC_KEYS_JSON=.*dglaundry-event-dev-ed25519/);
    const applied = run("apply", root, ["--confirm", "--compose-env-file", composeEnvPath], testRegistrationEnvironments.development, "development");
    assert.equal(applied.status, 0);
    const applyReport = JSON.parse(applied.output);
    assert.equal(applyReport.composeEnvSynced, true);
    assert.equal(statSync(composeEnvPath).mode & 0o777, 0o640);
    const merged = readFileSync(composeEnvPath, "utf8");
    assert.match(merged, /UNRELATED_APP_SETTING=keep-me/);
    assert.match(merged, /DGLAUNDRY_INTEGRATION_ENABLED=true/);
    assert.match(merged, /NODE_ENV=production/);
    assert.match(merged, /DEPLOY_ENV_LABEL=dev/);
    assert.match(merged, /PAYMONGO_MODE=test/);
    const verified = run("verify", root, [], testRegistrationEnvironments.development, "development");
    assert.equal(verified.status, 0);
    assert.equal(JSON.parse(verified.output).checks.find((entry) => entry.name === "compose-env-sync").passed, true);

    writeFileSync(composeEnvPath, `${merged}UNREVIEWED_CHANGE=true\n`, { mode: 0o640 });
    const driftBlocked = run("rollback", root, [], testRegistrationEnvironments.development, "development");
    assert.equal(driftBlocked.status, 2);
    assert.match(driftBlocked.output, /COMPOSE_ENV_DRIFT/);
    writeFileSync(composeEnvPath, merged, { mode: 0o640 });
    const rolledBack = run("rollback", root, [], testRegistrationEnvironments.development, "development");
    assert.equal(rolledBack.status, 0);
    assert.equal(readFileSync(composeEnvPath, "utf8"), previousComposeEnv);
    assert.equal(readFileSync(join(root, "dglaundry-connection.env"), "utf8"), "# prior connection config\nDGLAUNDRY_CUSTOM_SETTING=preserve-on-rollback\n");
  } finally {
    rmSync(root, { recursive: true, force: true });
    rmSync(composeDir, { recursive: true, force: true });
  }
});

test("prepared state rejects manifest drift and legacy 1.1 manifests", () => {
  const root = mkdtempSync(join(tmpdir(), "dglaundry-setup-manifest-drift-"));
  try {
    const prepared = run("prepare", root, [], testRegistrationEnvironments.development, "development");
    assert.equal(prepared.status, 0);
    const manifestPath = join(root, "development-test-registered-manifest.json");
    const manifest = JSON.parse(readFileSync(manifestPath, "utf8"));
    manifest.contractVersion = `${manifest.contractVersion}-changed-after-prepare`;
    writeFileSync(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`, { mode: 0o600 });
    const drifted = run("apply", root, ["--confirm"], testRegistrationEnvironments.development, "development", manifestPath);
    assert.equal(drifted.status, 2);
    assert.match(drifted.output, /PREPARED_STATE_INVALID/);

    manifest.manifestVersion = "1.1.0";
    writeFileSync(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`, { mode: 0o600 });
    const staleManifest = run("inspect", root, [], testRegistrationEnvironments.development, "development", manifestPath);
    assert.equal(staleManifest.status, 2);
    assert.match(staleManifest.output, /MANIFEST_INVALID/);
  } finally { rmSync(root, { recursive: true, force: true }); }
});

test("production mutation actions are disabled and concurrent setup is rejected", () => {
  const root = mkdtempSync(join(tmpdir(), "dglaundry-setup-lock-"));
  try {
    ensureTestManifest(root);
    let production = "";
    try { production = execFileSync(process.execPath, [script, "rollback", "--environment", "production"], { encoding: "utf8", env: process.env }); }
    catch (error) { production = String(error.stdout ?? "") + String(error.stderr ?? ""); }
    assert.match(production, /PRODUCTION_APPLY_FORBIDDEN/);
    writeFileSync(join(root, ".dglaundry-connection-setup.lock"), "operator operation is active\n", { mode: 0o600 });
    const locked = run("prepare", root);
    assert.equal(locked.status, 2);
    assert.match(locked.output, /OPERATION_IN_PROGRESS/);
  } finally { rmSync(root, { recursive: true, force: true }); }
});


test("apply refuses a managed configuration changed after prepare", () => {
  const root = mkdtempSync(join(tmpdir(), "dglaundry-setup-drift-"));
  try {
    assert.equal(run("prepare", root).status, 0);
    writeFileSync(join(root, "dglaundry-connection.env"), "concurrent=change\n", { mode: 0o600 });
    const applied = run("apply", root, ["--confirm"]);
    assert.equal(applied.status, 2);
    assert.match(applied.output, /APPLIED_CONFIGURATION_DRIFT/);
    assert.equal(readFileSync(join(root, "dglaundry-connection.env"), "utf8"), "concurrent=change\n");
  } finally { rmSync(root, { recursive: true, force: true }); }
});

test("apply recovers an interrupted transaction without replacing its rollback snapshot", () => {
  const root = mkdtempSync(join(tmpdir(), "dglaundry-setup-interrupted-"));
  try {
    const priorEnv = "# operator-owned setting\nDGLAUNDRY_CUSTOM_SETTING=keep-this-value\n";
    writeFileSync(join(root, "dglaundry-connection.env"), priorEnv, { mode: 0o600 });
    assert.equal(run("prepare", root).status, 0);
    const statePath = join(root, "dglaundry-connection-state.json");
    const state = JSON.parse(readFileSync(statePath, "utf8"));
    const snapshotName = `dglaundry-connection.env.previous.${randomUUID()}`;
    writeFileSync(join(root, snapshotName), priorEnv, { mode: 0o600 });
    state.status = "applying";
    state.previous = snapshotName;
    state.previousSha256 = createHash("sha256").update(priorEnv).digest("hex");
    state.previousExisted = true;
    writeFileSync(statePath, `${JSON.stringify(state, null, 2)}\n`, { mode: 0o600 });

    assert.equal(run("apply", root, ["--confirm"]).status, 0);
    const applied = JSON.parse(readFileSync(statePath, "utf8"));
    assert.equal(applied.status, "applied");
    assert.equal(applied.previous, snapshotName);
    assert.equal(readFileSync(join(root, snapshotName), "utf8"), priorEnv);
    assert.equal(readdirSync(root).filter((name) => name.startsWith("dglaundry-connection.env.previous.")).length, 1);
  } finally { rmSync(root, { recursive: true, force: true }); }
});

test("apply and verify require a non-empty owner-only browser-client secret file", () => {
  const root = mkdtempSync(join(tmpdir(), "dglaundry-setup-client-secret-"));
  try {
    assert.equal(run("prepare", root).status, 0);
    const secretPath = join(root, "dglaundry-oidc-client-secret");
    assert.equal(existsSync(secretPath), true);
    rmSync(secretPath, { force: true });
    const blocked = run("apply", root, ["--confirm"]);
    assert.equal(blocked.status, 2);
    assert.match(blocked.output, /BROWSER_CLIENT_SECRET_REQUIRED/);
  } finally { rmSync(root, { recursive: true, force: true }); }
});

test("apply syncs its generated variables into an external --compose-env-file without disturbing unmanaged settings or permissions", () => {
  const root = mkdtempSync(join(tmpdir(), "dglaundry-setup-compose-sync-"));
  const composeDir = mkdtempSync(join(tmpdir(), "dglaundry-compose-env-"));
  const composeEnvPath = join(composeDir, ".env");
  try {
    assert.equal(run("prepare", root).status, 0);
    // Mirrors the real incident (#2303): the deploy-owned .env already has this key, but stale
    // (false), plus an unrelated app setting that must survive the merge untouched. 0o640 mirrors
    // this file's real-world ownership/perms on the host -- the sync must not force them to 0o600.
    writeFileSync(composeEnvPath, "UNRELATED_APP_SETTING=keep-me\nDGLAUNDRY_INTEGRATION_ENABLED=false\n", { mode: 0o640 });
    const applied = run("apply", root, ["--confirm", "--compose-env-file", composeEnvPath]);
    assert.equal(applied.status, 0);
    const report = JSON.parse(applied.output);
    assert.equal(report.composeEnvFile, composeEnvPath);
    assert.equal(report.composeEnvSynced, true);
    const merged = readFileSync(composeEnvPath, "utf8");
    assert.match(merged, /UNRELATED_APP_SETTING=keep-me/);
    assert.match(merged, /DGLAUNDRY_INTEGRATION_ENABLED=true/);
    assert.doesNotMatch(merged, /DGLAUNDRY_INTEGRATION_ENABLED=false/);
    // The exact variable missing in the real incident -- entrypoint.sh had no path to copy from.
    assert.match(merged, /DGFY_OIDC_PRIVATE_KEY_FILE=\/run\/dgfy-secrets\/dgfy-oidc-private\.pem/);
    assert.equal(statSync(composeEnvPath).mode & 0o777, 0o640);
  } finally {
    rmSync(root, { recursive: true, force: true });
    rmSync(composeDir, { recursive: true, force: true });
  }
});

test("apply refuses to create a missing --compose-env-file from scratch", () => {
  const root = mkdtempSync(join(tmpdir(), "dglaundry-setup-compose-sync-missing-"));
  const composeDir = mkdtempSync(join(tmpdir(), "dglaundry-compose-env-missing-"));
  const composeEnvPath = join(composeDir, ".env");
  try {
    assert.equal(run("prepare", root).status, 0);
    const blocked = run("apply", root, ["--confirm", "--compose-env-file", composeEnvPath]);
    assert.equal(blocked.status, 2);
    assert.match(blocked.output, /COMPOSE_ENV_FILE_MISSING/);
    assert.equal(existsSync(composeEnvPath), false);
    // The managed config stays prepared because the required Compose target was absent.
    assert.equal(JSON.parse(readFileSync(join(root, "dglaundry-connection-state.json"), "utf8")).status, "prepared");
    assert.equal(existsSync(join(root, "dglaundry-connection.env")), false);
  } finally {
    rmSync(root, { recursive: true, force: true });
    rmSync(composeDir, { recursive: true, force: true });
  }
});

test("verify detects applied environment and registration ID drift", () => {
  const root = mkdtempSync(join(tmpdir(), "dglaundry-setup-verify-drift-"));
  try {
    assert.equal(run("prepare", root).status, 0);
    assert.equal(run("apply", root, ["--confirm"]).status, 0);
    const envPath = join(root, "dglaundry-connection.env");
    const applied = readFileSync(envPath, "utf8");
    writeFileSync(envPath, applied.replace("DGFY_OIDC_KEY_ID=dgfy-oidc-stage-2026-10", "DGFY_OIDC_KEY_ID=unreviewed-key"), { mode: 0o600 });
    const result = run("verify", root);
    assert.equal(result.status, 2);
    const report = JSON.parse(result.output);
    assert.equal(report.passed, false);
    assert.equal(report.checks.find((item) => item.name === "configuration-digest").passed, false);
    assert.equal(report.checks.find((item) => item.name === "signing-key-ids").passed, false);
  } finally { rmSync(root, { recursive: true, force: true }); }
});

test("prepare rejects a matching P-384 pair for the P-256 request-signing role", () => {
  const root = mkdtempSync(join(tmpdir(), "dglaundry-setup-p384-"));
  try {
    assert.equal(run("prepare", root).status, 0);
    const pair = generateKeyPairSync("ec", {
      namedCurve: "secp384r1",
      privateKeyEncoding: { type: "pkcs8", format: "pem" },
      publicKeyEncoding: { type: "spki", format: "pem" },
    });
    writeFileSync(join(root, "keys/dgfy-request-signing.pem"), pair.privateKey, { mode: 0o600 });
    writeFileSync(join(root, "keys/dgfy-request-signing.pub.pem"), pair.publicKey, { mode: 0o644 });
    const result = run("prepare", root);
    assert.equal(result.status, 2);
    assert.match(result.output, /KEY_PAIR_INVALID/);
  } finally { rmSync(root, { recursive: true, force: true }); }
});

test("verify fails closed when applied configuration or registration IDs drift", () => {
  const root = mkdtempSync(join(tmpdir(), "dglaundry-setup-verify-drift-"));
  try {
    assert.equal(run("prepare", root).status, 0);
    assert.equal(run("apply", root, ["--confirm"]).status, 0);
    const configPath = join(root, "dglaundry-connection.env");
    const original = readFileSync(configPath, "utf8");
    writeFileSync(configPath, original.replace("DGFY_OIDC_KEY_ID=dgfy-oidc-stage-2026-10", "DGFY_OIDC_KEY_ID=other-key"), { mode: 0o600 });
    const result = run("verify", root);
    assert.equal(result.status, 2);
    const report = JSON.parse(result.output);
    assert.equal(report.passed, false);
    assert.equal(report.checks.find((item) => item.name === "configuration-digest").passed, false);
    assert.equal(report.checks.find((item) => item.name === "signing-key-ids").passed, false);
  } finally { rmSync(root, { recursive: true, force: true }); }
});

test("prepare rejects a matching but non-P-256 provider request key pair", () => {
  const root = mkdtempSync(join(tmpdir(), "dglaundry-setup-p384-"));
  try {
    assert.equal(run("prepare", root).status, 0);
    const pair = generateKeyPairSync("ec", {
      namedCurve: "secp384r1",
      privateKeyEncoding: { type: "pkcs8", format: "pem" },
      publicKeyEncoding: { type: "spki", format: "pem" },
    });
    writeFileSync(join(root, "keys/dgfy-request-signing.pem"), pair.privateKey, { mode: 0o600 });
    writeFileSync(join(root, "keys/dgfy-request-signing.pub.pem"), pair.publicKey, { mode: 0o644 });
    const result = run("prepare", root);
    assert.equal(result.status, 2);
    assert.match(result.output, /KEY_PAIR_INVALID/);
  } finally { rmSync(root, { recursive: true, force: true }); }
});

test("container stages key files from staging or SOPS mounts into app-owned tmpfs", () => {
  const compose = readFileSync(join(process.cwd(), "infrastructure/docker/docker-compose.api.yml"), "utf8");
  const entrypoint = readFileSync(join(process.cwd(), "infrastructure/docker/dgfy-api/entrypoint.sh"), "utf8");
  assert.match(compose, /\$\{DGLAUNDRY_CONNECTION_CONFIG_DIR:-\.\/secrets\}:\/run\/dgfy-connection-source:ro/);
  assert.match(compose, /- \/run\/dgfy-secrets/);
  assert.doesNotMatch(compose, /:\/run\/dgfy-connection-source\/(?:keys\/)?[A-Za-z0-9._-]+:ro/);
  for (const sourceName of [
    "keys/dgfy-oidc-signing.pem",
    "keys/dgfy-oidc-signing.pub.pem",
    "dglaundry-oidc-client-secret",
    "keys/dgfy-event-signing.pem",
    "keys/dgfy-request-signing.pem",
    "keys/dglaundry-machine-assertion.pub.pem",
    "keys/dglaundry-request-signing.pub.pem",
  ]) assert.ok(entrypoint.includes(sourceName), `entrypoint must stage ${sourceName}`);
  assert.match(entrypoint, /source_path="\$connection_secret_source\/\$sops_name"/);
  assert.match(entrypoint, /install -o app -g app -m 0400/);
  assert.match(entrypoint, /chmod 0500 "\$connection_secret_dest"/);
  assert.doesNotMatch(compose, /^\s+DGFY_OIDC_PRIVATE_KEY_FILE:/m, "the reviewed env file must own integration key paths because Compose environment overrides env_file");
});

function inspectManifest(mutate, environmentName) {
  const dir = mkdtempSync(join(tmpdir(), "dglaundry-origins-"));
  try {
    const value = JSON.parse(readFileSync(defaultManifest, "utf8"));
    mutate(value);
    const path = join(dir, "manifest.json");
    writeFileSync(path, `${JSON.stringify(value, null, 2)}\n`);
    try {
      return { status: 0, output: execFileSync(process.execPath, [script, "inspect", "--environment", environmentName, "--config-dir", dir], { encoding: "utf8", env: { ...process.env, DGLAUNDRY_CONNECTION_MANIFEST: path } }) };
    } catch (error) { return { status: error.status ?? 1, output: String(error.stdout ?? "") + String(error.stderr ?? "") }; }
  } finally { rmSync(dir, { recursive: true, force: true }); }
}

test("each environment reports its own DGLaundry origin and callback (#2513)", () => {
  const staging = JSON.parse(inspectManifest(() => {}, "staging").output).target;
  assert.equal(staging.staffOrigin, "https://dglaundry.stage.dgfy.ph");
  assert.equal(staging.callback, "https://dglaundry.stage.dgfy.ph/api/v1/session/dgfy/callback");
  const production = JSON.parse(inspectManifest(() => {}, "production").output).target;
  assert.equal(production.staffOrigin, "https://dglaundry.dgfy.ph");
  assert.equal(production.callback, "https://dglaundry.dgfy.ph/api/v1/session/dgfy/callback");
  assert.equal(production.apiOrigin, "https://dglaundry.dgfy.ph");
});

test("a manifest without per-environment origins is rejected instead of reusing Surebiz for other environments", () => {
  const legacy = inspectManifest((value) => { for (const entry of Object.values(value.environments)) { delete entry.staffOrigin; delete entry.callback; } }, "staging");
  assert.notEqual(legacy.status, 0);
  assert.match(legacy.output, /MANIFEST_INVALID/);
});

test("a callback that is not the HTTPS session callback on its staffOrigin is rejected", () => {
  for (const mutate of [
    (value) => { value.environments.production.callback = "https://evil.example/api/v1/session/dgfy/callback"; },
    (value) => { value.environments.production.callback = "http://dglaundry.dgfy.ph/api/v1/session/dgfy/callback"; },
    (value) => { value.environments.staging.callback = "https://dglaundry.stage.dgfy.ph/somewhere/else"; },
    (value) => { value.environments.production.staffOrigin = "https://dglaundry.dgfy.ph/path"; },
    (value) => { value.environments.staging.staffOrigin = "not a url"; },
    // Parsed-equivalent but not byte-identical to the pinned redirect URI: rejected, because the raw string is rendered.
    (value) => { value.environments.production.callback = "https://dglaundry.dgfy.ph/api/v1/session/dgfy/callback?"; },
    (value) => { value.environments.production.callback = "https://dglaundry.dgfy.ph/api/v1/session/dgfy/callback#x"; },
    (value) => { value.environments.production.callback = "https://DGLAUNDRY.dgfy.ph/api/v1/session/dgfy/callback"; },
    (value) => { value.environments.production.callback = "https://dglaundry.dgfy.ph:443/api/v1/session/dgfy/callback"; },
    (value) => { value.environments.production.callback = "https://user@dglaundry.dgfy.ph/api/v1/session/dgfy/callback"; },
    (value) => { value.environments.production.callback = "https://dglaundry.dgfy.ph\\api/v1/session/dgfy/callback"; },
    (value) => { value.environments.production.callback = "https://dglaundry.dgfy.ph/api/v1/./session/dgfy/callback"; },
    (value) => { value.environments.production.callback = " https://dglaundry.dgfy.ph/api/v1/session/dgfy/callback"; },
    (value) => { value.environments.production.staffOrigin = "https://dglaundry.dgfy.ph/"; },
  ]) {
    const result = inspectManifest(mutate, "staging");
    assert.notEqual(result.status, 0);
    assert.match(result.output, /CALLBACK_INVALID|MANIFEST_ENVIRONMENT_TARGET_INVALID|MANIFEST_ENDPOINT_INVALID/);
  }
});

test("a blank or null per-environment origin fails validation instead of falling back to the top-level pair", () => {
  for (const mutate of [
    (value) => { value.environments.production.staffOrigin = ""; value.environments.production.callback = ""; },
    (value) => { value.environments.production.staffOrigin = null; value.environments.production.callback = null; },
    (value) => { value.environments.staging.staffOrigin = ""; },
    (value) => { value.environments.staging.callback = null; },
  ]) {
    const result = inspectManifest(mutate, "production");
    assert.notEqual(result.status, 0);
    assert.match(result.output, /CALLBACK_INVALID|MANIFEST_INVALID|MANIFEST_ENVIRONMENT_TARGET_INVALID/);
  }
});
