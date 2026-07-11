import { readFile } from 'fs/promises';

// Plan 03 (D-01/D-02): mirrors config/env.js's BUSINESS_DB_NAME_PATTERN so a
// manifest's target_business_db_name is held to the same
// dgfy_business_<stable_opaque_suffix> naming contract before any connection
// is opened.
export const BUSINESS_DB_NAME_PATTERN = /^dgfy_business_[a-z0-9][a-z0-9_]*$/;

const REQUIRED_ENTRY_FIELDS = [
    'legacy_tenant_id',
    'legacy_tenant_db_name',
    'target_business_db_name',
    'expected_business_id',
    'expected_owner_account_id'
];

function isBlank(value) {
    return value === undefined || value === null || String(value).trim() === '';
}

/**
 * Plan 03 (D-01, T-03-01-01): pure validation of a parsed migration target
 * manifest payload. Never opens a DB connection and never touches the
 * filesystem — RUN-03/D-01 require the explicit operator-supplied target
 * list to be fully validated before any source or target connection factory
 * is called. Rejects an empty manifest, duplicate legacy tenant IDs,
 * duplicate legacy tenant DB names, duplicate target business DB names,
 * malformed/invalid `dgfy_business_*` target names, and any entry missing a
 * required field — the runner must never auto-discover or infer targets.
 *
 * @param {unknown} payload parsed JSON manifest contents
 * @returns {{ valid: boolean, errors: string[], targets: object[]|null }}
 */
export function validateMigrationTargetManifest(payload) {
    const errors = [];

    if (!Array.isArray(payload)) {
        return {
            valid: false,
            errors: ['Migration target manifest must be a JSON array of target objects'],
            targets: null
        };
    }

    if (payload.length === 0) {
        return {
            valid: false,
            errors: ['Migration target manifest must not be empty — explicit operator-supplied targets are required (D-01)'],
            targets: null
        };
    }

    const legacyTenantIds = new Set();
    const legacyTenantDbNames = new Set();
    const targetBusinessDbNames = new Set();
    const targets = [];

    payload.forEach((entry, index) => {
        const position = index + 1;

        if (entry === null || typeof entry !== 'object' || Array.isArray(entry)) {
            errors.push(`Migration target manifest entry at position ${position} must be an object`);
            return;
        }

        const missingFields = REQUIRED_ENTRY_FIELDS.filter((field) => isBlank(entry[field]));
        if (missingFields.length > 0) {
            errors.push(
                `Migration target manifest entry at position ${position} is missing required field(s): ${missingFields.join(', ')}`
            );
            return;
        }

        const legacyTenantId = String(entry.legacy_tenant_id).trim();
        const legacyTenantDbName = String(entry.legacy_tenant_db_name).trim();
        const targetBusinessDbName = String(entry.target_business_db_name).trim();
        const expectedBusinessId = String(entry.expected_business_id).trim();
        const expectedOwnerAccountId = String(entry.expected_owner_account_id).trim();

        // D-01: a legacy source database must never itself be a dgfy_*
        // target name — that would silently redirect migration reads onto
        // an already-migrated DGFY-owned database.
        if (/^dgfy_/i.test(legacyTenantDbName)) {
            errors.push(
                `Migration target manifest entry at position ${position} has legacy_tenant_db_name "${legacyTenantDbName}" which looks like a DGFY target name, not a legacy source database`
            );
        }

        if (!BUSINESS_DB_NAME_PATTERN.test(targetBusinessDbName)) {
            errors.push(
                `Migration target manifest entry at position ${position} has target_business_db_name "${targetBusinessDbName}" which does not match required pattern ${BUSINESS_DB_NAME_PATTERN}`
            );
        }

        if (legacyTenantIds.has(legacyTenantId)) {
            errors.push(`Migration target manifest has duplicate legacy_tenant_id "${legacyTenantId}"`);
        }
        legacyTenantIds.add(legacyTenantId);

        if (legacyTenantDbNames.has(legacyTenantDbName)) {
            errors.push(`Migration target manifest has duplicate legacy_tenant_db_name "${legacyTenantDbName}"`);
        }
        legacyTenantDbNames.add(legacyTenantDbName);

        if (targetBusinessDbNames.has(targetBusinessDbName)) {
            errors.push(`Migration target manifest has duplicate target_business_db_name "${targetBusinessDbName}"`);
        }
        targetBusinessDbNames.add(targetBusinessDbName);

        targets.push({
            legacy_tenant_id: legacyTenantId,
            legacy_tenant_db_name: legacyTenantDbName,
            target_business_db_name: targetBusinessDbName,
            expected_business_id: expectedBusinessId,
            expected_owner_account_id: expectedOwnerAccountId
        });
    });

    if (errors.length > 0) {
        return { valid: false, errors, targets: null };
    }

    return { valid: true, errors: [], targets };
}

/**
 * Reads and parses the JSON migration target manifest file at `filePath`,
 * then validates it via validateMigrationTargetManifest(). Filesystem/JSON
 * errors are captured as structured errors (never thrown) so callers can
 * treat this the same way as validateEnv()'s {valid, errors, config}
 * contract — the caller decides whether to wrap a failure into a thrown
 * error type.
 *
 * @param {string} filePath
 * @returns {Promise<{ valid: boolean, errors: string[], targets: object[]|null }>}
 */
export async function loadMigrationTargetManifest(filePath) {
    if (isBlank(filePath)) {
        return { valid: false, errors: ['Migration target manifest file path is required'], targets: null };
    }

    let raw;
    try {
        raw = await readFile(filePath, 'utf8');
    } catch (error) {
        return {
            valid: false,
            errors: [`Failed to read migration target manifest at "${filePath}": ${error.message}`],
            targets: null
        };
    }

    let payload;
    try {
        payload = JSON.parse(raw);
    } catch (error) {
        return {
            valid: false,
            errors: [`Failed to parse migration target manifest at "${filePath}" as JSON: ${error.message}`],
            targets: null
        };
    }

    return validateMigrationTargetManifest(payload);
}
