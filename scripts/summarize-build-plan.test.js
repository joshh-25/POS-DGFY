'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { summarizeBuildPlan, parseArgs } = require('./summarize-build-plan');

test('reports selection, revision, live need, effective builds, deploy, and PROD target', () => {
  const result = summarizeBuildPlan({
    selected: { dgfy_api: true, dgfy_migration_runner: true, dgfy_ims: true, dgfy_pos: true, dgfy_storefront: true, dgfy_opis: true, dgfy_admin: true },
    needed: { dgfy_api: true, dgfy_migration_runner: false, dgfy_ims: false, dgfy_pos: true, dgfy_storefront: true, dgfy_opis: false, dgfy_admin: true },
    revisions: { dgfy_api: 'r2', dgfy_migration_runner: 'r3' },
    deploy: 'true',
    environment: 'PROD',
  });
  assert.deepEqual(result.gaps, []);
  assert.match(result.markdown, /Full app-group selection/);
  assert.match(result.markdown, /dgfy-api \(API \+ migration runner\).*r2/);
  assert.match(result.markdown, /Deploy input: \*\*true\*\*/);
  assert.match(result.markdown, /Target environment: \*\*PROD\*\*/);
  assert.match(result.markdown, /approximation/);
});

test('flags a selected=false but needed=true app without blocking', () => {
  const result = summarizeBuildPlan({ selected: { dgfy_pos: false }, needed: { dgfy_pos: true }, revisions: {}, deploy: 'false', environment: 'PROD' });
  assert.deepEqual(result.gaps, ['dgfy-pos']);
  assert.match(result.markdown, /PARTIAL app-group selection/);
  assert.match(result.markdown, /selected=false while live state says rebuild is needed/);
});

test('requires explicit JSON and deploy options', () => {
  assert.throws(() => parseArgs([]), /--selected-json/);
  assert.throws(() => parseArgs(['--selected-json', '{}', '--needed-json', '{}', '--revisions-json', '{}', '--deploy', 'yes', '--environment', 'PROD']), /true or false/);
});
