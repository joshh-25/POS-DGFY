import crypto from 'crypto';
import { Op } from 'sequelize';
import dbStore from '../../../utils/dbStore.js';
import tenantConnector from '../../../utils/TenantConnector.js';
import { getTenantModels } from '../../../utils/tenantModelFactory.js';
import { DomainError, DomainErrorCode } from '../../shared/contracts/domainErrors.js';
import posTerminalDeviceEnrollmentRepository from '../repositories/posTerminalDeviceEnrollmentRepository.js';

export const POS_DEVICE_KEY_ALGORITHM = 'ES256';
export const POS_DEVICE_ACTIVATION_TTL_MS = 10 * 60 * 1000;
export const POS_DEVICE_CHALLENGE_TTL_MS = 60 * 1000;
export const POS_DEVICE_CLIENT_TYPES = Object.freeze(['browser', 'electron', 'android', 'bridge', 'mobile']);
// Browser/Electron clients do not have the OS-backed non-exportable key
// provider required by the Phase 345 contract. They may remain enrolled for
// policy-off tenants, but a strict terminal can only activate clients that
// are able to provide the approved native signing boundary until later
// bridge/browser work explicitly extends this set.
export const POS_DEVICE_STRICT_CLIENT_TYPES = Object.freeze(['android', 'mobile']);
export const POS_DEVICE_PROOF_PURPOSES = Object.freeze(['session', 'request']);

const TERMINAL_ID_PATTERN = /^[A-Z0-9][A-Z0-9._-]{1,99}$/;
const DEVICE_ID_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._:-]{1,159}$/;
const REQUEST_METHOD_PATTERN = /^[A-Z]{3,12}$/;
const REQUEST_PATH_MAX_LENGTH = 255;
const MAX_PUBLIC_KEY_LENGTH = 16 * 1024;

const normalizeText = (value, max = 500) => String(value ?? '').trim().slice(0, max);
const normalizeBoundedText = (value, max) => {
    const raw = String(value ?? '').trim();
    return raw.length <= max ? raw : '';
};
const normalizeTerminalId = (value) => {
    const normalized = normalizeBoundedText(value, 100).toUpperCase();
    return TERMINAL_ID_PATTERN.test(normalized) ? normalized : '';
};
const normalizeDeviceId = (value) => {
    const normalized = normalizeBoundedText(value, 160);
    return DEVICE_ID_PATTERN.test(normalized) ? normalized : '';
};
const normalizeMethod = (value) => {
    const normalized = normalizeBoundedText(value, 12).toUpperCase();
    return REQUEST_METHOD_PATTERN.test(normalized) ? normalized : '';
};
const normalizePurpose = (value) => {
    const normalized = normalizeText(value, 40).toLowerCase();
    return POS_DEVICE_PROOF_PURPOSES.includes(normalized) ? normalized : '';
};
const normalizeClientType = (value) => {
    const normalized = normalizeText(value, 40).toLowerCase();
    return POS_DEVICE_CLIENT_TYPES.includes(normalized) ? normalized : '';
};
const isStrictClientType = (value) => POS_DEVICE_STRICT_CLIENT_TYPES.includes(normalizeClientType(value));
const parsePositiveInt = (value) => {
    const raw = typeof value === 'string' ? value.trim() : value;
    if (raw === '' || raw === null || raw === undefined) return null;
    const parsed = Number(raw);
    return Number.isSafeInteger(parsed) && parsed > 0 ? parsed : null;
};
const parseJson = (value, fallback = {}) => {
    if (value && typeof value === 'object') return value;
    if (typeof value !== 'string' || !value.trim()) return fallback;
    try {
        return JSON.parse(value);
    } catch {
        return fallback;
    }
};

const posDeviceError = (errorCode, message, statusCode = 403, details = {}) => (
    new DomainError(
        statusCode === 409 ? DomainErrorCode.CONFLICT : (
            statusCode === 422 ? DomainErrorCode.VALIDATION_FAILED : DomainErrorCode.AUTHORIZATION_FAILED
        ),
        message,
        {
            statusCode,
            details: { error_code: errorCode, ...details }
        }
    )
);

const isPosDeviceError = (error) => Boolean(
    String(error?.details?.error_code || '').startsWith('POS_DEVICE_')
);

const requireTenantContext = (tenantId = null) => {
    const store = dbStore.getStore();
    const contextTenantId = String(store?.tenantId || '').trim();
    const requestedTenantId = String(tenantId || '').trim();
    if (!contextTenantId || contextTenantId === 'default') {
        throw new DomainError(
            DomainErrorCode.TENANT_CONTEXT_MISSING,
            'A tenant context is required for POS device operations.',
            { statusCode: 400 }
        );
    }
    if (requestedTenantId && requestedTenantId !== contextTenantId) {
        throw posDeviceError('POS_DEVICE_TENANT_MISMATCH', 'POS device tenant context does not match the request.', 403);
    }
    return { store, tenantId: contextTenantId };
};

const randomToken = (bytes = 32) => crypto.randomBytes(bytes).toString('base64url');
const sha256 = (value) => {
    const input = Buffer.isBuffer(value)
        ? value
        : (value instanceof Uint8Array ? Buffer.from(value) : Buffer.from(String(value ?? ''), 'utf8'));
    return crypto.createHash('sha256').update(input).digest('hex');
};

