#!/usr/bin/env node

const fs = require('fs');
const http = require('http');
const https = require('https');
const path = require('path');
const { spawnSync } = require('child_process');

class ProductionDeployContractError extends Error {
  constructor(message, options = {}) {
    super(message);
    this.name = 'ProductionDeployContractError';
    this.code = options.code || 'PRODUCTION_DEPLOY_CONTRACT_FAILED';
    this.report = options.report || null;
  }
}

function parseArgs(argv) {
  const options = {
    projectRoot: process.cwd(),
    targetSha: process.env.RELEASE_TARGET_SHA || process.env.DEPLOY_TARGET_SHA || '',
    deployStateFile: process.env.DEPLOY_STATE_FILE || '.deploy-state/last_deployed_commit',
    deploySummaryFile: process.env.DEPLOY_SUMMARY_FILE || '',
    healthUrls: [],
    reportPath: process.env.PRODUCTION_DEPLOY_CONTRACT_REPORT || '',
  };

  const envHealthUrl = process.env.DEPLOY_HEALTH_URL || process.env.DEPLOY_BACKEND_HEALTH_URL || '';
  if (envHealthUrl) options.healthUrls.push(envHealthUrl);

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === '--project-root') {
      options.projectRoot = path.resolve(argv[index + 1] || '');
      index += 1;
    } else if (arg === '--target-sha') {
      options.targetSha = argv[index + 1] || '';
      index += 1;
    } else if (arg === '--deploy-state-file') {
      options.deployStateFile = argv[index + 1] || '';
      index += 1;
    } else if (arg === '--deploy-summary-file') {
      options.deploySummaryFile = argv[index + 1] || '';
      index += 1;
    } else if (arg === '--health-url') {
      options.healthUrls.push(argv[index + 1] || '');
      index += 1;
    } else if (arg === '--report') {
      options.reportPath = argv[index + 1] || '';
      index += 1;
    } else {
      throw new ProductionDeployContractError(`Unknown argument: ${arg}`, { code: 'INVALID_ARGS' });
    }
  }

  options.healthUrls = options.healthUrls.filter(Boolean);
  if (!options.targetSha) {
    throw new ProductionDeployContractError('Missing --target-sha or RELEASE_TARGET_SHA', { code: 'INVALID_ARGS' });
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

function normalizeSha(value) {
  return String(value || '').trim().toLowerCase();
}

function shaMatches(actual, expected) {
  const normalizedActual = normalizeSha(actual);
  const normalizedExpected = normalizeSha(expected);
  if (!normalizedActual || !normalizedExpected) return false;
  return normalizedActual === normalizedExpected || normalizedActual.startsWith(normalizedExpected) || normalizedExpected.startsWith(normalizedActual);
}

function parseSummary(content) {
  const parsed = {};
  for (const line of content.split(/\r?\n/)) {
    const separator = line.indexOf('=');
    if (separator === -1) continue;
    parsed[line.slice(0, separator)] = line.slice(separator + 1);
  }
  return parsed;
}

function extractRuntimeSha(payload) {
  if (!payload || typeof payload !== 'object') return '';
  return (
    payload?.services?.observability?.runtime_sha ||
    payload?.services?.observability?.runtimeSha ||
    payload?.observability?.runtime_sha ||
    payload?.runtime_sha ||
    payload?.runtimeSha ||
    payload?.commit ||
    payload?.sha ||
    ''
  );
}

function fetchJson(url) {
  return new Promise((resolve, reject) => {
    const client = url.startsWith('https:') ? https : http;
    const request = client.get(url, { timeout: 10000 }, (response) => {
      let body = '';
      response.setEncoding('utf8');
      response.on('data', (chunk) => {
        body += chunk;
      });
      response.on('end', () => {
        if (response.statusCode < 200 || response.statusCode >= 300) {
          reject(new Error(`HTTP ${response.statusCode}`));
          return;
        }
        try {
          resolve(JSON.parse(body));
        } catch (error) {
          reject(new Error(`Invalid JSON: ${error.message}`));
        }
      });
    });
    request.on('timeout', () => {
      request.destroy(new Error('Request timed out'));
    });
    request.on('error', reject);
  });
}

function writeReport(reportPath, report) {
  if (!reportPath) return;
  fs.mkdirSync(path.dirname(path.resolve(reportPath)), { recursive: true });
  fs.writeFileSync(reportPath, JSON.stringify(report, null, 2));
}

async function verifyProductionDeployContract(options, logger = console) {
  const projectRoot = path.resolve(options.projectRoot);
  const targetSha = normalizeSha(options.targetSha);
  const report = {
    generated_at: new Date().toISOString(),
    target_sha: targetSha,
    project_root: projectRoot,
    git_head: '',
    deploy_state_file: options.deployStateFile,
    deploy_state_sha: '',
    deploy_summary_file: options.deploySummaryFile || null,
    deploy_summary: null,
    health: [],
    ok: true,
    failures: [],
  };

  const head = runGit(projectRoot, ['rev-parse', 'HEAD']);
  report.git_head = normalizeSha(head.stdout);
  if (!head.ok || !shaMatches(report.git_head, targetSha)) {
    report.ok = false;
    report.failures.push(`Git HEAD ${report.git_head || '<missing>'} does not match target ${targetSha}.`);
  }

  if (options.deployStateFile) {
    const statePath = path.resolve(projectRoot, options.deployStateFile);
    if (!fs.existsSync(statePath)) {
      report.ok = false;
      report.failures.push(`Deploy state file is missing: ${options.deployStateFile}`);
    } else {
      report.deploy_state_sha = normalizeSha(fs.readFileSync(statePath, 'utf8'));
      if (!shaMatches(report.deploy_state_sha, targetSha)) {
        report.ok = false;
        report.failures.push(`Deploy state SHA ${report.deploy_state_sha || '<missing>'} does not match target ${targetSha}.`);
      }
    }
  }

  if (options.deploySummaryFile) {
    const summaryPath = path.resolve(projectRoot, options.deploySummaryFile);
    if (!fs.existsSync(summaryPath)) {
      report.ok = false;
      report.failures.push(`Deploy summary file is missing: ${options.deploySummaryFile}`);
    } else {
      report.deploy_summary = parseSummary(fs.readFileSync(summaryPath, 'utf8'));
      for (const key of ['deployed_head', 'remote_head']) {
        if (report.deploy_summary[key] && !shaMatches(report.deploy_summary[key], targetSha)) {
          report.ok = false;
          report.failures.push(`Deploy summary ${key}=${report.deploy_summary[key]} does not match target ${targetSha}.`);
        }
      }
      if (
        report.deploy_summary.expected_commit &&
        report.deploy_summary.expected_commit !== 'none' &&
        !shaMatches(report.deploy_summary.expected_commit, targetSha)
      ) {
        report.ok = false;
        report.failures.push(`Deploy summary expected_commit=${report.deploy_summary.expected_commit} does not match target ${targetSha}.`);
      }
    }
  }

  for (const url of options.healthUrls) {
    const healthResult = { url, ok: false, runtime_sha: '', error: null };
    try {
      const payload = await fetchJson(url);
      healthResult.runtime_sha = normalizeSha(extractRuntimeSha(payload));
      healthResult.ok = shaMatches(healthResult.runtime_sha, targetSha);
      if (!healthResult.ok) {
        report.ok = false;
        report.failures.push(`Health runtime SHA ${healthResult.runtime_sha || '<missing>'} from ${url} does not match target ${targetSha}.`);
      }
    } catch (error) {
      healthResult.error = error.message;
      report.ok = false;
      report.failures.push(`Health check failed for ${url}: ${error.message}`);
    }
    report.health.push(healthResult);
  }

  writeReport(options.reportPath, report);

  if (!report.ok) {
    throw new ProductionDeployContractError(report.failures.join('\n'), {
      code: 'PRODUCTION_PARITY_FAILED',
      report,
    });
  }

  logger.log(`[production-deploy-contract] PASS target=${targetSha.slice(0, 12)} health_urls=${options.healthUrls.length}`);
  return report;
}

async function main() {
  try {
    const options = parseArgs(process.argv.slice(2));
    await verifyProductionDeployContract(options);
  } catch (error) {
    if (error instanceof ProductionDeployContractError) {
      console.error(`[production-deploy-contract] ${error.code}: ${error.message}`);
      process.exit(1);
    }
    throw error;
  }
}

if (require.main === module) {
  main();
}

module.exports = {
  ProductionDeployContractError,
  parseArgs,
  verifyProductionDeployContract,
  parseSummary,
  extractRuntimeSha,
  shaMatches,
};
