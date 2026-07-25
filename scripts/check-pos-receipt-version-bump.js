#!/usr/bin/env node
// Catches "forgot to bump @sieitzz/pos-receipt's version" at PR time, before
// merge to develop -- develop's own publish gate (.github/workflows/
// publish-pos-receipt.yml) is continue-on-error so it can't block deploys,
// so this is the earlier, real backstop.

const { execSync } = require('child_process');
const path = require('path');

const repoRoot = path.resolve(__dirname, '..');

const PACKAGE_DIR = 'packages/pos-receipt';
const PACKAGE_JSON_PATH = `${PACKAGE_DIR}/package.json`;

const runCommand = (command, { allowFail = false } = {}) => {
    try {
        return execSync(command, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'], cwd: repoRoot }).trim();
    } catch (error) {
        if (allowFail) return '';
        throw error;
    }
};

const splitLines = (raw) => (
    String(raw || '')
        .split(/\r?\n/)
        .map((line) => line.trim())
        .filter(Boolean)
);

// Mirrors backend/scripts/check-tenant-schema-registry-coverage.js's
// resolveChangedFiles fallback chain, minus the --staged mode (not needed
// here -- this only ever runs against a base-branch comparison).
function resolveBaseRef() {
    const baseRef = process.env.GITHUB_BASE_REF;
    if (baseRef) {
        runCommand(`git fetch --no-tags --prune --depth=200 origin ${baseRef}`, { allowFail: true });
        const mergeBase = runCommand(`git merge-base HEAD origin/${baseRef}`, { allowFail: true });
        if (mergeBase) return mergeBase;
    }

    const beforeSha = process.env.GITHUB_EVENT_BEFORE || process.env.CI_COMMIT_BEFORE_SHA;
    if (beforeSha && !/^0+$/.test(beforeSha)) return beforeSha;

    return runCommand('git rev-parse HEAD~1', { allowFail: true }) || null;
}

function readVersionAt(ref, relativePath) {
    const raw = runCommand(`git show ${ref}:${relativePath}`, { allowFail: true });
    if (!raw) return null;
    try {
        return JSON.parse(raw).version || null;
    } catch {
        return null;
    }
}

function run() {
    const baseRef = resolveBaseRef();
    if (!baseRef) {
        console.log('[check:pos-receipt-version] No base ref resolvable -- skipping (not a PR context).');
        return;
    }

    const changedFiles = splitLines(runCommand(`git diff --name-only ${baseRef}...HEAD`, { allowFail: true }));
    const packageChanged = changedFiles.some((file) => file.startsWith(`${PACKAGE_DIR}/`));

    if (!packageChanged) {
        console.log('[check:pos-receipt-version] No packages/pos-receipt changes in this PR.');
        return;
    }

    const baseVersion = readVersionAt(baseRef, PACKAGE_JSON_PATH);
    const headVersion = readVersionAt('HEAD', PACKAGE_JSON_PATH);

    if (!headVersion) {
        console.error(`[check:pos-receipt-version] Could not read version from ${PACKAGE_JSON_PATH} at HEAD.`);
        process.exitCode = 1;
        return;
    }

    if (baseVersion && baseVersion === headVersion) {
        console.error(
            `[check:pos-receipt-version] packages/pos-receipt changed but its version is still ${headVersion} ` +
            `(unchanged from ${process.env.GITHUB_BASE_REF || 'the base branch'}). Bump the version in ` +
            `${PACKAGE_JSON_PATH} so develop's publish step doesn't skip a real change.`
        );
        process.exitCode = 1;
        return;
    }

    console.log(`[check:pos-receipt-version] PASS. Version bumped ${baseVersion ?? '(new package)'} -> ${headVersion}.`);
}

run();