const stableValue = (value) => {
    if (value === undefined) return null;
    if (Buffer.isBuffer(value)) return value.toString('base64');
    if (value === null || typeof value !== 'object') {
        if (typeof value === 'bigint') return value.toString();
        return value;
    }
    if (Array.isArray(value)) return value.map(stableValue);
    return Object.keys(value).sort().reduce((result, key) => {
        result[key] = stableValue(value[key]);
        return result;
    }, {});
};

export const stableStringify = (value) => JSON.stringify(stableValue(value));

export const canonicalRequestPath = (value) => {
    const raw = String(value ?? '').trim();
    const containsControlCharacter = Array.from(raw).some((character) => {
        const codePoint = character.codePointAt(0);
        return codePoint <= 0x1F || codePoint === 0x7F;
    });
    if (!raw || raw.length > 2048 || containsControlCharacter) return '';
    const separatorIndex = raw.indexOf('?');
    const pathPart = separatorIndex === -1 ? raw : raw.slice(0, separatorIndex);
    const queryPart = separatorIndex === -1 ? '' : raw.slice(separatorIndex + 1);
    const path = pathPart.startsWith('/') ? pathPart : `/${pathPart}`;
    let query = '';
    if (queryPart) {
        const params = [];
        for (const [key, val] of new URLSearchParams(queryPart).entries()) {
            params.push([key, val]);
        }
        params.sort(([aKey, aVal], [bKey, bVal]) => {
            if (aKey < bKey) return -1;
            if (aKey > bKey) return 1;
            if (aVal < bVal) return -1;
            if (aVal > bVal) return 1;
            return 0;
        });
        query = params.length > 0
            ? `?${params.map(([key, val]) => `${encodeURIComponent(key)}=${encodeURIComponent(val)}`).join('&')}`
            : '';
    }
    const normalized = `${path}${query}`;
    return normalized.length <= REQUEST_PATH_MAX_LENGTH ? normalized : '';
};

const bodyDigest = (body) => sha256(stableStringify(body === undefined ? null : body));

export const buildCanonicalRequest = ({
    tenantId,
    terminalId,
    locationId,
    deviceId,
    purpose,
    sessionId,
    challenge,
    method,
    path,
    body
} = {}) => stableStringify({
    version: 1,
    tenant_id: String(tenantId || '').trim(),
    terminal_id: normalizeTerminalId(terminalId),
    location_id: parsePositiveInt(locationId),
    device_id: normalizeDeviceId(deviceId),
    purpose: normalizePurpose(purpose),
    session_id: normalizeText(sessionId, 128),
    challenge: normalizeText(challenge, 512),
    method: normalizeMethod(method),
    path: canonicalRequestPath(path),
    body_sha256: bodyDigest(body)
});

const decodeBase64 = (value) => {
    const raw = normalizeText(value, 32 * 1024);
    if (!raw) return null;
    try {
        const normalized = raw.replace(/-/g, '+').replace(/_/g, '/');
        return Buffer.from(normalized, 'base64');
    } catch {
        return null;
    }
};

const normalizePublicKey = (value) => {
    const raw = String(value || '').trim();
    if (!raw || raw.length > MAX_PUBLIC_KEY_LENGTH) {
        throw posDeviceError('POS_DEVICE_KEY_INVALID', 'A valid P-256 public key is required.', 422);
    }
    let key;
    try {
        if (raw.includes('BEGIN PUBLIC KEY')) {
            key = crypto.createPublicKey(raw);
        } else {
            const der = decodeBase64(raw);
            if (!der?.length) throw new Error('empty key');
            key = crypto.createPublicKey({ key: der, format: 'der', type: 'spki' });
        }
    } catch {
        throw posDeviceError('POS_DEVICE_KEY_INVALID', 'A valid P-256 public key is required.', 422);
    }
    if (key.asymmetricKeyType !== 'ec' || key.asymmetricKeyDetails?.namedCurve !== 'prime256v1') {
        throw posDeviceError('POS_DEVICE_KEY_INVALID', 'Only ES256 (P-256) public keys are supported.', 422);
    }
    const der = key.export({ type: 'spki', format: 'der' });
    return {
        key,
        stored: key.export({ type: 'spki', format: 'pem' }).toString(),
        fingerprint: sha256(der)
    };
};

const decodeSignature = (value) => {
    const decoded = decodeBase64(value);
    return decoded?.length ? decoded : null;
};

const parseExpires = (value) => {
    const date = value instanceof Date ? value : new Date(value);
    return Number.isNaN(date.getTime()) ? null : date;
};

const publicEnrollment = (row) => {
    if (!row) return null;
    const value = typeof row.get === 'function' ? row.get({ plain: true }) : row;
    let publicKeyFingerprint = null;
    if (value.public_key) {
        try {
            publicKeyFingerprint = sha256(crypto.createPublicKey(value.public_key).export({ type: 'spki', format: 'der' }));
        } catch {
            publicKeyFingerprint = null;
        }
    }
    return {
        enrollment_id: parsePositiveInt(value.pos_terminal_device_enrollment_id),
        device_id: normalizeDeviceId(value.device_id),
        terminal_id: normalizeTerminalId(value.terminal_id),
        location_id: parsePositiveInt(value.location_id),
        key_algorithm: String(value.key_algorithm || POS_DEVICE_KEY_ALGORITHM).toUpperCase(),
        client_type: normalizeClientType(value.client_type) || null,
        status: String(value.status || '').toLowerCase(),
        version: Number(value.version || 1),
        public_key_fingerprint: publicKeyFingerprint,
        enrolled_by: parsePositiveInt(value.enrolled_by),
        enrolled_at: value.enrolled_at || null,
        last_seen_at: value.last_seen_at || null,
        revoked_by: parsePositiveInt(value.revoked_by),
        revoked_at: value.revoked_at || null,
        revoked_reason: value.revoked_reason || null,
        replaced_by: parsePositiveInt(value.replaced_by)
    };
};

