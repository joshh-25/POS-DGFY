#!/usr/bin/env node

const { spawnSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const { validateManifest, MergeAdoptionError } = require('./check-merge-adoption');

const HIGH_RISK_PATH_PATTERNS = [
  /^frontend\/apps\/store\/src\//,
  /^frontend\/Pages\/DgfyAuthPage\.jsx$/,
  /^frontend\/Pages\/RegisterCompany\.jsx$/,
  /^frontend\/src\/features\/dgfy\//,
  /^frontend\/src\/services\/dgfyAuthService\.js$/,
  /^frontend\/src\/services\/authService\.js$/,
  /^backend\/src\/middleware\/storeAuth\.js$/,
  /^backend\/src\/modules\/dgfy\//,
  /^backend\/src\/modules\/store\//,
  /^backend\/tests\/dgfyCustomer/,
  /^backend\/tests\/store.*(Customer|Order|Tracking|Checkout|Repository|UseCases)/,
  /^docs\/features\/DGFY_CUSTOMER_ACCOUNT\.md$/,
  /^docs\/features\/STOREFRONT_CURRENT_STANDING\.md$/,
  /^docs\/architecture\/adr\/0023-front-facing-dgfy-customer-account\.md$/,
  /^docs\/ops\/MERGE_ADOPTION_GATE\.md$/,
  /^docs\/templates\/MERGE_ADOPTION_MANIFEST_TEMPLATE\.json$/,
];

const MANIFEST_PATH_PATTERN = /^docs\/release\/merge-adoption\/.+\.json$/;

class MergeAdoptionRequiredError extends Error {
  constructor(message, options = {}) {
    super(message);
    this.name = 'MergeAdoptionRequiredError';
    this.code = options.code || 'MERGE_ADOPTION_REQUIRED_FAILED';
    this.errors = options.errors || [message];
  }
}

function parseArgs(argv) {
  const options = {
    projectRoot: process.cwd(),
    base: process.env.MERGE_ADOPTION_BASE || process.env.GITHUB_BASE_REF || 'origin/master',
    head: process.env.MERGE_ADOPTION_HEAD || 'HEAD',
    manifestPath: process.env.MERGE_ADOPTION_MANIFEST || process.env.RELEASE_MERGE_ADOPTION_MANIFEST || '',
    allowNotRequired: process.env.MERGE_ADOPTION_NOT_REQUIRED === '1',
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
    } else if (arg === '--manifest') {
      options.manifestPath = argv[index + 1] || '';
      index += 1;
    } else if (arg === '--allow-not-required') {
      options.allowNotRequired = true;
    } else {
      throw new MergeAdoptionRequiredError(`Unknown argument: ${arg}`, { code: 'INVALID_ARGS' });
    }
  }

  if (!options.projectRoot) {
    throw new MergeAdoptionRequiredError('Missing value for --project-root', { code: 'INVALID_ARGS' });
  }
  if (!options.base) {
    throw new MergeAdoptionRequiredError('Missing value for --base', { code: 'INVALID_ARGS' });
  }
  if (!options.head) {
    throw new MergeAdoptionRequiredError('Missing value for --head', { code: 'INVALID_ARGS' });
  }

  return options;
}

function runGit(projectRoot, args) {
  const result = spawnSync('git', args, {
    cwd: projectRoot,
    encoding: 'utf8',
  });

  return {
    ok: result.status === 0,
    stdout: result.stdout || '',
    stderr: result.stderr || '',
    status: result.status,
  };
}

function resolveBase(projectRoot, base) {
  const candidates = [base];
  if (!base.startsWith('origin/') && !base.includes('/') && base !== 'HEAD') {
    candidates.push(`origin/${base}`);
  }
  if (base.startsWith('origin/')) {
    candidates.push(base.slice('origin/'.length));
  }

  for (const candidate of candidates) {
    const result = runGit(projectRoot, ['rev-parse', '--verify', `${candidate}^{commit}`]);
    if (result.ok) return candidate;
  }

  throw new MergeAdoptionRequiredError(`Could not resolve merge adoption base ref: ${base}`, {
    code: 'BASE_REF_NOT_FOUND',
  });
}

