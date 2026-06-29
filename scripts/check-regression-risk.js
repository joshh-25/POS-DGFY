#!/usr/bin/env node

const fs = require('fs');
const path = require('path');

const {
  BatchInventoryError,
  VALID_REGRESSION_RISK_LEVELS,
  normalizeSlices,
  validateInventory,
} = require('./check-batch-inventory');

const RISK_ORDER = ['none', 'low', 'medium', 'high', 'critical'];

function parseArgs(argv) {
  const options = {
    projectRoot: process.cwd(),
    inventoryPath: process.env.BATCH_INVENTORY_FILE || '',
    outputPath: process.env.REGRESSION_RISK_NOTICE_FILE || '',
    markdownPath: process.env.REGRESSION_RISK_NOTICE_MARKDOWN || '',
    targetSha: process.env.RELEASE_TARGET_SHA || process.env.GITHUB_SHA || '',
  };

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === '--project-root') {
      options.projectRoot = path.resolve(argv[index + 1] || '');
      index += 1;
    } else if (arg === '--inventory') {
      options.inventoryPath = argv[index + 1] || '';
      index += 1;
    } else if (arg === '--output') {
      options.outputPath = argv[index + 1] || '';
      index += 1;
    } else if (arg === '--markdown') {
      options.markdownPath = argv[index + 1] || '';
      index += 1;
    } else if (arg === '--target-sha') {
      options.targetSha = argv[index + 1] || '';
      index += 1;
    } else {
      throw new BatchInventoryError(`Unknown argument: ${arg}`, { code: 'INVALID_ARGS' });
    }
  }

  if (!options.inventoryPath) {
    throw new BatchInventoryError('Missing --inventory', { code: 'INVALID_ARGS' });
  }

  return options;
}

function resolvePath(projectRoot, filePath) {
  if (!filePath) return '';
  return path.isAbsolute(filePath) ? filePath : path.resolve(projectRoot, filePath);
}

function readInventory(options) {
  const inventoryPath = resolvePath(options.projectRoot, options.inventoryPath);
  if (!fs.existsSync(inventoryPath)) {
    throw new BatchInventoryError(`Batch inventory is missing: ${options.inventoryPath}`, {
      code: 'INVENTORY_MISSING',
    });
  }

  try {
    return JSON.parse(fs.readFileSync(inventoryPath, 'utf8'));
  } catch (error) {
    throw new BatchInventoryError(`Could not parse batch inventory JSON: ${error.message}`, {
      code: 'INVENTORY_PARSE_FAILED',
    });
  }
}

function highestRiskLevel(slices) {
  return slices.reduce((highest, slice) => {
    const risk = VALID_REGRESSION_RISK_LEVELS.has(slice.regression_risk_level)
      ? slice.regression_risk_level
      : 'none';
    return RISK_ORDER.indexOf(risk) > RISK_ORDER.indexOf(highest) ? risk : highest;
  }, 'none');
}

function buildNotice(inventory, options = {}) {
  const slices = normalizeSlices(inventory);
  const targetSha = options.targetSha || inventory.head_sha || '';
  const failures = validateInventory(inventory, {});

  for (const slice of slices) {
    const sliceName = slice.slice_name || slice.name || '<unnamed>';
    if (slice.regression_risk_level === 'critical' && !String(slice.regression_warning_summary || '').trim()) {
      failures.push(`slice ${sliceName} critical regression risk requires explicit warning text`);
    }
    if (['high', 'critical'].includes(slice.regression_risk_level)) {
      if (!Array.isArray(slice.potentially_affected_existing_behaviors) || slice.potentially_affected_existing_behaviors.length === 0) {
        failures.push(`slice ${sliceName} high/critical regression risk requires affected behavior disclosure`);
      }
    }
  }

  const releaseSlices = slices.map((slice) => ({
    slice_name: slice.slice_name || slice.name || '<unnamed>',
    regression_risk_level: slice.regression_risk_level,
    regression_warning_required: slice.regression_warning_required,
    regression_warning_summary: slice.regression_warning_summary,
    potentially_affected_existing_behaviors: slice.potentially_affected_existing_behaviors || [],
    evidence_covering_regression_risk: slice.evidence_covering_regression_risk || [],
    evidence_gaps: slice.evidence_gaps || [],
    rollback_or_monitoring_notes: slice.rollback_or_monitoring_notes || [],
  }));

  const notice = {
    version: 1,
    generated_at: new Date().toISOString(),
    target_sha: targetSha,
    status: failures.length > 0 ? 'blocked' : 'pass',
    highest_regression_risk_level: highestRiskLevel(slices),
    operator_notice_required: true,
    release_slices: releaseSlices,
    failures,
    completion_rule: 'Production deploy approval must include this Regression Risk Notice before deployment.',
  };

  return notice;
}

