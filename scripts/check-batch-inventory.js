#!/usr/bin/env node

const { spawnSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const VALID_VERDICTS = new Set(['ship', 'split', 'fix first', 'defer', 'blocked']);
const VALID_RISK_LEVELS = new Set(['low', 'medium', 'high', 'critical']);
const VALID_REGRESSION_RISK_LEVELS = new Set(['none', 'low', 'medium', 'high', 'critical']);
const VALID_SOURCE_TYPES = new Set(['developer_pr', 'owner_direct_staging', 'controller_promotion']);
const VALID_ARCHITECTURE_CLASSIFICATIONS = new Set(['no-architecture-impact', 'within-existing-boundary', 'cross-boundary']);
const VALID_DOCUMENTATION_DECISIONS = new Set(['updated', 'no_change_required']);
const VALID_DOCUMENTATION_ACTIONS = new Set(['updated', 'reviewed_current']);
const PLACEHOLDER_PATTERN = /(?:^|\b)(unknown|not provided|n\/?a|none|todo|tbd|placeholder|example|generated|replace this)(?:\b|$)/i;
const DOCUMENT_PATH_PATTERN = /^docs\/.+\.(?:md|mdx|json|ya?ml)$/i;
const ADR_PATH_PATTERN = /^docs\/architecture\/adr\/.+\.md$/i;
const REQUIRED_SURFACES = [
  'backend',
  'frontend',
  'database',
  'scripts/deploy',
  'docs',
  'compliance',
  'POS',
  'Storefront',
  'DGFY',
  'tenant lifecycle',
  'payments',
];

const PAYMENT_PATTERNS = [
  /paymongo/i,
  /payment/i,
  /payments/i,
  /billing/i,
  /commerce[-_/]?payment/i,
  /webhook/i,
  /settlement/i,
  /^docs\/architecture\/adr\/0027-/i,
  /^docs\/features\/PAYMONGO_QRPH_COMMERCE_PAYMENTS\.md$/i,
];

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
  /^backend\/src\/modules\/payments?\//,
  /^backend\/tests\/dgfyCustomer/,
  /^backend\/tests\/store.*(Customer|Order|Tracking|Checkout|Repository|UseCases)/,
  /^docs\/features\/DGFY_CUSTOMER_ACCOUNT\.md$/,
  /^docs\/features\/STOREFRONT_CURRENT_STANDING\.md$/,
  /^docs\/architecture\/adr\/0023-front-facing-dgfy-customer-account\.md$/,
  /^docs\/ops\/MERGE_ADOPTION_GATE\.md$/,
  /^docs\/templates\/MERGE_ADOPTION_MANIFEST_TEMPLATE\.json$/,
  /^scripts\/deploy/,
  /^\.github\/workflows\//,
];

class BatchInventoryError extends Error {
  constructor(message, options = {}) {
    super(message);
    this.name = 'BatchInventoryError';
    this.code = options.code || 'BATCH_INVENTORY_FAILED';
    this.report = options.report || null;
    this.failures = options.failures || [];
  }
}