// Most POS requests already run inside tenantHandler's AsyncLocalStorage
// context. DGFY account SSO reaches the POS session endpoint before a tenant
// access token exists, so its pre-session challenge endpoint uses this narrow
// resolver to establish the same tenant-local model set without ever falling
// back to landlord models. Existing tenant contexts are reused and a
// cross-tenant nesting attempt is rejected by requireTenantContext().
const runWithTenantContext = async (tenantId, callback, { allowTenantSwitch = false } = {}) => {
    const requestedTenantId = String(tenantId || '').trim();
    if (!requestedTenantId) {
        throw new DomainError(
            DomainErrorCode.TENANT_CONTEXT_MISSING,
            'A tenant context is required for POS device operations.',
            { statusCode: 400 }
        );
    }

    const current = dbStore.getStore();
    const currentTenantId = String(current?.tenantId || '').trim();
    if (currentTenantId && currentTenantId !== 'default') {
        if (currentTenantId !== requestedTenantId && !allowTenantSwitch) {
            throw posDeviceError('POS_DEVICE_TENANT_MISMATCH', 'POS device tenant context does not match the request.', 403);
        }
        if (currentTenantId === requestedTenantId) return callback();
    }

    const tenant = await posTerminalDeviceEnrollmentRepository.findTenantById(requestedTenantId);
    if (!tenant || String(tenant.status || '').trim().toLowerCase() !== 'active' || !tenant.company_token) {
        throw posDeviceError('POS_DEVICE_TENANT_UNAVAILABLE', 'The selected company is not available for POS device access.', 403);
    }

    let sequelize;
    try {
        sequelize = await tenantConnector.getConnection(tenant);
    } catch (error) {
        throw new DomainError(
            DomainErrorCode.SERVICE_UNAVAILABLE,
            'The company database is unavailable for POS device access.',
            { statusCode: 503, cause: error }
        );
    }
    const tenantModels = getTenantModels(sequelize);
    return dbStore.run({
        sequelize,
        tenantId: tenant.id,
        tenantToken: tenant.company_token,
        tenantName: tenant.name,
        tenantPlan: tenant.plan,
        ...tenantModels
    }, callback);
};

const loadSettings = async () => {
    const SystemSetting = dbStore.get('SystemSetting');
    if (!SystemSetting) throw new Error('SystemSetting model is unavailable');
    if (typeof SystemSetting.findAll === 'function') {
        const rows = await SystemSetting.findAll({
            where: { setting_key: { [Op.in]: ['pos_terminal_registry'] } },
            attributes: ['setting_key', 'setting_value', 'data_type']
        });
        return new Map(rows.map((row) => [row.setting_key, row]));
    }
    const row = await SystemSetting.findOne({ where: { setting_key: 'pos_terminal_registry' } });
    return new Map(row ? [[row.setting_key, row]] : []);
};

const readRegistry = (setting) => {
    const parsed = parseJson(setting?.setting_value ?? setting?.value, []);
    if (!Array.isArray(parsed)) return [];
    return parsed.map((entry) => ({
        terminal_id: normalizeTerminalId(entry?.terminal_id),
        location_id: parsePositiveInt(entry?.location_id),
        label: normalizeText(entry?.label, 80),
        is_active: entry?.is_active !== false,
        device_enforcement: String(entry?.device_enforcement || '').trim().toLowerCase() === 'strict' ? 'strict' : 'off'
    })).filter((entry) => entry.terminal_id && entry.is_active);
};

export const resolvePosDevicePolicy = async ({ tenantId = null, terminalId = null } = {}) => {
    const context = requireTenantContext(tenantId);
    const settings = await loadSettings();
    const registry = readRegistry(settings.get('pos_terminal_registry'));
    const strictEnabled = registry.some((entry) => entry.device_enforcement === 'strict');
    const normalizedTerminalId = normalizeTerminalId(terminalId);
    const registryEntry = normalizedTerminalId
        ? registry.find((entry) => entry.terminal_id === normalizedTerminalId) || null
        : null;
    return {
        tenant_id: context.tenantId,
        strict_enabled: strictEnabled,
        requires_registered_terminal: strictEnabled,
        terminal_id: normalizedTerminalId || null,
        registry_entry: registryEntry,
        registry_size: registry.length,
        strict_terminal: registryEntry?.device_enforcement === 'strict'
    };
};

const resolveBoundTerminal = async ({ tenantId, terminalId, locationId = null, allowOff = true } = {}) => {
    const normalizedTerminalId = normalizeTerminalId(terminalId);
    const policy = await resolvePosDevicePolicy({ tenantId, terminalId: normalizedTerminalId });
    if (!normalizedTerminalId) {
        throw posDeviceError('POS_DEVICE_TERMINAL_REQUIRED', 'A registered terminal id is required for POS device operations.', 403);
    }
    if (!policy.registry_entry) {
        throw posDeviceError('POS_DEVICE_TERMINAL_MISMATCH', 'The terminal is not an active tenant terminal.', 403);
    }
    if (!policy.registry_entry.location_id) {
        throw posDeviceError('POS_DEVICE_LOCATION_REQUIRED', 'The terminal must be assigned to a store location.', 422);
    }
    if (locationId != null && parsePositiveInt(locationId) !== policy.registry_entry.location_id) {
        throw posDeviceError('POS_DEVICE_LOCATION_MISMATCH', 'The request location does not match the registered terminal location.', 403);
    }
    if (!allowOff && policy.registry_entry.device_enforcement !== 'strict') {
        throw posDeviceError('POS_DEVICE_POLICY_REQUIRED', 'Strict device enforcement is required for this operation.', 403);
    }
    return {
        ...policy,
        terminal_id: policy.registry_entry.terminal_id,
        location_id: policy.registry_entry.location_id
    };
};

