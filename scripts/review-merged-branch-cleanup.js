#!/usr/bin/env node

const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');

const DEFAULT_POLICY_PATH = path.join('.github', 'branch-cleanup-policy.json');

function parseArgs(argv) {
  const args = {
    policy: DEFAULT_POLICY_PATH,
    dryRun: false,
    deleteApproved: false,
    report: null,
    remote: null,
  };

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    const readValue = () => {
      index += 1;
      if (index >= argv.length) {
        throw new Error(`Missing value for ${arg}`);
      }
      return argv[index];
    };

    if (arg === '--repository') args.repository = readValue();
    else if (arg === '--pr-number') args.prNumber = Number(readValue());
    else if (arg === '--policy') args.policy = readValue();
    else if (arg === '--report') args.report = readValue();
    else if (arg === '--remote') args.remote = readValue();
    else if (arg === '--dry-run') args.dryRun = true;
    else if (arg === '--delete-approved') args.deleteApproved = true;
    else if (arg === '--help' || arg === '-h') args.help = true;
    else throw new Error(`Unknown argument: ${arg}`);
  }

  return args;
}

function printHelp() {
  console.log(`Usage:
  node scripts/review-merged-branch-cleanup.js --repository OWNER/REPO --pr-number N --dry-run
  node scripts/review-merged-branch-cleanup.js --repository OWNER/REPO --pr-number N --delete-approved

Options:
  --policy PATH          Policy JSON path. Default: ${DEFAULT_POLICY_PATH}
  --report PATH          Write JSON report to this path.
  --remote NAME          Git remote to inspect/delete. Default from policy or origin.
  --dry-run              Report the decision without deleting the remote branch.
  --delete-approved      Delete only when all policy and safety checks pass.
`);
}

function loadPolicy(policyPath) {
  const loaded = JSON.parse(fs.readFileSync(policyPath, 'utf8'));
  return {
    allowedBaseBranches: loaded.allowedBaseBranches || [],
    eligibleHeadPrefixes: loaded.eligibleHeadPrefixes || [],
    protectedBranches: loaded.protectedBranches || [],
    protectedHeadPrefixes: loaded.protectedHeadPrefixes || [],
    keepLabels: loaded.keepLabels || [],
    approvalLabels: loaded.approvalLabels || [],
    requireApprovalLabel: Boolean(loaded.requireApprovalLabel),
    deleteRemote: loaded.deleteRemote || 'origin',
  };
}

function normalizeLabels(labels) {
  return (labels || []).map((label) => {
    if (typeof label === 'string') return label;
    return label && label.name ? label.name : '';
  }).filter(Boolean);
}

function hasAny(values, candidates) {
  return candidates.some((candidate) => values.includes(candidate));
}

function hasPrefix(value, prefixes) {
  return prefixes.some((prefix) => value.startsWith(prefix));
}

