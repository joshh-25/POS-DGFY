#!/usr/bin/env node

const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');

const BILLING_MESSAGE = /job was not started because recent account payments have failed or your spending limit needs to be increased/i;

class ActionsUnavailabilityError extends Error {
  constructor(code, message) {
    super(message);
    this.name = 'ActionsUnavailabilityError';
    this.code = code;
  }
}

function defaultRunner(command, args) {
  const result = spawnSync(command, args, { encoding: 'utf8', shell: false });
  if (result.status !== 0) {
    throw new ActionsUnavailabilityError('GITHUB_QUERY_FAILED', (result.stderr || result.stdout || `${command} failed`).trim());
  }
  return result.stdout;
}

function parseArgs(argv) {
  const options = { repository: '', targetSha: '', requiredChecks: [], output: '' };
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === '--repository') options.repository = argv[++index] || '';
    else if (arg === '--target-sha') options.targetSha = argv[++index] || '';
    else if (arg === '--required-check') options.requiredChecks.push(argv[++index] || '');
    else if (arg === '--output') options.output = argv[++index] || '';
    else throw new ActionsUnavailabilityError('INVALID_ARGS', `Unknown argument: ${arg}`);
  }
  if (!options.repository || !/^[0-9a-f]{40}$/.test(options.targetSha) || options.requiredChecks.length === 0 || !options.output) {
    throw new ActionsUnavailabilityError('INVALID_ARGS', '--repository, --target-sha, at least one --required-check, and --output are required');
  }
  return options;
}

function parseJson(value, label) {
  try {
    return JSON.parse(value);
  } catch {
    throw new ActionsUnavailabilityError('GITHUB_RESPONSE_INVALID', `${label} returned invalid JSON`);
  }
}

function collect(options, runner = defaultRunner) {
  const repo = options.repository;
  const response = parseJson(runner('gh', ['api', '-H', 'Accept: application/vnd.github+json', `repos/${repo}/commits/${options.targetSha}/check-runs?per_page=100`]), 'check-runs');
  const results = [];

  for (const name of options.requiredChecks) {
    const check = (response.check_runs || []).find((item) => item.name === name);
    if (!check) throw new ActionsUnavailabilityError('REQUIRED_CHECK_MISSING', `Required check is missing: ${name}`);
    const job = parseJson(runner('gh', ['api', `repos/${repo}/actions/jobs/${check.id}`]), `job ${check.id}`);
    const annotations = parseJson(runner('gh', ['api', `repos/${repo}/check-runs/${check.id}/annotations`]), `annotations ${check.id}`);
    const billingAnnotation = annotations.find((item) => BILLING_MESSAGE.test(item.message || ''));
    const unavailable = check.app?.slug === 'github-actions'
      && check.conclusion === 'failure'
      && Number(job.runner_id || 0) === 0
      && !job.runner_name
      && Array.isArray(job.steps)
      && job.steps.length === 0
      && Boolean(billingAnnotation);
    if (!unavailable) {
      throw new ActionsUnavailabilityError('NOT_BILLING_UNAVAILABLE', `Required check ${name} is not a verified GitHub billing allocation failure`);
    }
    results.push({
      name,
      check_run_id: check.id,
      run_id: job.run_id,
      details_url: check.details_url || check.html_url,
      conclusion: check.conclusion,
      runner_id: 0,
      runner_name: '',
      steps: 0,
      annotation_message: billingAnnotation.message,
    });
  }

  return {
    schema: 'sku-github-actions-unavailability/v1',
    status: 'pass',
    reason: 'billing_allocation_failure',
    repository: repo,
    target_sha: options.targetSha,
    captured_at: new Date().toISOString(),
    required_checks: results,
  };
}

function main() {
  try {
    const options = parseArgs(process.argv.slice(2));
    const report = collect(options);
    const output = path.resolve(options.output);
    fs.mkdirSync(path.dirname(output), { recursive: true });
    fs.writeFileSync(output, `${JSON.stringify(report, null, 2)}\n`);
    console.log(`[github-actions-unavailability] PASS target=${report.target_sha} checks=${report.required_checks.length}`);
  } catch (error) {
    console.error(`[github-actions-unavailability] ${error.code || 'FAILED'}: ${error.message}`);
    process.exit(1);
  }
}

if (require.main === module) main();

module.exports = { ActionsUnavailabilityError, BILLING_MESSAGE, parseArgs, collect };
