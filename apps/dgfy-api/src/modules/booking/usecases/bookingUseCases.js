import { ApplicationResult } from '../../../shared/contracts/applicationResult.js';
import { DomainError, DomainErrorCode } from '../../../shared/contracts/domainErrors.js';

// bookingUseCases.js — Clean Architecture Application layer for the
// tenant-scoped booking domain (BOK-01/BOK-02/BOK-03), mirroring
// ../../businesses/usecases/locationUseCases.js. Each builder receives its
// dependencies via closure (repository = BookingRepository, businessRepository
// = the businesses module's BusinessRepository, used ONLY for
// membership/role access control since membership lives in the landlord
// dgfy_core database; productRepository = the products module's
// ProductRepository, used ONLY to resolve a Product's bookable config) and
// every use case always returns an ApplicationResult. No HTTP concerns, no
// direct model imports.
//
// D-08: a Booking can be created and cancelled — releasing the branch-level
// capacity slot back atomically on cancel — but there is no separate
// change-the-slot action; cancelling and creating a fresh Booking covers
// that need instead. D-09: cancelling a Booking is dual-authorized —
// staff/owner (via requireMembership) OR the Booking's own consumer account
// (customer_account_id === requestingAccountId).

const validationError = (message, details = null) => new DomainError(
    DomainErrorCode.VALIDATION_FAILED,
    message,
    { statusCode: 400, details }
);

const conflictError = (message, details = null) => new DomainError(
    DomainErrorCode.CONFLICT,
    message,
    { statusCode: 409, details }
);

const notFoundError = (message = 'Booking not found.') => new DomainError(
    DomainErrorCode.RESOURCE_NOT_FOUND,
    message,
    { statusCode: 404 }
);

const productNotFoundError = () => new DomainError(
    DomainErrorCode.RESOURCE_NOT_FOUND,
    'Product not found.',
    { statusCode: 404 }
);

const forbiddenError = (message) => new DomainError(
    DomainErrorCode.AUTHORIZATION_FAILED,
    message,
    { statusCode: 403 }
);

const noTenantDatabaseError = () => new DomainError(
    DomainErrorCode.RESOURCE_NOT_FOUND,
    'No tenant database is registered for this business.',
    { statusCode: 404, details: { error_code: 'NO_TENANT_DATABASE' } }
);

/**
 * Duck-types on `error.name === 'TenantDatabaseUnavailableError'` rather than
 * importing bookingRepository.js's class directly — mirrors
 * locationUseCases.js's/productUseCases.js's existing self-contained
 * convention.
 * @param {Error} error
 */
const isTenantDatabaseUnavailableError = (error) => Boolean(error) && error.name === 'TenantDatabaseUnavailableError';

/**
 * Maps a thrown TenantDatabaseUnavailableError (missing/provisioning/
 * inactive/unverified/unreachable/not_configured registry state) to a stable
 * ApplicationResult-ready DomainError. `missing`/`not_configured` surface as
 * 404; every other reason surfaces as 503 SERVICE_UNAVAILABLE.
 * @param {Error} error
 */
const mapTenantDatabaseError = (error) => {
    if (error.reason === 'missing' || error.reason === 'not_configured') {
        return noTenantDatabaseError();
    }
    return new DomainError(
        DomainErrorCode.SERVICE_UNAVAILABLE,
        error.message,
        { statusCode: 503, details: { error_code: 'TENANT_DATABASE_UNAVAILABLE', reason: error.reason } }
    );
};

/**
 * Shared access-control helper (mirrors locationUseCases.js's private
 * requireMembership() — duplicated here rather than imported so this module
 * stays self-contained). Resolves the requester's membership and optionally
 * enforces a specific role.
 * @returns {Promise<{membership?: Object, error?: DomainError}>}
 */
async function requireMembership(businessRepository, businessId, accountId, { role } = {}) {
    const membership = await businessRepository.getMembership(accountId, businessId);
    if (!membership || membership.status !== 'active') {
        return { error: forbiddenError('You are not a member of this business.') };
    }
    if (role && membership.role !== role) {
        return { error: forbiddenError(`Only a business ${role} can perform this action.`) };
    }
    return { membership };
}

/**
 * Resolves whether requestingAccountId is an active staff/owner member of
 * businessId, WITHOUT failing when they are not (a non-member may still be a
 * legitimate consumer caller — see buildCreateBookingUseCase/
 * buildCancelBookingUseCase's dual-authorization logic, D-09).
 * @returns {Promise<boolean>}
 */
async function isActiveStaffOrOwner(businessRepository, businessId, accountId) {
    if (!accountId) return false;
    const membership = await businessRepository.getMembership(accountId, businessId);
    return Boolean(membership && membership.status === 'active');
}

const isFiniteId = (value) => value !== undefined && value !== null && value !== '';

/**
 * Create booking use case (BOK-02). Validates the target Product is
 * bookable via the injected productRepository, then delegates the
 * branch-capacity atomic guard + booking insert to
 * repository.createBooking() (single transaction, BookingCapacityFullError
 * on a full slot — mapped here to a 409 conflict, no booking row written).
 *
 * Authorization: staff/owner (any active membership) may create a booking
 * on behalf of any consumer (or a walk-in, customer_account_id omitted). A
 * non-member caller is treated as a consumer booking for themselves — their
 * own authenticated requestingAccountId becomes the booking's
 * customer_account_id; a client-supplied customer_account_id is never
 * trusted to override that identity for a non-staff caller.
 *
 * @param {{repository, businessRepository, productRepository}} deps
 */
