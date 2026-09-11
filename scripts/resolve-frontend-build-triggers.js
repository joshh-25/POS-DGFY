#!/usr/bin/env node
/**
 * Narrows shared-changed-paths.yml's frontend_ims/frontend_pos/frontend_storefront build-trigger
 * verdicts by web-core/shared-constants reachability -- #1809 (epic #1548, Phase 324), item 2 of
 * that issue's DoD.
 *
 * The workflow's own "Detect changed paths" step (a plain bash regex over `git diff --name-only`)
 * already decides whether each frontend app's Docker build/lint checks need to run this PR, but its
 * fan-out matcher is directory-level: ANY changed file under packages/web-core or
 * packages/shared-constants trips every dependent app's build, exactly the same false-positive
 * shape check-app-version-bump.js's own fan-out check had before this issue's item 1 fix (see that
 * script's own header, and resolve-web-core-reachability.js's PR #1689 example). This script is a
 * thin orchestration layer over that same shared oracle (resolveAppReachabilityVerdict()) plus this
 * workflow's own "unconditional trigger" patterns -- it does not reimplement reachability itself,
 * and it deliberately stays out of resolve-web-core-reachability.js (which answers "is X reachable
 * from Y," not "what triggers a GHA job").
 *
 * Mirrors scripts/check-app-version-bump.js's own git-diff/CLI-output conventions where they apply,
 * and scripts/resolve-build-skip-plan.js's printPlan()/writeGithubOutput() shape for the CLI.
 *
 * Deliberately does NOT read scripts/lib/web-core-reachability-gate-toggle.js -- unlike
 * check-app-version-bump.js's runCheck()/runFloor(), this script has no pre-#1809 "old verdict" to
 * fall back to if narrowing were ever disabled; it exists ONLY to narrow, so there's nothing for a
 * toggle to gate here. If a live false negative in the shared oracle ever needs an emergency
 * rollback, that toggle already covers check-app-version-bump.js's own gating; reverting this
 * script's own workflow wiring (shared-changed-paths.yml's "Narrow frontend build triggers..." step)
 * is the equivalent lever for this consumer -- see that workflow's own step for how it degrades to
 * the "Detect changed paths" step's own directory-level fallback whenever the diff isn't available.
 *
 * CLI:
 *   node scripts/resolve-frontend-build-triggers.js --base <ref> --head <ref (default HEAD)>
 *     Prints one human-readable line per frontend app, then the machine-readable JSON blob on its
 *     own stdout line (mirrors resolve-build-skip-plan.js's own convention), and -- when
 *     GITHUB_OUTPUT is set -- appends frontend_ims=/frontend_pos=/frontend_storefront= lines for
 *     shared-changed-paths.yml's own job-level ternary fallback to read.
 */

const { execSync } = require('child_process');
const path = require('path');
const fs = require('fs');

const { resolveAppReachabilityVerdict, ENTRY_FILE_BY_APP } = require('./resolve-web-core-reachability');
const { fileExistsAtRef } = require('./check-app-version-bump'); // reuse, don't re-implement a 3rd copy

const REPO_ROOT = path.resolve(__dirname, '..');

