const test = require('node:test');
const assert = require('node:assert/strict');

const {
  buildRequestFromContent,
  deriveSummary,
  parseCsvField,
  parseFrontMatter,
  filterEndpointAcceptedSurfaces,
  classifyEndpointApplicability,
  truncateEvidenceEntry,
  VERIFICATION_EVIDENCE_MAX_LENGTH
} = require('./build-preflight-request');

const FIXTURE_DECLARATION = `---
status: reference
owner: engineering
last_reviewed: 2026-08-28
declaration_id: 2026-08-28-fixture-declaration
classification: major
surfaces: pos,terminal
reason_codes_impacted: ALLOWED,POS_ATTENDANCE_FEATURE_DISABLED
policy_version: 2026.08.28
verification_evidence: unit tests,integration tests,manual verification
rollback_note: Revert this commit; no schema or host action required.
---

# Fixture Declaration For Tests

This is the first paragraph of the fixture declaration body, describing what changed and why in one
place, and it should be picked up whole as the derived summary.

## Compliance Impact Classification

Major, for test purposes only.
`;

test('buildRequestFromContent splits every comma-separated front-matter field into an array', () => {
  const request = buildRequestFromContent(FIXTURE_DECLARATION, { declarationPath: 'fixture.md' });

  assert.deepEqual(request.surfaces, ['pos', 'terminal']);
  assert.deepEqual(request.impact_declaration.affected_surfaces, ['pos', 'terminal']);
  assert.deepEqual(request.impact_declaration.reason_codes_impacted, [
    'ALLOWED',
    'POS_ATTENDANCE_FEATURE_DISABLED'
  ]);
  assert.deepEqual(request.impact_declaration.verification_evidence, [
    'unit tests',
    'integration tests',
    'manual verification'
  ]);
});

test('buildRequestFromContent populates every field the live endpoint requires', () => {
  const request = buildRequestFromContent(FIXTURE_DECLARATION, { declarationPath: 'fixture.md' });

  assert.equal(request.request_name, 'Compliance preflight sweep - 2026-08-28-fixture-declaration');
  assert.equal(request.impact_declaration.declaration_id, '2026-08-28-fixture-declaration');
  assert.equal(request.impact_declaration.classification, 'major');
  assert.equal(request.impact_declaration.policy_version, '2026.08.28');
  assert.equal(
    request.impact_declaration.rollback_note,
    'Revert this commit; no schema or host action required.'
  );
  assert.ok(request.impact_declaration.summary.length > 0);
  assert.notEqual(request.impact_declaration.summary, '(no summary derivable from declaration body)');
});

test('deriveSummary pulls the first paragraph after the H1 heading, not the front matter or a later heading', () => {
  const summary = deriveSummary(FIXTURE_DECLARATION);

  assert.match(summary, /first paragraph of the fixture declaration body/);
  assert.doesNotMatch(summary, /Compliance Impact Classification/);
});

test('deriveSummary reports explicitly when no body paragraph exists', () => {
  const noBody = '---\ndeclaration_id: x\n---\n\n# Title Only\n';
  assert.equal(deriveSummary(noBody), '(no summary derivable from declaration body)');
});

test('buildRequestFromContent throws a named error when front matter is missing', () => {
  assert.throws(
    () => buildRequestFromContent('# No front matter here\n', { declarationPath: 'bad.md' }),
    /No YAML front matter found in bad\.md/
  );
});

test('buildRequestFromContent throws a named error when declaration_id is missing', () => {
  const missingId = '---\nclassification: minor\n---\n\n# Title\n\nBody.\n';
  assert.throws(
    () => buildRequestFromContent(missingId, { declarationPath: 'no-id.md' }),
    /Missing declaration_id in no-id\.md/
  );
});

test('parseCsvField trims entries and drops empty ones', () => {
  assert.deepEqual(parseCsvField('pos, terminal ,,payments'), ['pos', 'terminal', 'payments']);
  assert.deepEqual(parseCsvField(''), []);
  assert.deepEqual(parseCsvField(undefined), []);
});

// #1163 ephemeral-target spike (2026-08-31): confirmed live that the real endpoint 422s on any
// surface outside pos|terminal|settings|payments|compliance, and several real declarations
// legitimately carry `store`/`privacy` (voluntary, not mechanically enforced by
// check-compliance-impact.js). filterEndpointAcceptedSurfaces() is what unblocks those.
test('filterEndpointAcceptedSurfaces drops surfaces the endpoint would 422 on', () => {
  assert.deepEqual(
    filterEndpointAcceptedSurfaces(['pos', 'terminal', 'store', 'privacy', 'payments']),
    ['pos', 'terminal', 'payments']
  );
  assert.deepEqual(filterEndpointAcceptedSurfaces(['store', 'privacy']), []);
  assert.deepEqual(filterEndpointAcceptedSurfaces([]), []);
});

test('buildRequestFromContent filters surfaces identically in both surfaces and affected_surfaces', () => {
  const declarationWithExtraSurfaces = FIXTURE_DECLARATION.replace(
    'surfaces: pos,terminal',
    'surfaces: pos,terminal,store,privacy'
  );
  const request = buildRequestFromContent(declarationWithExtraSurfaces, { declarationPath: 'fixture.md' });

  assert.deepEqual(request.surfaces, ['pos', 'terminal']);
  assert.deepEqual(request.impact_declaration.affected_surfaces, ['pos', 'terminal']);
});

