#!/usr/bin/env node
/**
 * Compliance impact guardrail
 *
 * Enforces a declaration file whenever compliance-sensitive files change.
 * Supports both CI mode (default) and pre-commit staged mode (--staged).
 */

const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const args = new Set(process.argv.slice(2));
const useStaged = args.has('--staged');

const REPO_ROOT = path.resolve(__dirname, '..');
process.chdir(REPO_ROOT);

const SENSITIVE_FILE_PATTERNS = [
  /^backend\/src\/modules\/pos\//,
  /^backend\/src\/modules\/payments\//,
  /^backend\/src\/modules\/settings\//,
  /^backend\/src\/modules\/compliance\//,
  /^backend\/src\/middleware\/compliancePolicy\.js$/,
  /^backend\/src\/routes\/payments\.js$/,
  /^backend\/src\/routes\/pos\.js$/,
  /^backend\/src\/routes\/compliance\.js$/,
  /^backend\/src\/validators\/complianceValidator\.js$/,
  /^frontend\/src\/features\/pos\//,
  /^frontend\/src\/pages\/Settings(?:\/|\.|$)/,
  /^frontend\/Pages\/Settings\.jsx$/,
  /^frontend\/src\/services\/paymentService\.js$/,
  /^frontend\/src\/services\/complianceService\.js$/,
  /^frontend\/src\/services\/adminService\.js$/,
  /^frontend\/Pages\/admin\/TenantManager\.jsx$/
];

const DECLARATION_FILE_PATTERN = /^docs\/compliance\/impact-declarations\/.+\.md$/;
const REQUIRED_DECLARATION_SECTIONS = [
  '## Compliance Impact Classification',
  '## Affected Surfaces',
  '## Compliance Preconditions',
  '## Verification Evidence'
];

const REQUIRED_DECLARATION_FRONTMATTER_KEYS = [
  'declaration_id',
  'classification',
  'surfaces',
  'reason_codes_impacted',
  'policy_version',
  'verification_evidence',
  'rollback_note'
];

