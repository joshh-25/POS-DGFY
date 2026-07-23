// NOTE (WR-05): loading a real .env file is a process-entrypoint concern,
// not something this module should do at import time — see cli.js's main()
// for the actual dotenv.config() call. Keeping this module free of
// import-time side effects means it can be safely imported by tests (or any
// other command module) without ever touching the filesystem or silently
// injecting values into process.env ahead of an explicit env argument.
export const RUNTIME_MODES = ['development', 'staging', 'production'];
export const TARGET_DB_NAME_PATTERN = /^dgfy_[a-z0-9_]+$/;
// Plan 03 (D-02/D-03): per-business operational databases are named
// dgfy_business_<stable_opaque_suffix> — the suffix must be a non-empty
// opaque identifier, never a sanitized/derived business display name.
export const BUSINESS_DB_NAME_PATTERN = /^dgfy_business_[a-z0-9][a-z0-9_]*$/;

const REQUIRED_NON_EMPTY_VARS = [
    'SOURCE_DB_HOST',
    'SOURCE_DB_USER',
    'SOURCE_DB_PASSWORD',
    'SOURCE_DB_NAME',
    'TARGET_DB_HOST',
    'TARGET_DB_USER',
    'TARGET_DB_PASSWORD'
];

function isBlank(value) {
    return value === undefined || value === null || String(value).trim() === '';
}

/**
 * Plan 03 (D-02/D-03/T-02-03-01): parses the optional comma-separated
 * DGFY_BUSINESS_DB_NAMES env var into an explicit target-list of
 * dgfy_business_* database names for the schema command to migrate. Pure
 * function — no I/O, no connection — so invalid/legacy/display-derived
 * names are rejected here, before any connection is opened (RUN-03).
 *
 * @param {string|undefined} rawValue
 * @returns {{ names: string[], errors: string[] }}
 */
function parseBusinessDbNames(rawValue) {
    if (isBlank(rawValue)) {
        return { names: [], errors: [] };
    }

    const entries = String(rawValue).split(',').map((entry) => entry.trim());
    const errors = [];
    const names = [];

    entries.forEach((entry, index) => {
        if (entry === '') {
            errors.push(`DGFY_BUSINESS_DB_NAMES entry at position ${index + 1} is empty`);
            return;
        }
        if (!BUSINESS_DB_NAME_PATTERN.test(entry)) {
            errors.push(
                `DGFY_BUSINESS_DB_NAMES entry "${entry}" does not match required pattern ${BUSINESS_DB_NAME_PATTERN}`
            );
            return;
        }
        names.push(entry);
    });

    return { names, errors };
}

/**
 * Plan 03 (D-01, T-03-01-01): pure parse of DGFY_MIGRATION_TARGET_MANIFEST
 * into a validated (but unread) file path. Never touches the filesystem —
 * the manifest's own JSON contents are loaded/validated separately by
 * src/data/targetManifest.js only after this env-level check passes, and
 * only once the caller has an explicit config object in hand.
 *
 * @param {string|undefined} rawValue
 * @returns {{ path: string|null, errors: string[] }}
 */
function parseMigrationTargetManifestPath(rawValue) {
    if (isBlank(rawValue)) {
        return { path: null, errors: [] };
    }
    return { path: String(rawValue).trim(), errors: [] };
}

/**
 * Pure validation of the runner's environment contract. Never opens a DB
 * connection, never imports a DB client — RUN-03 requires this ordering to
 * be structurally guaranteed, not just conventional.
 *
 * @param {NodeJS.ProcessEnv} env
 * @param {{ requireMigrationManifest?: boolean }} options Plan 03 (D-01):
 *   pass `{ requireMigrationManifest: true }` from `data dry-run`/`data
 *   apply`/`verify` command handlers — those are the only callers for whom
 *   DGFY_MIGRATION_TARGET_MANIFEST is mandatory. Defaults to false so
 *   `schema`/`status`/`rollback-plan` and existing tests are unaffected.
 * @returns {{ valid: boolean, errors: string[], config: object|null }}
 */
