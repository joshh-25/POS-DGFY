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
export { buildBusinessController } from './controllers/businessController.js';
export { createBusinessRoutes, createInvitationRoutes } from './routes.js';
export { sendEmail } from './infra/sendInvitationEmail.js';

import { BusinessRepository } from './repositories/businessRepository.js';
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
 * @param {{businessModel, businessMembershipModel, sequelize?, sendEmail?: Function}} deps
 */
export function buildBusinessesModule({ businessModel, businessMembershipModel, sequelize, sendEmail: sendEmailOverride } = {}) {
    const repository = new BusinessRepository({ businessModel, businessMembershipModel, sequelize });

    return {
        repository,
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
            listBusinessMembers: buildListBusinessMembersUseCase({ repository })
        }
    };
}
