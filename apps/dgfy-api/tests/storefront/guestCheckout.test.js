import { jest } from '@jest/globals';
import { GuestIdentityRepository } from '../../src/modules/storefront/repositories/guestIdentityRepository.js';
import { buildGuestCheckoutUseCases } from '../../src/modules/storefront/usecases/guestCheckoutUseCases.js';

// 10-04-PLAN.md Task 1 + Task 2 (TDD): the identity half of checkout
// (STF-03) — guest email-OTP verification reusing infra/emailOtp.js, a
// persistent landlord-side guest identity keyed by verified email (D-06),
// and identity resolution that lets a logged-in DGFY Account check out
// without forcing a guest to create one.

// ---------------------------------------------------------------------------
// GuestIdentityRepository (Task 1) — mocked Sequelize model, mirrors
// storefrontDiscoveryRepository.test.js's / shiftRepository.test.js's
// mocked-model convention. No live dgfy_core connection.
// ---------------------------------------------------------------------------

class SequelizeUniqueConstraintError extends Error {
    constructor() {
        super('Validation error');
        this.name = 'SequelizeUniqueConstraintError';
    }
}

const makeRecord = (overrides = {}) => {
    const data = { id: 'guest-1', verified_email: 'guest@example.com', phone: null, display_name: null, last_order_at: null, ...overrides };
    return {
        ...data,
        get: jest.fn(({ plain } = {}) => (plain ? { ...data } : data)),
        update: jest.fn(async (patch) => {
            Object.assign(data, patch);
            return data;
        })
    };
};

const makeModel = (overrides = {}) => ({
    findOne: jest.fn(async () => null),
    create: jest.fn(async () => makeRecord()),
    ...overrides
});

describe('GuestIdentityRepository', () => {
    it('throws when constructed without a storefrontGuestIdentityModel', () => {
        expect(() => new GuestIdentityRepository({})).toThrow(/requires a storefrontGuestIdentityModel/);
    });

    describe('findByEmail', () => {
        it('returns null for a blank email without querying', async () => {
            const model = makeModel();
            const repository = new GuestIdentityRepository({ storefrontGuestIdentityModel: model });

            const result = await repository.findByEmail('   ');

            expect(result).toBeNull();
            expect(model.findOne).not.toHaveBeenCalled();
        });

        it('returns the normalized (lowercased/trimmed) match', async () => {
            const record = makeRecord({ verified_email: 'guest@example.com' });
            const model = makeModel({ findOne: jest.fn(async () => record) });
            const repository = new GuestIdentityRepository({ storefrontGuestIdentityModel: model });

            const result = await repository.findByEmail('  Guest@Example.com  ');

            expect(result.id).toBe('guest-1');
            expect(model.findOne).toHaveBeenCalledWith({ where: { verified_email: 'guest@example.com' } });
        });
    });

    describe('upsertByVerifiedEmail', () => {
        it('creates a new identity when none exists for this email, returns its id', async () => {
            const created = makeRecord({ id: 'guest-new' });
            const model = makeModel({
                findOne: jest.fn(async () => null),
                create: jest.fn(async () => created)
            });
            const repository = new GuestIdentityRepository({ storefrontGuestIdentityModel: model });

            const id = await repository.upsertByVerifiedEmail({ email: 'New@Example.com', phone: '09171234567', displayName: 'New Guest' });

            expect(id).toBe('guest-new');
            expect(model.create).toHaveBeenCalledWith({
                verified_email: 'new@example.com',
                phone: '09171234567',
                display_name: 'New Guest'
            });
            expect(created.update).toHaveBeenCalled();
        });

        it('reuses the SAME identity id for a repeat verified email (D-06)', async () => {
            const existing = makeRecord({ id: 'guest-repeat' });
            const model = makeModel({ findOne: jest.fn(async () => existing) });
            const repository = new GuestIdentityRepository({ storefrontGuestIdentityModel: model });

            const firstId = await repository.upsertByVerifiedEmail({ email: 'repeat@example.com' });
            const secondId = await repository.upsertByVerifiedEmail({ email: 'repeat@example.com' });

            expect(firstId).toBe('guest-repeat');
            expect(secondId).toBe('guest-repeat');
            expect(model.create).not.toHaveBeenCalled();
        });

        it('refreshes phone/display_name/last_order_at on every upsert', async () => {
            const existing = makeRecord({ id: 'guest-1', phone: null, display_name: null });
            const model = makeModel({ findOne: jest.fn(async () => existing) });
            const repository = new GuestIdentityRepository({ storefrontGuestIdentityModel: model });

            await repository.upsertByVerifiedEmail({ email: 'guest@example.com', phone: '09170000000', displayName: 'Updated Name' });

            expect(existing.update).toHaveBeenCalledWith(expect.objectContaining({
                phone: '09170000000',
                display_name: 'Updated Name',
                last_order_at: expect.any(Date)
            }));
        });

        it('is race-safe against a concurrent first-order: a unique-constraint violation on create() re-selects the winner\'s row instead of throwing (T-10-04-03)', async () => {
            const winnerRecord = makeRecord({ id: 'guest-winner' });
            let findOneCallCount = 0;
            const model = makeModel({
                findOne: jest.fn(async () => {
                    findOneCallCount += 1;
                    // First call (before create attempt): no row yet. Second
                    // call (after the unique-violation catch): the row the
                    // "other request" just inserted.
                    return findOneCallCount === 1 ? null : winnerRecord;
                }),
                create: jest.fn(async () => {
                    throw new SequelizeUniqueConstraintError();
                })
            });
            const repository = new GuestIdentityRepository({ storefrontGuestIdentityModel: model });

            const id = await repository.upsertByVerifiedEmail({ email: 'racey@example.com' });

            expect(id).toBe('guest-winner');
            expect(model.create).toHaveBeenCalledTimes(1);
            expect(model.findOne).toHaveBeenCalledTimes(2);
        });

        it('rethrows a create() error that is NOT a unique-constraint violation', async () => {
            const model = makeModel({
                findOne: jest.fn(async () => null),
                create: jest.fn(async () => { throw new Error('unexpected DB error'); })
            });
            const repository = new GuestIdentityRepository({ storefrontGuestIdentityModel: model });

            await expect(repository.upsertByVerifiedEmail({ email: 'boom@example.com' })).rejects.toThrow('unexpected DB error');
        });

        it('throws when email is blank', async () => {
            const model = makeModel();
            const repository = new GuestIdentityRepository({ storefrontGuestIdentityModel: model });

            await expect(repository.upsertByVerifiedEmail({ email: '' })).rejects.toThrow(/requires an email/);
        });
    });
});

