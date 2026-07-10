// NOTE (WR-05): loading a real .env file is a process-entrypoint concern,
// not something this module should do at import time — see cli.js's main()
// for the actual dotenv.config() call. Keeping this module free of
// import-time side effects means it can be safely imported by tests (or any
// other command module) without ever touching the filesystem or silently
// injecting values into process.env ahead of an explicit env argument.
export const RUNTIME_MODES = ['development', 'staging', 'production'];
export const TARGET_DB_NAME_PATTERN = /^dgfy_[a-z0-9_]+$/;

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
 * Pure validation of the runner's environment contract. Never opens a DB
 * connection, never imports a DB client — RUN-03 requires this ordering to
 * be structurally guaranteed, not just conventional.
 *
 * @param {NodeJS.ProcessEnv} env
 * @returns {{ valid: boolean, errors: string[], config: object|null }}
 */
export function validateEnv(env = process.env) {
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
        reportDir: env.REPORT_DIR || './reports',
        actor
    };

    return { valid: true, errors: [], config };
}
