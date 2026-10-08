import { execFileSync } from "node:child_process";
import { createHash, createPublicKey, generateKeyPairSync, randomUUID } from "node:crypto";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import assert from "node:assert/strict";

const script = join(process.cwd(), "scripts", "dglaundry-connection-setup.mjs");
const defaultManifest = join(process.cwd(), "docs", "integrations", "dglaundry-connection-manifest.json");
const testRegistrationEnv = {
  DGFY_DGLAUNDRY_CLIENT_ID: "dglaundry-web",
  DGFY_DGLAUNDRY_MACHINE_CLIENT_ID: "dglaundry-machine",
  DGFY_DGLAUNDRY_SERVICE_CLIENT_ID: "dglaundry-service",
  DGFY_DGLAUNDRY_PARTNER_APP_ID: "dglaundry",
  DGFY_OIDC_KEY_ID: "dgfy-oidc-stage-2026-10",
  DGFY_DGLAUNDRY_EVENT_SIGNING_KEY_ID: "dgfy-event-stage-ed25519",
  DGLAUNDRY_PARTNER_SIGNING_KEY_ID: "dgfy-request-stage-p256"
};
function run(action, root, extra = [], env = testRegistrationEnv) {
  try {
    if (action === "prepare") ensureDglaundryMachinePublicKey(root);
    const manifestPath = action === "inspect" ? defaultManifest : ensureTestManifest(root);
    const testEnv = manifestPath ? { ...env, DGLAUNDRY_CONNECTION_MANIFEST: manifestPath } : env;
    return { status: 0, output: execFileSync(process.execPath, [script, action, "--environment", "staging", "--config-dir", root, ...extra], { encoding: "utf8", env: { ...process.env, ...testEnv } }) };
  }
  catch (error) { return { status: error.status ?? 1, output: String(error.stdout ?? "") + String(error.stderr ?? "") }; }
}
function ensureTestManifest(root) {
  const manifestPath = join(root, "test-registered-manifest.json");
  if (existsSync(manifestPath)) return manifestPath;
  writeFileSync(join(root, "dglaundry-oidc-client-secret"), "test-only-browser-client-secret\n", { mode: 0o600 });
  ensureDglaundryMachinePublicKey(root);
  let prepared;
  try {
    prepared = execFileSync(process.execPath, [script, "prepare", "--environment", "staging", "--config-dir", root], {
      encoding: "utf8",
      env: { ...process.env, ...testRegistrationEnv, DGLAUNDRY_CONNECTION_MANIFEST: defaultManifest }
    });
  } catch { return null; }
  const report = JSON.parse(prepared);
  const manifest = JSON.parse(readFileSync(defaultManifest, "utf8"));
  const target = manifest.environments.staging;
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
    writeFileSync(join(root, "dglaundry-connection.env"), "# preserve operator settings\nDGLAUNDRY_CUSTOM_SETTING=keep-this-value\n", { mode: 0o600 });
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
    assert.match(candidate, /DGFY_DGLAUNDRY_MACHINE_CLIENT_PUBLIC_KEY_FILE=\/run\/dgfy-secrets\/dglaundry-machine-assertion\.pub\.pem/);
    assert.match(candidate, /DGLAUNDRY_PARTNER_REQUEST_PUBLIC_KEY_FILE=\/run\/dgfy-secrets\/dglaundry-request-signing\.pub\.pem/);
    assert.match(candidate, /DGLAUNDRY_INTEGRATION_PUBLIC_KEYS_JSON=.*dglaundry-event-stage-ed25519/);
    assert.match(candidate, /DGFY_OIDC_JWKS_KEYS_JSON=.*dgfy-oidc-stage-2026-10/);
    assert.match(candidate, /DGLAUNDRY_CUSTOM_SETTING=keep-this-value/);
    assert.match(candidate, /DGFY_OIDC_KEY_ID=dgfy-oidc-stage-2026-10/);
    assert.match(candidate, /DGLAUNDRY_PARTNER_SIGNING_KEY_ID=dgfy-request-stage-p256/);
    assert.match(candidate, /DGLAUNDRY_PARTNER_AUDIENCE=https:\/\/laundry\.surebizcorp\.com/);
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

test("production mutation actions are disabled and concurrent setup is rejected", () => {
  const root = mkdtempSync(join(tmpdir(), "dglaundry-setup-lock-"));
  try {
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

test("prepare preserves prior public JWKS keys for overlap rotation and rejects key-ID reuse", () => {
  const root = mkdtempSync(join(tmpdir(), "dglaundry-setup-jwks-"));
  try {
    const previousPair = generateKeyPairSync("rsa", { modulusLength: 2048, publicKeyEncoding: { type: "spki", format: "pem" } });
    const previousJwk = { ...createPublicKey(previousPair.publicKey).export({ format: "jwk" }), kid: "previous-oidc-key", alg: "RS256", use: "sig" };
    writeFileSync(join(root, "dglaundry-connection.env"), `DGFY_OIDC_JWKS_KEYS_JSON=${JSON.stringify({ keys: [previousJwk] })}\nDGLAUNDRY_OPERATOR_SETTING=preserve\n`, { mode: 0o600 });
    const prepared = run("prepare", root);
    assert.equal(prepared.status, 0);
    const candidate = readFileSync(join(root, "dglaundry-connection.env.candidate"), "utf8");
    const registryLine = candidate.split(/\r?\n/).find((line) => line.startsWith("DGFY_OIDC_JWKS_KEYS_JSON="));
    const registry = JSON.parse(registryLine.slice("DGFY_OIDC_JWKS_KEYS_JSON=".length));
    assert.deepEqual(registry.keys.map((entry) => entry.kid).sort(), ["dgfy-oidc-stage-2026-10", "previous-oidc-key"]);
    assert.match(candidate, /DGLAUNDRY_OPERATOR_SETTING=preserve/);

    const reuseRoot = mkdtempSync(join(tmpdir(), "dglaundry-setup-jwks-reuse-"));
    try {
      const conflicting = { ...previousJwk, kid: "dgfy-oidc-stage-2026-10" };
      writeFileSync(join(reuseRoot, "dglaundry-connection.env"), `DGFY_OIDC_JWKS_KEYS_JSON=${JSON.stringify({ keys: [conflicting] })}\n`, { mode: 0o600 });
      const rejected = run("prepare", reuseRoot);
      assert.equal(rejected.status, 2);
      assert.match(rejected.output, /OIDC_KEY_ID_REUSE/);
    } finally { rmSync(reuseRoot, { recursive: true, force: true }); }
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

test("container stages private key files from one read-only host directory into app-owned tmpfs", () => {
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
  assert.match(entrypoint, /install -o app -g app -m 0400/);
  assert.match(entrypoint, /chmod 0500 "\$connection_secret_dest"/);
});
