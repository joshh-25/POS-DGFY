#!/usr/bin/env node
// Merges N open PR branches into one throwaway integration branch (in a git
// worktree, off origin/<base>) so multiple in-flight PRs can be checked
// together before/instead of merging them into develop one at a time and
// waiting on a build after each. Kept deliberately simple per Pat's own
// call: "I want to do it to some degree I guess. it's conflicting. but
// let's just do it straightforward for now" -- no automated blame
// attribution, no pairwise conflict probing, no auto-commenting on PRs.
// Just the mechanical part done by hand today, plus optional build/test.
//
// Usage:
//   node scripts/integrate-prs.js 401 405 407 [--base develop] [--build] [--test] [--keep]
//
// --build   Build the Docker image for each component whose paths changed
//           across the merged set (same Dockerfiles CI uses, push:false).
// --test    Run a configurable local test command set (see TEST_COMMANDS
//           below) once all PRs are merged.
// --keep    Don't remove the worktree/branch when done (default: removed on
//           a clean exit; always kept on conflict, so you can inspect it).
//
// Output is a plain summary: which PRs merged clean, which conflicted and
// against what. What to do with that is your call, not this script's.

const { execFileSync, execSync } = require('node:child_process');
const path = require('node:path');
const fs = require('node:fs');

const repoRoot = path.resolve(__dirname, '..');

const TEST_COMMANDS = [
    // Deliberately cheap defaults -- this is a pre-merge sanity pass, not a
    // replacement for `npm run gate:release:local` (the real pre-promotion
    // gate, see docs/testing/release-go-no-go-checklist.md). Edit this list
    // for your own use if you want more coverage per run.
    'npm run test:frontend:contracts --silent',
];

// path_regex -> [dockerfile, context] -- mirrors shared-changed-paths.yml's
// filters. Kept as a small local copy rather than parsing the workflow's
// bash, since this only needs to decide what to build, not produce the
// same boolean outputs that workflow does.
const COMPONENTS = [
    {
        name: 'frontend',
        pathRegex: /^(apps\/dgfy-web\/|packages\/pos-receipt\/|packages\/shared-constants\/|infrastructure\/docker\/frontend\/)/,
        dockerfile: 'infrastructure/docker/frontend/Dockerfile',
    },
    {
        name: 'dgfy-api',
        pathRegex: /^(apps\/dgfy-api\/|packages\/shared-constants\/|infrastructure\/docker\/dgfy-api\/)/,
        dockerfile: 'infrastructure/docker/dgfy-api/Dockerfile',
    },
    {
        name: 'migration-runner',
        pathRegex: /^(apps\/dgfy-migration-runner\/|infrastructure\/docker\/dgfy-migration-runner\/)/,
        dockerfile: 'infrastructure/docker/dgfy-migration-runner/Dockerfile',
    },
];

function parseArgs(argv) {
    const prNumbers = [];
    const opts = { base: 'develop', build: false, test: false, keep: false };
    for (let i = 0; i < argv.length; i += 1) {
        const arg = argv[i];
        if (arg === '--base') {
            opts.base = argv[++i];
        } else if (arg === '--build') {
            opts.build = true;
        } else if (arg === '--test') {
            opts.test = true;
        } else if (arg === '--keep') {
            opts.keep = true;
        } else if (/^\d+$/.test(arg)) {
            prNumbers.push(Number(arg));
        } else {
            throw new Error(`Unrecognized argument: ${arg}`);
        }
    }
    if (prNumbers.length < 2) {
        throw new Error('Give at least 2 PR numbers -- integrating a single PR is just a normal merge.');
    }
    return { prNumbers, opts };
}

function sh(cmd, cwd, { allowFail = false } = {}) {
    try {
        return execSync(cmd, { encoding: 'utf8', cwd, stdio: ['ignore', 'pipe', 'pipe'] }).trim();
    } catch (error) {
        if (allowFail) return { failed: true, output: (error.stdout || '') + (error.stderr || '') };
        throw error;
    }
}

function ghJson(args) {
    const out = execFileSync('gh', args, { encoding: 'utf8', cwd: repoRoot });
    return JSON.parse(out);
}

function resolvePr(number) {
    // Pin to headRefOid, not the branch name -- a dev pushing mid-run
    // shouldn't be able to make this result irreproducible.
    const pr = ghJson([
        'pr', 'view', String(number),
        '--json', 'number,title,headRefName,headRefOid,baseRefName,mergeable,isDraft,author,state',
    ]);
    if (pr.state !== 'OPEN') {
        console.warn(`::warning:: PR #${number} is ${pr.state}, not OPEN -- integrating it anyway (use --base carefully).`);
    }
    return pr;
}

