import { createPosOperatorAuthorityUseCases } from '../src/modules/pos/usecases/posOperatorAuthorityUseCases.js';

const buildFixture = ({ featureEnabled = true, pin = '2468' } = {}) => {
    const users = new Map([
        [1, { user_id: 1, username: 'alice', role: 'cashier', is_active: true, permissions: ['pos:attendance:view', 'pos:attendance:operate'], pos_cashier_pin_hash: 'hash-a', pos_cashier_pin_failed_attempts: 0 }],
        [2, { user_id: 2, username: 'bob', role: 'cashier', is_active: true, permissions: ['pos:attendance:view', 'pos:attendance:operate'], pos_cashier_pin_hash: 'hash-b', pos_cashier_pin_failed_attempts: 0 }]
    ]);
    let current = {
        pos_terminal_operator_session_id: 10,
        pos_terminal_shift_id: 99,
        terminal_id: 'REG-1',
        location_id: 7,
        user_id: 1,
        status: 'active',
        authority_expires_at: new Date(Date.now() + 3600000)
    };
    let nextSessionId = 11;
    const events = [];
    let takeoverAttendanceCalls = 0;
    const repository = {
        findOpenTerminalShift: async () => ({ pos_terminal_shift_id: 99, terminal_id: 'REG-1', location_id: 7, cashier_id: 1, status: 'open', opening_float_amount: 100 }),
        findOperatorByIdempotency: async () => null,
        findUserById: async ({ userId }) => users.get(userId),
        findUserLocationGrant: async () => ({ user_id: 2, location_id: 7 }),
        findOpenAttendanceByUser: async ({ userId }) => ({ employee_attendance_session_id: userId + 100, user_id: userId, location_id: 7, status: 'open' }),
        findOpenBreak: async () => null,
        updateUserPinState: async ({ userId, payload }) => users.set(userId, { ...users.get(userId), ...payload }),
        findActiveOperator: async () => current,
        updateOperatorSession: async ({ operatorSessionId, payload }) => {
            if (current?.pos_terminal_operator_session_id === operatorSessionId) current = { ...current, ...payload };
            return { ...current };
        },
        createOperatorSession: async (payload) => {
            current = { ...payload, pos_terminal_operator_session_id: nextSessionId++ };
            return { ...current };
        },
        createDrawerHandoffEvent: async (payload) => {
            const event = { ...payload, pos_drawer_handoff_event_id: events.length + 1 };
            events.push(event);
            return event;
        },
        getExpectedCashForShift: async () => 123.45,
        createAuditLog: async () => null,
        findOperatorByAuthorityTokenHash: async () => current,
        findOperatorById: async () => current,
        revokeOperatorSessionsForUser: async () => 1,
        revokeOperatorSessionsForTerminal: async () => 1,
        releaseOperatorMutation: async () => true
    };
    const authorityService = {
        maxAgeMs: 3600000,
        issue: ({ operatorSessionId }) => `authority-${operatorSessionId}`,
        hashAuthorityToken: (token) => `hash:${token}`,
        verify: (token) => {
            const operatorSessionId = Number(String(token).split('-').pop());
            return {
                token_type: 'pos_operator_authority',
                tenant_id: 'tenant-1',
                terminal_id: 'REG-1',
                location_id: 7,
                shift_id: 99,
                user_id: operatorSessionId === 10 ? 1 : 2,
                operator_session_id: operatorSessionId
            };
        }
    };
    const useCases = createPosOperatorAuthorityUseCases({
        repository,
        resolveFeature: async () => ({ enabled: featureEnabled }),
        authorityService,
        runTransaction: async (work) => work({}),
        comparePin: async (candidate, hash) => candidate === pin && ['hash-a', 'hash-b'].includes(hash),
        hashPin: async (candidate) => `hashed:${candidate}`,
        ensureAttendanceForTakeover: async ({ shift, user, payload }) => {
            takeoverAttendanceCalls += 1;
            return {
                feature: { enabled: true, location_id: shift.location_id },
                attendance: {
                    employee_attendance_session_id: 1000 + Number(user.user_id),
                    user_id: Number(user.user_id),
                    location_id: Number(shift.location_id),
                    duty_type: 'regular',
                    status: 'open',
                    start_idempotency_key: payload.idempotency_key
                },
                created: true
            };
        }
    });
    return { useCases, repository, users, events, getTakeoverAttendanceCalls: () => takeoverAttendanceCalls };
};