// ---------------------------------------------------------------------------
// buildGuestCheckoutUseCases (Task 2, TDD) — requestGuestOtp/verifyGuestOtp/
// resolveCheckoutIdentity, mocked guestIdentityRepository + emailOtp module
// shape (no live dgfy_core/SMTP).
// ---------------------------------------------------------------------------

const STOREFRONT_GUEST_CHECKOUT_PURPOSE = 'storefront_guest_checkout';

const makeEmailOtpError = (message, statusCode, code) => {
    const error = new Error(message);
    error.statusCode = statusCode;
    error.code = code;
    return error;
};

const makeEmailOtp = (overrides = {}) => ({
    EMAIL_OTP_PURPOSES: { STOREFRONT_GUEST_CHECKOUT: STOREFRONT_GUEST_CHECKOUT_PURPOSE },
    requestEmailOtp: jest.fn(async ({ email }) => ({
        otp_id: 'otp-1',
        purpose: STOREFRONT_GUEST_CHECKOUT_PURPOSE,
        email,
        expires_at: new Date().toISOString(),
        delivery_status: 'sent'
    })),
    verifyEmailOtp: jest.fn(async () => ({ verified: true })),
    ...overrides
});

const makeGuestIdentityRepository = (overrides = {}) => ({
    upsertByVerifiedEmail: jest.fn(async () => 'guest-identity-1'),
    findByEmail: jest.fn(async () => null),
    ...overrides
});

