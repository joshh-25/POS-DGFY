#!/usr/bin/env node
import { createHash, createPrivateKey, createPublicKey, generateKeyPairSync, randomUUID } from "node:crypto";
import { chmod, mkdir, readFile, rename, stat, unlink, writeFile } from "node:fs/promises";
import { unlinkSync } from "node:fs";
import { basename, dirname, join, resolve } from "node:path";

const ACTIONS = new Set(["inspect", "prepare", "apply", "verify", "rollback"]);
const args = process.argv.slice(2);
const manifestPath = resolve(option("manifest") || process.env.DGLAUNDRY_CONNECTION_MANIFEST || "docs/integrations/dglaundry-connection-manifest.json");
const action = args[0] || "inspect";
const environment = option("environment") || "staging";
const approvedEnvironmentTargets = {
  development: {
    issuer: "https://api.dev.dgfy.ph/oidc",
    partnerApiOrigin: "https://api.dev.dgfy.ph",
    staffOrigin: "https://laundry.surebizcorp.com",
    apiOrigin: "https://laundry.surebizcorp.com",
    callback: "https://laundry.surebizcorp.com/api/v1/session/dgfy/callback",
    storefrontOrigin: "https://dev.dgfy.ph"
  },
  staging: {
    issuer: "https://api.stage.dgfy.ph/oidc",
    partnerApiOrigin: "https://api.stage.dgfy.ph",
    staffOrigin: "https://dglaundry.stage.dgfy.ph",
    apiOrigin: "https://dglaundry.stage.dgfy.ph",
    callback: "https://dglaundry.stage.dgfy.ph/api/v1/session/dgfy/callback",
    storefrontOrigin: "https://stage.dgfy.ph"
  },
  production: {
    issuer: "https://api.dgfy.ph/oidc",
    partnerApiOrigin: "https://api.dgfy.ph",
    staffOrigin: "https://dglaundry.dgfy.ph",
    apiOrigin: "https://dglaundry.dgfy.ph",
    callback: "https://dglaundry.dgfy.ph/api/v1/session/dgfy/callback",
    storefrontOrigin: "https://dgfy.ph"
  }
};
const deployEnvironmentLabels = { development: "dev", staging: "staging", production: "prod" };
const configDir = option("config-dir") || process.env.DGLAUNDRY_CONNECTION_CONFIG_DIR || "";
// Optional: the host's actual Compose .env file (e.g. /opt/dgfy-stage/.env). When set, `apply`
// also merges its generated connection variables into this file, using the same preserve-unmanaged
// merge as the connection-env file itself. This closes the drift that caused dgfy-api to crash-loop
// after an ordinary promotion restart (#2303) -- the standard deploy path only ever passes
// `--env-file .env`, never the separate connection-env file, so without this the two files silently
// diverge the next time `apply` runs (e.g. a future key rotation) even though this run's fix is
// already live on the host.
const composeEnvFile = option("compose-env-file") || process.env.DGLAUNDRY_CONNECTION_COMPOSE_ENV_FILE || "";
const composeEnvPath = composeEnvFile ? resolve(composeEnvFile) : null;

if (!ACTIONS.has(action)) fail("SETUP_ACTION_INVALID", `Use one of: ${[...ACTIONS].join(", ")}`);
if (!["development", "staging", "production"].includes(environment)) fail("SETUP_ENVIRONMENT_INVALID", "Use development, staging, or production.");
if (environment === "production" && ["prepare", "apply", "rollback"].includes(action)) fail("PRODUCTION_APPLY_FORBIDDEN", "This package can prepare, apply, or roll back development and staging only.");

const manifest = await loadJson(manifestPath, "MANIFEST_UNREADABLE");
validateManifest(manifest);
const target = manifest.environments[environment];
const setupInputs = {
  browserClientId: String(process.env.DGFY_DGLAUNDRY_CLIENT_ID || "").trim(),
  machineClientId: String(process.env.DGFY_DGLAUNDRY_MACHINE_CLIENT_ID || "").trim(),
  serviceClientId: String(process.env.DGFY_DGLAUNDRY_SERVICE_CLIENT_ID || "").trim(),
  partnerAppId: String(process.env.DGFY_DGLAUNDRY_PARTNER_APP_ID || "").trim(),
  oidcKeyId: String(process.env.DGFY_OIDC_KEY_ID || "").trim(),
  eventKeyId: String(process.env.DGFY_DGLAUNDRY_EVENT_SIGNING_KEY_ID || "").trim(),
  requestKeyId: String(process.env.DGLAUNDRY_PARTNER_SIGNING_KEY_ID || "").trim(),
};
if (action === "prepare") {
  const missing = Object.entries(setupInputs).filter(([, value]) => !value).map(([name]) => name);
  if (missing.length) fail("REGISTRATION_IDS_REQUIRED", `Review all browser, machine, service-client, and key IDs before prepare. Missing: ${missing.join(", ")}.`);
  const invalid = Object.entries(setupInputs).filter(([name, value]) => ["browserClientId", "machineClientId", "serviceClientId"].includes(name)
    ? !/^[a-z][a-z0-9._:-]{2,80}$/.test(value)
    : name === "partnerAppId" ? !/^[a-z][a-z0-9-]{2,39}$/.test(value)
    : !/^[A-Za-z0-9._:-]{3,128}$/.test(value)).map(([name]) => name);
  if (invalid.length) fail("REGISTRATION_IDS_INVALID", `Registration IDs contain unsupported characters or lengths: ${invalid.join(", ")}.`);
  const expected = {
    browserClientId: target.dglaundryBrowserClientId,
    machineClientId: target.dglaundryMachineClientId,
    serviceClientId: target.dglaundryServiceClientId,
    partnerAppId: target.dglaundryPartnerAppId,
    oidcKeyId: target.keyIds.dgfyOidcSigning,
    eventKeyId: target.keyIds.dgfyEventSigning,
    requestKeyId: target.keyIds.dgfyRequestSigning
  };
  const mismatched = Object.entries(expected).filter(([name, value]) => setupInputs[name] !== value).map(([name]) => name);
  if (mismatched.length) fail("REGISTRATION_ID_MISMATCH", `Client IDs must match the reviewed manifest for this environment. Mismatched: ${mismatched.join(", ")}.`);
}
const root = configDir ? resolve(configDir) : null;
if (["prepare", "apply", "verify", "rollback"].includes(action) && !root) fail("CONFIG_DIR_REQUIRED", "Pass --config-dir to operate on the host configuration directory.");