function basicBranchDecision(pr, openPulls, policy) {
  const labels = normalizeLabels(pr.labels);
  const headRef = pr.head && pr.head.ref;
  const headSha = pr.head && pr.head.sha;
  const headRepo = pr.head && pr.head.repo && pr.head.repo.full_name;
  const baseRef = pr.base && pr.base.ref;
  const baseRepo = pr.base && pr.base.repo && pr.base.repo.full_name;

  const details = {
    prNumber: pr.number,
    baseRef,
    headRef,
    headSha,
    mergeCommitSha: pr.merge_commit_sha || null,
    labels,
  };

  if (pr.state !== 'closed' || !pr.merged_at) {
    return { status: 'preserved', reason: 'pull_request_not_merged', details };
  }
  if (!policy.allowedBaseBranches.includes(baseRef)) {
    return { status: 'preserved', reason: 'base_branch_not_allowed', details };
  }
  if (!headRef || !headSha) {
    return { status: 'blocked', reason: 'missing_head_ref_or_sha', details };
  }
  if (!baseRepo || !headRepo || baseRepo !== headRepo) {
    return { status: 'preserved', reason: 'cross_repository_or_unknown_head', details };
  }
  if (policy.protectedBranches.includes(headRef)) {
    return { status: 'preserved', reason: 'protected_branch_exact_match', details };
  }
  if (hasPrefix(headRef, policy.protectedHeadPrefixes)) {
    return { status: 'preserved', reason: 'protected_branch_prefix', details };
  }
  if (hasAny(labels, policy.keepLabels)) {
    return { status: 'preserved', reason: 'keep_label_present', details };
  }
  if (policy.requireApprovalLabel && !hasAny(labels, policy.approvalLabels)) {
    return { status: 'preserved', reason: 'approval_label_missing', details };
  }
  if (!hasPrefix(headRef, policy.eligibleHeadPrefixes)) {
    return { status: 'preserved', reason: 'head_prefix_not_eligible', details };
  }

  const conflictingOpenPr = (openPulls || []).find((openPr) => {
    if (openPr.number === pr.number) return false;
    const openHead = openPr.head && openPr.head.ref;
    const openBase = openPr.base && openPr.base.ref;
    return openHead === headRef || openBase === headRef;
  });

  if (conflictingOpenPr) {
    return {
      status: 'preserved',
      reason: 'branch_used_by_open_pull_request',
      details: { ...details, conflictingOpenPullRequest: conflictingOpenPr.number },
    };
  }

  return { status: 'eligible', reason: 'policy_checks_passed', details };
}

function runGit(args, options = {}) {
  const result = spawnSync('git', args, {
    cwd: options.cwd || process.cwd(),
    encoding: 'utf8',
    shell: false,
  });
  return {
    status: result.status,
    stdout: result.stdout || '',
    stderr: result.stderr || '',
  };
}

function assertValidBranchName(branchName) {
  const result = runGit(['check-ref-format', '--branch', branchName]);
  if (result.status !== 0) {
    throw new Error(`Invalid branch name for cleanup: ${branchName}`);
  }
}

function remoteHeadSha(remote, branchName) {
  const result = runGit(['ls-remote', '--heads', remote, branchName]);
  if (result.status !== 0) {
    throw new Error(`Unable to inspect remote branch ${remote}/${branchName}: ${result.stderr.trim()}`);
  }
  const line = result.stdout.trim();
  if (!line) return null;
  const [sha] = line.split(/\s+/);
  return sha || null;
}

function fetchBase(remote, baseRef) {
  const result = runGit(['fetch', '--no-tags', remote, `${baseRef}:refs/remotes/${remote}/${baseRef}`]);
  if (result.status !== 0) {
    throw new Error(`Unable to fetch ${remote}/${baseRef}: ${result.stderr.trim()}`);
  }
}

function isAncestor(commit, ref) {
  const result = runGit(['merge-base', '--is-ancestor', commit, ref]);
  return result.status === 0;
}

function deleteRemoteBranchWithLease(remote, branchName, expectedSha) {
  return runGit([
    'push',
    `--force-with-lease=refs/heads/${branchName}:${expectedSha}`,
    remote,
    `:refs/heads/${branchName}`,
  ]);
}

async function githubRequest(repository, route) {
  const token = process.env.GH_TOKEN || process.env.GITHUB_TOKEN;
  if (!token) {
    throw new Error('GH_TOKEN or GITHUB_TOKEN is required for GitHub API reads.');
  }
  const response = await fetch(`https://api.github.com/repos/${repository}${route}`, {
    headers: {
      Accept: 'application/vnd.github+json',
      Authorization: `Bearer ${token}`,
      'X-GitHub-Api-Version': '2022-11-28',
      'User-Agent': 'sku-merged-branch-cleanup',
    },
  });
  if (!response.ok) {
    const body = await response.text();
    throw new Error(`GitHub API ${route} failed with ${response.status}: ${body}`);
  }
  return response.json();
}

async function fetchPullRequestContext(repository, prNumber) {
  const pr = await githubRequest(repository, `/pulls/${prNumber}`);
  const openPulls = await githubRequest(repository, '/pulls?state=open&per_page=100');
  return { pr, openPulls };
}

