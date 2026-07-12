import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

// Proves the guardrail's domainCompatLeak bucket (CMP-03, D-05a/D-05b):
// a compat/continuity import inside a module's entities/ file (previously
// unscanned — RESEARCH Pitfall 3) or usecases/ file must fail the build,
// and a clean tree must still pass.

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const guardrailScriptPath = path.join(__dirname, 'check-architecture-guardrails.js');
const repoRoot = path.resolve(__dirname, '..', '..');
const realAllowlistPath = path.join(
    repoRoot,
    'apps',
    'dgfy-api',
    'src',
    'config',
    'architectureGuardrailsAllowlist.js'
);

// The designated compat/continuity directory name the guardrail bans.
const COMPAT_DIR_NAME = 'continuity';

const REQUIRED_MODULE_FILES = ['index.js', 'README.md'];
const REQUIRED_LAYER_DIRS = ['controllers', 'usecases', 'repositories'];

const makeFixtureRoot = () => fs.mkdtempSync(path.join(os.tmpdir(), 'arch-guardrail-compat-'));

const buildFixtureModule = (modulesRoot, { entitiesCompatImport = false, usecasesCompatImport = false } = {}) => {
    const moduleDir = path.join(modulesRoot, 'fixturemodule');
    fs.mkdirSync(moduleDir, { recursive: true });

    REQUIRED_MODULE_FILES.forEach((fileName) => {
        fs.writeFileSync(path.join(moduleDir, fileName), '// fixture\n');
    });

    REQUIRED_LAYER_DIRS.forEach((dirName) => {
        fs.mkdirSync(path.join(moduleDir, dirName), { recursive: true });
    });

    const entitiesDir = path.join(moduleDir, 'entities');
    fs.mkdirSync(entitiesDir, { recursive: true });
    const entitySource = entitiesCompatImport
        ? `import { legacyBridge } from '../../${COMPAT_DIR_NAME}/legacyBridge.js';\nexport const fixtureEntity = { legacyBridge };\n`
        : `export const fixtureEntity = { ok: true };\n`;
    fs.writeFileSync(path.join(entitiesDir, 'fixtureEntity.js'), entitySource);

    const usecasesDir = path.join(moduleDir, 'usecases');
    const usecaseSource = usecasesCompatImport
        ? `import { legacyBridge } from '../../${COMPAT_DIR_NAME}/legacyBridge.js';\nexport const fixtureUseCase = () => legacyBridge;\n`
        : `export const fixtureUseCase = () => ({ ok: true });\n`;
    fs.writeFileSync(path.join(usecasesDir, 'fixtureUseCase.js'), usecaseSource);

    return moduleDir;
};

const runGuardrail = (modulesRoot) => spawnSync(
    process.execPath,
    [guardrailScriptPath],
    {
        env: {
            ...process.env,
            ARCH_GUARDRAIL_MODULES_ROOT: modulesRoot,
            ARCH_GUARDRAIL_ALLOWLIST_PATH: realAllowlistPath
        },
        encoding: 'utf8'
    }
);

test('flags a compat import inside an entities/ file (previously unscanned)', () => {
    const fixtureRoot = makeFixtureRoot();
    try {
        buildFixtureModule(fixtureRoot, { entitiesCompatImport: true });
        const result = runGuardrail(fixtureRoot);
        assert.notEqual(result.status, 0, `expected non-zero exit, got 0. stderr: ${result.stderr}`);
        assert.match(result.stderr, /domainCompatLeak/);
        assert.match(result.stderr, /fixtureEntity\.js imports compatibility\/continuity code/);
    } finally {
        fs.rmSync(fixtureRoot, { recursive: true, force: true });
    }
});

test('flags a compat import inside a usecases/ file', () => {
    const fixtureRoot = makeFixtureRoot();
    try {
        buildFixtureModule(fixtureRoot, { usecasesCompatImport: true });
        const result = runGuardrail(fixtureRoot);
        assert.notEqual(result.status, 0, `expected non-zero exit, got 0. stderr: ${result.stderr}`);
        assert.match(result.stderr, /domainCompatLeak/);
        assert.match(result.stderr, /fixtureUseCase\.js imports compatibility\/continuity code/);
    } finally {
        fs.rmSync(fixtureRoot, { recursive: true, force: true });
    }
});

test('passes a clean fixture tree with no compat import', () => {
    const fixtureRoot = makeFixtureRoot();
    try {
        buildFixtureModule(fixtureRoot);
        const result = runGuardrail(fixtureRoot);
        assert.equal(result.status, 0, `expected zero exit, got ${result.status}. stderr: ${result.stderr}`);
    } finally {
        fs.rmSync(fixtureRoot, { recursive: true, force: true });
    }
});
