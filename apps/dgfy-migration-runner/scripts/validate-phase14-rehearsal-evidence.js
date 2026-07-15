/**
 * Phase 14 rehearsal-evidence contract validator.
 *
 * Single, zero-dependency executable evidence-contract implementation, invoked
 * unchanged by Plan 10 (post-rehearsal) and Plan 11 (final human review) against
 * `.planning/phases/14-.../14-REHEARSAL-EVIDENCE.json`.
 *
 * WHAT THIS VALIDATES (the meaningful, locally-checkable contract):
 *   - Exact top-level key set and value types.
 *   - Six-entity fidelity: per-entity source===target===first-write, zero retry writes.
 *   - Exact sales totals by status (string/fixed-decimal equality, never float).
 *   - Zero blocking findings; the three attribution codes may remain non-blocking.
 *   - Structured redaction: no credential/hash/snapshot/PII field paths or values.
 *   - Report hash FORMAT (64-char lowercase hex) and safe relative paths.
 *
 * DELIBERATE EXEMPTIONS / DEVIATIONS (see 14-10-SUMMARY.md, operator decision 2026-07-15):
 *   1. product_embedding source-zero exemption ("empty is truthful"): the
 *      production-parity snapshot legitimately contains zero `item_embeddings`
 *      rows across all tenants. A fully-zero embedding entity (source=target=
 *      first=retry=0) is ACCEPTED when, and only when, `exemptions` documents it.
 *   2. Raw report bytes are NOT recomputed here: by disclosure policy the reports
 *      remain on the approved EC2 (they contain credential-hash material) and are
 *      not committed. This validator checks hash format + path safety, not the
 *      recomputed digest of an absent file.
 */

const REQUIRED_BOOLEAN_TRUE_KEYS = [
  'data_migration_ok',
  'exact_sales_totals_match',
  'provenance_ok',
  'relationships_ok',
  'void_fidelity_ok',
  'connections_closed'
];

const REQUIRED_NON_NEGATIVE_INT_KEYS = ['source_volume', 'retry_rows_written', 'blocking_findings'];

const SIX_ENTITY_TYPES = [
  'product_folder',
  'product',
  'inventory_movement',
  'product_embedding',
  'availment',
  'availment_item'
];

const ENTITY_COUNTER_KEYS = ['source_rows', 'target_rows', 'first_rows_written', 'retry_rows_written'];

// Findings that must never appear as blocking (orphan/status integrity failures).
const FORBIDDEN_BLOCKING_REASON_CODES = new Set([
  'UNSUPPORTED_SALE_STATUS',
  'AVAILMENT_PARENT_NOT_MAPPED',
  'SALE_PRODUCT_NOT_MAPPED'
]);

// Attribution findings explicitly permitted to remain open as non-blocking (D-14-02/D-14-03).
const PERMITTED_NON_BLOCKING_ATTRIBUTION = new Set([
  'SALE_LOCATION_NOT_MAPPED',
  'SALE_TERMINAL_NOT_MAPPED',
  'SALE_CASHIER_NOT_MAPPED'
]);

// Sensitive value-bearing field names rejected anywhere in the tree (reports[].sha256 is exempt below).
const SENSITIVE_FIELD_NAMES = new Set([
  'password',
  'password_hash',
  'pin',
  'pos_approval_pin_hash',
  'pin_hash',
  'token',
  'secret',
  'credential',
  'credentials',
  'authorization',
  'connection_string',
  'connectionstring',
  'dsn',
  'legacy_snapshot',
  'snapshot',
  'raw_environment',
  'env_dump'
]);

// Exact synthetic sentinel leaf values that must never leak into evidence.
const FORBIDDEN_SEEDED_VALUES = new Set([
  'SEEDED_CREDENTIAL_SENTINEL',
  'SEEDED_SNAPSHOT_SENTINEL',
  'SEEDED_CUSTOMER_SENTINEL',
  'SEEDED_PAYMENT_SENTINEL',
  'SEEDED_DELIVERY_SENTINEL'
]);

const BCRYPT_VALUE = /\$2[aby]\$\d{2}\$/;
const CONNECTION_URI = /^[a-z][a-z0-9+.-]*:\/\//i;
const SHA256_HEX = /^[0-9a-f]{64}$/;
const COMMAND_NAME = /^[a-z][a-z0-9:_-]*$/i;
const UPPER_SNAKE = /^[A-Z][A-Z0-9_]*$/;
const FIXED_FOUR_DECIMAL = /^-?\d+\.\d{4}$/;

