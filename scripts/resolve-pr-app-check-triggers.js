#!/usr/bin/env node
/**
 * Resolve ordinary PR build/lint routing for all deployable apps. A manifest is removed from the
 * routing input only when its complete app-local diff is a valid top-level package version bump.
 * The original changed paths are returned separately so validation and release checks keep seeing
 * the full PR diff.
 */

const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const { resolveFrontendBuildTriggers } = require('./resolve-frontend-build-triggers');
const { parseVersion } = require('./check-app-version-bump');

const REPO_ROOT = path.resolve(__dirname, '..');
const APP_DIR_BY_KEY = Object.freeze({
  dgfy_api: 'apps/dgfy-api',
  migration_runner: 'apps/dgfy-migration-runner',
  frontend_ims: 'apps/dgfy-ims',
  frontend_pos: 'apps/dgfy-pos',
  frontend_storefront: 'apps/dgfy-storefront',
  frontend_opis: 'apps/dgfy-opis',
  frontend_admin: 'apps/dgfy-admin',
});
const FRONTEND_KEYS = Object.freeze([
  'frontend_ims', 'frontend_pos', 'frontend_storefront', 'frontend_opis', 'frontend_admin',
]);

// Ported from shared-changed-paths.yml and historically exported by pr-checks.js. Keep these
// patterns here as the routing source of truth; pr-checks.js re-exports them for compatibility.
const PATH_FILTERS = Object.freeze({
  frontend_ims: /^(apps\/dgfy-ims\/|packages\/pos-receipt\/|packages\/shared-constants\/|packages\/web-core\/|infrastructure\/docker\/dgfy-ims\/|\.dockerignore|\.github\/workflows\/(shared-changed-paths|deploy-frontend|deployment-orchestrator|pr-frontend-build-checks|pr-frontend-lint-checks|deploy|deploy-main)\.yml)/,
  frontend_pos: /^(apps\/dgfy-pos\/|packages\/pos-receipt\/|packages\/shared-constants\/|packages\/web-core\/|infrastructure\/docker\/dgfy-pos\/|\.dockerignore|\.github\/workflows\/(shared-changed-paths|deploy-frontend|deployment-orchestrator|pr-frontend-build-checks|pr-frontend-lint-checks|deploy|deploy-main)\.yml)/,
  frontend_storefront: /^(apps\/dgfy-storefront\/|packages\/shared-constants\/|packages\/web-core\/|infrastructure\/docker\/dgfy-storefront\/|\.dockerignore|\.github\/workflows\/(shared-changed-paths|deploy-frontend|deployment-orchestrator|pr-frontend-build-checks|pr-frontend-lint-checks|deploy|deploy-main)\.yml)/,
  frontend_opis: /^(apps\/dgfy-opis\/|packages\/pos-receipt\/|packages\/shared-constants\/|packages\/web-core\/|infrastructure\/docker\/dgfy-opis\/|\.dockerignore|\.github\/workflows\/(shared-changed-paths|deploy-frontend|deployment-orchestrator|pr-frontend-build-checks|pr-frontend-lint-checks|deploy|deploy-main)\.yml)/,
  frontend_admin: /^(apps\/dgfy-admin\/|packages\/pos-receipt\/|packages\/shared-constants\/|packages\/web-core\/|infrastructure\/docker\/dgfy-admin\/|\.dockerignore|\.github\/workflows\/(shared-changed-paths|deploy-frontend|deployment-orchestrator|pr-frontend-build-checks|pr-frontend-lint-checks|deploy|deploy-main)\.yml)/,
  dgfy_api: /^(apps\/dgfy-api\/|packages\/shared-constants\/|packages\/tenant-bootstrap\/|infrastructure\/docker\/dgfy-api\/|\.dockerignore|\.github\/workflows\/(shared-changed-paths|deploy-api|deployment-orchestrator|pr-dgfy-api-build-checks|deploy|deploy-main)\.yml)/,
  migration_runner: /^(apps\/dgfy-migration-runner\/|packages\/tenant-bootstrap\/|infrastructure\/docker\/dgfy-migration-runner\/|\.dockerignore|\.github\/workflows\/(shared-changed-paths|deploy-migration-runner|deployment-orchestrator|pr-migration-runner-build-checks|deploy|deploy-main)\.yml)/,
});

const PROMOTION_HEADS_BY_BASE = Object.freeze({
  staging: new Set(['develop', 'to-staging']),
  main: new Set(['staging']),
});
const PROMOTION_HEAD_PREFIX_BY_BASE = Object.freeze({
  staging: /^to-staging\//,
  main: /^release\//,
});