export function validateEnv(env = process.env, { requireMigrationManifest = false } = {}) {
    const errors = [];

    const runtimeMode = env.RUNTIME_MODE || 'development';
    if (!RUNTIME_MODES.includes(runtimeMode)) {
        errors.push(`RUNTIME_MODE "${runtimeMode}" is invalid — must be one of ${RUNTIME_MODES.join(', ')}`);
    }

    REQUIRED_NON_EMPTY_VARS.forEach((key) => {
        if (isBlank(env[key])) {
            errors.push(`${key} is required and must not be empty`);
        }
    });

    if (isBlank(env.TARGET_DB_NAME)) {
        errors.push('TARGET_DB_NAME is required and must not be empty');
    } else if (!TARGET_DB_NAME_PATTERN.test(env.TARGET_DB_NAME)) {
        errors.push(`TARGET_DB_NAME "${env.TARGET_DB_NAME}" does not match required pattern ${TARGET_DB_NAME_PATTERN}`);
    }

    const actor = env.MIGRATION_ACTOR || 'unknown';
    if (runtimeMode === 'production' && (isBlank(env.MIGRATION_ACTOR) || actor === 'unknown')) {
        errors.push('MIGRATION_ACTOR is required and must not be the "unknown" fallback when RUNTIME_MODE=production');
    }

    // Plan 03 (D-02/D-03): explicit dgfy_business_* target-list for initial
    // tenant coverage. Invalid/legacy/display-derived entries are rejected
    // here — before any connection is opened — never silently dropped.
    const { names: businessDbNames, errors: businessDbNameErrors } = parseBusinessDbNames(env.DGFY_BUSINESS_DB_NAMES);
    errors.push(...businessDbNameErrors);

    // Plan 03 (D-01): explicit migration target manifest path. Structurally
    // validated as a non-blank string only — the file itself is never read
    // here (side-effect-free contract, RUN-03).
    const { path: migrationTargetManifestPath, errors: manifestPathErrors } = parseMigrationTargetManifestPath(
        env.DGFY_MIGRATION_TARGET_MANIFEST
    );
    errors.push(...manifestPathErrors);

    if (requireMigrationManifest && migrationTargetManifestPath === null) {
        errors.push(
            'DGFY_MIGRATION_TARGET_MANIFEST is required for data dry-run/apply/verify usage and must not be empty (D-01)'
        );
    }

    if (errors.length > 0) {
        return { valid: false, errors, config: null };
    }

    const config = {
        runtimeMode,
        sourceDb: {
            host: env.SOURCE_DB_HOST,
            port: Number.parseInt(env.SOURCE_DB_PORT, 10) || 3306,
            user: env.SOURCE_DB_USER,
            password: env.SOURCE_DB_PASSWORD,
            name: env.SOURCE_DB_NAME
        },
        targetDb: {
            host: env.TARGET_DB_HOST,
            port: Number.parseInt(env.TARGET_DB_PORT, 10) || 3306,
            user: env.TARGET_DB_USER,
            password: env.TARGET_DB_PASSWORD,
            name: env.TARGET_DB_NAME
        },
        metaDb: {
            name: 'dgfy_migration_meta'
        },
        // D-20: default to the container-safe absolute mount point. The
        // Dockerfile pre-creates and chowns /reports; a relative default
        // would silently resolve against WORKDIR /app instead, losing
        // reports the moment the container is removed (WR-08). Local/dev
        // usage overrides this via REPORT_DIR in .env.
        reportDir: env.REPORT_DIR || '/reports',
        actor,
        // Plan 03 (D-02/D-08): explicit initial-verification business target
        // list. Empty when unset — the schema command then migrates only
        // TARGET_DB_NAME (unchanged single-target behavior).
        businessDbNames,
        // Plan 03 (D-01): null when unset (schema/status/rollback-plan don't
        // require it); data dry-run/apply/verify pass
        // { requireMigrationManifest: true } to enforce presence.
        migrationTargetManifestPath
    };

    return { valid: true, errors: [], config };
}
