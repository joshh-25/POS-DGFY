import crypto from 'crypto';
import { describe, expect, it, jest } from '@jest/globals';
import { Op } from 'sequelize';
import dbStore from '../src/utils/dbStore.js';
import {
    activateDevice,
    assertPosDeviceProof,
    buildCanonicalRequest,
    issueActivationCode,
    issueChallengeForTenant,
    revokeDevice,
    resolvePosDevicePolicy,
    stableStringify,
    verifyDeviceProof
} from '../src/modules/pos/services/posTerminalDeviceEnrollmentService.js';

const row = (value) => {
    const result = { ...value };
    result.get = ({ plain } = {}) => (plain ? { ...result } : result);
    return result;
};

const matchesNullableWhere = (value, where) => {
    if (!where || !Object.prototype.hasOwnProperty.call(where, 'consumed_at')) return true;
    const expected = where.consumed_at?.[Op.is];
    return expected === null ? value.consumed_at == null : value.consumed_at === expected;
};

const buildDeviceStore = ({ strict = true, enforceUniqueActive = false } = {}) => {
    const activations = [];
    const enrollments = [];
    const challenges = [];
    const auditRows = [];
    let activationId = 1;
    let enrollmentId = 1;
    let challengeId = 1;

    const Activation = {
        create: jest.fn(async (payload) => {
            const value = row({
                pos_terminal_device_activation_id: activationId++,
                ...payload
            });
            activations.push(value);
            return value;
        }),
        findOne: jest.fn(async ({ where }) => activations.find((entry) => entry.activation_hash === where.activation_hash) || null),
        update: jest.fn(async (changes, { where }) => {
            const entry = activations.find((candidate) => candidate.pos_terminal_device_activation_id === where.pos_terminal_device_activation_id
                && matchesNullableWhere(candidate, where));
            if (!entry) return [0];
            Object.assign(entry, changes);
            return [1];
        })
    };

    const Enrollment = {
        create: jest.fn(async (payload) => {
            if (enforceUniqueActive && enrollments.some((entry) => (
                entry.active_terminal_key === payload.active_terminal_key
                || entry.active_device_key === payload.active_device_key
            ))) {
                const error = new Error('Duplicate active POS device enrollment');
                error.name = 'SequelizeUniqueConstraintError';
                throw error;
            }
            const value = row({
                pos_terminal_device_enrollment_id: enrollmentId++,
                ...payload
            });
            enrollments.push(value);
            return value;
        }),
        findByPk: jest.fn(async (id) => enrollments.find((entry) => entry.pos_terminal_device_enrollment_id === Number(id)) || null),
        findOne: jest.fn(async ({ where }) => enrollments.find((entry) => (
            Object.entries(where || {}).every(([key, expected]) => entry[key] === expected)
        )) || null),
        findAll: jest.fn(async ({ where = {} } = {}) => enrollments.filter((entry) => (
            Object.entries(where).every(([key, expected]) => entry[key] === expected)
        ))),
        update: jest.fn(async (changes, { where }) => {
            const entry = enrollments.find((candidate) => candidate.pos_terminal_device_enrollment_id === Number(where.pos_terminal_device_enrollment_id));
            if (!entry) return [0];
            Object.assign(entry, changes);
            return [1];
        })
    };

    const Challenge = {
        create: jest.fn(async (payload) => {
            const value = row({
                pos_terminal_device_challenge_id: challengeId++,
                ...payload
            });
            challenges.push(value);
            return value;
        }),
        findOne: jest.fn(async ({ where }) => challenges.find((entry) => entry.challenge_hash === where.challenge_hash) || null),
        update: jest.fn(async (changes, { where }) => {
            const entry = challenges.find((candidate) => candidate.pos_terminal_device_challenge_id === where.pos_terminal_device_challenge_id
                && matchesNullableWhere(candidate, where));
            if (!entry) return [0];
            Object.assign(entry, changes);
            return [1];
        })
    };

    const SystemSetting = {
        findAll: jest.fn(async () => [{
            setting_key: 'pos_terminal_registry',
            setting_value: JSON.stringify([{
                terminal_id: 'COUNTER-01',
                location_id: 7,
                is_active: true,
                device_enforcement: strict ? 'strict' : 'off'
            }]),
            data_type: 'json'
        }])
    };

    const AuditLog = { create: jest.fn(async (payload) => { auditRows.push(payload); return payload; }) };
    const transaction = { LOCK: { UPDATE: 'UPDATE' } };
    const sequelize = { transaction: jest.fn(async (callback) => callback(transaction)) };

    return {
        tenantId: 'tenant-a',
        sequelize,
        PosTerminalDeviceActivation: Activation,
        PosTerminalDeviceEnrollment: Enrollment,
        PosTerminalDeviceChallenge: Challenge,
        SystemSetting,
        AuditLog,
        activations,
        enrollments,
        challenges,
        auditRows
    };
};

