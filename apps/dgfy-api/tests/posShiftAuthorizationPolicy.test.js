import { describe, expect, it } from '@jest/globals';
import { DomainErrorCode } from '../src/modules/shared/contracts/domainErrors.js';
import {
    authorizePosShiftMutation,
    POS_SHIFT_AUTHORIZATION_REASON_CODES
} from '../src/modules/pos/domain/posShiftAuthorizationPolicy.js';

const openShift = {
    pos_terminal_shift_id: 41,
    cashier_id: 7,
    status: 'open'
};

describe('POS shift authorization policy', () => {
    it('allows the permanent operator who opened the shift', () => {
        expect(authorizePosShiftMutation({
            shift: openShift,
            actorUser: { user_id: 7 },
            operation: 'cash_drawer_event'
        })).toEqual({
            authorization_mode: 'shift_owner',
            actor_user_id: 7,
            shift_cashier_id: 7,
            override_reason: null
        });
    });

    it('blocks a different non-master operator', () => {
        expect(() => authorizePosShiftMutation({
            shift: openShift,
            actorUser: { user_id: 8, role: 'admin', is_master_admin: false },
            operation: 'close_shift'
        })).toThrow(expect.objectContaining({
            code: DomainErrorCode.AUTHORIZATION_FAILED,
            statusCode: 403,
            details: expect.objectContaining({
                reason_code: POS_SHIFT_AUTHORIZATION_REASON_CODES.ACTOR_MISMATCH
            })
        }));
    });

    it('requires an explicit reason for a master-admin override', () => {
        expect(() => authorizePosShiftMutation({
            shift: openShift,
            actorUser: { user_id: 1, is_master_admin: true },
            operation: 'close_shift'
        })).toThrow(expect.objectContaining({
            code: DomainErrorCode.VALIDATION_FAILED,
            statusCode: 422,
            details: expect.objectContaining({
                reason_code: POS_SHIFT_AUTHORIZATION_REASON_CODES.OVERRIDE_REASON_REQUIRED
            })
        }));
    });

    it('allows a reasoned master-admin override without changing shift ownership', () => {
        expect(authorizePosShiftMutation({
            shift: openShift,
            actorUser: { user_id: 1, is_master_admin: true },
            operation: 'close_shift',
            overrideReason: 'Operator left without closing the shift'
        })).toEqual({
            authorization_mode: 'master_admin_override',
            actor_user_id: 1,
            shift_cashier_id: 7,
            override_reason: 'Operator left without closing the shift'
        });
    });

    it('rejects mutations against a closed shift', () => {
        expect(() => authorizePosShiftMutation({
            shift: { ...openShift, status: 'closed' },
            actorUser: { user_id: 7 },
            operation: 'cash_drawer_event'
        })).toThrow(expect.objectContaining({
            code: DomainErrorCode.VALIDATION_FAILED,
            details: expect.objectContaining({
                reason_code: POS_SHIFT_AUTHORIZATION_REASON_CODES.SHIFT_NOT_OPEN
            })
        }));
    });
});
