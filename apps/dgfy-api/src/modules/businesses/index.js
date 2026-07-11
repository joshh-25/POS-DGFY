// Dependency-injection wiring point for the businesses module (Clean
// Architecture "Dependency Inversion" — per project convention this file is
// the ONLY place that composes concrete implementations for this module),
// mirroring ../accounts/index.js's buildAccountsModule() pattern.
//
// Wave 3 (.planning/phases/04-backend-accounts-businesses-and-tenancy-
// foundation/04-03-PLAN.md) replaces Wave 2's empty stub with the real
// repository + use case layers. The caller (routes/index.js or a test)
// builds the Business/BusinessMembership Sequelize models, then calls
// buildBusinessesModule() to get a fully wired repository + useCases,
// mirroring buildAccountsModule()'s composition contract.

export { BusinessRepository, buildBusinessRepository } from './repositories/businessRepository.js';
export { LocationRepository, buildLocationRepository } from './repositories/locationRepository.js';
export {
    buildCreateBusinessUseCase,
    buildListUserBusinessesUseCase,
    buildGetBusinessUseCase,
    buildUpdateBusinessUseCase,
    buildOnboardStaffViaInvitationUseCase,
    buildOnboardStaffDirectUseCase,
    buildAcceptInvitationUseCase,
    buildListBusinessMembersUseCase
} from './usecases/businessUseCases.js';
export {
    buildCreateLocationUseCase,
    buildListLocationsUseCase,
    buildGetLocationUseCase,
    buildUpdateLocationUseCase,
    buildSetPrimaryLocationUseCase,
    buildDeleteLocationUseCase
} from './usecases/locationUseCases.js';
export { buildBusinessController } from './controllers/businessController.js';
export { buildLocationController } from './controllers/locationController.js';
export { createBusinessRoutes, createInvitationRoutes } from './routes.js';
export { sendEmail } from './infra/sendInvitationEmail.js';

import { BusinessRepository } from './repositories/businessRepository.js';
import { LocationRepository } from './repositories/locationRepository.js';
import {
    buildCreateBusinessUseCase,
    buildListUserBusinessesUseCase,
    buildGetBusinessUseCase,
    buildUpdateBusinessUseCase,
    buildOnboardStaffViaInvitationUseCase,
    buildOnboardStaffDirectUseCase,
    buildAcceptInvitationUseCase,
    buildListBusinessMembersUseCase
} from './usecases/businessUseCases.js';
import {
    buildCreateLocationUseCase,
    buildListLocationsUseCase,
    buildGetLocationUseCase,
    buildUpdateLocationUseCase,
    buildSetPrimaryLocationUseCase,
    buildDeleteLocationUseCase
} from './usecases/locationUseCases.js';
import { sendEmail } from './infra/sendInvitationEmail.js';

/**
 * Builds the fully wired businesses module: one BusinessRepository instance
 * plus all use cases closed over it. Infrastructure dependencies (Sequelize
 * Business/BusinessMembership models) are supplied by the caller —
 * routes/index.js or a test — per Dependency Inversion. `sendEmail`
 * defaults to the module's own SMTP adapter but can be overridden (e.g. a
 * test double).
 *
 * The returned `repository` is deliberately exposed (not just `useCases`)
 * so routes/index.js can pass the SAME BusinessRepository instance into
 * accounts/index.js's buildAccountsModule({ businessRepository }) for the
 * login use case's D-05 business-list lookup (Task 8) — avoiding a second,
 * divergent repository instance (and its own separate in-memory staff/
 * invitation stores) that a plain module-level singleton export would risk.
 *
 * `locationRepository` (Wave 3.5, D-12) is also exposed for the same
 * reason — it is a separate, tenant-scoped repository (see
 * repositories/locationRepository.js's doc comment for its in-memory
 * bridging-strategy caveat), but every location use case still needs the
 * SAME BusinessRepository instance for membership/owner-role access
 * control checks (membership lives in the landlord dgfy_core database).
 *
 * @param {{businessModel, businessMembershipModel, sequelize?, sendEmail?: Function, locationModel?: Object}} deps
 */
export function buildBusinessesModule({
    businessModel,
    businessMembershipModel,
    sequelize,
    sendEmail: sendEmailOverride,
    locationModel
} = {}) {
    const repository = new BusinessRepository({ businessModel, businessMembershipModel, sequelize });
    const locationRepository = new LocationRepository({ locationModel });

    return {
        repository,
        locationRepository,
        useCases: {
            createBusiness: buildCreateBusinessUseCase({ repository }),
            listUserBusinesses: buildListUserBusinessesUseCase({ repository }),
            getBusiness: buildGetBusinessUseCase({ repository }),
            updateBusiness: buildUpdateBusinessUseCase({ repository }),
            onboardStaffViaInvitation: buildOnboardStaffViaInvitationUseCase({
                repository,
                sendEmail: sendEmailOverride || sendEmail
            }),
            onboardStaffDirect: buildOnboardStaffDirectUseCase({ repository }),
            acceptInvitation: buildAcceptInvitationUseCase({ repository }),
            listBusinessMembers: buildListBusinessMembersUseCase({ repository }),

            // Wave 3.5 (D-12): location/branch management use cases.
            // businessRepository is injected for membership/owner-role
            // access control only — location data itself lives in
            // locationRepository.
            createLocation: buildCreateLocationUseCase({ repository: locationRepository, businessRepository: repository }),
            listLocations: buildListLocationsUseCase({ repository: locationRepository, businessRepository: repository }),
            getLocation: buildGetLocationUseCase({ repository: locationRepository, businessRepository: repository }),
            updateLocation: buildUpdateLocationUseCase({ repository: locationRepository, businessRepository: repository }),
            setPrimaryLocation: buildSetPrimaryLocationUseCase({
                repository: locationRepository,
                businessRepository: repository
            }),
            deleteLocation: buildDeleteLocationUseCase({ repository: locationRepository, businessRepository: repository })
        }
    };
}
