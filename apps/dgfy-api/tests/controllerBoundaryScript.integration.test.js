import path from 'path';
import { spawnSync } from 'child_process';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const backendRoot = path.join(__dirname, '..');

const runBoundaryScript = (allowlistPath) => {
    return spawnSync(
        process.execPath,
        ['scripts/check-controller-boundaries.js'],
        {
            cwd: backendRoot,
            env: {
                ...process.env,
                CONTROLLER_BOUNDARY_TARGETS: 'tests/fixtures/controller-boundary',
                CONTROLLER_BOUNDARY_ALLOWLIST_PATH: allowlistPath
            },
            encoding: 'utf8'
        }
    );
};

describe('controller boundary script integration', () => {
    it('passes when model-importing controller is in allowlist', () => {
        const result = runBoundaryScript('tests/fixtures/controller-boundary/allowlist.allows.js');
        expect(result.status).toBe(0);
        expect(`${result.stdout}${result.stderr}`).toContain('ControllerBoundary');
    });

    it('fails when model-importing controller is not in allowlist', () => {
        const result = runBoundaryScript('tests/fixtures/controller-boundary/allowlist.empty.js');
        expect(result.status).toBe(1);
        expect(`${result.stdout}${result.stderr}`).toContain('mockController.js');
    });
});
