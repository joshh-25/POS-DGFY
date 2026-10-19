import crypto from 'node:crypto';
import logger from '../../../config/logger.js';
import { DomainError, DomainErrorCode } from '../../shared/contracts/domainErrors.js';
import { deriveDeliveryState } from '../domain/deliveryState.js';
import { buildReadiness, resolveEnvironmentLabel } from '../domain/environmentReadiness.js';
import { PUSH_DIAGNOSTICS_VISIBILITY_APPS } from '../domain/visibilityApps.js';
import {
    generatePushDiagnosticEnrollmentCode,
    hashExpoPushToken,
    hashPushDiagnosticEnrollmentCode,
    isValidExpoPushToken,
    toPushRegistrationRef,
    toSafePushErrorCode
} from '../../pushDelivery/utils/pushTokenSecurity.js';

const ENROLLMENT_CODE_TTL_MS = 10 * 60 * 1000;
const DEVICE_TEST_SENDS_PER_HOUR = 10;
const MAX_LIST_LIMIT = 100;
const DEFAULT_LIST_LIMIT = 50;
const MAX_WINDOW_HOURS = 168;
const DEFAULT_WINDOW_HOURS = 24;
const PLATFORMS = new Set(['ios', 'android']);
const REGISTRATION_STATES = new Set(['all', 'active', 'revoked']);
const ATTEMPT_STATUSES = new Set(['pending', 'accepted', 'rejected', 'failed', 'unconfigured']);
const DISPATCH_OUTCOMES = new Set(['dispatched', 'skipped', 'suppressed', 'failed']);
const FILTER_PATTERN = /^[A-Za-z0-9_.:-]{1,80}$/;
const ENROLL_PAYLOAD_KEYS = new Set(['code', 'token', 'platform', 'app', 'brand']);

const TEST_MESSAGE = Object.freeze({
    title: 'DGFY push diagnostic',
    body: 'Test notification from DGFY Platform Admin.',
    data: { event: 'push_diagnostic_test' }
});

const validation = (message) => new DomainError(DomainErrorCode.VALIDATION_FAILED, message);
const notFound = (message = 'Diagnostic device not found.') => new DomainError(DomainErrorCode.RESOURCE_NOT_FOUND, message);

const clampLimit = (value) => {
    const parsed = Number.parseInt(value, 10);
    if (!Number.isInteger(parsed) || parsed < 1) return DEFAULT_LIST_LIMIT;
    return Math.min(parsed, MAX_LIST_LIMIT);
};

const resolveSince = (hours, now) => {
    const parsed = Number.parseInt(hours, 10);
    const clamped = Number.isInteger(parsed) && parsed > 0 ? Math.min(parsed, MAX_WINDOW_HOURS) : DEFAULT_WINDOW_HOURS;
    return new Date(now.getTime() - clamped * 60 * 60 * 1000);
};

const optionalFilter = (value, label) => {
    if (value === undefined || value === null || value === '') return undefined;
    const text = String(value).trim();
    if (!FILTER_PATTERN.test(text)) throw validation(`Invalid ${label} filter.`);
    return text;
};

const publicDevice = (row, secret) => ({
    id: row.id,
    ref: toPushRegistrationRef(row.token, { secret }),
    platform: row.platform,
    app: row.app,
    brand: row.brand,
    label: row.label || null,
    state: row.revoked_at ? 'revoked' : 'active',
    revoke_reason: row.revoke_reason || null,
    last_seen_at: row.last_seen_at ? new Date(row.last_seen_at).toISOString() : null,
    created_at: row.created_at ? new Date(row.created_at).toISOString() : null
});

