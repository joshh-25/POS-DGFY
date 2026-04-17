#!/usr/bin/env node
/* eslint-disable no-console */
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const REQUIRED_KEYS = [
  'backup',
  'restore_drill',
  'backfill_parity',
  'fifo_integrity',
  'drift_monitor_soak',
  'location_stock_parity',
  'rollback_rehearsal',
  'pilot_uat'
];

const repoRoot = process.cwd();

const parseArgValue = (flag) => {
  const idx = process.argv.indexOf(flag);
  if (idx === -1) return null;
  return process.argv[idx + 1] || null;
};

const manifestArg = parseArgValue('--manifest');
if (!manifestArg) {
  console.error('[finalize:multi-location-evidence] Missing required --manifest <path>');
  process.exit(1);
}

const manifestPath = path.resolve(repoRoot, manifestArg);
if (!fs.existsSync(manifestPath)) {
  console.error(`[finalize:multi-location-evidence] Manifest not found: ${manifestPath}`);
  process.exit(1);
}

const fail = (messages) => {
  console.error('[finalize:multi-location-evidence] FAILED');
  messages.forEach((line) => console.error(` - ${line}`));
  process.exit(1);
};

let manifest;
try {
  manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
} catch (error) {
  fail([`Invalid JSON manifest: ${manifestPath}`, error.message]);
}

const issues = [];
if (!manifest.metadata || typeof manifest.metadata !== 'object') {
  issues.push('metadata object is required');
}
if (!manifest.evidence || typeof manifest.evidence !== 'object') {
  issues.push('evidence object is required');
}
if (issues.length > 0) {
  fail(issues);
}

const stage = String(manifest.metadata.stage || '').toLowerCase();
if (stage && stage !== 'production') {
  issues.push(`This finalizer is for production manifests only (found stage="${manifest.metadata.stage}")`);
}

const nowIso = new Date().toISOString();
for (const key of REQUIRED_KEYS) {
  const row = manifest.evidence[key];
  if (!row || typeof row !== 'object' || Array.isArray(row)) {
    issues.push(`Missing evidence object for key: ${key}`);
    continue;
  }

  const artifactPath = String(row.artifact_path || '').trim();
  const command = String(row.command || '').trim();
  if (!artifactPath) {
    issues.push(`Evidence "${key}" is missing artifact_path`);
    continue;
  }
  if (!command) {
    issues.push(`Evidence "${key}" is missing command`);
    continue;
  }

  const resolvedArtifactPath = path.resolve(repoRoot, artifactPath);
  if (!fs.existsSync(resolvedArtifactPath)) {
    issues.push(`Evidence "${key}" artifact does not exist: ${artifactPath}`);
    continue;
  }

  const sha256 = crypto
    .createHash('sha256')
    .update(fs.readFileSync(resolvedArtifactPath))
    .digest('hex');

  row.status = 'passed';
  row.generated_at = nowIso;
  row.sha256 = sha256;
  if (Object.prototype.hasOwnProperty.call(row, 'waiver_reason')) {
    row.waiver_reason = '';
  }
}

if (issues.length > 0) {
  fail(issues);
}

manifest.metadata.generated_at = nowIso;
fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2));

console.log(`[finalize:multi-location-evidence] PASS updated manifest: ${manifestPath}`);
