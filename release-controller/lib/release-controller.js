const crypto = require('crypto');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawnSync } = require('child_process');

const AUTH_SCHEMA = 'sku-release-authorization/v1';
const EVIDENCE_SCHEMA = 'sku-release-evidence/v1';
const VALID_PHASES = new Set(['promotion', 'production', 'payment']);
const ALLOWED_PROOF_TYPES = new Set(['api', 'ui', 'database_readonly', 'asset']);
const AUTH_FIELDS = new Set([
  'schema',
  'repository',
  'phase',
  'target_sha',
  'expires_at',
  'nonce',
  'inventory_sha256',
  'evidence_sha256',
  'payment_sensitive',
  'pr_number',
]);

class ReleaseControllerError extends Error {
  constructor(code, message, details = {}) {
    super(message);
    this.name = 'ReleaseControllerError';
    this.code = code;
    this.details = details;
  }
}

function fail(code, message, details) {
  throw new ReleaseControllerError(code, message, details);
}

function sha256File(filePath) {
  if (!filePath || !fs.existsSync(filePath)) fail('FILE_MISSING', `Required file is missing: ${filePath || '<empty>'}`);
  return crypto.createHash('sha256').update(fs.readFileSync(filePath)).digest('hex');
}

function readJson(filePath, label) {
  if (!filePath || !fs.existsSync(filePath)) fail('FILE_MISSING', `${label} is missing: ${filePath || '<empty>'}`);
  try {
    return JSON.parse(fs.readFileSync(filePath, 'utf8'));
  } catch (error) {
    fail('JSON_INVALID', `${label} is not valid JSON: ${error.message}`);
  }
}

function run(command, args, options = {}) {
  const result = spawnSync(command, args, {
    cwd: options.cwd,
    env: options.env || process.env,
    encoding: 'utf8',
    shell: false,
    timeout: options.timeoutMs || 60_000,
    maxBuffer: options.maxBuffer || 16 * 1024 * 1024,
  });
  return {
    ok: result.status === 0 && !result.error,
    status: result.status,
    stdout: result.stdout || '',
    stderr: result.stderr || '',
    error: result.error || null,
  };
}

function requireCommand(result, code, description) {
  if (!result.ok) {
    fail(code, `${description} failed: ${(result.stderr || result.stdout || result.error?.message || result.status).trim()}`);
  }
  return result.stdout.trim();
}

function parseAuthorizationMessage(message) {
  const fields = {};
  const unsignedMessage = String(message || '').split('-----BEGIN PGP SIGNATURE-----')[0];
  for (const rawLine of unsignedMessage.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line) continue;
    const index = line.indexOf('=');
    if (index <= 0) fail('AUTH_MESSAGE_INVALID', `Authorization line is not key=value: ${line}`);
    const key = line.slice(0, index);
    const value = line.slice(index + 1);
    if (!AUTH_FIELDS.has(key)) fail('AUTH_FIELD_UNKNOWN', `Unknown authorization field: ${key}`);
    if (Object.prototype.hasOwnProperty.call(fields, key)) fail('AUTH_FIELD_DUPLICATE', `Duplicate authorization field: ${key}`);
    fields[key] = value;
  }
  for (const field of AUTH_FIELDS) {
    if (!fields[field]) fail('AUTH_FIELD_MISSING', `Missing authorization field: ${field}`);
  }
  return fields;
}

function normalizeFingerprint(value) {
  return String(value || '').replace(/\s/g, '').toUpperCase();
}

