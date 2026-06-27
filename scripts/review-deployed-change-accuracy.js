#!/usr/bin/env node

const fs = require('fs');
const path = require('path');

class AccuracyReviewError extends Error {
  constructor(message, options = {}) {
    super(message);
    this.name = 'AccuracyReviewError';
    this.code = options.code || 'ACCURACY_REVIEW_FAILED';
  }
}

function parseArgs(argv) {
  const options = {
    inventoryPath: process.env.BATCH_INVENTORY_FILE || '',
    deploySummaryPath: process.env.PRODUCTION_DEPLOY_SUMMARY || '',
    productionContractPath: process.env.PRODUCTION_CONTRACT_FILE || '',
    outputPath: process.env.DEPLOYED_CHANGE_ACCURACY_REPORT || '',
    markdownPath: process.env.DEPLOYED_CHANGE_ACCURACY_MARKDOWN || '',
  };

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === '--inventory') {
      options.inventoryPath = argv[index + 1] || '';
      index += 1;
    } else if (arg === '--deploy-summary') {
      options.deploySummaryPath = argv[index + 1] || '';
      index += 1;
    } else if (arg === '--production-contract') {
      options.productionContractPath = argv[index + 1] || '';
      index += 1;
    } else if (arg === '--output') {
      options.outputPath = argv[index + 1] || '';
      index += 1;
    } else if (arg === '--markdown') {
      options.markdownPath = argv[index + 1] || '';
      index += 1;
    } else {
      throw new AccuracyReviewError(`Unknown argument: ${arg}`, { code: 'INVALID_ARGS' });
    }
  }

  if (!options.inventoryPath) throw new AccuracyReviewError('Missing --inventory', { code: 'INVALID_ARGS' });
  return options;
}

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, 'utf8'));
}

function readSummary(filePath) {
  if (!filePath || !fs.existsSync(filePath)) return {};
  const values = {};
  for (const line of fs.readFileSync(filePath, 'utf8').split(/\r?\n/)) {
    const index = line.indexOf('=');
    if (index > 0) values[line.slice(0, index)] = line.slice(index + 1);
  }
  return values;
}

function review(options) {
  if (!fs.existsSync(options.inventoryPath)) {
    throw new AccuracyReviewError(`Inventory file not found: ${options.inventoryPath}`, { code: 'INVENTORY_NOT_FOUND' });
  }

  const inventory = readJson(options.inventoryPath);
  const summary = readSummary(options.deploySummaryPath);
  const productionContract = options.productionContractPath && fs.existsSync(options.productionContractPath)
    ? readJson(options.productionContractPath)
    : null;
  const targetSha = inventory.head_sha;
  const markers = {
    deployed_head: summary.deployed_head || '',
    remote_head: summary.remote_head || '',
    expected_commit: summary.expected_commit || '',
    production_contract_status: productionContract ? productionContract.status || productionContract.verdict || 'present' : 'missing',
  };

  const markerMismatch = [markers.deployed_head, markers.remote_head, markers.expected_commit]
    .filter(Boolean)
    .some((sha) => sha !== targetSha);

  const batchReviews = (inventory.batches || []).map((batch) => ({
    batch_name: batch.name,
    intended_verdict: batch.verdict,
    production_status: markerMismatch ? 'deployed but behavior not proven' : 'deployed but behavior not proven',
    required_live_proof: batch.production_validation_proof || [],
    accuracy_decision_required: true,
    notes: 'Automated SHA/contract markers are only the first proof. Run the listed live/API/UI/database-safe proof before marking accurately reflected.',
  }));

  const report = {
    version: 1,
    generated_at: new Date().toISOString(),
    target_sha: targetSha,
    marker_mismatch: markerMismatch,
    markers,
    status: markerMismatch ? 'blocked' : 'needs-live-proof',
    batches: batchReviews,
  };

  if (options.outputPath) {
    fs.mkdirSync(path.dirname(path.resolve(options.outputPath)), { recursive: true });
    fs.writeFileSync(options.outputPath, JSON.stringify(report, null, 2));
  }

  if (options.markdownPath) {
    const lines = [
      '## Deployed-Change Accuracy Review',
      '',
      `- Target SHA: \`${targetSha}\``,
      `- Status: \`${report.status}\``,
      `- Deployed head: \`${markers.deployed_head || 'missing'}\``,
      `- Remote head: \`${markers.remote_head || 'missing'}\``,
      `- Expected commit: \`${markers.expected_commit || 'missing'}\``,
      '',
    ];
    for (const batch of batchReviews) {
      lines.push(`### ${batch.batch_name}`);
      lines.push(`- Production status: \`${batch.production_status}\``);
      lines.push('- Required live proof:');
      for (const proof of batch.required_live_proof) lines.push(`  - ${proof}`);
      lines.push('');
    }
    fs.mkdirSync(path.dirname(path.resolve(options.markdownPath)), { recursive: true });
    fs.writeFileSync(options.markdownPath, `${lines.join('\n').trim()}\n`);
  }

  console.log(`[accuracy-review] ${report.status} target=${targetSha}`);
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

module.exports = {
  AccuracyReviewError,
  parseArgs,
  review,
};
