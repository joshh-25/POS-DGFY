#!/usr/bin/env node
'use strict';

const { spawnSync } = require('node:child_process');
const path = require('node:path');
const {
  RESERVED_NAME_PATTERN,
  RESERVATION_CHECK_BLOCKING,
  FIRST_INTEGRATION_MERGE_RECORDED,
  STALENESS_WARNING_DAYS,
  isReservedName,
  parseReservedName,
} = require('./lib/integration-branch-policy');

const REPO_SLUG = 'Sieitzz/dgfy-platform';
const REPO_ROOT = path.resolve(__dirname, '..');
const DAY_MS = 24 * 60 * 60 * 1000;

const BLOCKING_CODES = new Set([
  'nested-integration-branch',
  'malformed-reserved-name',
  'epic-lookup-failed',
  'epic-not-open',
  'issue-not-epic',
  'registration-marker-missing',
  'final-behind-by-unavailable',
  'final-branch-behind-develop',
  'develop-sync-unverified',
  'definition-of-done-missing',
  'definition-of-done-incomplete',
  'dev-soak-evidence-missing',
  'dev-soak-run-unavailable',
  'dev-soak-run-not-deploy',
  'dev-soak-run-not-successful',
  'dev-soak-sha-missing',
  'dev-soak-sha-not-ancestor',
  'dev-soak-branch-changed-after-run',
  'merge-hygiene-failed',
  'open-child-pull-requests',
  'open-pull-requests-unavailable',
]);

function severityFor(code, blocking = RESERVATION_CHECK_BLOCKING) {
  return BLOCKING_CODES.has(code) && blocking ? 'blocker' : 'warning';
}

function addFinding(findings, code, message, blocking = RESERVATION_CHECK_BLOCKING) {
  findings.push({ code, severity: severityFor(code, blocking), message });
}

function normalizeLabels(labels) {
  return (Array.isArray(labels) ? labels : [])
    .map((label) => (typeof label === 'string' ? label : label && label.name))
    .filter(Boolean);
}

function markerIsPresent(comments, name) {
  const expected = `Integration branch: ${name}`;
  return (Array.isArray(comments) ? comments : []).some((comment) => (
    String(typeof comment === 'string' ? comment : comment && comment.body || '')
      .split(/\r?\n/)
      .some((line) => line === expected)
  ));
}

function verifyRegistration(name, lookups = {}) {
  const parsed = parseReservedName(name);
  if (!parsed) {
    return { ok: false, code: 'malformed-reserved-name', message: `Reserved branch "${name}" must match ${RESERVED_NAME_PATTERN}.` };
  }
  if (typeof lookups.getIssue !== 'function') {
    return { ok: false, code: 'epic-lookup-failed', message: `Cannot verify registration for ${name}: issue lookup is unavailable.` };
  }
  const issue = lookups.getIssue(parsed.issueNumber);
  if (!issue) {
    return { ok: false, code: 'epic-lookup-failed', message: `Cannot verify registration for ${name}: issue #${parsed.issueNumber} could not be read.` };
  }
  if (String(issue.state || '').toLowerCase() !== 'open') {
    return { ok: false, code: 'epic-not-open', message: `Integration branch ${name} requires open epic issue #${parsed.issueNumber}.`, parsed, issue };
  }
  if (!normalizeLabels(issue.labels).includes('epic')) {
    return { ok: false, code: 'issue-not-epic', message: `Issue #${parsed.issueNumber} for ${name} must carry the epic label.`, parsed, issue };
  }
  if (!markerIsPresent(issue.comments, name)) {
    return { ok: false, code: 'registration-marker-missing', message: `Issue #${parsed.issueNumber} must contain the exact comment line "Integration branch: ${name}".`, parsed, issue };
  }
  return { ok: true, parsed, issue };
}