function validateAuthorizationFields(fields, expected, now = new Date()) {
  if (fields.schema !== AUTH_SCHEMA) fail('AUTH_SCHEMA_INVALID', `Unsupported authorization schema: ${fields.schema}`);
  if (!VALID_PHASES.has(fields.phase)) fail('AUTH_PHASE_INVALID', `Invalid authorization phase: ${fields.phase}`);
  if (fields.phase !== expected.phase) fail('AUTH_PHASE_MISMATCH', `Expected ${expected.phase} authorization, got ${fields.phase}`);
  if (fields.repository !== expected.repository) fail('AUTH_REPOSITORY_MISMATCH', 'Authorization repository does not match controller configuration');
  if (!/^[0-9a-f]{40}$/.test(fields.target_sha)) fail('AUTH_SHA_INVALID', 'Authorization target_sha must be a lowercase 40-character SHA');
  if (fields.target_sha !== expected.targetSha) fail('AUTH_SHA_MISMATCH', `Authorization SHA mismatch: expected=${expected.targetSha} actual=${fields.target_sha}`);
  if (!/^[0-9a-f]{32,}$/.test(fields.nonce)) fail('AUTH_NONCE_INVALID', 'Authorization nonce must contain at least 128 bits of lowercase hexadecimal data');
  if (!/^[0-9a-f]{64}$/.test(fields.inventory_sha256)) fail('AUTH_INVENTORY_HASH_INVALID', 'Authorization inventory_sha256 is invalid');
  if (!/^[0-9a-f]{64}$/.test(fields.evidence_sha256)) fail('AUTH_EVIDENCE_HASH_INVALID', 'Authorization evidence_sha256 is invalid');
  if (!['true', 'false'].includes(fields.payment_sensitive)) fail('AUTH_PAYMENT_FLAG_INVALID', 'Authorization payment_sensitive must be true or false');
  if (!/^[1-9][0-9]*$/.test(fields.pr_number)) fail('AUTH_PR_INVALID', 'Authorization pr_number must be a positive integer');
  const expiresAt = new Date(fields.expires_at);
  if (!Number.isFinite(expiresAt.getTime()) || fields.expires_at !== expiresAt.toISOString()) {
    fail('AUTH_EXPIRY_INVALID', 'Authorization expires_at must be a canonical UTC RFC3339 timestamp');
  }
  if (expiresAt.getTime() <= now.getTime()) fail('AUTH_EXPIRED', `Authorization expired at ${fields.expires_at}`);
  if (fields.inventory_sha256 !== expected.inventoryHash) fail('AUTH_INVENTORY_HASH_MISMATCH', 'Authorization inventory hash does not match reviewed inventory');
  if (fields.evidence_sha256 !== expected.evidenceHash) fail('AUTH_EVIDENCE_HASH_MISMATCH', 'Authorization evidence hash does not match candidate evidence');
  if ((fields.payment_sensitive === 'true') !== expected.paymentSensitive) fail('AUTH_PAYMENT_FLAG_MISMATCH', 'Authorization payment flag does not match inventory');
  if (Number(fields.pr_number) !== Number(expected.prNumber)) fail('AUTH_PR_MISMATCH', 'Authorization PR number does not match candidate evidence');
  return { ...fields, expires_at: expiresAt.toISOString(), payment_sensitive: fields.payment_sensitive === 'true', pr_number: Number(fields.pr_number) };
}

function verifySignedTag(options) {
  const git = options.gitBin || 'git';
  const runner = options.runner || run;
  const repoArgs = options.gitDir ? [`--git-dir=${options.gitDir}`] : [];
  const objectType = requireCommand(runner(git, [...repoArgs, 'cat-file', '-t', options.tag], options), 'TAG_NOT_FOUND', `Resolve tag ${options.tag}`);
  if (objectType !== 'tag') fail('TAG_NOT_ANNOTATED', `Authorization must be an annotated signed tag: ${options.tag}`);
  const targetSha = requireCommand(runner(git, [...repoArgs, 'rev-parse', `${options.tag}^{commit}`], options), 'TAG_TARGET_INVALID', `Resolve tag target ${options.tag}`);
  const signature = runner(git, [...repoArgs, 'verify-tag', '--raw', options.tag], options);
  if (!signature.ok) fail('SIGNATURE_INVALID', `Tag signature verification failed for ${options.tag}: ${(signature.stderr || signature.stdout).trim()}`);
  const statusOutput = `${signature.stdout}\n${signature.stderr}`;
  const validSig = statusOutput.match(/\[GNUPG:\]\s+VALIDSIG\s+([0-9A-Fa-f]{40,64})\b/);
  if (!validSig) fail('SIGNER_FINGERPRINT_MISSING', 'git verify-tag did not return a full VALIDSIG fingerprint');
  const fingerprint = normalizeFingerprint(validSig[1]);
  const allowlist = new Set((options.allowedFingerprints || []).map(normalizeFingerprint));
  if (!allowlist.has(fingerprint)) fail('SIGNER_NOT_ALLOWED', `Signer fingerprint is not allowlisted: ${fingerprint}`);
  const message = requireCommand(runner(git, [...repoArgs, 'for-each-ref', '--format=%(contents)', `refs/tags/${options.tag}`], options), 'TAG_MESSAGE_MISSING', `Read tag message ${options.tag}`);
  return { targetSha, fingerprint, message };
}

function validateTagName(tag, auth) {
  const expected = `release-authorization/${auth.phase}/${auth.target_sha}/${auth.nonce}`;
  if (tag !== expected) fail('TAG_NAME_MISMATCH', `Authorization tag name mismatch: expected=${expected} actual=${tag}`);
}

