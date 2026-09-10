const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawnSync } = require('child_process');

const { UNCONDITIONAL_TRIGGER_PATTERNS, resolveFrontendBuildTriggers } = require('./resolve-frontend-build-triggers');

// --- git fixture harness, same shape as scripts/check-app-version-bump.test.js's ------

function makeTempDir(prefix) {
    return fs.mkdtempSync(path.join(os.tmpdir(), prefix));
}

function runGit(cwd, args) {
    const result = spawnSync('git', args, { cwd, encoding: 'utf8' });
    assert.equal(result.status, 0, result.stderr || result.stdout);
    return (result.stdout || '').trim();
}

function makeGitRepo() {
    const root = makeTempDir('frontend-build-triggers-git-');
    runGit(root, ['init', '-q']);
    runGit(root, ['config', 'user.email', 'test@example.com']);
    runGit(root, ['config', 'user.name', 'Frontend Build Triggers Test']);
    return root;
}

function writeFiles(root, files) {
    for (const [relativePath, content] of Object.entries(files)) {
        const target = path.join(root, relativePath);
        fs.mkdirSync(path.dirname(target), { recursive: true });
        fs.writeFileSync(target, content);
    }
}

function commitAll(root, message) {
    runGit(root, ['add', '-A']);
    runGit(root, ['commit', '-q', '-m', message]);
    return runGit(root, ['rev-parse', 'HEAD']);
}

function cleanup(root) {
    fs.rmSync(root, { recursive: true, force: true });
}

// Own dedicated fixture -- real Vite entry points (apps/<app>/src/main.jsx), same shape as
// check-app-version-bump.test.js's reachabilityFixtureRepo(). dgfy-ims/dgfy-pos both reach
// packages/web-core AND packages/pos-receipt from their own entries; dgfy-storefront reaches only
// packages/web-core, matching the real repo's package.json fan-out (see resolve-web-core-
// reachability.js's own header).
function baseFixture(root) {
    writeFiles(root, {
        'apps/dgfy-ims/src/main.jsx': "import '../../../packages/web-core/src/reachable.js';\nimport '../../../packages/pos-receipt/src/receipt.js';\n",
        'apps/dgfy-pos/src/main.jsx': "import '../../../packages/web-core/src/reachable.js';\nimport '../../../packages/pos-receipt/src/receipt.js';\n",
        'apps/dgfy-storefront/src/main.jsx': "import '../../../packages/web-core/src/other.js';\n",
        'packages/web-core/src/reachable.js': 'export default {};\n',
        'packages/web-core/src/other.js': 'export default {};\n',
        'packages/pos-receipt/src/receipt.js': 'export default {};\n',
    });
    return commitAll(root, 'base fixture');
}

test('unconditional: a direct apps/dgfy-pos/ change triggers dgfy-pos only', async () => {
    const root = makeGitRepo();
    const baseGitRef = baseFixture(root);
    try {
        writeFiles(root, { 'apps/dgfy-pos/src/main.jsx': "import '../../../packages/web-core/src/reachable.js';\n// changed\n" });
        const headGitRef = commitAll(root, 'direct pos change');

        const result = await resolveFrontendBuildTriggers({ repoRoot: root, baseGitRef, headGitRef });
        assert.equal(result['dgfy-pos'].trigger, true);
        assert.equal(result['dgfy-pos'].reason, 'unconditional');
        assert.equal(result['dgfy-ims'].trigger, false);
        assert.equal(result['dgfy-storefront'].trigger, false);
    } finally {
        cleanup(root);
    }
});

test('unconditional: a packages/pos-receipt/ change triggers dgfy-ims and dgfy-pos, never dgfy-storefront', async () => {
    const root = makeGitRepo();
    const baseGitRef = baseFixture(root);
    try {
        writeFiles(root, { 'packages/pos-receipt/src/receipt.js': 'export default { changed: true };\n' });
        const headGitRef = commitAll(root, 'pos-receipt change');

        const result = await resolveFrontendBuildTriggers({ repoRoot: root, baseGitRef, headGitRef });
        assert.equal(result['dgfy-ims'].trigger, true);
        assert.equal(result['dgfy-ims'].reason, 'unconditional');
        assert.equal(result['dgfy-pos'].trigger, true);
        assert.equal(result['dgfy-pos'].reason, 'unconditional');
        // dgfy-storefront has no packages/pos-receipt/ pattern at all (matches shared-changed-paths.yml
        // and this script's own UNCONDITIONAL_TRIGGER_PATTERNS table) -- confirmed here directly.
        assert.doesNotMatch(UNCONDITIONAL_TRIGGER_PATTERNS['dgfy-storefront'].source, /pos-receipt/);
        assert.equal(result['dgfy-storefront'].trigger, false);
    } finally {
        cleanup(root);
    }
});

test("unconditional: an infrastructure/docker/<app>/ change triggers only that app", async () => {
    const root = makeGitRepo();
    const baseGitRef = baseFixture(root);
    try {
        writeFiles(root, { 'infrastructure/docker/dgfy-storefront/Dockerfile': 'FROM node:22\n' });
        const headGitRef = commitAll(root, 'storefront dockerfile change');

        const result = await resolveFrontendBuildTriggers({ repoRoot: root, baseGitRef, headGitRef });
        assert.equal(result['dgfy-storefront'].trigger, true);
        assert.equal(result['dgfy-storefront'].reason, 'unconditional');
        assert.equal(result['dgfy-ims'].trigger, false);
        assert.equal(result['dgfy-pos'].trigger, false);
    } finally {
        cleanup(root);
    }
});

