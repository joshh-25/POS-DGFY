import path from 'path';
import { spawnSync } from 'child_process';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const backendRoot = path.join(__dirname, '..');

const runGuardrailScript = (fixtureName) => {
    const fixtureRoot = path.join('tests', 'fixtures', 'architecture-guardrails', fixtureName);

    return spawnSync(
        process.execPath,
        ['scripts/check-architecture-guardrails.js'],
        {
            cwd: backendRoot,
            env: {
                ...process.env,
                ARCH_GUARDRAIL_MODULES_ROOT: `${fixtureRoot}/modules`,
                ARCH_GUARDRAIL_MODEL_IMPORT_ALLOWLIST_PATH: 'tests/fixtures/architecture-guardrails/allowlist.empty.js'
            },
            encoding: 'utf8'
        }
    );
};

describe('architecture guardrail script integration', () => {
    it('passes for healthy module fixture', () => {
        const result = runGuardrailScript('healthy');
        expect(result.status).toBe(0);
        expect(`${result.stdout}${result.stderr}`).toContain('ArchitectureGuardrails');
    });

    it('fails for violating module fixture', () => {
        const result = runGuardrailScript('violating');
        expect(result.status).toBe(1);
        const output = `${result.stdout}${result.stderr}`;
        expect(output).toContain('moduleStructure');
        expect(output).toContain('controllerNaming');
        expect(output).toContain('usecaseLayerLeak');
        expect(output).toContain('modelImportBoundary');
    });
});
