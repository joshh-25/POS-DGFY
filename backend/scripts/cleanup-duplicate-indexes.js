/**
 * Cleanup Duplicate Indexes Script
 *
 * Removes duplicate indexes created by repeated Sequelize syncs.
 * These duplicates (username_2, username_3, etc.) hit MySQL's 64 key limit.
 *
 * Usage: node backend/scripts/cleanup-duplicate-indexes.js
 */

import mysql from 'mysql2/promise';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

dotenv.config({ path: path.join(__dirname, '..', '.env') });

// Tables known to have duplicate index issues
const TABLES_TO_CLEAN = ['users', 'items', 'suppliers', 'purchase_orders', 'job_orders'];

async function cleanupDuplicateIndexes(connection, dbName) {
  console.log(`\n📊 Cleaning duplicate indexes in: ${dbName}`);

  let totalRemoved = 0;

  for (const tableName of TABLES_TO_CLEAN) {
    // Check if table exists
    const [tables] = await connection.query(
      `SELECT TABLE_NAME FROM information_schema.tables
       WHERE table_schema = ? AND table_name = ?`,
      [dbName, tableName]
    );

    if (tables.length === 0) {
      continue;
    }

    // Get all indexes for this table
    const [indexes] = await connection.query(
      `SELECT DISTINCT INDEX_NAME
       FROM information_schema.statistics
       WHERE table_schema = ? AND table_name = ?
       ORDER BY INDEX_NAME`,
      [dbName, tableName]
    );

    // Find duplicate indexes (those ending with _2, _3, etc.)
    const duplicatePattern = /^(.+)_(\d+)$/;
    const duplicatesToRemove = [];

    for (const row of indexes) {
      const indexName = row.INDEX_NAME;
      const match = indexName.match(duplicatePattern);

      if (match && indexName !== 'PRIMARY') {
        const baseIndexName = match[1];
        const suffix = parseInt(match[2]);

        // Only remove if it's a numbered duplicate (suffix >= 2)
        if (suffix >= 2) {
          duplicatesToRemove.push(indexName);
        }
      }
    }

    if (duplicatesToRemove.length > 0) {
      console.log(`   Table ${tableName}: removing ${duplicatesToRemove.length} duplicate indexes`);

      for (const indexName of duplicatesToRemove) {
        try {
          await connection.query(`ALTER TABLE \`${tableName}\` DROP INDEX \`${indexName}\``);
          totalRemoved++;
        } catch (err) {
          // Index might not exist or already dropped
          if (!err.message.includes("check that it exists")) {
            console.log(`      ⚠️ Could not drop ${indexName}: ${err.message}`);
          }
        }
      }
    }
  }

  return totalRemoved;
}

async function main() {
  console.log('🧹 Duplicate Index Cleanup Script');
  console.log('==================================\n');

  // Connect to MySQL without specifying a database
  const connection = await mysql.createConnection({
    host: process.env.DB_HOST || 'localhost',
    port: process.env.DB_PORT || 3306,
    user: process.env.DB_USER || 'root',
    password: process.env.DB_PASSWORD || ''
  });

  try {
    // Get all tenant databases (those starting with 'sku_')
    const [databases] = await connection.query(
      `SELECT SCHEMA_NAME FROM information_schema.schemata
       WHERE SCHEMA_NAME LIKE 'sku_%'
       ORDER BY SCHEMA_NAME`
    );

    console.log(`Found ${databases.length} SKU databases to check.\n`);

    let totalCleaned = 0;

    for (const db of databases) {
      const dbName = db.SCHEMA_NAME;

      // Skip landlord database
      if (dbName === 'sku_landlord') {
        console.log(`⏭️ Skipping landlord database: ${dbName}`);
        continue;
      }

      await connection.query(`USE \`${dbName}\``);
      const removed = await cleanupDuplicateIndexes(connection, dbName);
      totalCleaned += removed;
    }

    console.log('\n==================================');
    console.log(`✅ Cleanup complete! Removed ${totalCleaned} duplicate indexes.`);
    console.log('\n💡 Now run: node backend/scripts/sync-tenant-schemas.js');

  } finally {
    await connection.end();
  }
}

main().catch(console.error);
