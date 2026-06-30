const crypto = require('crypto');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawnSync } = require('child_process');

const AUTH_SCHEMA = 'sku-release-authorization/v1';
const EVIDENCE_SCHEMA = 'sku-release-evidence/v2';
const VALID_PHASES = new Set(['promotion', 'production', 'payment']);
const ALLOWED_PROOF_TYPES = new Set(['api', 'ui', 'database_readonly', 'asset']);
const VALID_ARCHITECTURE_CLASSIFICATIONS = new Set(['no-architecture-impact', 'within-existing-boundary', 'cross-boundary']);
const VALID_DOCUMENTATION_DECISIONS = new Set(['updated', 'no_change_required']);
const VALID_DOCUMENTATION_ACTIONS = new Set(['updated', 'reviewed_current']);
const DOCUMENT_PATH_PATTERN = /^docs\/.+\.(?:md|mdx|json|ya?ml)$/i;
const ADR_PATH_PATTERN = /^docs\/architecture\/adr\/.+\.md$/i;
const PLACEHOLDER_PATTERN = /(?:placeholder|not provided|todo|tbd|unknown|replace this|example)/i;
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
  validateInventoryDocumentation(inventory);
  return inventory;
}

function validateInventoryDocumentation(inventory, options = {}) {
  const changedFiles = new Set(options.changedFiles || inventory.expected_changed_files || []);
  for (const slice of inventory.release_slices || []) {
    const sliceId = slice.id || slice.slice_name || '<unnamed>';
    if (!VALID_ARCHITECTURE_CLASSIFICATIONS.has(slice.architecture_classification)) {
      fail('DOCUMENTATION_CLOSURE_INVALID', `Slice ${sliceId} has invalid architecture classification`);
    }
    const closure = slice.documentation_closure;
    if (!closure || !VALID_DOCUMENTATION_DECISIONS.has(closure.decision)) {
      fail('DOCUMENTATION_CLOSURE_INVALID', `Slice ${sliceId} is missing a valid documentation closure decision`);
    }
    if (!closure.reviewed_by || PLACEHOLDER_PATTERN.test(closure.reviewed_by)
      || !Number.isFinite(Date.parse(closure.reviewed_at || ''))
      || !closure.rationale || closure.rationale.trim().length < 12 || PLACEHOLDER_PATTERN.test(closure.rationale)) {
      fail('DOCUMENTATION_CLOSURE_INVALID', `Slice ${sliceId} documentation closure review is missing or placeholder`);
    }
    if (!Array.isArray(closure.documents) || closure.documents.length === 0) {
      fail('DOCUMENTATION_CLOSURE_INVALID', `Slice ${sliceId} documentation closure requires documents`);
    }
    let updated = 0;
    let reviewedCurrent = 0;
    let updatedAdr = 0;
    const closurePaths = new Set();
    for (const document of closure.documents) {
      const documentPath = String(document?.path || '').replace(/\\/g, '/');
      if (!DOCUMENT_PATH_PATTERN.test(documentPath) || documentPath.includes('..') || !VALID_DOCUMENTATION_ACTIONS.has(document?.action)) {
        fail('DOCUMENTATION_CLOSURE_INVALID', `Slice ${sliceId} has an invalid documentation path or action: ${documentPath || '<missing>'}`);
      }
      if (!document.evidence || document.evidence.trim().length < 12 || PLACEHOLDER_PATTERN.test(document.evidence)) {
        fail('DOCUMENTATION_CLOSURE_INVALID', `Slice ${sliceId} has missing or placeholder documentation evidence for ${documentPath}`);
      }
      if (closurePaths.has(documentPath)) fail('DOCUMENTATION_CLOSURE_INVALID', `Slice ${sliceId} repeats documentation path ${documentPath}`);
      closurePaths.add(documentPath);
      if (document.action === 'updated') {
        updated += 1;
        if (changedFiles.size > 0 && !changedFiles.has(documentPath)) fail('DOCUMENTATION_CLOSURE_INVALID', `Slice ${sliceId} claims unchanged documentation was updated: ${documentPath}`);
        if (ADR_PATH_PATTERN.test(documentPath)) updatedAdr += 1;
      } else {
        reviewedCurrent += 1;
      }
      if (options.worktree) {
        const absolute = path.resolve(options.worktree, documentPath);
        if (!absolute.startsWith(`${path.resolve(options.worktree)}${path.sep}`) || !fs.existsSync(absolute)) {
          fail('DOCUMENTATION_CLOSURE_INVALID', `Slice ${sliceId} documentation is missing from exact-SHA worktree: ${documentPath}`);
        }
        const tracked = run(options.gitBin || 'git', ['cat-file', '-e', `${inventory.head_sha}:${documentPath}`], { cwd: options.worktree });
        if (!tracked.ok) fail('DOCUMENTATION_CLOSURE_INVALID', `Slice ${sliceId} documentation is not tracked at target SHA: ${documentPath}`);
      }
    }
    if (closure.decision === 'updated' && updated === 0) fail('DOCUMENTATION_CLOSURE_INVALID', `Slice ${sliceId} decision=updated requires an updated document`);
    if (closure.decision === 'no_change_required' && (updated > 0 || reviewedCurrent === 0 || closure.rationale.trim().length < 24)) {
      fail('DOCUMENTATION_CLOSURE_INVALID', `Slice ${sliceId} no-change decision lacks a specific reviewed rationale`);
    }
    if (slice.architecture_classification === 'cross-boundary' && updatedAdr === 0) {
      fail('DOCUMENTATION_CLOSURE_INVALID', `Cross-boundary slice ${sliceId} requires an updated ADR`);
    }
    for (const required of slice.required_docs || []) {
      if (!closurePaths.has(required)) fail('DOCUMENTATION_CLOSURE_INVALID', `Slice ${sliceId} required document is absent from documentation closure: ${required}`);
    }
  }
  return inventory;
}