const withStore = (store, callback) => dbStore.run(store, callback);

const keyPair = () => crypto.generateKeyPairSync('ec', { namedCurve: 'prime256v1' });

describe('POS terminal device enrollment service', () => {
    it('hashes one-use activation codes and atomically creates a tenant-bound enrollment', async () => {
        const store = buildDeviceStore();
        await withStore(store, async () => {
            const issued = await issueActivationCode({
                tenantId: 'tenant-a',
                terminalId: 'counter-01',
                locationId: 7,
                issuedBy: 11,
                reason: 'Enroll the approved POS terminal'
            });
            expect(issued.activation_code).toBeTruthy();
            expect(store.activations).toHaveLength(1);
            expect(store.activations[0].activation_hash).toHaveLength(64);
            expect(store.activations[0].activation_hash).not.toBe(issued.activation_code);
            expect(store.activations[0].metadata).not.toContain(issued.activation_code);

            const keys = keyPair();
            const enrolled = await activateDevice({
                tenantId: 'tenant-a',
                activationCode: issued.activation_code,
                deviceId: 'device-a',
                publicKey: keys.publicKey.export({ type: 'spki', format: 'pem' }).toString(),
                clientType: 'android',
                terminalId: 'COUNTER-01',
                locationId: 7,
                reason: 'Approved terminal enrollment'
            });

            expect(enrolled).toMatchObject({
                device_id: 'device-a',
                terminal_id: 'COUNTER-01',
                location_id: 7,
                status: 'active',
                key_algorithm: 'ES256'
            });
            expect(store.enrollments[0].public_key).toContain('BEGIN PUBLIC KEY');
            expect(enrolled.public_key_fingerprint).toBe(
                crypto.createHash('sha256')
                    .update(keys.publicKey.export({ type: 'spki', format: 'der' }))
                    .digest('hex')
            );
            expect(store.activations[0].consumed_at).toBeInstanceOf(Date);
            expect(store.auditRows.some((entry) => entry.event_type === 'pos_device_activated' && entry.user_id === 11)).toBe(true);

            await expect(activateDevice({
                tenantId: 'tenant-a',
                activationCode: issued.activation_code,
                deviceId: 'device-b',
                publicKey: keys.publicKey.export({ type: 'spki', format: 'pem' }).toString(),
                clientType: 'android',
                terminalId: 'COUNTER-01',
                locationId: 7,
                actorUserId: 11,
                reason: 'Replay attempt'
            })).rejects.toMatchObject({
                details: { error_code: 'POS_DEVICE_ACTIVATION_REPLAYED' }
            });

            const secondActivation = await issueActivationCode({
                tenantId: 'tenant-a', terminalId: 'COUNTER-01', locationId: 7, issuedBy: 11, reason: 'Duplicate terminal guard'
            });
            await expect(activateDevice({
                tenantId: 'tenant-a', activationCode: secondActivation.activation_code, deviceId: 'device-b',
                publicKey: keys.publicKey.export({ type: 'spki', format: 'pem' }).toString(), clientType: 'android',
                terminalId: 'COUNTER-01', locationId: 7, actorUserId: 11, reason: 'Duplicate terminal guard'
            })).rejects.toMatchObject({
                details: { error_code: 'POS_DEVICE_ENROLLMENT_EXISTS' }
            });
            expect(store.activations[1].consumed_at).toBeFalsy();
        });
    });

    it('maps concurrent first enrollments to one active terminal binding', async () => {
        const store = buildDeviceStore({ enforceUniqueActive: true });
        await withStore(store, async () => {
            const activations = await Promise.all([
                issueActivationCode({
                    tenantId: 'tenant-a', terminalId: 'COUNTER-01', locationId: 7, issuedBy: 11, reason: 'Concurrent enrollment A'
                }),
                issueActivationCode({
                    tenantId: 'tenant-a', terminalId: 'COUNTER-01', locationId: 7, issuedBy: 11, reason: 'Concurrent enrollment B'
                })
            ]);
            const keys = [keyPair(), keyPair()];
            const results = await Promise.allSettled(activations.map((activation, index) => activateDevice({
                tenantId: 'tenant-a',
                activationCode: activation.activation_code,
                deviceId: `device-${index}`,
                publicKey: keys[index].publicKey.export({ type: 'spki', format: 'pem' }).toString(),
                clientType: 'android',
                terminalId: 'COUNTER-01',
                locationId: 7,
                reason: `Concurrent enrollment ${index}`
            })));

            expect(results.filter((result) => result.status === 'fulfilled')).toHaveLength(1);
            expect(results.filter((result) => result.status === 'rejected')).toHaveLength(1);
            expect(results.find((result) => result.status === 'rejected').reason)
                .toMatchObject({ details: { error_code: 'POS_DEVICE_ENROLLMENT_EXISTS' } });
            expect(store.enrollments.filter((entry) => entry.status === 'active')).toHaveLength(1);
        });
    });

    it('binds a signed proof to the canonical request and rejects replay, wrong key, and revocation', async () => {
        const store = buildDeviceStore();
        await withStore(store, async () => {
            const keys = keyPair();
            const activation = await issueActivationCode({
                tenantId: 'tenant-a', terminalId: 'COUNTER-01', locationId: 7, issuedBy: 11, reason: 'Enroll device'
            });
            await activateDevice({
                tenantId: 'tenant-a', activationCode: activation.activation_code, deviceId: 'device-a',
                publicKey: keys.publicKey.export({ type: 'spki', format: 'pem' }).toString(), clientType: 'android',
                terminalId: 'COUNTER-01', locationId: 7, actorUserId: 11, reason: 'Enroll device'
            });

            const challenge = await issueChallengeForTenant({
                tenantId: 'tenant-a', deviceId: 'device-a', terminalId: 'COUNTER-01', purpose: 'request',
                requestPath: '/api/v1/pos/catalog?z=2&a=1', requestMethod: 'GET'
            });
            const proofInput = {
                tenantId: 'tenant-a', terminalId: 'COUNTER-01', locationId: 7, deviceId: 'device-a',
                purpose: 'request', sessionId: challenge.session_id, challenge: challenge.challenge,
                method: 'GET', path: '/api/v1/pos/catalog?a=1&z=2', body: null
            };
            const signature = crypto.sign(
                'sha256',
                Buffer.from(buildCanonicalRequest(proofInput), 'utf8'),
                keys.privateKey
            ).toString('base64url');

            await expect(verifyDeviceProof({
                ...proofInput,
                signature: crypto.sign('sha256', Buffer.from('wrong', 'utf8'), keys.privateKey).toString('base64url')
            })).rejects.toMatchObject({ details: { error_code: 'POS_DEVICE_PROOF_INVALID' } });

            const verified = await verifyDeviceProof({ ...proofInput, signature });
            expect(verified).toMatchObject({
                verified: true,
                tenant_id: 'tenant-a',
                terminal_id: 'COUNTER-01',
                location_id: 7
            });

            await expect(verifyDeviceProof({ ...proofInput, signature })).rejects.toMatchObject({
                details: { error_code: 'POS_DEVICE_PROOF_REPLAYED' }
            });

            await revokeDevice({
                tenantId: 'tenant-a', enrollmentId: 1, actorUserId: 11, reason: 'Device retired'
            });
            await expect(issueChallengeForTenant({
                tenantId: 'tenant-a', deviceId: 'device-a', terminalId: 'COUNTER-01',
                purpose: 'request', requestPath: '/api/v1/pos/catalog', requestMethod: 'GET'
            })).rejects.toMatchObject({ details: { error_code: 'POS_DEVICE_NOT_ENROLLED' } });
        });
    });

    it('fails closed for tenant mismatches and keeps policy-off tenants compatible', async () => {
        const strictStore = buildDeviceStore({ strict: true });
        await withStore(strictStore, async () => {
            await expect(resolvePosDevicePolicy({ tenantId: 'tenant-b', terminalId: 'COUNTER-01' }))
                .rejects.toMatchObject({ details: { error_code: 'POS_DEVICE_TENANT_MISMATCH' } });
            await expect(assertPosDeviceProof({ tenantId: 'tenant-a', terminalId: 'COUNTER-01' }))
                .rejects.toMatchObject({ details: { error_code: 'POS_DEVICE_PROOF_INVALID' } });
        });

        const offStore = buildDeviceStore({ strict: false });
        await withStore(offStore, async () => {
            await expect(assertPosDeviceProof({ tenantId: 'tenant-a', terminalId: 'COUNTER-01' }))
                .resolves.toMatchObject({ required: false, verified: false, terminal_id: 'COUNTER-01', location_id: 7 });
        });
    });

    it('rejects browser and bridge enrollment on a strict terminal', async () => {
        const store = buildDeviceStore();
        await withStore(store, async () => {
            const activation = await issueActivationCode({
                tenantId: 'tenant-a', terminalId: 'COUNTER-01', locationId: 7, issuedBy: 11, reason: 'Strict native enrollment'
            });
            const keys = keyPair();

            await expect(activateDevice({
                tenantId: 'tenant-a', activationCode: activation.activation_code, deviceId: 'browser-device',
                publicKey: keys.publicKey.export({ type: 'spki', format: 'pem' }).toString(), clientType: 'browser',
                terminalId: 'COUNTER-01', locationId: 7, actorUserId: 11, reason: 'Unsupported browser enrollment'
            })).rejects.toMatchObject({ details: { error_code: 'POS_DEVICE_UNSUPPORTED_CLIENT' } });

            expect(store.enrollments).toHaveLength(0);
            expect(store.activations[0].consumed_at).toBeFalsy();
        });
    });

    it('rejects an overlong canonical path instead of truncating its security binding', () => {
        const path = `/api/v1/pos/catalog?value=${'x'.repeat(300)}`;
        expect(stableStringify(Buffer.from('proof'))).toBe('"cHJvb2Y="');
        expect(buildCanonicalRequest({ path })).toContain('"path":""');
    });

    it('preserves the complete query string when canonicalizing a path', () => {
        expect(buildCanonicalRequest({ path: '/api/v1/pos/catalog?a=1?b=2' }))
            .toContain('"path":"/api/v1/pos/catalog?a=1%3Fb%3D2"');
    });

    it('rejects an expired challenge before attempting signature verification', async () => {
        const store = buildDeviceStore();
        await withStore(store, async () => {
            const keys = keyPair();
            const activation = await issueActivationCode({
                tenantId: 'tenant-a', terminalId: 'COUNTER-01', locationId: 7, issuedBy: 11, reason: 'Expired challenge test'
            });
            await activateDevice({
                tenantId: 'tenant-a', activationCode: activation.activation_code, deviceId: 'device-a',
                publicKey: keys.publicKey.export({ type: 'spki', format: 'pem' }).toString(), clientType: 'android',
                terminalId: 'COUNTER-01', locationId: 7, actorUserId: 11, reason: 'Expired challenge test'
            });
            const challenge = await issueChallengeForTenant({
                tenantId: 'tenant-a', deviceId: 'device-a', terminalId: 'COUNTER-01',
                purpose: 'request', requestPath: '/api/v1/pos/catalog', requestMethod: 'GET'
            });
            store.challenges[0].expires_at = new Date(Date.now() - 1000);

            await expect(verifyDeviceProof({
                tenantId: 'tenant-a', deviceId: 'device-a', terminalId: 'COUNTER-01', locationId: 7,
                purpose: 'request', sessionId: challenge.session_id, challenge: challenge.challenge,
                method: 'GET', path: '/api/v1/pos/catalog', signature: 'invalid', body: null
            })).rejects.toMatchObject({ details: { error_code: 'POS_DEVICE_CHALLENGE_EXPIRED' } });
        });
    });

    it('rejects oversized identity fields instead of silently accepting a truncated prefix', async () => {
        const store = buildDeviceStore();
        await withStore(store, async () => {
            const activation = await issueActivationCode({
                tenantId: 'tenant-a', terminalId: 'COUNTER-01', locationId: 7, issuedBy: 11, reason: 'Reject oversized identity'
            });
            const keys = keyPair();

            await expect(activateDevice({
                tenantId: 'tenant-a', activationCode: activation.activation_code,
                deviceId: `${'device-a'.padEnd(160, 'x')}x`,
                publicKey: keys.publicKey.export({ type: 'spki', format: 'pem' }).toString(),
                clientType: 'android', terminalId: 'COUNTER-01', locationId: 7,
                actorUserId: 11, reason: 'Reject oversized identity'
            })).rejects.toMatchObject({ details: { error_code: 'POS_DEVICE_DEVICE_ID_INVALID' } });

            expect(store.activations[0].consumed_at).toBeFalsy();
            expect(store.enrollments).toHaveLength(0);
        });
    });
});
