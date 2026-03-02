import defaultDb from '../models/index.js';
import logger from '../config/logger.js';

/**
 * Dynamically re-binds models to a specific tenant's Sequelize instance.
 * This is crucial for multi-tenancy to ensure queries run against the correct database.
 *
 * Design notes:
 *  - Part A (Safe Hook Cloning): hooks are stripped from the spread of originalModel.options
 *    and re-applied explicitly via addHook(). This prevents scope contamination where a hook
 *    that imports the default/landlord db module would silently query the wrong database.
 *  - Part B (Dynamic Association Mapper): associations are discovered from the source models'
 *    own Sequelize metadata instead of being hardcoded, keeping this file in sync with
 *    models/index.js automatically.
 *  - Part C (Missing Model Warning): a warning is logged when a name in modelNames has no
 *    matching entry in defaultModels (e.g. after a model is renamed or removed).
 *
 * @param {Sequelize} sequelize - The tenant-specific sequelize connection
 * @returns {Object} map of ModelName -> ModelClass (bound to tenant DB)
 */
export const getTenantModels = (sequelize) => {
    const models = {};
    const defaultModels = defaultDb;

    // List of models to re-bind
    const modelNames = [
        'User', 'Item', 'Supplier', 'PurchaseOrder', 'JobOrder', 'StockMovement',
        'FIFOBatch', 'ItemNutrition', 'ItemAllergen', 'ProductComposition',
        'SupplierItem', 'BulkDiscount', 'ItemPhysicalProperties',
        'ItemShelfLife', 'ItemPackaging', 'ItemQualityControl',
        'ItemRegulatoryCompliance', 'ItemCostBreakdown', 'POLineItem',
        'JOIngredient', 'BatchTransaction', 'AuditLog', 'SystemSetting',
        'BatchLineage', 'ReceiveToken', 'ReportSnapshot', 'PendingAIAction',
        'AIConversation', 'ItemEmbedding', 'ItemFolder',
        'DispatchOrder', 'DispatchOrderLine'
    ];

    // Re-define each model on the new connection
    modelNames.forEach(name => {
        // Check if model already exists on this instance to prevent memory leaks from re-definition
        if (sequelize.models[name]) {
            models[name] = sequelize.models[name];
            return;
        }

        const originalModel = defaultModels[name];

        // Part C: warn when a model name is declared but has no defaultModels entry
        if (!originalModel) {
            logger.warn(`[TenantModelFactory] Model "${name}" is listed in modelNames but not found in defaultModels — skipping.`);
            return;
        }

        // Part A: Safe hook cloning — strip hooks from the options spread so that any hook
        // referencing the global `db` import does not accidentally query the Landlord database.
        // Hooks are re-applied explicitly below after model definition.
        const { hooks: originalHooks = {}, ...safeOptions } = originalModel.options;

        models[name] = sequelize.define(
            originalModel.name,
            originalModel.rawAttributes,
            {
                ...safeOptions,
                sequelize // Bind to new tenant instance
            }
        );

        // Re-apply hooks explicitly so their presence in the tenant model is intentional and
        // auditable. All current hooks are pure data transformers (no external DB references)
        // so this is safe.
        //
        // Important: Sequelize expands proxy hooks at define-time, so options.hooks already
        // contains both the canonical key (e.g. 'beforeSave') and its proxy targets
        // ('beforeCreate', 'beforeUpdate'). We must skip the proxy targets to avoid double
        // registration — addHook('beforeSave', fn) already fans out to the proxy targets itself.
        const proxyTargets = new Set([
            'beforeCreate', 'beforeUpdate',   // proxied by beforeSave
            'afterCreate',  'afterUpdate',    // proxied by afterSave
        ]);
        const hookEntries = Object.entries(originalHooks);
        if (hookEntries.length > 0) {
            // Collect the canonical (non-proxy-target) hook names present in this model
            const canonicalHooks = hookEntries.filter(([hookName]) => !proxyTargets.has(hookName));
            canonicalHooks.forEach(([hookName, hookArray]) => {
                const fns = Array.isArray(hookArray) ? hookArray : [hookArray];
                fns.forEach(fn => {
                    if (typeof fn === 'function') {
                        models[name].addHook(hookName, fn);
                    }
                });
            });
        }
    });

    // Part B: Dynamic Association Mapper
    // Guard: associations are class-level and must only be defined once per Sequelize instance.
    // Re-defining them (e.g. on every request for a cached connection) causes
    // SequelizeAssociationError: "alias used in two separate associations".
    if (sequelize._tenantModelsInitialized) {
        return models;
    }

    // Iterate every source model that has associations defined and recreate those associations
    // on the tenant clones. This replaces ~160 lines of hardcoded associations with a dynamic
    // loop, keeping tenant models automatically in sync with models/index.js.
    Object.keys(defaultModels).forEach(sourceName => {
        const sourceDefaultModel = defaultModels[sourceName];

        // Skip non-Sequelize exports (sequelize instance, Sequelize constructor, etc.)
        if (!sourceDefaultModel || typeof sourceDefaultModel.associations !== 'object') {
            return;
        }

        const tenantSource = models[sourceName];
        // Skip models that are not part of the tenant set (e.g. Landlord-only models)
        if (!tenantSource) {
            return;
        }

        Object.values(sourceDefaultModel.associations).forEach(assoc => {
            const targetModelName = assoc.target.name;
            const tenantTarget = models[targetModelName];

            // Skip if the target model is not in the tenant set (e.g. Tenant, Payment, etc.)
            if (!tenantTarget) {
                return;
            }

            const assocOptions = {
                foreignKey: assoc.foreignKey,
                as: assoc.as,
            };

            // Preserve optional constraint options when present
            if (assoc.options?.onDelete) assocOptions.onDelete = assoc.options.onDelete;
            if (assoc.options?.onUpdate) assocOptions.onUpdate = assoc.options.onUpdate;

            switch (assoc.associationType) {
                case 'HasMany':
                    tenantSource.hasMany(tenantTarget, assocOptions);
                    break;
                case 'HasOne':
                    tenantSource.hasOne(tenantTarget, assocOptions);
                    break;
                case 'BelongsTo':
                    tenantSource.belongsTo(tenantTarget, assocOptions);
                    break;
                case 'BelongsToMany': {
                    // Resolve the through-table to its tenant clone if it exists
                    const throughModelName = assoc.through?.model?.name;
                    const tenantThrough = throughModelName
                        ? (models[throughModelName] || assoc.through.model)
                        : assoc.through;
                    tenantSource.belongsToMany(tenantTarget, {
                        ...assocOptions,
                        through: tenantThrough,
                        otherKey: assoc.otherKey,
                    });
                    break;
                }
                default:
                    logger.warn(`[TenantModelFactory] Unknown associationType "${assoc.associationType}" on ${sourceName} — skipping.`);
            }
        });
    });

    // Mark as initialized to prevent re-running this logic on subsequent requests for the same tenant
    sequelize._tenantModelsInitialized = true;

    return models;
};
