#!/usr/bin/env node
import { createHash, createPrivateKey, createPublicKey, generateKeyPairSync } from "node:crypto";
import { chmod, copyFile, mkdir, readFile, stat, writeFile } from "node:fs/promises";
import { dirname, isAbsolute, join, resolve } from "node:path";

const ACTIONS = new Set(["inspect", "prepare", "apply", "verify", "rollback"]);
const manifestPath = resolve(process.env.DGLAUNDRY_CONNECTION_MANIFEST || "docs/integrations/dglaundry-connection-manifest.json");
const args = process.argv.slice(2);
const action = args[0] || "inspect";
const environment = option("environment") || "staging";
const configDir = option("config-dir") || process.env.DGLAUNDRY_CONNECTION_CONFIG_DIR || "";

if (!ACTIONS.has(action)) fail("SETUP_ACTION_INVALID", `Use one of: ${[...ACTIONS].join(", ")}`);
if (!["staging", "production"].includes(environment)) fail("SETUP_ENVIRONMENT_INVALID", "Use staging or production.");
if (environment === "production" && ["prepare", "apply"].includes(action)) fail("PRODUCTION_APPLY_FORBIDDEN", "This package can prepare or apply staging only.");

const manifest = await loadJson(manifestPath, "MANIFEST_UNREADABLE");
validateManifest(manifest);
const target = manifest.environments[environment];
const setupInputs = {
  serviceClientId: String(process.env.DGFY_DGLAUNDRY_SERVICE_CLIENT_ID || "").trim(),
  oidcKeyId: String(process.env.DGFY_OIDC_KEY_ID || "").trim(),
  eventKeyId: String(process.env.DGFY_DGLAUNDRY_EVENT_SIGNING_KEY_ID || "").trim(),
  requestKeyId: String(process.env.DGLAUNDRY_PARTNER_SIGNING_KEY_ID || "").trim(),
};
if (action === "prepare") {
  const missing = Object.entries(setupInputs).filter(([, value]) => !value).map(([name]) => name);
  if (missing.length) fail("REGISTRATION_IDS_REQUIRED", `Register and review the service client and key IDs before prepare. Missing: ${missing.join(", ")}.`);
  const invalid = Object.entries(setupInputs).filter(([name, value]) => name === "serviceClientId"
    ? !/^[a-z][a-z0-9._:-]{2,80}$/.test(value)
    : !/^[A-Za-z0-9._:-]{3,128}$/.test(value)).map(([name]) => name);
  if (invalid.length) fail("REGISTRATION_IDS_INVALID", `Registration IDs contain unsupported characters or lengths: ${invalid.join(", ")}.`);
}
const root = configDir ? resolve(configDir) : null;
if (["prepare", "apply", "verify", "rollback"].includes(action) && !root) fail("CONFIG_DIR_REQUIRED", "Pass --config-dir to operate on the host configuration directory.");

const manifestDigest = digest(JSON.stringify(manifest));
const statePath = root && join(root, "dglaundry-connection-state.json");
const envPath = root && join(root, "dglaundry-connection.env");
const candidatePath = root && join(root, "dglaundry-connection.env.candidate");
const backupPath = root && join(root, "dglaundry-connection.env.previous");

