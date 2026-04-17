#!/usr/bin/env node
/* eslint-disable no-console */
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const repoRoot = process.cwd();
const parseArgValue = (flag) => {
  const idx = process.argv.indexOf(flag);
  if (idx === -1) return null;
  return process.argv[idx + 1] || null;
};

const manifestArg = parseArgValue('--manifest');
const defaultManifestPath = path.join(
  repoRoot,
  'docs',
  'features',
  'multi-location-inventory',
  'ROLLOUT_HANDOFF_EVIDENCE_WAVE-LOCAL-2026-04-16.json'
);
const manifestPath = manifestArg ? path.resolve(repoRoot, manifestArg) : defaultManifestPath;

if (!fs.existsSync(manifestPath)) {
  console.error(`[refresh:evidence] missing manifest: ${manifestPath}`);
  process.exit(1);
}

const nowIso = new Date().toISOString();
const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
if (!manifest.metadata || typeof manifest.metadata !== 'object') {
  manifest.metadata = {};
}
manifest.metadata.generated_at = nowIso;

const evidence = manifest.evidence && typeof manifest.evidence === 'object'
  ? manifest.evidence
  : {};

for (const [key, row] of Object.entries(evidence)) {
  if (!row || typeof row !== 'object') continue;
  const status = String(row.status || '').trim().toLowerCase();
  if (status === 'passed') {
    const artifactPath = String(row.artifact_path || '').trim();
    if (!artifactPath) {
      console.error(`[refresh:evidence] ${key}: artifact_path required for passed status`);
      process.exit(1);
    }
    const resolved = path.resolve(repoRoot, artifactPath);
    if (!fs.existsSync(resolved)) {
      console.error(`[refresh:evidence] ${key}: artifact missing: ${artifactPath}`);
      process.exit(1);
    }
    row.sha256 = crypto.createHash('sha256').update(fs.readFileSync(resolved)).digest('hex');
    row.generated_at = nowIso;
  } else if (status === 'waived_local') {
    row.sha256 = '';
    row.generated_at = nowIso;
  }
}

fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2));
console.log(`[refresh:evidence] updated manifest: ${manifestPath}`);
