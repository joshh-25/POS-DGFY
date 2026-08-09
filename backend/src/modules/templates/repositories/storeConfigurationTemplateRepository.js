import {
    StoreConfigurationTemplate,
    StoreConfigurationTemplateModule,
    StoreConfigurationTemplateAuditLog,
    sequelize
} from '../../../models/index.js';

const toPlainTemplate = (row) => {
    if (!row) return null;
    const plain = row.get({ plain: true });
    return {
        ...plain,
        modules: (plain.modules || [])
            .filter((module) => module.enabled)
            .map((module) => module.module_key)
            .sort()
    };
};

const WITH_MODULES_INCLUDE = [{ model: StoreConfigurationTemplateModule, as: 'modules' }];

export const storeConfigurationTemplateRepository = {
    async findAll({ status = null, baseMode = null } = {}) {
        const where = {};
        if (status) where.status = status;
        if (baseMode) where.base_mode = baseMode;
        const rows = await StoreConfigurationTemplate.findAll({
            where,
            include: WITH_MODULES_INCLUDE,
            order: [['template_key', 'ASC']]
        });
        return rows.map(toPlainTemplate);
    },

    async findByKey(templateKey) {
        const row = await StoreConfigurationTemplate.findOne({
            where: { template_key: templateKey },
            include: WITH_MODULES_INCLUDE
        });
        return toPlainTemplate(row);
    },

    async findById(templateId) {
        const row = await StoreConfigurationTemplate.findByPk(templateId, { include: WITH_MODULES_INCLUDE });
        return toPlainTemplate(row);
    },

    // The provisioning-time lookup (issue #178 Phase 13): the canonical,
    // published preset for a base mode, if one exists. Deliberately narrow -
    // this is the only read path outside the future curation surface, and it
    // runs exactly once per tenant, at creation, never again (ADR 0056
    // clause 2 - never dereferenced to determine ongoing effective config).
    async findPublishedCanonicalForMode(baseMode) {
        const row = await StoreConfigurationTemplate.findOne({
            where: { base_mode: baseMode, status: 'published', is_preset: true },
            include: WITH_MODULES_INCLUDE,
            order: [['template_id', 'ASC']]
        });
        return toPlainTemplate(row);
    },

    async create({ templateKey, label, baseMode, isPreset = false, visibility = 'visible', owner = null, moduleKeys = [] }) {
        return sequelize.transaction(async (transaction) => {
            const template = await StoreConfigurationTemplate.create({
                template_key: templateKey,
                label,
                base_mode: baseMode,
                is_preset: isPreset,
                visibility,
                owner,
                status: 'draft',
                version: 1
            }, { transaction });

            if (moduleKeys.length > 0) {
                await StoreConfigurationTemplateModule.bulkCreate(
                    moduleKeys.map((moduleKey) => ({
                        template_id: template.template_id,
                        module_key: moduleKey,
                        enabled: true
                    })),
                    { transaction }
                );
            }

            return template.template_id;
        }).then((templateId) => this.findById(templateId));
    },

    async replaceModules(templateId, moduleKeys) {
        return sequelize.transaction(async (transaction) => {
            await StoreConfigurationTemplateModule.destroy({ where: { template_id: templateId }, transaction });
            if (moduleKeys.length > 0) {
                await StoreConfigurationTemplateModule.bulkCreate(
                    moduleKeys.map((moduleKey) => ({
                        template_id: templateId,
                        module_key: moduleKey,
                        enabled: true
                    })),
                    { transaction }
                );
            }
        }).then(() => this.findById(templateId));
    },

    async setStatus(templateId, status) {
        await StoreConfigurationTemplate.update({ status }, { where: { template_id: templateId } });
        return this.findById(templateId);
    },

    async createAuditLog({ templateId, action, actorUsername, reason = null, beforeSnapshot = null, afterSnapshot = null }) {
        return StoreConfigurationTemplateAuditLog.create({
            template_id: templateId,
            action,
            actor_username: actorUsername,
            reason,
            before_snapshot: beforeSnapshot,
            after_snapshot: afterSnapshot
        });
    },

    async listAuditLogs(templateId, { limit = 50 } = {}) {
        const rows = await StoreConfigurationTemplateAuditLog.findAll({
            where: { template_id: templateId },
            order: [['created_at', 'DESC']],
            limit: Math.min(Math.max(Number.parseInt(limit, 10) || 50, 1), 200)
        });
        return rows.map((row) => row.get({ plain: true }));
    }
};