if (action === "inspect") {
  const report = { action, environment, manifestVersion: manifest.manifestVersion, manifestSha256: manifestDigest, target: { issuer: target.issuer, partnerApiOrigin: target.partnerApiOrigin, staffOrigin: manifest.staffOrigin, callback: manifest.callback, paymentMode: target.paymentMode }, configDir: root ? root : null, registrationInputsConfigured: Object.fromEntries(Object.entries(setupInputs).map(([name, value]) => [name, Boolean(value)])), prerequisites: await prerequisites(root), privateValues: "not-read" };
  console.log(JSON.stringify(report, null, 2));
} else if (action === "prepare") {
  await mkdir(join(root, "keys"), { recursive: true });
  const generated = [];
  await ensureKey(root, manifest.keyRoles.oidcSigning, "rsa", generated);
  await ensureKey(root, manifest.keyRoles.dgfyEventSigning, "ed25519", generated);
  await ensureKey(root, manifest.keyRoles.dgfyRequestSigning, "ec", generated);
  const candidate = renderEnv(root, manifest, target);
  await writeFile(candidatePath, candidate, { encoding: "utf8", mode: 0o600 });
  await chmod(candidatePath, 0o600).catch(() => undefined);
  const previous = await readManagedEnv(envPath);
  await writeState({ status: "prepared", environment, manifestSha256: manifestDigest, generated, registrationIds: setupInputs, candidateSha256: digest(candidate), previousSha256: digest(previous), previous: null });
  console.log(JSON.stringify({ action, environment, manifestSha256: manifestDigest, generated, candidate: "dglaundry-connection.env.candidate", privateValues: "not-reported" }, null, 2));
} else if (action === "apply") {
  if (!args.includes("--confirm")) fail("APPLY_CONFIRMATION_REQUIRED", "Re-run apply with --confirm after reviewing the prepared configuration.");
  const prepared = await loadState();
  if (!prepared || prepared.manifestSha256 !== manifestDigest || prepared.environment !== environment || prepared.status !== "prepared") fail("PREPARED_STATE_INVALID", "Run prepare and review its manifest-bound output first.");
  await ensureFile(candidatePath, "PREPARED_CONFIGURATION_MISSING");
  const candidate = await readText(candidatePath);
  if (digest(candidate) !== prepared.candidateSha256) fail("PREPARED_CONFIGURATION_CHANGED", "The prepared configuration changed after review; run prepare again.");
  const previous = await readManagedEnv(envPath);
  if (digest(previous) !== prepared.previousSha256) fail("APPLIED_CONFIGURATION_DRIFT", "The managed configuration changed after prepare; inspect the difference and prepare again.");
  if (previous !== "") await copyFile(envPath, backupPath);
  await writeFile(envPath, candidate, { encoding: "utf8", mode: 0o600 });
  await chmod(envPath, 0o600).catch(() => undefined);
  const applied = { status: "applied", environment, manifestSha256: manifestDigest, generated: prepared.generated, registrationIds: prepared.registrationIds, envSha256: digest(candidate), previous: previous ? "dglaundry-connection.env.previous" : null };
  await writeState(applied);
  console.log(JSON.stringify({ action, environment, status: "applied", manifestSha256: manifestDigest, previous: applied.previous, privateValues: "not-reported" }, null, 2));
} else if (action === "verify") {
  const state = await loadState();
  const appliedEnv = await readText(envPath);
  const checks = [];
  checks.push(check("state", Boolean(state && state.status === "applied" && state.environment === environment && state.manifestSha256 === manifestDigest)));
  checks.push(check("configuration", Boolean(root && await exists(envPath))));
  checks.push(check("configuration-digest", Boolean(state?.envSha256 && digest(appliedEnv) === state.envSha256)));
  checks.push(check("service-client-registration", Boolean(state?.registrationIds?.serviceClientId && envValue(appliedEnv, "DGFY_DGLAUNDRY_SERVICE_CLIENT_ID") === state.registrationIds.serviceClientId)));
  checks.push(check("signing-key-ids", Boolean(state?.registrationIds
    && envValue(appliedEnv, "DGFY_OIDC_KEY_ID") === state.registrationIds.oidcKeyId
    && envValue(appliedEnv, "DGFY_DGLAUNDRY_EVENT_SIGNING_KEY_ID") === state.registrationIds.eventKeyId
    && envValue(appliedEnv, "DGLAUNDRY_PARTNER_SIGNING_KEY_ID") === state.registrationIds.requestKeyId)));
  checks.push(check("partner-origin-and-audience", envValue(appliedEnv, "DGLAUNDRY_PARTNER_BASE_URL") === manifest.staffOrigin && envValue(appliedEnv, "DGLAUNDRY_PARTNER_AUDIENCE") === new URL(manifest.staffOrigin).origin));
  checks.push(check("integration-environment-and-signature-profile", envValue(appliedEnv, "DGLAUNDRY_INTEGRATION_ENVIRONMENT") === environment && envValue(appliedEnv, "DGLAUNDRY_SIGNATURE_PROFILE") === "http-message-signatures-v1"));
  for (const [name, role] of Object.entries(manifest.keyRoles)) {
    const file = join(root, role.owner === "dgfy" ? role.privateFile : role.publicFile);
    checks.push(check(`key:${name}`, await keyHealthy(file, role.algorithm)));
    if (role.owner === "dgfy") {
      checks.push(check(`key-pair:${name}`, await keyPairMatches(file, join(root, role.publicFile))));
    }
  }
  const passed = checks.every((item) => item.passed);
  console.log(JSON.stringify({ action, environment, manifestSha256: manifestDigest, passed, checks, privateValues: "not-read" }, null, 2));
  if (!passed) process.exitCode = 2;
} else {
  const state = await loadState();
  if (!state || !["applied", "prepared"].includes(state.status) || !state.previous) fail("ROLLBACK_UNAVAILABLE", "No previous configuration is recorded for rollback.");
  await copyFile(backupPath, envPath);
  await writeState({ ...state, status: "rolled-back", rolledBackAt: new Date().toISOString() });
  console.log(JSON.stringify({ action, environment, status: "rolled-back", restored: "dglaundry-connection.env.previous", privateValues: "not-reported" }, null, 2));
}

