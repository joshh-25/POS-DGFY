#!/usr/bin/env node

const { spawnSync } = require('child_process');
const fs = require('fs');
const path = require('path');

class DeploySourceContractError extends Error {
  constructor(message, options = {}) {
    super(message);
    this.name = 'DeploySourceContractError';
    this.code = options.code || 'DEPLOY_SOURCE_CONTRACT_FAILED';
    this.report = options.report || null;
  }
}

function parseArgs(argv) {
  const options = {
    projectRoot: process.cwd(),
    targetSha: process.env.RELEASE_TARGET_SHA || process.env.DEPLOY_TARGET_SHA || '',
    remoteRef: process.env.DEPLOY_REMOTE_REF || 'origin/master',
    requireRemoteMatch: process.env.DEPLOY_REQUIRE_REMOTE_MATCH === '1',
    requireClean: process.env.DEPLOY_REQUIRE_CLEAN_WORKTREE !== '0',
    reportPath: process.env.DEPLOY_SOURCE_CONTRACT_REPORT || '',
  };

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === '--project-root') {
      options.projectRoot = path.resolve(argv[index + 1] || '');
      index += 1;
    } else if (arg === '--target-sha') {
      options.targetSha = argv[index + 1] || '';
      index += 1;
    } else if (arg === '--remote-ref') {
      options.remoteRef = argv[index + 1] || '';
      index += 1;
    } else if (arg === '--require-remote-match') {
      options.requireRemoteMatch = true;
    } else if (arg === '--skip-remote-match') {
      options.requireRemoteMatch = false;
    } else if (arg === '--allow-dirty') {
      options.requireClean = false;
    } else if (arg === '--report') {
      options.reportPath = argv[index + 1] || '';
      index += 1;
    } else {
      throw new DeploySourceContractError(`Unknown argument: ${arg}`, { code: 'INVALID_ARGS' });
    }
  }

  if (!options.projectRoot) {
    throw new DeploySourceContractError('Missing value for --project-root', { code: 'INVALID_ARGS' });
  }

  return options;
}

function runGit(projectRoot, args) {
  const result = spawnSync('git', args, {
    cwd: projectRoot,
    encoding: 'utf8',
  });

  return {
    ok: result.status === 0,
    stdout: result.stdout || '',
    stderr: result.stderr || '',
    status: result.status,
  };
}

function revParse(projectRoot, ref) {
  const result = runGit(projectRoot, ['rev-parse', '--verify', `${ref}^{commit}`]);
  if (!result.ok) return '';
  return result.stdout.trim().toLowerCase();
}

function shortSha(sha) {
  return sha ? sha.slice(0, 12) : '<missing>';
}

function collectStatus(projectRoot) {
  const result = runGit(projectRoot, ['status', '--porcelain']);
  if (!result.ok) {
    throw new DeploySourceContractError(`Could not inspect git status: ${result.stderr.trim() || result.status}`, {
      code: 'GIT_STATUS_FAILED',
    });
  }
  return result.stdout.split(/\r?\n/).filter(Boolean);
}

function writeReport(reportPath, report) {
  if (!reportPath) return;
  fs.mkdirSync(path.dirname(path.resolve(reportPath)), { recursive: true });
  fs.writeFileSync(reportPath, JSON.stringify(report, null, 2));
}

function checkDeploySourceContract(options, logger = console) {
  const projectRoot = path.resolve(options.projectRoot);
  const statusLines = collectStatus(projectRoot);
  const headSha = revParse(projectRoot, 'HEAD');
  const targetSha = (options.targetSha || headSha).toLowerCase();
  const remoteSha = options.remoteRef ? revParse(projectRoot, options.remoteRef) : '';

  const report = {
    generated_at: new Date().toISOString(),
    project_root: projectRoot,
    target_sha: targetSha,
    head_sha: headSha,
    remote_ref: options.remoteRef || null,
    remote_sha: remoteSha || null,
    require_clean_worktree: options.requireClean,
    require_remote_match: options.requireRemoteMatch,
    dirty_files: statusLines,
    ok: true,
    failures: [],
  };

  if (!headSha) {
    report.ok = false;
    report.failures.push('HEAD could not be resolved.');
  }

  if (targetSha && headSha && targetSha !== headSha) {
    report.ok = false;
    report.failures.push(`HEAD ${shortSha(headSha)} does not match target ${shortSha(targetSha)}.`);
  }

  if (options.requireClean && statusLines.length > 0) {
    report.ok = false;
    report.failures.push(
      `Working tree is dirty. Commit or stash these files before production deploy: ${statusLines.join(', ')}`
    );
  }

  if (options.requireRemoteMatch) {
    if (!remoteSha) {
      report.ok = false;
      report.failures.push(`Remote ref could not be resolved: ${options.remoteRef}`);
    } else if (targetSha && remoteSha !== targetSha) {
      report.ok = false;
      report.failures.push(`Remote ${options.remoteRef} ${shortSha(remoteSha)} does not match target ${shortSha(targetSha)}.`);
    }
  }

  writeReport(options.reportPath, report);

  if (!report.ok) {
    throw new DeploySourceContractError(report.failures.join('\n'), {
      code: 'SOURCE_CONTRACT_FAILED',
      report,
    });
  }

  logger.log(
    `[deploy-source-contract] PASS target=${shortSha(targetSha)} head=${shortSha(headSha)} remote=${shortSha(remoteSha)} dirty_files=${statusLines.length}`
  );
  return report;
}

function main() {
  try {
    const options = parseArgs(process.argv.slice(2));
    checkDeploySourceContract(options);
  } catch (error) {
    if (error instanceof DeploySourceContractError) {
      console.error(`[deploy-source-contract] ${error.code}: ${error.message}`);
      process.exit(1);
    }
    throw error;
  }
}

if (require.main === module) {
  main();
}

module.exports = {
  DeploySourceContractError,
  parseArgs,
  checkDeploySourceContract,
  collectStatus,
  revParse,
};
