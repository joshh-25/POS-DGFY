import { createRequire } from 'module';
import fs from 'fs';
import os from 'os';
import path from 'path';

const require = createRequire(import.meta.url);
const {
    buildObservabilityEvidence,
    evaluateReleaseVerdict,
    parseHealthRuntimeSha
} = require('../../scripts/gate-release-observability.js');

describe('observability release gate script', () => {
    const originalFetch = global.fetch;
    const originalEnv = { ...process.env };

    afterEach(() => {
        global.fetch = originalFetch;
        process.env = { ...originalEnv };
    });

    it('records fail for stale QA deploy summary without bypass metadata', () => {
        const rootDir = fs.mkdtempSync(path.join(os.tmpdir(), 'sku-observability-gate-'));
        const evidenceDir = path.join(rootDir, '.tmp', 'release-gates', 'abc1234');
        fs.mkdirSync(evidenceDir, { recursive: true });
        fs.writeFileSync(path.join(evidenceDir, 'qa_deploy_summary.txt'), 'deployed_head=deadbeef\n');
        const checks = [];

        evaluateReleaseVerdict({
            checks,
            verdictFile: path.join(evidenceDir, 'release_verdict.json'),
            evidenceDir,
            targetSha: 'abc1234',
            env: {}
        });

        expect(checks).toEqual([expect.objectContaining({
            name: 'qa.deploy.summary.sha_match.reviewed',
            status: 'fail'
        })]);
    });

    it('parses runtime SHA from health observability payload', () => {
        expect(parseHealthRuntimeSha(JSON.stringify({
            services: {
                observability: {
                    runtime_sha: 'ABCDEF0123456789',
                    runtime_sha_source: 'env:RELEASE_TARGET_SHA'
                }
            }
        }))).toEqual({
            runtimeSha: 'abcdef0123456789',
            source: 'env:RELEASE_TARGET_SHA',
            present: true
        });
    });

    it('records failed health runtime SHA evidence when production health cannot prove commit', async () => {
        const rootDir = fs.mkdtempSync(path.join(os.tmpdir(), 'sku-observability-gate-'));
        fs.mkdirSync(path.join(rootDir, 'backend', 'src', 'middleware'), { recursive: true });
        fs.mkdirSync(path.join(rootDir, 'scripts'), { recursive: true });
        fs.copyFileSync(
            path.resolve(process.cwd(), '..', 'scripts', 'create-incident-bundle.js'),
            path.join(rootDir, 'scripts', 'create-incident-bundle.js')
        );
        fs.writeFileSync(path.join(rootDir, 'backend', 'src', 'middleware', 'requestOutcomeLogger.js'), 'present');

        global.fetch = async (_url, options) => ({
            ok: true,
            status: 200,
            text: async () => JSON.stringify({
                success: true,
                services: {
                    observability: {
                        runtime_sha: null,
                        runtime_sha_present: false,
                        runtime_sha_source: null
                    }
                }
            }),
            headers: {
                get: (name) => {
                    if (name === 'x-request-id') return options.headers['x-request-id'];
                    if (name === 'x-trace-id') return 'trace-1';
                    return null;
                }
            }
        });

        const payload = await buildObservabilityEvidence({
            rootDir,
            targetSha: 'abc1234',
            baseUrl: 'https://skupervisor.example.test',
            evidenceDir: path.join(rootDir, '.tmp', 'release-gates', 'abc1234')
        });

        expect(payload.checks).toEqual(expect.arrayContaining([
            expect.objectContaining({
                name: 'health.runtime_sha.present',
                status: 'fail'
            }),
            expect.objectContaining({
                name: 'health.runtime_sha.matches_target',
                status: 'warn'
            })
        ]));
        expect(payload.verdict).toBe('report');
    });

    it('writes observability evidence in report mode', async () => {
        const rootDir = fs.mkdtempSync(path.join(os.tmpdir(), 'sku-observability-gate-'));
        fs.mkdirSync(path.join(rootDir, 'backend', 'src', 'middleware'), { recursive: true });
        fs.mkdirSync(path.join(rootDir, 'scripts'), { recursive: true });
        fs.copyFileSync(
            path.resolve(process.cwd(), '..', 'scripts', 'create-incident-bundle.js'),
            path.join(rootDir, 'scripts', 'create-incident-bundle.js')
        );
        fs.writeFileSync(path.join(rootDir, 'backend', 'src', 'middleware', 'requestOutcomeLogger.js'), 'present');

        const payload = await buildObservabilityEvidence({
            rootDir,
            targetSha: 'abc1234',
            evidenceDir: path.join(rootDir, '.tmp', 'release-gates', 'abc1234')
        });

        expect(payload.mode).toBe('report');
        expect(fs.existsSync(payload.artifact_paths.observability_evidence_file)).toBe(true);
        expect(payload.checks.some((check) => check.name === 'incident_bundle.dry_run' && check.status === 'pass')).toBe(true);
    });
});
