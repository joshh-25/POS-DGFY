import { TARGET_DB_NAME_PATTERN } from '../config/env.js';
import { TargetGuardError } from '../utils/errors.js';

/**
 * Guards against operating against a non-dgfy_-prefixed database name,
 * regardless of runtime mode (per D-12). Imports the pattern from
 * config/env.js rather than redefining it.
 *
 * @param {string} dbName
 * @param {string} runtimeMode
 * @returns {true}
 */
export function assertTargetDbNameAllowed(dbName, runtimeMode) {
    if (!TARGET_DB_NAME_PATTERN.test(dbName)) {
        throw new TargetGuardError(
            `TARGET_DB_NAME "${dbName}" does not match required pattern ${TARGET_DB_NAME_PATTERN} (runtime_mode=${runtimeMode})`
        );
    }
    return true;
}