function validateDocumentationClosureEvidence(report, expected) {
  if (!report || report.schema !== 'sku-documentation-closure/v1' || report.version !== 1) fail('DOCUMENTATION_CLOSURE_INVALID', 'Documentation closure report schema is invalid');
  if (report.status !== 'pass' || report.non_bypassable !== true) fail('DOCUMENTATION_CLOSURE_INVALID', 'Documentation closure must pass and be non-bypassable');
  if (report.target_sha !== expected.targetSha) fail('DOCUMENTATION_CLOSURE_INVALID', 'Documentation closure target SHA mismatch');
  if (report.inventory_sha256 !== expected.inventoryHash) fail('DOCUMENTATION_CLOSURE_INVALID', 'Documentation closure inventory hash mismatch');
  if (!Array.isArray(report.release_slices) || report.release_slices.some((slice) => slice.status !== 'pass')) {
    fail('DOCUMENTATION_CLOSURE_INVALID', 'Every documentation closure slice must pass');
  }
  return report;
}

function billingFallbackCovers(evidence, name, targetSha) {
  const fallback = evidence.github_actions_unavailability;
  return fallback?.status === 'pass'
    && fallback?.reason === 'billing_allocation_failure'
    && fallback?.target_sha === targetSha
    && /^[0-9a-f]{64}$/.test(fallback?.report_sha256 || '')
    && Array.isArray(fallback?.required_checks)
    && fallback.required_checks.includes(name);
}

function isGithubBillingUnavailableCheck(check) {
  return check?.conclusion === 'failure'
    && check?.appSlug === 'github-actions'
    && Number(check?.runnerId || 0) === 0
    && !check?.runnerName
    && Array.isArray(check?.steps)
    && check.steps.length === 0
    && Array.isArray(check?.annotations)
    && check.annotations.some((annotation) => /job was not started because recent account payments have failed or your spending limit needs to be increased/i.test(annotation.message || ''));
}