const requireReason = (reason) => {
    const normalized = normalizeText(reason, 500);
    if (normalized.length < 3) {
        throw posDeviceError('POS_DEVICE_REASON_REQUIRED', 'An audit reason is required.', 422);
    }
    return normalized;
};

const isUniqueConstraintError = (error) => {
    const message = String(error?.message || '').toLowerCase();
    return error?.name === 'SequelizeUniqueConstraintError' || message.includes('duplicate') || message.includes('unique');
};

const recordAudit = async ({ eventType, action, actorUserId, entityId = null, terminalId, locationId, reason, requestId, changes }, options = {}) => {
    await posTerminalDeviceEnrollmentRepository.createAuditLog({
        user_id: parsePositiveInt(actorUserId),
        entity_type: 'pos_terminal_device',
        entity_id: parsePositiveInt(entityId),
        action: action || 'VIEW',
        event_type: eventType,
        terminal_id: normalizeTerminalId(terminalId) || null,
        location_id: parsePositiveInt(locationId),
        reason: reason || null,
        request_id: normalizeText(requestId, 100) || null,
        changes: { event: eventType, ...changes }
    }, options);
};

export const issueActivationCode = async ({ tenantId = null, terminalId, locationId = null, issuedBy, reason, requestId = null } = {}) => {
    const actorUserId = parsePositiveInt(issuedBy);
    if (!actorUserId) throw posDeviceError('POS_DEVICE_ACTOR_REQUIRED', 'An authenticated administrator is required.', 403);
    const issuedReason = requireReason(reason);
    const binding = await resolveBoundTerminal({ tenantId, terminalId, locationId });
    const rawCode = randomToken(24);
    const now = new Date();
    const expiresAt = new Date(now.getTime() + POS_DEVICE_ACTIVATION_TTL_MS);
    try {
        return await posTerminalDeviceEnrollmentRepository.withTransaction(async (transaction) => {
            const activation = await posTerminalDeviceEnrollmentRepository.createActivation({
                activation_hash: sha256(rawCode),
                terminal_id: binding.terminal_id,
                location_id: binding.location_id,
                issued_by: actorUserId,
                issued_reason: issuedReason,
                expires_at: expiresAt,
                metadata: JSON.stringify({ tenant_id: binding.tenant_id, request_id: normalizeText(requestId, 100) || null })
            }, { transaction });
            const activationId = parsePositiveInt(activation?.pos_terminal_device_activation_id || activation?.id);
            await recordAudit({
                eventType: 'pos_device_activation_issued',
                action: 'CREATE',
                actorUserId,
                entityId: activationId,
                terminalId: binding.terminal_id,
                locationId: binding.location_id,
                reason: issuedReason,
                requestId,
                changes: { expires_at: expiresAt.toISOString(), activation_issued: true }
            }, { transaction });
            return {
                activation_code: rawCode,
                expires_at: expiresAt.toISOString(),
                terminal_id: binding.terminal_id,
                location_id: binding.location_id
            };
        });
    } catch (error) {
        if (isPosDeviceError(error)) throw error;
        throw new DomainError(DomainErrorCode.SERVICE_UNAVAILABLE, 'Unable to issue a POS device activation code.', { statusCode: 503, cause: error });
    }
};

