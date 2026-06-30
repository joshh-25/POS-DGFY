const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawnSync } = require('child_process');

const {
  basicBranchDecision,
  completeGitSafetyChecks,
  applyDeletion,
  runGit,
} = require('./review-merged-branch-cleanup');

const policy = {
  allowedBaseBranches: ['staging', 'master'],
  eligibleHeadPrefixes: ['codex/', 'feature/', 'fix/'],
  protectedBranches: ['master', 'staging', 'development', 'codex/storefront-pilot-on-master'],
  protectedHeadPrefixes: ['release/', 'payment/', 'codex/paymongo-'],
  keepLabels: ['branch-cleanup:keep'],
  approvalLabels: ['branch-cleanup:approved'],
  requireApprovalLabel: false,
  deleteRemote: 'origin',
};

function pr(overrides = {}) {
  return {
    number: 42,
    state: 'closed',
    merged_at: '2026-06-30T00:00:00Z',
    merge_commit_sha: 'merge-sha',
    labels: [],
    base: {
      ref: 'staging',
      repo: { full_name: 'BBLabs-Albert/SKU-Inventory-Manager' },
    },
    head: {
      ref: 'codex/example',
      sha: 'head-sha',
      repo: { full_name: 'BBLabs-Albert/SKU-Inventory-Manager' },
    },
    ...overrides,
  };
}

function decisionFor(inputPr, openPulls = []) {
  return basicBranchDecision(inputPr, openPulls, policy);
}

function git(cwd, args) {
  const result = spawnSync('git', args, { cwd, encoding: 'utf8', shell: false });
  if (result.status !== 0) {
    throw new Error(`git ${args.join(' ')} failed\n${result.stdout}\n${result.stderr}`);
  }
  return result.stdout.trim();
}

function makeRepo() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'sku-branch-cleanup-'));
  const remote = path.join(root, 'remote.git');
  const work = path.join(root, 'work');
  git(root, ['init', '--bare', remote]);
  git(root, ['clone', remote, work]);
  git(work, ['config', 'user.email', 'codex@example.test']);
  git(work, ['config', 'user.name', 'Codex Test']);
  fs.writeFileSync(path.join(work, 'README.md'), 'base\n');
  git(work, ['add', 'README.md']);
  git(work, ['commit', '-m', 'base']);
  git(work, ['branch', '-M', 'staging']);
  git(work, ['push', 'origin', 'staging']);
  git(work, ['switch', '-c', 'codex/example']);
  fs.writeFileSync(path.join(work, 'feature.txt'), 'feature\n');
  git(work, ['add', 'feature.txt']);
  git(work, ['commit', '-m', 'feature']);
  const headSha = git(work, ['rev-parse', 'HEAD']);
  git(work, ['push', 'origin', 'codex/example']);
  git(work, ['switch', 'staging']);
  git(work, ['merge', '--no-ff', 'codex/example', '-m', 'merge feature']);
  const mergeCommitSha = git(work, ['rev-parse', 'HEAD']);
  git(work, ['push', 'origin', 'staging']);
  return { root, remote, work, headSha, mergeCommitSha };
}

function run(name, fn) {
  try {
    fn();
    console.log(`ok - ${name}`);
  } catch (error) {
    console.error(`not ok - ${name}`);
    console.error(error.stack || error.message);
    process.exitCode = 1;
  }
}

run('closed but unmerged PR is preserved', () => {
  const decision = decisionFor(pr({ merged_at: null }));
  assert.strictEqual(decision.status, 'preserved');
  assert.strictEqual(decision.reason, 'pull_request_not_merged');
});

run('base outside staging/master is preserved', () => {
  const decision = decisionFor(pr({ base: { ref: 'development', repo: { full_name: 'BBLabs-Albert/SKU-Inventory-Manager' } } }));
  assert.strictEqual(decision.reason, 'base_branch_not_allowed');
});

run('protected exact branch is preserved', () => {
  const decision = decisionFor(pr({ head: { ref: 'staging', sha: 'abc', repo: { full_name: 'BBLabs-Albert/SKU-Inventory-Manager' } } }));
  assert.strictEqual(decision.reason, 'protected_branch_exact_match');
});

run('protected prefix is preserved', () => {
  const decision = decisionFor(pr({ head: { ref: 'payment/live-work', sha: 'abc', repo: { full_name: 'BBLabs-Albert/SKU-Inventory-Manager' } } }));
  assert.strictEqual(decision.reason, 'protected_branch_prefix');
});

run('keep label is preserved', () => {
  const decision = decisionFor(pr({ labels: [{ name: 'branch-cleanup:keep' }] }));
  assert.strictEqual(decision.reason, 'keep_label_present');
});