test('truncateEvidenceEntry leaves a short entry untouched', () => {
  assert.equal(truncateEvidenceEntry('short evidence'), 'short evidence');
});

test('truncateEvidenceEntry truncates (never drops) an entry over the endpoint field limit', () => {
  const longEntry = 'x'.repeat(VERIFICATION_EVIDENCE_MAX_LENGTH + 50);
  const truncated = truncateEvidenceEntry(longEntry);

  assert.equal(truncated.length, VERIFICATION_EVIDENCE_MAX_LENGTH);
  assert.ok(truncated.endsWith('…'));
});

test('buildRequestFromContent truncates every verification_evidence entry to the endpoint limit', () => {
  const longEvidenceDeclaration = FIXTURE_DECLARATION.replace(
    'verification_evidence: unit tests,integration tests,manual verification',
    `verification_evidence: ${'y'.repeat(VERIFICATION_EVIDENCE_MAX_LENGTH + 20)}`
  );
  const request = buildRequestFromContent(longEvidenceDeclaration, { declarationPath: 'fixture.md' });

  assert.equal(request.impact_declaration.verification_evidence.length, 1);
  assert.ok(
    request.impact_declaration.verification_evidence[0].length <= VERIFICATION_EVIDENCE_MAX_LENGTH
  );
});

// --- classifyEndpointApplicability / exit 3 vs exit 1 contract (#1396) --------------------------

const MINOR_STOREFRONT_ONLY = FIXTURE_DECLARATION
  .replace('classification: major', 'classification: minor')
  .replace('surfaces: pos,terminal', 'surfaces: storefront');

const REGULATORY_STOREFRONT_ONLY = FIXTURE_DECLARATION
  .replace('classification: major', 'classification: regulatory')
  .replace('surfaces: pos,terminal', 'surfaces: storefront');

test('classifyEndpointApplicability: minor + storefront-only -> not applicable, NO_ENDPOINT_ACCEPTED_SURFACE', () => {
  const frontMatter = parseFrontMatter(MINOR_STOREFRONT_ONLY);
  const result = classifyEndpointApplicability(frontMatter);
  assert.equal(result.applicable, false);
  assert.equal(result.classification, 'minor');
  assert.equal(result.reason_code, 'NO_ENDPOINT_ACCEPTED_SURFACE');
  assert.deepEqual(result.declared_surfaces, ['storefront']);
});

test('classifyEndpointApplicability: regulatory + storefront-only -> not applicable, classification carried through', () => {
  const frontMatter = parseFrontMatter(REGULATORY_STOREFRONT_ONLY);
  const result = classifyEndpointApplicability(frontMatter);
  assert.equal(result.applicable, false);
  assert.equal(result.classification, 'regulatory');
});

test('classifyEndpointApplicability: at least one endpoint-accepted surface -> applicable, unchanged', () => {
  const declaration = FIXTURE_DECLARATION.replace('surfaces: pos,terminal', 'surfaces: storefront,pos');
  const frontMatter = parseFrontMatter(declaration);
  assert.deepEqual(classifyEndpointApplicability(frontMatter), { applicable: true });
});

const { spawnSync } = require('node:child_process');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const SCRIPT_PATH = path.resolve(__dirname, 'build-preflight-request.js');

function runCli(declarationContent) {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'build-preflight-request-cli-'));
  const filePath = path.join(tmpDir, 'declaration.md');
  fs.writeFileSync(filePath, declarationContent, 'utf8');
  const result = spawnSync(process.execPath, [SCRIPT_PATH, filePath], { encoding: 'utf8' });
  fs.rmSync(tmpDir, { recursive: true, force: true });
  return result;
}

test('CLI: minor + storefront-only exits 3 and prints the not-applicable JSON marker to stdout', () => {
  const result = runCli(MINOR_STOREFRONT_ONLY);
  assert.equal(result.status, 3);
  const marker = JSON.parse(result.stdout);
  assert.equal(marker.not_applicable, true);
  assert.equal(marker.reason_code, 'NO_ENDPOINT_ACCEPTED_SURFACE');
  assert.deepEqual(marker.declared_surfaces, ['storefront']);
});

test('CLI: regulatory + storefront-only exits 1 with an explanatory stderr message, nothing on stdout', () => {
  const result = runCli(REGULATORY_STOREFRONT_ONLY);
  assert.equal(result.status, 1);
  assert.equal(result.stdout, '');
  assert.match(result.stderr, /classification "regulatory" but declares no endpoint-accepted surface/);
});

test('CLI: the real 2026-09-05-discovery-delivery-from-price.md declaration classifies as not applicable (exit 3)', () => {
  const realPath = path.resolve(
    __dirname, '..', 'docs', 'compliance', 'impact-declarations',
    '2026-09-05-discovery-delivery-from-price.md'
  );
  const result = spawnSync(process.execPath, [SCRIPT_PATH, realPath], { encoding: 'utf8' });
  assert.equal(result.status, 3);
  const marker = JSON.parse(result.stdout);
  assert.equal(marker.declaration_id, '2026-09-05-discovery-delivery-from-price');
  assert.deepEqual(marker.declared_surfaces, ['storefront']);
});