test('unconditional: a root .dockerignore change triggers every frontend app', async () => {
    const root = makeGitRepo();
    const baseGitRef = baseFixture(root);
    try {
        writeFiles(root, { '.dockerignore': 'node_modules\n# changed\n' });
        const headGitRef = commitAll(root, 'dockerignore change');

        const result = await resolveFrontendBuildTriggers({ repoRoot: root, baseGitRef, headGitRef });
        for (const app of ['dgfy-ims', 'dgfy-pos', 'dgfy-storefront']) {
            assert.equal(result[app].trigger, true, `expected ${app} to trigger`);
            assert.equal(result[app].reason, 'unconditional');
        }
    } finally {
        cleanup(root);
    }
});

test('unconditional: a relevant .github/workflows/ file change triggers every frontend app', async () => {
    const root = makeGitRepo();
    const baseGitRef = baseFixture(root);
    try {
        writeFiles(root, { '.github/workflows/deploy-frontend.yml': 'name: deploy-frontend\n# changed\n' });
        const headGitRef = commitAll(root, 'deploy-frontend workflow change');

        const result = await resolveFrontendBuildTriggers({ repoRoot: root, baseGitRef, headGitRef });
        for (const app of ['dgfy-ims', 'dgfy-pos', 'dgfy-storefront']) {
            assert.equal(result[app].trigger, true, `expected ${app} to trigger`);
            assert.equal(result[app].reason, 'unconditional');
        }
    } finally {
        cleanup(root);
    }
});

test('reachability-narrowed: a packages/web-core change unreachable from dgfy-storefront does not trigger it, but does trigger dgfy-ims/dgfy-pos (the PR #1689 shape)', async () => {
    const root = makeGitRepo();
    const baseGitRef = baseFixture(root);
    try {
        writeFiles(root, { 'packages/web-core/src/reachable.js': 'export default { changed: true };\n' });
        const headGitRef = commitAll(root, 'change reachable.js');

        const result = await resolveFrontendBuildTriggers({ repoRoot: root, baseGitRef, headGitRef });
        assert.equal(result['dgfy-ims'].trigger, true);
        assert.equal(result['dgfy-ims'].reason, 'reachable');
        assert.equal(result['dgfy-pos'].trigger, true);
        assert.equal(result['dgfy-pos'].reason, 'reachable');
        // dgfy-storefront's own entry only ever imports other.js, never reachable.js.
        assert.equal(result['dgfy-storefront'].trigger, false);
        assert.equal(result['dgfy-storefront'].reason, 'not-reachable');
    } finally {
        cleanup(root);
    }
});

test('safety-net-trip: a disqualifying pattern anywhere under packages/web-core falls back to triggering every dependent app', async () => {
    const root = makeGitRepo();
    const baseGitRef = baseFixture(root);
    try {
        writeFiles(root, {
            'packages/web-core/src/reachable.js': 'export default { changed: true };\n',
            'packages/web-core/src/riskyLoader.js': 'export function load(name) {\n  return import(name);\n}\n',
        });
        const headGitRef = commitAll(root, 'change reachable.js + introduce a risky pattern');

        const result = await resolveFrontendBuildTriggers({ repoRoot: root, baseGitRef, headGitRef });
        // dgfy-storefront would normally not trigger here (see the test above) -- the safety net
        // must override that and fall back to triggering every dependent app.
        assert.equal(result['dgfy-storefront'].trigger, true);
        assert.equal(result['dgfy-storefront'].reason, 'safety-net-tripped');
    } finally {
        cleanup(root);
    }
});

test('deletion fail-closed: a deleted packages/web-core file conservatively triggers every dependent app', async () => {
    const root = makeGitRepo();
    baseFixture(root);
    try {
        writeFiles(root, { 'packages/web-core/src/toDelete.js': 'export default {};\n' });
        const baseGitRef = commitAll(root, 'add toDelete.js');
        fs.unlinkSync(path.join(root, 'packages/web-core/src/toDelete.js'));
        const headGitRef = commitAll(root, 'delete toDelete.js');

        const result = await resolveFrontendBuildTriggers({ repoRoot: root, baseGitRef, headGitRef });
        // dgfy-storefront never referenced toDelete.js either -- deletion fail-closed applies
        // regardless of any real reachability edge, same reasoning as the shared oracle's own tests.
        assert.equal(result['dgfy-storefront'].trigger, true);
        assert.equal(result['dgfy-storefront'].reason, 'deleted-file-fail-closed');
    } finally {
        cleanup(root);
    }
});

test('no relevant change: an unrelated file (e.g. docs) triggers nothing', async () => {
    const root = makeGitRepo();
    const baseGitRef = baseFixture(root);
    try {
        writeFiles(root, { 'docs/README.md': 'unrelated change\n' });
        const headGitRef = commitAll(root, 'unrelated docs change');

        const result = await resolveFrontendBuildTriggers({ repoRoot: root, baseGitRef, headGitRef });
        for (const app of ['dgfy-ims', 'dgfy-pos', 'dgfy-storefront']) {
            assert.equal(result[app].trigger, false, `expected ${app} not to trigger`);
            assert.equal(result[app].reason, 'no-relevant-change');
        }
    } finally {
        cleanup(root);
    }
});

test('resolveFrontendBuildTriggers requires --base', async () => {
    await assert.rejects(
        () => resolveFrontendBuildTriggers({ repoRoot: process.cwd() }),
        /requires options\.baseGitRef/,
    );
});