function main() {
    const { prNumbers, opts } = parseArgs(process.argv.slice(2));

    console.log(`Resolving ${prNumbers.length} PRs against origin/${opts.base}...`);
    const prs = prNumbers.map(resolvePr);

    // Oldest PR first -- makes the newest PR the one asked to rebase if it
    // conflicts, matching how Pat already escalates this by hand: "if after
    // merging a few, the next one is incompatible, that's when I call out
    // the dev."
    prs.sort((a, b) => a.number - b.number);

    sh('git fetch origin', repoRoot);

    const label = prs.map((p) => p.number).join('-');
    const branchName = `integration/${label}`;
    const worktreeDir = path.join(repoRoot, '.tmp', 'integration', label);

    fs.mkdirSync(path.dirname(worktreeDir), { recursive: true });
    sh(`git worktree remove --force "${worktreeDir}"`, repoRoot, { allowFail: true });
    sh(`git branch -D "${branchName}"`, repoRoot, { allowFail: true });
    sh(`git worktree add "${worktreeDir}" -b "${branchName}" "origin/${opts.base}"`, repoRoot);

    const results = [];
    for (const pr of prs) {
        sh(`git fetch origin pull/${pr.number}/head:pr-${pr.number}-head`, repoRoot, { allowFail: true });
        const merge = sh(
            `git merge --no-ff --no-edit "${pr.headRefOid}" -m "integrate: PR #${pr.number} ${pr.title.replace(/"/g, "'")}"`,
            worktreeDir,
            { allowFail: true },
        );
        if (merge && merge.failed) {
            const conflictFiles = sh('git diff --name-only --diff-filter=U', worktreeDir, { allowFail: true });
            sh('git merge --abort', worktreeDir, { allowFail: true });
            results.push({ pr, ok: false, conflictFiles: (conflictFiles || '').split('\n').filter(Boolean) });
            // Deliberately continue rather than stop -- one pass should name
            // every incompatible PR, not just the first.
            continue;
        }
        results.push({ pr, ok: true });
    }

    const merged = results.filter((r) => r.ok);
    const conflicted = results.filter((r) => !r.ok);

    console.log('\n=== Integration result ===');
    console.log(`Branch: ${branchName}  (worktree: ${worktreeDir})`);
    console.log(`Base:   origin/${opts.base}\n`);
    for (const r of results) {
        if (r.ok) {
            console.log(`  OK      #${r.pr.number}  ${r.pr.title}`);
        } else {
            console.log(`  CONFLICT #${r.pr.number}  ${r.pr.title}`);
            r.conflictFiles.forEach((f) => console.log(`             ${f}`));
        }
    }

    let buildResults = [];
    let testResult = null;

    if (opts.build && merged.length > 0) {
        console.log('\n=== Build ===');
        const changedFiles = sh(`git diff --name-only "origin/${opts.base}"`, worktreeDir, { allowFail: true }) || '';
        const changedList = changedFiles.split('\n').filter(Boolean);
        for (const component of COMPONENTS) {
            const touched = changedList.some((f) => component.pathRegex.test(f));
            if (!touched) continue;
            console.log(`Building ${component.name}...`);
            const build = sh(
                `docker build -f "${component.dockerfile}" -t integration-check-${component.name} .`,
                worktreeDir,
                { allowFail: true },
            );
            const ok = !(build && build.failed);
            buildResults.push({ component: component.name, ok });
            console.log(`  ${ok ? 'OK' : 'FAILED'}: ${component.name}`);
            if (!ok) console.log(build.output.split('\n').slice(-20).join('\n'));
        }
        if (buildResults.length === 0) console.log('(no component paths changed across the merged set)');
    }

    if (opts.test && merged.length > 0) {
        console.log('\n=== Test ===');
        for (const cmd of TEST_COMMANDS) {
            console.log(`$ ${cmd}`);
            const result = sh(cmd, worktreeDir, { allowFail: true });
            const ok = !(result && result.failed);
            console.log(ok ? '  OK' : '  FAILED');
            if (!ok) console.log(result.output.split('\n').slice(-40).join('\n'));
            testResult = testResult === false ? false : ok;
        }
    }

    const cleanExit = conflicted.length === 0 && buildResults.every((b) => b.ok) && testResult !== false;
    if (cleanExit && !opts.keep) {
        sh(`git worktree remove --force "${worktreeDir}"`, repoRoot, { allowFail: true });
        sh(`git branch -D "${branchName}"`, repoRoot, { allowFail: true });
        console.log('\nAll merged clean, build/test (if requested) passed -- worktree removed. Re-run with --keep to inspect next time.');
    } else if (!cleanExit) {
        console.log(`\nWorktree kept at ${worktreeDir} for inspection (conflicts and/or a failed build/test).`);
    }

    if (conflicted.length > 0) process.exitCode = 1;
    else if (opts.build && buildResults.some((b) => !b.ok)) process.exitCode = 1;
    else if (opts.test && testResult === false) process.exitCode = 1;
}

if (require.main === module) {
    main();
}

module.exports = { parseArgs, COMPONENTS };