const FILE_SURFACE_RULES = [
  { surface: 'pos', pattern: /^backend\/src\/modules\/pos\// },
  { surface: 'payments', pattern: /^backend\/src\/modules\/payments\// },
  { surface: 'settings', pattern: /^backend\/src\/modules\/settings\// },
  { surface: 'compliance', pattern: /^backend\/src\/modules\/compliance\// },
  { surface: 'pos', pattern: /^backend\/src\/routes\/pos\.js$/ },
  { surface: 'payments', pattern: /^backend\/src\/routes\/payments\.js$/ },
  { surface: 'settings', pattern: /^backend\/src\/routes\/settings\.js$/ },
  { surface: 'compliance', pattern: /^backend\/src\/routes\/compliance\.js$/ },
  { surface: 'compliance', pattern: /^backend\/src\/validators\/complianceValidator\.js$/ },
  { surface: 'compliance', pattern: /^backend\/src\/middleware\/compliancePolicy\.js$/ },
  { surface: 'pos', pattern: /^frontend\/src\/features\/pos\// },
  { surface: 'settings', pattern: /^frontend\/src\/pages\/Settings(?:\/|\.|$)/ },
  { surface: 'settings', pattern: /^frontend\/Pages\/Settings\.jsx$/ },
  { surface: 'compliance', pattern: /^frontend\/src\/services\/complianceService\.js$/ },
  { surface: 'payments', pattern: /^frontend\/src\/services\/paymentService\.js$/ }
];

const runCommand = (command, { allowFail = false } = {}) => {
  try {
    return execSync(command, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim();
  } catch (error) {
    if (allowFail) {
      return '';
    }
    throw error;
  }
};

const splitLines = (raw) => (
  String(raw || '')
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
);

const unique = (values) => [...new Set(values)];

const resolveChangedFiles = () => {
  if (useStaged) {
    return splitLines(runCommand('git diff --cached --name-only', { allowFail: true }));
  }

  let files = [];

  if (process.env.COMPLIANCE_CHANGED_FILES) {
    const normalized = process.env.COMPLIANCE_CHANGED_FILES
      .split(/[\n,]/)
      .map((value) => value.trim())
      .filter(Boolean);
    if (normalized.length > 0) files = unique(normalized);
  }

  if (files.length === 0) {
    const baseRef = process.env.GITHUB_BASE_REF;
    if (baseRef) {
      runCommand(`git fetch --no-tags --prune --depth=200 origin ${baseRef}`, { allowFail: true });
      const mergeBase = runCommand(`git merge-base HEAD origin/${baseRef}`, { allowFail: true });
      if (mergeBase) {
        files = splitLines(runCommand(`git diff --name-only ${mergeBase}...HEAD`, { allowFail: true }));
      }
    }
  }

  if (files.length === 0) {
    const beforeSha = process.env.GITHUB_EVENT_BEFORE || process.env.CI_COMMIT_BEFORE_SHA;
    if (beforeSha && !/^0+$/.test(beforeSha)) {
      files = splitLines(runCommand(`git diff --name-only ${beforeSha}...HEAD`, { allowFail: true }));
    }
  }

  if (files.length === 0) {
    files = splitLines(runCommand('git diff-tree --no-commit-id --name-only -r HEAD', { allowFail: true }));
  }

  if (files.length === 0) {
    files = splitLines(runCommand('git diff --name-only HEAD~1...HEAD', { allowFail: true }));
  }

  const untracked = splitLines(runCommand('git ls-files --others --exclude-standard', { allowFail: true }));
  return unique([...files, ...untracked]);
};

const isSensitiveFile = (filePath) => SENSITIVE_FILE_PATTERNS.some((pattern) => pattern.test(filePath));
const isDeclarationFile = (filePath) => DECLARATION_FILE_PATTERN.test(filePath) && !/\/README\.md$/i.test(filePath);

const parseFrontMatter = (content) => {
  const text = String(content || '');
  if (!text.startsWith('---')) return null;
  const end = text.indexOf('\n---', 3);
  if (end === -1) return null;
  const block = text.slice(3, end).trim();
  const map = {};

  for (const line of block.split(/\r?\n/)) {
    const idx = line.indexOf(':');
    if (idx === -1) continue;
    const key = line.slice(0, idx).trim();
    const rawValue = line.slice(idx + 1).trim();
    if (!key) continue;
    map[key] = rawValue;
  }

  return map;
};

const parseCsvField = (value) => (
  String(value || '')
    .split(',')
    .map((entry) => entry.trim())
    .filter(Boolean)
);

const inferSurfacesFromSensitiveFiles = (files) => {
  const set = new Set();
  for (const file of files) {
    for (const rule of FILE_SURFACE_RULES) {
      if (rule.pattern.test(file)) {
        set.add(rule.surface);
      }
    }
  }
  return [...set];
};

const validateDeclarationFile = (filePath) => {
  const absolutePath = path.join(REPO_ROOT, filePath);
  if (!fs.existsSync(absolutePath)) {
    return [`Declaration file not found: ${filePath}`];
  }

  const content = fs.readFileSync(absolutePath, 'utf8');
  const failures = [];
  for (const section of REQUIRED_DECLARATION_SECTIONS) {
    if (!content.includes(section)) {
      failures.push(`Missing required section "${section}" in ${filePath}`);
    }
  }

  const frontMatter = parseFrontMatter(content);
  if (!frontMatter) {
    failures.push(`Missing YAML front matter in ${filePath}`);
    return failures;
  }

  for (const key of REQUIRED_DECLARATION_FRONTMATTER_KEYS) {
    if (!Object.prototype.hasOwnProperty.call(frontMatter, key) || !String(frontMatter[key] || '').trim()) {
      failures.push(`Missing required front matter key "${key}" in ${filePath}`);
    }
  }

  if (frontMatter.declaration_id && !/^\d{4}-\d{2}-\d{2}-[a-z0-9-]+$/.test(frontMatter.declaration_id)) {
    failures.push(`Invalid declaration_id format in ${filePath}. Expected YYYY-MM-DD-slug`);
  }

  if (frontMatter.classification && !['minor', 'major', 'regulatory'].includes(frontMatter.classification)) {
    failures.push(`Invalid classification "${frontMatter.classification}" in ${filePath}`);
  }

  const declaredSurfaces = parseCsvField(frontMatter.surfaces);
  const impactedSurfaces = inferSurfacesFromSensitiveFiles(sensitiveFiles);
  const missingSurfaces = impactedSurfaces.filter((surface) => !declaredSurfaces.includes(surface));
  if (missingSurfaces.length > 0) {
    failures.push(`Front matter surfaces in ${filePath} do not cover changed surfaces: ${missingSurfaces.join(', ')}`);
  }

  const reasonCodes = parseCsvField(frontMatter.reason_codes_impacted);
  if (reasonCodes.length === 0) {
    failures.push(`Front matter reason_codes_impacted must contain at least one reason code in ${filePath}`);
  }

  const evidenceItems = parseCsvField(frontMatter.verification_evidence);
  if (evidenceItems.length === 0) {
    failures.push(`Front matter verification_evidence must contain at least one evidence item in ${filePath}`);
  }

  if (frontMatter.policy_version && !/^\d{4}\.\d{2}\.\d{2}$/.test(frontMatter.policy_version)) {
    failures.push(`Invalid policy_version "${frontMatter.policy_version}" in ${filePath}. Expected YYYY.MM.DD`);
  }

  return failures;
};

const changedFiles = unique(resolveChangedFiles());
const sensitiveFiles = changedFiles.filter(isSensitiveFile);

if (sensitiveFiles.length === 0) {
  console.log('[check:compliance] No compliance-sensitive changes detected.');
  process.exit(0);
}

const declarationFiles = changedFiles.filter(isDeclarationFile);
if (declarationFiles.length === 0) {
  console.error('[check:compliance] Compliance-sensitive files changed without a declaration file.');
  console.error('[check:compliance] Sensitive files:');
  sensitiveFiles.forEach((file) => console.error(`  - ${file}`));
  console.error('[check:compliance] Add/update a file in docs/compliance/impact-declarations/*.md');
  process.exit(1);
}

const declarationFailures = declarationFiles.flatMap(validateDeclarationFile);
if (declarationFailures.length > 0) {
  console.error('[check:compliance] Declaration validation failed:');
  declarationFailures.forEach((failure) => console.error(`  - ${failure}`));
  process.exit(1);
}

console.log('[check:compliance] PASS');
console.log(`[check:compliance] Sensitive files checked: ${sensitiveFiles.length}`);
console.log(`[check:compliance] Declaration files: ${declarationFiles.join(', ')}`);
