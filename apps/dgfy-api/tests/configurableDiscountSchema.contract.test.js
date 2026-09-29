import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import PosDiscountRule from '../src/models/PosDiscountRule.js';
import {
  REQUIRED_TENANT_SCHEMA_COLUMNS,
  REQUIRED_TENANT_SCHEMA_ENUM_CONTRACTS,
  REQUIRED_TENANT_SCHEMA_INDEXES,
  REQUIRED_TENANT_SCHEMA_SEEDS,
  REQUIRED_TENANT_SCHEMA_TABLES
} from '../scripts/sync-tenant-schemas.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const migrationPath = path.resolve(
  __dirname,
  '../../dgfy-migration-runner/migrations/20260925000002-add-configurable-pos-discount-rule-fields.cjs'
);

describe('configurable POS discount schema contract', () => {
  it('exposes the configuration fields and named indexes required by the migration', () => {
    expect(PosDiscountRule.rawAttributes).toEqual(expect.objectContaining({
      discount_key: expect.objectContaining({ allowNull: false }),
      description: expect.objectContaining({ allowNull: true }),
      is_approved: expect.objectContaining({ allowNull: false, defaultValue: false }),
      configuration_source: expect.objectContaining({ allowNull: false, defaultValue: 'governed' }),
      configuration_version: expect.objectContaining({ allowNull: false, defaultValue: 1 })
    }));

    expect(PosDiscountRule.rawAttributes.type.values).toEqual([
      'senior',
      'pwd',
      'employee',
      'promo',
      'manual',
      'custom'
    ]);

    expect(PosDiscountRule.options.indexes).toEqual(expect.arrayContaining([
      expect.objectContaining({ name: 'uq_pos_discount_rules_discount_key', unique: true }),
      expect.objectContaining({ name: 'idx_pos_discount_rules_type_active' }),
      expect.objectContaining({ name: 'idx_pos_discount_rules_enabled_approved' })
    ]));
  });

  it('keeps the migration and new-tenant repair registry aligned', () => {
    const migrationSource = fs.readFileSync(migrationPath, 'utf8');

    expect(migrationSource).toContain("const LEGACY_DISCOUNT_SETTING_KEY = 'pos_discount_profiles';");
    expect(migrationSource).toContain("configuration_source = 'legacy_profile'");
    expect(migrationSource).toContain("VALUES (?, ?, 'custom', 'percentage'");
    expect(migrationSource).toContain("WHERE type = 'custom' OR configuration_source = 'legacy_profile'");

    expect(REQUIRED_TENANT_SCHEMA_TABLES.pos_discount_rules.sql).toContain(
      "`type` enum('senior','pwd','employee','promo','manual','custom')"
    );
    expect(REQUIRED_TENANT_SCHEMA_TABLES.pos_discount_rules.sql).toContain(
      '`discount_key` varchar(80) NOT NULL'
    );
    expect(REQUIRED_TENANT_SCHEMA_COLUMNS.pos_discount_rules).toEqual(expect.objectContaining({
      discount_key: expect.any(Object),
      is_approved: expect.any(Object),
      configuration_source: expect.any(Object),
      configuration_version: expect.any(Object)
    }));
    expect(REQUIRED_TENANT_SCHEMA_ENUM_CONTRACTS.pos_discount_rules.type.enumValues).toContain('custom');
    expect(REQUIRED_TENANT_SCHEMA_INDEXES.pos_discount_rules).toEqual(expect.objectContaining({
      uq_pos_discount_rules_discount_key: expect.any(Object),
      idx_pos_discount_rules_enabled_approved: expect.any(Object)
    }));
    expect(REQUIRED_TENANT_SCHEMA_SEEDS.pos_discount_rules.insertSql).toContain(
      "('senior', 'Senior Citizen', 'senior'"
    );
    expect(REQUIRED_TENANT_SCHEMA_SEEDS.pos_discount_rules.insertSql).toContain(
      "'governed', 1, NOW(), NOW())"
    );
  });
});