function runGit(args, { repoRoot = REPO_ROOT, allowFailure = false } = {}) {
  const result = spawnSync('git', args, { cwd: repoRoot, encoding: 'utf8' });
  if (result.error || result.status !== 0) {
    if (allowFailure) return null;
    throw new Error((result.stderr || result.error?.message || `git ${args.join(' ')} failed`).trim());
  }
  return result.stdout;
}

function parseNameStatusZ(raw) {
  const fields = String(raw).split('\0');
  const entries = [];
  for (let i = 0; i < fields.length;) {
    const status = fields[i++];
    if (!status) continue;
    if (status[0] === 'R' || status[0] === 'C') {
      const oldPath = fields[i++];
      const newPath = fields[i++];
      if (!oldPath || !newPath) throw new Error('git diff returned an incomplete rename/copy record');
      entries.push({ status, paths: [oldPath, newPath] });
    } else {
      const filePath = fields[i++];
      if (!filePath) throw new Error(`git diff returned an incomplete ${status} record`);
      entries.push({ status, paths: [filePath] });
    }
  }
  return entries;
}

function getDiffEntries(repoRoot, baseGitRef, headGitRef, git = runGit) {
  if (!baseGitRef || !headGitRef) throw new Error('baseGitRef and headGitRef are required to classify PR changes');
  const raw = git(['diff', '--name-status', '-z', '--find-renames', baseGitRef, headGitRef, '--'], { repoRoot });
  return parseNameStatusZ(raw);
}

function readBlob(repoRoot, ref, filePath, git = runGit) {
  return git(['show', `${ref}:${filePath}`], { repoRoot, allowFailure: true });
}

function isObject(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function stableValue(value) {
  if (Array.isArray(value)) return value.map(stableValue);
  if (!isObject(value)) return value;
  return Object.fromEntries(Object.keys(value).sort().map((key) => [key, stableValue(value[key])]));
}

function parseManifest(blob) {
  if (typeof blob !== 'string') return null;
  try {
    const parsed = JSON.parse(blob);
    if (!isObject(parsed) || typeof parsed.version !== 'string' || !parsed.version.trim()) return null;
    if (!parseVersion(parsed.version)) return null;
    return parsed;
  } catch {
    return null;
  }
}

function isVersionOnlyManifestChange(repoRoot, appDir, baseGitRef, headGitRef, git = runGit) {
  const manifestPath = `${appDir}/package.json`;
  const base = parseManifest(readBlob(repoRoot, baseGitRef, manifestPath, git));
  const head = parseManifest(readBlob(repoRoot, headGitRef, manifestPath, git));
  if (!base || !head || base.version.trim() === head.version.trim()) return false;
  const baseWithoutVersion = { ...base };
  const headWithoutVersion = { ...head };
  delete baseWithoutVersion.version;
  delete headWithoutVersion.version;
  return JSON.stringify(stableValue(baseWithoutVersion)) === JSON.stringify(stableValue(headWithoutVersion));
}

function isAggregatePromotion(baseBranchName, headBranchName) {
  const base = String(baseBranchName || '').trim();
  const head = String(headBranchName || '').trim();
  if (!base || !head) return false;
  const exactHeads = PROMOTION_HEADS_BY_BASE[base];
  if (exactHeads && exactHeads.has(head)) return true;
  return Boolean(PROMOTION_HEAD_PREFIX_BY_BASE[base]?.test(head));
}

function buildInitialDiagnostics() {
  return Object.fromEntries(Object.keys(APP_DIR_BY_KEY).map((key) => [key, {
    version_only: false,
    reason: 'optimization-disabled',
  }]));
}

async function resolvePrAppCheckTriggers(options = {}) {
  const repoRoot = options.repoRoot || REPO_ROOT;
  const baseGitRef = options.baseGitRef;
  const headGitRef = options.headGitRef || 'HEAD';
  const baseBranchName = options.baseBranchName || '';
  const headBranchName = options.headBranchName || '';
  const optimizeVersionOnly = options.optimizeVersionOnly === true;
  const entries = options.diffEntries || getDiffEntries(repoRoot, baseGitRef, headGitRef, options.git || runGit);
  const changedFiles = [...new Set(entries.flatMap((entry) => entry.paths))];
  const diagnostics = buildInitialDiagnostics();
  const optimizationAllowed = optimizeVersionOnly
    && Boolean(baseBranchName && headBranchName)
    && !isAggregatePromotion(baseBranchName, headBranchName);

  const removedManifests = new Set();
  if (optimizationAllowed) {
    for (const [key, appDir] of Object.entries(APP_DIR_BY_KEY)) {
      const appPaths = changedFiles.filter((file) => file.startsWith(`${appDir}/`));
      const manifestPath = `${appDir}/package.json`;
      if (appPaths.length === 1 && appPaths[0] === manifestPath
        && isVersionOnlyManifestChange(repoRoot, appDir, baseGitRef, headGitRef, options.git || runGit)) {
        removedManifests.add(manifestPath);
        diagnostics[key] = { version_only: true, reason: 'top-level-version-only' };
      } else {
        diagnostics[key] = {
          version_only: false,
          reason: appPaths.length === 0 ? 'no-app-local-change' : 'substantive-or-uncertain-app-change',
        };
      }
    }
  } else {
    const reason = !optimizeVersionOnly ? 'optimization-disabled'
      : (!baseBranchName || !headBranchName) ? 'missing-branch-context'
        : 'aggregate-promotion';
    for (const key of Object.keys(diagnostics)) diagnostics[key] = { version_only: false, reason };
  }

  const routingFiles = changedFiles.filter((file) => !removedManifests.has(file));
  const components = Object.fromEntries(Object.entries(PATH_FILTERS).map(([key, pattern]) => [
    key,
    routingFiles.some((file) => pattern.test(file)),
  ]));

  // Preserve the existing reachability-aware frontend verdict, now using the reduced path list.
  const frontendResolver = options.resolveFrontendBuildTriggers || resolveFrontendBuildTriggers;
  const frontend = await frontendResolver({
    repoRoot,
    baseGitRef,
    headGitRef,
    changedFiles: routingFiles,
  });
  const frontendKeyByApp = {
    'dgfy-ims': 'frontend_ims', 'dgfy-pos': 'frontend_pos',
    'dgfy-storefront': 'frontend_storefront', 'dgfy-opis': 'frontend_opis',
    'dgfy-admin': 'frontend_admin',
  };
  for (const [app, key] of Object.entries(frontendKeyByApp)) {
    components[key] = frontend[app].trigger;
    diagnostics[key].route_reason = frontend[app].reason;
  }

  const metadataApps = FRONTEND_KEYS
    .filter((key) => diagnostics[key].version_only && !components[key])
    .map((key) => APP_DIR_BY_KEY[key].slice('apps/'.length));

  return { components, diagnostics, changedFiles, routingFiles, metadataApps, removedManifests: [...removedManifests] };
}

function parseArgs(argv) {
  const options = {};
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === '--base') options.baseGitRef = argv[++i];
    else if (arg === '--head') options.headGitRef = argv[++i];
    else if (arg === '--base-branch') options.baseBranchName = argv[++i];
    else if (arg === '--head-branch') options.headBranchName = argv[++i];
    else if (arg === '--optimize-version-only') options.optimizeVersionOnly = argv[++i] === 'true';
    else throw new Error(`Unknown argument: ${arg}`);
  }
  if (!options.baseGitRef) throw new Error('--base <commit/ref> is required');
  return options;
}

