#!/usr/bin/env node

const fs = require('fs');
const path = require('path');
const {
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
  runQualification,
  createWorktree,
  removeWorktree,
  buildRemoteDeployArgs,
} = require('../lib/release-controller');

function parseArgs(argv) {
  const options = { dryRun: true };
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (['--phase', '--target-sha', '--tag', '--payment-tag', '--inventory', '--evidence', '--accuracy-proof', '--config'].includes(arg)) {
      options[arg.slice(2).replace(/-([a-z])/g, (_, char) => char.toUpperCase())] = argv[index + 1] || '';
      index += 1;
    } else if (arg === '--execute') {
      options.dryRun = false;
    } else if (arg === '--dry-run') {
      options.dryRun = true;
    } else {
      throw new ReleaseControllerError('INVALID_ARGS', `Unknown argument: ${arg}`);
    }
  }
  for (const field of ['phase', 'targetSha', 'tag', 'inventory', 'evidence', 'config']) {
    if (!options[field]) throw new ReleaseControllerError('INVALID_ARGS', `Missing --${field.replace(/[A-Z]/g, (char) => `-${char.toLowerCase()}`)}`);
  }
  if (!['promotion', 'production'].includes(options.phase)) throw new ReleaseControllerError('INVALID_ARGS', '--phase must be promotion or production');
  return options;
}

function loadConfig(filePath) {
  const config = readJson(filePath, 'controller configuration');
  for (const field of ['repository', 'git_mirror', 'ledger_dir']) {
    if (!config[field]) throw new ReleaseControllerError('CONFIG_INVALID', `Controller configuration is missing ${field}`);
  }
  if (!Array.isArray(config.allowed_signer_fingerprints) || config.allowed_signer_fingerprints.length === 0) {
    throw new ReleaseControllerError('CONFIG_INVALID', 'Controller configuration requires allowed_signer_fingerprints');
  }
  return config;
}

function refreshMirror(config) {
  requireCommand(run(config.git_bin || 'git', [`--git-dir=${config.git_mirror}`, 'fetch', '--force', '--prune', 'origin', '+refs/heads/*:refs/remotes/origin/*', '+refs/tags/*:refs/tags/*']), 'GIT_FETCH_FAILED', 'Refresh trusted Git mirror');
}

function remoteSha(config, branch) {
  const output = requireCommand(run(config.git_bin || 'git', ['ls-remote', '--exit-code', config.remote_url, `refs/heads/${branch}`]), 'REMOTE_REF_MISSING', `Read origin/${branch}`);
  return output.split(/\s+/)[0];
}

function liveGithubEvidence(config, prNumber, targetSha) {
  const repo = config.repository;
  const pr = JSON.parse(requireCommand(run(config.gh_bin || 'gh', ['api', `repos/${repo}/pulls/${prNumber}`]), 'GITHUB_PR_QUERY_FAILED', `Read PR #${prNumber}`));
  const checksResponse = JSON.parse(requireCommand(run(config.gh_bin || 'gh', ['api', '-H', 'Accept: application/vnd.github+json', `repos/${repo}/commits/${targetSha}/check-runs?per_page=100`]), 'GITHUB_CHECK_QUERY_FAILED', `Read checks for ${targetSha}`));
  return {
    number: pr.number,
    state: pr.merged ? 'MERGED' : String(pr.state || '').toUpperCase(),
    base: pr.base?.ref,
    head: pr.head?.ref,
    headSha: pr.head?.sha,
    mergeCommitSha: pr.merge_commit_sha,
    checks: (checksResponse.check_runs || []).map((check) => ({ name: check.name, conclusion: check.conclusion })),
  };
}

function verifyAuthorization(options, config, expected, tag) {
  const signed = verifySignedTag({
    gitBin: config.git_bin,
    gitDir: config.git_mirror,
    tag,
    allowedFingerprints: config.allowed_signer_fingerprints,
  });
  if (signed.targetSha !== expected.targetSha) throw new ReleaseControllerError('TAG_TARGET_MISMATCH', 'Signed tag target does not match the authorized SHA');
  const auth = validateAuthorizationFields(parseAuthorizationMessage(signed.message), expected);
  validateTagName(tag, auth);
  return { auth, signerFingerprint: signed.fingerprint, tag };
}

