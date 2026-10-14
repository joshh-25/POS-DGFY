import {
    hasConfiguredPosGlobalPin,
    hasConfiguredPosPinForAction,
    resolvePosGlobalPinHash
} from '../src/modules/pos/domain/posGlobalPinPolicy.js';

describe('POS global PIN policy', () => {
    test('treats only the canonical cashier hash as the configured global PIN', () => {
        expect(hasConfiguredPosGlobalPin({ pos_cashier_pin_hash: 'global-hash' })).toBe(true);
        expect(hasConfiguredPosGlobalPin({ pos_approval_pin_hash: 'legacy-approval-hash' })).toBe(false);
        expect(hasConfiguredPosGlobalPin({ pos_day_close_pin_hash: 'legacy-day-close-hash' })).toBe(false);
    });

    test('uses the canonical hash before the action-specific legacy hash', () => {
        expect(resolvePosGlobalPinHash({
            pos_cashier_pin_hash: 'global-hash',
            pos_approval_pin_hash: 'legacy-approval-hash'
        }, ['pos_approval_pin_hash'])).toBe('global-hash');
    });

    test('keeps legacy approval compatibility scoped to discount approval', () => {
        const operator = { pos_approval_pin_hash: 'legacy-approval-hash' };
        expect(hasConfiguredPosPinForAction(operator, ['pos_approval_pin_hash'])).toBe(true);
        expect(hasConfiguredPosPinForAction(operator, ['pos_day_close_pin_hash'])).toBe(false);
    });
});
