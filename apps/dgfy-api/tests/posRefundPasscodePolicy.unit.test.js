import bcrypt from 'bcryptjs';
import { describe, expect, it } from '@jest/globals';
import { verifyPosRefundPasscode } from '../src/modules/pos/domain/posRefundPasscodePolicy.js';

describe('POS refund passcode policy', () => {
    it('accepts an authorized manager passcode without returning the hash', async () => {
        const approver = {
            user_id: 22,
            username: 'Manager One',
            role: 'manager',
            is_active: true,
            pos_cashier_pin_hash: await bcrypt.hash('2468', 4)
        };

        await expect(verifyPosRefundPasscode({
            approvers: [approver],
            passcode: '2468'
        })).resolves.toEqual({
            user_id: 22,
            username: 'Manager One',
            role: 'manager'
        });
    });

    it('prefers the global POS PIN over the legacy approval PIN', async () => {
        const approver = {
            user_id: 25,
            username: 'Manager Three',
            role: 'manager',
            is_active: true,
            pos_cashier_pin_hash: await bcrypt.hash('1357', 4),
            pos_approval_pin_hash: await bcrypt.hash('2468', 4)
        };

        await expect(verifyPosRefundPasscode({ approvers: [approver], passcode: '1357' }))
            .resolves.toMatchObject({ user_id: 25 });
        await expect(verifyPosRefundPasscode({ approvers: [approver], passcode: '2468' }))
            .rejects.toMatchObject({ details: { reason_code: 'POS_REFUND_PASSCODE_INVALID' } });
    });

    it('rejects a cashier PIN even when the PIN is correct', async () => {
        const cashier = {
            user_id: 23,
            username: 'Cashier One',
            role: 'cashier',
            is_active: true,
            pos_approval_pin_hash: await bcrypt.hash('2468', 4)
        };

        await expect(verifyPosRefundPasscode({
            approvers: [cashier],
            passcode: '2468'
        })).rejects.toMatchObject({
            details: { reason_code: 'POS_REFUND_PASSCODE_NOT_CONFIGURED' }
        });
    });

    it('rejects an incorrect passcode without revealing whether a manager matched', async () => {
        const approver = {
            user_id: 24,
            username: 'Manager Two',
            role: 'manager',
            is_active: true,
            pos_approval_pin_hash: await bcrypt.hash('2468', 4)
        };

        await expect(verifyPosRefundPasscode({
            approvers: [approver],
            passcode: '9999'
        })).rejects.toMatchObject({
            statusCode: 403,
            details: { reason_code: 'POS_REFUND_PASSCODE_INVALID' }
        });
    });
});
