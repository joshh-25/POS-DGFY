#!/usr/bin/env node

const fs = require('fs');
const path = require('path');

function parseArgs(argv) {
  const args = {};
  for (let i = 0; i < argv.length; i += 1) {
    const token = argv[i];
    if (!token.startsWith('--')) {
      continue;
    }
    const key = token.slice(2);
    const next = argv[i + 1];
    if (!next || next.startsWith('--')) {
      args[key] = 'true';
    } else {
      args[key] = next;
      i += 1;
    }
  }
  return args;
}

function fail(message) {
  console.error(`[release-verdict] FAIL: ${message}`);
  process.exit(2);
}

function ok(message) {
  console.log(`[release-verdict] OK: ${message}`);
}

const args = parseArgs(process.argv.slice(2));
const verdictFile = args.file || process.env.RELEASE_VERDICT_FILE || path.join('.tmp', 'release-gates', 'release_verdict.json');
const expectedSha = (args.sha || process.env.RELEASE_TARGET_SHA || process.env.GITHUB_SHA || '').toLowerCase();
const allowMissing = (args['allow-missing'] || process.env.RELEASE_VERDICT_ALLOW_MISSING || '0') === '1' || (args['allow-missing'] || '') === 'true';
const requirePass = (args['require-pass'] || process.env.RELEASE_VERDICT_REQUIRE_PASS || '0') === '1' || (args['require-pass'] || '') === 'true';

if (!fs.existsSync(verdictFile)) {
  if (allowMissing) {
    ok(`Verdict file missing but allowed: ${verdictFile}`);
    process.exit(0);
  }
  fail(`Verdict file missing: ${verdictFile}`);
}

let payload;
try {
  payload = JSON.parse(fs.readFileSync(verdictFile, 'utf8'));
} catch (error) {
  fail(`Invalid JSON in verdict file: ${error.message}`);
}

if (!payload || typeof payload !== 'object') {
  fail('Verdict payload is not an object');
}
if (!payload.generated_at) {
  fail('Missing generated_at');
}
if (!payload.target_sha || typeof payload.target_sha !== 'string') {
  fail('Missing target_sha');
}
if (!['pass', 'fail', 'bypassed'].includes(payload.verdict)) {
  fail(`Invalid verdict value: ${payload.verdict}`);
}
if (!Array.isArray(payload.gates) || payload.gates.length === 0) {
  fail('Missing or empty gates array');
}
if (expectedSha && payload.target_sha.toLowerCase() !== expectedSha) {
  fail(`target_sha mismatch: verdict=${payload.target_sha} expected=${expectedSha}`);
}
if (requirePass && !['pass', 'bypassed'].includes(payload.verdict)) {
  fail(`Release verdict is not deployable: verdict=${payload.verdict}; failed_gate_count=${payload.failed_gate_count ?? 'unknown'}`);
}

ok(`Validated release verdict file: ${verdictFile}`);