export const buildPushDiagnosticsUseCases = ({
    readRepository,
    auditRepository,
    settingsRepository,
    deviceRepository,
    enrollmentRepository,
    logRepository,
    adapterResolver,
    getSchedulerStatus = () => ({ scheduled: false, last_cycle_completed_at: null }),
    env = process.env,
    now = () => new Date(),
    random = () => crypto.randomBytes(8).toString('hex')
}) => {
    const getOverview = async ({ admin, request } = {}) => {
        // Fail closed: if the access cannot be audited, nothing is returned.
        await auditRepository.write({ admin, action: 'push_diagnostics.accessed', request });
        const current = now();
        const day = new Date(current.getTime() - 24 * 60 * 60 * 1000);
        const week = new Date(current.getTime() - 7 * 24 * 60 * 60 * 1000);
        const [registrations, deliveries24h, deliveries7d, dispatch24h, dispatch7d] = await Promise.all([
            readRepository.registrationSummary(),
            readRepository.deliveryStatusCounts(day),
            readRepository.deliveryStatusCounts(week),
            readRepository.dispatchOutcomeCounts(day),
            readRepository.dispatchOutcomeCounts(week)
        ]);
        const environment = resolveEnvironmentLabel(env);
        return {
            environment,
            generated_at: current.toISOString(),
            readiness: buildReadiness({ env, schedulerStatus: getSchedulerStatus() }),
            registrations,
            outcomes: {
                last_24h: { deliveries: deliveries24h, dispatch_events: dispatch24h },
                last_7d: { deliveries: deliveries7d, dispatch_events: dispatch7d }
            }
        };
    };

    const listRegistrations = async (query = {}) => {
        const platform = optionalFilter(query.platform, 'platform');
        if (platform && !PLATFORMS.has(platform)) throw validation('Invalid platform filter.');
        const state = optionalFilter(query.state, 'state') || 'all';
        if (!REGISTRATION_STATES.has(state)) throw validation('Invalid state filter.');
        const items = await readRepository.listRegistrations({
            app: optionalFilter(query.app, 'app'),
            brand: optionalFilter(query.brand, 'brand'),
            platform,
            state,
            limit: clampLimit(query.limit)
        });
        return { environment: resolveEnvironmentLabel(env), items };
    };

    const listAttempts = async (query = {}) => {
        const status = optionalFilter(query.status, 'status');
        if (status && !ATTEMPT_STATUSES.has(status)) throw validation('Invalid status filter.');
        const outcome = optionalFilter(query.outcome, 'outcome');
        if (outcome && !DISPATCH_OUTCOMES.has(outcome)) throw validation('Invalid outcome filter.');
        const purpose = optionalFilter(query.purpose, 'purpose');
        const since = resolveSince(query.window_hours, now());
        const limit = clampLimit(query.limit);
        const [deliveries, dispatchEvents] = await Promise.all([
            readRepository.listDeliveries({ purpose, status, since, limit }),
            readRepository.listDispatchEvents({ purpose, outcome, since, limit })
        ]);
        return {
            environment: resolveEnvironmentLabel(env),
            deliveries: deliveries.map((row) => ({ ...row, state: deriveDeliveryState(row) })),
            dispatch_events: dispatchEvents
        };
    };

    const createEnrollmentCode = async ({ admin, request } = {}) => {
        let codeHash;
        const code = generatePushDiagnosticEnrollmentCode();
        try {
            codeHash = hashPushDiagnosticEnrollmentCode(code, { secret: env.PUSH_TOKEN_HASH_SECRET });
        } catch (error) {
            throw new DomainError(DomainErrorCode.SERVICE_UNAVAILABLE, 'Push token hash secret is not configured.', { cause: error });
        }
        const expiresAt = new Date(now().getTime() + ENROLLMENT_CODE_TTL_MS);
        await enrollmentRepository.create({ codeHash, adminId: admin.id, expiresAt });
        await auditRepository.write({
            admin,
            action: 'push_diagnostics.enrollment_code_created',
            after: { expires_at: expiresAt.toISOString() },
            request
        });
        // The plaintext is returned exactly once and never stored.
        return { code, expires_at: expiresAt.toISOString() };
    };

    const listDiagnosticDevices = async () => {
        const rows = await deviceRepository.list({ includeRevoked: true, limit: DEFAULT_LIST_LIMIT });
        return { environment: resolveEnvironmentLabel(env), items: rows.map((row) => publicDevice(row, env.PUSH_TOKEN_HASH_SECRET)) };
    };

    const revokeDiagnosticDevice = async ({ admin, id, request } = {}) => {
        const affected = await deviceRepository.revokeById(id, 'revoked_by_operator');
        if (!affected) throw notFound();
        await auditRepository.write({
            admin,
            action: 'push_diagnostics.device_revoked',
            after: { device_id: id },
            request
        });
        return { revoked: true };
    };

    const sendTestNotification = async ({ admin, id, body, request } = {}) => {
        // The target is only ever an enrolled diagnostic device id. Any extra field, notably a
        // token, is rejected rather than ignored.
        if (body && typeof body === 'object' && Object.keys(body).length > 0) {
            throw validation('Test sends accept no request body; the target is the enrolled device only.');
        }
        const device = await deviceRepository.findActiveById(id);
        if (!device) throw notFound();

        let tokenHash;
        try {
            tokenHash = hashExpoPushToken(device.token, { secret: env.PUSH_TOKEN_HASH_SECRET });
        } catch (error) {
            throw new DomainError(DomainErrorCode.SERVICE_UNAVAILABLE, 'Push token hash secret is not configured.', { cause: error });
        }

        const current = now();
        const recent = await deviceRepository.countRecentTestSends(device.id, new Date(current.getTime() - 60 * 60 * 1000));
        if (recent >= DEVICE_TEST_SENDS_PER_HOUR) {
            throw new DomainError('PUSH_TEST_SEND_LIMIT', 'This device reached its hourly test-send limit.', { statusCode: 429 });
        }

        const log = await deviceRepository.createTestSendLog({
            dedupe_key: `diagnostic:${device.id}:${current.getTime()}:${random()}`,
            token_id: device.id,
            token_hash: tokenHash,
            purpose: 'diagnostic_test',
            status: 'pending',
            simulated: false,
            ticket_id: null,
            receipt_status: null,
            receipt_checked_at: null,
            error_code: null,
            tenant_id: null,
            reference: null,
            sent_at: current
        });

        const { mode, adapter } = adapterResolver({
            onProductionFakeBlocked: () => logger.warn('[Push] Fake provider is disabled in production')
        });
        let status = 'failed';
        let errorCode;
        let simulated = false;
        let ticketId = null;
        try {
            const outcomes = await adapter.send([{ to: device.token, ...TEST_MESSAGE }]);
            const outcome = (Array.isArray(outcomes) ? outcomes[0] : null) || { status: 'failed', errorCode: 'missing_ticket' };
            const providerStatus = mode === 'unconfigured' ? 'unconfigured' : outcome.status;
            status = ['accepted', 'rejected', 'failed', 'unconfigured'].includes(providerStatus) ? providerStatus : 'failed';
            errorCode = outcome.errorCode ? toSafePushErrorCode(outcome.errorCode) : null;
            simulated = mode === 'fake' || outcome.simulated === true;
            ticketId = mode === 'expo' && status === 'accepted' ? outcome.ticketId || null : null;
        } catch (error) {
            errorCode = toSafePushErrorCode(error?.code, 'provider_send_failed');
        }
        await logRepository.updateById(log.id, { status, simulated, ticket_id: ticketId, error_code: errorCode });
        if (errorCode === 'devicenotregistered' || errorCode === 'device_not_registered') {
            await deviceRepository.revokeById(device.id, 'device_not_registered').catch(() => null);
        }

        const state = deriveDeliveryState({ status, simulated, receipt_status: null });
        await auditRepository.write({
            admin,
            action: 'push_diagnostics.test_send',
            after: { device_id: device.id, provider_mode: mode, status, state, error_code: errorCode },
            request
        });
        return { provider_mode: mode, status, state, simulated, error_code: errorCode };
    };

    // Device-side, session-less. Every failure of the code looks identical to the caller.
    const enrollDevice = async (payload = {}) => {
        if (!payload || typeof payload !== 'object' || Object.keys(payload).some((key) => !ENROLL_PAYLOAD_KEYS.has(key))) {
            throw validation('Invalid enrollment request.');
        }
        const code = String(payload.code || '').trim();
        const token = String(payload.token || '').trim();
        const platform = String(payload.platform || '').trim().toLowerCase();
        const app = String(payload.app || '').trim();
        const brand = String(payload.brand || '').trim();
        if (!code || code.length > 128 || !isValidExpoPushToken(token) || !PLATFORMS.has(platform)
            || !FILTER_PATTERN.test(app) || !FILTER_PATTERN.test(brand)) {
            throw validation('Invalid enrollment request.');
        }

        let codeHash;
        try {
            codeHash = hashPushDiagnosticEnrollmentCode(code, { secret: env.PUSH_TOKEN_HASH_SECRET });
        } catch (error) {
            throw new DomainError(DomainErrorCode.SERVICE_UNAVAILABLE, 'Diagnostic enrollment is unavailable.', { cause: error });
        }
        const result = await enrollmentRepository.consumeAndEnroll({
            codeHash,
            device: { token, platform, app, brand },
            now: now()
        });
        if (result.status !== 'enrolled') throw notFound('Enrollment code is invalid or expired.');
        await auditRepository.write({
            admin: { id: result.adminId, username: null },
            action: 'push_diagnostics.device_enrolled',
            after: { device_id: result.device.id, platform, app, brand },
            request: { method: 'POST', path: '/api/v1/push-diagnostics/enroll' }
        });
        return { enrolled: true, ref: toPushRegistrationRef(token, { secret: env.PUSH_TOKEN_HASH_SECRET }) };
    };

    const listAppVisibility = async () => {
        const rows = await settingsRepository.listVisibilitySettings(PUSH_DIAGNOSTICS_VISIBILITY_APPS);
        const settingsByApp = new Map(rows.map((row) => [row.app, row]));
        return {
            apps: PUSH_DIAGNOSTICS_VISIBILITY_APPS.map((app) => {
                const row = settingsByApp.get(app);
                const updatedAt = row?.updated_at ? new Date(row.updated_at) : null;
                return {
                    app,
                    enabled: row?.enabled === true,
                    updated_at: updatedAt && !Number.isNaN(updatedAt.getTime()) ? updatedAt.toISOString() : null
                };
            })
        };
    };

    const setAppVisibility = async ({ admin, app, body, request } = {}) => {
        if (!PUSH_DIAGNOSTICS_VISIBILITY_APPS.includes(app)) throw validation('Unknown mobile app.');
        if (!body || typeof body !== 'object' || Array.isArray(body)
            || Object.keys(body).length !== 1 || !Object.hasOwn(body, 'enabled')
            || typeof body.enabled !== 'boolean') {
            throw validation('Request body must contain only a boolean enabled value.');
        }
        return settingsRepository.setVisibility({ app, enabled: body.enabled, admin, request });
    };

    const getAvailability = async (query = {}) => {
        if (!query || typeof query !== 'object' || Array.isArray(query)
            || Object.keys(query).some((key) => !['app', 'brand'].includes(key))) {
            return { enabled: false };
        }
        const { app, brand } = query;
        if (typeof app !== 'string' || !PUSH_DIAGNOSTICS_VISIBILITY_APPS.includes(app)
            || typeof brand !== 'string' || !FILTER_PATTERN.test(brand)) {
            return { enabled: false };
        }
        try {
            return { enabled: await settingsRepository.getEnabledByApp(app) };
        } catch (error) {
            logger.error('[PushDiagnostics] Availability lookup failed', {
                errorName: error?.name || 'Error'
            });
            throw new DomainError(
                DomainErrorCode.SERVICE_UNAVAILABLE,
                'Push diagnostics availability is temporarily unavailable.',
                { cause: error }
            );
        }
    };

    return {
        getOverview,
        listRegistrations,
        listAttempts,
        createEnrollmentCode,
        listDiagnosticDevices,
        revokeDiagnosticDevice,
        sendTestNotification,
        enrollDevice,
        listAppVisibility,
        setAppVisibility,
        getAvailability
    };
};

export default buildPushDiagnosticsUseCases;
