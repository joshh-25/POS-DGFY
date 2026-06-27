#!/usr/bin/env node

const { spawnSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const VALID_VERDICTS = new Set(['ship', 'split', 'fix first', 'defer', 'blocked']);
const PAYMENT_PATTERNS = [
  /paymongo/i,
  /payment/i,
  /payments/i,
  /billing/i,
  /commerce[-_/]?payment/i,
  /webhook/i,
  /^docs\/architecture\/adr\/0027-/i,
  /^docs\/features\/PAYMONGO_QRPH_COMMERCE_PAYMENTS\.md$/i,
];

class BatchInventoryError extends Error {
  constructor(message, options = {}) {
    super(message);
    this.name = 'BatchInventoryError';
    this.code = options.code || 'BATCH_INVENTORY_FAILED';
    this.report = options.report || null;
  }
}

function parseArgs(argv) {
  const options = {
    projectRoot: process.cwd(),
    base: process.env.BATCH_INVENTORY_BASE || 'origin/master',
    head: process.env.BATCH_INVENTORY_HEAD || process.env.RELEASE_TARGET_SHA || process.env.GITHUB_SHA || 'HEAD',
    inventoryPath: process.env.BATCH_INVENTORY_FILE || '',
    markdownPath: process.env.BATCH_INVENTORY_MARKDOWN || '',
    write: false,
    requireApprovedPayments: process.env.PAYMENT_RELEASE_APPROVED === '1',
    requireShip: process.env.BATCH_INVENTORY_REQUIRE_SHIP === '1',
  };

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === '--project-root') {
      options.projectRoot = path.resolve(argv[index + 1] || '');
      index += 1;
    } else if (arg === '--base') {
      options.base = argv[index + 1] || '';
      index += 1;
    } else if (arg === '--head') {
      options.head = argv[index + 1] || '';
      index += 1;
    } else if (arg === '--inventory') {
      options.inventoryPath = argv[index + 1] || '';
      index += 1;
    } else if (arg === '--markdown') {
      options.markdownPath = argv[index + 1] || '';
      index += 1;
    } else if (arg === '--write') {
      options.write = true;
    } else if (arg === '--require-ship') {
      options.requireShip = true;
    } else if (arg === '--payment-approved') {
      options.requireApprovedPayments = true;
    } else {
      throw new BatchInventoryError(`Unknown argument: ${arg}`, { code: 'INVALID_ARGS' });
    }
  }

  if (!options.projectRoot) throw new BatchInventoryError('Missing project root', { code: 'INVALID_ARGS' });
  if (!options.base) throw new BatchInventoryError('Missing base ref', { code: 'INVALID_ARGS' });
  if (!options.head) throw new BatchInventoryError('Missing head ref', { code: 'INVALID_ARGS' });
  return options;
}

function runGit(projectRoot, args) {
  const result = spawnSync('git', args, { cwd: projectRoot, encoding: 'utf8' });
  return {
    ok: result.status === 0,
    stdout: result.stdout || '',
    stderr: result.stderr || '',
    status: result.status,
  };
}

function resolveCommit(projectRoot, ref) {
  const result = runGit(projectRoot, ['rev-parse', '--verify', `${ref}^{commit}`]);
  if (!result.ok) {
    throw new BatchInventoryError(`Could not resolve ref ${ref}: ${result.stderr.trim() || result.status}`, {
      code: 'REF_NOT_FOUND',
    });
  }
  return result.stdout.trim();
}

function mergeBase(projectRoot, base, head) {
  const result = runGit(projectRoot, ['merge-base', base, head]);
  if (!result.ok) {
    throw new BatchInventoryError(`Could not compute merge-base for ${base}...${head}: ${result.stderr.trim()}`, {
      code: 'MERGE_BASE_FAILED',
    });
  }
  return result.stdout.trim();
}

function changedFiles(projectRoot, base, head) {
  const common = mergeBase(projectRoot, base, head);
  const result = runGit(projectRoot, ['diff', '--name-only', `${common}...${head}`, '--']);
  if (!result.ok) {
    throw new BatchInventoryError(`Could not inspect diff: ${result.stderr.trim() || result.status}`, {
      code: 'DIFF_FAILED',
    });
  }
  return result.stdout.split(/\r?\n/).filter(Boolean).map((filePath) => filePath.replace(/\\/g, '/'));
}

