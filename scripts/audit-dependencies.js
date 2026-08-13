#!/usr/bin/env node
/**
 * Multi-tree `npm audit` runner (#381).
 *
 * The scripts this replaces (`audit:dependencies`, `audit:dependencies:prod`)
 * were `&&`-chained: `npm audit --json && npm --prefix apps/dgfy-api audit
 * --json && npm --prefix apps/dgfy-web audit --json`. Because `npm audit`
 * exits non-zero the moment it finds anything, the first tree with a
 * vulnerability silently prevented the remaining trees from ever being
 * audited — not skipped-and-reported, never executed (#381, #380).
 *
 * This runner audits every tree unconditionally and reports each one
 * independently, then aggregates. FAIL-CLOSED: a leg that fails to launch,
 * whose output does not parse as the expected `npm audit --json` shape, or
 * whose own report carries an `error` field (e.g. registry unreachable) is
 * always treated as a failure — never assumed pass, matching the doctrine in
 * `scripts/gate-release-dgfy-evidence.js`.
 *
 * Findings can be suppressed via the checked-in allowlist at
 * `security/audit-allowlist.json` — see that file's header for the schema.
 * Every suppression must carry a written reason; suppressed findings are
 * still printed, just not counted toward failure.
 */

const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');

const ROOT = path.resolve(__dirname, '..');
const ALLOWLIST_PATH = path.join(ROOT, 'security', 'audit-allowlist.json');

const TREES = [
  { name: 'root', dir: '.' },
  { name: 'apps/dgfy-api', dir: 'apps/dgfy-api' },
  { name: 'apps/dgfy-web', dir: 'apps/dgfy-web' },
  { name: 'apps/dgfy-migration-runner', dir: 'apps/dgfy-migration-runner' },
];

const SEVERITY_ORDER = ['critical', 'high', 'moderate', 'low', 'info'];

function loadAllowlist() {
  if (!fs.existsSync(ALLOWLIST_PATH)) return [];
  const raw = fs.readFileSync(ALLOWLIST_PATH, 'utf8');
  let parsed;
  try {
    parsed = JSON.parse(raw);
  } catch (error) {
    throw new Error(`Unable to parse allowlist ${path.relative(ROOT, ALLOWLIST_PATH)}: ${error.message}`);
  }
  const entries = Array.isArray(parsed.entries) ? parsed.entries : [];
  for (const entry of entries) {
    if (!entry.tree || !entry.package || !entry.reason) {
      throw new Error(
        `Allowlist entry missing required field(s) (tree, package, reason): ${JSON.stringify(entry)}`
      );
    }
  }
  return entries;
}

function isAllowlisted(allowlist, treeName, packageName) {
  return allowlist.find((entry) => entry.tree === treeName && entry.package === packageName) || null;
}

function runNpmAudit(tree, omitDev) {
  const args = ['audit', '--json'];
  if (omitDev) args.push('--omit=dev');
  const cwd = path.join(ROOT, tree.dir);
  const result = spawnSync('npm', args, {
    cwd,
    encoding: 'utf8',
    maxBuffer: 64 * 1024 * 1024,
    shell: false,
    env: process.env,
  });

  if (result.error) {
    return { ok: false, error: `command failed to launch: ${result.error.message}` };
  }

  const stdout = String(result.stdout || '').trim();
  if (!stdout) {
    return { ok: false, error: `no output from npm audit (exit ${result.status}, stderr: ${String(result.stderr || '').trim()})` };
  }

  let report;
  try {
    report = JSON.parse(stdout);
  } catch (error) {
    return { ok: false, error: `could not parse npm audit output as JSON: ${error.message}` };
  }

  if (report.error) {
    return { ok: false, error: `npm audit reported an error: ${report.error.summary || JSON.stringify(report.error)}` };
  }

  return { ok: true, report };
}

function auditTree(tree, omitDev, allowlist) {
  const outcome = runNpmAudit(tree, omitDev);
  if (!outcome.ok) {
    return {
      tree: tree.name,
      ok: false,
      reason: outcome.error,
      vulnerabilities: [],
      suppressed: [],
    };
  }

  const vulnerabilities = outcome.report.vulnerabilities || {};
  const findings = [];
  const suppressed = [];

  for (const [packageName, vuln] of Object.entries(vulnerabilities)) {
    const allowEntry = isAllowlisted(allowlist, tree.name, packageName);
    const record = {
      package: packageName,
      severity: vuln.severity,
      range: vuln.range,
      direct: Boolean(vuln.isDirect),
    };
    if (allowEntry) {
      suppressed.push({ ...record, reason: allowEntry.reason, reviewBy: allowEntry.reviewBy || null });
    } else {
      findings.push(record);
    }
  }

  findings.sort((a, b) => SEVERITY_ORDER.indexOf(a.severity) - SEVERITY_ORDER.indexOf(b.severity));

  return {
    tree: tree.name,
    ok: findings.length === 0,
    findings,
    suppressed,
  };
}

function summarizeCounts(records) {
  const counts = {};
  for (const record of records) {
    counts[record.severity] = (counts[record.severity] || 0) + 1;
  }
  return SEVERITY_ORDER.filter((sev) => counts[sev]).map((sev) => `${counts[sev]} ${sev}`).join(', ') || 'none';
}

function main() {
  const omitDev = process.argv.includes('--omit-dev');
  const allowlist = loadAllowlist();
  const results = TREES.map((tree) => auditTree(tree, omitDev, allowlist));

  let anyFailed = false;
  for (const result of results) {
    if (!result.ok && result.reason) {
      anyFailed = true;
      console.log(`[FAIL] ${result.tree} :: audit could not be verified — ${result.reason}`);
      continue;
    }

    const status = result.ok ? 'PASS' : 'FAIL';
    if (!result.ok) anyFailed = true;
    console.log(`[${status}] ${result.tree} :: ${result.findings.length} vulnerabilities (${summarizeCounts(result.findings)})`);
    for (const finding of result.findings) {
      console.log(`         - ${finding.package} [${finding.severity}] range=${finding.range} direct=${finding.direct}`);
    }
    for (const entry of result.suppressed) {
      console.log(`         (suppressed) ${entry.package} [${entry.severity}] :: ${entry.reason}`);
    }
  }

  const mode = omitDev ? 'audit:dependencies:prod' : 'audit:dependencies';
  console.log(`[audit-dependencies] ${mode} :: ${anyFailed ? 'FAIL' : 'PASS'} across ${TREES.length} trees`);

  if (anyFailed) process.exit(2);
}

if (require.main === module) {
  try {
    main();
  } catch (error) {
    console.error(`[audit-dependencies] ${error.message}`);
    process.exit(1);
  }
}

module.exports = {
  TREES,
  loadAllowlist,
  isAllowlisted,
  auditTree,
  summarizeCounts,
};