function validateGithubActionsUnavailabilityReport(report, evidence, expected) {
  const bound = evidence.github_actions_unavailability;
  if (!bound) return null;
  if (report?.schema !== 'sku-github-actions-unavailability/v1'
    || report?.status !== 'pass'
    || report?.reason !== 'billing_allocation_failure'
    || report?.repository !== expected.repository
    || report?.target_sha !== expected.targetSha) {
    fail('GITHUB_ACTIONS_UNAVAILABILITY_INVALID', 'GitHub Actions unavailability report is failed, stale, or for another repository');
  }
  const names = (report.required_checks || []).map((check) => check.name);
  if (names.length === 0 || names.some((name) => !bound.required_checks.includes(name)) || bound.required_checks.some((name) => !names.includes(name))) {
    fail('GITHUB_ACTIONS_UNAVAILABILITY_INVALID', 'GitHub Actions unavailability report does not match the bound required checks');
  }
  for (const check of report.required_checks) {
    if (check.conclusion !== 'failure'
      || Number(check.runner_id || 0) !== 0
      || check.runner_name
      || Number(check.steps) !== 0
      || !/job was not started because recent account payments have failed or your spending limit needs to be increased/i.test(check.annotation_message || '')) {
      fail('GITHUB_ACTIONS_UNAVAILABILITY_INVALID', `Invalid billing allocation evidence for ${check.name || '<unknown>'}`);
    }
  }
  return report;
}

function validateEvidence(evidence, expected, requiredChecks = [], options = {}) {
  if (evidence.schema !== EVIDENCE_SCHEMA || evidence.version !== 2) fail('EVIDENCE_SCHEMA_INVALID', 'Candidate evidence schema is invalid');
  if (evidence.repository !== expected.repository) fail('EVIDENCE_REPOSITORY_MISMATCH', 'Evidence repository mismatch');
  if (evidence.phase !== expected.phase) fail('EVIDENCE_PHASE_MISMATCH', 'Evidence phase mismatch');
  if (evidence.target_sha !== expected.targetSha) fail('EVIDENCE_SHA_MISMATCH', 'Evidence target SHA mismatch');
  if (Number(evidence.pr?.number) !== Number(expected.prNumber)) fail('EVIDENCE_PR_MISMATCH', 'Evidence PR number mismatch');
  if (evidence.inventory_sha256 !== expected.inventoryHash) fail('EVIDENCE_INVENTORY_HASH_MISMATCH', 'Evidence inventory hash mismatch');
  if (Boolean(evidence.payment_sensitive) !== expected.paymentSensitive) fail('EVIDENCE_PAYMENT_FLAG_MISMATCH', 'Evidence payment flag mismatch');
  if (evidence.documentation_closure?.status !== 'pass'
    || evidence.documentation_closure?.target_sha !== expected.targetSha
    || evidence.documentation_closure?.inventory_sha256 !== expected.inventoryHash
    || evidence.documentation_closure?.report_sha256 !== expected.documentationClosureHash
    || evidence.documentation_closure?.non_bypassable !== true) {
    fail('DOCUMENTATION_CLOSURE_INVALID', 'Candidate evidence does not bind passing documentation closure');
  }
  if (evidence.regression_risk_notice?.status !== 'pass'
    || evidence.regression_risk_notice?.target_sha !== expected.targetSha
    || evidence.regression_risk_notice?.report_sha256 !== expected.regressionRiskNoticeHash) {
    fail('REGRESSION_RISK_NOTICE_INVALID', 'Candidate evidence does not bind a passing Regression Risk Notice');
  }
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
    if (check.conclusion !== 'success') {
      const fallbackAllowed = options.allowGithubBillingFallback === true && billingFallbackCovers(evidence, name, expected.targetSha);
      if (!fallbackAllowed) fail('REQUIRED_CHECK_FAILED', `Required check did not succeed: ${name}`);
    }
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

function validateLiveGithubEvidence(live, evidence, phase, options = {}) {
  if (!live || live.number !== Number(evidence.pr.number)) fail('GITHUB_PR_MISSING', 'Live GitHub PR evidence is missing');
  if (live.base !== evidence.pr.base || live.head !== evidence.pr.head) fail('GITHUB_PR_REF_MISMATCH', 'Live GitHub PR refs differ from signed evidence');
  if (phase === 'promotion' && live.headSha !== evidence.target_sha) fail('GITHUB_PR_SHA_MISMATCH', 'Live PR head SHA differs from authorization');
  if (phase === 'promotion' && live.state !== 'OPEN') fail('GITHUB_PR_STATE_INVALID', 'Promotion PR must be open');
  if (phase === 'production' && live.state !== 'MERGED') fail('GITHUB_PR_STATE_INVALID', 'Production PR must be merged');
  if (phase === 'production' && live.mergeCommitSha !== evidence.target_sha) fail('GITHUB_MERGE_SHA_MISMATCH', 'Live PR merge SHA differs from production target');
  for (const required of evidence.required_checks || []) {
    const actual = (live.checks || []).find((check) => check.name === required.name);
    if (actual?.conclusion === 'success') continue;
    const fallbackAllowed = options.allowGithubBillingFallback === true
      && billingFallbackCovers(evidence, required.name, evidence.target_sha)
      && isGithubBillingUnavailableCheck(actual);
    if (!fallbackAllowed) fail('GITHUB_REQUIRED_CHECK_FAILED', `Live required check is not successful: ${required.name}`);
  }
}

function validateAccuracyProofBundle(bundle, inventory, targetSha, options = {}) {
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
      const capturedAt = Date.parse(proof.captured_at || '');
      if (!Number.isFinite(capturedAt) || (options.notBefore && capturedAt < Date.parse(options.notBefore)) || capturedAt > Date.now() + 60_000) {
        fail('ACCURACY_PROOF_STALE', `Accuracy proof is stale or has an invalid capture time for slice ${slice.id}`);
      }
      if (options.verifyArtifacts) {
        if (!proof.artifact_path || !fs.existsSync(proof.artifact_path)) fail('ACCURACY_ARTIFACT_MISSING', `Accuracy proof artifact is missing for slice ${slice.id}`);
        if (sha256File(proof.artifact_path) !== proof.artifact_sha256) fail('ACCURACY_ARTIFACT_HASH_MISMATCH', `Accuracy proof artifact hash mismatch for slice ${slice.id}`);
      }
    }
  }
  return bundle;
}