function parseArgs(argv) {
  const options = {
    projectRoot: process.cwd(),
    base: process.env.BATCH_INVENTORY_BASE || 'origin/master',
    head: process.env.BATCH_INVENTORY_HEAD || process.env.RELEASE_TARGET_SHA || process.env.GITHUB_SHA || 'HEAD',
    inventoryPath: process.env.BATCH_INVENTORY_FILE || '',
    markdownPath: process.env.BATCH_INVENTORY_MARKDOWN || '',
    reviewedManifestPath: process.env.BATCH_REVIEWED_MANIFEST || '',
    write: false,
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
    } else if (arg === '--reviewed-manifest') {
      options.reviewedManifestPath = argv[index + 1] || '';
      index += 1;
    } else if (arg === '--write') {
      options.write = true;
    } else if (arg === '--require-ship') {
      options.requireShip = true;
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

function isTrackedAtRef(projectRoot, ref, filePath) {
  if (!projectRoot || !ref || !filePath) return false;
  return runGit(projectRoot, ['cat-file', '-e', `${ref}:${filePath}`]).ok;
}

function isReviewedText(value, minimumLength = 12) {
  return typeof value === 'string'
    && value.trim().length >= minimumLength
    && !PLACEHOLDER_PATTERN.test(value);
}

function validateDocumentationClosure(slice, options = {}) {
  const failures = [];
  const sliceName = slice.slice_name || slice.name || '<unnamed>';
  const classification = slice.architecture_classification;
  const closure = slice.documentation_closure;
  const changed = new Set(options.expectedChangedFiles || []);

  if (!VALID_ARCHITECTURE_CLASSIFICATIONS.has(classification)) {
    failures.push(`slice ${sliceName} has invalid architecture_classification: ${classification || '<missing>'}`);
  }
  if (!closure || typeof closure !== 'object' || Array.isArray(closure)) {
    failures.push(`slice ${sliceName} requires documentation_closure`);
    return failures;
  }
  if (!VALID_DOCUMENTATION_DECISIONS.has(closure.decision)) {
    failures.push(`slice ${sliceName} has invalid documentation_closure decision: ${closure.decision || '<missing>'}`);
  }
  if (!isReviewedText(closure.reviewed_by)) failures.push(`slice ${sliceName} documentation_closure reviewed_by is missing or placeholder`);
  if (!Number.isFinite(Date.parse(closure.reviewed_at || ''))) failures.push(`slice ${sliceName} documentation_closure reviewed_at must be a valid timestamp`);
  if (!isReviewedText(closure.rationale, closure.decision === 'no_change_required' ? 24 : 12)) {
    failures.push(`slice ${sliceName} documentation_closure rationale is missing, placeholder, or too vague`);
  }
  if (!Array.isArray(closure.documents) || closure.documents.length === 0) {
    failures.push(`slice ${sliceName} documentation_closure requires at least one document`);
    return failures;
  }

  const seen = new Set();
  let updatedCount = 0;
  let reviewedCurrentCount = 0;
  let updatedAdrCount = 0;
  for (const document of closure.documents) {
    if (!document || typeof document !== 'object' || Array.isArray(document)) {
      failures.push(`slice ${sliceName} documentation_closure document entries must be objects`);
      continue;
    }
    const documentPath = String(document.path || '').replace(/\\/g, '/');
    if (!DOCUMENT_PATH_PATTERN.test(documentPath) || documentPath.includes('..')) {
      failures.push(`slice ${sliceName} documentation_closure path is not a governed document: ${documentPath || '<missing>'}`);
    }
    if (seen.has(documentPath)) failures.push(`slice ${sliceName} documentation_closure repeats document: ${documentPath}`);
    seen.add(documentPath);
    if (!VALID_DOCUMENTATION_ACTIONS.has(document.action)) {
      failures.push(`slice ${sliceName} documentation_closure has invalid action for ${documentPath || '<missing>'}`);
    }
    if (!isReviewedText(document.evidence)) {
      failures.push(`slice ${sliceName} documentation_closure evidence is missing or placeholder for ${documentPath || '<missing>'}`);
    }
    if (options.projectRoot && options.headSha && !isTrackedAtRef(options.projectRoot, options.headSha, documentPath)) {
      failures.push(`slice ${sliceName} documentation_closure document is missing or untracked at candidate SHA: ${documentPath}`);
    }
    if (document.action === 'updated') {
      updatedCount += 1;
      if (!changed.has(documentPath)) failures.push(`slice ${sliceName} documentation_closure marks an unchanged document as updated: ${documentPath}`);
      if (ADR_PATH_PATTERN.test(documentPath)) updatedAdrCount += 1;
    }
    if (document.action === 'reviewed_current') reviewedCurrentCount += 1;
  }

  if (closure.decision === 'updated' && updatedCount === 0) {
    failures.push(`slice ${sliceName} documentation_closure decision=updated requires at least one updated document`);
  }
  if (closure.decision === 'no_change_required') {
    if (updatedCount > 0) failures.push(`slice ${sliceName} documentation_closure decision=no_change_required cannot contain updated documents`);
    if (reviewedCurrentCount === 0) failures.push(`slice ${sliceName} documentation_closure decision=no_change_required requires a reviewed_current document`);
  }
  if (classification === 'cross-boundary' && updatedAdrCount === 0) {
    failures.push(`slice ${sliceName} is cross-boundary and requires an updated ADR in documentation_closure`);
  }
  for (const requiredDoc of slice.required_docs || []) {
    const normalized = String(requiredDoc || '').replace(/\\/g, '/');
    if (!DOCUMENT_PATH_PATTERN.test(normalized) || normalized.includes('..')) {
      failures.push(`slice ${sliceName} required_docs contains a non-document path: ${normalized || '<missing>'}`);
    }
    if (options.projectRoot && options.headSha && !isTrackedAtRef(options.projectRoot, options.headSha, normalized)) {
      failures.push(`slice ${sliceName} required document is missing or untracked at candidate SHA: ${normalized}`);
    }
    if (!seen.has(normalized)) failures.push(`slice ${sliceName} required document is absent from documentation_closure: ${normalized}`);
  }
  return failures;
}

function buildDocumentationClosureReport(inventory, options = {}) {
  const releaseSlices = normalizeSlices(inventory);
  const sliceReports = releaseSlices.map((slice) => {
    const failures = validateDocumentationClosure(slice, {
      ...options,
      headSha: options.headSha || inventory.head_sha,
      expectedChangedFiles: options.expectedChangedFiles || inventory.expected_changed_files || [],
    });
    return {
      slice_id: slice.id,
      slice_name: slice.slice_name || slice.name,
      status: failures.length === 0 ? 'pass' : 'fail',
      architecture_classification: slice.architecture_classification || null,
      decision: slice.documentation_closure?.decision || null,
      reviewed_by: slice.documentation_closure?.reviewed_by || null,
      reviewed_at: slice.documentation_closure?.reviewed_at || null,
      documents: slice.documentation_closure?.documents || [],
      failures,
    };
  });
  const failures = sliceReports.flatMap((slice) => slice.failures);
  return {
    schema: 'sku-documentation-closure/v1',
    version: 1,
    generated_at: new Date().toISOString(),
    target_sha: inventory.head_sha,
    status: failures.length === 0 ? 'pass' : 'fail',
    non_bypassable: true,
    failures,
    release_slices: sliceReports,
  };
}

function unique(values) {
  return Array.from(new Set(values.filter(Boolean)));
}

function affectedSurfacesForFile(filePath) {
  const surfaces = [];
  if (filePath.startsWith('backend/')) surfaces.push('backend');
  if (filePath.startsWith('frontend/')) surfaces.push('frontend');
  if (/(^|\/)migrations?\//i.test(filePath) || /schema|sequelize/i.test(filePath)) surfaces.push('database');
  if (filePath.startsWith('scripts/') || filePath.startsWith('.github/')) surfaces.push('scripts/deploy');
  if (filePath.startsWith('docs/')) surfaces.push('docs');
  if (filePath.startsWith('docs/compliance/') || filePath.includes('/compliance/')) surfaces.push('compliance');
  if (/(^|\/)(pos|POS|terminal|cashier)/.test(filePath)) surfaces.push('POS');
  if (/storefront|apps\/store|tenant-store|catalog/i.test(filePath)) surfaces.push('Storefront');
  if (/dgfy/i.test(filePath)) surfaces.push('DGFY');
  if (/tenant|provision|registration|company/i.test(filePath)) surfaces.push('tenant lifecycle');
  if (isPaymentSensitive(filePath)) surfaces.push('payments');
  return unique(surfaces.length > 0 ? surfaces : ['scripts/deploy']);
}

function sliceKeyForFile(filePath) {
  if (isPaymentSensitive(filePath)) return 'payments';
  if (/dgfy/i.test(filePath)) return 'DGFY';
  if (/storefront|apps\/store|tenant-store|catalog/i.test(filePath)) return 'Storefront';
  if (/(^|\/)(pos|POS|terminal|cashier)/.test(filePath)) return 'POS';
  if (/tenant|provision|registration|company/i.test(filePath)) return 'tenant-lifecycle';
  if (filePath.startsWith('backend/')) return 'backend';
  if (filePath.startsWith('frontend/')) return 'frontend';
  if (filePath.startsWith('docs/')) return 'docs';
  if (filePath.startsWith('scripts/') || filePath.startsWith('.github/')) return 'release-automation';
  return 'repository-support';
}

function titleForSliceKey(key) {
  return {
    payments: 'Payment-sensitive release slice',
    DGFY: 'DGFY release slice',
    Storefront: 'Storefront release slice',
    POS: 'POS release slice',
    'tenant-lifecycle': 'Tenant lifecycle release slice',
    backend: 'Backend release slice',
    frontend: 'Frontend release slice',
    docs: 'Documentation release slice',
    'release-automation': 'Release automation slice',
    'repository-support': 'Repository support slice',
  }[key] || 'Release slice';
}

function isPaymentSensitive(filePath) {
  return PAYMENT_PATTERNS.some((pattern) => pattern.test(filePath));
}

function isHighRiskPath(filePath) {
  return HIGH_RISK_PATH_PATTERNS.some((pattern) => pattern.test(filePath));
}

function inferTests(surfaces, paymentSensitive, highRiskPath) {
  const tests = ['npm run lint:docs', 'npm run check:architecture', 'npm run check:compliance'];
  if (surfaces.includes('backend') || surfaces.includes('database')) tests.push('npm run test:backend:matrix');
  if (surfaces.includes('frontend') || surfaces.includes('POS') || surfaces.includes('Storefront') || surfaces.includes('DGFY')) {
    tests.push('npm run test:frontend', 'npm --prefix frontend run build:all', 'npm run check:frontend-budgets');
  }
  if (surfaces.includes('scripts/deploy')) tests.push('npm run test:development-to-production');
  if (highRiskPath) tests.push('npm run check:merge-adoption-required');
  if (paymentSensitive) tests.push('payment-release approval evidence', 'ADR 0027 payment-specific gates');
  return unique(tests);
}

function inferRiskLevel(surfaces, paymentSensitive, highRiskPath) {
  if (paymentSensitive) return 'critical';
  if (highRiskPath) return 'high';
  if (surfaces.some((surface) => ['backend', 'database', 'scripts/deploy', 'compliance'].includes(surface))) {
    return 'medium';
  }
  return 'low';
}

function inferRegressionRiskLevel({ surfaces, paymentSensitive, highRiskPath, files }) {
  if (paymentSensitive) return 'critical';
  if (files.some((file) => /migrations|payment|paymongo|billing|compliance/i.test(file))) return 'critical';
  if (files.some((file) => /deploy|release|production|workflow/i.test(file))) return 'critical';
  if (highRiskPath) return 'high';
  if (files.some((file) => /auth|session|tenant|dgfy|checkout|order|tracking|storefront|discovery|map|pos|fiscal/i.test(file))) {
    return 'high';
  }
  if (surfaces.some((surface) => ['backend', 'database', 'scripts/deploy', 'compliance'].includes(surface))) {
    return 'medium';
  }
  if (surfaces.some((surface) => ['frontend', 'docs'].includes(surface))) return 'low';
  return 'none';
}

function inferPotentiallyAffectedBehaviors({ surfaces, paymentSensitive, highRiskPath, files }) {
  const behaviors = [];

  if (paymentSensitive) behaviors.push('Payment, checkout, billing, webhook, or settlement behavior');
  if (highRiskPath) behaviors.push('High-risk customer or operator workflow touched by the changed files');
  if (surfaces.includes('backend')) behaviors.push('API behavior, validation, persistence side effects, or tenant-scoped behavior');
  if (surfaces.includes('frontend')) behaviors.push('User-facing UI behavior, shared components, routing, or browser interaction');
  if (surfaces.includes('database')) behaviors.push('Migration, tenant schema, seed, or data compatibility behavior');
  if (surfaces.includes('scripts/deploy')) behaviors.push('Release, deployment, rollback, or production proof behavior');
  if (surfaces.includes('compliance')) behaviors.push('Compliance, fiscal, billing, or governed operational behavior');

  if (files.some((file) => /deploy|release|production|workflow/i.test(file))) {
    behaviors.push('Release, deployment, rollback, production authorization, or production proof behavior');
  }

  if (files.some((file) => /storefront|discovery|map|checkout|order|tracking/i.test(file))) {
    behaviors.push('Storefront discovery, checkout, order tracking, or map/search behavior');
  }

  if (files.some((file) => /auth|session|tenant|dgfy|invite|registration/i.test(file))) {
    behaviors.push('Authentication, session, DGFY, tenant lifecycle, invitation, or registration behavior');
  }

  return unique(behaviors);
}

function inferRegressionEvidenceGaps({ surfaces, paymentSensitive, highRiskPath, files }) {
  const gaps = [];

  if (paymentSensitive) {
    gaps.push('Payment-sensitive release requires explicit payment approval and payment-specific verification before production.');
  }

  if (highRiskPath) {
    gaps.push('High-risk path requires targeted regression evidence, not only generic build/test success.');
  }

  if (surfaces.includes('frontend')) {
    gaps.push('Rendered/browser QA may be required for user-facing UI behavior when practical.');
  }

  if (surfaces.includes('database')) {
    gaps.push('Tenant/schema compatibility and rollback evidence must be reviewed.');
  }

  if (surfaces.includes('scripts/deploy')) {
    gaps.push('Release automation changes require proof that deploy gates still fail closed and preserve required artifacts.');
  }

  if (files.some((file) => /storefront|discovery|map/i.test(file))) {
    gaps.push('Storefront map/search changes should include focused discovery tests and browser or public-route smoke evidence.');
  }

  if (files.some((file) => /auth|session|tenant|dgfy|registration|invite/i.test(file))) {
    gaps.push('Auth/session/tenant lifecycle changes should include duplicate/conflict, replay/reuse, and adjacent-flow regression proof.');
  }

  return unique(gaps);
}

function buildRegressionWarningSummary({ name, surfaces, paymentSensitive, highRiskPath, files }) {
  const level = inferRegressionRiskLevel({ surfaces, paymentSensitive, highRiskPath, files });

  if (level === 'none') {
    return 'No specific regression risk identified from the reviewed diff, affected surfaces, and available evidence.';
  }

  const affected = inferPotentiallyAffectedBehaviors({ surfaces, paymentSensitive, highRiskPath, files });
  const affectedText = affected.length > 0 ? affected.join('; ') : 'existing production behavior';

  return `${name} may regress ${affectedText}. Review targeted evidence before approving production deployment.`;
}

function withRegressionRiskFields(slice) {
  const files = Array.isArray(slice.included_files) ? slice.included_files : [];
  const surfaces = unique(
    Array.isArray(slice.affected_surfaces) && slice.affected_surfaces.length > 0
      ? slice.affected_surfaces
      : files.flatMap(affectedSurfacesForFile)
  ).sort();
  const paymentSensitive = typeof slice.payment_sensitive === 'boolean'
    ? slice.payment_sensitive
    : files.some(isPaymentSensitive);
  const highRiskPath = typeof slice.high_risk_path === 'boolean'
    ? slice.high_risk_path
    : files.some(isHighRiskPath);
  const regressionRiskLevel = inferRegressionRiskLevel({
    surfaces,
    paymentSensitive,
    highRiskPath,
    files,
  });
  const name = slice.slice_name || slice.name || 'Release slice';

  return {
    ...slice,
    affected_surfaces: surfaces,
    regression_risk_level: regressionRiskLevel,
    regression_warning_required: regressionRiskLevel !== 'none',
    regression_warning_summary: buildRegressionWarningSummary({
      name,
      surfaces,
      paymentSensitive,
      highRiskPath,
      files,
    }),
    potentially_affected_existing_behaviors: inferPotentiallyAffectedBehaviors({
      surfaces,
      paymentSensitive,
      highRiskPath,
      files,
    }),
    evidence_covering_regression_risk: Array.isArray(slice.completed_tests) && slice.completed_tests.length > 0
      ? slice.completed_tests
      : (Array.isArray(slice.required_tests) ? slice.required_tests : []),
    evidence_gaps: inferRegressionEvidenceGaps({
      surfaces,
      paymentSensitive,
      highRiskPath,
      files,
    }),
    rollback_or_monitoring_notes: [
      'Use the documented rollback path for this release slice.',
      'Monitor production health, runtime SHA, public endpoints, and feature-specific smoke evidence after deployment.',
    ],
  };
}

function inferSourceAttribution() {
  const eventName = process.env.GITHUB_EVENT_NAME || '';
  const prNumber = process.env.GITHUB_REF_NAME && process.env.GITHUB_REF_NAME.match(/^(\d+)\/merge$/)
    ? process.env.GITHUB_REF_NAME.split('/')[0]
    : (process.env.GITHUB_PR_NUMBER || '');
  const sourceBranch = process.env.GITHUB_HEAD_REF || process.env.GITHUB_REF_NAME || process.env.BATCH_SOURCE_BRANCH || '';
  const sourceType = eventName === 'pull_request'
    ? 'developer_pr'
    : sourceBranch === 'staging'
      ? 'direct_owner_staging_or_merged_pr'
      : 'promotion_candidate';

  return {
    source_type: sourceType,
    source_branch: sourceBranch || '',
    source_pr: prNumber || process.env.BATCH_SOURCE_PR || '',
    owner_or_author: process.env.GITHUB_ACTOR || process.env.BATCH_OWNER || '',
  };
}

function buildSlice({ key, files, options }) {
  const surfaces = unique(files.flatMap(affectedSurfacesForFile)).sort();
  const paymentFiles = files.filter(isPaymentSensitive);
  const highRiskFiles = files.filter(isHighRiskPath);
  const paymentSensitive = paymentFiles.length > 0;
  const highRiskPath = highRiskFiles.length > 0;
  const riskLevel = inferRiskLevel(surfaces, paymentSensitive, highRiskPath);
  const verdict = 'blocked';
  const requiredTests = inferTests(surfaces, paymentSensitive, highRiskPath);
  const sourceAttribution = inferSourceAttribution();
  const name = titleForSliceKey(key);

  return withRegressionRiskFields({
    id: key.replace(/[^a-z0-9]+/gi, '-').replace(/^-|-$/g, '').toLowerCase(),
    slice_name: name,
    name,
    plain_english_purpose: `Promote the ${name.toLowerCase()} in the exact qualified candidate without allowing unrelated work to ride along.`,
    purpose: `Promote the ${name.toLowerCase()} in the exact qualified candidate without allowing unrelated work to ride along.`,
    implementation_summary: `DRAFT generated from changed files between ${options.base} and ${options.head}; replace this summary during review.`,
    included_files: files,
    included_features: [`Files grouped under ${key}`],
    excluded_files: [],
    excluded_features: [
      'Uncommitted local files',
      'Stashes unless explicitly approved',
      'Preserved PayMongo/payment-channel stash unless explicit payment-release approval is recorded',
    ],
    owner_attribution: sourceAttribution.owner_or_author,
    source_branch: sourceAttribution.source_branch,
    source_pr: sourceAttribution.source_pr,
    source_type: sourceAttribution.source_type,
    affected_surfaces: surfaces,
    affected_surface_map: Object.fromEntries(REQUIRED_SURFACES.map((surface) => [surface, surfaces.includes(surface)])),
    risk_level: riskLevel,
    required_tests: requiredTests,
    completed_tests: [],
    docs_required: true,
    required_docs: ['docs/ops/DEVELOPMENT_TO_PRODUCTION_WORKFLOW.md'],
    architecture_classification: 'no-architecture-impact',
    documentation_closure: {
      decision: 'no_change_required',
      reviewed_by: 'DRAFT reviewer required',
      reviewed_at: '',
      rationale: 'DRAFT documentation closure review required before promotion.',
      documents: [{
        path: 'docs/ops/DEVELOPMENT_TO_PRODUCTION_WORKFLOW.md',
        action: 'reviewed_current',
        evidence: 'DRAFT reviewer must confirm this document remains current.',
      }],
    },
    adr_compliance_declaration_required: paymentSensitive || surfaces.includes('compliance'),
    adr_or_compliance: paymentSensitive
      ? 'Payment-sensitive candidate: explicit payment-release approval plus ADR 0027 and payment-specific gates are required before automatic promotion.'
      : 'ADR not required unless implementation changes runtime ownership, data contracts, payment behavior, or architecture boundaries.',
    rollback_notes: 'Revert the promoted master merge commit, re-run exact-SHA qualification, and deploy the revert SHA through the same governed workflow.',
    production_proof_required: [
      'production remote HEAD',
      '.deploy-state/last_deployed_commit',
      'newest deploy summary deployed_head/remote_head/expected_commit',
      'production deployment contract',
      'frontend build manifest and asset parity',
      '/api/v1/health services.observability.runtime_sha',
      'backend, IMS, POS, Storefront, public endpoint, and tenant-store asset checks',
      'feature-specific smoke evidence for this slice',
    ],
    production_accuracy_checks_required: [
      'deployed diff matches this slice inventory',
      'live behavior matches the intended contract',
      'docs/current-state wording does not overclaim production state',
      'developer PR or owner direct-staging attribution is reflected accurately',
    ],
    can_ship_independently: false,
    promotion_eligibility: 'blocked',
    verdict,
    payment_sensitive: paymentSensitive,
    payment_sensitive_files: paymentFiles,
    high_risk_path: highRiskPath,
    high_risk_files: highRiskFiles,
  });
}

function groupFilesIntoSlices(files, options) {
  const groups = new Map();
  for (const filePath of files) {
    const key = sliceKeyForFile(filePath);
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(filePath);
  }
  return Array.from(groups.entries())
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([key, groupFiles]) => buildSlice({
      key,
      files: groupFiles.sort(),
      options,
    }));
}

function readReviewedManifest(projectRoot, manifestPath) {
  if (!manifestPath) return null;
  const absolutePath = path.resolve(projectRoot, manifestPath);
  if (!fs.existsSync(absolutePath)) {
    throw new BatchInventoryError(`Reviewed batch manifest is missing: ${manifestPath}`, { code: 'REVIEWED_MANIFEST_MISSING' });
  }
  try {
    return JSON.parse(fs.readFileSync(absolutePath, 'utf8'));
  } catch (error) {
    throw new BatchInventoryError(`Reviewed batch manifest is invalid JSON: ${error.message}`, { code: 'REVIEWED_MANIFEST_INVALID' });
  }
}

function applyReviewedManifest(draft, manifest, manifestPath) {
  if (!manifest) return draft;
  if (manifest.schema !== 'sku-reviewed-batch-manifest/v1') {
    throw new BatchInventoryError('Reviewed batch manifest schema must be sku-reviewed-batch-manifest/v1', { code: 'REVIEWED_MANIFEST_INVALID' });
  }
  const slices = Array.isArray(manifest.release_slices) ? manifest.release_slices.map(withRegressionRiskFields) : [];
  const paymentSensitive = slices.some((slice) => (slice.included_files || []).some(isPaymentSensitive));
  const highRiskPath = slices.some((slice) => (slice.included_files || []).some(isHighRiskPath));
  const eligible = slices.length > 0 && slices.every((slice) => slice.verdict === 'ship');
  return {
    ...draft,
    reviewed_manifest: String(manifestPath).replace(/\\/g, '/'),
    review_status: manifest.review_status,
    reviewed_by: manifest.reviewed_by,
    reviewed_at: manifest.reviewed_at,
    source_pr: manifest.source_pr,
    payment_sensitive: paymentSensitive,
    payment_authorization_required: paymentSensitive,
    high_risk_path: highRiskPath,
    status: eligible ? 'pass' : 'blocked',
    promotion_eligibility: eligible ? 'eligible' : 'blocked',
    release_slices: slices,
    batches: slices,
  };
}

function buildInventory(options) {
  const projectRoot = path.resolve(options.projectRoot);
  const baseSha = resolveCommit(projectRoot, options.base);
  const headSha = resolveCommit(projectRoot, options.head);
  const files = changedFiles(projectRoot, options.base, options.head).sort();
  const slices = groupFilesIntoSlices(files, options);
  const draft = {
    version: 2,
    generated_at: new Date().toISOString(),
    base_ref: options.base,
    base_sha: baseSha,
    head_ref: options.head,
    head_sha: headSha,
    expected_changed_files: files,
    changed_file_count: files.length,
    reviewed_manifest: '',
    review_status: 'draft',
    reviewed_by: '',
    reviewed_at: '',
    source_pr: '',
    payment_sensitive: slices.some((slice) => slice.payment_sensitive),
    payment_authorization_required: slices.some((slice) => slice.payment_sensitive),
    high_risk_path: slices.some((slice) => slice.high_risk_path),
    status: 'blocked',
    promotion_eligibility: 'blocked',
    release_slices: files.length > 0 ? slices : [],
    batches: files.length > 0 ? slices : [],
  };
  const manifest = readReviewedManifest(projectRoot, options.reviewedManifestPath);
  return applyReviewedManifest(draft, manifest, options.reviewedManifestPath);
}

function normalizeSlices(inventory) {
  if (Array.isArray(inventory.release_slices)) return inventory.release_slices;
  if (Array.isArray(inventory.batches)) return inventory.batches;
  return [];
}

function validateInventory(inventory, options = {}) {
  const failures = [];
  if (!inventory || typeof inventory !== 'object') return ['inventory must be a JSON object'];
  if (inventory.version !== 2) failures.push('inventory.version must be 2');
  if (!inventory.head_sha) failures.push('inventory.head_sha is required');
  if (options.requireShip) {
    if (inventory.review_status !== 'reviewed') failures.push('inventory.review_status must be reviewed');
    for (const [field, value] of Object.entries({
      reviewed_by: inventory.reviewed_by,
      reviewed_at: inventory.reviewed_at,
      source_pr: inventory.source_pr,
      reviewed_manifest: inventory.reviewed_manifest,
    })) {
      if (!value || PLACEHOLDER_PATTERN.test(String(value))) failures.push(`inventory.${field} must be a reviewed non-placeholder value`);
    }
    if (!Number.isFinite(Date.parse(inventory.reviewed_at))) failures.push('inventory.reviewed_at must be a valid timestamp');
  }

  const slices = normalizeSlices(inventory);
  if (!Array.isArray(slices)) failures.push('inventory.release_slices or inventory.batches must be an array');
  if ((inventory.changed_file_count || 0) > 0 && slices.length === 0) {
    failures.push('changed files require at least one release slice');
  }

  const seenFiles = new Map();
  for (const slice of slices) {
    const sliceName = slice.slice_name || slice.name || '<unnamed>';
    const purpose = slice.plain_english_purpose || slice.purpose;
    if (!slice.slice_name && !slice.name) failures.push('slice missing slice_name');
    if (!purpose || String(purpose).trim().length < 12) failures.push(`slice ${sliceName} missing plain-English purpose`);
    if (!slice.implementation_summary || (options.requireShip && PLACEHOLDER_PATTERN.test(String(slice.implementation_summary)))) {
      failures.push(`slice ${sliceName} missing reviewed implementation_summary`);
    }
    if (!Array.isArray(slice.included_files) || slice.included_files.length === 0) {
      failures.push(`slice ${sliceName} requires non-empty included_files`);
    }
    if (!Array.isArray(slice.excluded_files)) failures.push(`slice ${sliceName} requires excluded_files array`);
    if (!Array.isArray(slice.excluded_features) || slice.excluded_features.length === 0) {
      failures.push(`slice ${sliceName} must state excluded work or non-goals`);
    }
    if (typeof slice.payment_sensitive !== 'boolean') failures.push(`slice ${sliceName} must declare payment_sensitive`);
    if (typeof slice.high_risk_path !== 'boolean') failures.push(`slice ${sliceName} must declare high_risk_path`);
    if (typeof slice.docs_required !== 'boolean') failures.push(`slice ${sliceName} must declare docs_required`);
    if (!VALID_RISK_LEVELS.has(slice.risk_level)) failures.push(`slice ${sliceName} has invalid risk_level`);
    if (!VALID_REGRESSION_RISK_LEVELS.has(slice.regression_risk_level)) {
      failures.push(`slice ${sliceName} has invalid regression_risk_level`);
    }
    if (typeof slice.regression_warning_required !== 'boolean') {
      failures.push(`slice ${sliceName} must declare regression_warning_required`);
    }
    if (!slice.regression_warning_summary || typeof slice.regression_warning_summary !== 'string') {
      failures.push(`slice ${sliceName} missing regression_warning_summary`);
    }
    if (!VALID_VERDICTS.has(slice.verdict)) failures.push(`slice ${sliceName} has invalid verdict: ${slice.verdict}`);
    if (options.requireShip && slice.verdict !== 'ship') failures.push(`slice is not ship-ready: ${sliceName}`);

    for (const field of ['affected_surfaces', 'required_tests', 'required_docs', 'production_proof_required', 'production_accuracy_checks_required']) {
      if (!Array.isArray(slice[field]) || slice[field].length === 0) {
        failures.push(`slice ${sliceName} requires non-empty ${field}`);
      }
    }
    if (!Array.isArray(slice.completed_tests)) failures.push(`slice ${sliceName} requires completed_tests array`);
    for (const field of [
      'potentially_affected_existing_behaviors',
      'evidence_covering_regression_risk',
      'evidence_gaps',
      'rollback_or_monitoring_notes',
    ]) {
      if (!Array.isArray(slice[field])) {
        failures.push(`slice ${sliceName} missing ${field}`);
      }
    }
    if (['high', 'critical'].includes(slice.regression_risk_level)) {
      const hasEvidenceGap = Array.isArray(slice.evidence_gaps) && slice.evidence_gaps.length > 0;
      const hasTargetedEvidence = Array.isArray(slice.evidence_covering_regression_risk)
        && slice.evidence_covering_regression_risk.length > 0;
      if (!hasEvidenceGap && !hasTargetedEvidence) {
        failures.push(`slice ${sliceName} must disclose regression evidence gaps or targeted evidence for high/critical risk`);
      }
    }
    if (options.requireShip && Array.isArray(slice.completed_tests)) {
      if (slice.completed_tests.length === 0) failures.push(`slice ${sliceName} requires non-empty completed_tests`);
      const completedCommands = new Set();
      for (const test of slice.completed_tests) {
        if (!test || typeof test !== 'object' || Array.isArray(test)) {
          failures.push(`slice ${sliceName} completed_tests entries must be evidence objects`);
          continue;
        }
        if (!test.command || test.status !== 'pass' || !test.evidence || PLACEHOLDER_PATTERN.test(String(test.evidence))) {
          failures.push(`slice ${sliceName} has a completed test claim without passing evidence`);
        } else {
          completedCommands.add(test.command);
        }
      }
      for (const command of slice.required_tests || []) {
        if (!completedCommands.has(command)) failures.push(`slice ${sliceName} missing completed test evidence for: ${command}`);
      }
    }
    if (!slice.adr_or_compliance) failures.push(`slice ${sliceName} missing ADR/compliance declaration`);
    if (typeof slice.adr_compliance_declaration_required !== 'boolean') {
      failures.push(`slice ${sliceName} must declare adr_compliance_declaration_required`);
    }
    if (!slice.rollback_notes || (options.requireShip && PLACEHOLDER_PATTERN.test(String(slice.rollback_notes)))) failures.push(`slice ${sliceName} missing rollback_notes`);
    if (options.requireShip && (!slice.owner_attribution || PLACEHOLDER_PATTERN.test(String(slice.owner_attribution)))) failures.push(`slice ${sliceName} missing owner/source attribution`);
    if (options.requireShip && (!slice.source_branch || PLACEHOLDER_PATTERN.test(String(slice.source_branch)))) failures.push(`slice ${sliceName} missing source_branch`);
    if (options.requireShip && (!slice.source_pr || PLACEHOLDER_PATTERN.test(String(slice.source_pr)))) failures.push(`slice ${sliceName} missing source_pr`);
    if (options.requireShip && !VALID_SOURCE_TYPES.has(slice.source_type)) failures.push(`slice ${sliceName} has invalid source_type: ${slice.source_type || '<missing>'}`);
    if (!slice.promotion_eligibility) failures.push(`slice ${sliceName} missing promotion_eligibility`);

    if (options.requireShip) {
      failures.push(...validateDocumentationClosure(slice, {
        projectRoot: options.projectRoot,
        headSha: inventory.head_sha,
        expectedChangedFiles: options.expectedChangedFiles || inventory.expected_changed_files || [],
      }));
    }

    const computedPaymentSensitive = (slice.included_files || []).some(isPaymentSensitive);
    if (slice.payment_sensitive !== computedPaymentSensitive) failures.push(`slice ${sliceName} payment_sensitive does not match included files`);
    const computedHighRisk = (slice.included_files || []).some(isHighRiskPath);
    if (slice.high_risk_path !== computedHighRisk) failures.push(`slice ${sliceName} high_risk_path does not match included files`);

    for (const filePath of slice.included_files || []) {
      if (seenFiles.has(filePath)) {
        failures.push(`file appears in more than one slice: ${filePath}`);
      }
      seenFiles.set(filePath, sliceName);
    }
  }

  const expectedFiles = options.expectedChangedFiles || inventory.expected_changed_files || [];
  if (Array.isArray(expectedFiles) && expectedFiles.length > 0) {
    const expected = new Set(expectedFiles);
    const actual = new Set(seenFiles.keys());
    for (const filePath of expected) {
      if (!actual.has(filePath)) failures.push(`changed file is not mapped to a slice: ${filePath}`);
    }
    for (const filePath of actual) {
      if (!expected.has(filePath)) failures.push(`slice maps a file outside the candidate diff: ${filePath}`);
    }
  } else if (seenFiles.size !== (inventory.changed_file_count || 0)) {
    failures.push(`slice file coverage mismatch: covered=${seenFiles.size} changed=${inventory.changed_file_count || 0}`);
  }

  return failures;
}

function toMarkdown(inventory) {
  const slices = normalizeSlices(inventory);
  const lines = [
    '## Batch Inventory',
    '',
    `- Candidate SHA: \`${inventory.head_sha}\``,
    `- Base SHA: \`${inventory.base_sha}\``,
    `- Changed files: ${inventory.changed_file_count}`,
    `- Status: \`${inventory.status}\``,
    `- Promotion eligibility: \`${inventory.promotion_eligibility}\``,
    `- Review status: \`${inventory.review_status || 'draft'}\``,
    `- Reviewed by: \`${inventory.reviewed_by || 'pending'}\``,
    `- Source PR: \`${inventory.source_pr || 'pending'}\``,
    `- Payment sensitive: ${inventory.payment_sensitive ? 'yes' : 'no'}`,
    `- High-risk paths changed: ${inventory.high_risk_path ? 'yes' : 'no'}`,
    '',
  ];

  for (const slice of slices) {
    lines.push(`### ${slice.slice_name || slice.name}`);
    lines.push('');
    lines.push(`- Purpose: ${slice.plain_english_purpose || slice.purpose}`);
    lines.push(`- Summary: ${slice.implementation_summary}`);
    lines.push(`- Source: ${slice.source_type || 'unknown'}; branch \`${slice.source_branch || 'unknown'}\`; PR/source \`${slice.source_pr || 'not provided'}\`; owner \`${slice.owner_attribution || 'unknown'}\``);
    lines.push(`- Verdict: \`${slice.verdict}\``);
    lines.push(`- Risk: \`${slice.risk_level}\``);
    lines.push(`- Regression risk: \`${slice.regression_risk_level || 'missing'}\``);
    lines.push(`- Regression warning: ${slice.regression_warning_summary || 'missing'}`);
    lines.push(`- Surfaces: ${(slice.affected_surfaces || []).join(', ') || 'none'}`);
    lines.push(`- Payment sensitive: ${slice.payment_sensitive ? 'yes' : 'no'}`);
    lines.push(`- High-risk path: ${slice.high_risk_path ? 'yes' : 'no'}`);
    lines.push(`- ADR/compliance: ${slice.adr_or_compliance}`);
    lines.push(`- Architecture classification: \`${slice.architecture_classification || 'missing'}\``);
    lines.push(`- Rollback: ${slice.rollback_notes}`);
    lines.push('');
    lines.push('Included files:');
    for (const filePath of slice.included_files || []) lines.push(`- \`${filePath}\``);
    lines.push('');
    lines.push('Excluded work:');
    for (const filePath of slice.excluded_files || []) lines.push(`- \`${filePath}\``);
    for (const excluded of slice.excluded_features || []) lines.push(`- ${excluded}`);
    lines.push('');
    lines.push('Required tests:');
    for (const testCommand of slice.required_tests || []) lines.push(`- \`${testCommand}\``);
    lines.push('');
    lines.push('Completed tests:');
    for (const testResult of slice.completed_tests || []) {
      if (typeof testResult === 'string') lines.push(`- \`${testResult}\` (invalid legacy claim; evidence required)`);
      else lines.push(`- \`${testResult.command}\` -> \`${testResult.status}\` (${testResult.evidence})`);
    }
    lines.push('');
    lines.push('Required docs:');
    for (const docPath of slice.required_docs || []) lines.push(`- \`${docPath}\``);
    lines.push('');
    lines.push('Documentation closure:');
    lines.push(`- Decision: \`${slice.documentation_closure?.decision || 'missing'}\``);
    lines.push(`- Reviewer: \`${slice.documentation_closure?.reviewed_by || 'missing'}\``);
    lines.push(`- Rationale: ${slice.documentation_closure?.rationale || 'missing'}`);
    for (const document of slice.documentation_closure?.documents || []) {
      lines.push(`- \`${document.path}\` -> \`${document.action}\` (${document.evidence})`);
    }
    lines.push('');
    lines.push('Production proof required:');
    for (const proof of slice.production_proof_required || []) lines.push(`- ${proof}`);
    lines.push('');
    lines.push('Production accuracy checks required:');
    for (const check of slice.production_accuracy_checks_required || []) lines.push(`- ${check}`);
    lines.push('');
    lines.push('Potentially affected existing behaviors:');
    for (const behavior of slice.potentially_affected_existing_behaviors || []) lines.push(`- ${behavior}`);
    lines.push('');
    lines.push('Regression evidence gaps:');
    for (const gap of slice.evidence_gaps || []) lines.push(`- ${gap}`);
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
  const failures = validateInventory(inventory, {
    requireShip: options.requireShip,
    expectedChangedFiles: inventory.expected_changed_files,
    projectRoot: path.resolve(options.projectRoot),
  });
  const markdown = toMarkdown(inventory);

  if (options.write) {
    if (options.inventoryPath) writeFile(options.inventoryPath, JSON.stringify(inventory, null, 2));
    if (options.markdownPath) writeFile(options.markdownPath, markdown);
  }

  if (failures.length > 0) {
    throw new BatchInventoryError(failures.join('\n'), {
      code: 'BATCH_INVENTORY_FAILED',
      report: inventory,
      failures,
    });
  }

  logger.log(
    `[batch-inventory] PASS status=${inventory.status} head=${inventory.head_sha.slice(0, 12)} files=${inventory.changed_file_count} slices=${normalizeSlices(inventory).length}`
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
  HIGH_RISK_PATH_PATTERNS,
  VALID_REGRESSION_RISK_LEVELS,
  parseArgs,
  runGit,
  resolveCommit,
  changedFiles,
  readReviewedManifest,
  applyReviewedManifest,
  buildInventory,
  validateInventory,
  checkBatchInventory,
  toMarkdown,
  normalizeSlices,
  isPaymentSensitive,
  isHighRiskPath,
  inferRegressionRiskLevel,
  inferPotentiallyAffectedBehaviors,
  inferRegressionEvidenceGaps,
  buildRegressionWarningSummary,
  withRegressionRiskFields,
  validateDocumentationClosure,
  buildDocumentationClosureReport,
  VALID_ARCHITECTURE_CLASSIFICATIONS,
  VALID_DOCUMENTATION_DECISIONS,
  VALID_DOCUMENTATION_ACTIONS,
};