function option(name) { const index = args.indexOf(`--${name}`); return index >= 0 ? args[index + 1] : undefined; }
function fail(code, message) { console.error(JSON.stringify({ action, status: "blocked", code, message })); process.exit(2); }
async function loadJson(file, code) { try { return JSON.parse(await readFile(file, "utf8")); } catch { fail(code, "The connection manifest could not be read."); } }
async function readText(file) { try { return await readFile(file, "utf8"); } catch { return ""; } }
async function readManagedEnv(file) {
  if (!(await exists(file))) return "";
  try { return await readFile(file, "utf8"); }
  catch { fail("MANAGED_CONFIGURATION_UNREADABLE", "The managed configuration exists but cannot be read safely."); }
}
async function exists(file) { try { await stat(file); return true; } catch { return false; } }
async function ensureFile(file, code) { if (!(await exists(file))) fail(code, "Run prepare before apply."); }
async function loadState() { if (!statePath) return null; try { return JSON.parse(await readFile(statePath, "utf8")); } catch { return null; } }
async function writeState(value) { await writeFile(statePath, JSON.stringify(value, null, 2) + "\n", { encoding: "utf8", mode: 0o600 }); await chmod(statePath, 0o600).catch(() => undefined); }
function digest(value) { return createHash("sha256").update(value).digest("hex"); }
function envValue(source, name) {
  const prefix = `${name}=`;
  const line = String(source || "").split(/\r?\n/).find((entry) => entry.startsWith(prefix));
  return line ? line.slice(prefix.length).trim() : "";
}
function check(name, passed) { return { name, passed: Boolean(passed) }; }
function validateManifest(value) {
  if (!value || value.manifestVersion !== "1.0.0" || !value.contractVersion || !value.staffOrigin || !value.callback || !value.environments?.staging || !value.environments?.production || !value.keyRoles) fail("MANIFEST_INVALID", "The manifest is missing required connection fields.");
  if (value.environments.staging.paymentMode !== "sandbox") fail("STAGING_PAYMENT_MODE_INVALID", "Staging must use sandbox payments.");
  if (!value.callback.startsWith("https://laundry.surebizcorp.com/")) fail("CALLBACK_INVALID", "The callback must be the protected HTTPS DGLaundry callback.");
}
async function prerequisites(rootDir) {
  const output = { configDirectory: rootDir ? await exists(rootDir) : false, manifest: true, registrations: Object.fromEntries(Object.entries(setupInputs).map(([name, value]) => [name, Boolean(value)])), keys: {} };
  if (rootDir) for (const [name, role] of Object.entries(manifest.keyRoles)) output.keys[name] = await exists(join(rootDir, role.owner === "dgfy" ? role.privateFile : role.publicFile));
  return output;
}
function renderEnv(rootDir, value, targetConfig) {
  const lines = [
    `DGLAUNDRY_CONNECTION_MANIFEST_SHA256=${manifestDigest}`,
    `DGLAUNDRY_CONNECTION_ENVIRONMENT=${environment}`,
    `DGFY_OIDC_ISSUER=${targetConfig.issuer}`,
    `DGFY_DGLAUNDRY_REDIRECT_URI=${value.callback}`,
    `DGFY_DGLAUNDRY_EVENT_SIGNING_KEY_ID=${setupInputs.eventKeyId}`,
    `DGFY_DGLAUNDRY_EVENT_SIGNING_PRIVATE_KEY_FILE=${join(rootDir, value.keyRoles.dgfyEventSigning.privateFile)}`,
    `DGFY_OIDC_PRIVATE_KEY_FILE=${join(rootDir, value.keyRoles.oidcSigning.privateFile)}`,
    `DGFY_OIDC_PUBLIC_KEY_FILE=${join(rootDir, value.keyRoles.oidcSigning.publicFile)}`,
    `DGFY_OIDC_KEY_ID=${setupInputs.oidcKeyId}`,
    `DGFY_DGLAUNDRY_SERVICE_CLIENT_ID=${setupInputs.serviceClientId}`,
    `DGLAUNDRY_INTEGRATION_ENVIRONMENT=${environment}`,
    `DGLAUNDRY_PARTNER_BASE_URL=${value.staffOrigin}`,
    `DGLAUNDRY_PARTNER_AUDIENCE=${new URL(value.staffOrigin).origin}`,
    `DGLAUNDRY_SIGNATURE_PROFILE=http-message-signatures-v1`,
    `DGLAUNDRY_PARTNER_SIGNING_PRIVATE_KEY_FILE=${join(rootDir, value.keyRoles.dgfyRequestSigning.privateFile)}`,
    `DGLAUNDRY_PARTNER_SIGNING_KEY_ID=${setupInputs.requestKeyId}`,
    `DGLAUNDRY_PARTNER_APP_ID=${setupInputs.serviceClientId}`,
    `DGLAUNDRY_PARTNER_CONTRACT_VERSION=${value.contractVersion}`,
    "DGLAUNDRY_CONNECTION_PRIVATE_VALUES=secret-manager-only",
  ];
  return lines.join("\n") + "\n";
}
async function ensureKey(rootDir, role, type, generated) {
  const privatePath = join(rootDir, role.privateFile);
  const publicPath = join(rootDir, role.publicFile);
  const privateExists = await exists(privatePath);
  const publicExists = await exists(publicPath);
  if (privateExists && publicExists) {
    if (!(await keyHealthy(privatePath, role.algorithm)) || !(await keyHealthy(publicPath, role.algorithm))
      || !(await keyPairMatches(privatePath, publicPath))) {
      fail("KEY_PAIR_INVALID", `Refusing to use an invalid, mismatched, or wrong-curve key pair: ${role.privateFile}`);
    }
    return;
  }
  if (privateExists || publicExists) fail("KEY_PAIR_INCOMPLETE", `Refusing to overwrite an incomplete key pair: ${role.privateFile}`);
  if (role.owner !== "dgfy") fail("KEY_OWNER_MISMATCH", `Only DGFY-owned keys may be generated by this setup command: ${role.owner}`);
  const pair = type === "rsa"
    ? generateKeyPairSync("rsa", { modulusLength: 3072, privateKeyEncoding: { type: "pkcs8", format: "pem" }, publicKeyEncoding: { type: "spki", format: "pem" } })
    : type === "ec"
      ? generateKeyPairSync("ec", { namedCurve: "prime256v1", privateKeyEncoding: { type: "pkcs8", format: "pem" }, publicKeyEncoding: { type: "spki", format: "pem" } })
      : generateKeyPairSync("ed25519", { privateKeyEncoding: { type: "pkcs8", format: "pem" }, publicKeyEncoding: { type: "spki", format: "pem" } });
  await writeFile(privatePath, pair.privateKey, { encoding: "utf8", mode: 0o600 });
  await writeFile(publicPath, pair.publicKey, { encoding: "utf8", mode: 0o644 });
  await chmod(privatePath, 0o600).catch(() => undefined);
  generated.push(role.owner + ":" + role.privateFile);
}
async function keyHealthy(file, algorithm) {
  if (!(await exists(file))) return false;
  try {
    const pem = await readText(file);
    const key = pem.includes("PRIVATE KEY") ? createPrivateKey(pem) : createPublicKey(pem);
    if (algorithm === "RS256") return key.asymmetricKeyType === "rsa" && (key.asymmetricKeyDetails?.modulusLength ?? 0) >= 2048;
    if (algorithm === "Ed25519") return key.asymmetricKeyType === "ed25519";
    return algorithm.startsWith("P-256")
      ? key.asymmetricKeyType === "ec" && key.asymmetricKeyDetails?.namedCurve === "prime256v1"
      : true;
  } catch { return false; }
}
async function keyPairMatches(privateFile, publicFile) {
  try {
    const privateKey = createPrivateKey(await readFile(privateFile, "utf8"));
    const installedPublicKey = createPublicKey(await readFile(publicFile, "utf8"));
    const derivedPublicKey = createPublicKey(privateKey);
    const installed = installedPublicKey.export({ type: "spki", format: "der" });
    const derived = derivedPublicKey.export({ type: "spki", format: "der" });
    return installed.equals(derived);
  } catch { return false; }
}
