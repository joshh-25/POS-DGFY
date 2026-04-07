import { Sequelize } from 'sequelize';
import dotenv from 'dotenv';

import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

dotenv.config({ path: join(__dirname, '..', '..', '.env') });

const resolveDatabaseName = () => {
  if (process.env.NODE_ENV === 'test') {
    return process.env.DB_NAME_TEST
      || (process.env.CI ? process.env.DB_NAME : null)
      || 'sku_test';
  }

  return process.env.DB_NAME || 'sku_inventory_manager';
};

const dbName = resolveDatabaseName();

const sequelize = new Sequelize(
  dbName,
  process.env.DB_USER,
  process.env.DB_PASSWORD,
  {
    host: process.env.DB_HOST || 'localhost',
    port: process.env.DB_PORT || 3306,
    dialect: process.env.DB_DIALECT || 'mysql',
    logging: process.env.NODE_ENV === 'development' ? console.log : false,
    pool: {
      // Landlord DB is hit on every single request (tenant resolution).
      // At 50 users × ~3 concurrent requests = ~150 simultaneous touches at peak.
      // 30 connections keeps waits near-zero while staying under MySQL's default max_connections (151).
      max: 30,
      min: 0,
      // Fail fast (10s) instead of making users wait 30s for a connection slot
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

// CRITICAL PRODUCTION GUARDRAIL
// Intercept all sync calls and prevent drop-table sweeps on the production database
const originalSync = sequelize.sync.bind(sequelize);
sequelize.sync = async (options = {}) => {
  if (options.force && !dbName.includes('test')) {
    throw new Error(`CRITICAL GUARDRAIL: Destructive sync (force: true) is FORBIDDEN on non-test database: ${dbName}. Production DB wipes are permanently blocked.`);
  }
  return originalSync(options);
};

// Test database connection
export const testConnection = async () => {
  try {
    await sequelize.authenticate();
    console.log('✅ Database connection established successfully.');
    return true;
  } catch (error) {
    console.error('❌ Unable to connect to the database:', error);
    return false;
  }
};

export default sequelize;