function validateInventory(inventory, expectedSha) {
  if (inventory.version !== 2) fail('INVENTORY_VERSION_INVALID', 'Strict release inventory version must be 2');
  if (inventory.head_sha !== expectedSha) fail('INVENTORY_SHA_MISMATCH', 'Inventory head_sha does not match target');
  if (inventory.status !== 'pass' || inventory.promotion_eligibility !== 'eligible') fail('INVENTORY_NOT_ELIGIBLE', 'Inventory is not promotion eligible');
  if (inventory.review_status !== 'reviewed') fail('INVENTORY_NOT_REVIEWED', 'Inventory review_status must be reviewed');
  if (!inventory.reviewed_by || !inventory.reviewed_at || !inventory.source_pr) fail('INVENTORY_ATTRIBUTION_MISSING', 'Inventory reviewer and PR attribution are required');
  if (!Array.isArray(inventory.release_slices) || inventory.release_slices.length === 0) fail('INVENTORY_SLICES_MISSING', 'Inventory requires release slices');
  return inventory;
}

function validateEvidence(evidence, expected, requiredChecks = []) {
  if (evidence.schema !== EVIDENCE_SCHEMA || evidence.version !== 1) fail('EVIDENCE_SCHEMA_INVALID', 'Candidate evidence schema is invalid');
  if (evidence.repository !== expected.repository) fail('EVIDENCE_REPOSITORY_MISMATCH', 'Evidence repository mismatch');
  if (evidence.phase !== expected.phase) fail('EVIDENCE_PHASE_MISMATCH', 'Evidence phase mismatch');
  if (evidence.target_sha !== expected.targetSha) fail('EVIDENCE_SHA_MISMATCH', 'Evidence target SHA mismatch');
  if (Number(evidence.pr?.number) !== Number(expected.prNumber)) fail('EVIDENCE_PR_MISMATCH', 'Evidence PR number mismatch');
  if (evidence.inventory_sha256 !== expected.inventoryHash) fail('EVIDENCE_INVENTORY_HASH_MISMATCH', 'Evidence inventory hash mismatch');
  if (Boolean(evidence.payment_sensitive) !== expected.paymentSensitive) fail('EVIDENCE_PAYMENT_FLAG_MISMATCH', 'Evidence payment flag mismatch');
  if (evidence.qa?.status !== 'pass' || evidence.qa?.target_sha !== expected.targetSha || evidence.qa?.isolated !== true) {
    fail('QA_EVIDENCE_INVALID', 'Exact-SHA isolated QA evidence is required');
  }
  if (evidence.local_qualification?.status !== 'pass' || evidence.local_qualification?.target_sha !== expected.targetSha) {
    fail('LOCAL_QUALIFICATION_FAILED', 'Trusted local qualification evidence is missing or failed');
  }
  const checks = new Map((evidence.required_checks || []).map((check) => [check.name, check]));
  for (const name of requiredChecks) {
    const check = checks.get(name);
    if (!check) fail('REQUIRED_CHECK_MISSING', `Required check is missing: ${name}`);
    if (check.conclusion !== 'success') fail('REQUIRED_CHECK_FAILED', `Required check did not succeed: ${name}`);
    if (!check.details_url || /^https?:\/\/example\./i.test(check.details_url)) fail('REQUIRED_CHECK_EVIDENCE_INVALID', `Required check lacks a real evidence URL: ${name}`);
  }
  if (expected.phase === 'promotion') {
    if (evidence.pr.base !== 'master' || evidence.pr.head !== 'staging' || evidence.pr.head_sha !== expected.targetSha) {
      fail('PROMOTION_PR_INVALID', 'Promotion PR must be staging -> master at the exact target SHA');
    }
  }
  if (expected.phase === 'production') {
    if (evidence.master_audit?.status !== 'pass' || evidence.master_audit?.governed_promotion !== true) {
      fail('MASTER_PROMOTION_EVIDENCE_INVALID', 'Production evidence lacks governed promotion proof');
    }
  }
  return evidence;
}

