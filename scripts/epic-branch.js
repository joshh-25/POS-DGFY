#!/usr/bin/env node
'use strict';

const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { execFileSync } = require('node:child_process');
const { RESERVED_NAME_PATTERN, RESERVED_PREFIXES, parseReservedName } = require('./lib/integration-branch-policy');

const REPO_SLUG = 'Sieitzz/dgfy-platform';
const REPO_ROOT = path.resolve(__dirname, '..');
const MARKER_PREFIX = 'Integration branch:';
const SLUG_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const MAX_SLUG_LENGTH = 40;

function parseArgs(argv) {
  const options = { issueNumber: null, prefix: 'epic', slug: null, dryRun: false, prefixExplicit: false, slugExplicit: false };
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === '--prefix') {
      options.prefix = argv[++index] || '';
      options.prefixExplicit = true;
    } else if (arg === '--slug') {
      options.slug = argv[++index] || '';
      options.slugExplicit = true;
    } else if (arg === '--dry-run') options.dryRun = true;
    else if (arg.startsWith('--')) throw new Error(`Unknown argument: ${arg}`);
    else if (!options.issueNumber) options.issueNumber = arg;
    else throw new Error(`Unexpected argument: ${arg}`);
  }
  if (!/^\d+$/.test(String(options.issueNumber || ''))) throw new Error('Usage: npm run epic:branch -- <issue> [--prefix epic|feature] [--slug s] [--dry-run]');
  options.issueNumber = Number(options.issueNumber);
  if (options.issueNumber < 1) throw new Error('Issue number must be a positive integer.');
  if (!RESERVED_PREFIXES.includes(options.prefix)) throw new Error('--prefix must be epic or feature');
  return options;
}

function slugFromTitle(title) {
  const slug = String(title || '')
    .normalize('NFKD')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, MAX_SLUG_LENGTH)
    .replace(/-+$/g, '');
  if (!SLUG_PATTERN.test(slug)) throw new Error('Issue title does not produce a usable branch slug; pass --slug explicitly.');
  return slug;
}

function validateSlug(value) {
  const slug = String(value || '');
  if (slug.length > MAX_SLUG_LENGTH || !SLUG_PATTERN.test(slug)) {
    throw new Error(`--slug must be lowercase letters, numbers, and single hyphens, at most ${MAX_SLUG_LENGTH} characters.`);
  }
  return slug;
}

function readMarkerLines(comments) {
  const markers = [];
  const malformed = [];
  for (const comment of Array.isArray(comments) ? comments : []) {
    const body = String(typeof comment === 'string' ? comment : comment && comment.body || '');
    for (const line of body.split(/\r?\n/)) {
      if (!line.startsWith(MARKER_PREFIX)) continue;
      const match = /^Integration branch: ((?:epic|feature)\/\d+-[a-z0-9-]+)$/.exec(line);
      const name = match && match[1];
      if (name && parseReservedName(name)) markers.push(name);
      else malformed.push(line);
    }
  }
  return { markers: [...new Set(markers)], malformed };
}

function validateIssue(issue, expectedNumber) {
  if (!issue || issue.pull_request) throw new Error(`Issue #${expectedNumber} could not be found.`);
  if (Number(issue.number) !== expectedNumber) throw new Error(`GitHub returned a mismatched issue for #${expectedNumber}.`);
  if (String(issue.state || '').toLowerCase() !== 'open') throw new Error(`Issue #${expectedNumber} must be open.`);
  const labels = (Array.isArray(issue.labels) ? issue.labels : []).map((label) => (typeof label === 'string' ? label : label && label.name));
  if (!labels.includes('epic')) throw new Error(`Issue #${expectedNumber} must carry the epic label before an integration branch can be registered.`);
}