function parseKeyValueSummary(text) {
  const values = {};
  for (const rawLine of String(text || '').split(/\r?\n/)) {
    const index = rawLine.indexOf('=');
    if (index > 0) values[rawLine.slice(0, index)] = rawLine.slice(index + 1);
  }
  return values;
}

function validateProductionBaselineProof(proof, targetSha) {
  if (!proof || typeof proof !== 'object') fail('PRODUCTION_PROOF_MISSING', 'Production baseline proof is missing');
  const summary = proof.deploy_summary || {};
  const contract = proof.production_contract || {};
  const remote = proof.remote || {};
  for (const [label, value] of Object.entries({
    remote_head: remote.remote_head,
    deploy_state: remote.deploy_state,
    deployed_head: summary.deployed_head,
    summary_remote_head: summary.remote_head,
    expected_commit: summary.expected_commit,
    contract_target_sha: contract.target_sha,
    contract_git_head: contract.git_head,
    contract_deploy_state_sha: contract.deploy_state_sha,
  })) {
    if (value !== targetSha) fail('PRODUCTION_SHA_MISMATCH', `${label} does not match production target SHA`);
  }
  if (summary.frontend_asset_parity_status !== 'pass') fail('PRODUCTION_ASSET_PARITY_FAILED', 'Frontend asset parity did not pass');
  if (contract.ok !== true) fail('PRODUCTION_CONTRACT_FAILED', 'Production contract is not successful');
  if (!Array.isArray(contract.health) || contract.health.length === 0
    || contract.health.some((entry) => entry.ok !== true || entry.runtime_sha !== targetSha)) {
    fail('PRODUCTION_RUNTIME_SHA_MISMATCH', 'Live production health does not prove the exact target SHA');
  }
  return proof;
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

  read(auth) {
    return readJson(this.entryPath(auth), 'nonce ledger entry');
  }

  transition(auth, expectedStatus, status, details = {}) {
    const target = this.entryPath(auth);
    const entry = readJson(target, 'nonce ledger entry');
    if (entry.status !== expectedStatus) fail('LEDGER_STATE_INVALID', `Expected nonce ledger state ${expectedStatus}, got ${entry.status}`);
    const timestamp = new Date().toISOString();
    const next = {
      ...entry,
      status,
      updated_at: timestamp,
      ...(status === 'deployed_pending_accuracy' ? { deployed_at: timestamp } : {}),
      ...(status === 'completed' || status === 'failed' ? { completed_at: timestamp } : {}),
      details: { ...(entry.details || {}), ...details },
    };
    const temporary = `${target}.${process.pid}.tmp`;
    fs.writeFileSync(temporary, `${JSON.stringify(next, null, 2)}\n`, { mode: 0o600 });
    fs.renameSync(temporary, target);
    if (process.platform !== 'win32') fs.chmodSync(target, 0o600);
    return next;
  }

  markDeployedPendingAccuracy(auth, details = {}) {
    return this.transition(auth, 'reserved', 'deployed_pending_accuracy', details);
  }

  finalize(auth, details = {}) {
    return this.transition(auth, 'deployed_pending_accuracy', 'completed', details);
  }

  recordAccuracyFailure(auth, details = {}) {
    const target = this.entryPath(auth);
    const entry = readJson(target, 'nonce ledger entry');
    if (entry.status !== 'deployed_pending_accuracy') fail('LEDGER_STATE_INVALID', `Accuracy failure requires deployed_pending_accuracy, got ${entry.status}`);
    const updated = {
      ...entry,
      updated_at: new Date().toISOString(),
      details: {
        ...(entry.details || {}),
        residual_risks: [...(entry.details?.residual_risks || []), details],
      },
    };
    const temporary = `${target}.${process.pid}.tmp`;
    fs.writeFileSync(temporary, `${JSON.stringify(updated, null, 2)}\n`, { mode: 0o600 });
    fs.renameSync(temporary, target);
    if (process.platform !== 'win32') fs.chmodSync(target, 0o600);
    return updated;
  }
}

