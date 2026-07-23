import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { Sequelize } from 'sequelize';
import { TenantConnector } from '../../../src/infra/tenantConnector.js';
import { buildBusinessesModule } from '../../../src/modules/businesses/index.js';
import defineBusinessModel from '../../../src/models/Landlord/Business.js';
import defineBusinessMembershipModel from '../../../src/models/Landlord/BusinessMembership.js';
import defineLocationModel from '../../../src/models/Tenant/Location.js';

// No real MySQL connection is ever opened in this suite — Sequelize.Model.init()
// only registers model metadata, never connects — so a plain, never-connected
// Sequelize instance is sufficient to construct buildBusinessesModule()'s
// required businessModel/businessMembershipModel dependencies.
const makeLandlordSequelize = () => new Sequelize('unit_test_landlord', 'test_user', 'test_password', {
    host: 'localhost',
    dialect: 'mysql',
    logging: false
});

/**
 * Wave 8 gap-closure (04-08-PLAN.md, Task 1) — proves the TerminalIdentity
 * orphan finding (04-VERIFICATION.md) is closed: TerminalIdentity is
 * concretely wireable through TenantConnector.getModels()'s tenant model
 * definition registry, alongside every other tenant model this phase
 * already uses, and no public terminal identity route was added.
 *
 * Deliberately requires NO real MySQL connection: Sequelize.Model.init()
 * only registers model metadata against a Sequelize instance — it never
 * opens a network connection — so this suite runs unconditionally (not
 * gated behind a RUN_*_INTEGRATION flag) and proves the wiring itself,
 * independent of DB-backed evidence covered by Task 2's gated suites.
 */
describe('TenantConnector.getModels (tenant model definition registry)', () => {
    it('defines TerminalIdentity idempotently alongside Location, StaffAccount, StaffInvitation, and AccountStaffAssignment', () => {
        const connector = new TenantConnector({ user: 'test_user', password: 'test_password' });

        const models = connector.getModels('dgfy_business_unit_test_models');

        expect(typeof models.TerminalIdentity.findOne).toBe('function');
        expect(typeof models.Location.findOne).toBe('function');
        expect(typeof models.StaffAccount.findOne).toBe('function');
        expect(typeof models.StaffInvitation.findOne).toBe('function');
        expect(typeof models.AccountStaffAssignment.findOne).toBe('function');

        expect(models.TerminalIdentity.getTableName()).toBe('terminal_identities');

        // Idempotent: a second call for the same databaseName returns the
        // exact same cached registry (and model class references), never
        // re-defining anything on the connection.
        const modelsAgain = connector.getModels('dgfy_business_unit_test_models');
        expect(modelsAgain).toBe(models);
        expect(modelsAgain.TerminalIdentity).toBe(models.TerminalIdentity);
    });

    it('wires the TerminalIdentity <-> Location association bidirectionally', () => {
        const connector = new TenantConnector({ user: 'test_user', password: 'test_password' });

        const models = connector.getModels('dgfy_business_unit_test_associations');

        expect(models.TerminalIdentity.associations.location).toBeDefined();
        expect(models.Location.associations.terminalIdentities).toBeDefined();
    });

    it('reuses an already-defined model on the same connection instead of redefining it', () => {
        const connector = new TenantConnector({ user: 'test_user', password: 'test_password' });
        const databaseName = 'dgfy_business_unit_test_reuse';

        // Simulate another repository (e.g. LocationRepository) having
        // already defined Location on this exact cached connection — via
        // the SAME shared TenantConnector — before getModels() is ever
        // called for this databaseName.
        const connection = connector.getConnection(databaseName);
        const preExistingLocationModel = defineLocationModel(connection);
        expect(connection.models.Location).toBe(preExistingLocationModel);

        const models = connector.getModels(databaseName);

        expect(models.Location).toBe(preExistingLocationModel);
    });

    it('is reachable from buildBusinessesModule() via the returned tenantConnector', () => {
        const landlordSequelize = makeLandlordSequelize();
        const businessModel = defineBusinessModel(landlordSequelize);
        const businessMembershipModel = defineBusinessMembershipModel(landlordSequelize);

        const businessesModule = buildBusinessesModule({ businessModel, businessMembershipModel });

        expect(businessesModule.tenantConnector).toBeInstanceOf(TenantConnector);
        expect(typeof businessesModule.tenantConnector.getModels).toBe('function');

        const models = businessesModule.tenantConnector.getModels('dgfy_business_unit_test_reachability');
        expect(models.TerminalIdentity).toBeDefined();
        expect(models.TerminalIdentity.getTableName()).toBe('terminal_identities');
    });

    it('adds no public terminal identity route to the businesses module routes', () => {
        const __dirname = path.dirname(fileURLToPath(import.meta.url));
        const routesPath = path.resolve(__dirname, '../../../src/modules/businesses/routes.js');
        const routesSource = fs.readFileSync(routesPath, 'utf8');

        expect(routesSource).not.toMatch(/terminal-identity|terminalIdentity|TerminalIdentity/i);
    });
});
