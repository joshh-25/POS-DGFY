#!/usr/bin/env node

const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawnSync } = require('child_process');

const REPO_ROOT = path.resolve(__dirname, '..');
const DEFAULT_IMAGE = 'node:22-alpine';
const DEFAULT_NETWORK = 'dgfy-local-test';
const DEFAULT_MYSQL = 'dgfy-mysql-test';
const DEFAULT_REDIS = 'dgfy-redis-test';
const PRELIGHT_REFUSAL_EXIT = 3;

class ArgumentError extends Error {}
class PreflightError extends Error {}

function parseArgs(argv) {
  const options = {
    image: DEFAULT_IMAGE,
    network: DEFAULT_NETWORK,
    mysqlContainer: DEFAULT_MYSQL,
    redisContainer: DEFAULT_REDIS,
    scope: 'full',
    only: [],
    skip: [],
    dbName: process.env.DB_NAME || 'sku_inventory_manager_test',
    dbUser: process.env.DB_USER || 'root',
    dbPassword: process.env.DB_PASSWORD || 'testpassword',
    repoRoot: REPO_ROOT,
  };
  const args = [...argv];
  const take = (flag) => {
    const index = args.indexOf(flag);
    if (index < 0) return null;
    const value = args[index + 1];
    if (!value || value.startsWith('--')) throw new ArgumentError(`${flag} requires a value`);
    args.splice(index, 2);
    return value;
  };

  options.scope = take('--scope') || options.scope;
  options.only = (take('--only') || '').split(',').map((value) => value.trim()).filter(Boolean);
  options.skip = (take('--skip') || '').split(',').map((value) => value.trim()).filter(Boolean);
  options.image = take('--image') || options.image;
  options.network = take('--network') || options.network;
  options.mysqlContainer = take('--mysql-container') || options.mysqlContainer;
  options.redisContainer = take('--redis-container') || options.redisContainer;
  options.dbName = take('--db-name') || options.dbName;
  options.dbUser = take('--db-user') || options.dbUser;
  options.dbPassword = take('--db-password') || options.dbPassword;
  options.pr = take('--pr') || null;
  options.targetSha = take('--target-sha') || null;
  options.minCpu = Number(take('--min-cpu') || process.env.TESTING_AGENT_MIN_CPU || 2);
  options.minMemoryGiB = Number(take('--min-memory-gib') || process.env.TESTING_AGENT_MIN_MEMORY_GIB || 5);
  options.provision = args.includes('--provision');
  if (options.provision) args.splice(args.indexOf('--provision'), 1);
  options.dryRun = args.includes('--dry-run');
  if (options.dryRun) args.splice(args.indexOf('--dry-run'), 1);

  if (args.length > 0) throw new ArgumentError(`unknown argument(s): ${args.join(' ')}`);
  if (!['full', 'focused'].includes(options.scope)) {
    throw new ArgumentError('--scope must be full or focused');
  }
  if (options.scope === 'full' && (options.only.length > 0 || options.skip.length > 0)) {
    options.scope = 'focused';
  }
  if (options.scope === 'focused' && options.only.length === 0 && options.skip.length === 0) {
    throw new ArgumentError('focused scope requires --only or --skip');
  }
  if (!Number.isFinite(options.minCpu) || options.minCpu < 1 || !Number.isFinite(options.minMemoryGiB) || options.minMemoryGiB <= 0) {
    throw new ArgumentError('resource floors must be positive numbers');
  }
  return options;
}

function run(command, args, options = {}) {
  return spawnSync(command, args, {
    cwd: REPO_ROOT,
    encoding: 'utf8',
    maxBuffer: 128 * 1024 * 1024,
    shell: false,
    env: process.env,
    ...options,
  });
}

function resolveTargetSha(repoRoot = REPO_ROOT, env = process.env) {
  if (env.RELEASE_TARGET_SHA) return String(env.RELEASE_TARGET_SHA).toLowerCase();
  const result = spawnSync('git', ['rev-parse', 'HEAD'], { cwd: repoRoot, encoding: 'utf8' });
  if (result.status !== 0) throw new PreflightError('could not resolve the target SHA');
  return String(result.stdout).trim().toLowerCase();
}

function assertTestDatabase(dbName) {
  if (!String(dbName || '').toLowerCase().includes('test')) {
    throw new PreflightError(`refusing non-test database name: ${dbName || '(empty)'}`);
  }
}