function controllerMain(options) {
  const config = loadConfig(options.config);
  if (!config.remote_url) throw new ReleaseControllerError('CONFIG_INVALID', 'Controller configuration is missing remote_url');
  refreshMirror(config);

  const inventoryHash = sha256File(options.inventory);
  const evidenceHash = sha256File(options.evidence);
  const inventory = validateInventory(readJson(options.inventory, 'reviewed inventory'), options.targetSha);
  const evidence = readJson(options.evidence, 'candidate evidence');
  const expected = {
    repository: config.repository,
    phase: options.phase,
    targetSha: options.targetSha,
    inventoryHash,
    evidenceHash,
    paymentSensitive: Boolean(inventory.payment_sensitive),
    prNumber: evidence.pr?.number,
  };

  // Signature and replay checks intentionally occur before any candidate worktree exists.
  const authorization = verifyAuthorization(options, config, expected, options.tag);
  const ledger = new NonceLedger(config.ledger_dir);
  ledger.assertUnused(authorization.auth);
  validateEvidence(evidence, expected, config.required_checks?.[options.phase] || []);

  let paymentAuthorization = null;
  if (inventory.payment_sensitive) {
    if (!options.paymentTag) throw new ReleaseControllerError('PAYMENT_AUTH_REQUIRED', 'Payment-sensitive release requires --payment-tag');
    paymentAuthorization = verifyAuthorization(options, config, { ...expected, phase: 'payment' }, options.paymentTag);
    ledger.assertUnused(paymentAuthorization.auth);
  }

  const branch = options.phase === 'promotion' ? 'staging' : 'master';
  const currentRemoteSha = remoteSha(config, branch);
  if (currentRemoteSha !== options.targetSha) throw new ReleaseControllerError('REMOTE_MOVED', `origin/${branch} moved: expected=${options.targetSha} actual=${currentRemoteSha}`);
  const live = liveGithubEvidence(config, expected.prNumber, options.targetSha);
  validateLiveGithubEvidence(live, evidence, options.phase);

  if (options.phase === 'production' && options.accuracyProof) {
    validateAccuracyProofBundle(readJson(options.accuracyProof, 'production accuracy proof'), inventory, options.targetSha);
  }

  if (options.phase === 'production') {
    // Dry-run validates credential presence and fixed command construction without using the credential.
    buildRemoteDeployArgs(config, options.targetSha);
  }

  const plan = {
    status: 'authorized_pre_checkout',
    dry_run: options.dryRun,
    phase: options.phase,
    target_sha: options.targetSha,
    tag: options.tag,
    signer_fingerprint: authorization.signerFingerprint,
    payment_tag: paymentAuthorization?.tag || null,
    inventory_sha256: inventoryHash,
    evidence_sha256: evidenceHash,
    pr_number: expected.prNumber,
  };
  if (options.dryRun) return plan;

  let worktree;
  try {
    worktree = createWorktree({ gitBin: config.git_bin, gitDir: config.git_mirror, targetSha: options.targetSha, worktreeRoot: config.worktree_root });
    const qualification = runQualification({
      worktree,
      targetSha: options.targetSha,
      commands: config.qualification_commands?.[options.phase],
      timeoutMs: Number(config.qualification_timeout_ms || 1_800_000),
      env: process.env,
    });

    ledger.reserve(authorization.auth, { signerFingerprint: authorization.signerFingerprint, tag: options.tag });
    if (paymentAuthorization) ledger.reserve(paymentAuthorization.auth, { signerFingerprint: paymentAuthorization.signerFingerprint, tag: options.paymentTag });

    if (options.phase === 'promotion') {
      const result = run(config.gh_bin || 'gh', ['pr', 'merge', String(expected.prNumber), '--repo', config.repository, '--merge', '--match-head-commit', options.targetSha]);
      requireCommand(result, 'PROMOTION_MERGE_FAILED', `Merge PR #${expected.prNumber}`);
    } else {
      const result = run(config.ssh_bin || 'ssh', buildRemoteDeployArgs(config, options.targetSha), { timeoutMs: Number(config.deploy_timeout_ms || 1_800_000) });
      requireCommand(result, 'PRODUCTION_DEPLOY_FAILED', 'Execute fixed production deploy command');
    }

    ledger.complete(authorization.auth, 'completed', { qualification });
    if (paymentAuthorization) ledger.complete(paymentAuthorization.auth, 'completed', { qualification });
    return { ...plan, status: 'completed', qualification };
  } catch (error) {
    try {
      const ledgerPath = ledger.entryPath(authorization.auth);
      if (fs.existsSync(ledgerPath)) ledger.complete(authorization.auth, 'failed', { code: error.code || 'UNEXPECTED' });
      if (paymentAuthorization && fs.existsSync(ledger.entryPath(paymentAuthorization.auth))) {
        ledger.complete(paymentAuthorization.auth, 'failed', { code: error.code || 'UNEXPECTED' });
      }
    } catch (_) {
      // Preserve the original failure; ledger repair is an operator incident.
    }
    throw error;
  } finally {
    if (worktree) removeWorktree({ gitBin: config.git_bin, gitDir: config.git_mirror }, worktree);
  }
}

function main() {
  try {
    const result = controllerMain(parseArgs(process.argv.slice(2)));
    process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
  } catch (error) {
    if (error instanceof ReleaseControllerError) {
      console.error(`[release-controller] ${error.code}: ${error.message}`);
      process.exit(1);
    }
    throw error;
  }
}

if (require.main === module) main();

module.exports = { parseArgs, loadConfig, refreshMirror, remoteSha, liveGithubEvidence, verifyAuthorization, controllerMain };