export const activateDevice = async ({
    tenantId = null,
    activationCode,
    deviceId,
    publicKey,
    keyAlgorithm = POS_DEVICE_KEY_ALGORITHM,
    clientType,
    terminalId,
    locationId = null,
    actorUserId = null,
    reason,
    replaceEnrollmentId = null,
    requestId = null
} = {}) => {
    const normalizedCode = normalizeText(activationCode, 512);
    const normalizedDeviceId = normalizeDeviceId(deviceId);
    const normalizedTerminalId = normalizeTerminalId(terminalId);
    const normalizedAlgorithm = normalizeText(keyAlgorithm, 24).toUpperCase() || POS_DEVICE_KEY_ALGORITHM;
    const normalizedClientType = normalizeClientType(clientType);
    if (!normalizedCode) throw posDeviceError('POS_DEVICE_ACTIVATION_INVALID', 'A valid activation code is required.', 422);
    if (!normalizedDeviceId) throw posDeviceError('POS_DEVICE_DEVICE_ID_INVALID', 'A valid device id is required.', 422);
    if (!normalizedTerminalId) throw posDeviceError('POS_DEVICE_TERMINAL_REQUIRED', 'A terminal id is required.', 422);
    if (normalizedAlgorithm !== POS_DEVICE_KEY_ALGORITHM) throw posDeviceError('POS_DEVICE_KEY_ALGORITHM_UNSUPPORTED', 'Only ES256 device keys are supported.', 422);
    if (!normalizedClientType) throw posDeviceError('POS_DEVICE_CLIENT_TYPE_INVALID', 'A supported POS client type is required.', 422);
    const key = normalizePublicKey(publicKey);
    const binding = await resolveBoundTerminal({ tenantId, terminalId: normalizedTerminalId, locationId });
    if (binding.registry_entry.device_enforcement === 'strict' && !isStrictClientType(normalizedClientType)) {
        throw posDeviceError(
            'POS_DEVICE_UNSUPPORTED_CLIENT',
            'This POS client cannot be enrolled while strict device enforcement is enabled.',
            422,
            { supported_client_types: [...POS_DEVICE_STRICT_CLIENT_TYPES] }
        );
    }
    const actor = parsePositiveInt(actorUserId);
    const replacementId = parsePositiveInt(replaceEnrollmentId);
    if (replacementId && !actor) {
        throw posDeviceError('POS_DEVICE_ACTOR_REQUIRED', 'An authenticated administrator is required to replace a POS device.', 403);
    }
    const auditReason = replacementId ? requireReason(reason) : (reason ? requireReason(reason) : 'device activation');
    const activationHash = sha256(normalizedCode);
    const now = new Date();

    try {
        const result = await posTerminalDeviceEnrollmentRepository.withTransaction(async (transaction) => {
            const activation = await posTerminalDeviceEnrollmentRepository.findActivationByHash(activationHash, { transaction, lock: true });
            if (!activation) throw posDeviceError('POS_DEVICE_ACTIVATION_INVALID', 'The activation code is invalid.', 403);
            const activationValue = typeof activation.get === 'function' ? activation.get({ plain: true }) : activation;
            const auditActor = actor || parsePositiveInt(activationValue.issued_by);
            if (!auditActor) throw posDeviceError('POS_DEVICE_ACTOR_REQUIRED', 'The activation code has no issuing administrator.', 403);
            if (activationValue.consumed_at) throw posDeviceError('POS_DEVICE_ACTIVATION_REPLAYED', 'The activation code has already been used.', 409);
            const expiresAt = parseExpires(activationValue.expires_at);
            if (!expiresAt || expiresAt.getTime() <= now.getTime()) throw posDeviceError('POS_DEVICE_ACTIVATION_EXPIRED', 'The activation code has expired.', 410);
            if (normalizeTerminalId(activationValue.terminal_id) !== binding.terminal_id
                || parsePositiveInt(activationValue.location_id) !== binding.location_id) {
                throw posDeviceError('POS_DEVICE_ACTIVATION_BINDING_MISMATCH', 'The activation code is bound to a different terminal.', 403);
            }

            const activeForTerminal = await posTerminalDeviceEnrollmentRepository.findActiveEnrollmentByTerminal(binding.terminal_id, { transaction, lock: true });
            const activeForDevice = await posTerminalDeviceEnrollmentRepository.findActiveEnrollmentByDevice(normalizedDeviceId, { transaction, lock: true });
            const replacement = replacementId
                ? await posTerminalDeviceEnrollmentRepository.findEnrollmentById(replacementId, { transaction, lock: true })
                : null;
            if (replacementId && !replacement) throw posDeviceError('POS_DEVICE_REPLACEMENT_NOT_FOUND', 'The device enrollment to replace was not found.', 404);
            const replacementValue = replacement && (typeof replacement.get === 'function' ? replacement.get({ plain: true }) : replacement);
            if (replacementValue && String(replacementValue.status || '').toLowerCase() !== 'active') {
                throw posDeviceError('POS_DEVICE_REPLACEMENT_INACTIVE', 'Only an active device enrollment can be replaced.', 409);
            }
            if ((activeForTerminal && parsePositiveInt(activeForTerminal.pos_terminal_device_enrollment_id) !== replacementId)
                || (activeForDevice && parsePositiveInt(activeForDevice.pos_terminal_device_enrollment_id) !== replacementId)) {
                throw posDeviceError('POS_DEVICE_ENROLLMENT_EXISTS', 'The terminal or device already has an active enrollment.', 409);
            }
            if (replacementValue
                && (normalizeTerminalId(replacementValue.terminal_id) !== binding.terminal_id
                    || parsePositiveInt(replacementValue.location_id) !== binding.location_id)) {
                throw posDeviceError('POS_DEVICE_REPLACEMENT_BINDING_MISMATCH', 'The replacement enrollment is bound to a different terminal.', 409);
            }

            if (replacementValue) {
                await posTerminalDeviceEnrollmentRepository.updateEnrollment(replacementId, {
                    status: 'replaced',
                    active_terminal_key: null,
                    active_device_key: null,
                    revoked_by: auditActor,
                    revoked_at: now,
                    revoked_reason: auditReason
                }, { transaction });
            }

            const enrollment = await posTerminalDeviceEnrollmentRepository.createEnrollment({
                device_id: normalizedDeviceId,
                public_key: key.stored,
                key_algorithm: normalizedAlgorithm,
                client_type: normalizedClientType,
                terminal_id: binding.terminal_id,
                location_id: binding.location_id,
                status: 'active',
                version: Number(replacementValue?.version || 0) + 1,
                enrolled_by: auditActor,
                enrolled_at: now,
                active_terminal_key: binding.terminal_id,
                active_device_key: normalizedDeviceId,
                metadata: JSON.stringify({ public_key_fingerprint: key.fingerprint, request_id: normalizeText(requestId, 100) || null })
            }, { transaction });
            const enrollmentId = parsePositiveInt(enrollment.pos_terminal_device_enrollment_id || enrollment.id);
            if (replacementId) {
                await posTerminalDeviceEnrollmentRepository.updateEnrollment(replacementId, { replaced_by: enrollmentId }, { transaction });
            }
            const consumed = await posTerminalDeviceEnrollmentRepository.consumeActivation(
                activationValue.pos_terminal_device_activation_id,
                { deviceId: normalizedDeviceId, consumedAt: now, transaction }
            );
            if (!consumed) throw posDeviceError('POS_DEVICE_ACTIVATION_REPLAYED', 'The activation code has already been used.', 409);
            await recordAudit({
                eventType: replacementId ? 'pos_device_replaced' : 'pos_device_activated',
                action: 'UPDATE',
                actorUserId: auditActor,
                terminalId: binding.terminal_id,
                locationId: binding.location_id,
                entityId: enrollmentId,
                reason: auditReason,
                requestId,
                changes: {
                    enrollment_id: enrollmentId,
                    replaced_enrollment_id: replacementId || null,
                    device_id: normalizedDeviceId,
                    public_key_fingerprint: key.fingerprint
                }
            }, { transaction });
            return publicEnrollment(enrollment);
        });
        return result;
    } catch (error) {
        if (isPosDeviceError(error)) throw error;
        if (isUniqueConstraintError(error)) throw posDeviceError('POS_DEVICE_ENROLLMENT_EXISTS', 'The terminal or device already has an active enrollment.', 409);
        throw new DomainError(DomainErrorCode.SERVICE_UNAVAILABLE, 'Unable to activate the POS device.', { statusCode: 503, cause: error });
    }
};

