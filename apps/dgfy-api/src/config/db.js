import './env.js';
import { Sequelize } from 'sequelize';

const resolveDatabaseName = () => {
    if (process.env.NODE_ENV === 'test') {
        return process.env.DB_NAME_TEST || (process.env.CI ? process.env.DB_NAME : null) || 'sku_test';
    }
    return process.env.DB_NAME || 'dgfy_core';
};

// Defaults to the dgfy_core landlord database (Phase 2's
// apps/dgfy-migration-runner/src/schemaContracts/dgfyCoreContract.js) — a
// separate, standalone database from backend's sku_inventory_manager.
// apps/dgfy-api's own models (src/models/Landlord/Account.js and everything
// Wave 1/2 of Phase 4 built) are defined against dgfy_core's schema.
//
// IMPORTANT: this is the ONE shared Sequelize connection also used by the
// out-of-scope dgfyAuth module (modules/dgfyAuth/models/*.js, registered
// via modules/dgfyAuth/index.js against this same `sequelize` instance) —
// dgfyAuth's DgfyAccount/DgfyAccountHandoff/DgfyLegalAcknowledgement models
// target the legacy `dgfy_accounts`-shaped tables, which live in
// sku_inventory_manager, NOT dgfy_core. This only changes the CODE-LEVEL
// default: infrastructure/docker/.env already sets DB_NAME=sku_inventory_
// manager explicitly for the deployed dgfy-api container (env_file), so
// dgfyAuth's production behavior is unaffected by this default flip — the
// env var always wins over resolveDatabaseName()'s fallback. This default
// only takes effect where DB_NAME is left unset (e.g. a fresh local dev
// shell), in which case it now favors the newer dgfy_core-targeting
// modules (accounts/businesses) over dgfyAuth, which is a legacy proxy
// module slated for removal in Phase 5.
const sequelize = new Sequelize(
    resolveDatabaseName(),
    process.env.DB_USER,
    process.env.DB_PASSWORD,
    {
        host: process.env.DB_HOST || 'localhost',
        port: process.env.DB_PORT || 3306,
        dialect: process.env.DB_DIALECT || 'mysql',
        logging: process.env.NODE_ENV === 'development' ? console.log : false,
        pool: {
            max: 10,
            min: 0,
            acquire: 10000,
            idle: 10000
        },
        define: {
            timestamps: true,
            underscored: false,
            freezeTableName: true
        }
    }
);

export const testConnection = async () => {
    try {
        await sequelize.authenticate();
        return true;
    } catch (error) {
        return false;
    }
};

export default sequelize;
