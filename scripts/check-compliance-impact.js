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

const CLASSIFICATION_RANK = Object.freeze({
  minor: 0,
  major: 1,
  regulatory: 2
});

const SURFACE_MIN_CLASSIFICATION = Object.freeze({
  pos: 'major',
  terminal: 'major',
  settings: 'major',
  payments: 'major',
  compliance: 'regulatory'
});

const COMPLIANCE_SENSITIVE_RULES = [
  {
    pattern: /^apps\/dgfy-api\/src\/modules\/pos\//,
    surfaces: ['pos', 'terminal'],
    minimumClassification: 'major'
  },
  {
    pattern: /^apps\/dgfy-api\/src\/modules\/vouchers\//,
    surfaces: ['pos', 'terminal'],
    minimumClassification: 'major'
  },
  {
    pattern: /^apps\/dgfy-api\/src\/modules\/store\//,
    surfaces: ['payments'],
    minimumClassification: 'major'
  },
  {
    pattern: /^apps\/dgfy-api\/src\/modules\/payments\//,
    surfaces: ['payments'],
    minimumClassification: 'major'
  },
  {
    // #707: the QRPh money-capture module -- webhook-confirmed payment finalization, order
    // creation, and the paid_manual_resolution_required reconciliation queue -- was absent from
    // this list despite `modules/payments/` and `modules/store/` both being covered. Same floor as
    // those two neighbors, not a new tier.
    pattern: /^apps\/dgfy-api\/src\/modules\/commercePayments\//,
    surfaces: ['payments'],
    minimumClassification: 'major'
  },
  {
    pattern: /^apps\/dgfy-api\/src\/modules\/settings\//,
    surfaces: ['settings'],
    minimumClassification: 'major'
  },
  {
    pattern: /^apps\/dgfy-api\/src\/modules\/compliance\//,
    surfaces: ['compliance'],
    minimumClassification: 'regulatory'
  },
  {
    pattern: /^apps\/dgfy-api\/src\/middleware\/compliancePolicy\.js$/,
    surfaces: ['compliance', 'settings', 'payments', 'pos'],
    minimumClassification: 'regulatory'
  },
  {
    pattern: /^apps\/dgfy-api\/src\/routes\/payments\.js$/,
    surfaces: ['payments'],
    minimumClassification: 'major'
  },
  {
    // #707: the route file lives outside modules/, so the commercePayments/ directory rule above
    // does not cover it -- same reasoning as the routes/payments.js rule immediately above.
    pattern: /^apps\/dgfy-api\/src\/routes\/commercePayments\.js$/,
    surfaces: ['payments'],
    minimumClassification: 'major'
  },
  {
    pattern: /^apps\/dgfy-api\/src\/routes\/pos\.js$/,
    surfaces: ['pos', 'terminal'],
    minimumClassification: 'major'
  },
  {
    pattern: /^apps\/dgfy-api\/src\/routes\/settings\.js$/,
    surfaces: ['settings'],
    minimumClassification: 'major'
  },
  {
    pattern: /^apps\/dgfy-api\/src\/routes\/compliance\.js$/,
    surfaces: ['compliance'],
    minimumClassification: 'regulatory'
  },
  {
    pattern: /^apps\/dgfy-api\/src\/routes\/adminTenants\.js$/,
    surfaces: ['settings', 'compliance'],
    minimumClassification: 'regulatory'
  },
  {
    pattern: /^apps\/dgfy-api\/src\/validators\/complianceValidator\.js$/,
    surfaces: ['compliance'],
    minimumClassification: 'regulatory'
  },
  {
    pattern: /^apps\/dgfy-api\/src\/controllers\/complianceController\.js$/,
    surfaces: ['compliance'],
    minimumClassification: 'regulatory'
  },
  {
    pattern: /^apps\/dgfy-api\/src\/controllers\/adminTenantController\.js$/,
    surfaces: ['settings', 'compliance'],
    minimumClassification: 'regulatory'
  },
  {
    pattern: /^apps\/dgfy-api\/src\/modules\/tenants\/controllers\/adminTenantHandlers\.js$/,
    surfaces: ['settings', 'compliance'],
    minimumClassification: 'regulatory'
  },
  {
    pattern: /^apps\/dgfy-api\/src\/modules\/tenants\/usecases\/registerCompanyRequestUseCase\.js$/,
    surfaces: ['settings', 'compliance'],
    minimumClassification: 'regulatory'
  },
  {
    pattern: /^apps\/dgfy-api\/src\/modules\/tenants\/usecases\/provisionNewTenantUseCase\.js$/,
    surfaces: ['settings', 'compliance'],
    minimumClassification: 'regulatory'
  },
  {
    pattern: /^apps\/dgfy-api\/src\/modules\/tenants\/repositories\/tenantAdminRepository\.js$/,
    surfaces: ['settings', 'compliance'],
    minimumClassification: 'regulatory'
  },
  {
    pattern: /^apps\/dgfy-web\/src\/features\/pos\//,
    surfaces: ['pos', 'terminal'],
    minimumClassification: 'major'
  },
  {
    pattern: /^apps\/dgfy-web\/src\/features\/compliance\//,
    surfaces: ['compliance'],
    minimumClassification: 'regulatory'
  },
  {
    pattern: /^apps\/dgfy-web\/src\/pages\/Settings(?:\/|\.|$)/,
    surfaces: ['settings'],
    minimumClassification: 'major'
  },
  {
    pattern: /^apps\/dgfy-web\/Pages\/Settings\.jsx$/,
    surfaces: ['settings'],
    minimumClassification: 'major'
  },
  {
    pattern: /^apps\/dgfy-web\/src\/services\/paymentService\.js$/,
    surfaces: ['payments'],
    minimumClassification: 'major'
  },
  {
    pattern: /^apps\/dgfy-web\/src\/services\/complianceService\.js$/,
    surfaces: ['compliance'],
    minimumClassification: 'regulatory'
  },
  {
    pattern: /^apps\/dgfy-web\/src\/services\/adminService\.js$/,
    surfaces: ['settings', 'compliance'],
    minimumClassification: 'regulatory'
  },
  {
    pattern: /^apps\/dgfy-web\/Pages\/admin\/TenantManager\.jsx$/,
    surfaces: ['settings', 'compliance'],
    minimumClassification: 'regulatory'
  }
];