describe('buildGuestCheckoutUseCases', () => {
    it('throws when constructed without a guestIdentityRepository', () => {
        expect(() => buildGuestCheckoutUseCases({ emailOtp: makeEmailOtp() })).toThrow(/requires a guestIdentityRepository/);
    });

    it('throws when constructed without a valid emailOtp module', () => {
        expect(() => buildGuestCheckoutUseCases({ guestIdentityRepository: makeGuestIdentityRepository() })).toThrow(/requires an emailOtp module/);
    });

    describe('requestGuestOtp', () => {
        it('requests an OTP with the STOREFRONT_GUEST_CHECKOUT purpose', async () => {
            const emailOtp = makeEmailOtp();
            const guestIdentityRepository = makeGuestIdentityRepository();
            const { requestGuestOtp } = buildGuestCheckoutUseCases({ guestIdentityRepository, emailOtp });

            const result = await requestGuestOtp({ email: 'guest@example.com' });

            expect(result.isSuccess).toBe(true);
            expect(emailOtp.requestEmailOtp).toHaveBeenCalledWith({ purpose: STOREFRONT_GUEST_CHECKOUT_PURPOSE, email: 'guest@example.com' });
            expect(result.data.email).toBe('guest@example.com');
        });

        it('returns the underlying emailOtp error (e.g. 503 SMTP unconfigured) as-is', async () => {
            const emailOtp = makeEmailOtp({
                requestEmailOtp: jest.fn(async () => {
                    throw makeEmailOtpError('Email verification cannot be sent because SMTP is not configured', 503, 'EMAIL_OTP_DELIVERY_UNAVAILABLE');
                })
            });
            const guestIdentityRepository = makeGuestIdentityRepository();
            const { requestGuestOtp } = buildGuestCheckoutUseCases({ guestIdentityRepository, emailOtp });

            const result = await requestGuestOtp({ email: 'guest@example.com' });

            expect(result.isSuccess).toBe(false);
            expect(result.statusCode).toBe(503);
            expect(result.error.code).toBe('EMAIL_OTP_DELIVERY_UNAVAILABLE');
        });
    });

    describe('verifyGuestOtp', () => {
        it('consumes the OTP then upserts the persistent guest identity, returning guest_identity_id', async () => {
            const emailOtp = makeEmailOtp();
            const guestIdentityRepository = makeGuestIdentityRepository({
                upsertByVerifiedEmail: jest.fn(async () => 'guest-identity-42')
            });
            const { verifyGuestOtp } = buildGuestCheckoutUseCases({ guestIdentityRepository, emailOtp });

            const result = await verifyGuestOtp({ email: 'guest@example.com', code: '123456', phone: '09171234567', displayName: 'Guest' });

            expect(emailOtp.verifyEmailOtp).toHaveBeenCalledWith({ purpose: STOREFRONT_GUEST_CHECKOUT_PURPOSE, email: 'guest@example.com', code: '123456' });
            expect(guestIdentityRepository.upsertByVerifiedEmail).toHaveBeenCalledWith({ email: 'guest@example.com', phone: '09171234567', displayName: 'Guest' });
            expect(result.isSuccess).toBe(true);
            expect(result.data).toEqual({ guest_identity_id: 'guest-identity-42', verified: true });
        });

        it('does NOT upsert a guest identity when the OTP code is wrong/expired', async () => {
            const emailOtp = makeEmailOtp({
                verifyEmailOtp: jest.fn(async () => {
                    throw makeEmailOtpError('Email verification code is invalid', 422, 'EMAIL_OTP_INVALID');
                })
            });
            const guestIdentityRepository = makeGuestIdentityRepository();
            const { verifyGuestOtp } = buildGuestCheckoutUseCases({ guestIdentityRepository, emailOtp });

            const result = await verifyGuestOtp({ email: 'guest@example.com', code: '000000' });

            expect(result.isSuccess).toBe(false);
            expect(result.error.code).toBe('EMAIL_OTP_INVALID');
            expect(guestIdentityRepository.upsertByVerifiedEmail).not.toHaveBeenCalled();
        });

        it('a repeat guest verifying again reuses the same identity id (D-06)', async () => {
            const emailOtp = makeEmailOtp();
            const guestIdentityRepository = makeGuestIdentityRepository({
                upsertByVerifiedEmail: jest.fn(async () => 'guest-repeat-1')
            });
            const { verifyGuestOtp } = buildGuestCheckoutUseCases({ guestIdentityRepository, emailOtp });

            const first = await verifyGuestOtp({ email: 'repeat@example.com', code: '123456' });
            const second = await verifyGuestOtp({ email: 'repeat@example.com', code: '654321' });

            expect(first.data.guest_identity_id).toBe('guest-repeat-1');
            expect(second.data.guest_identity_id).toBe('guest-repeat-1');
        });
    });

    describe('resolveCheckoutIdentity', () => {
        it('resolves to customer_account_id when an authenticated account is present — even if a guestIdentityId is ALSO supplied (account never forced to also be a guest)', async () => {
            const { resolveCheckoutIdentity } = buildGuestCheckoutUseCases({ guestIdentityRepository: makeGuestIdentityRepository(), emailOtp: makeEmailOtp() });

            const result = await resolveCheckoutIdentity({ authenticatedAccountId: 'acct-1', guestIdentityId: 'guest-1' });

            expect(result.isSuccess).toBe(true);
            expect(result.data).toEqual({ customer_account_id: 'acct-1' });
        });

        it('resolves to guest_identity_id when no account is authenticated — never forces account creation', async () => {
            const { resolveCheckoutIdentity } = buildGuestCheckoutUseCases({ guestIdentityRepository: makeGuestIdentityRepository(), emailOtp: makeEmailOtp() });

            const result = await resolveCheckoutIdentity({ authenticatedAccountId: null, guestIdentityId: 'guest-1' });

            expect(result.isSuccess).toBe(true);
            expect(result.data).toEqual({ guest_identity_id: 'guest-1' });
        });

        it('rejects with 401 CHECKOUT_IDENTITY_REQUIRED when neither an account nor a guest identity is present', async () => {
            const { resolveCheckoutIdentity } = buildGuestCheckoutUseCases({ guestIdentityRepository: makeGuestIdentityRepository(), emailOtp: makeEmailOtp() });

            const result = await resolveCheckoutIdentity({});

            expect(result.isSuccess).toBe(false);
            expect(result.statusCode).toBe(401);
            expect(result.error.details.error_code).toBe('CHECKOUT_IDENTITY_REQUIRED');
        });
    });
});
