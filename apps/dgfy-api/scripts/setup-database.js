import mysql from 'mysql2/promise';
import { exec } from 'child_process';
import { promisify } from 'util';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

const execAsync = promisify(exec);
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Load environment variables
dotenv.config({ path: path.join(__dirname, '../.env') });

const DB_HOST = process.env.DB_HOST || 'localhost';
const DB_PORT = parseInt(process.env.DB_PORT) || 3306;
const DB_USER = process.env.DB_USER || 'root';
const DB_PASSWORD = process.env.DB_PASSWORD || '';
const DB_NAME = process.env.DB_NAME || 'sku_inventory_manager';

/**
 * Check if database exists
 */
async function databaseExists() {
  try {
    const connection = await mysql.createConnection({
      host: DB_HOST,
      port: DB_PORT,
      user: DB_USER,
      password: DB_PASSWORD,
    });

    const [rows] = await connection.execute(
      `SELECT SCHEMA_NAME FROM INFORMATION_SCHEMA.SCHEMATA WHERE SCHEMA_NAME = ?`,
      [DB_NAME]
    );

    await connection.end();
    return rows.length > 0;
  } catch (error) {
    console.error('Error checking database existence:', error.message);
    throw error;
  }
}

/**
 * Create database if it doesn't exist
 */
async function createDatabase() {
  try {
    const connection = await mysql.createConnection({
      host: DB_HOST,
      port: DB_PORT,
      user: DB_USER,
      password: DB_PASSWORD,
    });

    await connection.execute(`CREATE DATABASE IF NOT EXISTS \`${DB_NAME}\` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci`);
    console.log(`✅ Database '${DB_NAME}' created or already exists`);
    await connection.end();
  } catch (error) {
    console.error('❌ Error creating database:', error.message);
    throw error;
  }
}

/**
 * Run Sequelize migrations
 */
async function runMigrations() {
  try {
    console.log('🔄 Running database migrations...');
    const { stdout, stderr } = await execAsync('npm run migrate', {
      cwd: path.join(__dirname, '..'),
    });
    
    if (stderr && !stderr.includes('No migrations were executed')) {
      console.error('Migration warnings:', stderr);
    }
    
    console.log('✅ Migrations completed');
    if (stdout) {
      console.log(stdout);
    }
  } catch (error) {
    console.error('❌ Error running migrations:', error.message);
    throw error;
  }
}

/**
 * Run Sequelize seeders
 */
async function runSeeders() {
  try {
    console.log('🌱 Running database seeders...');
    const { stdout, stderr } = await execAsync('npm run seed', {
      cwd: path.join(__dirname, '..'),
    });
    
    if (stderr && !stderr.includes('No seeders were executed')) {
      console.error('Seeder warnings:', stderr);
    }
    
    console.log('✅ Seeders completed');
    if (stdout) {
      console.log(stdout);
    }
  } catch (error) {
    console.error('❌ Error running seeders:', error.message);
    // Don't throw - seeders are optional
    console.log('⚠️  Continuing without seeders...');
  }
}

/**
 * Main setup function
 */
async function setupDatabase() {
  console.log('🚀 Starting database setup...\n');
  console.log(`Database Configuration:`);
  console.log(`  Host: ${DB_HOST}`);
  console.log(`  Port: ${DB_PORT}`);
  console.log(`  User: ${DB_USER}`);
  console.log(`  Database: ${DB_NAME}\n`);

  try {
    // Check if database exists
    const exists = await databaseExists();
    
    if (!exists) {
      console.log(`📦 Database '${DB_NAME}' does not exist. Creating...`);
      await createDatabase();
    } else {
      console.log(`✅ Database '${DB_NAME}' already exists`);
    }

    // Run migrations
    await runMigrations();

    // Run seeders (optional)
    const runSeedersFlag = process.argv.includes('--seed') || process.argv.includes('-s');
    if (runSeedersFlag) {
      await runSeeders();
    } else {
      console.log('💡 Tip: Run with --seed flag to populate initial data');
    }

    console.log('\n✅ Database setup completed successfully!');
    console.log(`\nYou can now start the server with: npm run dev`);
  } catch (error) {
    console.error('\n❌ Database setup failed:', error.message);
    process.exit(1);
  }
}

// Run setup
setupDatabase();

