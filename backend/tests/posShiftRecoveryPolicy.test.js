import { describe, expect, it } from '@jest/globals';
import { DomainErrorCode } from '../src/modules/shared/contracts/domainErrors.js';
import {
    authorizePosStaleShiftRecovery,
    evaluatePosShiftStaleness,
    POS_SHIFT_RECOVERY_REASON_CODES
} from '../src/modules/pos/domain/posShiftRecoveryPolicy.js';

const openedAt = '2026-07-23T00:00:00.000Z';
const staleShift = {
    pos_terminal_shift_id: 51,
    cashier_id: 7,
    opened_at: openedAt,
    status: 'open'
};
const evaluatedAt = new Date('2026-07-23T13:00:00.000Z');

describe('POS stale shift recovery policy', () => {
    it('marks an open shift stale only after the configured threshold', () => {
        expect(evaluatePosShiftStaleness({
            shift: staleShift,
            now: new Date('2026-07-23T11:59:59.000Z'),
            staleAfterHours: 12
        })).toEqual(expect.objectContaining({
            is_stale: false,
            stale_after_hours: 12
        }));

        expect(evaluatePosShiftStaleness({
            shift: staleShift,
            now: evaluatedAt,
            staleAfterHours: 12
        })).toEqual(expect.objectContaining({
            is_stale: true,
            age_minutes: 780,
            stale_at: '2026-07-23T12:00:00.000Z'
        }));
    });

    it('blocks non-master administrators from recovering a stale shift', () => {
        expect(() => authorizePosStaleShiftRecovery({
            shift: staleShift,
            actorUser: { user_id: 9, role: 'admin', is_master_admin: false },
            reason: 'Operator left the terminal',
            now: evaluatedAt,
            staleAfterHours: 12
        })).toThrow(expect.objectContaining({
            code: DomainErrorCode.AUTHORIZATION_FAILED,
            statusCode: 403,
            details: expect.objectContaining({
                reason_code: POS_SHIFT_RECOVERY_REASON_CODES.MASTER_ADMIN_REQUIRED
            })
        }));
    });

    it('blocks recovery before the shift becomes stale', () => {
        expect(() => authorizePosStaleShiftRecovery({
            shift: staleShift,
            actorUser: { user_id: 1, is_master_admin: true },
            reason: 'Operator left the terminal',
            now: new Date('2026-07-23T08:00:00.000Z'),
            staleAfterHours: 12
        })).toThrow(expect.objectContaining({
            code: DomainErrorCode.CONFLICT,
            statusCode: 409,
            details: expect.objectContaining({
                reason_code: POS_SHIFT_RECOVERY_REASON_CODES.SHIFT_NOT_STALE
            })
        }));
    });

    it('authorizes a reasoned master-admin recovery without changing ownership', () => {
        expect(authorizePosStaleShiftRecovery({
            shift: staleShift,
            actorUser: { user_id: 1, is_master_admin: true },
            reason: 'Operator left without closing',
            now: evaluatedAt,
            staleAfterHours: 12
        })).toEqual(expect.objectContaining({
            authorization_mode: 'master_admin_stale_recovery',
            actor_user_id: 1,
            shift_cashier_id: 7,
            reason: 'Operator left without closing',
            is_stale: true
        }));
    });
});