function writeGithubOutput(result, outputPath = process.env.GITHUB_OUTPUT) {
  if (!outputPath) return;
  const lines = Object.entries(result.components).map(([key, value]) => `${key}=${value ? 'true' : 'false'}`);
  lines.push(`metadata_apps=${result.metadataApps.join(',')}`);
  lines.push(`diagnostics=${JSON.stringify(result.diagnostics)}`);
  fs.appendFileSync(outputPath, `${lines.join('\n')}\n`);
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  const result = await resolvePrAppCheckTriggers(options);
  for (const [key, value] of Object.entries(result.components)) {
    console.log(`[resolve-pr-app-check-triggers] ${key}=${value ? 'true' : 'false'} (${result.diagnostics[key].reason}${result.diagnostics[key].route_reason ? `; ${result.diagnostics[key].route_reason}` : ''})`);
  }
  console.log(JSON.stringify({ components: result.components, diagnostics: result.diagnostics, metadataApps: result.metadataApps }));
  writeGithubOutput(result);
}

if (require.main === module) {
  main().catch((error) => {
    console.error(`[resolve-pr-app-check-triggers] failed closed: ${error.message}`);
    process.exitCode = 1;
  });
}

module.exports = {
  APP_DIR_BY_KEY,
  FRONTEND_KEYS,
  PATH_FILTERS,
  PROMOTION_HEADS_BY_BASE,
  PROMOTION_HEAD_PREFIX_BY_BASE,
  parseNameStatusZ,
  getDiffEntries,
  parseManifest,
  isVersionOnlyManifestChange,
  isAggregatePromotion,
  resolvePrAppCheckTriggers,
  parseArgs,
  writeGithubOutput,
};
