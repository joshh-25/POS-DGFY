import { jest } from '@jest/globals';
import { createAssertPosUserOperatingScope, normalizePosOperatingConflict } from '../src/modules/pos/usecases/posUserOperatingScope.js';

const fixture = (overrides = {}) => {
    const state = { user: { user_id: 1, is_active: true }, shifts: [], operators: [], attendance: [], ...overrides };
    const repository = {
        lockUserOperatingState: jest.fn(async () => state),
        findUserLocationGrant: jest.fn(async () => ({ location_id: 7 }))
    };
    return { repository, guard: createAssertPosUserOperatingScope({ repository }) };
};
const scope = { userId: 1, terminalId: 'REG-1', locationId: 7, transaction: {} };

describe('Phase 355 tenant-user operating scope', () => {
    test.each(['ER_DUP_ENTRY', 'ER_LOCK_DEADLOCK', 'ER_LOCK_WAIT_TIMEOUT'])('%s becomes a safe conflict response', (code) => {
        expect(normalizePosOperatingConflict({ parent: { code } })).toMatchObject({ statusCode: 409, details: { reason_code: 'POS_OPERATOR_CONCURRENT_CHANGE' } });
    });
    test.each(['shifts', 'operators'])('%s at another terminal blocks acquisition, even within the same branch', async (kind) => {
        const { guard } = fixture({ [kind]: [{ terminal_id: 'REG-2', location_id: 7 }] });
        await expect(guard(scope)).rejects.toMatchObject({ statusCode: 409, details: { reason_code: 'POS_OPERATOR_ACTIVE_ELSEWHERE' } });
    });
    test('attendance at another branch must be resolved too', async () => {
        const { guard } = fixture({ attendance: [{ location_id: 8 }] });
        await expect(guard(scope)).rejects.toMatchObject({ statusCode: 409 });
    });
    test('same normalized terminal and branch may resume', async () => {
        const { guard } = fixture({ shifts: [{ terminal_id: ' reg-1 ', location_id: 7 }], operators: [{ terminal_id: 'REG-1', location_id: 7 }] });
        await expect(guard(scope)).resolves.toMatchObject({ user_id: 1 });
    });
    test('switching permission never substitutes for a revoked branch grant', async () => {
        const { guard, repository } = fixture({ user: { user_id: 1, is_active: true, permissions: ['pos:switch_location'] } });
        repository.findUserLocationGrant.mockResolvedValue(null);
        await expect(guard(scope)).rejects.toMatchObject({ statusCode: 403, details: { reason_code: 'POS_OPERATOR_LOCATION_GRANT_REQUIRED' } });
    });
    test('master admin retains branch access, but not a second operating session', async () => {
        const { guard, repository } = fixture({ user: { user_id: 1, is_active: true, is_master_admin: true }, operators: [{ terminal_id: 'REG-2', location_id: 8 }] });
        await expect(guard(scope)).rejects.toMatchObject({ statusCode: 409 });
        expect(repository.findUserLocationGrant).not.toHaveBeenCalled();
    });
    test('deactivated users cannot resume', async () => {
        const { guard } = fixture({ user: { user_id: 1, is_active: false } });
        await expect(guard(scope)).rejects.toMatchObject({ statusCode: 403 });
    });
    test('missing scope fails before querying', async () => {
        const { guard, repository } = fixture();
        await expect(guard({ ...scope, userId: null })).rejects.toMatchObject({ statusCode: 422 });
        expect(repository.lockUserOperatingState).not.toHaveBeenCalled();
    });
});
