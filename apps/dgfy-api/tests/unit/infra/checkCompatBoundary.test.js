import fs from 'fs';
import os from 'os';
import path from 'path';
import { fileURLToPath } from 'url';
import { spawnSync } from 'child_process';

// Proves apps/dgfy-api/scripts/check-compat-boundary.js (CMP-03): a
// compat/continuity import inside a module's entities/ or usecases/ file
// must fail the build, and a clean tree must still pass. Forked out of
// backend/scripts/check-architecture-guardrails.js's domainCompatLeak scan
// (originally D-05a/D-05b) so backend/ stays untouched.

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const apiRoot = path.resolve(__dirname, '..', '..', '..');
const checkerScriptPath = path.join(apiRoot, 'scripts', 'check-compat-boundary.js');
const realAllowlistPath = path.join(apiRoot, 'src', 'config', 'architectureGuardrailsAllowlist.js');

const COMPAT_DIR_NAME = 'continuity';

const makeFixtureRoot = () => fs.mkdtempSync(path.join(os.tmpdir(), 'compat-boundary-'));

const buildFixtureModule = (modulesRoot, { entitiesCompatImport = false, usecasesCompatImport = false } = {}) => {
    const moduleDir = path.join(modulesRoot, 'fixturemodule');

    const entitiesDir = path.join(moduleDir, 'entities');
    fs.mkdirSync(entitiesDir, { recursive: true });
    const entitySource = entitiesCompatImport
        ? `import { legacyBridge } from '../../${COMPAT_DIR_NAME}/legacyBridge.js';\nexport const fixtureEntity = { legacyBridge };\n`
        : `export const fixtureEntity = { ok: true };\n`;
    fs.writeFileSync(path.join(entitiesDir, 'fixtureEntity.js'), entitySource);

    const usecasesDir = path.join(moduleDir, 'usecases');
    fs.mkdirSync(usecasesDir, { recursive: true });
    const usecaseSource = usecasesCompatImport
        ? `import { legacyBridge } from '../../${COMPAT_DIR_NAME}/legacyBridge.js';\nexport const fixtureUseCase = () => legacyBridge;\n`
        : `export const fixtureUseCase = () => ({ ok: true });\n`;
    fs.writeFileSync(path.join(usecasesDir, 'fixtureUseCase.js'), usecaseSource);

    return moduleDir;
};

const runChecker = (modulesRoot) => spawnSync(
    process.execPath,
    [checkerScriptPath],
    {
        env: {
            ...process.env,
            ARCH_GUARDRAIL_MODULES_ROOT: modulesRoot,
            ARCH_GUARDRAIL_ALLOWLIST_PATH: realAllowlistPath
        },
        encoding: 'utf8'
    }
);

describe('check-compat-boundary.js (CMP-03 domain-layer compat-import ban)', () => {
    it('flags a compat import inside an entities/ file', () => {
        const fixtureRoot = makeFixtureRoot();
        try {
            buildFixtureModule(fixtureRoot, { entitiesCompatImport: true });
            const result = runChecker(fixtureRoot);
            expect(result.status).not.toBe(0);
            expect(result.stderr).toMatch(/domainCompatLeak/);
            expect(result.stderr).toMatch(/fixtureEntity\.js imports compatibility\/continuity code/);
        } finally {
            fs.rmSync(fixtureRoot, { recursive: true, force: true });
        }
    });

    it('flags a compat import inside a usecases/ file', () => {
        const fixtureRoot = makeFixtureRoot();
        try {
            buildFixtureModule(fixtureRoot, { usecasesCompatImport: true });
            const result = runChecker(fixtureRoot);
            expect(result.status).not.toBe(0);
            expect(result.stderr).toMatch(/domainCompatLeak/);
            expect(result.stderr).toMatch(/fixtureUseCase\.js imports compatibility\/continuity code/);
        } finally {
            fs.rmSync(fixtureRoot, { recursive: true, force: true });
        }
    });

    it('passes a clean fixture tree with no compat import', () => {
        const fixtureRoot = makeFixtureRoot();
        try {
            buildFixtureModule(fixtureRoot);
            const result = runChecker(fixtureRoot);
            expect(result.status).toBe(0);
        } finally {
            fs.rmSync(fixtureRoot, { recursive: true, force: true });
        }
    });
});
