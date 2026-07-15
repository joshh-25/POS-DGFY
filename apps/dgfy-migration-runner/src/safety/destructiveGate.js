import { DestructiveOperationError } from '../utils/errors.js';

/**
 * Guards destructive command execution. Per D-09, "destructive" classification
 * is computed by the caller (data apply mode, or schema DDL that drops/lossily
 * alters/truncates) — this function stays generic, taking a pre-computed
 * isDestructive boolean. Non-destructive commands never require the flag.
 *
 * @param {{ isDestructive: boolean, confirmDestructive: boolean, runtimeMode: string }} params
 * @returns {true}
 */
export function assertDestructiveAllowed({ isDestructive, confirmDestructive, runtimeMode }) {
    if (isDestructive && !confirmDestructive) {
        throw new DestructiveOperationError(
            `Destructive operation requires --confirm-destructive (runtime_mode=${runtimeMode})`
        );
    }
    return true;
}
