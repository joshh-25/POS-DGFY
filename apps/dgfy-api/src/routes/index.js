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
import { buildProductsModule, createProductRoutes } from '../modules/products/index.js';
import { buildInventoryModule, createInventoryRoutes } from '../modules/inventory/index.js';
import { buildComplianceModule, createComplianceRoutes } from '../modules/compliance/index.js';
import { buildShiftsModule, createShiftRoutes } from '../modules/shifts/index.js';
import { buildBookingModule, createBookingRoutes } from '../modules/booking/index.js';
import { buildAvailmentsModule, createAvailmentRoutes } from '../modules/availments/index.js';
import { buildDeviceBridgeClient } from '../infra/deviceBridgeClient.js';

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
const {
    repository: businessRepository,
    useCases: businessUseCases,
    tenantConnector,
    businessDatabaseRegistryRepository
} = buildBusinessesModule({
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

// Phase 8 (08-08-PLAN.md, Wave 5): compose the 5 commerce modules built in
// isolation across waves 3-4, reusing the SAME tenantConnector/
// businessDatabaseRegistryRepository/businessRepository instances the
// businesses module above already constructed — never a second, divergent
// set (08-PATTERNS.md's Composition root pattern; T-08-08-02). Built in
// dependency order: products -> inventory -> compliance -> shifts (receives
// compliance's assertComplianceGate, injected but NOT invoked this phase —
// Phase 9 wires the real shift-open call site) -> booking (receives
// products' productRepository + inventory's reserved effectContracts).
const {
    repository: productRepository,
    useCases: productUseCases
} = buildProductsModule({
    tenantConnector,
    businessDatabaseRegistryRepository,
    businessRepository
});

const { useCases: inventoryUseCases, effectContracts: inventoryEffectContracts } = buildInventoryModule({
    tenantConnector,
    businessDatabaseRegistryRepository,
    businessRepository
});

const { useCases: complianceUseCases, assertComplianceGate } = buildComplianceModule({
    tenantConnector,
    businessDatabaseRegistryRepository,
    businessRepository
});

const { useCases: shiftUseCases, repository: shiftRepository } = buildShiftsModule({
    tenantConnector,
    businessDatabaseRegistryRepository,
    businessRepository,
    // FSC-02: made available for injection only — Phase 9 wires the real
    // shift-open call site. Do NOT invoke this gate from shift-open here.
    assertComplianceGate,
    staleThresholdMinutes: process.env.SHIFT_STALE_THRESHOLD_MINUTES
});

const { useCases: bookingUseCases } = buildBookingModule({
    tenantConnector,
    businessDatabaseRegistryRepository,
    businessRepository,
    productRepository,
    inventoryEffectContracts
});

// Phase 9 (09-07-PLAN.md, Wave 5): compose the availments module reusing the
// SAME tenantConnector/businessDatabaseRegistryRepository/businessRepository/
// productRepository/assertComplianceGate instances already constructed above
// — never a second, divergent set (09-PATTERNS.md's Composition Root Wiring
// pattern; T-09-07-01). Also reuses inventoryUseCases.recordSale (the D-17
// single-writer sale effect) and the shifts module's own repository
// (shiftRepository, for CHK-06's open-shift binding), plus one
// env-configured deviceBridgeClient for best-effort receipt printing (D-22).
const deviceBridgeClient = buildDeviceBridgeClient();

const { useCases: availmentUseCases } = buildAvailmentsModule({
    tenantConnector,
    businessDatabaseRegistryRepository,
    businessRepository,
    productRepository,
    assertComplianceGate,
    recordSaleEffect: inventoryUseCases.recordSale,
    shiftRepository,
    deviceBridgeClient
});

const router = Router();

router.use('/', healthRoutes);
router.use('/dgfy', dgfyAuthRoutes);
router.use('/accounts', createAccountRoutes(accountUseCases, { authenticateAccount }));
router.use('/businesses', createBusinessRoutes(businessUseCases, { authenticateAccount }));
router.use('/invitations', createInvitationRoutes(businessUseCases));
router.use('/products', createProductRoutes(productUseCases, { authenticateAccount }));
router.use('/inventory', createInventoryRoutes(inventoryUseCases, { authenticateAccount }));
router.use('/compliance', createComplianceRoutes(complianceUseCases, { authenticateAccount }));
router.use('/shifts', createShiftRoutes(shiftUseCases, { authenticateAccount }));
router.use('/bookings', createBookingRoutes(bookingUseCases, { authenticateAccount }));
router.use('/availments', createAvailmentRoutes(availmentUseCases, { authenticateAccount }));

export default router;
