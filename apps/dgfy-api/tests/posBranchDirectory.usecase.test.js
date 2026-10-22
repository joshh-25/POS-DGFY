import { describe, expect, it, jest } from '@jest/globals';
import {
    buildGetPosBranchDirectoryUseCase,
    buildRecordPosBranchViewEventUseCase
} from '../src/modules/pos/usecases/posBranchDirectoryUseCases.js';

const buildFixture = ({
    locations = [
        { location_id: 1, name: 'Main Branch', is_active: true, is_open: true },
        { location_id: 2, name: 'East Branch', is_active: true, is_open: true }
    ],
    grants = [{ location_id: 1 }],
    shifts = [],
    operators = [],
    userOperators = [],
    userShift = null,
    operatorSessionAvailability = { available: true, reason_code: null },
    registry = [
        { terminal_id: 'MAIN-01', label: 'Main Register', location_id: 1, device_enforcement: 'off' },
        { terminal_id: 'EAST-01', label: 'East Register', location_id: 2, device_enforcement: 'off' }
    ]
} = {}) => {
    const branchDirectoryRepository = {
        listActiveLocations: jest.fn().mockResolvedValue(locations),
        listUserLocationGrants: jest.fn().mockResolvedValue(grants),
        listOpenTerminalShiftsForLocations: jest.fn().mockResolvedValue(shifts),
        listActiveOperatorSessionsForLocations: jest.fn().mockResolvedValue(operators),
        listActiveOperatorSessionsForUser: jest.fn().mockResolvedValue(userOperators),
        getOperatorSessionAvailability: jest.fn().mockReturnValue(operatorSessionAvailability)
    };
    const posRepository = {
        findOpenTerminalShift: jest.fn().mockResolvedValue(userShift),
        getTerminalPairingPolicySettings: jest.fn().mockResolvedValue({ active_registry: registry }),
        createAuditLog: jest.fn().mockResolvedValue({ audit_id: 1 })
    };
    return {
        branchDirectoryRepository,
        posRepository,
        getDirectory: buildGetPosBranchDirectoryUseCase({ branchDirectoryRepository, posRepository }),
        recordView: buildRecordPosBranchViewEventUseCase({ branchDirectoryRepository, posRepository })
    };
};

