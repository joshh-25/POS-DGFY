import { PushDiagnosticsAppSetting, sequelize } from '../../../models/index.js';
import { pushDiagnosticsAuditRepository } from './pushDiagnosticsAuditRepository.js';

export const buildPushDiagnosticsSettingsRepository = ({
    settingModel,
    sequelizeClient,
    auditRepository
}) => ({
    async listVisibilitySettings(apps) {
        return settingModel.findAll({
            where: { app: apps },
            attributes: ['app', 'enabled', 'updated_at'],
            order: [['app', 'ASC']]
        });
    },

    async getEnabledByApp(app) {
        const row = await settingModel.findByPk(app, { attributes: ['enabled'] });
        return row?.enabled === true;
    },

    async setVisibility({ app, enabled, admin, request }) {
        return sequelizeClient.transaction(async (transaction) => {
            let row = await settingModel.findOne({
                where: { app },
                transaction,
                lock: transaction.LOCK.UPDATE
            });

            // A missing row already means disabled. Keep a no-op write from materializing a
            // timestamped row that could look like an operator changed the setting.
            if (!row && enabled === false) return { app, enabled: false, changed: false };

            if (!row) {
                await settingModel.findOrCreate({
                    where: { app },
                    defaults: { app, enabled: false },
                    transaction
                });
                row = await settingModel.findOne({
                    where: { app },
                    transaction,
                    lock: transaction.LOCK.UPDATE
                });
            }
            if (!row) throw new Error('Push diagnostics app setting could not be locked.');

            const previousEnabled = row.enabled === true;
            if (previousEnabled === enabled) {
                return { app, enabled: previousEnabled, changed: false };
            }

            await row.update({
                enabled,
                updated_by_admin_id: admin?.id || null
            }, { transaction });

            await auditRepository.write({
                admin,
                action: 'push_diagnostics.visibility_changed',
                before: { app, enabled: previousEnabled },
                after: { app, enabled },
                request,
                transaction
            });

            return { app, enabled, changed: true };
        });
    }
});

export const pushDiagnosticsSettingsRepository = buildPushDiagnosticsSettingsRepository({
    settingModel: PushDiagnosticsAppSetting,
    sequelizeClient: sequelize,
    auditRepository: pushDiagnosticsAuditRepository
});

export default pushDiagnosticsSettingsRepository;
