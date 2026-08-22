import bcrypt from 'bcryptjs';
import { verifyPosDiscountApprover } from '../src/modules/pos/domain/posDiscountApprovalPolicy.js';

describe('POS discount approval policy', () => {
    const buildApprover = async (overrides = {}) => ({
        user_id: 9,
        username: 'manager-nine',
        role: 'manager',
        is_active: true,
        deleted_at: null,
        permissions: [],
        is_master_admin: false,
        can_authorize_discounts: false,
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

    test('allows a cashier explicitly granted the discount authorization permission', async () => {
        await expect(verifyPosDiscountApprover({
            approver: await buildApprover({
                role: 'cashier',
                permissions: ['pos:discount_authorize'],
                can_authorize_discounts: true
            }),
            pin: '2468'
        })).resolves.toEqual({ user_id: 9, username: 'manager-nine', role: 'cashier' });
    });

    test('rejects employees without discount authorization', async () => {
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
