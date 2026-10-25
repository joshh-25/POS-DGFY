#!/usr/bin/env node
'use strict';

const fs = require('node:fs');
const path = require('node:path');
const { validatePromotionCandidate } = require('./check-promotion-candidate');

const API_ROOT = 'https://api.github.com';
const SHA_PATTERN = /^[0-9a-f]{40}$/;
const QUALITY_JOB_PREFIXES = [
  'dgfy-api-quality',
  'migration-runner-quality',
  'web-core-quality',
  'frontend-pos-quality',
  'frontend-storefront-quality',
  'frontend-opis-quality',
  'frontend-admin-quality',
  'repository-dependency-quality',
  'repository-ci-contracts-quality',
  'repository-docs-quality',
  'frontend-budgets-quality',
  'pos-sales-e2e-quality',
];
const QUALITY_JOB_FAILURE_ENV = {
  'dgfy-api-quality': 'DGFY_API_FAILURES',
  'migration-runner-quality': 'MIGRATION_RUNNER_FAILURES',
  'web-core-quality': 'WEB_CORE_FAILURES',
  'frontend-pos-quality': 'POS_FAILURES',
  'frontend-storefront-quality': 'STOREFRONT_FAILURES',
  'frontend-opis-quality': 'OPIS_FAILURES',
  'frontend-admin-quality': 'ADMIN_FAILURES',
  'repository-dependency-quality': 'REPOSITORY_DEPENDENCY_FAILURES',
  'repository-ci-contracts-quality': 'REPOSITORY_CI_CONTRACTS_FAILURES',
  'repository-docs-quality': 'REPOSITORY_DOCS_FAILURES',
  'frontend-budgets-quality': 'FRONTEND_BUDGETS_FAILURES',
  'pos-sales-e2e-quality': 'POS_SALES_E2E_FAILURES',
};

function parseArgs(argv) {
  const options = { runId: '', candidateId: '', pr: '' };
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === '--run-id') options.runId = argv[++i] || '';
    else if (arg === '--candidate') options.candidateId = argv[++i] || '';
    else if (arg === '--pr') options.pr = argv[++i] || '';
    else throw new Error(`Unknown argument: ${arg}`);
  }
  if (!/^\d+$/.test(options.runId)) throw new Error('--run-id must be a positive run ID');
  if (options.candidateId && !/^\d{4}-\d{2}-\d{2}-\d{2}$/.test(options.candidateId)) {
    throw new Error('--candidate must use YYYY-MM-DD-NN');
  }
  if (options.pr && !/^\d+$/.test(options.pr)) throw new Error('--pr must be a positive PR number');
  return options;
}

function requireEnvironment(name) {
  const value = process.env[name];
  if (!value) throw new Error(`Missing required environment variable: ${name}`);
  return value;
}

async function githubRequest(token, repository, route, options = {}) {
  const response = await fetch(`${API_ROOT}/repos/${repository}${route}`, {
    ...options,
    headers: {
      Accept: 'application/vnd.github+json',
      Authorization: `Bearer ${token}`,
      'X-GitHub-Api-Version': '2022-11-28',
      ...(options.body ? { 'Content-Type': 'application/json' } : {}),
      ...options.headers,
    },
  });
  const body = await response.text();
  if (!response.ok) throw new Error(`GitHub API ${response.status} for ${route}: ${body.slice(0, 500)}`);
  return body ? JSON.parse(body) : null;
}

async function listPages(token, repository, route) {
  const results = [];
  for (let page = 1; page <= 10; page += 1) {
    const separator = route.includes('?') ? '&' : '?';
    const response = await githubRequest(token, repository, `${route}${separator}per_page=100&page=${page}`);
    const entries = Array.isArray(response) ? response : response?.jobs;
    if (!Array.isArray(entries)) throw new Error(`GitHub API returned an unexpected paginated response for ${route}`);
    results.push(...entries);
    if (entries.length < 100) return results;
  }
  return results;
}

function resultForJob(job) {
  const conclusion = job.conclusion || job.status || 'unknown';
  return conclusion === 'success' ? 'pass' : `advisory: ${conclusion}`;
}

function buildComment({ run, jobs, pr, failuresByJob = {} }) {
  const checkedSha = run.head_sha;
  const currentSha = pr ? pr.head.sha : null;
  const freshness = pr
    ? (checkedSha === currentSha ? 'Current PR head' : `Stale: PR head is ${currentSha}`)
    : 'No open PR matched the dispatched branch';
  const resultFor = (job) => {
    const name = QUALITY_JOB_PREFIXES.find((prefix) => job.name === prefix || job.name.startsWith(`${prefix} (`));
    const failedSteps = name ? failuresByJob[name] : '';
    if (failedSteps) return `advisory failures: ${failedSteps.replaceAll('|', '\\|')}`;
    return resultForJob(job);
  };
  const seenPrefixes = new Set(jobs.flatMap((job) => QUALITY_JOB_PREFIXES.filter((prefix) => job.name === prefix || job.name.startsWith(`${prefix} (`))));
  const rows = jobs.map((job) => `| ${job.name.replaceAll('|', '\\|')} | ${resultFor(job)} |`);
  for (const prefix of QUALITY_JOB_PREFIXES) {
    if (!seenPrefixes.has(prefix)) rows.push(`| ${prefix} | advisory: unavailable |`);
  }
  const jobTable = rows.join('\n');
  const failedJobs = new Set(jobs.filter((job) => job.conclusion !== 'success').map((job) => job.name));
  for (const prefix of QUALITY_JOB_PREFIXES) if (!seenPrefixes.has(prefix)) failedJobs.add(prefix);
  for (const [jobName, stepNames] of Object.entries(failuresByJob)) {
    if (stepNames) failedJobs.add(jobName);
  }
  const overall = failedJobs.size === 0 ? 'No advisory failures reported' : `${failedJobs.size} job(s) reported advisory failures`;

  return [
    '## Quality Suite Evidence',
    '',
    `**Overall:** ${overall}. These results are informational and do not gate promotion.`,
    '',
    `- Branch: ${run.head_branch}`,
    `- Commit: ${checkedSha}`,
    `- Freshness: ${freshness}`,
    `- Run: [${run.html_url}](${run.html_url})`,
    '',
    '| Job | Result |',
    '| --- | --- |',
    jobTable,
    '',
    'Failure, cancellation, or absence of this optional run does not change promotion eligibility.',
  ].join('\n');
}

