import { verifyPosDayCloseOperator } from '../src/modules/pos/domain/posDayClosePinPolicy.js';
import { DomainErrorCode } from '../src/modules/shared/contracts/domainErrors.js';
import bcrypt from 'bcryptjs';

describe('POS Day Close PIN policy', () => {
    it('accepts the authenticated operator personal Day Close PIN', async () => {
        const pinHash = await bcrypt.hash('1234', 4);

        await expect(verifyPosDayCloseOperator({
            operator: { user_id: 7, username: 'cashier.one', is_active: true, pos_day_close_pin_hash: pinHash },
            pin: '1234'
        })).resolves.toEqual({ user_id: 7, username: 'cashier.one' });
    });

    it('rejects missing and invalid Day Close PINs', async () => {
        await expect(verifyPosDayCloseOperator({
            operator: { user_id: 7, is_active: true, pos_day_close_pin_hash: '' },
            pin: '1234'
        })).rejects.toMatchObject({
            code: DomainErrorCode.AUTHORIZATION_FAILED,
            details: { reason_code: 'DAY_CLOSE_PIN_NOT_CONFIGURED' }
        });

        const pinHash = await bcrypt.hash('1234', 4);
        await expect(verifyPosDayCloseOperator({
            operator: { user_id: 7, is_active: true, pos_day_close_pin_hash: pinHash },
            pin: '9999'
        })).rejects.toMatchObject({
            code: DomainErrorCode.AUTHORIZATION_FAILED,
            details: { reason_code: 'DAY_CLOSE_PIN_INVALID' }
        });
    });
});
