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
    BusinessDatabaseRegistryRepository,
    buildBusinessDatabaseRegistryRepository
} from './repositories/businessDatabaseRegistryRepository.js';
export {
    AccountStaffAssignmentRepository,
    buildAccountStaffAssignmentRepository
} from './repositories/accountStaffAssignmentRepository.js';
export {
    StaffOnboardingRepository,
    buildStaffOnboardingRepository
} from './repositories/staffOnboardingRepository.js';
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
export {
    buildCreateTenantSessionUseCase,
    buildActivateBusinessSessionUseCase
} from './usecases/tenantSessionUseCases.js';
export { buildGetTenantRegistryUseCase } from './usecases/tenantRegistryUseCases.js';
export { buildBusinessController } from './controllers/businessController.js';
export { buildLocationController } from './controllers/locationController.js';
export { buildTenantSessionController } from './controllers/tenantSessionController.js';
export { buildTenantRegistryController } from './controllers/tenantRegistryController.js';
export { createBusinessRoutes, createInvitationRoutes } from './routes.js';
export { sendEmail } from './infra/sendInvitationEmail.js';
export { TenantConnector, buildTenantConnector } from '../../infra/tenantConnector.js';

import { BusinessRepository } from './repositories/businessRepository.js';
import { LocationRepository } from './repositories/locationRepository.js';
import { BusinessDatabaseRegistryRepository } from './repositories/businessDatabaseRegistryRepository.js';
import { AccountStaffAssignmentRepository } from './repositories/accountStaffAssignmentRepository.js';
import { StaffOnboardingRepository } from './repositories/staffOnboardingRepository.js';
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
import {
    buildCreateTenantSessionUseCase,
    buildActivateBusinessSessionUseCase
} from './usecases/tenantSessionUseCases.js';
import { buildGetTenantRegistryUseCase } from './usecases/tenantRegistryUseCases.js';
import { sendEmail } from './infra/sendInvitationEmail.js';
import { TenantConnector } from '../../infra/tenantConnector.js';

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
 * `locationRepository` (Wave 3.5, D-12; refactored onto the real
 * TenantConnector in Wave 7, 04-07-PLAN.md Task 1) is also exposed for the
 * same reason — it is a separate, tenant-scoped repository, but every
 * location use case still needs the SAME BusinessRepository instance for
 * membership/owner-role access control checks (membership lives in the
 * landlord dgfy_core database).
 *
 * Wave 4 (D-14, API-04) additions: `businessDatabaseRegistryModel` is
 * OPTIONAL (unlike businessModel/businessMembershipModel) so this stays
 * backward compatible with every pre-existing caller/test that constructs
 * this module without it (businessRepository.test.js, locationRoutes.test.js,
 * etc.) — when omitted, `activateBusinessSession` gracefully returns a 503
 * ("Tenant database registry is not configured") instead of throwing, and
 * (Wave 7) `locationRepository`/`staffOnboardingRepository` operations fail
 * closed the same way. `tenantConnector` defaults to a fresh TenantConnector
 * instance (reusing this service's own DB connection env vars) but can be
 * overridden (e.g. a test double, or a shared singleton from routes/index.js).
 *
 * @param {{businessModel, businessMembershipModel, sequelize?, sendEmail?: Function, businessDatabaseRegistryModel?: Object, tenantConnector?: Object}} deps
 */
export function buildBusinessesModule({
    businessModel,
    businessMembershipModel,
    sequelize,
    sendEmail: sendEmailOverride,
    businessDatabaseRegistryModel,
    tenantConnector: tenantConnectorOverride
} = {}) {
    const repository = new BusinessRepository({ businessModel, businessMembershipModel, sequelize });
    const businessDatabaseRegistryRepository = businessDatabaseRegistryModel
        ? new BusinessDatabaseRegistryRepository({ businessDatabaseRegistryModel })
        : null;
    const tenantConnector = tenantConnectorOverride || new TenantConnector();
    const locationRepository = new LocationRepository({ tenantConnector, businessDatabaseRegistryRepository });
    const accountStaffAssignmentRepository = new AccountStaffAssignmentRepository({ tenantConnector });
    const staffOnboardingRepository = new StaffOnboardingRepository({
        tenantConnector,
        businessDatabaseRegistryRepository,
        accountStaffAssignmentRepository
    });

    return {
        repository,
        locationRepository,
        businessDatabaseRegistryRepository,
        accountStaffAssignmentRepository,
        staffOnboardingRepository,
        tenantConnector,
        useCases: {
            createBusiness: buildCreateBusinessUseCase({ repository, businessDatabaseRegistryRepository }),
            listUserBusinesses: buildListUserBusinessesUseCase({ repository }),
            getBusiness: buildGetBusinessUseCase({ repository }),
            updateBusiness: buildUpdateBusinessUseCase({ repository }),
            // Wave 7 gap-closure (04-07-PLAN.md, API-02/API-04): staff
            // onboarding tenant persistence now flows through
            // staffOnboardingRepository; `repository` (BusinessRepository)
            // is still used for business existence + landlord membership/
            // owner-role access control only.
            onboardStaffViaInvitation: buildOnboardStaffViaInvitationUseCase({
                repository,
                staffOnboardingRepository,
                sendEmail: sendEmailOverride || sendEmail
            }),
            onboardStaffDirect: buildOnboardStaffDirectUseCase({ repository, staffOnboardingRepository }),
            acceptInvitation: buildAcceptInvitationUseCase({ staffOnboardingRepository }),
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
            deleteLocation: buildDeleteLocationUseCase({ repository: locationRepository, businessRepository: repository }),

            // Wave 4 (D-14, API-04): tenant session creation/activation.
            // businessDatabaseRegistry may be null (see doc comment above);
            // the use case itself handles that gracefully (503).
            createTenantSession: buildCreateTenantSessionUseCase({
                businessRepository: repository,
                businessDatabaseRegistry: businessDatabaseRegistryRepository,
                accountStaffAssignmentRepository
            }),
            activateBusinessSession: buildActivateBusinessSessionUseCase({
                businessRepository: repository,
                businessDatabaseRegistry: businessDatabaseRegistryRepository,
                accountStaffAssignmentRepository
            }),

            // Wave 6 gap-closure (API-03, D-14): safe tenant registry
            // metadata lookup under the existing Businesses APIs — read-only,
            // no tenant session activation side effect. businessDatabaseRegistryRepository
            // may be null (see doc comment above); the use case itself
            // handles that gracefully (503).
            getTenantRegistry: buildGetTenantRegistryUseCase({
                businessRepository: repository,
                businessDatabaseRegistryRepository
            })
        }
    };
}
