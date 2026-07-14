import { Sequelize } from 'sequelize';
import defineLocationModel from '../models/Tenant/Location.js';
import defineStaffAccountModel from '../models/Tenant/StaffAccount.js';
import defineStaffInvitationModel from '../models/Tenant/StaffInvitation.js';
import defineAccountStaffAssignmentModel from '../models/Tenant/AccountStaffAssignment.js';
import defineTerminalIdentityModel from '../models/Tenant/TerminalIdentity.js';
import defineProductModel from '../models/Tenant/Product.js';
import defineProductFolderModel from '../models/Tenant/ProductFolder.js';
import defineInventoryMovementModel from '../models/Tenant/InventoryMovement.js';
import defineProductEmbeddingModel from '../models/Tenant/ProductEmbedding.js';
import defineBookingModel from '../models/Tenant/Booking.js';
import defineBookingCapacityModel from '../models/Tenant/BookingCapacity.js';
import defineShiftModel from '../models/Tenant/Shift.js';
import defineCashDrawerEventModel from '../models/Tenant/CashDrawerEvent.js';
import defineComplianceModeStateModel from '../models/Tenant/ComplianceModeState.js';
import defineAvailmentModel from '../models/Tenant/Availment.js';
import defineAvailmentItemModel from '../models/Tenant/AvailmentItem.js';
import defineAvailmentDiscountModel from '../models/Tenant/AvailmentDiscount.js';
import definePaymentModel from '../models/Tenant/Payment.js';
import defineReceiptModel from '../models/Tenant/Receipt.js';
import defineComplianceEvidenceModel from '../models/Tenant/ComplianceEvidence.js';
import defineAvailmentStageEventModel from '../models/Tenant/AvailmentStageEvent.js';
import defineCourierAssignmentModel from '../models/Tenant/CourierAssignment.js';

// Minimal per-tenant-database connection cache for apps/dgfy-api (Wave 4,
// 04-04-PLAN.md's key_links: "TenantConnector -> resolves per-tenant
// database; Phase 4 uses for tenant model access"; 04-PLAN.md's "Pattern
// Reuse & Adaptation" section names this exact target file/adaptation:
// backend/src/utils/TenantConnector.js -> apps/dgfy-api/src/infra/
// tenantConnector.js). Adapted from the legacy TenantConnector's
// connection-caching approach but intentionally minimal:
//   - No periodic idle-eviction timers (legacy's `startPeriodicCleanup`) —
//     those would leak `setInterval` handles across Jest test runs and
//     apps/dgfy-api has no eviction-pressure use case yet (no business
//     tenant-database *provisioning* flow exists anywhere in this codebase
//     yet, so the realistic number of concurrently-open tenant connections
//     in this phase is small; see 04-03.5-SUMMARY.md's Known Stub).
//   - No pending-connection race/wait handling — apps/dgfy-api resolves a
//     tenant connection once per request via BusinessDatabaseRegistry
//     (Task 2), and Sequelize's own connection pool already serializes
//     concurrent callers against the same cached instance safely.
// Reuses this service's own DB_HOST/DB_USER/DB_PASSWORD/DB_PORT connection
// credentials (config/env.js's dotenv-loaded env vars) and only swaps the
// `database` argument to the resolved dgfy_business_<suffix> name — same
// MySQL server/user, different database — mirroring the legacy connector's
// approach exactly.
export class TenantConnector {
    /**
     * @param {{host?, port?, user?, password?, dialect?}} [config] - defaults
     *   to this service's own landlord DB connection env vars (same host,
     *   different `database` per getConnection() call).
     */
    constructor({ host, port, user, password, dialect = 'mysql' } = {}) {
        this.host = host || process.env.DB_HOST || 'localhost';
        this.port = Number(port || process.env.DB_PORT || 3306);
        this.user = user || process.env.DB_USER;
        this.password = password || process.env.DB_PASSWORD;
        this.dialect = dialect;
        this.connections = new Map(); // databaseName -> Sequelize instance
        this.modelsByDatabase = new Map(); // databaseName -> tenant model registry
    }

    /**
     * Returns a cached (or newly created + cached) Sequelize connection for
     * databaseName. Lazy-connect (mirrors Sequelize's own default) — does
     * not call .authenticate() eagerly; callers that need to fail fast on
     * an unreachable tenant database should do so themselves.
     * @param {string} databaseName
     * @returns {Sequelize}
     */
    getConnection(databaseName) {
        if (!databaseName) {
            throw new Error('TenantConnector.getConnection requires a databaseName.');
        }
        if (this.connections.has(databaseName)) {
            return this.connections.get(databaseName);
        }

        const sequelize = new Sequelize(databaseName, this.user, this.password, {
            host: this.host,
            port: this.port,
            dialect: this.dialect,
            logging: false,
            pool: {
                max: 5,
                min: 0,
                acquire: 10000,
                idle: 10000
            },
            define: {
                underscored: true,
                timestamps: true,
                createdAt: 'created_at',
                updatedAt: 'updated_at'
            }
        });

        this.connections.set(databaseName, sequelize);
        return sequelize;
    }