run('fork PR is preserved', () => {
  const decision = decisionFor(pr({ head: { ref: 'codex/example', sha: 'abc', repo: { full_name: 'fork/SKU-Inventory-Manager' } } }));
  assert.strictEqual(decision.reason, 'cross_repository_or_unknown_head');
});

run('branch used by another open PR is preserved', () => {
  const decision = decisionFor(pr(), [
    { number: 99, head: { ref: 'other' }, base: { ref: 'codex/example' } },
  ]);
  assert.strictEqual(decision.reason, 'branch_used_by_open_pull_request');
});

run('eligible branch passes policy checks', () => {
  const decision = decisionFor(pr());
  assert.strictEqual(decision.status, 'eligible');
});

run('dry-run does not delete eligible branch', () => {
  const repo = makeRepo();
  const input = pr({
    merge_commit_sha: repo.mergeCommitSha,
    head: {
      ref: 'codex/example',
      sha: repo.headSha,
      repo: { full_name: 'BBLabs-Albert/SKU-Inventory-Manager' },
    },
  });
  const previous = process.cwd();
  process.chdir(repo.work);
  try {
    const checked = completeGitSafetyChecks(decisionFor(input), policy);
    const finalDecision = applyDeletion(checked, { dryRun: true, deleteApproved: false });
    assert.strictEqual(finalDecision.status, 'eligible');
    const lsRemote = runGit(['ls-remote', '--heads', 'origin', 'codex/example'], { cwd: repo.work });
    assert.match(lsRemote.stdout, /refs\/heads\/codex\/example/);
  } finally {
    process.chdir(previous);
  }
});

run('delete-approved removes branch with matching SHA lease', () => {
  const repo = makeRepo();
  const input = pr({
    merge_commit_sha: repo.mergeCommitSha,
    head: {
      ref: 'codex/example',
      sha: repo.headSha,
      repo: { full_name: 'BBLabs-Albert/SKU-Inventory-Manager' },
    },
  });
  const previous = process.cwd();
  process.chdir(repo.work);
  try {
    const checked = completeGitSafetyChecks(decisionFor(input), policy);
    const finalDecision = applyDeletion(checked, { dryRun: false, deleteApproved: true });
    assert.strictEqual(finalDecision.status, 'deleted');
    const lsRemote = runGit(['ls-remote', '--heads', 'origin', 'codex/example'], { cwd: repo.work });
    assert.strictEqual(lsRemote.stdout.trim(), '');
  } finally {
    process.chdir(previous);
  }
});

run('moved remote branch is blocked before deletion', () => {
  const repo = makeRepo();
  git(repo.work, ['switch', 'codex/example']);
  fs.writeFileSync(path.join(repo.work, 'feature.txt'), 'moved\n');
  git(repo.work, ['add', 'feature.txt']);
  git(repo.work, ['commit', '-m', 'move branch']);
  git(repo.work, ['push', 'origin', 'codex/example']);

  const input = pr({
    merge_commit_sha: repo.mergeCommitSha,
    head: {
      ref: 'codex/example',
      sha: repo.headSha,
      repo: { full_name: 'BBLabs-Albert/SKU-Inventory-Manager' },
    },
  });
  const previous = process.cwd();
  process.chdir(repo.work);
  try {
    const checked = completeGitSafetyChecks(decisionFor(input), policy);
    assert.strictEqual(checked.status, 'blocked');
    assert.strictEqual(checked.reason, 'remote_branch_moved_after_merge');
  } finally {
    process.chdir(previous);
  }
});

run('merge commit not reachable from base is blocked', () => {
  const repo = makeRepo();
  git(repo.work, ['switch', '--orphan', 'staging-replacement']);
  fs.writeFileSync(path.join(repo.work, 'replacement.txt'), 'replacement\n');
  git(repo.work, ['add', '.']);
  git(repo.work, ['commit', '-m', 'replace staging']);
  git(repo.work, ['push', '--force', 'origin', 'staging-replacement:staging']);

  const input = pr({
    merge_commit_sha: repo.mergeCommitSha,
    head: {
      ref: 'codex/example',
      sha: repo.headSha,
      repo: { full_name: 'BBLabs-Albert/SKU-Inventory-Manager' },
    },
  });
  const previous = process.cwd();
  process.chdir(repo.work);
  try {
    const checked = completeGitSafetyChecks(decisionFor(input), policy);
    assert.strictEqual(checked.status, 'blocked');
    assert.strictEqual(checked.reason, 'merge_commit_not_reachable_from_base');
  } finally {
    process.chdir(previous);
  }
});
