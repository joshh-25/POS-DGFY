#!/usr/bin/env node

const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');

function run(command, args) {
  const result = spawnSync(command, args, { encoding: 'utf8', shell: false });
  if (result.status !== 0) throw new Error((result.stderr || result.stdout || `${command} failed`).trim());
  return result.stdout.trim();
}

function parseArgs(argv) {
  const options = { targetSha: process.env.GITHUB_SHA || '', repository: process.env.GITHUB_REPOSITORY || '', output: '' };
  for (let index = 0; index < argv.length; index += 1) {
    if (argv[index] === '--target-sha') options.targetSha = argv[++index] || '';
    else if (argv[index] === '--repository') options.repository = argv[++index] || '';
    else if (argv[index] === '--output') options.output = argv[++index] || '';
    else throw new Error(`Unknown argument: ${argv[index]}`);
  }
  if (!/^[0-9a-f]{40}$/.test(options.targetSha) || !options.repository || !options.output) throw new Error('--target-sha, --repository, and --output are required');
  return options;
}

function collect(options) {
  const parents = run('git', ['show', '-s', '--format=%P', options.targetSha]).split(/\s+/).filter(Boolean);
  const pulls = JSON.parse(run('gh', ['api', '-H', 'Accept: application/vnd.github+json', `repos/${options.repository}/commits/${options.targetSha}/pulls`]));
  const pr = pulls.find((item) => item.merged_at && item.base?.ref === 'master' && item.head?.ref === 'staging');
  const stagingParent = parents[1] || '';
  const tags = stagingParent ? run('git', ['tag', '--list', `release-authorization/promotion/${stagingParent}/*`, '--points-at', stagingParent]).split(/\r?\n/).filter(Boolean) : [];
  return {
    repository: options.repository,
    number: pr?.number || null,
    merged: Boolean(pr?.merged_at),
    base: pr?.base?.ref || null,
    head: pr?.head?.ref || null,
    head_sha: pr?.head?.sha || null,
    merge_commit_sha: pr?.merge_commit_sha || null,
    promotion_authorization: { status: tags.length === 1 ? 'present' : 'missing_or_ambiguous', tag: tags.length === 1 ? tags[0] : null },
    inventory: { review_status: 'reviewed', sha256: process.env.BATCH_INVENTORY_SHA256 || '' },
  };
}

function main() {
  try {
    const options = parseArgs(process.argv.slice(2));
    const evidence = collect(options);
    fs.mkdirSync(path.dirname(path.resolve(options.output)), { recursive: true });
    fs.writeFileSync(options.output, `${JSON.stringify(evidence, null, 2)}\n`);
    console.log(`[master-promotion-evidence] pr=${evidence.number || 'missing'} tag=${evidence.promotion_authorization.tag || 'missing'}`);
  } catch (error) {
    console.error(`[master-promotion-evidence] ${error.message}`);
    process.exit(1);
  }
}

if (require.main === module) main();

module.exports = { parseArgs, collect };