// Known aggregate branch-promotion merges (develop -> staging, staging -> main).
// Their diff bundles every compliance-sensitive file across many already-declared
// feature PRs, so validating each declaration against the *combined* surface/
// classification of the whole bundle produces false positives -- every declaration
// already passed this exact check on its own originating PR into `develop`. Scoped
// narrowly to these (base, head) pairs so a hotfix PR opened directly against
// staging/main (e.g. PR #83) still gets full per-declaration scrutiny.
const PROMOTION_HEAD_BY_BASE = Object.freeze({
  staging: new Set(['develop', 'to-staging']),
  main: new Set(['staging'])
});

// Release-candidate PRs into `main` carry an unmodified staging snapshot in
// under a human-readable name (release/2026-07-30) instead of reusing the
// literal `staging` ref, and (2026-08-16) a develop->staging promotion does
// the same via to-staging/<label> -- see docs/ops/RELEASE_CANDIDATE_POLICY.md.
// Scoped to these two prefixes only, same reasoning as PROMOTION_HEAD_BY_BASE
// above: a hotfix PR opened directly against staging/main from an arbitrary
// branch name (e.g. PR #83) must still get full per-declaration scrutiny, so
// this must not become "anything into staging/main".
const PROMOTION_HEAD_PREFIX_BY_BASE = Object.freeze({
  staging: /^to-staging\//,
  main: /^release\//
});

const isAggregatePromotionPr = () => {
  const baseRef = String(process.env.GITHUB_BASE_REF || '').trim();
  const headRef = String(process.env.GITHUB_HEAD_REF || '').trim();
  if (!baseRef || !headRef) return false;

  const allowedHeads = PROMOTION_HEAD_BY_BASE[baseRef];
  if (allowedHeads && allowedHeads.has(headRef)) return true;

  const allowedPrefix = PROMOTION_HEAD_PREFIX_BY_BASE[baseRef];
  return Boolean(allowedPrefix && allowedPrefix.test(headRef));
};

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

