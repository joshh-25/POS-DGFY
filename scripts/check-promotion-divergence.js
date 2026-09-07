#!/usr/bin/env node
/**
 * Promotion-time divergence check for `develop` <-> `staging` (#1696).
 *
 * Two bundled checks, both read-only, built on `git merge-tree` (git >=2.38 plumbing --
 * this repo pins git 2.53.0) rather than a scratch worktree or a real merge commit. Zero
 * working-tree mutation, zero commits, safe to run unattended and repeatedly.
 *
 * Check A (hard gate): would `--head` merge cleanly into `--base`? Answers the failure
 * mode named in #1696 -- a conflict discovered only when a promotion PR reports
 * `mergeable_state: dirty`, post-hoc. Run pre-cut instead, for free.
 *
 * Check B (informational, non-fatal): every merge commit unique to `--base` (i.e. every
 * staging-only commit, for the primary invocation) is attributed to one of the four
 * tracked branch patterns this repo's promotion mechanism actually uses. An unattributed
 * or non-PR merge is a visibility aid for the promoter's judgment, not a new
 * reconciliation mandate -- see docs/ops/RELEASE_CANDIDATE_POLICY.md's 2026-09-07 entry.
 *
 * CLI:
 *   node scripts/check-promotion-divergence.js --base <ref> --head <ref> [--report <path>]
 *
 * Primary call site (pre-`to-staging/<candidate_id>` cut):
 *   node scripts/check-promotion-divergence.js --base origin/staging --head origin/develop
 */

const { spawnSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const REPO_ROOT = path.resolve(__dirname, '..');

const ALLOWED_BRANCH_PATTERNS = Object.freeze([
    /^to-staging\//,
    /^fix\/staging\//,
    /^docs\/release\//,
    /^compliance-sweep\//,
]);

const MERGE_SUBJECT_RE = /^Merge pull request #(\d+) from Sieitzz\/(.+)$/;

class PromotionDivergenceError extends Error {
    constructor(message, options = {}) {
        super(message);
        this.name = 'PromotionDivergenceError';
        this.code = options.code || 'PROMOTION_DIVERGENCE_FAILED';
        this.report = options.report || null;
    }
}

function runGit(projectRoot, args, options = {}) {
    const result = spawnSync('git', args, {
        cwd: projectRoot,
        encoding: 'utf8',
        maxBuffer: 20 * 1024 * 1024,
        ...options,
    });
    return {
        ok: result.status === 0,
        status: result.status,
        stdout: result.stdout || '',
        stderr: result.stderr || '',
    };
}

function resolveRef(projectRoot, ref, label) {
    const result = runGit(projectRoot, ['rev-parse', '--verify', `${ref}^{commit}`]);
    if (!result.ok) {
        throw new PromotionDivergenceError(`Could not resolve ${label} ref: ${ref}`, {
            code: 'REF_NOT_FOUND',
        }).withStderr(result.stderr);
    }
    return result.stdout.trim();
}

// Attach stderr without changing the constructor signature every caller has to pass.
PromotionDivergenceError.prototype.withStderr = function withStderr(stderr) {
    this.stderr = (stderr || '').trim();
    return this;
};

/**
 * Check A: does `headSha` merge cleanly into `baseSha`?
 *
 * `git merge-tree --write-tree --name-only --no-messages <base> <head>` (verified live,
 * git 2.53.0): exit 0 -> stdout is just the resulting tree OID, no conflicts. exit 1 ->
 * stdout is the conflicted-merge tree OID on line 1, then one conflicted path per line
 * after it. Any other exit code is a real git error (bad ref, detached history, etc.) --
 * surfaced verbatim and never silently read as "clean" (same fail-closed discipline as
 * promotion-runbook.md's RF-12 compliance-scan fix).
 */
function checkMergeability(projectRoot, baseSha, headSha) {
    const result = runGit(projectRoot, [
        'merge-tree', '--write-tree', '--name-only', '--no-messages', baseSha, headSha,
    ]);

    if (result.status === 0) {
        return { mergeable: true, conflictedPaths: [] };
    }

    if (result.status === 1) {
        const lines = result.stdout.split('\n').filter(Boolean);
        const conflictedPaths = lines.slice(1);
        return { mergeable: false, conflictedPaths };
    }

    throw new PromotionDivergenceError(
        `git merge-tree failed unexpectedly (exit ${result.status}) for base=${baseSha} head=${headSha}`,
        { code: 'MERGE_TREE_FAILED' },
    ).withStderr(result.stderr);
}

function lastCommitTouching(projectRoot, ref, filePath) {
    const result = runGit(projectRoot, ['log', '-1', '--format=%h %s', ref, '--', filePath]);
    if (!result.ok) return null;
    const line = result.stdout.trim();
    return line || null;
}

function describeConflicts(projectRoot, baseRef, headRef, conflictedPaths) {
    return conflictedPaths.map((filePath) => ({
        path: filePath,
        base_last_commit: lastCommitTouching(projectRoot, baseRef, filePath),
        head_last_commit: lastCommitTouching(projectRoot, headRef, filePath),
    }));
}

/**
 * Check B: walk merge commits unique to `baseSha` (i.e. `headSha..baseSha`, first-parent
 * order) and classify each against GitHub's own standard merge-commit subject format.
 */
function auditProvenance(projectRoot, baseSha, headSha) {
    const result = runGit(projectRoot, [
        'log', '--first-parent', '--merges', '--format=%H%x09%s', `${headSha}..${baseSha}`,
    ]);
    if (!result.ok) {
        throw new PromotionDivergenceError(
            `Could not walk merge commits for ${headSha}..${baseSha}`,
            { code: 'LOG_FAILED' },
        ).withStderr(result.stderr);
    }

    const unattributedMerges = [];
    const nonPrMerges = [];

    const lines = result.stdout.split(/\r?\n/).filter(Boolean);
    for (const line of lines) {
        const [sha, ...subjectParts] = line.split('\t');
        const subject = subjectParts.join('\t');
        const match = MERGE_SUBJECT_RE.exec(subject);

        if (!match) {
            nonPrMerges.push({ sha, subject });
            continue;
        }

        const prNumber = Number(match[1]);
        const branch = match[2];
        const attributed = ALLOWED_BRANCH_PATTERNS.some((pattern) => pattern.test(branch));
        if (!attributed) {
            unattributedMerges.push({ sha, pr_number: prNumber, branch, subject });
        }
    }

    return { unattributedMerges, nonPrMerges };
}

function checkPromotionDivergence(options, logger = console) {
    const projectRoot = path.resolve(options.projectRoot || REPO_ROOT);
    const baseSha = resolveRef(projectRoot, options.base, 'base');
    const headSha = resolveRef(projectRoot, options.head, 'head');

    const { mergeable, conflictedPaths } = checkMergeability(projectRoot, baseSha, headSha);
    const conflictedFiles = mergeable
        ? []
        : describeConflicts(projectRoot, options.base, options.head, conflictedPaths);

    const { unattributedMerges, nonPrMerges } = auditProvenance(projectRoot, baseSha, headSha);

    const status = conflictedFiles.length > 0
        ? 'fail'
        : (unattributedMerges.length > 0 || nonPrMerges.length > 0 ? 'warn' : 'pass');

    const report = {
        version: 1,
        generated_at: new Date().toISOString(),
        status,
        base: options.base,
        head: options.head,
        base_sha: baseSha,
        head_sha: headSha,
        mergeable,
        conflicted_files: conflictedFiles,
        unattributed_merges: unattributedMerges,
        non_pr_merges: nonPrMerges,
    };

    if (options.reportPath) {
        const absoluteReportPath = path.resolve(projectRoot, options.reportPath);
        fs.mkdirSync(path.dirname(absoluteReportPath), { recursive: true });
        fs.writeFileSync(absoluteReportPath, JSON.stringify(report, null, 2));
    }

    logger.log(`[promotion-divergence] ${status.toUpperCase()} base=${options.base} head=${options.head}`);
    if (!mergeable) {
        logger.error(`[promotion-divergence] FAIL: ${conflictedFiles.length} conflicted file(s):`);
        for (const entry of conflictedFiles) {
            logger.error(`  - ${entry.path} (base: ${entry.base_last_commit || 'unknown'}; head: ${entry.head_last_commit || 'unknown'})`);
        }
    }
    for (const entry of unattributedMerges) {
        logger.warn(`[promotion-divergence] WARN unattributed_merge PR #${entry.pr_number} (${entry.branch}): ${entry.subject}`);
    }
    for (const entry of nonPrMerges) {
        logger.warn(`[promotion-divergence] WARN non_pr_merge ${entry.sha}: ${entry.subject}`);
    }

    return report;
}

// --- CLI ---------------------------------------------------------------------

function parseArgs(argv) {
    const options = { projectRoot: REPO_ROOT, base: '', head: '', reportPath: '' };

    for (let index = 0; index < argv.length; index += 1) {
        const arg = argv[index];
        if (arg === '--project-root') {
            const value = argv[index + 1];
            if (!value) throw new PromotionDivergenceError('Missing value for --project-root', { code: 'INVALID_ARGS' });
            options.projectRoot = path.resolve(value);
            index += 1;
        } else if (arg === '--base') {
            options.base = argv[index + 1] || '';
            index += 1;
        } else if (arg === '--head') {
            options.head = argv[index + 1] || '';
            index += 1;
        } else if (arg === '--report') {
            options.reportPath = argv[index + 1] || '';
            index += 1;
        } else {
            throw new PromotionDivergenceError(`Unknown argument: ${arg}`, { code: 'INVALID_ARGS' });
        }
    }

    if (!options.base) throw new PromotionDivergenceError('Missing value for --base', { code: 'INVALID_ARGS' });
    if (!options.head) throw new PromotionDivergenceError('Missing value for --head', { code: 'INVALID_ARGS' });
    return options;
}

function main() {
    let report;
    try {
        report = checkPromotionDivergence(parseArgs(process.argv.slice(2)));
    } catch (error) {
        if (error instanceof PromotionDivergenceError) {
            console.error(`[promotion-divergence] ${error.code}: ${error.message}`);
            if (error.stderr) console.error(error.stderr);
            process.exitCode = 1;
            return;
        }
        throw error;
    }

    process.exitCode = report.status === 'fail' ? 1 : 0;
}

if (require.main === module) {
    main();
}

module.exports = {
    PromotionDivergenceError,
    ALLOWED_BRANCH_PATTERNS,
    MERGE_SUBJECT_RE,
    parseArgs,
    checkMergeability,
    auditProvenance,
    checkPromotionDivergence,
};