    /**
     * Wave 8 gap-closure (04-08-PLAN.md, Task 1): the single reachable
     * tenant model definition registry/helper this plan's acceptance
     * criteria requires — "a tenant model definition helper/registry
     * reachable from buildBusinessesModule() or TenantConnector that
     * defines TerminalIdentity idempotently on a tenant Sequelize
     * connection together with the other tenant models used by this
     * phase." Closes 04-VERIFICATION.md's TerminalIdentity orphan finding
     * WITHOUT adding a public terminal identity route/controller/use case
     * (out of Phase 04 scope — see 04-08-PLAN.md's Rationale/Source Audit).
     *
     * Idempotent in two ways:
     *   1. Per-databaseName result is cached (this.modelsByDatabase) — a
     *      second call for the same databaseName returns the exact same
     *      registry object, never re-defining anything.
     *   2. Even on first call, if a model with the same name was already
     *      defined on this connection by another caller (e.g.
     *      LocationRepository/StaffOnboardingRepository/
     *      AccountStaffAssignmentRepository independently defining their
     *      own model on the SAME cached Sequelize connection returned by
     *      getConnection()), this reuses that existing definition
     *      (`connection.models[name]`) instead of calling the factory
     *      function a second time on the same connection.
     *
     * Each model factory is unchanged (schema fields are NOT touched here
     * — the plan explicitly forbids that); this method only wires them
     * together into one reachable registry with associations applied.
     * @param {string} databaseName
     * @returns {{Location, StaffAccount, StaffInvitation, AccountStaffAssignment, TerminalIdentity, Product, ProductFolder, InventoryMovement, ProductEmbedding, Booking, BookingCapacity, Shift, CashDrawerEvent, ComplianceModeState, Availment, AvailmentItem, AvailmentDiscount, Payment, Receipt, ComplianceEvidence, AvailmentStageEvent, CourierAssignment}}
     */
    getModels(databaseName) {
        if (this.modelsByDatabase.has(databaseName)) {
            return this.modelsByDatabase.get(databaseName);
        }

        const connection = this.getConnection(databaseName);
        const modelDefiners = {
            Location: defineLocationModel,
            StaffAccount: defineStaffAccountModel,
            StaffInvitation: defineStaffInvitationModel,
            AccountStaffAssignment: defineAccountStaffAssignmentModel,
            TerminalIdentity: defineTerminalIdentityModel,
            // Phase 8 (08-02): commerce-foundation Tenant models — see
            // apps/dgfy-api/src/models/Tenant/{Product,ProductFolder,
            // InventoryMovement,Booking,BookingCapacity,Shift,
            // CashDrawerEvent,ComplianceModeState}.js.
            Product: defineProductModel,
            ProductFolder: defineProductFolderModel,
            InventoryMovement: defineInventoryMovementModel,
            // Phase 12 (12-02): product_embeddings 1:1-per-product tenant
            // model — see apps/dgfy-api/src/models/Tenant/ProductEmbedding.js.
            // Registered here so repositories resolve it at runtime (the
            // exact Phase 9 unregistered-model bug the comment below warns
            // about).
            ProductEmbedding: defineProductEmbeddingModel,
            Booking: defineBookingModel,
            BookingCapacity: defineBookingCapacityModel,
            Shift: defineShiftModel,
            CashDrawerEvent: defineCashDrawerEventModel,
            ComplianceModeState: defineComplianceModeStateModel,
            // Phase 9 (09-01): POS Checkout & Payment tenant models — see
            // apps/dgfy-api/src/models/Tenant/{Availment,AvailmentItem,
            // AvailmentDiscount,Payment,Receipt,ComplianceEvidence}.js.
            // (Deviation, Rule 2: these six models existed but were never
            // registered here — every availments-module repository call
            // would have resolved `undefined` at runtime; see 09-06-SUMMARY.md.)
            Availment: defineAvailmentModel,
            AvailmentItem: defineAvailmentItemModel,
            AvailmentDiscount: defineAvailmentDiscountModel,
            Payment: definePaymentModel,
            Receipt: defineReceiptModel,
            ComplianceEvidence: defineComplianceEvidenceModel,
            // Phase 11 (11-01): Order Fulfillment & Delivery Coordination
            // tenant models — see apps/dgfy-api/src/models/Tenant/
            // {AvailmentStageEvent,CourierAssignment}.js. This is the exact
            // registration step Phase 9 originally missed (Pitfall 1) —
            // without it, repositories resolve `undefined` at runtime.
            AvailmentStageEvent: defineAvailmentStageEventModel,
            CourierAssignment: defineCourierAssignmentModel
        };

        const models = {};
        Object.entries(modelDefiners).forEach(([name, define]) => {
            models[name] = connection.models[name] || define(connection);
        });

        // Wire every model's associate() (Location<->TerminalIdentity,
        // StaffAccount<->AccountStaffAssignment/StaffInvitation) now that
        // every model in this registry is defined.
        Object.values(models).forEach((model) => {
            if (typeof model.associate === 'function') {
                model.associate(models);
            }
        });

        this.modelsByDatabase.set(databaseName, models);
        return models;
    }

    /**
     * Closes and evicts a single cached connection (test cleanup / graceful
     * shutdown helper).
     */
    async closeConnection(databaseName) {
        const sequelize = this.connections.get(databaseName);
        this.modelsByDatabase.delete(databaseName);
        if (!sequelize) return;
        await sequelize.close();
        this.connections.delete(databaseName);
    }

    /**
     * Closes every cached connection (app shutdown / test teardown).
     */
    async closeAll() {
        await Promise.all(
            Array.from(this.connections.keys()).map((databaseName) => this.closeConnection(databaseName))
        );
    }

    getPoolStats() {
        return { total: this.connections.size, databases: Array.from(this.connections.keys()) };
    }
}

/**
 * @param {{host?, port?, user?, password?, dialect?}} [deps]
 * @returns {TenantConnector}
 */
export const buildTenantConnector = (deps) => new TenantConnector(deps);

export default TenantConnector;