export const listDevices = async ({ tenantId = null, terminalId = null, includeInactive = true } = {}) => {
    requireTenantContext(tenantId);
    const where = {};
    if (terminalId) where.terminal_id = normalizeTerminalId(terminalId);
    if (!includeInactive) where.status = 'active';
    const rows = await posTerminalDeviceEnrollmentRepository.listEnrollments({ where });
    return rows.map(publicEnrollment);
};

export const revokeDevice = async ({ tenantId = null, enrollmentId, actorUserId, reason, requestId = null } = {}) => {
    requireTenantContext(tenantId);
    const id = parsePositiveInt(enrollmentId);
    if (!id) throw posDeviceError('POS_DEVICE_ENROLLMENT_REQUIRED', 'A device enrollment id is required.', 422);
    const actor = parsePositiveInt(actorUserId);
    if (!actor) throw posDeviceError('POS_DEVICE_ACTOR_REQUIRED', 'An authenticated administrator is required.', 403);
    const revokedReason = requireReason(reason);
    const now = new Date();
    const result = await posTerminalDeviceEnrollmentRepository.withTransaction(async (transaction) => {
        const row = await posTerminalDeviceEnrollmentRepository.findEnrollmentById(id, { transaction, lock: true });
        if (!row) throw posDeviceError('POS_DEVICE_ENROLLMENT_NOT_FOUND', 'The device enrollment was not found.', 404);
        const value = typeof row.get === 'function' ? row.get({ plain: true }) : row;
        if (String(value.status || '').toLowerCase() !== 'active') {
            throw posDeviceError('POS_DEVICE_ENROLLMENT_INACTIVE', 'The device enrollment is already inactive.', 409);
        }
        await posTerminalDeviceEnrollmentRepository.updateEnrollment(id, {
            status: 'revoked',
            active_terminal_key: null,
            active_device_key: null,
            revoked_by: actor,
            revoked_at: now,
            revoked_reason: revokedReason
        }, { transaction });
        await recordAudit({
            eventType: 'pos_device_revoked',
            action: 'UPDATE',
            actorUserId: actor,
            entityId: id,
            terminalId: value.terminal_id,
            locationId: value.location_id,
            reason: revokedReason,
            requestId,
            changes: { enrollment_id: id, device_id: normalizeDeviceId(value.device_id) }
        }, { transaction });
        return { ...publicEnrollment(value), status: 'revoked', revoked_at: now.toISOString(), revoked_by: actor, revoked_reason: revokedReason };
    });
    return result;
};

export const replaceDevice = async (args = {}) => activateDevice({ ...args, replaceEnrollmentId: args.enrollmentId });