function classifyPr({ base, head, isDraft = false, lookups = {}, blocking = RESERVATION_CHECK_BLOCKING } = {}) {
  const baseName = String(base || '').trim();
  const headName = String(head || '').trim();
  const findings = [];
  let kind = 'ordinary';
  let registration = null;

  const baseReserved = isReservedName(baseName);
  const headReserved = isReservedName(headName);

  if (baseReserved && headReserved) {
    kind = 'blocked';
    addFinding(findings, 'nested-integration-branch', 'A reserved integration branch cannot target another reserved integration branch.', blocking);
  } else if (baseReserved) {
    kind = 'child';
    registration = verifyRegistration(baseName, lookups);
    if (!registration.ok) {
      kind = 'blocked';
      addFinding(findings, registration.code, registration.message, blocking);
    } else if (typeof lookups.getStalenessDays === 'function') {
      const daysBehind = lookups.getStalenessDays(baseName);
      if (Number.isFinite(daysBehind) && daysBehind > STALENESS_WARNING_DAYS) {
        addFinding(findings, 'integration-branch-stale', `${baseName} has been behind develop for ${Math.floor(daysBehind)} days; sync at least weekly and before the final PR.`);
      } else if (!Number.isFinite(daysBehind)) {
        addFinding(findings, 'integration-staleness-unavailable', `Could not measure how long ${baseName} has been behind develop.`);
      }
    }
  } else if (headReserved && baseName === 'develop') {
    kind = 'final';
    registration = verifyRegistration(headName, lookups);
    if (!registration.ok) {
      kind = 'blocked';
      addFinding(findings, registration.code, registration.message, blocking);
    } else if (!isDraft) {
      if (typeof lookups.getBehindBy !== 'function') {
        addFinding(findings, 'final-behind-by-unavailable', `Cannot verify that ${headName} is current with develop.`, blocking);
      } else {
        const behindBy = lookups.getBehindBy(headName);
        if (!Number.isInteger(behindBy) || behindBy < 0) {
          addFinding(findings, 'final-behind-by-unavailable', `Cannot verify that ${headName} is current with develop.`, blocking);
        } else if (behindBy > 0) {
          addFinding(findings, 'final-branch-behind-develop', `Final integration branch ${headName} is ${behindBy} commit(s) behind develop; sync it before marking the PR ready.`, blocking);
        }
      }
    }
  }

  const hasBlockingFinding = findings.some((finding) => BLOCKING_CODES.has(finding.code));
  return {
    kind,
    findings,
    autoMergeAllowed: kind === 'final'
      && FIRST_INTEGRATION_MERGE_RECORDED
      && !isDraft
      && !hasBlockingFinding,
  };
}

