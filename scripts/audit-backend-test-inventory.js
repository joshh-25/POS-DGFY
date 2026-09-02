#!/usr/bin/env node
// #1441 (Phase 250): a static, deterministic audit of apps/dgfy-api/tests/*.test.js -- does every
// file earn its cost, and can the set be reduced by subtraction. Same shape/arg-parsing/exit
// conventions as scripts/run-backend-test-matrix.js: plain CommonJS, node built-ins only, no
// dependency on `node_modules` for --check so it can run in a doc-lint context.
//
// Static discovery mirrors apps/dgfy-api/jest.config.cjs's own roots/ignore pattern so this tool
// never needs Jest itself to know what the suite looks like. Classification comes from a small
// rule engine (first match wins) plus scripts/backend-test-audit-overrides.js for the ~90
// judgment calls a static signal alone can't reproduce -- see that file's own header.

'use strict';

const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const APP_DIR = path.join(ROOT, 'apps', 'dgfy-api');
const TESTS_DIR = path.join(APP_DIR, 'tests');
const SRC_DIR = path.join(APP_DIR, 'src');
const OUTPUT_JSON = path.join(ROOT, 'docs', 'testing', 'backend-test-suite-inventory.json');
const DOC_PATH = path.join(ROOT, 'docs', 'testing', 'backend-test-suite-value-audit.md');
const REGION_START = '<!-- backend-test-inventory:start -->';
const REGION_END = '<!-- backend-test-inventory:end -->';

// Leave-alone doc/citation prefixes, per docs/architecture/apps-layout-migration.md:173-184 --
// a "historical" citation here is never grounds for a stale-doc-citation finding or a live-doc
// reference update.
const HISTORICAL_PREFIXES = [
  'docs/archive/',
  'docs/compliance/impact-declarations/',
  'docs/architecture/adr/',
  'docs/release/',
  'docs/releases/',
  'docs/features/IMPLEMENTATION_PHASE_LEDGER.md',
];

// A live citation from the governed compliance corpus pins the file, same weight as a
// hardcoded reference. Deleting or folding away a test named as evidence for a compliance
// control is an evidence regression, not test hygiene (#1451). Historical prefixes are
// excluded by classifyCitation() before this is consulted, so a dated impact-declaration
// citation deliberately does not pin.
const COMPLIANCE_PIN_PREFIX = 'docs/compliance/';

const HARDCODED_PATHS = new Set([
  'scripts/backend-db-dependent-tests.js',
  'scripts/run-fnb-readiness-gate.js',
  '.github/workflows/promotion-quality-gate.yml',
  'apps/dgfy-api/package.json',
]);

function parseArgs(argv) {
  const args = {
    write: argv.includes('--write'),
    check: argv.includes('--check'),
    jestJson: [],
    heapLog: null,
    measurementLabel: null,
    printFiles: null,
  };
  for (let i = 0; i < argv.length; i += 1) {
    if (argv[i] === '--jest-json') args.jestJson.push(argv[i + 1]);
    if (argv[i] === '--heap-log') args.heapLog = argv[i + 1];
    if (argv[i] === '--measurement-label') args.measurementLabel = argv[i + 1];
    if (argv[i] === '--print-files') args.printFiles = argv[i + 1];
  }
  return args;
}

function listTestFiles() {
  return fs.readdirSync(TESTS_DIR)
    .filter((name) => name.endsWith('.test.js') && !name.endsWith('.legacy.test.js'))
    .sort()
    .map((name) => `tests/${name}`);
}

function loadManifest() {
  // Same stale-entry guard as scripts/run-backend-test-matrix.js's partitionByDbManifest --
  // duplicated deliberately rather than imported, so this tool has zero runtime dependency on
  // that script's internals and can evolve independently.
  // eslint-disable-next-line global-require, import/no-dynamic-require
  const manifest = require(path.join(ROOT, 'scripts', 'backend-db-dependent-tests.js'));
  return manifest;
}