function completeGitSafetyChecks(decision, policy, options = {}) {
  if (decision.status !== 'eligible') return decision;

  const remote = options.remote || policy.deleteRemote || 'origin';
  const { headRef, headSha, baseRef, mergeCommitSha } = decision.details;
  assertValidBranchName(headRef);

  const currentRemoteSha = remoteHeadSha(remote, headRef);
  if (!currentRemoteSha) {
    return {
      ...decision,
      status: 'already_deleted',
      reason: 'remote_branch_not_found',
      details: { ...decision.details, remote },
    };
  }

  if (currentRemoteSha !== headSha) {
    return {
      ...decision,
      status: 'blocked',
      reason: 'remote_branch_moved_after_merge',
      details: { ...decision.details, remote, currentRemoteSha },
    };
  }

  if (!mergeCommitSha) {
    return {
      ...decision,
      status: 'blocked',
      reason: 'missing_merge_commit_sha',
      details: { ...decision.details, remote, currentRemoteSha },
    };
  }

  fetchBase(remote, baseRef);
  if (!isAncestor(mergeCommitSha, `refs/remotes/${remote}/${baseRef}`)) {
    return {
      ...decision,
      status: 'blocked',
      reason: 'merge_commit_not_reachable_from_base',
      details: { ...decision.details, remote, currentRemoteSha },
    };
  }

  return {
    ...decision,
    details: { ...decision.details, remote, currentRemoteSha },
  };
}

function applyDeletion(decision, options = {}) {
  if (decision.status !== 'eligible') return decision;
  if (options.dryRun || !options.deleteApproved) {
    return {
      ...decision,
      status: 'eligible',
      reason: options.dryRun ? 'dry_run_delete_not_attempted' : 'delete_approval_missing',
    };
  }

  const { remote, headRef, headSha } = decision.details;
  const result = deleteRemoteBranchWithLease(remote, headRef, headSha);
  if (result.status !== 0) {
    return {
      ...decision,
      status: 'error',
      reason: 'delete_failed',
      details: {
        ...decision.details,
        deleteExitCode: result.status,
        deleteStderr: result.stderr.trim(),
      },
    };
  }

  return {
    ...decision,
    status: 'deleted',
    reason: 'remote_branch_deleted_with_sha_lease',
    details: {
      ...decision.details,
      deleteStdout: result.stdout.trim(),
    },
  };
}

function writeReport(reportPath, report) {
  if (!reportPath) return;
  fs.mkdirSync(path.dirname(reportPath), { recursive: true });
  fs.writeFileSync(reportPath, `${JSON.stringify(report, null, 2)}\n`);
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (args.help) {
    printHelp();
    return;
  }
  if (!args.repository) throw new Error('--repository is required');
  if (!Number.isInteger(args.prNumber) || args.prNumber < 1) throw new Error('--pr-number must be a positive integer');

  const policy = loadPolicy(args.policy);
  const { pr, openPulls } = await fetchPullRequestContext(args.repository, args.prNumber);
  const policyDecision = basicBranchDecision(pr, openPulls, policy);
  const checkedDecision = completeGitSafetyChecks(policyDecision, policy, { remote: args.remote });
  const finalDecision = applyDeletion(checkedDecision, {
    dryRun: args.dryRun,
    deleteApproved: args.deleteApproved,
  });

  const report = {
    repository: args.repository,
    prNumber: args.prNumber,
    generatedAt: new Date().toISOString(),
    dryRun: args.dryRun,
    deleteApproved: args.deleteApproved,
    decision: finalDecision,
  };

  writeReport(args.report, report);
  console.log(JSON.stringify(report, null, 2));

  if (finalDecision.status === 'error' || finalDecision.status === 'blocked') {
    process.exitCode = 1;
  }
}

if (require.main === module) {
  main().catch((error) => {
    console.error(error.stack || error.message);
    process.exitCode = 1;
  });
}

module.exports = {
  parseArgs,
  basicBranchDecision,
  completeGitSafetyChecks,
  applyDeletion,
  loadPolicy,
  normalizeLabels,
  runGit,
  remoteHeadSha,
  deleteRemoteBranchWithLease,
};