function extractMarkdownSection(markdown, heading) {
  const lines = String(markdown || '').split(/\r?\n/);
  const headingIndex = lines.findIndex((line) => line.trim().toLowerCase() === `## ${heading}`.toLowerCase());
  if (headingIndex < 0) return '';
  const endIndex = lines.slice(headingIndex + 1).findIndex((line) => /^##\s/.test(line.trim()));
  return lines.slice(headingIndex + 1, endIndex < 0 ? undefined : headingIndex + 1 + endIndex).join('\n');
}

function definitionOfDoneState(body) {
  const section = extractMarkdownSection(body, 'Definition of done');
  if (!section) return 'missing';
  const items = [...section.matchAll(/^\s*[-*]\s+\[([ xX])\]\s+.+$/gm)];
  if (items.length === 0) return 'missing';
  return items.every((item) => item[1].toLowerCase() === 'x') ? 'complete' : 'incomplete';
}

function checkDevSoak({ branch, headSha, prBody, lookups = {}, blocking = RESERVATION_CHECK_BLOCKING } = {}) {
  const findings = [];
  const section = extractMarkdownSection(prBody, 'DEV soak evidence');
  const runMatch = section.match(/https:\/\/github\.com\/Sieitzz\/dgfy-platform\/actions\/runs\/(\d+)/);
  if (!section || !/\bDEV\b/i.test(section) || !/deploy\.yml/i.test(section) || !runMatch) {
    addFinding(findings, 'dev-soak-evidence-missing', 'The PR body needs a ## DEV soak evidence section naming a successful deploy.yml DEV run URL.', blocking);
    return findings;
  }
  if (typeof lookups.getWorkflowRun !== 'function') {
    addFinding(findings, 'dev-soak-run-unavailable', 'The linked DEV deploy run could not be verified.', blocking);
    return findings;
  }
  const run = lookups.getWorkflowRun(runMatch[1]);
  if (!run) {
    addFinding(findings, 'dev-soak-run-unavailable', `GitHub Actions run ${runMatch[1]} could not be read.`, blocking);
    return findings;
  }
  if (!String(run.path || '').endsWith('/deploy.yml') && run.path !== 'deploy.yml') {
    addFinding(findings, 'dev-soak-run-not-deploy', `Run ${runMatch[1]} is not from .github/workflows/deploy.yml.`, blocking);
    return findings;
  }
  if (String(run.conclusion || '').toLowerCase() !== 'success' || String(run.event || '').toLowerCase() !== 'workflow_dispatch') {
    addFinding(findings, 'dev-soak-run-not-successful', `Run ${runMatch[1]} must be a successful manual deploy.yml run.`, blocking);
    return findings;
  }
  const soakSha = run.headSha || run.head_sha;
  if (!soakSha) {
    addFinding(findings, 'dev-soak-sha-missing', `Run ${runMatch[1]} has no head SHA to bind the DEV soak to ${branch}.`, blocking);
    return findings;
  }
  if (typeof lookups.isAncestor !== 'function' || !lookups.isAncestor(soakSha, headSha)) {
    addFinding(findings, 'dev-soak-sha-not-ancestor', `DEV soak SHA ${soakSha} is not an ancestor of the final PR head.`, blocking);
    return findings;
  }
  if (typeof lookups.getFirstParentCommitsAfter !== 'function') {
    addFinding(findings, 'dev-soak-branch-changed-after-run', 'The branch history after the DEV soak could not be verified.', blocking);
    return findings;
  }
  const commits = lookups.getFirstParentCommitsAfter(soakSha, headSha);
  if (!Array.isArray(commits)) {
    addFinding(findings, 'dev-soak-branch-changed-after-run', 'The branch history after the DEV soak could not be verified.', blocking);
    return findings;
  }
  for (const commit of commits) {
    const secondParent = Array.isArray(commit.parents) && commit.parents.length === 2 ? commit.parents[1] : null;
    if (!secondParent || typeof lookups.isAncestor !== 'function' || !lookups.isAncestor(secondParent, 'origin/develop')) {
      addFinding(findings, 'dev-soak-branch-changed-after-run', `Commit ${commit.sha} landed after the DEV soak and is not a develop sync merge.`, blocking);
      break;
    }
  }
  return findings;
}

function evaluateReadiness({ branch, headSha, issue, prBody, lookups = {}, blocking = RESERVATION_CHECK_BLOCKING } = {}) {
  const findings = [];
  if (typeof lookups.isAncestor !== 'function' || !lookups.isAncestor('origin/develop', headSha)) {
    addFinding(findings, 'develop-sync-unverified', `Final branch ${branch} must include the current origin/develop tip.`, blocking);
  }

  const dod = definitionOfDoneState(issue && issue.body);
  if (dod === 'missing') {
    addFinding(findings, 'definition-of-done-missing', 'The linked epic needs at least one checklist item under ## Definition of done.', blocking);
  } else if (dod === 'incomplete') {
    addFinding(findings, 'definition-of-done-incomplete', 'Every checklist item under the linked epic’s ## Definition of done must be checked.', blocking);
  }

  findings.push(...checkDevSoak({ branch, headSha, prBody, lookups, blocking }));

  if (typeof lookups.checkMergeHygiene !== 'function') {
    addFinding(findings, 'merge-hygiene-failed', 'Merge hygiene could not be run for the final integration branch.', blocking);
  } else if (!lookups.checkMergeHygiene(branch, headSha)) {
    addFinding(findings, 'merge-hygiene-failed', 'npm run check:merge-hygiene did not pass for the final integration branch.', blocking);
  }

  if (typeof lookups.getOpenPullRequestsForBase !== 'function') {
    addFinding(findings, 'open-pull-requests-unavailable', `Could not verify whether open PRs still target ${branch}.`, blocking);
  } else {
    const openPullRequests = lookups.getOpenPullRequestsForBase(branch);
    if (!Array.isArray(openPullRequests)) {
      addFinding(findings, 'open-pull-requests-unavailable', `Could not verify whether open PRs still target ${branch}.`, blocking);
    } else if (openPullRequests.length > 0) {
      const numbers = openPullRequests.map((pr) => `#${pr.number}`).join(', ');
      addFinding(findings, 'open-child-pull-requests', `Close or retarget open PR(s) based on ${branch} before the merge: ${numbers}.`, blocking);
    }
  }
  return findings;
}

function hasBlockingFindings(result) {
  return result.findings.some((finding) => BLOCKING_CODES.has(finding.code));
}

function exitCodeForResult(result, blocking = RESERVATION_CHECK_BLOCKING) {
  return blocking && hasBlockingFindings(result) ? 1 : 0;
}

function run(command, args, { cwd = REPO_ROOT, maxBuffer = 8 * 1024 * 1024 } = {}) {
  const result = spawnSync(command, args, { cwd, encoding: 'utf8', maxBuffer });
  return { ok: result.status === 0, status: result.status, stdout: result.stdout || '', stderr: result.stderr || '' };
}

function parseJsonCommand(command, args, options = {}) {
  const result = run(command, args, options);
  if (!result.ok) return null;
  try {
    return JSON.parse(result.stdout);
  } catch {
    return null;
  }
}

function createGithubLookups({ repoRoot = REPO_ROOT, now = () => Date.now() } = {}) {
  const ghJson = (args) => parseJsonCommand('gh', args, { cwd: repoRoot });
  const getIssue = (issueNumber) => {
    const issue = ghJson(['api', `repos/${REPO_SLUG}/issues/${issueNumber}`]);
    if (!issue || issue.pull_request) return null;
    const pages = ghJson(['api', '--paginate', '--slurp', `repos/${REPO_SLUG}/issues/${issueNumber}/comments?per_page=100`]);
    if (!Array.isArray(pages)) return null;
    return { ...issue, comments: pages.flat() };
  };
  const getComparison = (base, head) => ghJson([
    'api', `repos/${REPO_SLUG}/compare/${encodeURIComponent(base)}...${encodeURIComponent(head)}`,
  ]);
  return {
    getIssue,
    getStalenessDays(branch) {
      const comparison = getComparison(branch, 'develop');
      if (!comparison || comparison.ahead_by === 0) return comparison ? 0 : null;
      const firstMissing = Array.isArray(comparison.commits) && comparison.commits[0];
      const date = firstMissing && firstMissing.commit && firstMissing.commit.committer && firstMissing.commit.committer.date;
      const timestamp = Date.parse(date || '');
      return Number.isFinite(timestamp) ? (now() - timestamp) / DAY_MS : null;
    },
    getBehindBy(branch) {
      const comparison = getComparison('develop', branch);
      return comparison && Number.isInteger(comparison.behind_by) ? comparison.behind_by : null;
    },
    getWorkflowRun(runId) {
      const runData = ghJson(['api', `repos/${REPO_SLUG}/actions/runs/${runId}`]);
      if (!runData) return null;
      return {
        path: runData.path,
        conclusion: runData.conclusion,
        event: runData.event,
        headSha: runData.head_sha,
        headBranch: runData.head_branch,
      };
    },
    isAncestor(ancestor, descendant) {
      return run('git', ['merge-base', '--is-ancestor', ancestor, descendant], { cwd: repoRoot }).status === 0;
    },
    getFirstParentCommitsAfter(ancestor, descendant) {
      const history = run('git', ['rev-list', '--first-parent', '--reverse', `${ancestor}..${descendant}`], { cwd: repoRoot });
      if (!history.ok) return null;
      const commits = history.stdout.split(/\r?\n/).filter(Boolean);
      return commits.map((sha) => {
        const parents = run('git', ['rev-list', '--parents', '-n', '1', sha], { cwd: repoRoot });
        if (!parents.ok) return { sha, parents: [] };
        return { sha, parents: parents.stdout.trim().split(/\s+/).slice(1) };
      });
    },
    checkMergeHygiene(branch, headSha) {
      const result = run('npm', ['run', 'check:merge-hygiene', '--', '--base', 'origin/develop', '--head', headSha || 'HEAD'], { cwd: repoRoot });
      return result.ok;
    },
    getOpenPullRequestsForBase(branch) {
      const result = parseJsonCommand('gh', ['pr', 'list', '--state', 'open', '--base', branch, '--json', 'number,headRefName', '--limit', '1000'], { cwd: repoRoot });
      return Array.isArray(result) ? result : null;
    },
  };
}

function parseArgs(argv) {
  const options = { pr: null, base: null, head: null, json: false, readiness: false };
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === '--pr') options.pr = argv[++index] || null;
    else if (arg === '--base') options.base = argv[++index] || null;
    else if (arg === '--head') options.head = argv[++index] || null;
    else if (arg === '--json') options.json = true;
    else if (arg === '--readiness') options.readiness = true;
    else throw new Error(`Unknown argument: ${arg}`);
  }
  return options;
}

