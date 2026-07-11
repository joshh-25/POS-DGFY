import { Router } from 'express';
import bcrypt from 'bcryptjs';
import healthRoutes from './health.js';
import dgfyAuthRoutes from '../modules/dgfyAuth/routes/dgfyAuthRoutes.js';
import sequelize from '../config/db.js';
import defineAccountModel from '../models/Landlord/Account.js';
import defineBusinessModel from '../models/Landlord/Business.js';
import defineBusinessMembershipModel from '../models/Landlord/BusinessMembership.js';
import defineBusinessDatabaseRegistryModel from '../models/Landlord/BusinessDatabaseRegistry.js';
import {
    buildAccountsModule,
    createAccountRoutes,
    buildAccountAuthMiddleware
} from '../modules/accounts/index.js';
import { buildBusinessesModule, createBusinessRoutes, createInvitationRoutes } from '../modules/businesses/index.js';

// Composition root for the accounts + businesses modules (Wave 2/3,
// 04-02-PLAN.md / 04-03-PLAN.md): builds the Account/Business/
// BusinessMembership Sequelize models against this service's own
// dgfy_core-pointed connection (config/db.js), then wires the repository/
// use-case/controller/auth-middleware layers — the exact composition point
// named in modules/accounts/index.js's own doc comment ("supplied by the
// caller — Wave 2's routes/index.js or app.js"). Mirrors dgfyAuth's own
// module-level singleton-composition pattern (modules/dgfyAuth/index.js).
//
// The businesses module is built FIRST so the same BusinessRepository
// instance can be injected into buildAccountsModule({ businessRepository })
// below (Task 8, D-05: login returns the account's business list) — a
// second, independently-constructed BusinessRepository would carry its own
// divergent in-memory staff/invitation stores and diverge from the one the
// /businesses routes actually use.
const BusinessModel = defineBusinessModel(sequelize);
const BusinessMembershipModel = defineBusinessMembershipModel(sequelize);
// Wave 4 (D-14, API-04): real dgfy_core-backed tenant database pointer.
// Live-wired here (unlike locationModel, which stays unwired pending a real
// tenant-database provisioning flow — see 04-03.5-SUMMARY.md's Known Stub)
// because business_database_registry itself lives in the landlord database,
// which is already connected.
const BusinessDatabaseRegistryModel = defineBusinessDatabaseRegistryModel(sequelize);
const { repository: businessRepository, useCases: businessUseCases } = buildBusinessesModule({
    businessModel: BusinessModel,
    businessMembershipModel: BusinessMembershipModel,
    businessDatabaseRegistryModel: BusinessDatabaseRegistryModel,
    sequelize
});

const AccountModel = defineAccountModel(sequelize);
const { useCases: accountUseCases } = buildAccountsModule({
    accountModel: AccountModel,
    hashPassword: (password) => bcrypt.hash(password, 10),
    bcrypt,
    businessRepository
});
const authenticateAccount = buildAccountAuthMiddleware({ getAccount: accountUseCases.getAccount });

const router = Router();

router.use('/', healthRoutes);
router.use('/dgfy', dgfyAuthRoutes);
router.use('/accounts', createAccountRoutes(accountUseCases, { authenticateAccount }));
router.use('/businesses', createBusinessRoutes(businessUseCases, { authenticateAccount }));
router.use('/invitations', createInvitationRoutes(businessUseCases));

export default router;
