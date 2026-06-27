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

function buildBody(options) {
  return [
    '## Governed Promotion',
    '',
    `Promotes \`${options.head}\` into \`${options.base}\` after exact-SHA staging qualification.`,
    '',
    readInventoryMarkdown(options).trim(),
    '',
    '## Required Evidence',
    '- Staging qualification workflow passed for the exact staging SHA.',
    '- Batch inventory is complete and attached above.',
    '- Merge-adoption proof is present when required.',
    '- Payment-sensitive changes are blocked unless explicit payment-release approval is recorded.',
    '- Production deployment remains disabled until branch protection and distinct QA proof are confirmed.',
    '',
    '## Non-Goals',
    '- Does not deploy production by itself.',
    '- Does not use emergency bypass.',
  ].join('\n');
}

function promote(options, logger = console) {
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
  promote,
};
