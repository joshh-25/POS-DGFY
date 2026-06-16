#!/usr/bin/env node

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const DEFAULT_LOG_FILES = [
  path.join('backend', 'logs', 'request-outcomes.log'),
  path.join('backend', 'logs', 'error.log'),
  path.join('backend', 'logs', 'combined.log'),
  path.join('logs', 'deploy', 'deploy_*.summary.txt')
];

function parseArgs(argv) {
  const args = {};
  for (let i = 0; i < argv.length; i += 1) {
    const token = argv[i];
    if (!token.startsWith('--')) continue;
    const key = token.slice(2);
    const next = argv[i + 1];
    if (!next || next.startsWith('--')) {
      args[key] = true;
    } else {
      args[key] = next;
      i += 1;
    }
  }
  return args;
}

function safeSlug(value) {
  return String(value || 'incident')
    .replace(/[^A-Za-z0-9._-]/g, '-')
    .replace(/-+/g, '-')
    .slice(0, 80) || 'incident';
}

function ensureDir(dirPath) {
  fs.mkdirSync(dirPath, { recursive: true });
}

function sha256Short(value) {
  return crypto.createHash('sha256').update(String(value || '')).digest('hex').slice(0, 16);
}

function createRedactor() {
  const counts = {
    authorization: 0,
    cookie: 0,
    secret_field: 0,
    email: 0,
    phone: 0,
    payment: 0
  };

  const replace = (text, regex, replacement, key) => text.replace(regex, (...match) => {
    counts[key] += 1;
    return typeof replacement === 'function' ? replacement(...match) : replacement;
  });

  const redact = (input) => {
    let output = String(input || '');
    output = replace(output, /(authorization["':=\s]+)(bearer\s+)?[A-Za-z0-9._~+/=-]{12,}/gi, '$1[REDACTED_AUTH]', 'authorization');
    output = replace(output, /(cookie["':=\s]+)[^",\n\r]+/gi, '$1[REDACTED_COOKIE]', 'cookie');
    output = replace(
      output,
      /(password|passwd|otp|token|company_token|companyToken|secret|api[_-]?key|session|csrf)["':=\s]+[A-Za-z0-9._~+/=@:-]{4,}/gi,
      '$1=[REDACTED_SECRET]',
      'secret_field'
    );
    output = replace(output, /\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/gi, (value) => `[EMAIL_HASH:${sha256Short(value.toLowerCase())}]`, 'email');
    output = replace(output, /(\+?\d[\d\s().-]{8,}\d)/g, (value) => `[PHONE_HASH:${sha256Short(value)}]`, 'phone');
    output = replace(output, /(paymongo|paypal|stripe)[A-Za-z0-9._~+/=@:-]{8,}/gi, '$1[REDACTED_PAYMENT]', 'payment');
    return output;
  };

  return { redact, counts };
}

function expandLogPatterns(rootDir, patterns = DEFAULT_LOG_FILES) {
  const files = [];
  for (const pattern of patterns) {
    if (!pattern.includes('*')) {
      const filePath = path.resolve(rootDir, pattern);
      if (fs.existsSync(filePath)) files.push(filePath);
      continue;
    }

    const dir = path.resolve(rootDir, path.dirname(pattern));
    const basename = path.basename(pattern).replace(/\./g, '\\.').replace(/\*/g, '.*');
    if (!fs.existsSync(dir)) continue;
    const regex = new RegExp(`^${basename}$`);
    for (const entry of fs.readdirSync(dir)) {
      if (regex.test(entry)) files.push(path.join(dir, entry));
    }
  }
  return files.sort();
}

function parseJsonLine(line) {
  try {
    return JSON.parse(line);
  } catch (_error) {
    return null;
  }
}

function matchesIncident(line, parsed, filters) {
  const requestId = filters.requestId || '';
  const traceId = filters.traceId || '';
  const surface = filters.surface || '';

  if (requestId && line.includes(requestId)) return true;
  if (traceId && line.includes(traceId)) return true;
  if (surface && parsed?.surface === surface) return true;
  return !requestId && !traceId && !surface;
}

function collectLogExcerpts({ rootDir, requestId, traceId, surface, maxLines = 200 }) {
  const files = expandLogPatterns(rootDir);
  const excerpts = [];

  for (const filePath of files) {
    const relativePath = path.relative(rootDir, filePath).replace(/\\/g, '/');
    const content = fs.readFileSync(filePath, 'utf8');
    for (const line of content.split(/\r?\n/)) {
      if (!line.trim()) continue;
      const parsed = parseJsonLine(line);
      if (matchesIncident(line, parsed, { requestId, traceId, surface })) {
        excerpts.push({ file: relativePath, line });
      }
      if (excerpts.length >= maxLines) return excerpts;
    }
  }

  return excerpts;
}

function findLatestFile(dirPath, pattern) {
  if (!fs.existsSync(dirPath)) return null;
  const regex = new RegExp(pattern);
  return fs.readdirSync(dirPath)
    .filter((entry) => regex.test(entry))
    .sort()
    .pop() || null;
}

function collectDeployEvidence(rootDir) {
  const deployStatePath = path.resolve(rootDir, '.deploy-state', 'last_deployed_commit');
  const deployLogsDir = path.resolve(rootDir, 'logs', 'deploy');
  const latestDeploySummary = findLatestFile(deployLogsDir, '^deploy_.*\\.summary\\.txt$');

  return {
    deployed_commit: fs.existsSync(deployStatePath) ? fs.readFileSync(deployStatePath, 'utf8').trim() : null,
    deployed_commit_file: fs.existsSync(deployStatePath) ? '.deploy-state/last_deployed_commit' : null,
    latest_deploy_summary: latestDeploySummary ? `logs/deploy/${latestDeploySummary}` : null
  };
}

async function fetchSnapshot(baseUrl, endpoint) {
  if (!baseUrl || typeof fetch !== 'function') {
    return { skipped: true, reason: 'base URL unavailable' };
  }
  try {
    const response = await fetch(new URL(endpoint, baseUrl), {
      headers: { 'x-request-id': 'incident-bundle-snapshot' }
    });
    const text = await response.text();
    return {
      status: response.status,
      ok: response.ok,
      body: text.slice(0, 20000)
    };
  } catch (error) {
    return { ok: false, error: error.message };
  }
}

function writeMarkdownIndex({ bundle, outputDir }) {
  const lines = [
    '# AI Trace Index',
    '',
    `- Request ID: \`${bundle.filters.request_id || 'not provided'}\``,
    `- Trace ID: \`${bundle.filters.trace_id || 'not provided'}\``,
    `- Surface: \`${bundle.filters.surface || 'not provided'}\``,
    `- Generated at: \`${bundle.generated_at}\``,
    `- Deployed commit: \`${bundle.deploy_evidence.deployed_commit || 'unknown'}\``,
    '',
    '## Files',
    '- `incident_bundle.json` - machine-readable summary and sanitized excerpts',
    '- `sanitized_log_excerpts.ndjson` - sanitized matching log lines',
    '- `reproduction_template.md` - operator/agent reproduction checklist',
    '- `redaction_report.json` - redaction counters',
    '',
    '## Investigation Order',
    '1. Confirm deployed commit and release evidence.',
    '2. Read matching request outcome lines by request or trace ID.',
    '3. Check health and metrics snapshots for degraded services or error spikes.',
    '4. Reproduce with the template using sanitized IDs and route context only.'
  ];
  fs.writeFileSync(path.join(outputDir, 'ai_trace_index.md'), `${lines.join('\n')}\n`);
}

function writeReproductionTemplate({ bundle, outputDir }) {
  const lines = [
    '# Reproduction Template',
    '',
    `Target request_id: ${bundle.filters.request_id || '<fill from incident>'}`,
    `Target trace_id: ${bundle.filters.trace_id || '<fill from incident>'}`,
    `Surface: ${bundle.filters.surface || '<surface>'}`,
    `Deployed commit: ${bundle.deploy_evidence.deployed_commit || '<unknown>'}`,
    '',
    '## Steps',
    '1. Identify the route, method, status, and stable error code from `sanitized_log_excerpts.ndjson`.',
    '2. Reproduce against a non-production environment using equivalent tenant setup and sanitized payload shape.',
    '3. Compare `/health`, `/metrics`, and request outcome logs before and after the reproduction.',
    '4. Do not use raw customer credentials, OTPs, tokens, cookies, or production request bodies.'
  ];
  fs.writeFileSync(path.join(outputDir, 'reproduction_template.md'), `${lines.join('\n')}\n`);
}

async function createIncidentBundle(options = {}) {
  const rootDir = path.resolve(options.rootDir || process.cwd());
  const requestId = options.requestId || options['request-id'] || null;
  const traceId = options.traceId || options['trace-id'] || null;
  const surface = options.surface || null;
  const generatedAt = new Date().toISOString();
  const slug = safeSlug(requestId || traceId || surface || (options.dryRun ? 'dry-run' : 'incident'));
  const outputDir = path.resolve(
    rootDir,
    options.outputDir || options['output-dir'] || path.join('.tmp', 'incident-bundles', `${generatedAt.replace(/[:.]/g, '-')}-${slug}`)
  );
  ensureDir(outputDir);

  const redactor = createRedactor();
  const rawExcerpts = options.dryRun
    ? [{ file: 'dry-run', line: JSON.stringify({ event: 'request_outcome', request_id: requestId || 'dry-run-request', trace_id: traceId || requestId || 'dry-run-request', surface: surface || 'ops', status: 200 }) }]
    : collectLogExcerpts({ rootDir, requestId, traceId, surface });
  const sanitizedExcerpts = rawExcerpts.map((entry) => ({
    file: entry.file,
    line: redactor.redact(entry.line)
  }));

  const bundle = {
    generated_at: generatedAt,
    dry_run: Boolean(options.dryRun),
    filters: {
      request_id: requestId,
      trace_id: traceId,
      surface,
      since: options.since || null,
      until: options.until || null
    },
    deploy_evidence: collectDeployEvidence(rootDir),
    health_snapshot: await fetchSnapshot(options.baseUrl || options['base-url'] || process.env.OBSERVABILITY_BASE_URL, '/health'),
    metrics_snapshot: await fetchSnapshot(options.baseUrl || options['base-url'] || process.env.OBSERVABILITY_BASE_URL, '/metrics'),
    log_excerpt_count: sanitizedExcerpts.length,
    log_excerpt_file: 'sanitized_log_excerpts.ndjson',
    redaction_report_file: 'redaction_report.json'
  };

  fs.writeFileSync(path.join(outputDir, 'sanitized_log_excerpts.ndjson'), sanitizedExcerpts.map((entry) => JSON.stringify(entry)).join('\n') + '\n');
  fs.writeFileSync(path.join(outputDir, 'incident_bundle.json'), JSON.stringify(bundle, null, 2));
  fs.writeFileSync(path.join(outputDir, 'redaction_report.json'), JSON.stringify({ counts: redactor.counts }, null, 2));
  writeMarkdownIndex({ bundle, outputDir });
  writeReproductionTemplate({ bundle, outputDir });

  return { outputDir, bundle };
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const requestId = args['request-id'] || args.requestId || (args['dry-run'] ? 'dry-run-request' : null);
  if (!requestId && !args['trace-id'] && !args.surface) {
    console.error('[incident-bundle] Provide --request-id, --trace-id, --surface, or --dry-run.');
    process.exit(2);
  }

  const result = await createIncidentBundle({
    ...args,
    requestId,
    dryRun: Boolean(args['dry-run'])
  });
  console.log(`[incident-bundle] Wrote ${result.outputDir}`);
}

if (require.main === module) {
  main().catch((error) => {
    console.error(`[incident-bundle] ${error.message}`);
    process.exit(2);
  });
}

module.exports = {
  createIncidentBundle,
  createRedactor,
  collectLogExcerpts,
  collectDeployEvidence,
  parseArgs
};