function hasPullRequestBasePattern(workflowText, prefix) {
  const lines = String(workflowText || '').split(/\r?\n/);
  const start = lines.findIndex((line) => /^  pull_request:\s*$/.test(line));
  if (start < 0) return false;
  let end = lines.length;
  for (let index = start + 1; index < lines.length; index += 1) {
    if (/^\S/.test(lines[index]) || /^  [A-Za-z0-9_-]+:\s*$/.test(lines[index])) {
      end = index;
      break;
    }
  }
  const pullRequestBlock = lines.slice(start + 1, end);
  const branchesIndex = pullRequestBlock.findIndex((line) => /^\s{4}branches:\s*/.test(line));
  if (branchesIndex < 0) return false;
  const branchLine = pullRequestBlock[branchesIndex];
  if (branchLine.includes(`${prefix}/**`)) return true;
  for (let index = branchesIndex + 1; index < pullRequestBlock.length; index += 1) {
    if (/^\s{4}[A-Za-z0-9_-]+:\s*/.test(pullRequestBlock[index])) break;
    if (pullRequestBlock[index].includes(`${prefix}/**`)) return true;
  }
  return false;
}

function assertCiTriggers(workflowByPath) {
  for (const file of ['.github/workflows/pr-checks.yml', '.github/workflows/security-scan.yml']) {
    const content = workflowByPath[file];
    if (typeof content !== 'string') throw new Error(`Could not read ${file} from the fetched develop commit.`);
    for (const prefix of RESERVED_PREFIXES) {
      if (!hasPullRequestBasePattern(content, prefix)) {
        throw new Error(`origin/develop does not yet trigger ${file} for ${prefix}/** bases; merge CI parity first.`);
      }
    }
  }
}

function findRemoteForIssue(remoteBranches, issueNumber) {
  const pattern = new RegExp(`^(?:epic|feature)/${issueNumber}-[a-z0-9-]+$`);
  return (Array.isArray(remoteBranches) ? remoteBranches : [])
    .filter((branch) => pattern.test(branch.name));
}

function executeEpicBranch(options, deps) {
  const issue = deps.getIssue(options.issueNumber);
  validateIssue(issue, options.issueNumber);

  const markerState = readMarkerLines(issue.comments);
  if (markerState.malformed.length > 0) {
    throw new Error(`Issue #${options.issueNumber} has a malformed Integration branch marker: ${markerState.malformed[0]}`);
  }
  if (markerState.markers.length > 1) {
    throw new Error(`Issue #${options.issueNumber} has multiple integration branch markers; resolve the conflict before proceeding.`);
  }

  const markerName = markerState.markers[0] || null;
  if (markerName) {
    const parsed = parseReservedName(markerName);
    if (parsed.issueNumber !== options.issueNumber) throw new Error(`Marker ${markerName} does not point back to issue #${options.issueNumber}.`);
    if (options.prefixExplicit && options.prefix !== parsed.prefix) throw new Error(`Issue #${options.issueNumber} is already registered as ${markerName}.`);
    if (options.slugExplicit && options.slug !== parsed.slug) throw new Error(`Issue #${options.issueNumber} is already registered as ${markerName}.`);
  }

  const generatedSlug = options.slugExplicit ? validateSlug(options.slug) : slugFromTitle(issue.title);
  const requestedName = `${options.prefix}/${options.issueNumber}-${generatedSlug}`;
  if (!RESERVED_NAME_PATTERN.test(requestedName)) throw new Error(`Generated branch name is invalid: ${requestedName}`);
  const branchName = markerName || requestedName;

  const remotes = deps.listRemoteBranches(options.issueNumber);
  const sameIssueRefs = findRemoteForIssue(remotes, options.issueNumber);
  const branchExists = sameIssueRefs.some((branch) => branch.name === branchName);
  const conflictingRefs = sameIssueRefs.filter((branch) => branch.name !== branchName);
  if (conflictingRefs.length > 0) {
    throw new Error(`Issue #${options.issueNumber} already has a live reserved branch: ${conflictingRefs.map((branch) => branch.name).join(', ')}.`);
  }
  if (markerName && branchExists) return { action: 'already-registered', branch: branchName, issueNumber: options.issueNumber };
  if (!markerName && branchExists) throw new Error(`Remote branch ${branchName} exists without its registration marker; refusing to claim it.`);

  const developSha = deps.fetchDevelop();
  if (!developSha || !/^[a-f0-9]{40,64}$/i.test(developSha)) throw new Error('Could not resolve a valid origin/develop commit SHA.');
  assertCiTriggers({
    '.github/workflows/pr-checks.yml': deps.readWorkflow(developSha, '.github/workflows/pr-checks.yml'),
    '.github/workflows/security-scan.yml': deps.readWorkflow(developSha, '.github/workflows/security-scan.yml'),
  });

  if (options.dryRun) {
    return { action: markerName ? 'would-recreate' : 'would-create', branch: branchName, developSha, issueNumber: options.issueNumber };
  }

  deps.pushBranch(developSha, branchName);
  if (!markerName) deps.postMarker(options.issueNumber, branchName);
  return { action: markerName ? 'recreated' : 'created', branch: branchName, developSha, issueNumber: options.issueNumber };
}