function dockerInfo(docker = 'docker') {
  const result = run(docker, ['info', '--format', '{{json .}}']);
  if (result.status !== 0) throw new PreflightError(`Docker is unavailable: ${(result.stderr || '').trim()}`);
  let info;
  try { info = JSON.parse(result.stdout); } catch { throw new PreflightError('Docker returned unreadable resource information'); }
  const cpus = Number(info.NCPU || info.NCPUs || 0);
  const memoryGiB = Number(info.MemTotal || 0) / (1024 ** 3);
  return { cpus, memoryGiB, info };
}

function checkResources(info, options) {
  const reasons = [];
  if (info.cpus < options.minCpu) reasons.push(`CPU ${info.cpus} < required ${options.minCpu}`);
  if (info.memoryGiB < options.minMemoryGiB) reasons.push(`memory ${info.memoryGiB.toFixed(2)} GiB < required ${options.minMemoryGiB} GiB`);
  if (reasons.length > 0) throw new PreflightError(`insufficient Docker resources: ${reasons.join('; ')}`);
}

function checkService(docker, container, command) {
  const result = run(docker, ['exec', container, ...command]);
  if (result.status !== 0) throw new PreflightError(`service ${container} is unavailable or unhealthy`);
}

function ensureServices(options, docker = 'docker') {
  if (options.provision) {
    throw new PreflightError('--provision is reserved for a future provisioning contract; use verified test containers or provision them outside this wrapper');
  }
  checkService(docker, options.mysqlContainer, ['mysqladmin', 'ping', '-u', options.dbUser, `-p${options.dbPassword}`]);
  checkService(docker, options.redisContainer, ['redis-cli', 'ping']);
}

function makeScratch(repoRoot = REPO_ROOT, makeTemp = fs.mkdtempSync) {
  return makeTemp(path.join(path.dirname(repoRoot), '.dgfy-testing-agent-'));
}

function copyRepo(repoRoot, scratch, runner = run) {
  const result = runner('rsync', ['-a', '--exclude=node_modules', '--exclude=**/node_modules', '--exclude=.tmp', `${repoRoot}/`, `${scratch}/`]);
  if (result.status !== 0) throw new Error(`scratch copy failed: ${(result.stderr || '').trim()}`);
}

function copyEvidence(scratch, repoRoot, runner = run) {
  const target = path.join(repoRoot, '.tmp', 'release-gates');
  fs.mkdirSync(target, { recursive: true });
  const result = runner('rsync', ['-a', `${scratch}/.tmp/release-gates/`, `${target}/`]);
  if (result.status !== 0 && result.status !== 24) throw new Error(`evidence copy failed: ${(result.stderr || '').trim()}`);
  return target;
}

function removeScratch(scratch, remove = (value) => fs.rmSync(value, { recursive: true, force: true })) {
  if (scratch) remove(scratch);
}

function buildGateArgs(options) {
  const args = ['run', 'gate:release:local', '--'];
  if (options.scope === 'full') args.push('--include-ci-enforced');
  if (options.only.length > 0) args.push('--only', options.only.join(','));
  if (options.skip.length > 0) args.push('--skip', options.skip.join(','));
  return args;
}

function containerEnvironment(options, targetSha) {
  return {
    NODE_OPTIONS: process.env.NODE_OPTIONS || '--max-old-space-size=4096',
    NODE_ENV: 'test',
    DB_HOST: options.mysqlContainer,
    DB_PORT: '3306',
    DB_NAME: options.dbName,
    DB_NAME_TEST: options.dbName,
    DB_USER: options.dbUser,
    DB_PASSWORD: options.dbPassword,
    REDIS_URL: `redis://${options.redisContainer}:6379`,
    JWT_SECRET: 'ci_jwt_secret_key_for_tests_only_123456',
    REFRESH_TOKEN_SECRET: 'ci_refresh_secret_key_for_tests_only_123',
    RELEASE_TARGET_SHA: targetSha,
  };
}

