// Dependency-injection wiring point for the booking module (Clean
// Architecture "Dependency Inversion" — per project convention this file is
// the ONLY place that composes concrete implementations for this module),
// mirroring ../products/index.js's / ../inventory/index.js's pattern.
//
// Task 1 (08-07-PLAN.md) builds the repository/entity/usecase layers — this
// minimal index.js re-exports only those pieces (apps/dgfy-api's pre-commit
// architecture guardrail requires every modules/* directory to carry both
// index.js and README.md from its very first commit; 08-03/08-04/08-05 all
// hit this same guardrail and applied the identical fix). Task 2 extends
// this file in place with buildBookingModule() and the
// controllers/routes.js re-exports.

export {
    BookingRepository,
    buildBookingRepository,
    BookingCapacityFullError,
    BookingAlreadyCancelledError
} from './repositories/bookingRepository.js';
export { BookingEntity, createBookingEntity } from './entities/bookingEntity.js';
export {
    buildCreateBookingUseCase,
    buildCancelBookingUseCase,
    buildListBookingsUseCase
} from './usecases/bookingUseCases.js';
