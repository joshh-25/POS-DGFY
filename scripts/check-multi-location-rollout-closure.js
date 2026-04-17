#!/usr/bin/env node
/* eslint-disable no-console */
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const repoRoot = process.cwd();
const matrixPath = path.join(
  repoRoot,
  'docs',
  'features',
  'multi-location-inventory',
  'REQUIREMENT_IMPLEMENTATION_MATRIX.md'
);

const parseArgValue = (flag) => {
  const idx = process.argv.indexOf(flag);
  if (idx === -1) return null;
  return process.argv[idx + 1] || null;
};

const handoffArg = parseArgValue('--handoff');
const manifestArg = parseArgValue('--manifest');
const defaultHandoffPath = path.join(
  repoRoot,
  'docs',
  'features',
  'multi-location-inventory',
  'ROLLOUT_HANDOFF_PACKET_WAVE-LOCAL-2026-04-16.md'
);
const handoffPath = handoffArg ? path.resolve(repoRoot, handoffArg) : defaultHandoffPath;
const defaultManifestPath = path.join(
  repoRoot,
  'docs',
  'features',
  'multi-location-inventory',
  'ROLLOUT_HANDOFF_EVIDENCE_WAVE-LOCAL-2026-04-16.json'
);
const manifestPath = manifestArg ? path.resolve(repoRoot, manifestArg) : defaultManifestPath;

const requiredRows = new Set(['ML-01', 'ML-02', 'ML-03', 'ML-05', 'ML-06', 'ML-09', 'ML-12']);
const requiredEvidenceKeys = [
  'backup',
  'restore_drill',
  'backfill_parity',
  'fifo_integrity',
  'drift_monitor_soak',
  'location_stock_parity',
  'rollback_rehearsal',
  'pilot_uat'
];

const isLocalWave = (metadata = {}) => {
  const waveId = String(metadata.wave_id || '').toLowerCase();
  const stage = String(metadata.stage || '').toLowerCase();
  return stage === 'local' || waveId.startsWith('wave-local');
};

const fail = (messages) => {
  console.error('[check:multi-location-rollout] FAILED');
  messages.forEach((line) => console.error(` - ${line}`));
  process.exit(1);
};

if (!fs.existsSync(matrixPath)) {
  fail([`Missing matrix: ${matrixPath}`]);
}
if (!fs.existsSync(handoffPath)) {
  fail([`Missing handoff packet: ${handoffPath}`]);
}
if (!fs.existsSync(manifestPath)) {
  fail([`Missing evidence manifest: ${manifestPath}`]);
}

const matrix = fs.readFileSync(matrixPath, 'utf8');
const handoff = fs.readFileSync(handoffPath, 'utf8');
let manifest;
try {
  manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
} catch (error) {
  fail([`Invalid JSON evidence manifest: ${manifestPath}`, error.message]);
}

const issues = [];
const rowRegex = /^\|\s*(ML-\d+)\s*\|.*\|\s*([^|]+)\s*\|\s*$/gm;
const statusByRow = new Map();
let rowMatch;
while ((rowMatch = rowRegex.exec(matrix)) !== null) {
  statusByRow.set(rowMatch[1], String(rowMatch[2] || '').trim());
}

for (const rowId of requiredRows) {
  const status = statusByRow.get(rowId);
  if (!status) {
    issues.push(`Required row ${rowId} is missing from matrix.`);
    continue;
  }
  if (status !== 'Completed') {
    issues.push(`Required row ${rowId} is not completed (status: ${status}).`);
  }
}

const pendingEvidenceRegex = /\bpending\b/i;
if (pendingEvidenceRegex.test(handoff)) {
  issues.push('Handoff packet still contains pending evidence markers.');
}

const requiredEvidenceLabels = [
  'Backup',
  'Restore drill',
  'Backfill parity',
  'FIFO integrity',
  'Drift monitor soak',
  'Location stock parity',
  'rollback',
  'UAT'
];
for (const label of requiredEvidenceLabels) {
  if (!handoff.toLowerCase().includes(label.toLowerCase())) {
    issues.push(`Handoff packet missing evidence section containing: "${label}".`);
  }
}

if (!manifest || typeof manifest !== 'object' || Array.isArray(manifest)) {
  issues.push('Evidence manifest must be a JSON object.');
} else {
  const metadata = manifest.metadata && typeof manifest.metadata === 'object' ? manifest.metadata : null;
  const evidence = manifest.evidence && typeof manifest.evidence === 'object' ? manifest.evidence : null;

  if (!metadata) {
    issues.push('Evidence manifest missing metadata object.');
  } else {
    if (!metadata.wave_id || typeof metadata.wave_id !== 'string') {
      issues.push('Evidence manifest metadata.wave_id is required.');
    }
    if (!metadata.generated_at || Number.isNaN(Date.parse(metadata.generated_at))) {
      issues.push('Evidence manifest metadata.generated_at must be a valid ISO date.');
    }
    if (!metadata.owner || typeof metadata.owner !== 'string') {
      issues.push('Evidence manifest metadata.owner is required.');
    }
  }

  const localWave = isLocalWave(metadata || {});
  const allowedStatuses = localWave
    ? new Set(['passed', 'waived_local'])
    : new Set(['passed']);

  if (!evidence) {
    issues.push('Evidence manifest missing evidence object.');
  } else {
    for (const key of requiredEvidenceKeys) {
      const row = evidence[key];
      if (!row || typeof row !== 'object' || Array.isArray(row)) {
        issues.push(`Evidence manifest missing object for key: ${key}`);
        continue;
      }

      const status = String(row.status || '').trim().toLowerCase();
      if (!allowedStatuses.has(status)) {
        issues.push(`Evidence "${key}" status must be one of [${[...allowedStatuses].join(', ')}] (found: ${row.status || 'missing'}).`);
      }

      if (status === 'waived_local') {
        const reason = String(row.waiver_reason || '').trim();
        if (!reason) {
          issues.push(`Evidence "${key}" waived_local requires waiver_reason.`);
        }
        continue;
      }

      const artifactPath = typeof row.artifact_path === 'string' ? row.artifact_path.trim() : '';
      if (!artifactPath) {
        issues.push(`Evidence "${key}" artifact_path is required.`);
        continue;
      }

      const resolvedArtifactPath = path.resolve(repoRoot, artifactPath);
      if (!fs.existsSync(resolvedArtifactPath)) {
        issues.push(`Evidence "${key}" artifact_path does not exist: ${artifactPath}`);
        continue;
      }

      const command = typeof row.command === 'string' ? row.command.trim() : '';
      if (!command) {
        issues.push(`Evidence "${key}" command is required.`);
      }

      if (!row.generated_at || Number.isNaN(Date.parse(row.generated_at))) {
        issues.push(`Evidence "${key}" generated_at must be a valid ISO date.`);
      }

      const sha256 = typeof row.sha256 === 'string' ? row.sha256.trim().toLowerCase() : '';
      if (!/^[a-f0-9]{64}$/.test(sha256)) {
        issues.push(`Evidence "${key}" sha256 must be a 64-character hex string.`);
      } else {
        const actualSha = crypto
          .createHash('sha256')
          .update(fs.readFileSync(resolvedArtifactPath))
          .digest('hex');
        if (actualSha !== sha256) {
          issues.push(`Evidence "${key}" sha256 mismatch for artifact: ${artifactPath}`);
        }
      }
    }
  }
}

if (issues.length > 0) {
  fail(issues);
}

console.log('[check:multi-location-rollout] PASS');
