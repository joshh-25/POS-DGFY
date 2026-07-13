import { Router } from 'express';
import bcrypt from 'bcryptjs';
import healthRoutes from './health.js';
import dgfyAuthRoutes from '../modules/dgfyAuth/routes/dgfyAuthRoutes.js';
import sequelize from '../config/db.js';
import defineAccountModel from '../models/Landlord/Account.js';
import defineBusinessModel from '../models/Landlord/Business.js';
import defineBusinessMembershipModel from '../models/Landlord/BusinessMembership.js';
import defineBusinessDatabaseRegistryModel from '../models/Landlord/BusinessDatabaseRegistry.js';
import defineStorefrontGuestIdentityModel from '../models/Landlord/StorefrontGuestIdentity.js';
import defineStorefrontOrderModel from '../models/Landlord/StorefrontOrder.js';
import defineCommercePaymentSessionModel from '../models/Landlord/CommercePaymentSession.js';
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
import { buildStorefrontModule, createStorefrontRoutes } from '../modules/storefront/index.js';
import { buildCommercePaymentsModule, createCommercePaymentRoutes } from '../modules/commercePayments/index.js';
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

const {
    useCases: inventoryUseCases,
    effectContracts: inventoryEffectContracts,
    reservationPorts: inventoryReservationPorts,
    reservationRepository: inventoryReservationRepository
} = buildInventoryModule({
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

// Phase 10 (10-08-PLAN.md, STF-05): commitReservation (10-02's
// reservationPorts.commitReservation single-writer port, built above)
// wires finalizeStorefrontOrder onto availmentUseCases — the reservation ->
// sale conversion 10-07's storefront finalize seam and this plan's
// finalizePaidOrder/cash-branch finalize both call.
const { useCases: availmentUseCases } = buildAvailmentsModule({
    tenantConnector,
    businessDatabaseRegistryRepository,
    businessRepository,
    productRepository,
    assertComplianceGate,
    recordSaleEffect: inventoryUseCases.recordSale,
    shiftRepository,
    deviceBridgeClient,
    commitReservation: inventoryReservationPorts.commitReservation
});

// Phase 10 (10-03-PLAN.md built the module skeleton in isolation; 10-04-
// PLAN.md, STF-03/D-06, mounts it here — mirrors the staged composition
// split documented in 10-03-SUMMARY.md's "Next Phase Readiness"): reuses
// the SAME productRepository instance built above (Phase 8), and dedicated
// StorefrontGuestIdentity/StorefrontOrder/CommercePaymentSession models
// against this service's own dgfy_core connection (matching every other
// Landlord model in this file).
const StorefrontGuestIdentityModel = defineStorefrontGuestIdentityModel(sequelize);
const StorefrontOrderModel = defineStorefrontOrderModel(sequelize);
const CommercePaymentSessionModel = defineCommercePaymentSessionModel(sequelize);

// Phase 10 (10-08-PLAN.md, STF-05): build commercePayments BEFORE
// storefront (per the plan's own stated build order) — its
// `useCases.createQrphSession` is one of storefront's `placeOrder` ports
// below, and its `expireDueSessions` sweep is storefront's `getOrderStatus`
// opportunistic on-read port (T-10-08-07 mechanism 2/2). Reuses the SAME
// businessRepository built above (owner/staff membership gate on the
// retry-finalization endpoint, T-10-08-05) and the SAME
// inventoryReservationPorts.releaseReservation/availmentUseCases.
// finalizeStorefrontOrder every other consumer of those ports already uses
// — never a second, divergent set.
const commercePaymentsModule = buildCommercePaymentsModule({
    commercePaymentSessionModel: CommercePaymentSessionModel,
    storefrontOrderModel: StorefrontOrderModel,
    finalizeStorefrontOrder: availmentUseCases.finalizeStorefrontOrder,
    releaseReservation: inventoryReservationPorts.releaseReservation,
    businessRepository
});

// CR-01 fix (10-REVIEW.md): placeOrderUseCases.js's own doc comment
// (usecases/placeOrderUseCases.js:118-137) states reserveStock/
// releaseReservation/setReservationExpiry are thin PORT functions matching
// InventoryReservationRepository's own method signatures directly, and
// deliberately bypass buildReserveStockUseCase's staff-membership gate
// (there is no staff accountId for a consumer storefront order). Wire the
// raw repository methods here, not inventoryReservationPorts.* (those are
// the staff-gated usecase wrappers, wrong layer for a consumer checkout).
// reserveStock needs a thin positional-args adapter because
// InventoryReservationRepository.reserveStock(businessId, lines,
// referenceId, expiresAt) takes positional args while placeOrderUseCases.js
// calls it with a single ({businessId, lines, referenceId, expiresAt})
// options object.
const { useCases: storefrontUseCases } = buildStorefrontModule({
    productRepository,
    storefrontGuestIdentityModel: StorefrontGuestIdentityModel,
    storefrontOrderModel: StorefrontOrderModel,
    reserveStock: ({ businessId, lines, referenceId, expiresAt }) =>
        inventoryReservationRepository.reserveStock(businessId, lines, referenceId, expiresAt),
    releaseReservation: inventoryReservationRepository.releaseReservation.bind(inventoryReservationRepository),
    setReservationExpiry: inventoryReservationRepository.setReservationExpiry.bind(inventoryReservationRepository),
    createQrphSession: commercePaymentsModule.useCases.createQrphSession,
    finalizeCashOrder: availmentUseCases.finalizeStorefrontOrder,
    onReadExpiryCheck: commercePaymentsModule.expireDueSessions
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
router.use('/storefront', createStorefrontRoutes(storefrontUseCases, { authenticateAccount }));
// Phase 10 (10-08-PLAN.md, STF-05): PayMongo webhook (raw-body HMAC
// verified inside the usecase, unauthenticated at the Express layer — see
// modules/commercePayments/routes.js) + the operator retry-finalization
// endpoint (authenticateAccount + staff-or-owner membership gate).
router.use('/commerce-payments', createCommercePaymentRoutes(commercePaymentsModule.useCases, { authenticateAccount }));

export default router;