function readPullRequest(prNumber, repoRoot = REPO_ROOT) {
  return parseJsonCommand('gh', ['pr', 'view', String(prNumber), '--json', 'number,baseRefName,headRefName,isDraft,body,headRefOid'], { cwd: repoRoot });
}

function readEventPullRequest() {
  const eventPath = process.env.GITHUB_EVENT_PATH;
  if (!eventPath) return null;
  try {
    // The event payload is written by Actions, not user input.
    return require('node:fs').readFileSync(eventPath, 'utf8');
  } catch {
    return null;
  }
}

function resolveContext(options, repoRoot = REPO_ROOT) {
  let pr = options.pr ? readPullRequest(options.pr, repoRoot) : null;
  if (!pr && !options.pr && !(options.base && options.head) && !process.env.GITHUB_BASE_REF) {
    const current = parseJsonCommand('gh', ['pr', 'view', '--json', 'number,baseRefName,headRefName,isDraft,body,headRefOid'], { cwd: repoRoot });
    pr = current;
  }
  let event = null;
  if (!pr) {
    const rawEvent = readEventPullRequest();
    try { event = rawEvent ? JSON.parse(rawEvent).pull_request : null; } catch { event = null; }
  }
  const base = options.base || (pr && pr.baseRefName) || process.env.GITHUB_BASE_REF || null;
  const head = options.head || (pr && pr.headRefName) || process.env.GITHUB_HEAD_REF || null;
  if (!base || !head) throw new Error('Provide --pr N, --base B --head H, or run in a pull_request workflow context.');
  return {
    base,
    head,
    isDraft: pr ? Boolean(pr.isDraft) : (process.env.INTEGRATION_PR_DRAFT === 'true' || Boolean(event && event.draft)),
    prBody: (pr && pr.body) || (event && event.body) || '',
    headSha: (pr && pr.headRefOid) || 'HEAD',
  };
}