const issueChallengeInTenantContext = async ({
    tenantId = null,
    deviceId,
    terminalId,
    purpose = 'request',
    requestPath,
    requestMethod = 'POST',
    sessionId = null,
    actorUserId = null,
    requestId = null
} = {}) => {
    const normalizedDeviceId = normalizeDeviceId(deviceId);
    if (!normalizedDeviceId) throw posDeviceError('POS_DEVICE_DEVICE_ID_INVALID', 'A valid device id is required.', 422);
    const normalizedPurpose = normalizePurpose(purpose);
    if (!normalizedPurpose) throw posDeviceError('POS_DEVICE_PURPOSE_INVALID', 'A valid device proof purpose is required.', 422);
    const normalizedMethod = normalizeMethod(requestMethod);
    if (!normalizedMethod) throw posDeviceError('POS_DEVICE_METHOD_INVALID', 'A valid request method is required.', 422);
    const normalizedPath = canonicalRequestPath(requestPath);
    if (!normalizedPath) throw posDeviceError('POS_DEVICE_PATH_REQUIRED', 'A request path is required.', 422);
    const binding = await resolveBoundTerminal({ tenantId, terminalId });
    const enrollment = await posTerminalDeviceEnrollmentRepository.findActiveEnrollmentByDevice(normalizedDeviceId);
    if (!enrollment) throw posDeviceError('POS_DEVICE_NOT_ENROLLED', 'The device is not enrolled for this tenant.', 403);
    const value = typeof enrollment.get === 'function' ? enrollment.get({ plain: true }) : enrollment;
    if (normalizeTerminalId(value.terminal_id) !== binding.terminal_id || parsePositiveInt(value.location_id) !== binding.location_id) {
        throw posDeviceError('POS_DEVICE_TERMINAL_MISMATCH', 'The device is not enrolled for this terminal.', 403);
    }
    if (binding.registry_entry.device_enforcement === 'strict' && !isStrictClientType(value.client_type)) {
        throw posDeviceError(
            'POS_DEVICE_UNSUPPORTED_CLIENT',
            'This enrolled client is not supported while strict device enforcement is enabled.',
            403,
            { supported_client_types: [...POS_DEVICE_STRICT_CLIENT_TYPES] }
        );
    }
    const rawChallenge = randomToken(32);
    const resolvedSessionId = normalizeText(sessionId, 128) || randomToken(18);
    const expiresAt = new Date(Date.now() + POS_DEVICE_CHALLENGE_TTL_MS);
    return posTerminalDeviceEnrollmentRepository.withTransaction(async (transaction) => {
        const challenge = await posTerminalDeviceEnrollmentRepository.createChallenge({
            challenge_hash: sha256(rawChallenge),
            device_id: normalizedDeviceId,
            terminal_id: binding.terminal_id,
            location_id: binding.location_id,
            purpose: normalizedPurpose,
            request_path: normalizedPath,
            request_method: normalizedMethod,
            session_id: resolvedSessionId,
            expires_at: expiresAt
        }, { transaction });
        const challengeId = parsePositiveInt(challenge?.pos_terminal_device_challenge_id || challenge?.id);
        await recordAudit({
            eventType: 'pos_device_challenge_issued',
            action: 'CREATE',
            actorUserId,
            entityId: challengeId,
            terminalId: binding.terminal_id,
            locationId: binding.location_id,
            requestId,
            changes: { device_id: normalizedDeviceId, purpose: normalizedPurpose, request_path: normalizedPath }
        }, { transaction });
        return {
            challenge: rawChallenge,
            expires_at: expiresAt.toISOString(),
            device_id: normalizedDeviceId,
            terminal_id: binding.terminal_id,
            location_id: binding.location_id,
            purpose: normalizedPurpose,
            request_path: normalizedPath,
            request_method: normalizedMethod,
            session_id: resolvedSessionId
        };
    });
};

export const issueChallenge = async (args = {}) => {
    const currentTenantId = String(dbStore.getStore()?.tenantId || '').trim();
    if (currentTenantId && currentTenantId !== 'default') {
        return issueChallengeInTenantContext(args);
    }
    return runWithTenantContext(args.tenantId, () => issueChallengeInTenantContext(args));
};

// Explicit name for callers that issue a challenge from a landlord-scoped
// DGFY account session. Keeping the wrapper separate makes the tenant-bound
// behavior visible at the call site and leaves normal POS request behavior
// unchanged.
export const issueChallengeForTenant = async (args = {}) => (
    // DGFY company switching can arrive with the previous company's tenant
    // cookie still attached. Membership authorization is completed by the
    // caller before this landlord-scoped wrapper is reached, so explicitly
    // resolve the requested company instead of treating the stale cookie as
    // an authorization boundary. Normal tenant-scoped callers keep the
    // fail-closed cross-tenant guard in runWithTenantContext().
    runWithTenantContext(args.tenantId, () => issueChallengeInTenantContext(args), { allowTenantSwitch: true })
);

