#!/usr/bin/env node
'use strict';

const fs = require('node:fs');
const { validatePromotionCandidate } = require('./check-promotion-candidate');

const APP_JOBS = Object.freeze({
  'dgfy-api': 'dgfy-api',
  'dgfy-migration-runner': 'dgfy-migration-runner',
  'dgfy-ims': 'frontend-ims-prod',
  'dgfy-pos': 'frontend-pos-prod',
  'dgfy-storefront': 'frontend-storefront-prod',
  'dgfy-opis': 'frontend-opis-prod',
  'dgfy-admin': 'frontend-admin-prod',
});
const BUILD_FLAGS = Object.freeze({
  'dgfy-api': 'build_api',
  'dgfy-migration-runner': 'build_api',
  'dgfy-ims': 'build_frontend_ims',
  'dgfy-pos': 'build_frontend_pos',
  'dgfy-storefront': 'build_frontend_storefront',
  'dgfy-opis': 'build_frontend_opis',
  'dgfy-admin': 'build_frontend_admin',
});

function parseArgs(argv) {
  const options = { manifest: '', runId: '' };
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === '--manifest') options.manifest = argv[++index] || '';
    else if (arg === '--run-id') options.runId = argv[++index] || '';
    else throw new Error(`Unknown argument: ${arg}`);
  }
  if (!options.manifest) throw new Error('Missing required option: --manifest');
  if (!/^\d+$/.test(options.runId) || Number(options.runId) <= 0) {
    throw new Error('--run-id must be a positive numeric workflow run ID');
  }
  return options;
}

function requireEnvironment(name, env = process.env) {
  if (!env[name]) throw new Error(`Missing required environment variable: ${name}`);
  return env[name];
}

// This intentionally copies the small pagination helper from post-quality-suite-evidence.js.
// Extracting shared GitHub API utilities is a possible follow-up, but adds coupling for one caller.
async function listPages(token, repository, route, fetchImpl = fetch) {
  const results = [];
  for (let page = 1; page <= 10; page += 1) {
    const separator = route.includes('?') ? '&' : '?';
    const response = await fetchImpl(`https://api.github.com/repos/${repository}${route}${separator}per_page=100&page=${page}`, {
      headers: {
        Accept: 'application/vnd.github+json',
        Authorization: `Bearer ${token}`,
        'X-GitHub-Api-Version': '2022-11-28',
      },
    });
    const body = await response.text();
    if (!response.ok) throw new Error(`GitHub API ${response.status} for ${route}: ${body.slice(0, 500)}`);
    const payload = body ? JSON.parse(body) : null;
    const entries = Array.isArray(payload) ? payload : payload?.jobs;
    if (!Array.isArray(entries)) throw new Error(`GitHub API returned an unexpected paginated response for ${route}`);
    results.push(...entries);
    if (entries.length < 100) return results;
  }
  return results;
}

function candidateApps(manifest) {
  const apps = new Set();
  for (const revision of manifest.revisions || []) {
    for (const app of revision.apps_touched || []) apps.add(app);
  }
  for (const app of Object.keys(manifest.release_revision?.apps || {})) apps.add(app);
  return apps;
}

function matchingJobs(jobs, app) {
  const expectedName = APP_JOBS[app];
  return jobs.filter((job) => job.name === expectedName || job.name.startsWith(`${expectedName} /`));
}

function priorOutcome(jobs, app) {
  const matches = matchingJobs(jobs, app);
  if (matches.some((job) => job.status && job.status !== 'completed' && !job.conclusion)) {
    throw new Error(`Prior run still has a non-terminal ${app} job; wait for it to finish before planning a retry`);
  }
  if (matches.some((job) => job.conclusion === 'failure' || job.conclusion === 'timed_out' || job.conclusion === 'startup_failure' || job.conclusion === 'action_required')) {
    return 'failure';
  }
  if (matches.some((job) => job.conclusion === 'cancelled')) return 'cancelled';
  if (matches.length > 0 && matches.every((job) => job.conclusion === 'success')) return 'success';
  if (matches.some((job) => job.conclusion === 'skipped')) return 'skipped';
  return 'absent-from-run';
}

function buildPlan(manifest, jobs) {
  const inScope = candidateApps(manifest);
  const appPlans = Object.keys(APP_JOBS).map((app) => {
    const outcome = priorOutcome(jobs, app);
    const selected = inScope.has(app);
    return {
      app,
      inScope: selected,
      outcome: selected ? outcome : '—',
      rebuild: selected && outcome !== 'success',
      flag: BUILD_FLAGS[app],
    };
  });
  const api = appPlans.find((entry) => entry.app === 'dgfy-api');
  const migration = appPlans.find((entry) => entry.app === 'dgfy-migration-runner');
  const flagValues = {
    build_api: String(api.rebuild || migration.rebuild),
    build_frontend_ims: String(appPlans.find((entry) => entry.app === 'dgfy-ims').rebuild),
    build_frontend_pos: String(appPlans.find((entry) => entry.app === 'dgfy-pos').rebuild),
    build_frontend_storefront: String(appPlans.find((entry) => entry.app === 'dgfy-storefront').rebuild),
    build_frontend_opis: String(appPlans.find((entry) => entry.app === 'dgfy-opis').rebuild),
    build_frontend_admin: String(appPlans.find((entry) => entry.app === 'dgfy-admin').rebuild),
  };
  return { appPlans, flagValues };
}

function renderPlan({ appPlans, flagValues }) {
  const rows = appPlans.map(({ app, inScope, outcome, rebuild }) => {
    const scope = inScope ? 'yes' : 'no — not in this candidate';
    const recommendation = inScope ? String(rebuild) : 'excluded';
    return `| ${app} | ${scope} | ${outcome} | ${recommendation} |`;
  });
  const command = [
    'gh workflow run deploy-main.yml --ref main',
    ...Object.entries(flagValues).map(([flag, value]) => `-f ${flag}=${value}`),
    '-f deploy=true',
  ].join(' \\\n+  ');
  return [
    '| App | In candidate? | Prior job outcome | Recommended build flag |',
    '| --- | --- | --- | --- |',
    ...rows,
    '',
    'Recommended retry command (all six build flags are explicit):',
    '```bash',
    command,
    '```',
    '',
    'Informational and local-only: this plan reads the candidate manifest and prior run jobs; it cannot see live CI runner or registry state and does not replace the workflow pre-dispatch warning.',
  ].join('\n');
}

async function main(argv = process.argv.slice(2), dependencies = {}) {
  const options = parseArgs(argv);
  const env = dependencies.env || process.env;
  const token = requireEnvironment('GITHUB_TOKEN', env);
  const repository = requireEnvironment('GITHUB_REPOSITORY', env);
  if (!/^[^/]+\/[^/]+$/.test(repository)) throw new Error('GITHUB_REPOSITORY must use owner/repository');
  const manifest = JSON.parse((dependencies.readFileSync || fs.readFileSync)(options.manifest, 'utf8'));
  validatePromotionCandidate(manifest);
  const jobs = await listPages(token, repository, `/actions/runs/${options.runId}/jobs`, dependencies.fetch || fetch);
  const plan = buildPlan(manifest, jobs);
  (dependencies.log || console.log)(renderPlan(plan));
  return plan;
}

if (require.main === module) {
  main().catch((error) => {
    console.error(`[prod-retry-plan] ERROR: ${error.message}`);
    process.exitCode = 1;
  });
}

module.exports = { APP_JOBS, BUILD_FLAGS, parseArgs, candidateApps, priorOutcome, buildPlan, renderPlan, main };