function renderSummary({ targetSha, options, result, artifact }) {
  const gates = artifact && Array.isArray(artifact.gates) ? artifact.gates : [];
  const counts = gates.reduce((acc, gate) => {
    acc[gate.status] = (acc[gate.status] || 0) + 1;
    return acc;
  }, {});
  const overall = result.status === 0 && artifact && artifact.verdict === 'pass' ? 'PASS' : 'FAIL/UNRUNNABLE';
  const lines = [
    `# Testing Agent Summary`, '',
    `- Overall: **${overall}**`,
    `- Target SHA: \`${targetSha}\``,
    `- Scope: **${options.scope}**${options.scope === 'focused' ? ' (advisory; not a full release result)' : ''}`,
    `- Runtime: Docker image \`${options.image}\`, network \`${options.network}\``,
    `- Services: MySQL 8 container \`${options.mysqlContainer}\`, Redis 7 container \`${options.redisContainer}\``,
    `- Command: \`npm run gate:release:local -- ${buildGateArgs(options).slice(3).join(' ')}\``,
    `- Gate counts: pass=${counts.pass || 0}, fail=${counts.fail || 0}, skipped=${counts.skipped || 0}, delegated=${counts.delegated_to_ci || 0}`,
    `- Child exit status: ${result.status == null ? 'signal' : result.status}`,
    `- Evidence: \`.tmp/release-gates/${targetSha}/local_readiness.json\``,
    '',
    '## Not reproduced locally',
    '- A green result here does not replace GitHub CI or authorize a merge.',
    '- Any skipped/delegated gate remains explicitly non-local evidence in `local_readiness.json`.',
  ];
  return lines.join('\n') + '\n';
}

function writeSummary(repoRoot, targetSha, summary, artifact) {
  const dir = path.join(repoRoot, '.tmp', 'release-gates', targetSha);
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, 'testing_agent_summary.md'), summary);
  fs.writeFileSync(path.join(dir, 'testing_agent_summary.json'), JSON.stringify({ target_sha: targetSha, ...artifact }, null, 2));
}

function execute(options, dependencies = {}) {
  const docker = dependencies.docker || 'docker';
  const repoRoot = options.repoRoot || REPO_ROOT;
  const runner = dependencies.runner || run;
  let scratch;
  let childResult = { status: PRELIGHT_REFUSAL_EXIT, stdout: '', stderr: '' };
  let artifact = { target_sha: options.targetSha || 'unknown', verdict: 'unrunnable', gates: [] };
  let targetSha = options.targetSha || 'unknown';
  try {
    assertTestDatabase(options.dbName);
    targetSha = options.targetSha || resolveTargetSha(repoRoot);
    const info = dependencies.resourceInfo || dockerInfo(docker);
    checkResources(info, options);
    ensureServices(options, docker);
    scratch = makeScratch(repoRoot, dependencies.makeTemp || fs.mkdtempSync);
    copyRepo(repoRoot, scratch, runner);
    if (!options.dryRun) {
      const containerEnv = containerEnvironment(options, targetSha);
      const command = `npm run install:all && ${['npm', ...buildGateArgs(options)].join(' ')}`;
      childResult = runner(docker, ['run', '--rm', '--network', options.network, '-v', `${scratch}:/repo`, '-w', '/repo', ...Object.entries(containerEnv).flatMap(([key, value]) => ['-e', `${key}=${value}`]), options.image, 'sh', '-c', command]);
    } else {
      childResult = { status: 0, stdout: '', stderr: '' };
    }
    copyEvidence(scratch, repoRoot, runner);
    const artifactPath = path.join(repoRoot, '.tmp', 'release-gates', targetSha, 'local_readiness.json');
    if (fs.existsSync(artifactPath)) artifact = JSON.parse(fs.readFileSync(artifactPath, 'utf8'));
    writeSummary(repoRoot, targetSha, renderSummary({ targetSha, options, result: childResult, artifact }), artifact);
    return childResult.status == null ? 1 : childResult.status;
  } catch (error) {
    console.error(`[testing-agent] ${error.message}`);
    const summary = renderSummary({ targetSha, options, result: { status: PRELIGHT_REFUSAL_EXIT }, artifact });
    try { writeSummary(repoRoot, targetSha, summary, artifact); } catch (summaryError) { console.error(`[testing-agent] could not write refusal summary: ${summaryError.message}`); }
    return error instanceof PreflightError ? PRELIGHT_REFUSAL_EXIT : 1;
  } finally {
    removeScratch(scratch, dependencies.removeScratch);
  }
}

function main() {
  try {
    process.exitCode = execute(parseArgs(process.argv.slice(2)));
  } catch (error) {
    console.error(`[testing-agent] ${error.message}`);
    process.exitCode = error instanceof ArgumentError ? 1 : PRELIGHT_REFUSAL_EXIT;
  }
}

if (require.main === module) main();

module.exports = {
  ArgumentError,
  PreflightError,
  PRELIGHT_REFUSAL_EXIT,
  parseArgs,
  assertTestDatabase,
  checkResources,
  makeScratch,
  copyRepo,
  copyEvidence,
  removeScratch,
  buildGateArgs,
  containerEnvironment,
  renderSummary,
  execute,
};