function validateLiveGithubEvidence(live, evidence, phase) {
  if (!live || live.number !== Number(evidence.pr.number)) fail('GITHUB_PR_MISSING', 'Live GitHub PR evidence is missing');
  if (live.base !== evidence.pr.base || live.head !== evidence.pr.head) fail('GITHUB_PR_REF_MISMATCH', 'Live GitHub PR refs differ from signed evidence');
  if (phase === 'promotion' && live.headSha !== evidence.target_sha) fail('GITHUB_PR_SHA_MISMATCH', 'Live PR head SHA differs from authorization');
  if (phase === 'promotion' && live.state !== 'OPEN') fail('GITHUB_PR_STATE_INVALID', 'Promotion PR must be open');
  if (phase === 'production' && live.state !== 'MERGED') fail('GITHUB_PR_STATE_INVALID', 'Production PR must be merged');
  if (phase === 'production' && live.mergeCommitSha !== evidence.target_sha) fail('GITHUB_MERGE_SHA_MISMATCH', 'Live PR merge SHA differs from production target');
  for (const required of evidence.required_checks || []) {
    const actual = (live.checks || []).find((check) => check.name === required.name);
    if (!actual || actual.conclusion !== 'success') fail('GITHUB_REQUIRED_CHECK_FAILED', `Live required check is not successful: ${required.name}`);
  }
}

function validateAccuracyProofBundle(bundle, inventory, targetSha) {
  if (!bundle || bundle.schema !== 'sku-deployed-accuracy-proof/v1') fail('ACCURACY_SCHEMA_INVALID', 'Accuracy proof bundle schema is invalid');
  if (bundle.target_sha !== targetSha) fail('ACCURACY_SHA_MISMATCH', 'Accuracy proof bundle target SHA mismatch');
  const proofs = Array.isArray(bundle.proofs) ? bundle.proofs : [];
  for (const slice of inventory.release_slices) {
    const sliceProofs = proofs.filter((proof) => proof.slice_id === slice.id);
    if (sliceProofs.length === 0) fail('ACCURACY_PROOF_MISSING', `Missing production accuracy proof for slice ${slice.id}`);
    for (const proof of sliceProofs) {
      if (!ALLOWED_PROOF_TYPES.has(proof.type)) fail('ACCURACY_PROOF_TYPE_INVALID', `Invalid proof type for slice ${slice.id}`);
      if (proof.status !== 'pass' || proof.target_sha !== targetSha) fail('ACCURACY_PROOF_FAILED', `Accuracy proof failed for slice ${slice.id}`);
      if (!proof.captured_at || !proof.artifact_sha256 || !/^[0-9a-f]{64}$/.test(proof.artifact_sha256)) {
        fail('ACCURACY_PROOF_PLACEHOLDER', `Accuracy proof metadata is incomplete for slice ${slice.id}`);
      }
      if (!proof.subject || /placeholder|not provided|todo|example/i.test(proof.subject)) fail('ACCURACY_PROOF_PLACEHOLDER', `Accuracy proof subject is a placeholder for slice ${slice.id}`);
      if (proof.type === 'database_readonly' && proof.read_only !== true) fail('ACCURACY_DATABASE_NOT_READONLY', `Database proof must be explicitly read-only for slice ${slice.id}`);
    }
  }
  return bundle;
}

class NonceLedger {
  constructor(directory) {
    this.directory = directory;
  }

  entryPath(auth) {
    return path.join(this.directory, `${auth.phase}-${auth.nonce}.json`);
  }

  assertUnused(auth) {
    if (fs.existsSync(this.entryPath(auth))) fail('AUTH_REPLAYED', `Authorization nonce was already consumed: ${auth.nonce}`);
  }

  reserve(auth, metadata = {}) {
    fs.mkdirSync(this.directory, { recursive: true, mode: 0o700 });
    const entry = {
      schema: 'sku-release-nonce-ledger/v1',
      phase: auth.phase,
      nonce: auth.nonce,
      target_sha: auth.target_sha,
      signer_fingerprint: metadata.signerFingerprint,
      tag: metadata.tag,
      status: 'reserved',
      reserved_at: new Date().toISOString(),
    };
    let descriptor;
    try {
      descriptor = fs.openSync(this.entryPath(auth), 'wx', 0o600);
      fs.writeFileSync(descriptor, `${JSON.stringify(entry, null, 2)}\n`);
    } catch (error) {
      if (error.code === 'EEXIST') fail('AUTH_REPLAYED', `Authorization nonce was already consumed: ${auth.nonce}`);
      throw error;
    } finally {
      if (descriptor !== undefined) fs.closeSync(descriptor);
    }
    return entry;
  }