function collectChangedFiles(projectRoot, base, head) {
  const resolvedBase = resolveBase(projectRoot, base);
  const mergeBase = runGit(projectRoot, ['merge-base', resolvedBase, head]);
  if (!mergeBase.ok) {
    throw new MergeAdoptionRequiredError(
      `Could not compute merge base for ${resolvedBase}...${head}: ${mergeBase.stderr.trim() || mergeBase.status}`,
      { code: 'MERGE_BASE_FAILED' }
    );
  }

  const diff = runGit(projectRoot, ['diff', '--name-only', `${mergeBase.stdout.trim()}...${head}`, '--']);
  if (!diff.ok) {
    throw new MergeAdoptionRequiredError(`Could not inspect changed files: ${diff.stderr.trim() || diff.status}`, {
      code: 'DIFF_FAILED',
    });
  }

  return diff.stdout.split(/\r?\n/).filter(Boolean).map((filePath) => filePath.replace(/\\/g, '/'));
}

function isHighRiskPath(filePath) {
  return HIGH_RISK_PATH_PATTERNS.some((pattern) => pattern.test(filePath));
}

function looksLikeMergeAdoptionManifest(projectRoot, filePath) {
  if (!projectRoot) return true;
  try {
    const manifest = JSON.parse(fs.readFileSync(path.join(projectRoot, filePath), 'utf8'));
    return manifest
      && manifest.version === 1
      && typeof manifest.merge_name === 'string'
      && Array.isArray(manifest.feature_areas);
  } catch {
    return false;
  }
}

function findManifestCandidates(changedFiles, projectRoot = '') {
  return changedFiles
    .filter((filePath) => MANIFEST_PATH_PATTERN.test(filePath))
    .filter((filePath) => looksLikeMergeAdoptionManifest(projectRoot, filePath));
}

function validateRequiredManifest({ projectRoot, changedFiles, manifestPath, allowNotRequired, logger = console }) {
  const highRiskFiles = changedFiles.filter(isHighRiskPath);
  if (highRiskFiles.length === 0) {
    logger.log('[merge-adoption-required] PASS no high-risk storefront/customer-flow files changed');
    return { status: 'pass', required: false, highRiskFiles, manifestPath: '' };
  }

  if (allowNotRequired) {
    logger.warn('[merge-adoption-required] BYPASS high-risk files changed, but MERGE_ADOPTION_NOT_REQUIRED is set');
    return { status: 'pass', required: true, highRiskFiles, manifestPath: '', bypassed: true };
  }

  let selectedManifest = manifestPath;
  if (!selectedManifest) {
    const candidates = findManifestCandidates(changedFiles, projectRoot);
    if (candidates.length === 1) {
      selectedManifest = candidates[0];
    } else if (candidates.length > 1) {
      throw new MergeAdoptionRequiredError(
        `Multiple merge adoption manifests changed (${candidates.join(', ')}). Pass --manifest to select one.`,
        { code: 'MULTIPLE_MANIFESTS' }
      );
    }
  }

  if (!selectedManifest) {
    throw new MergeAdoptionRequiredError(
      [
        'High-risk storefront/customer-flow files changed without merge adoption proof.',
        'Add docs/release/merge-adoption/<name>.json or pass --manifest <path>.',
        'If this PR truly does not adopt another branch or customer-flow behavior, rerun with MERGE_ADOPTION_NOT_REQUIRED=1 and explain that in the PR.',
        `Changed high-risk files: ${highRiskFiles.slice(0, 20).join(', ')}${highRiskFiles.length > 20 ? ', ...' : ''}`,
      ].join('\n'),
      { code: 'MANIFEST_REQUIRED', errors: highRiskFiles }
    );
  }

  if (!fs.existsSync(path.join(projectRoot, selectedManifest))) {
    throw new MergeAdoptionRequiredError(`Merge adoption manifest not found: ${selectedManifest}`, {
      code: 'MANIFEST_NOT_FOUND',
    });
  }

  validateManifest({ projectRoot, manifestPath: selectedManifest, logger });
  logger.log(`[merge-adoption-required] PASS manifest=${selectedManifest} high_risk_files=${highRiskFiles.length}`);
  return { status: 'pass', required: true, highRiskFiles, manifestPath: selectedManifest };
}

function main() {
  try {
    const options = parseArgs(process.argv.slice(2));
    const changedFiles = collectChangedFiles(options.projectRoot, options.base, options.head);
    validateRequiredManifest({ ...options, changedFiles });
  } catch (error) {
    if (error instanceof MergeAdoptionRequiredError || error instanceof MergeAdoptionError) {
      console.error(`[merge-adoption-required] ${error.code}: ${error.message}`);
      process.exit(1);
    }
    throw error;
  }
}

if (require.main === module) {
  main();
}

module.exports = {
  HIGH_RISK_PATH_PATTERNS,
  MANIFEST_PATH_PATTERN,
  MergeAdoptionRequiredError,
  parseArgs,
  collectChangedFiles,
  isHighRiskPath,
  findManifestCandidates,
  validateRequiredManifest,
};