function releaseRecordMarkdown(record) {
  const lines = [
    '# Production Release Record',
    '',
    `- Target SHA: \`${record.target_sha}\``,
    `- Branch: \`${record.branch}\``,
    `- Ledger state: \`${record.ledger_state}\``,
    `- Authorization tag: \`${record.authorization?.tag || 'missing'}\``,
    `- Signer fingerprint: \`${record.authorization?.signer_fingerprint || 'missing'}\``,
    `- Documentation closure: \`${record.documentation_closure?.status || 'missing'}\``,
    `- Regression risk: \`${record.regression_risk_notice?.status || 'missing'}\``,
    '',
    '## Release Slices',
    '',
  ];
  for (const slice of record.release_slices || []) {
    lines.push(`### ${slice.slice_name || slice.name || slice.id}`);
    lines.push(`- Documentation decision: \`${slice.documentation_closure?.decision || 'missing'}\``);
    lines.push(`- Accuracy state: \`${slice.accuracy_state || 'deployed_pending_accuracy'}\``);
    lines.push('');
  }
  if ((record.residual_risks || []).length > 0) {
    lines.push('## Residual Risks', '');
    for (const risk of record.residual_risks) lines.push(`- ${typeof risk === 'string' ? risk : JSON.stringify(risk)}`);
    lines.push('');
  }
  return `${lines.join('\n').trim()}\n`;
}

class ReleaseRecordStore {
  constructor(directory) {
    this.directory = directory;
  }

  targetDirectory(targetSha) {
    return path.join(this.directory, targetSha);
  }

  writeOnce(targetSha, basename, value, markdown = false) {
    if (!/^[0-9a-f]{40}$/.test(targetSha)) fail('RELEASE_RECORD_INVALID', 'Release record target SHA is invalid');
    fs.mkdirSync(this.directory, { recursive: true, mode: 0o700 });
    const targetDirectory = this.targetDirectory(targetSha);
    fs.mkdirSync(targetDirectory, { recursive: true, mode: 0o700 });
    if (process.platform !== 'win32') {
      fs.chmodSync(this.directory, 0o700);
      fs.chmodSync(targetDirectory, 0o700);
    }
    const target = path.join(targetDirectory, basename);
    let descriptor;
    try {
      descriptor = fs.openSync(target, 'wx', 0o600);
      fs.writeFileSync(descriptor, markdown ? value : `${JSON.stringify(value, null, 2)}\n`);
    } catch (error) {
      if (error.code === 'EEXIST') fail('RELEASE_RECORD_EXISTS', `Immutable release record already exists: ${target}`);
      throw error;
    } finally {
      if (descriptor !== undefined) fs.closeSync(descriptor);
    }
    if (process.platform !== 'win32') fs.chmodSync(target, 0o600);
    return target;
  }