const manifestDigest = digest(JSON.stringify(manifest));
const statePath = root && join(root, "dglaundry-connection-state.json");
const envPath = root && join(root, "dglaundry-connection.env");
const candidatePath = root && join(root, "dglaundry-connection.env.candidate");
let operationLockPath;
process.on("exit", () => { if (operationLockPath) { try { unlinkSync(operationLockPath); } catch { /* release an operation lock after normal exit */ } } });
if (root && ["prepare", "apply", "rollback"].includes(action)) {
  await mkdir(root, { recursive: true });
  const requestedLockPath = join(root, ".dglaundry-connection-setup.lock");
  try {
    await writeFile(requestedLockPath, JSON.stringify({ pid: process.pid, action, createdAt: new Date().toISOString() }) + "\n", { encoding: "utf8", mode: 0o600, flag: "wx" });
    operationLockPath = requestedLockPath;
  } catch { fail("OPERATION_IN_PROGRESS", "Another setup operation holds the configuration lock. Confirm it is no longer running before removing a stale lock."); }
}

if (action === "inspect") {
  const origins = environmentOrigins(manifest, target);
  const report = { action, environment, manifestVersion: manifest.manifestVersion, manifestSha256: manifestDigest, contractHashes: manifest.contractHashes, registrationStatus: target.registrationStatus, target: { issuer: target.issuer, partnerApiOrigin: target.partnerApiOrigin, apiOrigin: target.apiOrigin, storefrontOrigin: target.storefrontOrigin, staffOrigin: origins.staffOrigin, callback: origins.callback, paymentMode: target.paymentMode, clientIds: { browser: target.dglaundryBrowserClientId, machine: target.dglaundryMachineClientId, service: target.dglaundryServiceClientId, partnerApp: target.dglaundryPartnerAppId }, keyIds: target.keyIds }, configDir: root ? root : null, registrationInputsConfigured: Object.fromEntries(Object.entries(setupInputs).map(([name, value]) => [name, Boolean(value)])), prerequisites: { ...(await prerequisites(root)), browserClientSecretFile: root ? await privateFileReady(join(root, "dglaundry-oidc-client-secret")) : false }, privateValues: "not-read" };
  console.log(JSON.stringify(report, null, 2));
} else if (action === "prepare") {
  await mkdir(join(root, "keys"), { recursive: true });
  const generated = [];
  await ensureKey(root, manifest.keyRoles.oidcSigning, "rsa", generated);
  await ensureKey(root, manifest.keyRoles.dgfyEventSigning, "ed25519", generated);
  await ensureKey(root, manifest.keyRoles.dgfyRequestSigning, "ec", generated);
  await ensureExternalPublicKey(root, manifest.keyRoles.dglaundryMachineAssertion);
  await ensureExternalPublicKey(root, manifest.keyRoles.dglaundryRequestSigning);
  await ensureExternalPublicKey(root, manifest.keyRoles.dglaundryEventSigning);
  const previous = await readManagedEnv(envPath);
  const generatedEnv = await renderEnv(root, manifest, target, previous);
  const managedKeys = [...new Set([...String(generatedEnv).split(/\r?\n/).filter(Boolean).map((line) => line.slice(0, line.indexOf("="))), "DGFY_OIDC_JWKS_KEYS_JSON"])];
  const candidateWithPreserved = mergeEnv(previous, generatedEnv);
  const previousExisted = await exists(envPath);
  const candidateSha256 = digest(candidateWithPreserved);
  const existingState = await loadState();
  const alreadyApplied = existingState?.status === "applied"
    && existingState.environment === environment
    && existingState.manifestSha256 === manifestDigest
    && existingState.envSha256 === digest(previous)
    && candidateSha256 === digest(previous);
  if (existingState?.status === "applying") fail("INTERRUPTED_APPLY_RECOVERY_REQUIRED", "An earlier apply was interrupted; rerun apply to recover its recorded transaction before preparing again.");
  if (!alreadyApplied) {
    await writeAtomic(candidatePath, candidateWithPreserved, 0o600);
    await writeState({ status: "prepared", environment, manifestSha256: manifestDigest, generated, registrationIds: setupInputs, managedKeys, candidateSha256, previousSha256: digest(previous), previousExisted, previous: null });
  }
  console.log(JSON.stringify({ action, environment, manifestSha256: manifestDigest, generated, publicKeys: await publicKeyMetadata(root, manifest, target), candidate: "dglaundry-connection.env.candidate", preservedUnmanagedSettings: true, alreadyApplied, privateValues: "not-reported" }, null, 2));
} else if (action === "apply") {
  if (!args.includes("--confirm")) fail("APPLY_CONFIRMATION_REQUIRED", "Re-run apply with --confirm after reviewing the prepared configuration.");
  if (target.registrationStatus !== "registered" || !String(target.registrationEvidence || "").trim()) fail("PROVIDER_REGISTRATION_UNCONFIRMED", `${environment} apply is blocked until DGFY records the registered client identities and evidence in the reviewed manifest.`);
  if (!(await privateFileReady(join(root, "dglaundry-oidc-client-secret")))) fail("BROWSER_CLIENT_SECRET_REQUIRED", "Install the browser-client secret through the approved secret manager with owner-only file permissions before apply.");
  for (const role of Object.keys(manifest.keyRoles)) {
    if (!/^[a-f0-9]{64}$/i.test(String(target.keyFingerprintsSha256[role] || ""))) fail("PUBLIC_KEY_FINGERPRINT_REQUIRED", `${environment} apply is blocked until the reviewed manifest records the ${role} public-key fingerprint.`);
  }
  const prepared = await loadState();
  if (!prepared || prepared.manifestSha256 !== manifestDigest || prepared.environment !== environment || !["prepared", "applying", "applied"].includes(prepared.status)) fail("PREPARED_STATE_INVALID", "Run prepare and review its manifest-bound output first.");
  if (!Array.isArray(prepared.managedKeys)) fail("PREPARED_STATE_INVALID", "The prepared state does not record its managed key set; run prepare again.");
  await ensureFile(candidatePath, "PREPARED_CONFIGURATION_MISSING");
  const candidate = await readText(candidatePath);
  if (digest(candidate) !== prepared.candidateSha256) fail("PREPARED_CONFIGURATION_CHANGED", "The prepared configuration changed after review; run prepare again.");
  let composeEnvSync = prepared.composeEnvSync || null;
  if (composeEnvPath) {
    if (composeEnvSync && composeEnvSync.path !== composeEnvPath) fail("COMPOSE_ENV_FILE_MISMATCH", "The prepared transaction is bound to a different --compose-env-file path.");
    if (!composeEnvSync) {
      if (prepared.status === "applied") fail("COMPOSE_ENV_ROLLBACK_STATE_MISSING", "This applied state predates Compose rollback tracking; run prepare again before synchronizing another Compose env file.");
      composeEnvSync = await prepareComposeEnvSync(composeEnvPath, candidate, prepared.managedKeys);
    }
  }
  const previous = await readManagedEnv(envPath);
  const currentExisted = await exists(envPath);
  if (prepared.status === "applied") {
    if (currentExisted && digest(previous) === prepared.envSha256 && digest(candidate) === prepared.envSha256) {
      if (composeEnvSync) {
        await syncComposeEnv(composeEnvSync, candidate);
        if (composeEnvSync.status !== "applied") await writeState({ ...prepared, composeEnvSync: { ...composeEnvSync, status: "applied" } });
      }
      console.log(JSON.stringify({ action, environment, status: "already-applied", manifestSha256: manifestDigest, composeEnvFile: composeEnvSync?.path || null, composeEnvSynced: Boolean(composeEnvSync), privateValues: "not-reported" }, null, 2));
      exitSetup();
    }
    fail("APPLIED_CONFIGURATION_DRIFT", "The applied configuration changed after success; inspect the diff and prepare a new reviewed change.");
  }
  const isAlreadyApplied = prepared.status === "applying" && currentExisted && digest(previous) === prepared.candidateSha256;
  if (isAlreadyApplied) {
    const applied = { ...prepared, status: "applied", envSha256: prepared.candidateSha256, recoveredAfterInterruptedApply: true };
    await writeState(applied);
    if (composeEnvSync) {
      await syncComposeEnv(composeEnvSync, candidate);
      await writeState({ ...applied, composeEnvSync: { ...composeEnvSync, status: "applied" } });
    }
    console.log(JSON.stringify({ action, environment, status: "applied", recoveredAfterInterruptedApply: true, manifestSha256: manifestDigest, composeEnvFile: composeEnvSync?.path || null, composeEnvSynced: Boolean(composeEnvSync), privateValues: "not-reported" }, null, 2));
    exitSetup();
  }
  if (prepared.status === "prepared" && (currentExisted !== Boolean(prepared.previousExisted) || digest(previous) !== prepared.previousSha256)) fail("APPLIED_CONFIGURATION_DRIFT", "The managed configuration changed after prepare; inspect the difference and prepare again.");
  if (prepared.status === "applying" && (currentExisted !== Boolean(prepared.previousExisted) || digest(previous) !== prepared.previousSha256)) fail("APPLIED_CONFIGURATION_DRIFT", "The managed configuration differs from both the prepared and applied state; refusing automatic recovery.");
  let applying;
  if (prepared.status === "applying") {
    if (prepared.previous === "absent") {
      if (prepared.previousExisted || prepared.previousSha256 !== digest("")) fail("ROLLBACK_SNAPSHOT_INVALID", "The interrupted apply has an invalid absent-file snapshot.");
    } else {
      if (!/^dglaundry-connection\.env\.previous\.[0-9a-f-]{36}$/i.test(String(prepared.previous || ""))) fail("ROLLBACK_SNAPSHOT_INVALID", "The interrupted apply has no valid rollback snapshot reference.");
      const snapshot = await readManagedEnv(join(root, prepared.previous));
      if (digest(snapshot) !== prepared.previousSha256) fail("ROLLBACK_SNAPSHOT_INVALID", "The interrupted apply rollback snapshot changed; refusing recovery.");
    }
    applying = { ...prepared, ...(composeEnvSync ? { composeEnvSync: { ...composeEnvSync, status: "prepared" } } : {}) };
  } else {
    let previousReference = "absent";
    if (currentExisted) {
      previousReference = `dglaundry-connection.env.previous.${randomUUID()}`;
      await writeAtomic(join(root, previousReference), previous, 0o600);
    }
    applying = { ...prepared, ...(composeEnvSync ? { composeEnvSync: { ...composeEnvSync, status: "prepared" } } : {}), status: "applying", previous: previousReference, previousSha256: digest(previous), previousExisted: currentExisted };
  }
  await writeState(applying);
  await writeAtomic(envPath, candidate, 0o600);
  let applied = { ...applying, status: "applied", envSha256: digest(candidate) };
  await writeState(applied);
  if (composeEnvSync) {
    await syncComposeEnv(composeEnvSync, candidate);
    applied = { ...applied, composeEnvSync: { ...composeEnvSync, status: "applied" } };
    await writeState(applied);
  }
  console.log(JSON.stringify({ action, environment, status: "applied", manifestSha256: manifestDigest, previous: applied.previous, composeEnvFile: composeEnvSync?.path || null, composeEnvSynced: Boolean(composeEnvSync), privateValues: "not-reported" }, null, 2));
} else if (action === "verify") {
  const state = await loadState();
  const appliedEnv = await readText(envPath);
  const checks = [];
  checks.push(check("state", Boolean(state && state.status === "applied" && state.environment === environment && state.manifestSha256 === manifestDigest)));
  checks.push(check("browser-client-secret-file", await privateFileReady(join(root, "dglaundry-oidc-client-secret"))));
  checks.push(check("provider-registration-evidence", target.registrationStatus === "registered" && Boolean(String(target.registrationEvidence || "").trim())));
  checks.push(check("configuration", Boolean(root && await exists(envPath))));
  checks.push(check("configuration-digest", Boolean(state?.envSha256 && digest(appliedEnv) === state.envSha256)));
  if (state?.composeEnvSync) checks.push(check("compose-env-sync", await composeEnvMatches(state.composeEnvSync)));
  const expectedPaymentMode = target.paymentMode === "sandbox" ? "test" : "live";
  checks.push(check("hosted-runtime-and-payment-mode", envValue(appliedEnv, "DGLAUNDRY_INTEGRATION_ENABLED") === "true"
    && envValue(appliedEnv, "NODE_ENV") === "production"
    && envValue(appliedEnv, "DEPLOY_ENV_LABEL") === deployEnvironmentLabels[environment]
    && envValue(appliedEnv, "PAYMONGO_MODE") === expectedPaymentMode));
  checks.push(check("issuer-and-callback", envValue(appliedEnv, "DGFY_OIDC_ISSUER") === target.issuer
    && envValue(appliedEnv, "DGFY_DGLAUNDRY_REDIRECT_URI") === target.callback));
  checks.push(check("connection-environment", envValue(appliedEnv, "DGLAUNDRY_CONNECTION_ENVIRONMENT") === environment
    && envValue(appliedEnv, "DGLAUNDRY_CONNECTION_CONFIG_DIR") === root
    && envValue(appliedEnv, "DGLAUNDRY_CONNECTION_SECRET_SOURCE_DIR") === "/run/dgfy-connection-source"));
  checks.push(check("client-registration-ids", Boolean(state?.registrationIds
    && envValue(appliedEnv, "DGFY_DGLAUNDRY_CLIENT_ID") === state.registrationIds.browserClientId
    && envValue(appliedEnv, "DGFY_DGLAUNDRY_MACHINE_CLIENT_ID") === state.registrationIds.machineClientId
    && envValue(appliedEnv, "DGFY_DGLAUNDRY_SERVICE_CLIENT_ID") === state.registrationIds.serviceClientId)));
  checks.push(check("partner-app-id", Boolean(state?.registrationIds
    && envValue(appliedEnv, "DGFY_DGLAUNDRY_PARTNER_APP_ID") === state.registrationIds.partnerAppId)));
  checks.push(check("machine-client-public-key", envValue(appliedEnv, "DGFY_DGLAUNDRY_MACHINE_CLIENT_PUBLIC_KEY_FILE") === "/run/dgfy-secrets/dglaundry-machine-assertion.pub.pem" && await keyHealthy(join(root, manifest.keyRoles.dglaundryMachineAssertion.publicFile), "RS256")));
  checks.push(check("request-verification-key", envValue(appliedEnv, "DGLAUNDRY_PARTNER_REQUEST_PUBLIC_KEY_FILE") === "/run/dgfy-secrets/dglaundry-request-signing.pub.pem" && await keyHealthy(join(root, manifest.keyRoles.dglaundryRequestSigning.publicFile), "P-256 ieee-p1363")));
  checks.push(check("event-verification-key-registry", await eventRegistryMatches(appliedEnv, join(root, manifest.keyRoles.dglaundryEventSigning.publicFile), target.keyIds.dglaundryEventSigning)));
  checks.push(check("oidc-legacy-key-fallback", await oidcLegacyKeyMatches(appliedEnv, join(root, manifest.keyRoles.oidcSigning.publicFile), state?.registrationIds?.oidcKeyId)));
  checks.push(check("signing-key-ids", Boolean(state?.registrationIds
    && envValue(appliedEnv, "DGFY_OIDC_KEY_ID") === state.registrationIds.oidcKeyId
    && envValue(appliedEnv, "DGFY_DGLAUNDRY_EVENT_SIGNING_KEY_ID") === state.registrationIds.eventKeyId
    && envValue(appliedEnv, "DGLAUNDRY_PARTNER_SIGNING_KEY_ID") === state.registrationIds.requestKeyId)));
  checks.push(check("partner-origin-and-audience", envValue(appliedEnv, "DGLAUNDRY_PARTNER_BASE_URL") === environmentOrigins(manifest, target).staffOrigin && envValue(appliedEnv, "DGLAUNDRY_PARTNER_AUDIENCE") === new URL(environmentOrigins(manifest, target).staffOrigin).origin));
  checks.push(check("integration-environment-and-signature-profile", envValue(appliedEnv, "DGLAUNDRY_INTEGRATION_ENVIRONMENT") === environment && envValue(appliedEnv, "DGLAUNDRY_SIGNATURE_PROFILE") === "http-message-signatures-v1"));
  for (const [name, role] of Object.entries(manifest.keyRoles)) {
    const file = join(root, role.owner === "dgfy" ? role.privateFile : role.publicFile);
    checks.push(check(`key:${name}`, await keyHealthy(file, role.algorithm)));
    if (role.owner === "dgfy") {
      checks.push(check(`key-pair:${name}`, await keyPairMatches(file, join(root, role.publicFile))));
    }
    checks.push(check(`fingerprint:${name}`, await keyFingerprintMatches(join(root, role.publicFile), target.keyFingerprintsSha256[name])));
  }
  const passed = checks.every((item) => item.passed);
  console.log(JSON.stringify({ action, environment, manifestSha256: manifestDigest, passed, checks, privateValues: "not-read" }, null, 2));
  if (!passed) process.exitCode = 2;
} else {
  let state = await loadState();
  if (!state || state.status !== "applied" || !Object.hasOwn(state, "previous")) fail("ROLLBACK_UNAVAILABLE", "No applied configuration snapshot is recorded for rollback.");
  if (state.composeEnvSync && state.composeEnvSync.status !== "rolled-back") {
    await restoreComposeEnv(state.composeEnvSync);
    state = { ...state, composeEnvSync: { ...state.composeEnvSync, status: "rolled-back" } };
    await writeState(state);
  }
  const current = await readManagedEnv(envPath);
  const currentExisted = await exists(envPath);
  const alreadyRestored = state.previous === "absent" ? !currentExisted && state.previousSha256 === digest("") : currentExisted && digest(current) === state.previousSha256;
  if (!alreadyRestored) {
    if (!currentExisted || digest(current) !== state.envSha256) fail("APPLIED_CONFIGURATION_DRIFT", "The managed configuration changed after apply; refusing to overwrite it during rollback.");
    if (state.previous === "absent") {
      if (state.previousSha256 !== digest("")) fail("ROLLBACK_SNAPSHOT_INVALID", "The recorded empty configuration state is invalid.");
      await unlink(envPath);
    } else {
      if (!/^dglaundry-connection\.env\.previous\.[0-9a-f-]{36}$/i.test(state.previous)) fail("ROLLBACK_SNAPSHOT_INVALID", "The recorded rollback snapshot name is invalid.");
      const snapshot = await readManagedEnv(join(root, state.previous));
      if (digest(snapshot) !== state.previousSha256) fail("ROLLBACK_SNAPSHOT_INVALID", "The saved previous configuration changed; refusing rollback.");
      await writeAtomic(envPath, snapshot, 0o600);
    }
  }
  await writeState({ ...state, status: "rolled-back", rolledBackAt: new Date().toISOString() });
  console.log(JSON.stringify({ action, environment, status: "rolled-back", restored: state.previous, privateValues: "not-reported" }, null, 2));
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
async function privateFileReady(file) {
  try {
    const fileStat = await stat(file);
    return fileStat.isFile() && fileStat.size > 0 && (process.platform === "win32" || (fileStat.mode & 0o077) === 0);
  } catch { return false; }
}
async function ensureFile(file, code) { if (!(await exists(file))) fail(code, "Run prepare before apply."); }
async function loadState() { if (!statePath) return null; try { return JSON.parse(await readFile(statePath, "utf8")); } catch { return null; } }
async function writeState(value) { await writeAtomic(statePath, JSON.stringify(value, null, 2) + "\n", 0o600); }
function digest(value) { return createHash("sha256").update(value).digest("hex"); }
function mergeEnv(previous, generated) {
  const generatedLines = String(generated || "").split(/\r?\n/).filter(Boolean);
  const managed = new Set(generatedLines.map((line) => line.slice(0, line.indexOf("="))));
  const retired = new Set(["DGFY_OIDC_JWKS_KEYS_JSON"]);
  const seenManaged = new Set();
  const preserved = [];
  for (const line of String(previous || "").split(/\r?\n/)) {
    const match = line.match(/^([A-Za-z_][A-Za-z0-9_]*)=/);
    if (match && retired.has(match[1])) continue;
    if (match && managed.has(match[1])) {
      if (seenManaged.has(match[1])) fail("MANAGED_CONFIGURATION_AMBIGUOUS", `The existing managed configuration defines ${match[1]} more than once.`);
      seenManaged.add(match[1]);
      continue;
    }
    preserved.push(line);
  }
  const kept = preserved.join("\n").replace(/\n+$/, "");
  return (kept ? `${kept}\n` : "") + generatedLines.join("\n") + "\n";
}
async function prepareComposeEnvSync(targetPath, candidate, managedKeyNames) {
  if (!(await exists(targetPath))) fail("COMPOSE_ENV_FILE_MISSING", `--compose-env-file does not exist: ${targetPath}. Refusing to create the deploy-owned Compose environment file from scratch.`);
  const existingMode = (await stat(targetPath)).mode & 0o777;
  const existing = await readManagedEnv(targetPath);
  const managedNames = [...new Set(managedKeyNames)];
  const managed = new Set(managedNames);
  const generatedLines = String(candidate || "").split(/\r?\n/).filter((line) => {
    const match = line.match(/^([A-Za-z_][A-Za-z0-9_]*)=/);
    return match && managed.has(match[1]);
  });
  const generated = generatedLines.join("\n") + (generatedLines.length ? "\n" : "");
  const previousManagedLines = [];
  const seen = new Set();
  for (const line of String(existing || "").split(/\r?\n/)) {
    const match = line.match(/^([A-Za-z_][A-Za-z0-9_]*)=/);
    if (!match || !managed.has(match[1])) continue;
    if (seen.has(match[1])) fail("MANAGED_CONFIGURATION_AMBIGUOUS", `The existing Compose environment defines ${match[1]} more than once.`);
    seen.add(match[1]);
    if (/(?:SECRET|TOKEN|PRIVATE_KEY)/i.test(match[1]) && !match[1].endsWith("_FILE") && line.slice(match[0].length).trim()) {
      fail("COMPOSE_ENV_SECRET_SOURCE_UNSAFE", `The existing Compose environment stores ${match[1]} inline; move it through the approved secret manager before synchronizing connection settings.`);
    }
    previousManagedLines.push(line);
  }
  const merged = mergeEnv(existing, generated);
  const rollback = restoreManagedEnv(merged, managed, previousManagedLines);
  return {
    path: targetPath,
    mode: existingMode,
    managedNames,
    previousManagedLines,
    previousSha256: digest(existing),
    appliedSha256: digest(merged),
    rollbackSha256: digest(rollback)
  };
}
async function syncComposeEnv(snapshot, candidate) {
  if (!(await exists(snapshot.path))) fail("COMPOSE_ENV_FILE_MISSING", `--compose-env-file does not exist: ${snapshot.path}. Refusing to create the deploy-owned Compose environment file from scratch.`);
  const existing = await readManagedEnv(snapshot.path);
  const currentDigest = digest(existing);
  if (currentDigest === snapshot.appliedSha256) return true;
  if (currentDigest !== snapshot.previousSha256) fail("COMPOSE_ENV_DRIFT", "The Compose environment changed after prepare/apply; refusing to overwrite it.");
  const generatedLines = String(candidate || "").split(/\r?\n/).filter((line) => {
    const match = line.match(/^([A-Za-z_][A-Za-z0-9_]*)=/);
    return match && snapshot.managedNames.includes(match[1]);
  });
  const generated = generatedLines.join("\n") + (generatedLines.length ? "\n" : "");
  const merged = mergeEnv(existing, generated);
  if (digest(merged) !== snapshot.appliedSha256) fail("COMPOSE_ENV_CANDIDATE_CHANGED", "The Compose environment candidate differs from its prepared rollback record.");
  await writeAtomic(snapshot.path, merged, snapshot.mode);
  return true;
}
async function restoreComposeEnv(snapshot) {
  if (!(await exists(snapshot.path))) fail("COMPOSE_ENV_FILE_MISSING", `The recorded Compose environment is missing: ${snapshot.path}.`);
  const current = await readManagedEnv(snapshot.path);
  const currentDigest = digest(current);
  if (currentDigest === snapshot.rollbackSha256) return true;
  if (currentDigest !== snapshot.appliedSha256) fail("COMPOSE_ENV_DRIFT", "The Compose environment changed after apply; refusing to overwrite it during rollback.");
  const restored = restoreManagedEnv(current, new Set(snapshot.managedNames), snapshot.previousManagedLines);
  if (digest(restored) !== snapshot.rollbackSha256) fail("COMPOSE_ENV_ROLLBACK_STATE_INVALID", "The recorded Compose rollback values do not match their reviewed digest.");
  await writeAtomic(snapshot.path, restored, snapshot.mode);
  return true;
}
async function composeEnvMatches(snapshot) {
  if (snapshot.status !== "applied" || !(await exists(snapshot.path))) return false;
  return digest(await readManagedEnv(snapshot.path)) === snapshot.appliedSha256;
}
function restoreManagedEnv(source, managed, replacementLines) {
  const preserved = [];
  for (const line of String(source || "").split(/\r?\n/)) {
    const match = line.match(/^([A-Za-z_][A-Za-z0-9_]*)=/);
    if (match && managed.has(match[1])) continue;
    preserved.push(line);
  }
  const kept = preserved.join("\n").replace(/\n+$/, "");
  const restored = (kept ? `${kept}\n` : "") + replacementLines.join("\n");
  return restored ? `${restored}\n` : "";
}
function envValue(source, name) {
  const prefix = `${name}=`;
  const line = String(source || "").split(/\r?\n/).find((entry) => entry.startsWith(prefix));
  return line ? line.slice(prefix.length).trim() : "";
}
function check(name, passed) { return { name, passed: Boolean(passed) }; }
// Per-environment origins (#2513). An environment entry may carry its own staffOrigin/callback; a manifest
// that predates them (the hand-managed v1.1.0 copies on the hosts) falls back to the top-level pair, which
// is the DGFY DEV / Surebiz demo target.
function environmentOrigins(value, entry) {
  // Presence, not truthiness: a blank or null per-environment value must fail validation, never fall back.
  const pick = (key) => (entry && Object.hasOwn(entry, key) ? entry[key] : value[key]);
  return { staffOrigin: pick("staffOrigin"), callback: pick("callback") };
}
function exitSetup() { if (operationLockPath) { try { unlinkSync(operationLockPath); } catch { /* exit handler retries lock cleanup */ } operationLockPath = undefined; } }
function validateManifest(value) {
  const requiredHashes = ["dgfyPartnerContractSha256", "dgfyPartnerOpenApiSha256", "dglaundryPartnerOpenApiSha256", "dglaundryConnectionFixtureSha256", "dglaundryIntegrationContractSha256"];
  if (!value || value.manifestVersion !== "1.2.0" || !value.contractVersion || !value.environments?.development || !value.environments?.staging || !value.environments?.production || !value.keyRoles || !requiredHashes.every((name) => /^[a-f0-9]{64}$/.test(String(value.contractHashes?.[name] || "")))) fail("MANIFEST_INVALID", "The v1.2 manifest must include development, staging, and production registrations, key roles, and SHA-256 contract hashes.");
  for (const name of ["development", "staging", "production"]) {
    const entry = value.environments[name];
    const approved = approvedEnvironmentTargets[name];
    if (!entry?.issuer || !entry?.partnerApiOrigin || !entry?.staffOrigin || !entry?.apiOrigin || !entry?.callback || !entry?.storefrontOrigin
      || !entry?.dglaundryBrowserClientId || !entry?.dglaundryMachineClientId || !entry?.dglaundryServiceClientId || !entry?.dglaundryPartnerAppId
      || !["proposed", "registered", "not-authorized"].includes(entry?.registrationStatus)
      || !entry?.keyIds || !entry?.keyFingerprintsSha256) fail("MANIFEST_INVALID", `The ${name} environment is missing explicit origins, client identities, registration status, or key evidence fields.`);
    if (["issuer", "partnerApiOrigin", "staffOrigin", "apiOrigin", "callback", "storefrontOrigin"].some((field) => entry[field] !== approved[field])) fail("MANIFEST_ENVIRONMENT_TARGET_INVALID", `The ${name} environment must use its approved DGFY and DGLaundry endpoint tuple.`);
    for (const [label, raw] of [["staffOrigin", entry.staffOrigin], ["apiOrigin", entry.apiOrigin], ["partnerApiOrigin", entry.partnerApiOrigin], ["storefrontOrigin", entry.storefrontOrigin]]) {
      try {
        const url = new URL(raw);
        if (url.protocol !== "https:" || url.origin !== raw) throw new Error();
      } catch { fail("MANIFEST_ENDPOINT_INVALID", `The ${name} ${label} must be an exact HTTPS origin.`); }
    }
    let callback;
    try { callback = new URL(entry.callback); }
    catch { fail("CALLBACK_INVALID", `The ${name} callback must be an absolute HTTPS URL.`); }
    if (callback.protocol !== "https:" || callback.origin !== entry.staffOrigin || callback.pathname !== "/api/v1/session/dgfy/callback" || callback.search || callback.hash || callback.username || callback.password) fail("CALLBACK_INVALID", `The ${name} callback must use its exact HTTPS staff origin and approved callback path.`);
    if (entry.apiOrigin !== entry.staffOrigin) fail("INBOUND_AUDIENCE_INVALID", `The ${name} API and staff origins must match for this DGLaundry deployment.`);
    try {
      if (new URL(entry.partnerApiOrigin).origin !== new URL(entry.issuer).origin) throw new Error();
    } catch { fail("PARTNER_API_ORIGIN_INVALID", `The ${name} partner API origin must match its OIDC issuer origin.`); }
    for (const role of ["dglaundryMachineAssertion", "dglaundryRequestSigning", "dglaundryEventSigning", "dgfyOidcSigning", "dgfyRequestSigning", "dgfyEventSigning"]) {
      if (!/^[A-Za-z0-9._:-]{3,96}$/.test(String(entry.keyIds[role] || ""))) fail("MANIFEST_KEY_ID_INVALID", `The ${name} environment is missing a valid ${role} key ID.`);
      const fingerprint = String(entry.keyFingerprintsSha256[role] || "");
      if (fingerprint && !/^[a-f0-9]{64}$/i.test(fingerprint)) fail("MANIFEST_KEY_FINGERPRINT_INVALID", `The ${name} environment has an invalid ${role} SHA-256 fingerprint.`);
    }
  }
  const development = value.environments.development;
  if (development.dglaundryBrowserClientId !== "dglaundry-web-dev" || development.dglaundryMachineClientId !== "dglaundry-machine-dev" || development.dglaundryServiceClientId !== "dglaundry-service-dev" || development.dglaundryPartnerAppId !== "dglaundry") fail("DEVELOPMENT_REGISTRATION_INVALID", "Development must use its separate browser, machine, and service client IDs and the existing DGLaundry app ID.");
  for (const field of ["dglaundryBrowserClientId", "dglaundryMachineClientId", "dglaundryServiceClientId"]) {
    if ([value.environments.staging, value.environments.production].some((entry) => entry[field] === development[field])) fail("DEVELOPMENT_REGISTRATION_REUSED", `The development ${field} must not reuse a staging or production registration.`);
  }
  for (const role of Object.keys(development.keyIds)) {
    if ([value.environments.staging, value.environments.production].some((entry) => entry.keyIds[role] === development.keyIds[role])) fail("DEVELOPMENT_KEY_ID_REUSED", `The development ${role} key ID must be independent from staging and production.`);
  }
  if (development.registrationStatus === "proposed"
    && (String(development.registrationEvidence || "").trim() || Object.values(development.keyFingerprintsSha256).some((fingerprint) => String(fingerprint || "").trim()))) {
    fail("DEVELOPMENT_PROOF_PREMATURE", "Proposed development registration must not claim registration evidence or installed-key fingerprints.");
  }
  if (value.environments.development.paymentMode !== "sandbox") fail("DEVELOPMENT_PAYMENT_MODE_INVALID", "Development must use sandbox payments.");
  if (value.environments.staging.paymentMode !== "sandbox") fail("STAGING_PAYMENT_MODE_INVALID", "Staging must use sandbox payments.");
  for (const name of ["staging", "production"]) {
    const { staffOrigin, callback } = environmentOrigins(value, value.environments[name]);
    let origin;
    try { origin = new URL(staffOrigin); } catch { fail("CALLBACK_INVALID", `The ${name} staffOrigin must be an absolute URL.`); }
    // The callback is compared as an exact string because renderEnv writes the raw value into
    // DGFY_DGLAUNDRY_REDIRECT_URI, which DGFY's boot validator also pins by exact string.
    if (origin.protocol !== "https:" || origin.origin !== staffOrigin || callback !== `${staffOrigin}/api/v1/session/dgfy/callback`) fail("CALLBACK_INVALID", `The ${name} callback must be exactly <staffOrigin>/api/v1/session/dgfy/callback over HTTPS.`);
  }
  if (value.environments.production.paymentMode !== "live-authorized-separately") fail("PRODUCTION_PAYMENT_MODE_INVALID", "Production payment activation requires its separate authorization.");
}
async function prerequisites(rootDir) {
  const output = { configDirectory: rootDir ? await exists(rootDir) : false, manifest: true, registrations: Object.fromEntries(Object.entries(setupInputs).map(([name, value]) => [name, Boolean(value)])), keys: {} };
  if (rootDir) for (const [name, role] of Object.entries(manifest.keyRoles)) output.keys[name] = await exists(join(rootDir, role.owner === "dgfy" ? role.privateFile : role.publicFile));
  return output;
}
async function renderEnv(rootDir, value, targetConfig, previousEnv) {
  const eventKeys = await renderDglaundryEventRegistry(rootDir, value, targetConfig, previousEnv);
  const deployEnvironmentLabel = deployEnvironmentLabels[environment];
  const paymentMode = targetConfig.paymentMode === "sandbox" ? "test" : "live";
  const lines = [
    `DGLAUNDRY_CONNECTION_CONFIG_DIR=${rootDir}`,
    "DGLAUNDRY_CONNECTION_SECRET_SOURCE_DIR=/run/dgfy-connection-source",
    "DGLAUNDRY_INTEGRATION_ENABLED=true",
    "NODE_ENV=production",
    `DEPLOY_ENV_LABEL=${deployEnvironmentLabel}`,
    `PAYMONGO_MODE=${paymentMode}`,
    `DGLAUNDRY_CONNECTION_MANIFEST_SHA256=${manifestDigest}`,
    `DGLAUNDRY_CONNECTION_ENVIRONMENT=${environment}`,
    `DGFY_OIDC_ISSUER=${targetConfig.issuer}`,
    `DGFY_DGLAUNDRY_REDIRECT_URI=${environmentOrigins(value, targetConfig).callback}`,
    `DGFY_DGLAUNDRY_POST_LOGOUT_REDIRECT_URI=${process.env.DGFY_DGLAUNDRY_POST_LOGOUT_REDIRECT_URI || ""}`,
    `DGFY_DGLAUNDRY_EVENT_SIGNING_KEY_ID=${setupInputs.eventKeyId}`,
    "DGFY_DGLAUNDRY_EVENT_SIGNING_PRIVATE_KEY_FILE=/run/dgfy-secrets/dgfy-event-signing.pem",
    "DGFY_OIDC_PRIVATE_KEY_FILE=/run/dgfy-secrets/dgfy-oidc-private.pem",
    "DGFY_OIDC_PUBLIC_KEY_FILE=/run/dgfy-secrets/dgfy-oidc-public.pem",
    `DGFY_OIDC_KEY_ID=${setupInputs.oidcKeyId}`,
    `DGFY_DGLAUNDRY_CLIENT_ID=${setupInputs.browserClientId}`,
    "DGFY_DGLAUNDRY_CLIENT_SECRET_FILE=/run/dgfy-secrets/dglaundry-oidc-client-secret",
    `DGFY_DGLAUNDRY_MACHINE_CLIENT_ID=${setupInputs.machineClientId}`,
    "DGFY_DGLAUNDRY_MACHINE_CLIENT_PUBLIC_KEY_FILE=/run/dgfy-secrets/dglaundry-machine-assertion.pub.pem",
    `DGFY_DGLAUNDRY_SERVICE_CLIENT_ID=${setupInputs.serviceClientId}`,
    `DGFY_DGLAUNDRY_PARTNER_APP_ID=${targetConfig.dglaundryPartnerAppId}`,
    `DGLAUNDRY_INTEGRATION_PUBLIC_KEYS_JSON=${JSON.stringify(eventKeys)}`,
    `DGLAUNDRY_INTEGRATION_KEY_ID=${targetConfig.keyIds.dglaundryEventSigning}`,
    "DGLAUNDRY_PARTNER_REQUEST_PUBLIC_KEY_FILE=/run/dgfy-secrets/dglaundry-request-signing.pub.pem",
    `DGLAUNDRY_PARTNER_REQUEST_KEY_ID=${targetConfig.keyIds.dglaundryRequestSigning}`,
    `DGLAUNDRY_INTEGRATION_ENVIRONMENT=${environment}`,
    `DGLAUNDRY_PARTNER_BASE_URL=${environmentOrigins(value, targetConfig).staffOrigin}`,
    `DGLAUNDRY_PARTNER_AUDIENCE=${new URL(environmentOrigins(value, targetConfig).staffOrigin).origin}`,
    `DGLAUNDRY_SIGNATURE_PROFILE=http-message-signatures-v1`,
    "DGLAUNDRY_PARTNER_SIGNING_PRIVATE_KEY_FILE=/run/dgfy-secrets/dgfy-request-signing.pem",
    `DGLAUNDRY_PARTNER_SIGNING_KEY_ID=${setupInputs.requestKeyId}`,
    `DGLAUNDRY_PARTNER_CONTRACT_VERSION=${value.contractVersion}`,
    "DGLAUNDRY_CONNECTION_PRIVATE_VALUES=secret-manager-only",
  ];
  return lines.join("\n") + "\n";
}
async function renderDglaundryEventRegistry(rootDir, value, targetConfig, previousEnv) {
  const priorRaw = envValue(previousEnv, "DGLAUNDRY_INTEGRATION_PUBLIC_KEYS_JSON");
  let registry = {};
  if (priorRaw) {
    try { registry = JSON.parse(priorRaw); }
    catch { fail("DGLAUNDRY_EVENT_KEY_REGISTRY_INVALID", "The existing public DGLaundry event key registry is not valid JSON; refusing to replace it."); }
    if (!registry || typeof registry !== "object" || Array.isArray(registry) || Object.values(registry).some((pem) => typeof pem !== "string")) fail("DGLAUNDRY_EVENT_KEY_REGISTRY_INVALID", "The existing public DGLaundry event key registry must be a key-ID-to-public-PEM map.");
  }
  for (const [kid, pem] of Object.entries(registry)) {
    if (!/^[A-Za-z0-9._:-]{3,96}$/.test(kid)) fail("DGLAUNDRY_EVENT_KEY_REGISTRY_INVALID", "The existing DGLaundry event registry has an invalid key ID.");
    try { if (createPublicKey(pem).asymmetricKeyType !== "ed25519") throw new Error(); }
    catch { fail("DGLAUNDRY_EVENT_KEY_REGISTRY_INVALID", "The existing DGLaundry event registry must contain public Ed25519 keys only."); }
  }
  const activeKid = targetConfig.keyIds.dglaundryEventSigning;
  const activePath = join(rootDir, value.keyRoles.dglaundryEventSigning.publicFile);
  const activePem = await readText(activePath);
  if (!(await keyHealthy(activePath, "Ed25519"))) fail("DGLAUNDRY_PUBLIC_KEY_REQUIRED", "DGLaundry's public event key is missing or invalid.");
  if (registry[activeKid] && !createPublicKey(registry[activeKid]).export({ type: "spki", format: "der" }).equals(createPublicKey(activePem).export({ type: "spki", format: "der" }))) fail("DGLAUNDRY_EVENT_KEY_ID_REUSE", "The active DGLaundry event key ID already identifies a different public key.");
  registry[activeKid] = activePem;
  return registry;
}
async function publicKeyMetadata(rootDir, value) {
  const roles = ["dglaundryMachineAssertion", "dglaundryRequestSigning", "dglaundryEventSigning", "oidcSigning", "dgfyEventSigning", "dgfyRequestSigning"];
  const metadata = [];
  for (const name of roles) {
    const role = value.keyRoles[name];
    if (!role?.publicFile) continue;
    const file = join(rootDir, role.publicFile);
    if (!(await exists(file))) continue;
    const publicKey = createPublicKey(await readFile(file, "utf8"));
    metadata.push({ role: name, keyId: name === "oidcSigning" ? setupInputs.oidcKeyId : name === "dgfyEventSigning" ? setupInputs.eventKeyId : name === "dgfyRequestSigning" ? setupInputs.requestKeyId : targetKeyId(value, name),
      fingerprintSha256: createHash("sha256").update(publicKey.export({ type: "spki", format: "der" })).digest("hex") });
  }
  return metadata;
}
async function keyFingerprintMatches(file, expectedFingerprint) {
  if (!/^[a-f0-9]{64}$/i.test(String(expectedFingerprint || ""))) return false;
  try {
    const publicKey = createPublicKey(await readFile(file, "utf8"));
    return createHash("sha256").update(publicKey.export({ type: "spki", format: "der" })).digest("hex").toLowerCase() === expectedFingerprint.toLowerCase();
  } catch { return false; }
}
function targetKeyId(value, role) { return value.environments[environment].keyIds[role]; }
async function oidcLegacyKeyMatches(envText, publicPemPath, activeKid) {
  try {
    return envValue(envText, "DGFY_OIDC_KEY_ID") === activeKid
      && envValue(envText, "DGFY_OIDC_PRIVATE_KEY_FILE") === "/run/dgfy-secrets/dgfy-oidc-private.pem"
      && envValue(envText, "DGFY_OIDC_PUBLIC_KEY_FILE") === "/run/dgfy-secrets/dgfy-oidc-public.pem"
      && await keyHealthy(publicPemPath, "RS256");
  } catch { return false; }
}
async function ensureExternalPublicKey(rootDir, role) {
  if (!role || role.owner !== "dglaundry" || !role.publicFile) fail("PUBLIC_KEY_ROLE_INVALID", "The DGLaundry machine assertion key must be a DGLaundry-owned public key role.");
  const file = join(rootDir, role.publicFile);
  if (!(await keyHealthy(file, role.algorithm))) fail("DGLAUNDRY_PUBLIC_KEY_REQUIRED", `Install and verify DGLaundry's public machine-assertion key before prepare: ${role.publicFile}`);
}
async function eventRegistryMatches(envText, activePublicKeyPath, activeKid) {
  try {
    const registry = JSON.parse(envValue(envText, "DGLAUNDRY_INTEGRATION_PUBLIC_KEYS_JSON"));
    const registered = createPublicKey(registry[activeKid]);
    const active = createPublicKey(await readFile(activePublicKeyPath, "utf8"));
    return registered.asymmetricKeyType === "ed25519" && registered.export({ type: "spki", format: "der" }).equals(active.export({ type: "spki", format: "der" }));
  } catch { return false; }
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
async function writeAtomic(file, contents, mode) {
  const temporary = `${file}.${process.pid}.${Date.now()}.tmp`;
  try {
    await writeFile(temporary, contents, { encoding: "utf8", mode, flag: "wx" });
    await chmod(temporary, mode).catch(() => undefined);
    await rename(temporary, file);
  } catch (error) {
    await unlink(temporary).catch(() => undefined);
    throw error;
  }
}
