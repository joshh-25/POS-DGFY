#!/usr/bin/env node

const { spawnSync } = require('child_process');
const fs = require('fs');
const path = require('path');

class PromotionError extends Error {
  constructor(message, options = {}) {
    super(message);
    this.name = 'PromotionError';
    this.code = options.code || 'PROMOTION_FAILED';
  }
}

function parseArgs(argv) {
  const options = {
    projectRoot: process.cwd(),
    base: process.env.PROMOTION_BASE || 'master',
    head: process.env.PROMOTION_HEAD || 'staging',
    title: process.env.PROMOTION_PR_TITLE || 'Promote staging to master',
    inventoryMarkdown: process.env.BATCH_INVENTORY_MARKDOWN || '',
    candidateSha: process.env.STAGING_CANDIDATE_SHA || process.env.GITHUB_SHA || '',
    artifactUrl: process.env.STAGING_QUALIFICATION_ARTIFACT_URL || '',
    dryRun: process.env.PROMOTION_DRY_RUN === '1',
  };

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === '--project-root') {
      options.projectRoot = path.resolve(argv[index + 1] || '');
      index += 1;
    } else if (arg === '--base') {
      options.base = argv[index + 1] || '';
      index += 1;
    } else if (arg === '--head') {
      options.head = argv[index + 1] || '';
      index += 1;
    } else if (arg === '--title') {
      options.title = argv[index + 1] || '';
      index += 1;
    } else if (arg === '--inventory-markdown') {
      options.inventoryMarkdown = argv[index + 1] || '';
      index += 1;
    } else if (arg === '--candidate-sha') {
      options.candidateSha = argv[index + 1] || '';
      index += 1;
    } else if (arg === '--artifact-url') {
      options.artifactUrl = argv[index + 1] || '';
      index += 1;
    } else if (arg === '--enable-auto-merge') {
      throw new PromotionError('GitHub auto-merge is prohibited; use the external signed promotion controller', { code: 'AUTO_MERGE_PROHIBITED' });
    } else if (arg === '--dry-run') {
      options.dryRun = true;
    } else {
      throw new PromotionError(`Unknown argument: ${arg}`, { code: 'INVALID_ARGS' });
    }
  }

  return options;
}

function run(command, args, options = {}) {
  const result = spawnSync(command, args, {
    cwd: options.cwd,
    encoding: 'utf8',
    shell: false,
  });
  return {
    ok: result.status === 0,
    status: result.status,
    stdout: result.stdout || '',
    stderr: result.stderr || '',
  };
}

function readInventoryMarkdown(options) {
  if (options.inventoryMarkdown && fs.existsSync(path.resolve(options.projectRoot, options.inventoryMarkdown))) {
    return fs.readFileSync(path.resolve(options.projectRoot, options.inventoryMarkdown), 'utf8');
  }
  return '## Batch Inventory\n\nBatch inventory artifact was not found; promotion must remain blocked until inventory is attached.\n';
}

function verifyHeadRef(options) {
  if (!options.candidateSha) return;
  const result = run('git', ['rev-parse', `origin/${options.head}^{commit}`], {
    cwd: options.projectRoot,
  });
  if (!result.ok) {
    throw new PromotionError(`Could not resolve origin/${options.head}: ${result.stderr.trim() || result.status}`, {
      code: 'HEAD_REF_NOT_FOUND',
    });
  }
  const actual = result.stdout.trim();
  if (actual !== options.candidateSha) {
    throw new PromotionError(`origin/${options.head} changed. expected=${options.candidateSha} actual=${actual}`, {
      code: 'STALE_STAGING_SHA',
    });
  }
}

function buildBody(options) {
  return [
    '## Governed Promotion',
    '',
    `Promotes \`${options.head}\` into \`${options.base}\` after exact-SHA staging qualification.`,
    '',
    `- Staging candidate SHA: \`${options.candidateSha || 'not provided'}\``,
    `- Qualification artifacts: ${options.artifactUrl || 'attach the Staging Qualification artifact link before merge'}`,
    '',
    readInventoryMarkdown(options).trim(),
    '',
    '## Required Evidence',
    '- Staging qualification workflow passed for the exact staging SHA.',
    '- Batch inventory is complete and attached above.',
    '- Included and excluded work are documented per release slice.',
    '- Affected surfaces and risk are declared for each slice.',
    '- Merge-adoption proof is present when required.',
    '- Payment-sensitive changes are blocked unless explicit payment-release approval is recorded.',
    '- QA target proof is distinct from production before automatic deployment is enabled.',
    '- Exact master SHA requalification must pass after this PR merges.',
    '- Deployed-change accuracy review must be produced after production deploy.',
    '- Production deployment remains disabled until branch protection and distinct QA proof are confirmed.',
    '',
    '## Branch Protection Expectations',
    '- Required checks and unresolved conversation blocking must be configured in GitHub settings.',
    '- Auto-merge is allowed only for the promotion automation after required checks pass.',
    '',
    '## Non-Goals',
    '- Does not deploy production by itself.',
    '- Does not use emergency bypass.',
  ].join('\n');
}

function promote(options, logger = console) {
  verifyHeadRef(options);
  const body = buildBody(options);
  const bodyPath = path.join(options.projectRoot, '.tmp', 'release-gates', 'promotion-pr-body.md');
  fs.mkdirSync(path.dirname(bodyPath), { recursive: true });
  fs.writeFileSync(bodyPath, body);

  if (options.dryRun) {
    logger.log(`[promotion] DRY_RUN base=${options.base} head=${options.head} body=${bodyPath}`);
    return { dryRun: true, bodyPath };
  }

  const existing = run('gh', ['pr', 'list', '--base', options.base, '--head', options.head, '--state', 'open', '--json', 'number', '--jq', '.[0].number'], {
    cwd: options.projectRoot,
  });
  if (!existing.ok) {
    throw new PromotionError(`Could not list promotion PRs: ${existing.stderr.trim() || existing.status}`, {
      code: 'GH_PR_LIST_FAILED',
    });
  }

  const prNumber = existing.stdout.trim();
  if (prNumber) {
    const edit = run('gh', ['pr', 'edit', prNumber, '--title', options.title, '--body-file', bodyPath], {
      cwd: options.projectRoot,
    });
    if (!edit.ok) {
      throw new PromotionError(`Could not update promotion PR #${prNumber}: ${edit.stderr.trim() || edit.status}`, {
        code: 'GH_PR_EDIT_FAILED',
      });
    }
    logger.log(`[promotion] Updated PR #${prNumber}`);
    return { prNumber, bodyPath, updated: true };
  }

  const created = run('gh', ['pr', 'create', '--base', options.base, '--head', options.head, '--title', options.title, '--body-file', bodyPath], {
    cwd: options.projectRoot,
  });
  if (!created.ok) {
    throw new PromotionError(`Could not create promotion PR: ${created.stderr.trim() || created.status}`, {
      code: 'GH_PR_CREATE_FAILED',
    });
  }
  logger.log(`[promotion] Created PR ${created.stdout.trim()}`);
  return { url: created.stdout.trim(), bodyPath, created: true };
}

function main() {
  try {
    promote(parseArgs(process.argv.slice(2)));
  } catch (error) {
    if (error instanceof PromotionError) {
      console.error(`[promotion] ${error.code}: ${error.message}`);
      process.exit(1);
    }
    throw error;
  }
}

if (require.main === module) main();

module.exports = {
  PromotionError,
  parseArgs,
  buildBody,
  verifyHeadRef,
  promote,
};
