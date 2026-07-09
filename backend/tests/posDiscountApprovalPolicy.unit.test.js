import bcrypt from 'bcryptjs';
import { verifyPosDiscountApprover } from '../src/modules/pos/domain/posDiscountApprovalPolicy.js';

describe('POS discount approval policy', () => {
    const buildApprover = async (overrides = {}) => ({
        user_id: 9,
        username: 'manager-nine',
        role: 'manager',
        is_active: true,
        deleted_at: null,
        pos_approval_pin_hash: await bcrypt.hash('2468', 4),
        ...overrides
    });

    test('returns canonical identity for a valid individual approver PIN', async () => {
        await expect(verifyPosDiscountApprover({
            approver: await buildApprover(),
            pin: '2468',
            employeeUserId: 7
        })).resolves.toEqual({ user_id: 9, username: 'manager-nine', role: 'manager' });
    });

    test('rejects an invalid PIN', async () => {
        await expect(verifyPosDiscountApprover({
            approver: await buildApprover(),
            pin: '1111'
        })).rejects.toMatchObject({ details: { reason_code: 'DISCOUNT_APPROVER_PIN_INVALID' } });
    });

    test('rejects users outside Admin and Manager roles', async () => {
        await expect(verifyPosDiscountApprover({
            approver: await buildApprover({ role: 'cashier' }),
            pin: '2468'
        })).rejects.toMatchObject({ details: { reason_code: 'DISCOUNT_APPROVER_ROLE_INVALID' } });
    });

    test('blocks employee self-approval', async () => {
        await expect(verifyPosDiscountApprover({
            approver: await buildApprover(),
            pin: '2468',
            employeeUserId: 9
        })).rejects.toMatchObject({ details: { reason_code: 'DISCOUNT_SELF_APPROVAL_BLOCKED' } });
    });
});
