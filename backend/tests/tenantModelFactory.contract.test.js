import { Sequelize } from 'sequelize';
import defaultDb from '../src/models/index.js';
import { getTenantModels } from '../src/utils/tenantModelFactory.js';
import { WORKFLOW_MODE_VALUES, normalizeWorkflowMode } from '../src/modules/shared/constants/workflowModes.js';

const getReferenceTableName = (referenceModel) => {
    if (!referenceModel) return null;
    if (typeof referenceModel === 'string') return referenceModel;
    if (typeof referenceModel === 'object') {
        return referenceModel.tableName || referenceModel.table || null;
    }
    return null;
};

const buildTenantTableMap = (models) => (
    Object.values(models).reduce((tableMap, model) => {
        tableMap.set(model.getTableName(), model.name);
        return tableMap;
    }, new Map())
);

describe('tenantModelFactory contract', () => {
    it('registers tenant-scoped models required by POS and F&B associations', async () => {
        const tenantSequelize = new Sequelize('tenant_factory_contract', 'root', '', {
            dialect: 'mysql',
            logging: false
        });

        try {
            const models = getTenantModels(tenantSequelize);

            expect(models).toEqual(expect.objectContaining({
                PosTransaction: expect.any(Function),
                PosShiftLocationTransition: expect.any(Function),
                PosShiftLocationBackfillAudit: expect.any(Function),
                StorefrontFollow: expect.any(Function),
                FnbDiningArea: expect.any(Function),
                FnbDiningTable: expect.any(Function),
                FnbCheck: expect.any(Function),
                FnbRestaurantServiceChargeSnapshot: expect.any(Function)
            }));

            expect(models.PosTransaction.rawAttributes.fnb_check_id.references.model).toBe('fnb_checks');
            expect(models.PosTransaction.rawAttributes.fnb_table_id.references.model).toBe('fnb_dining_tables');
        } finally {
            await tenantSequelize.close();
        }
    });

    it('keeps every tenant-local foreign key reference backed by a cloned tenant model', async () => {
        const tenantSequelize = new Sequelize('tenant_factory_reference_contract', 'root', '', {
            dialect: 'mysql',
            logging: false
        });

        try {
            const models = getTenantModels(tenantSequelize);
            const tenantTableMap = buildTenantTableMap(models);
            const landlordTables = new Set([
                defaultDb.Tenant.getTableName(),
                defaultDb.UserTenantMapping.getTableName(),
                defaultDb.UserInvitation.getTableName(),
                defaultDb.Payment.getTableName(),
                defaultDb.WebhookLog.getTableName(),
                defaultDb.EngagementEvent.getTableName(),
                defaultDb.AiUsageLog.getTableName(),
                defaultDb.StorefrontDiscoveryIndex.getTableName(),
                defaultDb.TenantComplianceArtifact.getTableName(),
                defaultDb.TenantCompliancePeripheral.getTableName(),
                defaultDb.TenantComplianceAuditLog.getTableName(),
                defaultDb.TenantComplianceAuditFailure.getTableName(),
                defaultDb.TenantComplianceFinalReviewDocument.getTableName(),
                defaultDb.TenantComplianceFinalReviewSignoff.getTableName()
            ]);

            const missingReferences = [];
            for (const [modelName, model] of Object.entries(models)) {
                for (const [attributeName, attribute] of Object.entries(model.rawAttributes)) {
                    const referencedTable = getReferenceTableName(attribute.references?.model);
                    if (!referencedTable || landlordTables.has(referencedTable)) {
                        continue;
                    }
                    if (!tenantTableMap.has(referencedTable)) {
                        missingReferences.push(`${modelName}.${attributeName}->${referencedTable}`);
                    }
                }
            }

            expect(missingReferences).toEqual([]);
        } finally {
            await tenantSequelize.close();
        }
    });

    it.each(WORKFLOW_MODE_VALUES)('uses the complete tenant model graph for workflow mode %s', async (workflowMode) => {
        const tenantSequelize = new Sequelize(`tenant_factory_${workflowMode}`, 'root', '', {
            dialect: 'mysql',
            logging: false
        });

        try {
            const models = getTenantModels(tenantSequelize);
            const normalizedMode = normalizeWorkflowMode(workflowMode);

            expect(normalizedMode).toEqual(expect.any(String));
            expect(models.PosTransaction).toEqual(expect.any(Function));
            expect(models.ServiceBooking).toEqual(expect.any(Function));
            expect(models.FnbCheck).toEqual(expect.any(Function));
            expect(models.HospitalityRoomType).toEqual(expect.any(Function));
            expect(models.HospitalityRoom).toEqual(expect.any(Function));
            expect(models.HospitalityReservation).toEqual(expect.any(Function));
            expect(models.HospitalityFolio).toEqual(expect.any(Function));
            expect(models.HospitalityAmenity).toEqual(expect.any(Function));
            expect(models.UserLocationGrant).toEqual(expect.any(Function));
        } finally {
            await tenantSequelize.close();
        }
    });
});