export const verifyDeviceProof = async ({
    tenantId = null,
    deviceId,
    terminalId,
    locationId = null,
    challenge,
    signature,
    sessionId,
    purpose,
    method,
    path,
    body,
    requestId = null
} = {}) => {
    const context = requireTenantContext(tenantId);
    const normalizedDeviceId = normalizeDeviceId(deviceId);
    const normalizedTerminalId = normalizeTerminalId(terminalId);
    const normalizedPurpose = normalizePurpose(purpose);
    const normalizedMethod = normalizeMethod(method);
    const normalizedPath = canonicalRequestPath(path);
    const normalizedSessionId = normalizeText(sessionId, 128);
    const rawChallenge = normalizeText(challenge, 512);
    const decodedSignature = decodeSignature(signature);
    if (!normalizedDeviceId || !normalizedTerminalId || !normalizedPurpose || !normalizedMethod || !normalizedPath || !normalizedSessionId || !rawChallenge || !decodedSignature) {
        throw posDeviceError('POS_DEVICE_PROOF_INVALID', 'A complete POS device proof is required.', 403);
    }
    const binding = await resolveBoundTerminal({ tenantId: context.tenantId, terminalId: normalizedTerminalId, locationId });
    const result = await posTerminalDeviceEnrollmentRepository.withTransaction(async (transaction) => {
        const challengeRow = await posTerminalDeviceEnrollmentRepository.findChallengeByHash(sha256(rawChallenge), { transaction, lock: true });
        if (!challengeRow) throw posDeviceError('POS_DEVICE_CHALLENGE_INVALID', 'The POS device challenge is invalid.', 403);
        const challengeValue = typeof challengeRow.get === 'function' ? challengeRow.get({ plain: true }) : challengeRow;
        if (challengeValue.consumed_at) throw posDeviceError('POS_DEVICE_PROOF_REPLAYED', 'The POS device proof has already been used.', 409);
        const expiresAt = parseExpires(challengeValue.expires_at);
        if (!expiresAt || expiresAt.getTime() <= Date.now()) throw posDeviceError('POS_DEVICE_CHALLENGE_EXPIRED', 'The POS device challenge has expired.', 410);
        if (normalizeDeviceId(challengeValue.device_id) !== normalizedDeviceId
            || normalizeTerminalId(challengeValue.terminal_id) !== binding.terminal_id
            || parsePositiveInt(challengeValue.location_id) !== binding.location_id
            || String(challengeValue.purpose || '').toLowerCase() !== normalizedPurpose
            || normalizeText(challengeValue.session_id, 128) !== normalizedSessionId
            || normalizeMethod(challengeValue.request_method || 'POST') !== normalizedMethod
            || canonicalRequestPath(challengeValue.request_path) !== normalizedPath) {
            throw posDeviceError('POS_DEVICE_PROOF_BINDING_MISMATCH', 'The POS device proof does not match this request.', 403);
        }
        const enrollment = await posTerminalDeviceEnrollmentRepository.findActiveEnrollmentByDevice(normalizedDeviceId, { transaction, lock: true });
        if (!enrollment) throw posDeviceError('POS_DEVICE_NOT_ENROLLED', 'The POS device is not enrolled or has been revoked.', 403);
        const enrollmentValue = typeof enrollment.get === 'function' ? enrollment.get({ plain: true }) : enrollment;
        if (normalizeTerminalId(enrollmentValue.terminal_id) !== binding.terminal_id || parsePositiveInt(enrollmentValue.location_id) !== binding.location_id) {
            throw posDeviceError('POS_DEVICE_TERMINAL_MISMATCH', 'The POS device is not enrolled for this terminal.', 403);
        }
        if (binding.registry_entry.device_enforcement === 'strict' && !isStrictClientType(enrollmentValue.client_type)) {
            throw posDeviceError(
                'POS_DEVICE_UNSUPPORTED_CLIENT',
                'This enrolled client is not supported while strict device enforcement is enabled.',
                403,
                { supported_client_types: [...POS_DEVICE_STRICT_CLIENT_TYPES] }
            );
        }
        let publicKey;
        try {
            publicKey = crypto.createPublicKey(enrollmentValue.public_key);
        } catch {
            throw posDeviceError('POS_DEVICE_KEY_INVALID', 'The enrolled device key is invalid.', 403);
        }
        const canonical = buildCanonicalRequest({
            tenantId: context.tenantId,
            terminalId: binding.terminal_id,
            locationId: binding.location_id,
            deviceId: normalizedDeviceId,
            purpose: normalizedPurpose,
            sessionId: normalizedSessionId,
            challenge: rawChallenge,
            method: normalizedMethod,
            path: normalizedPath,
            body
        });
        let valid;
        try {
            valid = crypto.verify('sha256', Buffer.from(canonical, 'utf8'), publicKey, decodedSignature);
        } catch {
            valid = false;
        }
        if (!valid) throw posDeviceError('POS_DEVICE_PROOF_INVALID', 'The POS device signature is invalid.', 403);
        const consumed = await posTerminalDeviceEnrollmentRepository.consumeChallenge(
            challengeValue.pos_terminal_device_challenge_id,
            { consumedAt: new Date(), requestId: normalizeText(requestId, 120), transaction }
        );
        if (!consumed) throw posDeviceError('POS_DEVICE_PROOF_REPLAYED', 'The POS device proof has already been used.', 409);
        await posTerminalDeviceEnrollmentRepository.touchEnrollment(enrollmentValue.pos_terminal_device_enrollment_id, new Date(), { transaction });
        return {
            verified: true,
            tenant_id: context.tenantId,
            device_id: normalizedDeviceId,
            terminal_id: binding.terminal_id,
            location_id: binding.location_id,
            purpose: normalizedPurpose,
            session_id: normalizedSessionId
        };
    });
    return result;
};

export const assertPosDeviceProof = async ({
    tenantId = null,
    terminalId,
    deviceId,
    challenge,
    signature,
    sessionId,
    purpose = 'request',
    method = 'GET',
    path = '/',
    body = null,
    locationId = null,
    requestId = null
} = {}) => {
    const policy = await resolvePosDevicePolicy({ tenantId, terminalId });
    if (!policy.strict_enabled) {
        return { required: false, verified: false, terminal_id: policy.terminal_id, location_id: policy.registry_entry?.location_id || null };
    }
    const normalizedTerminalId = normalizeTerminalId(terminalId);
    if (!normalizedTerminalId) throw posDeviceError('POS_DEVICE_TERMINAL_REQUIRED', 'A registered terminal id is required for POS access.', 403);
    if (!policy.registry_entry) throw posDeviceError('POS_DEVICE_TERMINAL_MISMATCH', 'The terminal is not an active tenant terminal.', 403);
    if (policy.registry_entry.device_enforcement !== 'strict') {
        return { required: false, verified: false, terminal_id: policy.registry_entry.terminal_id, location_id: policy.registry_entry.location_id };
    }
    return {
        required: true,
        ...(await verifyDeviceProof({
            tenantId,
            deviceId,
            terminalId: normalizedTerminalId,
            locationId: locationId || policy.registry_entry.location_id,
            challenge,
            signature,
            sessionId,
            purpose,
            method,
            path,
            body,
            requestId
        }))
    };
};

export const isStrictTerminal = async ({ tenantId = null, terminalId = null } = {}) => {
    const policy = await resolvePosDevicePolicy({ tenantId, terminalId });
    return policy.strict_terminal;
};

export default {
    issueActivationCode,
    activateDevice,
    listDevices,
    revokeDevice,
    replaceDevice,
    issueChallenge,
    issueChallengeForTenant,
    verifyDeviceProof,
    assertPosDeviceProof,
    resolvePosDevicePolicy,
    isStrictTerminal,
    canonicalRequestPath,
    buildCanonicalRequest,
    stableStringify
};