describe('POS branch directory and read-only branch view', () => {
    it('denies the directory without the dedicated branch-view capability', async () => {
        const fixture = buildFixture();

        const result = await fixture.getDirectory({
            user: { user_id: 7, role: 'cashier', permissions: ['pos:view', 'pos:transact'] }
        });

        expect(result.success).toBe(false);
        expect(result.error.details).toEqual(expect.objectContaining({
            reason_code: 'POS_BRANCH_VIEW_PERMISSION_REQUIRED'
        }));
        expect(fixture.branchDirectoryRepository.listActiveLocations).not.toHaveBeenCalled();
    });

    it('does not treat governed shift relocation as branch-view authority', async () => {
        const fixture = buildFixture();

        const result = await fixture.getDirectory({
            user: { user_id: 7, role: 'manager', permissions: ['pos:view', 'pos:shift_access', 'pos:switch_location', 'pos:transact'] }
        });

        expect(result.success).toBe(false);
        expect(result.error.details).toEqual(expect.objectContaining({
            reason_code: 'POS_BRANCH_VIEW_PERMISSION_REQUIRED'
        }));
        expect(fixture.branchDirectoryRepository.listActiveLocations).not.toHaveBeenCalled();
    });

    it('limits a granted user to active granted locations and returns safe occupancy data', async () => {
        const fixture = buildFixture({
            shifts: [{
                pos_terminal_shift_id: 22,
                terminal_id: 'EAST-01',
                location_id: 2,
                status: 'open',
                cashier_id: 99,
                opened_at: '2026-09-27T09:00:00.000Z',
                cashier: { user_id: 99, username: 'east-cashier' }
            }],
            operators: [{
                pos_terminal_operator_session_id: 33,
                terminal_id: 'EAST-01',
                location_id: 2,
                user_id: 101,
                operator: { user_id: 101, username: 'east-operator' }
            }]
        });

        const result = await fixture.getDirectory({
            user: { user_id: 7, role: 'manager', permissions: ['pos:view', 'pos:branch_view', 'pos:transact'] }
        });

        expect(result.success).toBe(true);
        expect(result.data.scope).toBe('granted');
        expect(result.data.locations).toHaveLength(1);
        expect(result.data.locations[0]).toEqual(expect.objectContaining({
            location_id: 1,
            view_mode: 'read_only',
            can_view: true
        }));
        expect(result.data.locations[0].terminals[0]).toEqual(expect.objectContaining({
            terminal_id: 'MAIN-01',
            status: 'available',
            can_open: true
        }));
        expect(JSON.stringify(result.data)).not.toContain('email');
        expect(JSON.stringify(result.data)).not.toContain('password');
        expect(fixture.branchDirectoryRepository.listOpenTerminalShiftsForLocations)
            .toHaveBeenCalledWith({ locationIds: [1] });
    });

    it('lets an administrator inspect all active branches without changing operating scope', async () => {
        const fixture = buildFixture();

        const result = await fixture.getDirectory({
            user: {
                user_id: 7,
                role: 'admin',
                permissions: ['pos:view', 'pos:branch_view', 'pos:transact', 'business_admin:branches:view_all']
            }
        });

        expect(result.success).toBe(true);
        expect(result.data.scope).toBe('tenant');
        expect(result.data.locations.map((location) => location.location_id)).toEqual([1, 2]);
        expect(fixture.branchDirectoryRepository.listUserLocationGrants).not.toHaveBeenCalled();
    });

    it('keeps an occupied terminal viewable but never openable', async () => {
        const fixture = buildFixture({
            grants: [{ location_id: 1 }],
            shifts: [{
                pos_terminal_shift_id: 44,
                terminal_id: 'MAIN-01',
                location_id: 1,
                status: 'open',
                cashier_id: 12,
                opened_at: new Date(Date.now() - 60 * 60 * 1000).toISOString(),
                cashier: { user_id: 12, username: 'main-cashier' }
            }],
            operators: [{
                pos_terminal_operator_session_id: 45,
                terminal_id: 'MAIN-01',
                location_id: 1,
                user_id: 12,
                operator: { user_id: 12, username: 'main-operator' }
            }]
        });

        const result = await fixture.getDirectory({
            user: { user_id: 7, role: 'manager', permissions: ['pos:view', 'pos:branch_view', 'pos:transact'] }
        });
        const terminal = result.data.locations[0].terminals[0];

        expect(terminal).toEqual(expect.objectContaining({
            status: 'occupied',
            can_open: false,
            reason_code: 'POS_TERMINAL_SHIFT_OCCUPIED'
        }));
        expect(terminal.shift.cashier).toEqual({ user_id: 12, display_name: 'main-cashier' });
        expect(terminal.current_operator).toEqual({ user_id: 12, display_name: 'main-operator' });
    });

    it('keeps a stale admin-owned shift resumable for the owner', async () => {
        const fixture = buildFixture({
            shifts: [{
                pos_terminal_shift_id: 46,
                terminal_id: 'MAIN-01',
                location_id: 1,
                status: 'open',
                cashier_id: 7,
                opened_at: new Date(Date.now() - 13 * 60 * 60 * 1000).toISOString(),
                cashier: { user_id: 7, username: 'admin-owner' }
            }]
        });

        const result = await fixture.getDirectory({
            user: { user_id: 7, role: 'admin', permissions: ['pos:view', 'pos:branch_view', 'pos:transact'] }
        });
        const terminal = result.data.locations[0].terminals[0];

        expect(terminal).toEqual(expect.objectContaining({
            status: 'stale',
            can_open: false,
            can_resume: true,
            reason_code: null
        }));
    });

    it('keeps a stale shift recovery-only for a different cashier', async () => {
        const fixture = buildFixture({
            shifts: [{
                pos_terminal_shift_id: 47,
                terminal_id: 'MAIN-01',
                location_id: 1,
                status: 'open',
                cashier_id: 99,
                opened_at: new Date(Date.now() - 13 * 60 * 60 * 1000).toISOString(),
                cashier: { user_id: 99, username: 'other-cashier' }
            }]
        });

        const result = await fixture.getDirectory({
            user: { user_id: 7, role: 'admin', permissions: ['pos:view', 'pos:branch_view', 'pos:transact'] }
        });
        const terminal = result.data.locations[0].terminals[0];

        expect(terminal).toEqual(expect.objectContaining({
            status: 'stale',
            can_open: false,
            can_resume: false,
            reason_code: 'POS_TERMINAL_STALE_SHIFT'
        }));
    });

    it('does not borrow a moved terminal shift from another branch', async () => {
        const fixture = buildFixture({
            grants: [{ location_id: 1 }, { location_id: 2 }],
            registry: [
                { terminal_id: 'COUNTER-01', label: 'Masu Register', location_id: 1, device_enforcement: 'off' },
                { terminal_id: 'EAST-01', label: 'Spacebar Register', location_id: 2, device_enforcement: 'off' }
            ],
            shifts: [{
                pos_terminal_shift_id: 71,
                terminal_id: 'COUNTER-01',
                location_id: 2,
                status: 'open',
                cashier_id: 99,
                opened_at: new Date(Date.now() - 60 * 60 * 1000).toISOString(),
                cashier: { user_id: 99, username: 'spacebar-cashier' }
            }],
            operators: [{
                pos_terminal_operator_session_id: 72,
                terminal_id: 'COUNTER-01',
                location_id: 2,
                user_id: 101,
                operator: { user_id: 101, username: 'spacebar-operator' }
            }]
        });

        const result = await fixture.getDirectory({
            user: {
                user_id: 7,
                role: 'admin',
                permissions: ['pos:view', 'pos:branch_view', 'pos:transact', 'business_admin:branches:view_all']
            }
        });

        expect(result.success).toBe(true);
        const masuTerminal = result.data.locations[0].terminals[0];
        const spacebarTerminal = result.data.locations[1].terminals[0];

        expect(masuTerminal).toEqual(expect.objectContaining({
            terminal_id: 'COUNTER-01',
            status: 'available',
            can_open: true,
            shift: null,
            current_operator: null
        }));
        expect(spacebarTerminal).toEqual(expect.objectContaining({
            terminal_id: 'EAST-01',
            status: 'available',
            can_open: true,
            shift: null,
            current_operator: null
        }));
    });

    it('blocks opening a free terminal when the viewer already operates elsewhere', async () => {
        const fixture = buildFixture({
            userShift: {
                pos_terminal_shift_id: 88,
                terminal_id: 'OTHER-01',
                location_id: 9,
                status: 'open',
                cashier_id: 7
            }
        });

        const result = await fixture.getDirectory({
            user: { user_id: 7, role: 'manager', permissions: ['pos:view', 'pos:branch_view', 'pos:transact'] }
        });
        const terminal = result.data.locations[0].terminals[0];

        expect(terminal.can_open).toBe(false);
        expect(terminal.reason_code).toBe('POS_OPERATOR_ACTIVE_ELSEWHERE');
    });

    it('records enter and exit as read-only audit events for an authorized branch', async () => {
        const fixture = buildFixture();
        const user = { user_id: 7, role: 'manager', permissions: ['pos:branch_view'] };

        const result = await fixture.recordView({
            payload: { location_id: 1, event: 'enter' },
            user,
            auditContext: { requestId: 'req-branch-1', terminalId: 'MAIN-01' }
        });

        expect(result.success).toBe(true);
        expect(fixture.posRepository.createAuditLog).toHaveBeenCalledWith(expect.objectContaining({
            user_id: 7,
            entity_type: 'pos_branch_view',
            entity_id: 1,
            action: 'VIEW',
            event_type: 'pos_branch_view_enter',
            location_id: 1,
            request_id: 'req-branch-1',
            terminal_id: 'MAIN-01'
        }));
    });

    it('reports operator-session data as unavailable instead of implying no cashier', async () => {
        const fixture = buildFixture({
            operatorSessionAvailability: {
                available: false,
                reason_code: 'POS_OPERATOR_SESSION_DATA_UNAVAILABLE'
            }
        });

        const result = await fixture.getDirectory({
            user: { user_id: 7, role: 'manager', permissions: ['pos:branch_view'] }
        });

        expect(result.success).toBe(true);
        expect(result.data.operator_session).toEqual({
            status: 'unavailable',
            reason_code: 'POS_OPERATOR_SESSION_DATA_UNAVAILABLE'
        });
        expect(result.data.locations[0]).toEqual(expect.objectContaining({
            operator_session_status: 'unavailable',
            operator_session_reason_code: 'POS_OPERATOR_SESSION_DATA_UNAVAILABLE'
        }));
        expect(result.data.locations[0].terminals[0]).toEqual(expect.objectContaining({
            current_operator: null,
            current_operator_status: 'unavailable'
        }));
    });
});