function isPlainObject(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function isNonNegativeInteger(value) {
  return Number.isInteger(value) && value >= 0;
}

/**
 * Recursively reject sensitive field NAMES and sentinel/bcrypt/URI leaf VALUES.
 * `reports[].sha256` integrity digests are explicitly allowed. `reason_code`
 * values are exempt from the secret-word field-name scan (they are a controlled
 * uppercase vocabulary), but their leaf values are still sentinel-checked.
 */
function collectRedactionErrors(value, path, errors, options = {}) {
  const { allowSha256Leaf = false } = options;

  if (typeof value === 'string') {
    if (!allowSha256Leaf) {
      if (BCRYPT_VALUE.test(value)) errors.push(`${path}: contains a bcrypt-shaped credential value`);
      if (CONNECTION_URI.test(value)) errors.push(`${path}: contains a connection URI`);
    }
    if (FORBIDDEN_SEEDED_VALUES.has(value)) errors.push(`${path}: contains a forbidden seeded sentinel value`);
    return;
  }

  if (Array.isArray(value)) {
    value.forEach((entry, index) => collectRedactionErrors(entry, `${path}[${index}]`, errors, options));
    return;
  }

  if (isPlainObject(value)) {
    for (const [key, nested] of Object.entries(value)) {
      const lowerKey = key.toLowerCase();
      if (SENSITIVE_FIELD_NAMES.has(lowerKey)) {
        errors.push(`${path}.${key}: sensitive field name is not allowed in evidence`);
      }
      const nextOptions = { allowSha256Leaf: lowerKey === 'sha256' };
      collectRedactionErrors(nested, `${path}.${key}`, errors, nextOptions);
    }
  }
}

/**
 * Validate a parsed Phase 14 rehearsal-evidence object against the contract.
 * @param {object} evidence Parsed evidence JSON.
 * @returns {{ ok: boolean, errors: string[] }}
 */
export function validatePhase14RehearsalEvidence(evidence) {
  const errors = [];

  if (!isPlainObject(evidence)) {
    return { ok: false, errors: ['evidence: expected a JSON object'] };
  }

  if (evidence.schema_version !== 1) {
    errors.push('schema_version: must be integer 1');
  }

  for (const key of REQUIRED_BOOLEAN_TRUE_KEYS) {
    if (evidence[key] !== true) errors.push(`${key}: must be boolean true`);
  }

  for (const key of REQUIRED_NON_NEGATIVE_INT_KEYS) {
    if (!isNonNegativeInteger(evidence[key])) errors.push(`${key}: must be a non-negative integer`);
  }

  // --- commands ---
  if (!Array.isArray(evidence.commands) || evidence.commands.length === 0) {
    errors.push('commands: must be a non-empty array');
  } else {
    evidence.commands.forEach((command, index) => {
      if (typeof command !== 'string' || !COMMAND_NAME.test(command)) {
        errors.push(`commands[${index}]: must be a bare command name without arguments or secrets`);
      }
    });
  }

  // --- runtime ---
  if (!isPlainObject(evidence.runtime)) {
    errors.push('runtime: must be an object');
  } else {
    const { docker_context: dockerContext, source_tenant: sourceTenant, target_databases: targetDatabases } =
      evidence.runtime;
    if (typeof dockerContext !== 'string' || !dockerContext.trim()) {
      errors.push('runtime.docker_context: must be a non-empty string');
    }
    if (typeof sourceTenant !== 'string' || !sourceTenant.trim()) {
      errors.push('runtime.source_tenant: must be a non-empty string');
    }
    if (
      !Array.isArray(targetDatabases) ||
      targetDatabases.length === 0 ||
      !targetDatabases.every((entry) => typeof entry === 'string' && entry.trim())
    ) {
      errors.push('runtime.target_databases: must be a non-empty array of strings');
    }
  }

  // --- exemptions (optional, documents source-zero carve-outs) ---
  const sourceZeroExemptedEntities = new Set();
  if (evidence.exemptions !== undefined) {
    if (!Array.isArray(evidence.exemptions)) {
      errors.push('exemptions: must be an array when present');
    } else {
      evidence.exemptions.forEach((exemption, index) => {
        if (!isPlainObject(exemption)) {
          errors.push(`exemptions[${index}]: must be an object`);
          return;
        }
        const { entity, kind, reason } = exemption;
        if (typeof entity !== 'string' || !SIX_ENTITY_TYPES.includes(entity)) {
          errors.push(`exemptions[${index}].entity: must be one of the six entity types`);
        }
        if (kind !== 'source_zero') {
          errors.push(`exemptions[${index}].kind: only "source_zero" is supported`);
        }
        if (typeof reason !== 'string' || !reason.trim()) {
          errors.push(`exemptions[${index}].reason: must be a non-empty string`);
        }
        if (typeof entity === 'string' && kind === 'source_zero') {
          sourceZeroExemptedEntities.add(entity);
        }
      });
    }
  }

  // --- entity_counts ---
  let derivedSourceVolume = 0;
  let derivedRetrySum = 0;
  if (!isPlainObject(evidence.entity_counts)) {
    errors.push('entity_counts: must be an object');
  } else {
    const actualKeys = Object.keys(evidence.entity_counts).sort();
    const expectedKeys = [...SIX_ENTITY_TYPES].sort();
    if (actualKeys.length !== expectedKeys.length || !expectedKeys.every((key, i) => key === actualKeys[i])) {
      errors.push(`entity_counts: must contain exactly [${expectedKeys.join(', ')}]`);
    }
    for (const entity of SIX_ENTITY_TYPES) {
      const counts = evidence.entity_counts[entity];
      if (!isPlainObject(counts)) {
        errors.push(`entity_counts.${entity}: must be an object`);
        continue;
      }
      const missingOrBad = ENTITY_COUNTER_KEYS.filter((k) => !isNonNegativeInteger(counts[k]));
      if (missingOrBad.length > 0) {
        errors.push(`entity_counts.${entity}: ${missingOrBad.join(', ')} must be non-negative integers`);
        continue;
      }
      derivedSourceVolume += counts.source_rows;
      derivedRetrySum += counts.retry_rows_written;

      const isSourceZero = counts.source_rows === 0;
      if (isSourceZero) {
        if (!sourceZeroExemptedEntities.has(entity)) {
          errors.push(
            `entity_counts.${entity}: source_rows is 0 and requires a documented "source_zero" exemption`
          );
        }
        if (counts.target_rows !== 0 || counts.first_rows_written !== 0 || counts.retry_rows_written !== 0) {
          errors.push(`entity_counts.${entity}: source-zero entity must have all counters equal to 0`);
        }
      } else {
        if (counts.target_rows !== counts.source_rows) {
          errors.push(`entity_counts.${entity}: target_rows must equal source_rows`);
        }
        if (counts.first_rows_written !== counts.target_rows) {
          errors.push(`entity_counts.${entity}: first_rows_written must equal target_rows`);
        }
        if (counts.retry_rows_written !== 0) {
          errors.push(`entity_counts.${entity}: retry_rows_written must be 0`);
        }
      }
    }

    if (isNonNegativeInteger(evidence.source_volume) && evidence.source_volume !== derivedSourceVolume) {
      errors.push(`source_volume: ${evidence.source_volume} must equal the sum of source_rows (${derivedSourceVolume})`);
    }
    if (isNonNegativeInteger(evidence.retry_rows_written) && evidence.retry_rows_written !== derivedRetrySum) {
      errors.push('retry_rows_written: must equal the per-entity retry sum');
    }
    if (derivedRetrySum !== 0) {
      errors.push('entity_counts: total retry writes must be 0');
    }
  }

  // --- sales_totals_by_status ---
  if (!isPlainObject(evidence.sales_totals_by_status) || Object.keys(evidence.sales_totals_by_status).length === 0) {
    errors.push('sales_totals_by_status: must be a non-empty object');
  } else {
    for (const [status, totals] of Object.entries(evidence.sales_totals_by_status)) {
      if (!isPlainObject(totals)) {
        errors.push(`sales_totals_by_status.${status}: must be an object`);
        continue;
      }
      const { source_total: sourceTotal, target_total: targetTotal } = totals;
      if (typeof sourceTotal !== 'string' || !FIXED_FOUR_DECIMAL.test(sourceTotal)) {
        errors.push(`sales_totals_by_status.${status}.source_total: must be a fixed-four-decimal string`);
      }
      if (typeof targetTotal !== 'string' || !FIXED_FOUR_DECIMAL.test(targetTotal)) {
        errors.push(`sales_totals_by_status.${status}.target_total: must be a fixed-four-decimal string`);
      }
      if (
        typeof sourceTotal === 'string' &&
        typeof targetTotal === 'string' &&
        sourceTotal !== targetTotal
      ) {
        errors.push(`sales_totals_by_status.${status}: source_total and target_total must match exactly`);
      }
    }
  }

  // --- open_findings ---
  let derivedBlockingCount = 0;
  if (!Array.isArray(evidence.open_findings)) {
    errors.push('open_findings: must be an array');
  } else {
    evidence.open_findings.forEach((finding, index) => {
      if (!isPlainObject(finding)) {
        errors.push(`open_findings[${index}]: must be an object`);
        return;
      }
      const { reason_code: reasonCode, blocking, count } = finding;
      if (typeof reasonCode !== 'string' || !UPPER_SNAKE.test(reasonCode)) {
        errors.push(`open_findings[${index}].reason_code: must be UPPER_SNAKE_CASE`);
      }
      if (typeof blocking !== 'boolean') {
        errors.push(`open_findings[${index}].blocking: must be a boolean`);
      }
      if (!Number.isInteger(count) || count <= 0) {
        errors.push(`open_findings[${index}].count: must be a positive integer`);
      }
      if (blocking === true) {
        derivedBlockingCount += Number.isInteger(count) ? count : 0;
      }
      if (typeof reasonCode === 'string' && FORBIDDEN_BLOCKING_REASON_CODES.has(reasonCode) && blocking === true) {
        errors.push(`open_findings[${index}].reason_code: ${reasonCode} must never be blocking`);
      }
      if (
        typeof reasonCode === 'string' &&
        PERMITTED_NON_BLOCKING_ATTRIBUTION.has(reasonCode) &&
        blocking === true
      ) {
        errors.push(`open_findings[${index}].reason_code: ${reasonCode} must remain non-blocking`);
      }
    });
    if (isNonNegativeInteger(evidence.blocking_findings) && evidence.blocking_findings !== derivedBlockingCount) {
      errors.push('blocking_findings: must equal the sum of blocking finding counts');
    }
    if (derivedBlockingCount !== 0) {
      errors.push('open_findings: total blocking findings must be 0');
    }
  }

  // --- reports (hash format + path safety; raw bytes live on the approved EC2) ---
  if (!Array.isArray(evidence.reports) || evidence.reports.length === 0) {
    errors.push('reports: must be a non-empty array');
  } else {
    evidence.reports.forEach((report, index) => {
      if (!isPlainObject(report)) {
        errors.push(`reports[${index}]: must be an object`);
        return;
      }
      const { path: reportPath, sha256 } = report;
      if (typeof reportPath !== 'string' || !reportPath.trim()) {
        errors.push(`reports[${index}].path: must be a non-empty string`);
      } else if (reportPath.startsWith('/') || reportPath.split(/[\\/]/).includes('..')) {
        errors.push(`reports[${index}].path: must be a safe relative path (no leading slash, no "..")`);
      }
      if (typeof sha256 !== 'string' || !SHA256_HEX.test(sha256)) {
        errors.push(`reports[${index}].sha256: must be a 64-character lowercase hex digest`);
      }
    });
  }

  // --- final verdict ---
  if (evidence.final_verdict !== 'pass') {
    errors.push('final_verdict: must be the string "pass"');
  }

  // --- structured redaction over the whole document ---
  collectRedactionErrors(evidence, '$', errors);

  return { ok: errors.length === 0, errors };
}

// --- CLI ---------------------------------------------------------------------
function isMainModule() {
  if (!process.argv[1]) return false;
  const invoked = process.argv[1].replace(/\\/g, '/');
  return invoked.endsWith('validate-phase14-rehearsal-evidence.js');
}

if (isMainModule()) {
  const evidencePath = process.argv[2];
  if (!evidencePath) {
    // eslint-disable-next-line no-console
    console.error('Usage: node validate-phase14-rehearsal-evidence.js <evidence.json>');
    process.exit(2);
  }
  const { readFileSync } = await import('node:fs');
  let parsed;
  try {
    parsed = JSON.parse(readFileSync(evidencePath, 'utf8'));
  } catch (error) {
    // eslint-disable-next-line no-console
    console.error(`Failed to read/parse ${evidencePath}: ${error.message}`);
    process.exit(2);
  }
  const { ok, errors } = validatePhase14RehearsalEvidence(parsed);
  if (ok) {
    // eslint-disable-next-line no-console
    console.log(`OK: ${evidencePath} satisfies the Phase 14 rehearsal-evidence contract.`);
    process.exit(0);
  }
  // eslint-disable-next-line no-console
  console.error(`FAILED: ${evidencePath} violates the Phase 14 rehearsal-evidence contract:`);
  for (const error of errors) {
    // eslint-disable-next-line no-console
    console.error(`  - ${error}`);
  }
  process.exit(1);
}