function loadOverrides() {
  // eslint-disable-next-line global-require, import/no-dynamic-require
  return require(path.join(ROOT, 'scripts', 'backend-test-audit-overrides.js'));
}

function readFile(relPath) {
  return fs.readFileSync(path.join(APP_DIR, relPath), 'utf8');
}

// --- static signal extraction ------------------------------------------------------------------

const CASE_RE = /\b(it|test)(\.(each|skip|only|concurrent|todo|failing))?\s*\(/g;
const WRAPPER_ALIAS_RE = /const\s+(\w+)\s*=\s*(?:\(name,\s*fn\)\s*=>\s*)?(?:\w+\s*\?\s*it\s*:\s*it\.skip|it(?:\.\w+)?\()/g;
const DESCRIBE_TOP_RE = /^describe(?:\.(?:skip|only))?\s*\(\s*(['"`])([\s\S]*?)\1/gm;
const EXPECT_RE = /\bexpect\(/g;
const EXPECT_RES_RE = /\bexpect\(res(?:ponse)?\??\./g;
const TO_HAVE_BEEN_CALLED_RE = /\btoHaveBeenCalled\w*/g;
const READ_FILE_SYNC_RE = /\breadFileSync\(/g;
const TO_CONTAIN_OR_MATCH_RE = /\b(toContain|toMatch)\(/g;
const MOCK_MODULE_RE = /jest\.unstable_mockModule\(\s*(['"`])([^'"`]+)\1/g;
const JEST_FN_RE = /jest\.fn\(/g;
const SUPERTEST_RE = /from\s+['"]supertest['"]/;
const SNAPSHOT_RE = /toMatchSnapshot\(/;
const CREATE_TEST_TENANT_RE = /createTestTenant|landlordSchemaReadiness/;
const SRC_IMPORT_RE = /from\s+['"](\.\.\/src\/[^'"]+)['"]/g;
const CONDITIONAL_SKIP_RE = /describe\.skip\(|it\.skip\(/;
const ENV_GATE_RE = /process\.env\.(TEST_TYPE|RUN_BROWSER_E2E)/g;

function countMatches(re, text) {
  const clone = new RegExp(re.source, re.flags.includes('g') ? re.flags : `${re.flags}g`);
  let count = 0;
  while (clone.exec(text)) count += 1;
  return count;
}

function suffixOf(relPath) {
  const base = path.basename(relPath, '.test.js');
  const parts = base.split('.');
  return parts.length > 1 ? parts.slice(1).join('.') : '(none)';
}

function resolveSrcImports(text) {
  const results = [];
  let match;
  const re = new RegExp(SRC_IMPORT_RE.source, 'g');
  while ((match = re.exec(text))) {
    const importPath = match[1];
    const resolved = path.resolve(TESTS_DIR, importPath);
    const candidates = [resolved, `${resolved}.js`, `${resolved}/index.js`];
    const exists = candidates.some((candidate) => fs.existsSync(candidate));
    results.push({ importPath, exists });
  }
  return results;
}

// One repo-wide `git grep`, not one process per test file (656 files x 656 spawns is the
// difference between seconds and minutes). `-l --fixed-strings -e <basename>` per basename in a
// single invocation would still be O(files) argv entries; instead this greps for the generic
// `.test.js` token set once via `git ls-files` + an in-memory scan of every citing candidate,
// which is what actually matters here -- citations only ever come from a small, bounded set of
// doc/script/workflow files, not the whole repo.
// RF-2 (PR #1449): the tool's own generated outputs -- regenerated by this same script on every
// run -- must never be treated as citation sources. Without this exclusion, a basename mention in
// the audit doc/JSON's own inventory rows (which necessarily lists every test file by name) gets
// picked up as a "citing" file, corrupting this tool's own classification of itself.
const GENERATED_OUTPUT_RELPATHS = [path.relative(ROOT, DOC_PATH), path.relative(ROOT, OUTPUT_JSON)]
  .map((p) => p.split(path.sep).join('/'));

let citationCorpusCache = null;
function loadCitationCorpus() {
  if (citationCorpusCache) return citationCorpusCache;
  const { execFileSync } = require('child_process');
  const tracked = execFileSync('git', ['ls-files'], { cwd: ROOT, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 })
    .split(/\r?\n/)
    .filter(Boolean)
    // Skip the tests directory itself (a test file can mention its own siblings in a comment
    // without that being a "citation" in the sense this tool cares about) and anything binary.
    .filter((f) => !f.startsWith('apps/dgfy-api/tests/') && !f.startsWith('node_modules/') && !f.includes('/node_modules/'))
    // Skip this tool's own generated outputs -- see GENERATED_OUTPUT_RELPATHS above.
    .filter((f) => !GENERATED_OUTPUT_RELPATHS.includes(f));
  const corpus = [];
  tracked.forEach((relPath) => {
    const abs = path.join(ROOT, relPath);
    let content;
    try {
      content = fs.readFileSync(abs, 'utf8');
    } catch (error) {
      return; // binary or unreadable; not a citation source
    }
    if (content.includes('\0')) return; // binary heuristic
    corpus.push({ path: relPath, content });
  });
  citationCorpusCache = corpus;
  return corpus;
}

function gitGrepBasename(basename) {
  const corpus = loadCitationCorpus();
  const results = [];
  corpus.forEach(({ path: p, content }) => {
    if (content.includes(basename)) results.push(p);
  });
  return results;
}

function classifyCitation(citingPath) {
  if (HARDCODED_PATHS.has(citingPath)) return 'hardcoded';
  if (HISTORICAL_PREFIXES.some((prefix) => citingPath.startsWith(prefix))) return 'historical';
  return 'live';
}

function detectFalseGreenWrapper(text) {
  // A wrapper alias whose body `return`s before `await fn()` is called -- the itIfRuntimeReady
  // shape (tests/e2e-full-cycle.test.js:51-60, fixed in this same PR) and the class of bug it
  // represents wherever else it might recur.
  const wrapperBodyRe = /=>\s*it\([^,]+,\s*async\s*\(\)\s*=>\s*\{([\s\S]*?)\n\s*\}\)/g;
  let match;
  while ((match = wrapperBodyRe.exec(text))) {
    const body = match[1];
    const returnIndex = body.search(/\breturn\b/);
    const awaitFnIndex = body.search(/await\s+fn\(\)/);
    if (returnIndex !== -1 && awaitFnIndex !== -1 && returnIndex < awaitFnIndex) {
      return true;
    }
  }
  return false;
}

function analyzeFile(relPath, manifestSet, liveDocCitations) {
  const text = readFile(relPath);
  const basename = path.basename(relPath);
  const lines = text.split('\n').length;

  const caseCount = countMatches(CASE_RE, text) + countMatches(WRAPPER_ALIAS_RE, text.replace(CASE_RE, ''));
  const describeTitles = [];
  {
    const re = new RegExp(DESCRIBE_TOP_RE.source, 'gm');
    let m;
    while ((m = re.exec(text))) describeTitles.push(m[2]);
  }

  const expectCount = countMatches(EXPECT_RE, text);
  const expectResCount = countMatches(EXPECT_RES_RE, text);
  const toHaveBeenCalledCount = countMatches(TO_HAVE_BEEN_CALLED_RE, text);
  const readFileSyncCount = countMatches(READ_FILE_SYNC_RE, text);
  const toContainOrMatchCount = countMatches(TO_CONTAIN_OR_MATCH_RE, text);
  const textRatio = expectCount > 0 && readFileSyncCount > 0
    ? Math.min(1, toContainOrMatchCount / expectCount)
    : 0;

  const mockFactoryStubCounts = [];
  {
    const re = new RegExp(MOCK_MODULE_RE.source, 'g');
    let m;
    while ((m = re.exec(text))) {
      // Brace-match the factory body starting at the `() => ({` after this call to count stubs.
      const start = text.indexOf('=>', m.index);
      const braceStart = text.indexOf('{', start);
      if (braceStart === -1) continue;
      let depth = 0;
      let i = braceStart;
      for (; i < text.length; i += 1) {
        if (text[i] === '{') depth += 1;
        else if (text[i] === '}') {
          depth -= 1;
          if (depth === 0) break;
        }
      }
      const factoryBody = text.slice(braceStart, i + 1);
      mockFactoryStubCounts.push(countMatches(JEST_FN_RE, factoryBody));
    }
  }
  const maxMockStubCount = mockFactoryStubCounts.length ? Math.max(...mockFactoryStubCounts) : 0;

  const isSupertest = SUPERTEST_RE.test(text);
  const isSnapshot = SNAPSHOT_RE.test(text);
  const onDbManifest = manifestSet.has(relPath);
  const usesCreateTestTenant = CREATE_TEST_TENANT_RE.test(text);
  const srcImports = resolveSrcImports(text);
  const deadImports = srcImports.filter((imp) => !imp.exists);
  const suffix = suffixOf(relPath);
  const conditionalSkip = CONDITIONAL_SKIP_RE.test(text);
  const envGated = countMatches(ENV_GATE_RE, text) > 0;
  const falseGreenWrapper = detectFalseGreenWrapper(text);

  const citingFiles = gitGrepBasename(basename).filter((f) => f !== relPath && f !== `apps/dgfy-api/${relPath}`);
  const citations = { live: [], historical: [], hardcoded: [] };
  citingFiles.forEach((f) => {
    citations[classifyCitation(f)].push(f);
  });

  return {
    path: relPath,
    lines,
    caseCount,
    describeTitles,
    expectCount,
    expectResCount,
    toHaveBeenCalledCount,
    readFileSyncCount,
    textRatio: Number(textRatio.toFixed(2)),
    maxMockStubCount,
    isSupertest,
    isSnapshot,
    onDbManifest,
    usesCreateTestTenant,
    srcImportCount: srcImports.length,
    deadImportCount: deadImports.length,
    suffix,
    conditionalSkip,
    envGated,
    falseGreenWrapper,
    citations,
  };
}

// --- rule engine ---------------------------------------------------------------------------

function classify(signals, overrides, stemSiblingTitles) {
  const override = overrides[signals.path];
  if (override) {
    return {
      classification: override.classification,
      reason: override.reason,
      mergeInto: override.mergeInto || null,
      newTier: override.newTier || null,
      rule: 'R0-override',
    };
  }

  // R1: pins -- a hardcoded/live citation, db-manifest membership, or a snapshot guard is kept
  // regardless of what the rest of the signals say.
  if (signals.citations.hardcoded.length > 0) {
    return { classification: 'keep', reason: `hardcoded reference: ${signals.citations.hardcoded.join(', ')}`, rule: 'R1-pin' };
  }
  const compliancePins = signals.citations.live.filter((c) => c.startsWith(COMPLIANCE_PIN_PREFIX));
  if (compliancePins.length > 0) {
    return { classification: 'keep', reason: `compliance evidence citation: ${compliancePins.join(', ')}`, rule: 'R1-pin' };
  }
  if (signals.isSnapshot) {
    return { classification: 'keep', reason: 'snapshot guard', rule: 'R1-pin' };
  }
  if (signals.onDbManifest) {
    return { classification: 'keep', reason: 'db-manifest member', rule: 'R1-pin' };
  }

  // R3
  if (signals.srcImportCount === 0 && signals.textRatio >= 0.8) {
    return { classification: 'delete', reason: `source-text-only (text_ratio=${signals.textRatio})`, rule: 'R3-source-text-only' };
  }
  const dupSibling = (signals.describeTitles || []).find((title) => stemSiblingTitles.has(title));
  if (dupSibling) {
    return { classification: 'consolidate', reason: `duplicate-describe: "${dupSibling}" also declared by a stem sibling`, rule: 'R3-duplicate-describe' };
  }

  // R4
  if (signals.maxMockStubCount >= 40) {
    return { classification: 'consolidate', reason: `hand-enumerated-barrel (${signals.maxMockStubCount} factory stubs)`, rule: 'R4-hand-enumerated-barrel' };
  }
  if (signals.textRatio >= 0.5 && signals.textRatio < 0.8) {
    return { classification: 'consolidate', reason: `source-text-mixed (text_ratio=${signals.textRatio})`, rule: 'R4-source-text-mixed' };
  }
  if (signals.suffix.includes('transport') && signals.expectCount > 0
    && (signals.expectResCount + signals.toHaveBeenCalledCount) / signals.expectCount >= 0.9
    && signals.caseCount <= 6) {
    return { classification: 'consolidate', reason: 'transport-responder-only (>=90% call/res assertions, <=6 cases)', rule: 'R4-transport-responder-only' };
  }
  if (signals.caseCount <= 2 && signals.lines >= 200) {
    return { classification: 'consolidate', reason: `thin-file (${signals.caseCount} cases in ${signals.lines} lines)`, rule: 'R4-thin-file' };
  }

  // R5: default
  return { classification: 'keep', reason: `default keep (suffix: ${signals.suffix})`, rule: 'R5-default' };
}

function collectFindings(signals) {
  const findings = [];
  if (signals.conditionalSkip && signals.envGated) {
    findings.push({ type: 'conditional-skip', detail: 'describe.skip/it.skip gated behind an env var' });
  }
  if (signals.envGated) {
    findings.push({ type: 'always-pending-in-matrix', detail: 'gated behind TEST_TYPE/RUN_BROWSER_E2E, which the matrix never sets' });
  }
  if (signals.falseGreenWrapper) {
    findings.push({ type: 'false-green-wrapper', detail: 'a wrapper alias returns before awaiting its wrapped fn()' });
  }
  if (signals.deadImportCount > 0) {
    findings.push({ type: 'dead-import', detail: `${signals.deadImportCount} unresolved ../src import(s)` });
  }
  if (signals.caseCount === 0) {
    findings.push({ type: 'no-cases', detail: 'no it()/test() invocation detected' });
  }
  return findings;
}

// --- build inventory -------------------------------------------------------------------------

function buildInventory({ jestJsonPaths = [], heapLogPath = null, measurementLabel = null } = {}) {
  const files = listTestFiles();
  const manifest = loadManifest();
  const manifestSet = new Set(manifest);
  const activeSet = new Set(files);
  const staleEntries = manifest.filter((entry) => !activeSet.has(entry));
  if (staleEntries.length > 0) {
    throw new Error(`backend-db-dependent-tests.js lists ${staleEntries.length} test path(s) that no longer exist: ${staleEntries.join(', ')}`);
  }
  const overrides = loadOverrides();
  // 'delete' and 'consolidate' overrides are expected to eventually go stale -- the point of
  // both is that the file stops existing (consolidate folds it into `mergeInto` and removes the
  // source). Any other classification going stale means a rename/move wasn't reflected here.
  const REMOVAL_CLASSIFICATIONS = new Set(['delete', 'consolidate']);
  const staleOverrides = Object.keys(overrides).filter((entry) => !activeSet.has(entry) && !REMOVAL_CLASSIFICATIONS.has(overrides[entry].classification));
  if (staleOverrides.length > 0) {
    throw new Error(`backend-test-audit-overrides.js references ${staleOverrides.length} test path(s) that no longer exist: ${staleOverrides.join(', ')}`);
  }

  const signalsByPath = {};
  files.forEach((relPath) => {
    signalsByPath[relPath] = analyzeFile(relPath, manifestSet);
  });

  // Stem-sibling duplicate-describe detection: group by the part of the filename before the first
  // `.`, then flag a describe title declared by more than one file in the same stem group.
  const stemGroups = new Map();
  files.forEach((relPath) => {
    const stem = path.basename(relPath).split('.')[0];
    if (!stemGroups.has(stem)) stemGroups.set(stem, []);
    stemGroups.get(stem).push(relPath);
  });
  const titleOwners = new Map(); // stem -> title -> [paths]
  files.forEach((relPath) => {
    const stem = path.basename(relPath).split('.')[0];
    if (!titleOwners.has(stem)) titleOwners.set(stem, new Map());
    const titleMap = titleOwners.get(stem);
    (signalsByPath[relPath].describeTitles || []).forEach((title) => {
      if (!titleMap.has(title)) titleMap.set(title, []);
      titleMap.get(title).push(relPath);
    });
  });

  const inventory = files.map((relPath) => {
    const signals = signalsByPath[relPath];
    const stem = path.basename(relPath).split('.')[0];
    const titleMap = titleOwners.get(stem);
    const stemSiblingTitles = new Set();
    titleMap.forEach((paths, title) => {
      if (paths.length > 1 && paths.includes(relPath) && paths.some((p) => p !== relPath)) {
        stemSiblingTitles.add(title);
      }
    });
    const result = classify(signals, overrides, stemSiblingTitles);
    const findings = collectFindings(signals);
    return { ...signals, ...result, findings };
  });

  const byClass = {};
  const bySuffix = {};
  inventory.forEach((entry) => {
    byClass[entry.classification] = (byClass[entry.classification] || 0) + 1;
    bySuffix[entry.suffix] = (bySuffix[entry.suffix] || 0) + 1;
  });

  const measured = {};
  if (jestJsonPaths.length || heapLogPath) {
    measured.label = measurementLabel || null;
    if (jestJsonPaths.length) {
      const perFile = {};
      jestJsonPaths.forEach((jsonPath) => {
        if (!jsonPath || !fs.existsSync(jsonPath)) return;
        const parsed = JSON.parse(fs.readFileSync(jsonPath, 'utf8'));
        (parsed.testResults || []).forEach((tr) => {
          const relPath = path.relative(APP_DIR, tr.testFilePath || tr.name || '').replace(/\\/g, '/');
          perFile[relPath] = {
            durationMs: (tr.endTime || 0) - (tr.startTime || 0),
            numPassingTests: tr.numPassingTests,
            numFailingTests: tr.numFailingTests,
            numPendingTests: tr.numPendingTests,
            caseCount: (tr.assertionResults || []).length,
          };
        });
      });
      measured.perFile = perFile;
    }
    if (heapLogPath && fs.existsSync(heapLogPath)) {
      const heapText = fs.readFileSync(heapLogPath, 'utf8');
      const heapRe = /(PASS|FAIL)\s+(\S+\.test\.js)\s+\(([\d.]+)\s*s,\s*([\d.]+)\s*MB heap size\)/g;
      const heapByFile = {};
      let m;
      while ((m = heapRe.exec(heapText))) {
        heapByFile[m[2]] = { status: m[1], durationS: Number(m[3]), heapMB: Number(m[4]) };
      }
      measured.heapByFile = heapByFile;
    }
  }

  return {
    generatedAt: new Date().toISOString(),
    totalFiles: files.length,
    byClassification: byClass,
    bySuffix,
    dbManifestCount: manifest.length,
    findingsCount: inventory.reduce((sum, e) => sum + e.findings.length, 0),
    files: inventory,
    ...(Object.keys(measured).length ? { measured } : {}),
  };
}

// --- doc region rendering ----------------------------------------------------------------------

function renderTable(headers, rows) {
  const headerLine = `| ${headers.join(' | ')} |`;
  const sepLine = `| ${headers.map(() => '---').join(' | ')} |`;
  const rowLines = rows.map((row) => `| ${row.join(' | ')} |`);
  return [headerLine, sepLine, ...rowLines].join('\n');
}

function renderRegion(inventory) {
  const lines = [];
  lines.push(REGION_START);
  lines.push('');
  lines.push('### Summary');
  lines.push('');
  lines.push(`Total active test files: **${inventory.totalFiles}** | db-manifest members: **${inventory.dbManifestCount}** | findings: **${inventory.findingsCount}**`);
  lines.push('');
  lines.push('### By classification');
  lines.push('');
  lines.push(renderTable(['Classification', 'Count'], Object.entries(inventory.byClassification).sort().map(([k, v]) => [k, String(v)])));
  lines.push('');
  lines.push('### By suffix');
  lines.push('');
  lines.push(renderTable(['Suffix', 'Count'], Object.entries(inventory.bySuffix).sort((a, b) => b[1] - a[1]).map(([k, v]) => [k, String(v)])));
  lines.push('');
  lines.push('### Findings');
  lines.push('');
  const findingRows = [];
  inventory.files.forEach((f) => {
    f.findings.forEach((finding) => findingRows.push([f.path, finding.type, finding.detail]));
  });
  lines.push(findingRows.length
    ? renderTable(['File', 'Finding', 'Detail'], findingRows)
    : '_None._');
  lines.push('');
  lines.push('### Full inventory');
  lines.push('');
  lines.push(renderTable(
    ['File', 'Lines', 'Cases', 'Classification', 'Rule', 'Reason'],
    inventory.files.map((f) => [f.path, String(f.lines), String(f.caseCount), f.classification, f.rule, f.reason.replace(/\|/g, '\\|')]),
  ));
  lines.push('');
  lines.push('Generated by `npm run audit:backend-tests`. Do not edit by hand.');
  lines.push('');
  lines.push(REGION_END);
  return lines.join('\n');
}

function updateDocRegion(inventory) {
  let doc;
  if (fs.existsSync(DOC_PATH)) {
    doc = fs.readFileSync(DOC_PATH, 'utf8');
  } else {
    doc = `# Backend test-suite value audit\n\n${REGION_START}\n${REGION_END}\n`;
  }
  const region = renderRegion(inventory);
  if (doc.includes(REGION_START) && doc.includes(REGION_END)) {
    const before = doc.slice(0, doc.indexOf(REGION_START));
    const after = doc.slice(doc.indexOf(REGION_END) + REGION_END.length);
    doc = `${before}${region}${after}`;
  } else {
    doc = `${doc.trimEnd()}\n\n${region}\n`;
  }
  fs.writeFileSync(DOC_PATH, doc);
}

function stripVolatile(inventory) {
  const { generatedAt, measured, ...rest } = inventory;
  return rest;
}

function main() {
  const args = parseArgs(process.argv.slice(2));

  if (args.printFiles) {
    const files = listTestFiles();
    const manifestSet = new Set(loadManifest());
    const selected = files.filter((f) => (args.printFiles === 'db' ? manifestSet.has(f) : !manifestSet.has(f)));
    process.stdout.write(selected.join(' '));
    return;
  }

  const inventory = buildInventory({
    jestJsonPaths: args.jestJson,
    heapLogPath: args.heapLog,
    measurementLabel: args.measurementLabel,
  });

  if (args.check) {
    if (!fs.existsSync(OUTPUT_JSON)) {
      console.error('[audit:backend-tests:check] FAIL - no committed inventory JSON found. Run `npm run audit:backend-tests` first.');
      process.exit(1);
    }
    const committed = JSON.parse(fs.readFileSync(OUTPUT_JSON, 'utf8'));
    const a = JSON.stringify(stripVolatile(committed));
    const b = JSON.stringify(stripVolatile(inventory));
    if (a !== b) {
      console.error('[audit:backend-tests:check] FAIL - committed inventory is stale. Run `npm run audit:backend-tests` and commit the result.');
      process.exit(1);
    }
    console.log('[audit:backend-tests:check] OK - inventory is up to date.');
    return;
  }

  if (args.write) {
    fs.mkdirSync(path.dirname(OUTPUT_JSON), { recursive: true });
    fs.writeFileSync(OUTPUT_JSON, `${JSON.stringify(inventory, null, 2)}\n`);
    updateDocRegion(inventory);
    console.log(`[audit:backend-tests] wrote ${path.relative(ROOT, OUTPUT_JSON)} and updated ${path.relative(ROOT, DOC_PATH)}`);
    return;
  }

  console.log(JSON.stringify(inventory, null, 2));
}

if (require.main === module) {
  main();
}

module.exports = {
  listTestFiles,
  loadManifest,
  loadOverrides,
  analyzeFile,
  classify,
  buildInventory,
  parseArgs,
};
