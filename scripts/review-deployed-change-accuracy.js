#!/usr/bin/env node

const crypto = require('crypto');
const fs = require('fs');
const path = require('path');

const ALLOWED_PROOF_TYPES = new Set(['api', 'ui', 'database_readonly', 'asset']);
const PLACEHOLDER_PATTERN = /(?:placeholder|not provided|todo|tbd|example\.invalid|needs proof)/i;

class AccuracyReviewError extends Error {
  constructor(message, options = {}) {
    super(message);
    this.name = 'AccuracyReviewError';
    this.code = options.code || 'ACCURACY_REVIEW_FAILED';
    this.report = options.report || null;
  }
}

function parseArgs(argv) {
  const options = {
    inventoryPath: process.env.BATCH_INVENTORY_FILE || '',
    deploySummaryPath: process.env.PRODUCTION_DEPLOY_SUMMARY || '',
    productionContractPath: process.env.PRODUCTION_CONTRACT_FILE || '',
    proofBundlePath: process.env.DEPLOYED_ACCURACY_PROOF_BUNDLE || '',
    outputPath: process.env.DEPLOYED_CHANGE_ACCURACY_REPORT || '',
    markdownPath: process.env.DEPLOYED_CHANGE_ACCURACY_MARKDOWN || '',
  };
  const mapping = {
    '--inventory': 'inventoryPath',
    '--deploy-summary': 'deploySummaryPath',
    '--production-contract': 'productionContractPath',
    '--proof-bundle': 'proofBundlePath',
    '--output': 'outputPath',
    '--markdown': 'markdownPath',
  };
  for (let index = 0; index < argv.length; index += 1) {
    const field = mapping[argv[index]];
    if (!field) throw new AccuracyReviewError(`Unknown argument: ${argv[index]}`, { code: 'INVALID_ARGS' });
    options[field] = argv[++index] || '';
  }
  for (const field of ['inventoryPath', 'deploySummaryPath', 'productionContractPath', 'proofBundlePath']) {
    if (!options[field]) throw new AccuracyReviewError(`Missing required ${field}`, { code: 'INVALID_ARGS' });
  }
  return options;
}

function readJson(filePath, label) {
  if (!fs.existsSync(filePath)) throw new AccuracyReviewError(`${label} not found: ${filePath}`, { code: 'EVIDENCE_MISSING' });
  try {
    return JSON.parse(fs.readFileSync(filePath, 'utf8'));
  } catch (error) {
    throw new AccuracyReviewError(`${label} is invalid JSON: ${error.message}`, { code: 'EVIDENCE_INVALID' });
  }
}

function readSummary(filePath) {
  if (!fs.existsSync(filePath)) throw new AccuracyReviewError(`Deploy summary not found: ${filePath}`, { code: 'EVIDENCE_MISSING' });
  const values = {};
  for (const line of fs.readFileSync(filePath, 'utf8').split(/\r?\n/)) {
    const index = line.indexOf('=');
    if (index > 0) values[line.slice(0, index)] = line.slice(index + 1);
  }
  return values;
}

function sha256File(filePath) {
  return crypto.createHash('sha256').update(fs.readFileSync(filePath)).digest('hex');
}

function normalizeSlices(inventory) {
  return Array.isArray(inventory.release_slices) ? inventory.release_slices : (inventory.batches || []);
}