function checkIntegrationBranch({ base, head, isDraft, readiness = false, headSha = 'HEAD', prBody = '', lookups = {}, blocking = RESERVATION_CHECK_BLOCKING } = {}) {
  const result = classifyPr({ base, head, isDraft, lookups, blocking });
  if (readiness && result.kind === 'final') {
    const registration = verifyRegistration(head, lookups);
    if (!registration.ok) return result;
    result.findings.push(...evaluateReadiness({
      branch: head,
      headSha,
      issue: registration.issue,
      prBody,
      lookups,
      blocking,
    }));
  }
  result.autoMergeAllowed = result.kind === 'final'
    && FIRST_INTEGRATION_MERGE_RECORDED
    && !isDraft
    && !hasBlockingFindings(result);
  return result;
}

function renderHuman(result) {
  const lines = [`[check-integration-branch] kind=${result.kind} autoMergeAllowed=${result.autoMergeAllowed}`];
  if (result.findings.length === 0) lines.push('[check-integration-branch] no findings');
  for (const finding of result.findings) {
    lines.push(`[check-integration-branch] ${finding.severity.toUpperCase()} ${finding.code}: ${finding.message}`);
  }
  return lines.join('\n');
}

function main() {
  const options = parseArgs(process.argv.slice(2));
  const context = resolveContext(options);
  const lookups = createGithubLookups();
  if (context.head !== 'HEAD') {
    const fetched = run('git', ['fetch', '--no-tags', '--prune', '--depth=200', 'origin', context.head]);
    if (!fetched.ok && options.readiness) {
      console.warn(`[check-integration-branch] Could not fetch origin/${context.head}; local readiness checks may report blockers.`);
    }
  }
  if (options.readiness) run('git', ['fetch', '--no-tags', '--prune', '--depth=200', 'origin', 'develop']);
  const result = checkIntegrationBranch({ ...context, readiness: options.readiness, lookups });
  console.log(options.json ? JSON.stringify(result, null, 2) : renderHuman(result));
  process.exitCode = exitCodeForResult(result);
}

if (require.main === module) {
  try {
    main();
  } catch (error) {
    console.error(`[check-integration-branch] ${error.message}`);
    process.exitCode = 1;
  }
}

module.exports = {
  BLOCKING_CODES,
  verifyRegistration,
  markerIsPresent,
  classifyPr,
  extractMarkdownSection,
  definitionOfDoneState,
  checkDevSoak,
  evaluateReadiness,
  hasBlockingFindings,
  exitCodeForResult,
  createGithubLookups,
  parseArgs,
  resolveContext,
  checkIntegrationBranch,
  renderHuman,
};