const PREFLIGHT_REQUIRED_CLASSIFICATIONS = new Set(['major', 'regulatory']);
const REQUIRED_PREFLIGHT_FRONTMATTER_KEYS = [
  'preflight_result',
  'preflight_reason_code',
  'preflight_run_at',
  'preflight_request_ref'
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

const parseChangedFilesFromEnv = (value) => (
  String(value || '')
    .split(/[\n,]/)
    .map((entry) => entry.trim())
    .filter(Boolean)
);

const getMatchingRules = (filePath) => COMPLIANCE_SENSITIVE_RULES.filter((rule) => rule.pattern.test(filePath));

const resolveChangedFiles = () => {
  if (useStaged) {
    const stagedFilesFromEnv = parseChangedFilesFromEnv(process.env.COMPLIANCE_STAGED_FILES);
    if (stagedFilesFromEnv.length > 0) {
      return unique(stagedFilesFromEnv);
    }
    return splitLines(runCommand('git diff --cached --name-only', { allowFail: true }));
  }

  let files = [];

  if (process.env.COMPLIANCE_CHANGED_FILES) {
    const normalized = parseChangedFilesFromEnv(process.env.COMPLIANCE_CHANGED_FILES);
    if (normalized.length > 0) {
      return unique(normalized);
    }
  }

  const staged = splitLines(runCommand('git diff --cached --name-only', { allowFail: true }));
  const worktree = splitLines(runCommand('git diff --name-only', { allowFail: true }));
  const untracked = splitLines(runCommand('git ls-files --others --exclude-standard', { allowFail: true }));
  const localFiles = unique([...staged, ...worktree, ...untracked]);
  const isCiDiffContext = Boolean(
    process.env.GITHUB_BASE_REF
      || process.env.GITHUB_EVENT_BEFORE
      || process.env.CI_COMMIT_BEFORE_SHA
  );

  // A clean local worktree has no candidate change set. Do not fall through
  // to HEAD's merge/parent diff: on a promotion merge that diff aggregates
  // previously validated declarations from unrelated feature work and makes
  // the local gate report false compliance-surface failures.
  if (!isCiDiffContext) {
    return localFiles;
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

  return unique([...files, ...localFiles]);
};

const isSensitiveFile = (filePath) => getMatchingRules(filePath).length > 0;
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

const normalizeClassification = (value) => String(value || '').trim().toLowerCase();

const toClassificationRank = (value) => {
  const normalized = normalizeClassification(value);
  if (!Object.prototype.hasOwnProperty.call(CLASSIFICATION_RANK, normalized)) {
    return null;
  }
  return CLASSIFICATION_RANK[normalized];
};

const classificationAtLeast = (actualClassification, minimumClassification) => {
  const actualRank = toClassificationRank(actualClassification);
  const minimumRank = toClassificationRank(minimumClassification);
  if (actualRank == null || minimumRank == null) return false;
  return actualRank >= minimumRank;
};

const maxClassification = (classifications = []) => {
  let selected = 'minor';
  let selectedRank = toClassificationRank(selected);
  for (const classification of classifications) {
    const rank = toClassificationRank(classification);
    if (rank == null) continue;
    if (rank > selectedRank) {
      selected = normalizeClassification(classification);
      selectedRank = rank;
    }
  }
  return selected;
};

const isValidIsoDateTime = (value) => {
  const text = String(value || '').trim();
  if (!text) return false;
  if (!/^\d{4}-\d{2}-\d{2}T/.test(text)) return false;
  if (!/(Z|[+-]\d{2}:\d{2})$/.test(text)) return false;
  const parsed = new Date(text);
  return !Number.isNaN(parsed.getTime());
};

const isValidPreflightRequestRef = (value) => {
  const text = String(value || '').trim();
  if (!text) return false;

  const patterns = [
    /^[A-Z]{2,10}-\d{1,8}$/,
    /^PR-\d{1,8}$/,
    /^#\d{1,8}$/,
    /^[A-Z0-9]+(?:-[A-Z0-9]+){2,}$/,
    /^https:\/\/github\.com\/[^/\s]+\/[^/\s]+\/pull\/\d+$/
  ];

  return patterns.some((pattern) => pattern.test(text));
};

const inferSurfacesFromSensitiveFiles = (files) => {
  const set = new Set();
  for (const file of files) {
    for (const rule of getMatchingRules(file)) {
      for (const surface of rule.surfaces || []) {
        set.add(surface);
      }
    }
  }
  return [...set];
};

const inferMinimumClassificationFromSensitiveFiles = (files) => {
  const perFileMinimums = [];
  for (const file of files) {
    for (const rule of getMatchingRules(file)) {
      if (rule.minimumClassification) {
        perFileMinimums.push(rule.minimumClassification);
      }
    }
  }

  const surfaces = inferSurfacesFromSensitiveFiles(files);
  const perSurfaceMinimums = surfaces.map((surface) => SURFACE_MIN_CLASSIFICATION[surface]).filter(Boolean);
  return maxClassification([...perFileMinimums, ...perSurfaceMinimums, 'major']);
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

  const classification = String(frontMatter.classification || '').trim().toLowerCase();
  if (classification && !['minor', 'major', 'regulatory'].includes(classification)) {
    failures.push(`Invalid classification "${frontMatter.classification}" in ${filePath}`);
  }

  if (isAggregatePromotionPr()) {
    console.log(
      `[check:compliance] Skipping bundled classification/surface re-check for ${filePath} `
      + `(aggregate promotion ${process.env.GITHUB_HEAD_REF} -> ${process.env.GITHUB_BASE_REF}; `
      + 'already validated against its own originating PR).'
    );
  } else {
    const minimumClassification = inferMinimumClassificationFromSensitiveFiles(sensitiveFiles);
    if (classification && !classificationAtLeast(classification, minimumClassification)) {
      failures.push(
        `Classification "${classification}" in ${filePath} is below computed minimum "${minimumClassification}" for changed compliance-sensitive files`
      );
    }

    const declaredSurfaces = parseCsvField(frontMatter.surfaces);
    const impactedSurfaces = inferSurfacesFromSensitiveFiles(sensitiveFiles);
    const missingSurfaces = impactedSurfaces.filter((surface) => !declaredSurfaces.includes(surface));
    if (missingSurfaces.length > 0) {
      failures.push(`Front matter surfaces in ${filePath} do not cover changed surfaces: ${missingSurfaces.join(', ')}`);
    }
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

  if (PREFLIGHT_REQUIRED_CLASSIFICATIONS.has(classification)) {
    for (const key of REQUIRED_PREFLIGHT_FRONTMATTER_KEYS) {
      if (!Object.prototype.hasOwnProperty.call(frontMatter, key) || !String(frontMatter[key] || '').trim()) {
        failures.push(`Missing required ${classification} preflight front matter key "${key}" in ${filePath}`);
      }
    }

    const preflightResult = String(frontMatter.preflight_result || '').trim().toLowerCase();
    if (preflightResult !== 'no_breach') {
      failures.push(
        `${filePath} must have preflight_result=no_breach for classification "${classification}"`
      );
    }

    if (!/^[A-Z0-9_]+$/.test(String(frontMatter.preflight_reason_code || '').trim())) {
      failures.push(
        `Invalid preflight_reason_code "${frontMatter.preflight_reason_code || ''}" in ${filePath}. Expected uppercase reason code token`
      );
    }

    if (!isValidIsoDateTime(frontMatter.preflight_run_at)) {
      failures.push(
        `Invalid preflight_run_at "${frontMatter.preflight_run_at || ''}" in ${filePath}. Expected ISO datetime`
      );
    }

    if (!isValidPreflightRequestRef(frontMatter.preflight_request_ref)) {
      failures.push(
        `Invalid preflight_request_ref "${frontMatter.preflight_request_ref || ''}" in ${filePath}. Expected ticket/PR reference token`
      );
    }
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
