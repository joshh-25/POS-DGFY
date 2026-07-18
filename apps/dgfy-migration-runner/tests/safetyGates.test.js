import { assertDestructiveAllowed } from '../src/safety/destructiveGate.js';
import { assertTargetDbNameAllowed } from '../src/safety/targetGuard.js';
import { DestructiveOperationError, TargetGuardError, createCommandFailureRecord } from '../src/utils/errors.js';

describe('assertDestructiveAllowed', () => {
    test('throws DestructiveOperationError when destructive and not confirmed', () => {
        expect(() => assertDestructiveAllowed({
            isDestructive: true,
            confirmDestructive: false,
            runtimeMode: 'production'
        })).toThrow(DestructiveOperationError);
    });

    test('returns true when destructive and confirmed', () => {
        expect(assertDestructiveAllowed({
            isDestructive: true,
            confirmDestructive: true,
            runtimeMode: 'production'
        })).toBe(true);
    });

    test('returns true for non-destructive operations without confirmation', () => {
        expect(assertDestructiveAllowed({
            isDestructive: false,
            confirmDestructive: false,
            runtimeMode: 'development'
        })).toBe(true);
    });
});

describe('assertTargetDbNameAllowed', () => {
    test('throws TargetGuardError for a legacy DB name', () => {
        expect(() => assertTargetDbNameAllowed('sku_inventory_manager', 'production')).toThrow(TargetGuardError);
    });

    test('returns true for a valid dgfy_ prefixed DB name', () => {
        expect(assertTargetDbNameAllowed('dgfy_landlord', 'production')).toBe(true);
    });
});

describe('createCommandFailureRecord', () => {
    test('returns a record with a 16-character hex fingerprint', () => {
        const record = createCommandFailureRecord('schema:migrate', new Error('boom'));

        expect(record.fingerprint).toMatch(/^[0-9a-f]{16}$/);
        expect(record.command).toBe('schema:migrate');
        expect(record.status).toBe('failed');
    });
});
