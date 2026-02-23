/**
 * Register the "Original Legacy Data" tenant with company_token = 'token-original'.
 * This matches CREDENTIALS.md and README.md for development/testing.
 *
 * Run: node backend/scripts/register_original_tenant.js
 */

import { Sequelize, DataTypes } from 'sequelize';
import { v4 as uuidv4 } from 'uuid';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
dotenv.config({ path: path.join(__dirname, '../.env') });

const sequelize = new Sequelize(
  process.env.DB_NAME || 'sku_inventory_manager',
  process.env.DB_USER || 'root',
  process.env.DB_PASSWORD || process.env.DB_PASS || '',
  {
    host: process.env.DB_HOST || 'localhost',
    dialect: 'mysql',
    logging: false,
  }
);

const Tenant = sequelize.define(
  'Tenant',
  {
    id: { type: DataTypes.UUID, primaryKey: true },
    name: { type: DataTypes.STRING },
    domain: { type: DataTypes.STRING },
    db_name: { type: DataTypes.STRING },
    company_token: { type: DataTypes.STRING },
    status: { type: DataTypes.STRING },
    admin_email: { type: DataTypes.STRING },
    plan: { type: DataTypes.STRING },
    subscription_status: { type: DataTypes.STRING },
  },
  {
    tableName: 'tenants',
    timestamps: true,
    createdAt: 'created_at',
    updatedAt: 'updated_at',
    underscored: true,
  }
);

async function registerOriginalTenant() {
  try {
    await sequelize.authenticate();
    console.log('Connected to DB.');

    const existing = await Tenant.findOne({
      where: { company_token: 'token-original' },
    });

    if (existing) {
      console.log('Tenant with token-original already exists.');
      console.log(`  ID: ${existing.id}, Name: ${existing.name}, DB: ${existing.db_name}`);
      process.exit(0);
      return;
    }

    // Check if sku_inventory_manager is already registered under another token
    const existingByDb = await Tenant.findOne({
      where: { db_name: 'sku_inventory_manager' },
    });

    if (existingByDb) {
      console.log('Updating existing tenant to use token-original...');
      await existingByDb.update({
        company_token: 'token-original',
        name: 'Original Legacy Data',
      });
      console.log('✅ Updated tenant to use token-original.');
    } else {
      const newId = uuidv4();
      console.log(`Creating Original tenant with ID: ${newId}`);

      await Tenant.create({
        id: newId,
        name: 'Original Legacy Data',
        domain: null,
        subdomain: 'original',
        db_name: 'sku_inventory_manager',
        company_token: 'token-original',
        status: 'active',
        admin_email: 'admin@test.com',
        plan: 'standard',
        subscription_status: 'active',
      });
      console.log('✅ Created tenant "Original Legacy Data" with token-original.');
    }

    process.exit(0);
  } catch (error) {
    console.error('Error:', error.message);
    process.exit(1);
  }
}

registerOriginalTenant();