function review(options) {
  const inventory = readJson(options.inventoryPath, 'Inventory');
  const summary = readSummary(options.deploySummaryPath);
  const productionContract = readJson(options.productionContractPath, 'Production contract');
  const proofBundle = readJson(options.proofBundlePath, 'Accuracy proof bundle');
  const targetSha = inventory.head_sha;
  const failures = [];
  const requireValue = (condition, message) => { if (!condition) failures.push(message); };

  requireValue(/^[0-9a-f]{40}$/.test(targetSha || ''), 'inventory target SHA is invalid');
  for (const field of ['deployed_head', 'remote_head', 'expected_commit']) {
    requireValue(summary[field] === targetSha, `deploy summary ${field} does not match target`);
  }
  requireValue(productionContract.ok === true, 'production contract is not successful');
  requireValue(productionContract.target_sha === targetSha, 'production contract target SHA mismatch');
  requireValue(productionContract.git_head === targetSha, 'production contract git HEAD mismatch');
  requireValue(productionContract.deploy_state_sha === targetSha, 'production contract deploy-state SHA mismatch');
  requireValue(Array.isArray(productionContract.health) && productionContract.health.length > 0, 'production contract health proof is missing');
  requireValue((productionContract.health || []).every((entry) => entry.ok === true && entry.runtime_sha === targetSha), 'production runtime health SHA mismatch');
  requireValue(summary.frontend_asset_parity_status === 'pass', 'frontend asset parity did not pass');

  requireValue(proofBundle.schema === 'sku-deployed-accuracy-proof/v1', 'accuracy proof schema is invalid');
  requireValue(proofBundle.target_sha === targetSha, 'accuracy proof target SHA mismatch');
  const contractTime = Date.parse(productionContract.generated_at || '');
  const proofs = Array.isArray(proofBundle.proofs) ? proofBundle.proofs : [];
  const sliceReviews = [];

  for (const slice of normalizeSlices(inventory)) {
    const sliceId = slice.id;
    const sliceProofs = proofs.filter((proof) => proof.slice_id === sliceId);
    const sliceFailures = [];
    if (sliceProofs.length === 0) sliceFailures.push('no proof records');
    for (const proof of sliceProofs) {
      if (!ALLOWED_PROOF_TYPES.has(proof.type)) sliceFailures.push(`unsupported proof type: ${proof.type}`);
      if (proof.status !== 'pass') sliceFailures.push(`proof status is not pass: ${proof.type}`);
      if (proof.target_sha !== targetSha) sliceFailures.push(`proof target mismatch: ${proof.type}`);
      if (!proof.subject || PLACEHOLDER_PATTERN.test(proof.subject)) sliceFailures.push(`proof subject is missing or placeholder: ${proof.type}`);
      if (proof.type === 'database_readonly' && proof.read_only !== true) sliceFailures.push('database proof is not explicitly read-only');
      const capturedAt = Date.parse(proof.captured_at || '');
      if (!Number.isFinite(capturedAt) || !Number.isFinite(contractTime) || capturedAt < contractTime || capturedAt > Date.now() + 60_000) {
        sliceFailures.push(`proof capture time is stale or invalid: ${proof.type}`);
      }
      if (!proof.artifact_path || !fs.existsSync(proof.artifact_path)) {
        sliceFailures.push(`proof artifact is missing: ${proof.type}`);
      } else if (!/^[0-9a-f]{64}$/.test(proof.artifact_sha256 || '') || sha256File(proof.artifact_path) !== proof.artifact_sha256) {
        sliceFailures.push(`proof artifact hash mismatch: ${proof.type}`);
      }
    }
    failures.push(...sliceFailures.map((message) => `slice ${sliceId}: ${message}`));
    sliceReviews.push({
      slice_id: sliceId,
      slice_name: slice.slice_name || slice.name,
      accuracy_state: sliceFailures.length === 0 ? 'accurately_reflected' : 'deployed_but_behavior_not_proven',
      proof_count: sliceProofs.length,
      failures: sliceFailures,
    });
  }

  const report = {
    version: 2,
    generated_at: new Date().toISOString(),
    target_sha: targetSha,
    status: failures.length === 0 ? 'pass' : 'fail',
    completion_state: failures.length === 0 ? 'accurately_reflected' : 'blocked',
    markers: {
      deployed_head: summary.deployed_head || '',
      remote_head: summary.remote_head || '',
      expected_commit: summary.expected_commit || '',
      runtime_sha: productionContract.health?.[0]?.runtime_sha || '',
      frontend_asset_parity_status: summary.frontend_asset_parity_status || '',
    },
    proof_bundle_sha256: sha256File(options.proofBundlePath),
    failures,
    release_slices: sliceReviews,
    batches: sliceReviews,
  };

  if (options.outputPath) {
    fs.mkdirSync(path.dirname(path.resolve(options.outputPath)), { recursive: true });
    fs.writeFileSync(options.outputPath, `${JSON.stringify(report, null, 2)}\n`);
  }
  if (options.markdownPath) {
    const lines = [
      '## Deployed-Change Accuracy Review',
      '',
      `- Target SHA: \`${targetSha}\``,
      `- Status: \`${report.status}\``,
      `- Completion state: \`${report.completion_state}\``,
      '',
      ...sliceReviews.flatMap((slice) => [
        `### ${slice.slice_name}`,
        `- Accuracy state: \`${slice.accuracy_state}\``,
        `- Proof count: ${slice.proof_count}`,
        ...slice.failures.map((failure) => `- Failure: ${failure}`),
        '',
      ]),
    ];
    fs.mkdirSync(path.dirname(path.resolve(options.markdownPath)), { recursive: true });
    fs.writeFileSync(options.markdownPath, `${lines.join('\n').trim()}\n`);
  }
  if (failures.length > 0) throw new AccuracyReviewError(`Production accuracy proof failed closed with ${failures.length} failure(s)`, { code: 'ACCURACY_PROOF_FAILED', report });
  console.log(`[accuracy-review] PASS target=${targetSha} slices=${sliceReviews.length}`);
  return report;
}

function main() {
  try {
    review(parseArgs(process.argv.slice(2)));
  } catch (error) {
    if (error instanceof AccuracyReviewError) {
      console.error(`[accuracy-review] ${error.code}: ${error.message}`);
      process.exit(1);
    }
    throw error;
  }
}

if (require.main === module) main();

module.exports = { AccuracyReviewError, parseArgs, review, sha256File };