function appendStepSummary(report, summaryPath = process.env.GITHUB_STEP_SUMMARY) {
  if (!summaryPath) return false;
  try {
    fs.appendFileSync(summaryPath, `${report}\n`);
    return true;
  } catch (error) {
    console.error(`[quality-evidence] could not append evidence to GITHUB_STEP_SUMMARY: ${error.message}`);
    return false;
  }
}

function recordCandidateQualityCheck(candidateId, qualityCheck, projectRoot) {
  const manifestPath = path.join(projectRoot, '.tmp', 'release-candidates', `${candidateId}.json`);
  const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
  if (!['sku-release-candidate/v3', 'sku-release-candidate/v4'].includes(manifest.schema)) {
    throw new Error(`Candidate ${candidateId} uses ${manifest.schema || 'an unknown schema'}; quality evidence is recorded only on v3/v4 manifests`);
  }
  if (manifest.status === 'refresh_in_progress') throw new Error(`Candidate ${candidateId} is refreshing; do not attach qualification evidence until the new staging SHA is active`);
  validatePromotionCandidate(manifest);
  manifest.quality_check = qualityCheck;
  const validation = validatePromotionCandidate(manifest);
  fs.writeFileSync(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`);
  return { manifestPath, current: validation.quality_check_current };
}

async function main(argv = process.argv.slice(2)) {
  const options = parseArgs(argv);
  const token = requireEnvironment('GITHUB_TOKEN');
  const repository = requireEnvironment('GITHUB_REPOSITORY');
  const [owner] = repository.split('/');
  if (!owner || !repository.includes('/')) throw new Error('GITHUB_REPOSITORY must use owner/repository');

  const run = await githubRequest(token, repository, `/actions/runs/${options.runId}`);
  if (!SHA_PATTERN.test(run.head_sha || '')) throw new Error('Workflow run did not provide a valid head SHA');
  const jobs = (await listPages(token, repository, `/actions/runs/${options.runId}/jobs`))
    .filter((job) => QUALITY_JOB_PREFIXES.some((prefix) => job.name === prefix || job.name.startsWith(`${prefix} (`)));
  const failuresByJob = Object.fromEntries(Object.entries(QUALITY_JOB_FAILURE_ENV)
    .map(([jobName, envName]) => [jobName, (process.env[envName] || '').trim()])
    .filter(([, stepNames]) => Boolean(stepNames)));
  const branch = encodeURIComponent(`${owner}:${run.head_branch}`);
  let pr;
  if (options.pr) {
    pr = await githubRequest(token, repository, `/pulls/${options.pr}`);
    if (pr.head.ref !== run.head_branch) {
      throw new Error(`PR #${pr.number} branch ${pr.head.ref} does not match dispatched branch ${run.head_branch}`);
    }
  } else {
    const matches = (await listPages(token, repository, `/pulls?state=open&head=${branch}`))
      .filter((item) => item.head.ref === run.head_branch);
    if (matches.length > 1) throw new Error(`More than one open PR uses branch ${run.head_branch}; pass --pr`);
    [pr] = matches;
  }

  const evidenceReport = buildComment({ run, jobs, pr, failuresByJob });
  appendStepSummary(evidenceReport);

  if (pr) {
    await githubRequest(token, repository, `/issues/${pr.number}/comments`, {
      method: 'POST',
      body: JSON.stringify({ body: evidenceReport }),
    });
    console.log(`[quality-evidence] posted run ${options.runId} for ${run.head_sha} to PR #${pr.number}`);
  } else {
    console.log(`[quality-evidence] no open PR for ${run.head_branch}; run ${options.runId} checks ${run.head_sha}`);
  }

  if (options.candidateId) {
    const presentPrefixes = new Set(jobs.flatMap((job) => QUALITY_JOB_PREFIXES.filter((prefix) => job.name === prefix || job.name.startsWith(`${prefix} (`))));
    const failed = QUALITY_JOB_PREFIXES.some((prefix) => !presentPrefixes.has(prefix))
      || jobs.some((job) => job.conclusion !== 'success')
      || Object.keys(failuresByJob).length > 0;
    const qualityCheck = {
      sha: run.head_sha,
      run_id: Number(options.runId),
      run_url: run.html_url,
      dispatched_at: run.created_at,
      result: failed ? 'had-advisory-failures' : 'clean',
    };
    const recorded = recordCandidateQualityCheck(options.candidateId, qualityCheck, process.cwd());
    console.log(`[quality-evidence] recorded ${qualityCheck.result} in ${recorded.manifestPath}; candidate SHA status=${recorded.current ? 'current' : 'stale'}`);
  }
}

if (require.main === module) {
  main().catch((error) => {
    console.error(`[quality-evidence] ERROR: ${error.message}`);
    process.exitCode = 1;
  });
}

module.exports = { parseArgs, resultForJob, buildComment, recordCandidateQualityCheck, main };