const runCommand = (command, { allowFail = false, cwd = REPO_ROOT } = {}) => {
    try {
        return execSync(command, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'], cwd }).trim();
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

// The exact non-web-core-scope portion of shared-changed-paths.yml's own per-app bash regex (its
// "Detect changed paths" step) -- kept here as the single JS source of truth for the
// validate_pr_metadata=true path this script serves. That workflow's own bash regex stays the
// FALLBACK for validate_pr_metadata=false (currently a dead path -- push mode is unused by any live
// caller) and is therefore a deliberate, documented duplicate, not drift -- if you touch one, check
// the other's comment pointing back here.
const UNCONDITIONAL_TRIGGER_PATTERNS = Object.freeze({
    'dgfy-ims': /^(apps\/dgfy-ims\/|packages\/pos-receipt\/|infrastructure\/docker\/dgfy-ims\/|\.dockerignore|\.github\/workflows\/(shared-changed-paths|deploy-frontend|deployment-orchestrator|pr-frontend-build-checks|pr-frontend-lint-checks|deploy|deploy-main)\.yml)/,
    'dgfy-pos': /^(apps\/dgfy-pos\/|packages\/pos-receipt\/|infrastructure\/docker\/dgfy-pos\/|\.dockerignore|\.github\/workflows\/(shared-changed-paths|deploy-frontend|deployment-orchestrator|pr-frontend-build-checks|deploy|deploy-main)\.yml)/,
    'dgfy-storefront': /^(apps\/dgfy-storefront\/|infrastructure\/docker\/dgfy-storefront\/|\.dockerignore|\.github\/workflows\/(shared-changed-paths|deploy-frontend|deployment-orchestrator|pr-frontend-build-checks|deploy|deploy-main)\.yml)/,
});

/**
 * options:
 *   - repoRoot (default: this repo)
 *   - baseGitRef (required), headGitRef (default: 'HEAD')
 *   - changedFiles (default: `git diff --name-only base..head`) -- override for tests
 *
 * Returns { [app]: { trigger: boolean, reason: string, detail?: string } } for every app in
 * ENTRY_FILE_BY_APP (dgfy-ims/dgfy-pos/dgfy-storefront -- the only apps a frontend Docker build
 * applies to; dgfy-api/dgfy-migration-runner/android are untouched by this script, exactly as
 * #1809's plan doc §3.2 specifies -- none of their trigger patterns reference
 * packages/web-core/packages/shared-constants, so there's nothing to narrow for them).
 */
async function resolveFrontendBuildTriggers(options = {}) {
    const repoRoot = options.repoRoot || REPO_ROOT;
    const baseGitRef = options.baseGitRef;
    const headGitRef = options.headGitRef || 'HEAD';

    if (!baseGitRef) {
        throw new Error('resolveFrontendBuildTriggers requires options.baseGitRef');
    }

    const changedFiles = options.changedFiles !== undefined
        ? options.changedFiles
        : splitLines(runCommand(`git diff --name-only ${baseGitRef}..${headGitRef}`, { cwd: repoRoot, allowFail: true }));

    const result = {};
    for (const app of Object.keys(ENTRY_FILE_BY_APP)) {
        const unconditional = changedFiles.some((file) => UNCONDITIONAL_TRIGGER_PATTERNS[app].test(file));
        if (unconditional) {
            result[app] = { trigger: true, reason: 'unconditional', detail: 'a changed file matches this app\'s own unconditional trigger patterns (app dir, docker dir, .dockerignore, or a relevant workflow file)' };
            continue;
        }

        const verdict = await resolveAppReachabilityVerdict(repoRoot, app, changedFiles, {
            fileExistsAtRef: (file) => fileExistsAtRef(repoRoot, headGitRef, file),
        });

        result[app] = !verdict.applicable
            ? { trigger: false, reason: 'no-relevant-change', detail: verdict.reason }
            : { trigger: verdict.changed, reason: verdict.code, detail: verdict.detail };
    }
    return result;
}

// --- CLI ---------------------------------------------------------------------

function parseArgs(argv) {
    const baseIdx = argv.indexOf('--base');
    const headIdx = argv.indexOf('--head');
    return {
        baseGitRef: baseIdx !== -1 ? argv[baseIdx + 1] : null,
        headGitRef: headIdx !== -1 ? argv[headIdx + 1] : 'HEAD',
    };
}

function printResult(result) {
    for (const [app, entry] of Object.entries(result)) {
        const label = entry.trigger ? 'TRIGGER' : 'SKIP';
        console.log(`[resolve-frontend-build-triggers] [${label}] ${app} (${entry.reason}): ${entry.detail || ''}`);
    }
    // Machine-readable, on its own stdout line -- mirrors resolve-build-skip-plan.js's printPlan()
    // convention so a caller parses this line, not the human-readable ones above.
    console.log(JSON.stringify(result));
}

function writeGithubOutput(result) {
    const outputPath = process.env.GITHUB_OUTPUT;
    if (!outputPath) return;
    const suffixByApp = { 'dgfy-ims': 'ims', 'dgfy-pos': 'pos', 'dgfy-storefront': 'storefront' };
    const lines = Object.entries(result)
        .map(([app, entry]) => `frontend_${suffixByApp[app]}=${entry.trigger}`)
        .join('\n');
    fs.appendFileSync(outputPath, `${lines}\n`);
}

async function main() {
    const { baseGitRef, headGitRef } = parseArgs(process.argv.slice(2));
    if (!baseGitRef) {
        console.error('[resolve-frontend-build-triggers] --base <ref> is required (--head defaults to HEAD).');
        process.exitCode = 1;
        return;
    }

    const result = await resolveFrontendBuildTriggers({ repoRoot: REPO_ROOT, baseGitRef, headGitRef });
    printResult(result);
    writeGithubOutput(result);
}

if (require.main === module) {
    main().catch((error) => {
        console.error(error);
        process.exitCode = 1;
    });
}

module.exports = {
    UNCONDITIONAL_TRIGGER_PATTERNS,
    resolveFrontendBuildTriggers,
    parseArgs,
};
