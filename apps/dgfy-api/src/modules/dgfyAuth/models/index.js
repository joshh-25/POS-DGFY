import defineDgfyAccount from './DgfyAccount.js';
import defineDgfyAccountHandoff from './DgfyAccountHandoff.js';
import defineDgfyLegalAcknowledgement from './DgfyLegalAcknowledgement.js';

const registryBySequelize = new WeakMap();

/**
 * Registers (once per Sequelize instance) the three landlord-DB models this
 * package owns. Sequelize throws if Model.init() runs twice against the same
 * modelName on the same connection, so callers MUST route model access
 * through this registry rather than calling the define*() factories directly.
 */
export const registerModels = (sequelize) => {
    if (!sequelize) {
        throw new Error('@dgfy/auth-core: a Sequelize instance is required to register models.');
    }

    const existing = registryBySequelize.get(sequelize);
    if (existing) return existing;

    const DgfyAccount = defineDgfyAccount(sequelize);
    const DgfyAccountHandoff = defineDgfyAccountHandoff(sequelize);
    const DgfyLegalAcknowledgement = defineDgfyLegalAcknowledgement(sequelize);

    DgfyAccount.hasMany(DgfyAccountHandoff, { foreignKey: 'dgfy_account_id', as: 'handoffs' });
    DgfyAccountHandoff.belongsTo(DgfyAccount, { foreignKey: 'dgfy_account_id', as: 'account' });

    DgfyAccount.hasMany(DgfyLegalAcknowledgement, { foreignKey: 'dgfy_account_id', as: 'legalAcknowledgements' });
    DgfyLegalAcknowledgement.belongsTo(DgfyAccount, { foreignKey: 'dgfy_account_id', as: 'account' });

    const models = { DgfyAccount, DgfyAccountHandoff, DgfyLegalAcknowledgement };
    registryBySequelize.set(sequelize, models);
    return models;
};

export default registerModels;