function surfaceForFile(filePath) {
  if (filePath.startsWith('backend/')) return 'backend';
  if (filePath.startsWith('frontend/')) return 'frontend';
  if (filePath.startsWith('docs/')) return 'docs';
  if (filePath.startsWith('scripts/')) return 'scripts';
  if (filePath.startsWith('.github/')) return 'infra';
  if (/migration/i.test(filePath)) return 'database';
  return 'infra';
}

function isPaymentSensitive(filePath) {
  return PAYMENT_PATTERNS.some((pattern) => pattern.test(filePath));
}

function inferTests(surfaces, paymentSensitive) {
  const tests = ['npm run lint:docs', 'npm run check:architecture'];
  if (surfaces.includes('backend')) tests.push('npm run test:backend:matrix');
  if (surfaces.includes('frontend')) tests.push('npm run test:frontend', 'npm --prefix frontend run build:all');
  if (surfaces.includes('scripts') || surfaces.includes('infra')) tests.push('npm run test:development-to-production');
  if (paymentSensitive) tests.push('npm run check:compliance', 'payment-release approval evidence');
  return Array.from(new Set(tests));
}

function buildInventory(options) {
  const projectRoot = path.resolve(options.projectRoot);
  const baseSha = resolveCommit(projectRoot, options.base);
  const headSha = resolveCommit(projectRoot, options.head);
  const files = changedFiles(projectRoot, options.base, options.head);
  const surfaces = Array.from(new Set(files.map(surfaceForFile))).sort();
  const paymentFiles = files.filter(isPaymentSensitive);
  const paymentSensitive = paymentFiles.length > 0;
  const verdict = paymentSensitive && !options.requireApprovedPayments ? 'blocked' : 'ship';
  const riskLevel = paymentSensitive ? 'high' : surfaces.some((surface) => ['backend', 'database', 'infra'].includes(surface)) ? 'medium' : 'low';

  const batch = {
    name: paymentSensitive ? 'Payment-sensitive release candidate' : 'Development-to-production release candidate',
    purpose: 'Promote the exact qualified candidate SHA through staging, master, production deployment, and live accuracy review.',
    included_files: files,
    excluded_files: [],
    risk_level: riskLevel,
    affected_surfaces: surfaces,
    required_tests: inferTests(surfaces, paymentSensitive),
    required_docs: ['docs/ops/DEVELOPMENT_TO_PRODUCTION_WORKFLOW.md'],
    adr_or_compliance: paymentSensitive
      ? 'Payment-sensitive candidate: explicit payment-release approval and ADR 0027/payment gates required.'
      : 'ADR not required unless implementation changes runtime ownership, data contracts, payment behavior, or architecture boundaries.',
    commit_boundary: `${options.base}...${options.head}`,
    rollback_notes: 'Revert the promoted master merge commit, re-run exact-SHA qualification, and deploy the revert SHA through the same governed workflow.',
    production_validation_proof: [
      'production remote HEAD',
      '.deploy-state/last_deployed_commit',
      'newest deploy summary deployed_head/remote_head/expected_commit',
      '/api/v1/health services.observability.runtime_sha',
      'frontend asset parity',
      'feature-specific smoke or browser proof for each batch',
    ],
    can_ship_independently: files.length > 0 && verdict === 'ship',
    verdict,
    payment_sensitive: paymentSensitive,
    payment_sensitive_files: paymentFiles,
  };

  return {
    version: 1,
    generated_at: new Date().toISOString(),
    base_ref: options.base,
    base_sha: baseSha,
    head_ref: options.head,
    head_sha: headSha,
    changed_file_count: files.length,
    payment_release_approved: options.requireApprovedPayments,
    status: verdict === 'ship' ? 'pass' : 'blocked',
    batches: files.length > 0 ? [batch] : [],
  };
}