  writeDeploymentRecord(record) {
    return {
      json: this.writeOnce(record.target_sha, 'release_record.json', record),
      markdown: this.writeOnce(record.target_sha, 'release_record.md', releaseRecordMarkdown(record), true),
    };
  }

  writeFinalizationRecord(record) {
    return {
      json: this.writeOnce(record.target_sha, 'accuracy_finalization.json', record),
      markdown: this.writeOnce(record.target_sha, 'accuracy_finalization.md', releaseRecordMarkdown(record), true),
    };
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

function buildRemoteProofArgs(config, targetSha) {
  ensureCredentialFile(config.production?.ssh_key_path, 'Production SSH key');
  const production = config.production || {};
  for (const field of ['host', 'user', 'app_dir']) {
    if (!production[field]) fail('PRODUCTION_CREDENTIALS_ABSENT', `Production configuration is missing ${field}`);
  }
  const appDir = String(production.app_dir).replace(/'/g, "'\\''");
  const remote = [
    'set -e',
    `cd '${appDir}'`,
    `test "$(git rev-parse HEAD)" = "${targetSha}"`,
    `test "$(cat .deploy-state/last_deployed_commit)" = "${targetSha}"`,
    'summary=$(ls -1t logs/deploy/deploy_*.summary.txt | head -1)',
    'contract=$(ls -1t logs/deploy/deploy_*.production_contract.json | head -1)',
    'printf "remote_head=%s\\n" "$(git rev-parse HEAD)"',
    'printf "deploy_state=%s\\n" "$(cat .deploy-state/last_deployed_commit)"',
    'printf "summary_path=%s\\n" "$summary"',
    'printf "contract_path=%s\\n" "$contract"',
    'printf "summary_base64=%s\\n" "$(base64 -w0 "$summary")"',
    'printf "contract_base64=%s\\n" "$(base64 -w0 "$contract")"',
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

function parseProductionProofOutput(output) {
  const values = parseKeyValueSummary(output);
  for (const field of ['remote_head', 'deploy_state', 'summary_path', 'contract_path', 'summary_base64', 'contract_base64']) {
    if (!values[field]) fail('PRODUCTION_PROOF_MISSING', `Production proof output is missing ${field}`);
  }
  const deploySummaryText = Buffer.from(values.summary_base64, 'base64').toString('utf8');
  const productionContractText = Buffer.from(values.contract_base64, 'base64').toString('utf8');
  let productionContract;
  try {
    productionContract = JSON.parse(productionContractText);
  } catch (error) {
    fail('PRODUCTION_PROOF_INVALID', `Production contract is invalid JSON: ${error.message}`);
  }
  return {
    captured_at: new Date().toISOString(),
    remote: {
      remote_head: values.remote_head,
      deploy_state: values.deploy_state,
    },
    deploy_summary: parseKeyValueSummary(deploySummaryText),
    production_contract: productionContract,
    artifacts: {
      deploy_summary_path: values.summary_path,
      deploy_summary_sha256: crypto.createHash('sha256').update(deploySummaryText).digest('hex'),
      production_contract_path: values.contract_path,
      production_contract_sha256: crypto.createHash('sha256').update(productionContractText).digest('hex'),
    },
  };
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
  validateInventoryDocumentation,
  validateDocumentationClosureEvidence,
  validateEvidence,
  validateLiveGithubEvidence,
  isGithubBillingUnavailableCheck,
  validateGithubActionsUnavailabilityReport,
  validateAccuracyProofBundle,
  parseKeyValueSummary,
  validateProductionBaselineProof,
  ReleaseRecordStore,
  releaseRecordMarkdown,
  sanitizeQualificationEnv,
  runQualification,
  ensureCredentialFile,
  createWorktree,
  removeWorktree,
  buildRemoteDeployArgs,
  buildRemoteProofArgs,
  parseProductionProofOutput,
};
