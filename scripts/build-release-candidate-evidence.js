#!/usr/bin/env node

const crypto = require('crypto');
const fs = require('fs');
const path = require('path');

class CandidateEvidenceError extends Error {
  constructor(code, message) {
    super(message);
    this.name = 'CandidateEvidenceError';
    this.code = code;
  }
}

function parseArgs(argv) {
  const options = { projectRoot: process.cwd() };
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (['--phase', '--target-sha', '--inventory', '--pr-evidence', '--qa-proof', '--local-qualification', '--master-audit', '--output'].includes(arg)) {
      options[arg.slice(2).replace(/-([a-z])/g, (_, char) => char.toUpperCase())] = argv[++index] || '';
    } else if (arg === '--project-root') {
      options.projectRoot = path.resolve(argv[++index] || '');
    } else {
      throw new CandidateEvidenceError('INVALID_ARGS', `Unknown argument: ${arg}`);
    }
  }
  for (const field of ['phase', 'targetSha', 'inventory', 'prEvidence', 'qaProof', 'localQualification', 'output']) {
    if (!options[field]) throw new CandidateEvidenceError('INVALID_ARGS', `Missing required option: ${field}`);
  }
  if (!['promotion', 'production'].includes(options.phase)) throw new CandidateEvidenceError('INVALID_ARGS', '--phase must be promotion or production');
  if (!/^[0-9a-f]{40}$/.test(options.targetSha)) throw new CandidateEvidenceError('INVALID_ARGS', '--target-sha must be a lowercase 40-character SHA');
  if (options.phase === 'production' && !options.masterAudit) throw new CandidateEvidenceError('INVALID_ARGS', 'Production evidence requires --master-audit');
  return options;
}

function readJson(projectRoot, filePath, label) {
  const absolute = path.resolve(projectRoot, filePath);
  if (!fs.existsSync(absolute)) throw new CandidateEvidenceError('EVIDENCE_INPUT_MISSING', `${label} is missing: ${filePath}`);
  return JSON.parse(fs.readFileSync(absolute, 'utf8'));
}

function hashFile(projectRoot, filePath) {
  return crypto.createHash('sha256').update(fs.readFileSync(path.resolve(projectRoot, filePath))).digest('hex');
}

function buildCandidateEvidence(options) {
  const inventory = readJson(options.projectRoot, options.inventory, 'inventory');
  const pr = readJson(options.projectRoot, options.prEvidence, 'PR evidence');
  const qa = readJson(options.projectRoot, options.qaProof, 'QA proof');
  const localQualification = readJson(options.projectRoot, options.localQualification, 'local qualification');
  const masterAudit = options.masterAudit ? readJson(options.projectRoot, options.masterAudit, 'master audit') : null;
  if (inventory.head_sha !== options.targetSha) throw new CandidateEvidenceError('INVENTORY_SHA_MISMATCH', 'Inventory target does not match candidate');
  if (inventory.review_status !== 'reviewed') throw new CandidateEvidenceError('INVENTORY_NOT_REVIEWED', 'Candidate evidence requires reviewed inventory');
  if (qa.status !== 'pass' || qa.target_sha !== options.targetSha) throw new CandidateEvidenceError('QA_PROOF_INVALID', 'QA proof is missing, failed, or stale');
  if (localQualification.status !== 'pass' || localQualification.target_sha !== options.targetSha) throw new CandidateEvidenceError('LOCAL_QUALIFICATION_INVALID', 'Local qualification is missing, failed, or stale');
  if (options.phase === 'production' && (masterAudit.status !== 'pass' || masterAudit.target_sha !== options.targetSha)) {
    throw new CandidateEvidenceError('MASTER_AUDIT_INVALID', 'Production evidence requires a passing exact-SHA master audit');
  }

  return {
    schema: 'sku-release-evidence/v1',
    version: 1,
    generated_at: new Date().toISOString(),
    repository: pr.repository,
    phase: options.phase,
    target_sha: options.targetSha,
    pr: {
      number: pr.number,
      base: pr.base,
      head: pr.head,
      head_sha: pr.head_sha,
      merge_commit_sha: pr.merge_commit_sha || null,
    },
    required_checks: (pr.checks || []).map((check) => ({ name: check.name, conclusion: check.conclusion, details_url: check.details_url })),
    inventory_sha256: hashFile(options.projectRoot, options.inventory),
    payment_sensitive: Boolean(inventory.payment_sensitive),
    qa: { status: qa.status, target_sha: qa.target_sha, isolated: qa.isolated === true, report_sha256: hashFile(options.projectRoot, options.qaProof) },
    local_qualification: { status: localQualification.status, target_sha: localQualification.target_sha, report_sha256: hashFile(options.projectRoot, options.localQualification) },
    master_audit: masterAudit ? { status: masterAudit.status, target_sha: masterAudit.target_sha, governed_promotion: masterAudit.governed_promotion === true, report_sha256: hashFile(options.projectRoot, options.masterAudit) } : null,
  };
}

function main() {
  try {
    const options = parseArgs(process.argv.slice(2));
    const evidence = buildCandidateEvidence(options);
    const output = path.resolve(options.projectRoot, options.output);
    fs.mkdirSync(path.dirname(output), { recursive: true });
    fs.writeFileSync(output, `${JSON.stringify(evidence, null, 2)}\n`);
    console.log(`[candidate-evidence] PASS phase=${evidence.phase} target=${evidence.target_sha} output=${options.output}`);
  } catch (error) {
    if (error instanceof CandidateEvidenceError) {
      console.error(`[candidate-evidence] ${error.code}: ${error.message}`);
      process.exit(1);
    }
    throw error;
  }
}

if (require.main === module) main();

module.exports = { CandidateEvidenceError, parseArgs, buildCandidateEvidence };
