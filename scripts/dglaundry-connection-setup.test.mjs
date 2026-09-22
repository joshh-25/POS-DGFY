import { execFileSync } from "node:child_process";
import { generateKeyPairSync } from "node:crypto";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import assert from "node:assert/strict";

const script = join(process.cwd(), "scripts", "dglaundry-connection-setup.mjs");
const testRegistrationEnv = {
  DGFY_DGLAUNDRY_SERVICE_CLIENT_ID: "test-service-client",
  DGFY_OIDC_KEY_ID: "test-oidc-key",
  DGFY_DGLAUNDRY_EVENT_SIGNING_KEY_ID: "test-event-key",
  DGLAUNDRY_PARTNER_SIGNING_KEY_ID: "test-request-key"
};
function run(action, root, extra = [], env = testRegistrationEnv) {
  try { return { status: 0, output: execFileSync(process.execPath, [script, action, "--environment", "staging", "--config-dir", root, ...extra], { encoding: "utf8", env: { ...process.env, ...env } }) }; }
  catch (error) { return { status: error.status ?? 1, output: String(error.stdout ?? "") + String(error.stderr ?? "") }; }
}

test("setup package is safe, repeatable, and rollback-capable", () => {
  const root = mkdtempSync(join(tmpdir(), "dglaundry-setup-"));
  try {
    const missingRegistration = run("prepare", root, [], { ...testRegistrationEnv, DGFY_DGLAUNDRY_SERVICE_CLIENT_ID: "" });
    assert.equal(missingRegistration.status, 2);
    assert.match(missingRegistration.output, /REGISTRATION_IDS_REQUIRED/);
    const prepared = run("prepare", root);
    assert.equal(prepared.status, 0);
    const preparedReport = JSON.parse(prepared.output);
    assert.equal(preparedReport.privateValues, "not-reported");
    assert.match(readFileSync(join(root, "dglaundry-connection.env.candidate"), "utf8"), /DGFY_OIDC_ISSUER=https:\/\/api\.stage\.dgfy\.ph\/oidc/);
    const candidate = readFileSync(join(root, "dglaundry-connection.env.candidate"), "utf8");
    assert.match(candidate, /DGFY_DGLAUNDRY_SERVICE_CLIENT_ID=test-service-client/);
    assert.match(candidate, /DGFY_OIDC_KEY_ID=test-oidc-key/);
    assert.match(candidate, /DGLAUNDRY_PARTNER_SIGNING_KEY_ID=test-request-key/);
    assert.match(candidate, /DGLAUNDRY_PARTNER_AUDIENCE=https:\/\/laundry\.surebizcorp\.com/);
    assert.match(candidate, /DGLAUNDRY_SIGNATURE_PROFILE=http-message-signatures-v1/);
    assert.equal(run("apply", root).status, 2);
    assert.equal(run("apply", root, ["--confirm"]).status, 0);
    assert.equal(run("verify", root).status, 2);
    const roles = {
      "dglaundry-machine-assertion.pub.pem": "rsa",
      "dglaundry-request-signing.pub.pem": "ec",
      "dglaundry-event-signing.pub.pem": "ed25519",
    };
    mkdirSync(join(root, "keys"), { recursive: true });
    for (const [name, type] of Object.entries(roles)) {
      const pair = type === "rsa"
        ? generateKeyPairSync("rsa", { modulusLength: 2048, publicKeyEncoding: { type: "spki", format: "pem" } })
        : type === "ec"
          ? generateKeyPairSync("ec", { namedCurve: "prime256v1", publicKeyEncoding: { type: "spki", format: "pem" } })
          : generateKeyPairSync("ed25519", { publicKeyEncoding: { type: "spki", format: "pem" } });
      writeFileSync(join(root, "keys", name), pair.publicKey, { mode: 0o644 });
    }
    assert.equal(run("verify", root).status, 0);
    writeFileSync(join(root, "dglaundry-connection.env"), "legacy=true\n", { mode: 0o600 });
    const reapplied = run("prepare", root);
    assert.equal(reapplied.status, 0);
    assert.equal(run("apply", root, ["--confirm"]).status, 0);
    assert.equal(run("rollback", root).status, 0);
    assert.equal(readFileSync(join(root, "dglaundry-connection.env"), "utf8"), "legacy=true\n");
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

test("verify detects applied environment and registration ID drift", () => {
  const root = mkdtempSync(join(tmpdir(), "dglaundry-setup-verify-drift-"));
  try {
    assert.equal(run("prepare", root).status, 0);
    assert.equal(run("apply", root, ["--confirm"]).status, 0);
    const envPath = join(root, "dglaundry-connection.env");
    const applied = readFileSync(envPath, "utf8");
    writeFileSync(envPath, applied.replace("DGFY_OIDC_KEY_ID=test-oidc-key", "DGFY_OIDC_KEY_ID=unreviewed-key"), { mode: 0o600 });
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
    writeFileSync(configPath, original.replace("DGFY_OIDC_KEY_ID=test-oidc-key", "DGFY_OIDC_KEY_ID=other-key"), { mode: 0o600 });
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