describe('Phase 157 POS operator authority use cases', () => {
    test('takeover ends the current operator and creates exactly one replacement session', async () => {
        const { useCases, events } = buildFixture();
        const result = await useCases.takeOver({
            tenantId: 'tenant-1',
            scope: { terminalId: 'REG-1', locationId: 7, shiftId: 99 },
            user: { user_id: 1, username: 'alice' },
            payload: { user_id: 2, pin: '2468', idempotency_key: 'takeover-001' }
        });
        expect(result.success).toBe(true);
        expect(result.data.operator_session.user_id).toBe(2);
        expect(result.data.authority_token).toBe('authority-11');
        expect(events).toHaveLength(0);
    });

    test('takeover starts attendance automatically when the incoming cashier is not timed in', async () => {
        const fixture = buildFixture();
        fixture.repository.findOpenAttendanceByUser = async () => null;

        const result = await fixture.useCases.takeOver({
            tenantId: 'tenant-1',
            scope: { terminalId: 'REG-1', locationId: 7, shiftId: 99 },
            user: { user_id: 1, username: 'alice' },
            payload: { user_id: 2, pin: '2468', idempotency_key: 'takeover-auto-attendance' }
        });

        expect(result.success).toBe(true);
        expect(result.data.operator_session).toMatchObject({
            user_id: 2,
            employee_attendance_session_id: 1002
        });
        expect(fixture.getTakeoverAttendanceCalls()).toBe(1);
    });

    test('failed takeover PIN does not create incoming attendance', async () => {
        const fixture = buildFixture({ pin: '9999' });
        fixture.repository.findOpenAttendanceByUser = async () => null;

        const result = await fixture.useCases.takeOver({
            tenantId: 'tenant-1',
            scope: { terminalId: 'REG-1', locationId: 7, shiftId: 99 },
            user: { user_id: 1, username: 'alice' },
            payload: { user_id: 2, pin: '2468', idempotency_key: 'takeover-pin-before-attendance' }
        });

        expect(result.success).toBe(false);
        expect(result.error.message).toBe('Cashier authentication failed.');
        expect(fixture.getTakeoverAttendanceCalls()).toBe(0);
    });

    test('counted custody handoff records expected cash, count, variance, and acknowledgements', async () => {
        const { useCases, events } = buildFixture();
        const result = await useCases.countedHandoff({
            authorityToken: 'authority-10',
            tenantId: 'tenant-1',
            scope: { terminalId: 'REG-1', locationId: 7, shiftId: 99 },
            user: { user_id: 1, username: 'alice' },
            payload: {
                user_id: 2,
                pin: '2468',
                idempotency_key: 'handoff-001',
                counted_cash_amount: 120,
                outgoing_acknowledged: true,
                incoming_acknowledged: true,
                note: 'Scheduled 3 PM custody transfer'
            }
        });
        expect(result.success).toBe(true);
        expect(events[0]).toMatchObject({
            event_type: 'counted_custody_transfer',
            custody_mode: 'counted_transfer',
            expected_cash_amount: 123.45,
            counted_cash_amount: 120,
            variance_amount: -3.45,
            outgoing_acknowledged_by: 1,
            incoming_acknowledged_by: 2
        });
    });

    test('invalid PIN returns a generic failure and feature-disabled locations fail closed', async () => {
        const invalid = buildFixture({ pin: '9999' });
        const result = await invalid.useCases.takeOver({
            tenantId: 'tenant-1',
            scope: { terminalId: 'REG-1', locationId: 7, shiftId: 99 },
            user: { user_id: 1 },
            payload: { user_id: 2, pin: '2468', idempotency_key: 'takeover-002' }
        });
        expect(result.success).toBe(false);
        expect(result.error.message).toBe('Cashier authentication failed.');

        const disabled = buildFixture({ featureEnabled: false });
        const disabledResult = await disabled.useCases.takeOver({
            tenantId: 'tenant-1',
            scope: { terminalId: 'REG-1', locationId: 7, shiftId: 99 },
            user: { user_id: 1 },
            payload: { user_id: 2, pin: '2468', idempotency_key: 'takeover-003' }
        });
        expect(disabledResult.success).toBe(false);
        expect(disabledResult.error.code).toBe('POS_OPERATOR_FEATURE_DISABLED');
    });

    test('ending an operator session revokes the authority token and rejects replay', async () => {
        const { useCases } = buildFixture();
        const request = {
            authorityToken: 'authority-10',
            tenantId: 'tenant-1',
            scope: { terminalId: 'REG-1', locationId: 7, shiftId: 99 },
            user: { user_id: 1, username: 'alice' }
        };

        const ended = await useCases.end(request);
        expect(ended.success).toBe(true);
        expect(ended.data.idempotent_replay).toBe(false);

        const replay = await useCases.end(request);
        expect(replay.success).toBe(false);
        expect(replay.error.code).toBe('AUTHORIZATION_FAILED');
    });

    test('authorizes protected mutations from the server-held operator session', async () => {
        const { useCases } = buildFixture();
        const result = await useCases.authorizeMutation({
            authorityToken: 'authority-10',
            tenantId: 'tenant-1',
            scope: { terminalId: 'REG-1', locationId: 7, shiftId: 99 },
            operationKey: 'request-authorize-001',
            operationType: 'POST /checkouts'
        });

        expect(result.success).toBe(true);
        expect(result.data.legacy_fallback).toBe(false);
        expect(result.data.operator_session).toMatchObject({ user_id: 1, pos_terminal_shift_id: 99 });
        expect(result.data.operator_user).toMatchObject({ user_id: 1, username: 'alice' });
    });

    test('keeps legacy mutations available when the rollout flag is disabled', async () => {
        const { useCases } = buildFixture({ featureEnabled: false });
        const result = await useCases.authorizeMutation({
            authorityToken: '',
            tenantId: 'tenant-1',
            scope: { terminalId: 'REG-1', locationId: 7, shiftId: 99 }
        });

        expect(result.success).toBe(true);
        expect(result.data).toMatchObject({ authority_valid: true, legacy_fallback: true });
    });

    test('rejects protected mutations when the current operator is on break', async () => {
        const { useCases, repository } = buildFixture();
        repository.findOpenBreak = async () => ({ employee_break_segment_id: 501, status: 'open' });
        const result = await useCases.authorizeMutation({
            authorityToken: 'authority-10',
            tenantId: 'tenant-1',
            scope: { terminalId: 'REG-1', locationId: 7, shiftId: 99 },
            operationKey: 'request-break-001',
            operationType: 'POST /checkouts'
        });

        expect(result.success).toBe(false);
        expect(result.error.details?.reason_code).toBe('POS_OPERATOR_ON_BREAK');
    });

    test('blocks cashier takeover while a split payment is in flight', async () => {
        const { useCases, repository } = buildFixture();
        repository.findInFlightPaymentSession = async () => ({ pos_payment_session_id: 801, status: 'partially_paid' });
        const result = await useCases.takeOver({
            tenantId: 'tenant-1',
            scope: { terminalId: 'REG-1', locationId: 7, shiftId: 99 },
            user: { user_id: 1, username: 'alice' },
            payload: { user_id: 2, pin: '2468', idempotency_key: 'takeover-payment-blocked' }
        });

        expect(result.success).toBe(false);
        expect(result.error.details?.reason_code).toBe('POS_OPERATOR_PAYMENT_IN_FLIGHT');
    });

    test('rotates an authority token when a successful takeover response is retried', async () => {
        const { useCases, repository } = buildFixture();
        const request = {
            tenantId: 'tenant-1',
            scope: { terminalId: 'REG-1', locationId: 7, shiftId: 99 },
            user: { user_id: 1, username: 'alice' },
            payload: { user_id: 2, pin: '2468', idempotency_key: 'takeover-network-retry' }
        };
        const first = await useCases.takeOver(request);
        repository.findOperatorByIdempotency = async () => repository.findActiveOperator({});
        const replay = await useCases.takeOver(request);

        expect(first.success).toBe(true);
        expect(replay.success).toBe(true);
        expect(replay.data.idempotent_replay).toBe(true);
        expect(replay.data.authority_token).toBe(`authority-${first.data.operator_session.pos_terminal_operator_session_id}`);
    });

    test('requires the target PIN before replaying a successful transition', async () => {
        const { useCases, repository } = buildFixture();
        const request = {
            tenantId: 'tenant-1',
            scope: { terminalId: 'REG-1', locationId: 7, shiftId: 99 },
            user: { user_id: 1, username: 'alice' },
            payload: { user_id: 2, pin: '2468', idempotency_key: 'takeover-replay-pin' }
        };
        expect((await useCases.takeOver(request)).success).toBe(true);
        repository.findOperatorByIdempotency = async () => repository.findActiveOperator({});

        const denied = await useCases.takeOver({
            ...request,
            payload: { ...request.payload, pin: '0000' }
        });
        expect(denied.success).toBe(false);
        expect(denied.error.message).toBe('Cashier authentication failed.');
    });

    test('lets the current cashier refresh expired browser authority by re-entering their PIN', async () => {
        const { useCases } = buildFixture();
        const result = await useCases.takeOver({
            tenantId: 'tenant-1',
            scope: { terminalId: 'REG-1', locationId: 7, shiftId: 99 },
            user: { user_id: 1, username: 'alice' },
            payload: { user_id: 1, pin: '2468', idempotency_key: 'self-reauthorize-001' }
        });

        expect(result.success).toBe(true);
        expect(result.data.authority_refreshed).toBe(true);
        expect(result.data.authority_token).toBe('authority-10');
    });
});