function runFile(command, args, options = {}) {
  return execFileSync(command, args, { cwd: options.cwd || REPO_ROOT, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim();
}

function createRuntime({ repoRoot = REPO_ROOT } = {}) {
  return {
    getIssue(issueNumber) {
      const issue = JSON.parse(runFile('gh', ['api', `repos/${REPO_SLUG}/issues/${issueNumber}`], { cwd: repoRoot }));
      if (issue.pull_request) return issue;
      const pages = JSON.parse(runFile('gh', ['api', '--paginate', '--slurp', `repos/${REPO_SLUG}/issues/${issueNumber}/comments?per_page=100`], { cwd: repoRoot }));
      if (!Array.isArray(pages)) throw new Error(`Could not read comments for issue #${issueNumber}.`);
      return { ...issue, comments: pages.flat() };
    },
    listRemoteBranches() {
      const output = runFile('git', ['ls-remote', '--heads', 'origin'], { cwd: repoRoot });
      return output.split(/\r?\n/).filter(Boolean).map((line) => {
        const [sha, ref] = line.split(/\s+/);
        return { sha, name: String(ref || '').replace(/^refs\/heads\//, '') };
      });
    },
    fetchDevelop() {
      runFile('git', ['fetch', '--no-tags', 'origin', '+refs/heads/develop:refs/remotes/origin/develop'], { cwd: repoRoot });
      return runFile('git', ['rev-parse', '--verify', 'origin/develop^{commit}'], { cwd: repoRoot });
    },
    readWorkflow(sha, file) {
      return runFile('git', ['show', `${sha}:${file}`], { cwd: repoRoot });
    },
    pushBranch(sha, name) {
      runFile('git', ['push', 'origin', `${sha}:refs/heads/${name}`], { cwd: repoRoot });
    },
    postMarker(issueNumber, name) {
      const dir = path.join(os.tmpdir(), 'dgfy-epic-branch');
      fs.mkdirSync(dir, { recursive: true });
      const bodyFile = path.join(dir, `${issueNumber}-${name.replace(/[^a-z0-9-]/g, '-')}.md`);
      fs.writeFileSync(bodyFile, `${MARKER_PREFIX} ${name}\n`);
      runFile('gh', ['issue', 'comment', String(issueNumber), '--repo', REPO_SLUG, '--body-file', bodyFile], { cwd: repoRoot });
    },
  };
}

function main() {
  const options = parseArgs(process.argv.slice(2));
  const result = executeEpicBranch(options, createRuntime());
  console.log(`[epic:branch] ${result.action}: ${result.branch} from ${result.developSha || 'existing remote ref'}`);
}

if (require.main === module) {
  try {
    main();
  } catch (error) {
    console.error(`[epic:branch] ${error.message}`);
    process.exitCode = 1;
  }
}

module.exports = {
  parseArgs,
  slugFromTitle,
  validateSlug,
  readMarkerLines,
  validateIssue,
  hasPullRequestBasePattern,
  assertCiTriggers,
  findRemoteForIssue,
  executeEpicBranch,
  createRuntime,
};
