const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');

const {
  buildReconciledValues,
  applyReconciledFrontMatter,
  reconcileDeclarationFile
} = require('./reconcile-preflight-declarations');

const FIXTURE_DECLARATION = `---
status: reference
owner: engineering
last_reviewed: 2026-08-28
declaration_id: 2026-08-28-fixture-declaration
classification: major
surfaces: pos,terminal
reason_codes_impacted: ALLOWED
policy_version: 2026.08.28
preflight_result: no_breach
preflight_reason_code: ALLOWED
preflight_run_at: 2026-08-28T00:00:00Z
preflight_request_ref: NOT-EXECUTED-1234-FIXTURE-DECLARATION
rollback_note: Revert this commit; no schema or host action required.
---

# Fixture Declaration For Tests

Body paragraph one.

## Preflight history

Historical note mentioning \`NOT-EXECUTED-1234-FIXTURE-DECLARATION\` verbatim -- must survive
untouched, this is exactly the trap is-preflight-outstanding.js exists to avoid on the read path,
and this script must not reintroduce it on the write path.
`;

test('buildReconciledValues throws (does not silently write no_breach) when the verdict did not pass', () => {
  assert.throws(
    () => buildReconciledValues({ pass: false, result: 'breach', can_proceed: false }, {
      runId: '123',
      declarationId: '2026-08-28-fixture-declaration'
    }),
    /Refusing to reconcile/
  );
});

test('buildReconciledValues produces a run-bound, schema-valid ref on a real pass', () => {
  const values = buildReconciledValues(
    { pass: true, result: 'no_breach', reason_code: 'ALLOWED', can_proceed: true },
    { runId: '987654321', declarationId: '2026-08-28-fixture-declaration' }
  );

  assert.equal(values.preflight_result, 'no_breach');
  assert.equal(values.preflight_reason_code, 'ALLOWED');
  assert.match(values.preflight_run_at, /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/);
  assert.equal(values.preflight_request_ref, 'PREFLIGHT-987654321-2026-08-28-FIXTURE-DECLARATION');
  // Matches isValidPreflightRequestRef's 3+-segment pattern (scripts/check-compliance-impact.js)
  assert.match(values.preflight_request_ref, /^[A-Z0-9]+(?:-[A-Z0-9]+){2,}$/);
});

test('buildReconciledValues produces a NOT-APPLICABLE-* ref for a not_applicable result (#1396)', () => {
  const values = buildReconciledValues(
    { pass: true, result: 'not_applicable', reason_code: 'NO_ENDPOINT_ACCEPTED_SURFACE', can_proceed: true },
    { runId: '987654321', declarationId: '2026-09-05-discovery-delivery-from-price' }
  );

  assert.equal(values.preflight_result, 'not_applicable');
  assert.equal(values.preflight_reason_code, 'NO_ENDPOINT_ACCEPTED_SURFACE');
  assert.equal(
    values.preflight_request_ref,
    'NOT-APPLICABLE-987654321-2026-09-05-DISCOVERY-DELIVERY-FROM-PRICE'
  );
  // Matches isValidPreflightRequestRef's 3+-segment pattern (scripts/check-compliance-impact.js)
  assert.match(values.preflight_request_ref, /^[A-Z0-9]+(?:-[A-Z0-9]+){2,}$/);
});

test('buildReconciledValues still produces a PREFLIGHT-* ref for a no_breach result (regression)', () => {
  const values = buildReconciledValues(
    { pass: true, result: 'no_breach', reason_code: 'ALLOWED', can_proceed: true },
    { runId: '1', declarationId: 'x' }
  );
  assert.match(values.preflight_request_ref, /^PREFLIGHT-/);
});

test('applyReconciledFrontMatter rewrites only the four target keys, leaves everything else byte-identical', () => {
  const updated = applyReconciledFrontMatter(FIXTURE_DECLARATION, {
    preflight_result: 'no_breach',
    preflight_reason_code: 'ALLOWED',
    preflight_run_at: '2026-08-31T00:00:00.000Z',
    preflight_request_ref: 'PREFLIGHT-999-FIXTURE-DECLARATION'
  });

  assert.match(updated, /preflight_request_ref: PREFLIGHT-999-FIXTURE-DECLARATION/);
  assert.match(updated, /preflight_run_at: 2026-08-31T00:00:00\.000Z/);
  // Untouched front-matter keys survive
  assert.match(updated, /declaration_id: 2026-08-28-fixture-declaration/);
  assert.match(updated, /classification: major/);
  // Body is completely untouched, including its own historical mention of the old placeholder
  assert.match(updated, /Historical note mentioning `NOT-EXECUTED-1234-FIXTURE-DECLARATION` verbatim/);
  assert.match(updated, /Body paragraph one\./);
});