  complete(auth, status, details = {}) {
    const target = this.entryPath(auth);
    const entry = readJson(target, 'nonce ledger entry');
    if (entry.status !== 'reserved') fail('LEDGER_STATE_INVALID', `Nonce ledger entry is already terminal: ${entry.status}`);
    const completed = { ...entry, status, completed_at: new Date().toISOString(), details };
    const temporary = `${target}.${process.pid}.tmp`;
    fs.writeFileSync(temporary, `${JSON.stringify(completed, null, 2)}\n`, { mode: 0o600 });
    fs.renameSync(temporary, target);
    return completed;
  }
}

function sanitizeQualificationEnv(source = process.env) {
  const blocked = /(SSH|TOKEN|SECRET|PASSWORD|PRIVATE|PRODUCTION|PAYMONGO|GH_TOKEN|GITHUB_TOKEN|AWS_|AZURE_|GOOGLE_)/i;
  return Object.fromEntries(Object.entries(source).filter(([key]) => !blocked.test(key)));
}

function runQualification(options) {
  const commands = options.commands || [];
  if (commands.length === 0) fail('QUALIFICATION_COMMANDS_MISSING', 'Controller qualification commands are not configured');
  const results = [];
  for (const command of commands) {
    if (!Array.isArray(command) || command.length === 0) fail('QUALIFICATION_COMMAND_INVALID', 'Qualification command must be a non-empty argv array');
    const result = run(command[0], command.slice(1), {
      cwd: options.worktree,
      env: sanitizeQualificationEnv(options.env),
      timeoutMs: options.timeoutMs || 30 * 60_000,
      maxBuffer: 32 * 1024 * 1024,
    });
    results.push({ argv: command, status: result.status, ok: result.ok });
    if (!result.ok) fail('LOCAL_QUALIFICATION_FAILED', `Qualification command failed: ${command.join(' ')}`, { results });
  }
  return { status: 'pass', target_sha: options.targetSha, results, completed_at: new Date().toISOString() };
}

function ensureCredentialFile(filePath, label) {
  if (!filePath || !fs.existsSync(filePath)) fail('PRODUCTION_CREDENTIALS_ABSENT', `${label} is missing`);
  if (process.platform !== 'win32') {
    const stat = fs.statSync(filePath);
    if ((stat.mode & 0o077) !== 0) fail('SECRET_PERMISSIONS_WEAK', `${label} must not be accessible to group or other users`);
  }
}

function createWorktree(options) {
  const root = options.worktreeRoot || os.tmpdir();
  fs.mkdirSync(root, { recursive: true, mode: 0o700 });
  const worktree = fs.mkdtempSync(path.join(root, `sku-release-${options.targetSha.slice(0, 12)}-`));
  requireCommand(run(options.gitBin || 'git', [`--git-dir=${options.gitDir}`, 'worktree', 'add', '--detach', worktree, options.targetSha], options), 'WORKTREE_CREATE_FAILED', 'Create exact-SHA qualification worktree');
  return worktree;
}

function removeWorktree(options, worktree) {
  run(options.gitBin || 'git', [`--git-dir=${options.gitDir}`, 'worktree', 'remove', '--force', worktree], options);
  fs.rmSync(worktree, { recursive: true, force: true });
}

function buildRemoteDeployArgs(config, targetSha) {
  ensureCredentialFile(config.production?.ssh_key_path, 'Production SSH key');
  const production = config.production || {};
  for (const field of ['host', 'user', 'app_dir']) {
    if (!production[field]) fail('PRODUCTION_CREDENTIALS_ABSENT', `Production configuration is missing ${field}`);
  }
  const remote = [
    'set -e',
    `cd '${String(production.app_dir).replace(/'/g, "'\\''")}'`,
    'git fetch origin master',
    `test "$(git rev-parse origin/master)" = "${targetSha}"`,
    `bash scripts/deploy.sh --branch master --expect-commit ${targetSha}`,
  ].join('; ');
  return [
    '-i', production.ssh_key_path,
    '-p', String(production.port || 22),
    '-o', 'BatchMode=yes',
    '-o', 'IdentitiesOnly=yes',
    `${production.user}@${production.host}`,
    remote,
  ];
}

module.exports = {
  AUTH_SCHEMA,
  EVIDENCE_SCHEMA,
  ReleaseControllerError,
  NonceLedger,
  sha256File,
  readJson,
  run,
  requireCommand,
  parseAuthorizationMessage,
  validateAuthorizationFields,
  verifySignedTag,
  validateTagName,
  validateInventory,
  validateEvidence,
  validateLiveGithubEvidence,
  validateAccuracyProofBundle,
  sanitizeQualificationEnv,
  runQualification,
  ensureCredentialFile,
  createWorktree,
  removeWorktree,
  buildRemoteDeployArgs,
};