export function buildCreateBookingUseCase({ repository, businessRepository, productRepository }) {
    return async (input = {}) => {
        const { businessId, requestingAccountId, productId, branchId, slotStart } = input;

        if (!businessId) {
            return ApplicationResult.failure(validationError('businessId is required.'));
        }
        if (!isFiniteId(productId)) {
            return ApplicationResult.failure(validationError('productId is required.'));
        }
        if (!isFiniteId(branchId)) {
            return ApplicationResult.failure(validationError('branchId is required.'));
        }
        if (!slotStart) {
            return ApplicationResult.failure(validationError('slotStart is required.'));
        }
        const slotStartDate = new Date(slotStart);
        if (Number.isNaN(slotStartDate.getTime())) {
            return ApplicationResult.failure(validationError('slotStart must be a valid date/time.'));
        }
        if (!requestingAccountId) {
            return ApplicationResult.failure(forbiddenError('Authentication is required to create a booking.'));
        }

        const staffOrOwner = await isActiveStaffOrOwner(businessRepository, businessId, requestingAccountId);
        // A non-staff caller is a consumer booking for themselves — never
        // trust a client-supplied customer_account_id that differs from the
        // authenticated requester's own id (CLAUDE.md: never trust
        // client-supplied flags).
        const customerAccountId = staffOrOwner
            ? (input.customer_account_id ?? null)
            : requestingAccountId;

        try {
            const product = await productRepository.findById(businessId, productId);
            if (!product) {
                return ApplicationResult.failure(productNotFoundError());
            }
            if (!product.is_bookable) {
                return ApplicationResult.failure(validationError('This product is not bookable.'));
            }

            let slotEnd = null;
            if (Number.isFinite(Number(product.slot_duration_minutes)) && Number(product.slot_duration_minutes) > 0) {
                slotEnd = new Date(slotStartDate.getTime() + Number(product.slot_duration_minutes) * 60000);
            }

            const booking = await repository.createBooking(businessId, {
                productId,
                branchId,
                slotStart: slotStartDate,
                slotEnd,
                customerAccountId,
                concurrentCapacity: Number(product.concurrent_capacity) > 0 ? Number(product.concurrent_capacity) : 1
            });

            return ApplicationResult.success({ booking });
        } catch (repoError) {
            if (isTenantDatabaseUnavailableError(repoError)) {
                return ApplicationResult.failure(mapTenantDatabaseError(repoError));
            }
            if (repoError.name === 'BookingCapacityFullError') {
                return ApplicationResult.failure(conflictError('No booking capacity remaining for this slot.'));
            }
            throw repoError;
        }
    };
}

/**
 * Cancel booking use case (D-08/D-09). Dual-authorized: staff/owner (any
 * active membership) OR the booking's own consumer account
 * (customer_account_id === requestingAccountId) may cancel; any other
 * requester is forbidden. Releases the branch-capacity slot atomically
 * (mirror +1) in the same transaction as the status write
 * (repository.cancelBooking()).
 * @param {{repository, businessRepository}} deps
 */
export function buildCancelBookingUseCase({ repository, businessRepository }) {
    return async (input = {}) => {
        const { businessId, bookingId, requestingAccountId } = input;

        if (!businessId) {
            return ApplicationResult.failure(validationError('businessId is required.'));
        }
        if (!isFiniteId(bookingId)) {
            return ApplicationResult.failure(validationError('bookingId is required.'));
        }
        if (!requestingAccountId) {
            return ApplicationResult.failure(forbiddenError('Authentication is required to cancel a booking.'));
        }

        try {
            const existing = await repository.findById(businessId, bookingId);
            if (!existing) {
                return ApplicationResult.failure(notFoundError());
            }

            const staffOrOwner = await isActiveStaffOrOwner(businessRepository, businessId, requestingAccountId);
            const isOwningConsumer = Boolean(existing.customer_account_id)
                && existing.customer_account_id === requestingAccountId;

            if (!staffOrOwner && !isOwningConsumer) {
                return ApplicationResult.failure(forbiddenError('You are not authorized to cancel this booking.'));
            }
            if (existing.status === 'cancelled') {
                return ApplicationResult.failure(validationError('This booking is already cancelled.'));
            }

            const cancelled = await repository.cancelBooking(businessId, bookingId);
            return ApplicationResult.success({ booking: cancelled });
        } catch (repoError) {
            if (isTenantDatabaseUnavailableError(repoError)) {
                return ApplicationResult.failure(mapTenantDatabaseError(repoError));
            }
            if (repoError.name === 'BookingAlreadyCancelledError') {
                return ApplicationResult.failure(validationError('This booking is already cancelled.'));
            }
            throw repoError;
        }
    };
}

/**
 * List bookings use case. Requires an active membership (any role) — mirrors
 * ./locationUseCases.js's buildListLocationsUseCase; the Storefront's
 * consumer-facing "my bookings" view is a Phase 10 concern, not this phase's.
 * @param {{repository, businessRepository}} deps
 */
export function buildListBookingsUseCase({ repository, businessRepository }) {
    return async (input = {}) => {
        const { businessId, requestingAccountId, branchId, productId } = input;
        if (!businessId) {
            return ApplicationResult.failure(validationError('businessId is required.'));
        }

        const { error } = await requireMembership(businessRepository, businessId, requestingAccountId);
        if (error) return ApplicationResult.failure(error);

        try {
            const bookings = await repository.findAll(businessId, { branchId, productId });
            return ApplicationResult.success({ bookings });
        } catch (repoError) {
            if (isTenantDatabaseUnavailableError(repoError)) {
                return ApplicationResult.failure(mapTenantDatabaseError(repoError));
            }
            throw repoError;
        }
    };
}
