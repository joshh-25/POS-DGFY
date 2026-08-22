import bcrypt from 'bcryptjs';
import { afterEach, describe, expect, it } from '@jest/globals';
import * as authorizationService from '../src/modules/pos/services/posDrawerAuthorizationService.js';
import { verifyPosDrawerOperator } from '../src/modules/pos/domain/posDrawerAuthorizationPolicy.js';

const originalEnvironment = process.env.NODE_ENV;

afterEach(() => {
    process.env.NODE_ENV = originalEnvironment;
});

describe('POS cash drawer authorization', () => {
    it('verifies the current cashier PIN without exposing the hash', async () => {
        const pinHash = await bcrypt.hash('1234', 4);
        const verified = await verifyPosDrawerOperator({
            operator: {
                user_id: 7,
                username: 'Cashier',
                role: 'cashier',
                is_active: true,
                deleted_at: null,
                pos_approval_pin_hash: pinHash
            },
            pin: '1234'
        });

        expect(verified).toMatchObject({ user_id: 7, authorization_mode: 'pin' });
        expect(verified).not.toHaveProperty('pos_approval_pin_hash');
        await expect(verifyPosDrawerOperator({
            operator: {
                user_id: 7,
                username: 'Cashier',
                role: 'cashier',
                is_active: true,
                deleted_at: null,
                pos_approval_pin_hash: pinHash
            },
            pin: '9999'
        })).rejects.toMatchObject({ details: { reason_code: 'DRAWER_PIN_INVALID' } });
    });

    it('allows an admin bypass while returning an auditable mode', async () => {
        const verified = await verifyPosDrawerOperator({
            operator: {
                user_id: 9,
                username: 'Admin',
                role: 'admin',
                is_active: true,
                deleted_at: null,
                pos_approval_pin_hash: null
            }
        });

        expect(verified).toMatchObject({ user_id: 9, authorization_mode: 'admin_bypass' });
    });

    it('binds authorization tokens to the drawer operation', () => {
        process.env.NODE_ENV = 'test';
        const token = authorizationService.issue({
            userId: 7,
            shiftId: 12,
            transactionId: 44,
            terminalId: 'COUNTER-01',
            reason: 'Cash change',
            idempotencyKey: 'drawer-auth-001',
            authorizationMode: 'pin'
        });
        expect(authorizationService.verify(token)).toMatchObject({
            token_type: 'pos_drawer_authorization',
            user_id: 7,
            shift_id: 12,
            transaction_id: 44,
            idempotency_key: 'drawer-auth-001',
            authorization_mode: 'pin'
        });
        expect(() => authorizationService.verify(`${token}tampered`)).toThrow();
    });
});