test('applyReconciledFrontMatter throws if a target key is missing from front matter', () => {
  const noRefField = '---\ndeclaration_id: x\npreflight_result: no_breach\npreflight_reason_code: ALLOWED\npreflight_run_at: 2026-01-01T00:00:00Z\n---\n\nBody.\n';
  assert.throws(
    () => applyReconciledFrontMatter(noRefField, {
      preflight_result: 'no_breach',
      preflight_reason_code: 'ALLOWED',
      preflight_run_at: '2026-08-31T00:00:00.000Z',
      preflight_request_ref: 'PREFLIGHT-1-X'
    }),
    /missing expected key/
  );
});

test('reconcileDeclarationFile writes the reconciled front matter to disk and returns the new ref', () => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'reconcile-test-'));
  const declarationPath = path.join(tmpDir, 'fixture.md');
  fs.writeFileSync(declarationPath, FIXTURE_DECLARATION, 'utf8');

  const ref = reconcileDeclarationFile(
    declarationPath,
    { pass: true, result: 'no_breach', reason_code: 'ALLOWED', can_proceed: true },
    { runId: '42' }
  );

  assert.equal(ref, 'PREFLIGHT-42-2026-08-28-FIXTURE-DECLARATION');

  const written = fs.readFileSync(declarationPath, 'utf8');
  assert.match(written, /preflight_request_ref: PREFLIGHT-42-2026-08-28-FIXTURE-DECLARATION/);
  assert.doesNotMatch(written, /preflight_request_ref: NOT-EXECUTED-1234-FIXTURE-DECLARATION\n/);
  // Body's historical mention of the old ref still survives
  assert.match(written, /Historical note mentioning `NOT-EXECUTED-1234-FIXTURE-DECLARATION`/);

  fs.rmSync(tmpDir, { recursive: true, force: true });
});

test('reconcileDeclarationFile writes a NOT-APPLICABLE-* ref and preflight_result: not_applicable to disk (#1396)', () => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'reconcile-test-'));
  const declarationPath = path.join(tmpDir, 'fixture.md');
  fs.writeFileSync(declarationPath, FIXTURE_DECLARATION, 'utf8');

  const ref = reconcileDeclarationFile(
    declarationPath,
    { pass: true, result: 'not_applicable', reason_code: 'NO_ENDPOINT_ACCEPTED_SURFACE', can_proceed: true },
    { runId: '42' }
  );

  assert.equal(ref, 'NOT-APPLICABLE-42-2026-08-28-FIXTURE-DECLARATION');

  const written = fs.readFileSync(declarationPath, 'utf8');
  assert.match(written, /preflight_request_ref: NOT-APPLICABLE-42-2026-08-28-FIXTURE-DECLARATION/);
  assert.match(written, /preflight_result: not_applicable/);
  assert.doesNotMatch(written, /preflight_request_ref: NOT-EXECUTED-1234-FIXTURE-DECLARATION\n/);

  fs.rmSync(tmpDir, { recursive: true, force: true });
});

test('reconcileDeclarationFile throws and does not touch the file when the verdict failed', () => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'reconcile-test-'));
  const declarationPath = path.join(tmpDir, 'fixture.md');
  fs.writeFileSync(declarationPath, FIXTURE_DECLARATION, 'utf8');

  assert.throws(
    () => reconcileDeclarationFile(
      declarationPath,
      { pass: false, result: 'breach', reason_code: 'COMPLIANCE_ACTIVATION_REQUIRED', can_proceed: false },
      { runId: '42' }
    ),
    /Refusing to reconcile/
  );

  const untouched = fs.readFileSync(declarationPath, 'utf8');
  assert.equal(untouched, FIXTURE_DECLARATION);

  fs.rmSync(tmpDir, { recursive: true, force: true });
});
