#!/usr/bin/env node

const crypto = require('crypto');
const fs = require('fs');
const path = require('path');

const {
  BatchInventoryError,
  buildDocumentationClosureReport,
  changedFiles,
  resolveCommit,
} = require('./check-batch-inventory');

function parseArgs(argv) {
  const options = {
    projectRoot: process.cwd(),
    inventoryPath: process.env.BATCH_INVENTORY_FILE || '',
    base: process.env.BATCH_INVENTORY_BASE || '',
    head: process.env.BATCH_INVENTORY_HEAD || process.env.RELEASE_TARGET_SHA || '',
    outputPath: process.env.DOCUMENTATION_CLOSURE_REPORT || '',
    markdownPath: process.env.DOCUMENTATION_CLOSURE_MARKDOWN || '',
  };
  const mapping = {
    '--inventory': 'inventoryPath',
    '--base': 'base',
    '--head': 'head',
    '--output': 'outputPath',
    '--markdown': 'markdownPath',
  };
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === '--project-root') {
      options.projectRoot = path.resolve(argv[++index] || '');
      continue;
    }
    const field = mapping[arg];
    if (!field) throw new BatchInventoryError(`Unknown argument: ${arg}`, { code: 'INVALID_ARGS' });
    options[field] = argv[++index] || '';
  }
  for (const field of ['inventoryPath', 'base', 'head', 'outputPath']) {
    if (!options[field]) throw new BatchInventoryError(`Missing required option: ${field}`, { code: 'INVALID_ARGS' });
  }
  return options;
}

function sha256File(filePath) {
  return crypto.createHash('sha256').update(fs.readFileSync(filePath)).digest('hex');
}

function toMarkdown(report) {
  const lines = [
    '## Documentation Closure',
    '',
    `- Target SHA: \`${report.target_sha}\``,
    `- Status: \`${report.status}\``,
    '- Bypassable: no',
    '',
  ];
  for (const slice of report.release_slices) {
    lines.push(`### ${slice.slice_name}`);
    lines.push(`- Status: \`${slice.status}\``);
    lines.push(`- Architecture: \`${slice.architecture_classification}\``);
    lines.push(`- Decision: \`${slice.decision}\``);
    lines.push(`- Reviewer: \`${slice.reviewed_by}\``);
    for (const document of slice.documents) lines.push(`- \`${document.path}\` -> \`${document.action}\``);
    for (const failure of slice.failures) lines.push(`- Failure: ${failure}`);
    lines.push('');
  }
  return `${lines.join('\n').trim()}\n`;
}

function checkDocumentationClosure(options, logger = console) {
  const inventoryAbsolute = path.resolve(options.projectRoot, options.inventoryPath);
  if (!fs.existsSync(inventoryAbsolute)) throw new BatchInventoryError(`Inventory is missing: ${options.inventoryPath}`, { code: 'INVENTORY_MISSING' });
  const inventory = JSON.parse(fs.readFileSync(inventoryAbsolute, 'utf8'));
  const resolvedHead = resolveCommit(options.projectRoot, options.head);
  if (inventory.head_sha !== resolvedHead) throw new BatchInventoryError('Documentation closure inventory SHA does not match candidate', { code: 'INVENTORY_SHA_MISMATCH' });
  const expectedChangedFiles = changedFiles(options.projectRoot, options.base, options.head).sort();
  const report = buildDocumentationClosureReport(inventory, {
    projectRoot: path.resolve(options.projectRoot),
    headSha: resolvedHead,
    expectedChangedFiles,
  });
  report.inventory_sha256 = sha256File(inventoryAbsolute);
  const outputAbsolute = path.resolve(options.projectRoot, options.outputPath);
  fs.mkdirSync(path.dirname(outputAbsolute), { recursive: true });
  fs.writeFileSync(outputAbsolute, `${JSON.stringify(report, null, 2)}\n`);
  if (options.markdownPath) {
    const markdownAbsolute = path.resolve(options.projectRoot, options.markdownPath);
    fs.mkdirSync(path.dirname(markdownAbsolute), { recursive: true });
    fs.writeFileSync(markdownAbsolute, toMarkdown(report));
  }
  if (report.status !== 'pass') {
    throw new BatchInventoryError(report.failures.join('\n'), { code: 'DOCUMENTATION_CLOSURE_FAILED', failures: report.failures, report });
  }
  logger.log(`[documentation-closure] PASS target=${resolvedHead} slices=${report.release_slices.length}`);
  return report;
}

function main() {
  try {
    checkDocumentationClosure(parseArgs(process.argv.slice(2)));
  } catch (error) {
    if (error instanceof BatchInventoryError) {
      console.error(`[documentation-closure] ${error.code}: ${error.message}`);
      process.exit(1);
    }
    throw error;
  }
}

if (require.main === module) main();

module.exports = { parseArgs, checkDocumentationClosure, toMarkdown };