function validateInventory(inventory, options) {
  const failures = [];
  if (inventory.version !== 1) failures.push('inventory.version must be 1');
  if (!inventory.head_sha) failures.push('inventory.head_sha is required');
  if (!Array.isArray(inventory.batches)) failures.push('inventory.batches must be an array');
  if (inventory.changed_file_count > 0 && inventory.batches.length === 0) {
    failures.push('changed files require at least one batch');
  }

  const seenFiles = new Set();
  for (const batch of inventory.batches || []) {
    for (const field of [
      'name',
      'purpose',
      'risk_level',
      'adr_or_compliance',
      'commit_boundary',
      'rollback_notes',
      'verdict',
    ]) {
      if (!batch[field]) failures.push(`batch ${batch.name || '<unnamed>'} missing ${field}`);
    }
    for (const field of ['included_files', 'affected_surfaces', 'required_tests', 'required_docs', 'production_validation_proof']) {
      if (!Array.isArray(batch[field]) || batch[field].length === 0) {
        failures.push(`batch ${batch.name || '<unnamed>'} requires non-empty ${field}`);
      }
    }
    if (!VALID_VERDICTS.has(batch.verdict)) failures.push(`invalid batch verdict: ${batch.verdict}`);
    if (options.requireShip && batch.verdict !== 'ship') failures.push(`batch is not ship-ready: ${batch.name}`);
    for (const filePath of batch.included_files || []) {
      if (seenFiles.has(filePath)) failures.push(`file appears in more than one batch: ${filePath}`);
      seenFiles.add(filePath);
    }
    if (batch.payment_sensitive && !inventory.payment_release_approved) {
      failures.push(`payment-sensitive batch requires PAYMENT_RELEASE_APPROVED=1: ${batch.name}`);
    }
  }

  if (seenFiles.size !== inventory.changed_file_count) {
    failures.push(`batch file coverage mismatch: covered=${seenFiles.size} changed=${inventory.changed_file_count}`);
  }

  return failures;
}

function toMarkdown(inventory) {
  const lines = [
    '## Batch Inventory',
    '',
    `- Candidate SHA: \`${inventory.head_sha}\``,
    `- Base SHA: \`${inventory.base_sha}\``,
    `- Changed files: ${inventory.changed_file_count}`,
    `- Status: \`${inventory.status}\``,
    '',
  ];

  for (const batch of inventory.batches) {
    lines.push(`### ${batch.name}`);
    lines.push('');
    lines.push(`- Purpose: ${batch.purpose}`);
    lines.push(`- Verdict: \`${batch.verdict}\``);
    lines.push(`- Risk: \`${batch.risk_level}\``);
    lines.push(`- Surfaces: ${batch.affected_surfaces.join(', ') || 'none'}`);
    lines.push(`- Payment sensitive: ${batch.payment_sensitive ? 'yes' : 'no'}`);
    lines.push(`- Commit boundary: \`${batch.commit_boundary}\``);
    lines.push(`- ADR/compliance: ${batch.adr_or_compliance}`);
    lines.push(`- Rollback: ${batch.rollback_notes}`);
    lines.push('');
    lines.push('Required tests:');
    for (const testCommand of batch.required_tests) lines.push(`- \`${testCommand}\``);
    lines.push('');
    lines.push('Production proof required:');
    for (const proof of batch.production_validation_proof) lines.push(`- ${proof}`);
    lines.push('');
    lines.push('Included files:');
    for (const filePath of batch.included_files) lines.push(`- \`${filePath}\``);
    lines.push('');
  }

  return `${lines.join('\n').trim()}\n`;
}

function writeFile(filePath, content) {
  if (!filePath) return;
  fs.mkdirSync(path.dirname(path.resolve(filePath)), { recursive: true });
  fs.writeFileSync(filePath, content);
}

function checkBatchInventory(options, logger = console) {
  const inventory = buildInventory(options);
  const failures = validateInventory(inventory, options);
  const markdown = toMarkdown(inventory);

  if (options.write) {
    if (options.inventoryPath) writeFile(options.inventoryPath, JSON.stringify(inventory, null, 2));
    if (options.markdownPath) writeFile(options.markdownPath, markdown);
  }

  if (failures.length > 0) {
    throw new BatchInventoryError(failures.join('\n'), {
      code: 'BATCH_INVENTORY_FAILED',
      report: inventory,
    });
  }

  logger.log(
    `[batch-inventory] PASS status=${inventory.status} head=${inventory.head_sha.slice(0, 12)} files=${inventory.changed_file_count}`
  );
  return { inventory, markdown };
}

function main() {
  try {
    const options = parseArgs(process.argv.slice(2));
    checkBatchInventory(options);
  } catch (error) {
    if (error instanceof BatchInventoryError) {
      console.error(`[batch-inventory] ${error.code}: ${error.message}`);
      process.exit(1);
    }
    throw error;
  }
}

if (require.main === module) main();

module.exports = {
  BatchInventoryError,
  PAYMENT_PATTERNS,
  parseArgs,
  buildInventory,
  validateInventory,
  checkBatchInventory,
  toMarkdown,
};