function toMarkdown(notice) {
  const lines = [
    '## Regression Risk Notice',
    '',
    `- Target SHA: \`${notice.target_sha || 'unknown'}\``,
    `- Status: \`${notice.status}\``,
    `- Highest regression risk level: \`${notice.highest_regression_risk_level}\``,
    `- Completion rule: ${notice.completion_rule}`,
    '',
  ];

  for (const slice of notice.release_slices) {
    lines.push(`### ${slice.slice_name}`);
    lines.push('');
    lines.push(`- Level: \`${slice.regression_risk_level}\``);
    lines.push(`- Warning: ${slice.regression_warning_summary}`);
    lines.push(`- Operator decision: ${slice.regression_warning_required ? 'ship only if this residual risk is acceptable or gather the missing evidence first' : 'no specific regression risk identified'}`);
    lines.push('');
    lines.push('Evidence reducing risk:');
    for (const evidence of slice.evidence_covering_regression_risk || []) lines.push(`- ${evidence}`);
    lines.push('');
    lines.push('Remaining gaps:');
    if ((slice.evidence_gaps || []).length === 0) {
      lines.push('- No specific regression evidence gap identified.');
    } else {
      for (const gap of slice.evidence_gaps) lines.push(`- ${gap}`);
    }
    lines.push('');
    lines.push('Potentially affected existing behaviors:');
    if ((slice.potentially_affected_existing_behaviors || []).length === 0) {
      lines.push('- No specific affected existing behavior identified.');
    } else {
      for (const behavior of slice.potentially_affected_existing_behaviors) lines.push(`- ${behavior}`);
    }
    lines.push('');
    lines.push('Rollback or monitoring notes:');
    for (const note of slice.rollback_or_monitoring_notes || []) lines.push(`- ${note}`);
    lines.push('');
  }

  if (notice.failures.length > 0) {
    lines.push('### Blocking Notice Defects');
    lines.push('');
    for (const failure of notice.failures) lines.push(`- ${failure}`);
    lines.push('');
  }

  return `${lines.join('\n').trim()}\n`;
}

function writeFile(filePath, content) {
  if (!filePath) return;
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, content);
}

function checkRegressionRisk(options, logger = console) {
  const projectRoot = path.resolve(options.projectRoot || process.cwd());
  const inventory = readInventory({ ...options, projectRoot });
  const targetSha = options.targetSha || inventory.head_sha || 'unknown';
  const evidenceDir = path.join(projectRoot, '.tmp', 'release-gates', targetSha);
  const outputPath = resolvePath(projectRoot, options.outputPath || path.join(evidenceDir, 'regression_risk_notice.json'));
  const markdownPath = resolvePath(projectRoot, options.markdownPath || path.join(evidenceDir, 'regression_risk_notice.md'));

  const notice = buildNotice(inventory, { targetSha });
  const markdown = toMarkdown(notice);

  writeFile(outputPath, JSON.stringify(notice, null, 2));
  writeFile(markdownPath, markdown);

  logger.log(
    `[regression-risk] ${notice.status.toUpperCase()} target=${targetSha} highest=${notice.highest_regression_risk_level} output=${path.relative(projectRoot, outputPath).replace(/\\/g, '/')}`
  );

  if (notice.status !== 'pass') {
    throw new BatchInventoryError(notice.failures.join('\n'), {
      code: 'REGRESSION_RISK_NOTICE_INVALID',
      report: notice,
      failures: notice.failures,
    });
  }

  return { notice, markdown };
}

function main() {
  try {
    checkRegressionRisk(parseArgs(process.argv.slice(2)));
  } catch (error) {
    if (error instanceof BatchInventoryError) {
      console.error(`[regression-risk] ${error.code}: ${error.message}`);
      process.exit(1);
    }
    throw error;
  }
}

if (require.main === module) main();

module.exports = {
  parseArgs,
  buildNotice,
  toMarkdown,
  checkRegressionRisk,
};
