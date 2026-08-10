import mysql from 'mysql2/promise';
import { exec } from 'child_process';
import { promisify } from 'util';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';
import readline from 'readline';

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
const NODE_ENV = process.env.NODE_ENV || 'development';

/**
 * Prompt user for confirmation
 */
function askQuestion(query) {
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  });

  return new Promise((resolve) => {
    rl.question(query, (answer) => {
      rl.close();
      resolve(answer);
    });
  });
}

/**
 * Drop database
 */
async function dropDatabase() {
  try {
    const connection = await mysql.createConnection({
      host: DB_HOST,
      port: DB_PORT,
      user: DB_USER,
      password: DB_PASSWORD,
    });

    await connection.execute(`DROP DATABASE IF EXISTS \`${DB_NAME}\``);
    console.log(`✅ Database '${DB_NAME}' dropped`);
    await connection.end();
  } catch (error) {
    console.error('❌ Error dropping database:', error.message);
    throw error;
  }
}

/**
 * Create database
 */
async function createDatabase() {
  try {
    const connection = await mysql.createConnection({
      host: DB_HOST,
      port: DB_PORT,
      user: DB_USER,
      password: DB_PASSWORD,
    });

    await connection.execute(`CREATE DATABASE \`${DB_NAME}\` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci`);
    console.log(`✅ Database '${DB_NAME}' created`);
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
    throw error;
  }
}

/**
 * Main reset function
 */
async function resetDatabase() {
  // Safety check - only allow in development
  if (NODE_ENV === 'production') {
    console.error('❌ Database reset is not allowed in production environment!');
    process.exit(1);
  }

  console.log('⚠️  WARNING: This will DROP and RECREATE the database!');
  console.log(`   Database: ${DB_NAME}`);
  console.log(`   Host: ${DB_HOST}:${DB_PORT}`);
  console.log(`   Environment: ${NODE_ENV}\n`);

  // Check for --force flag to skip confirmation
  const forceFlag = process.argv.includes('--force') || process.argv.includes('-f');
  
  if (!forceFlag) {
    const answer = await askQuestion('Are you sure you want to continue? (yes/no): ');
    if (answer.toLowerCase() !== 'yes' && answer.toLowerCase() !== 'y') {
      console.log('❌ Database reset cancelled');
      process.exit(0);
    }
  }

  console.log('\n🚀 Starting database reset...\n');

  try {
    // Drop database
    await dropDatabase();

    // Create database
    await createDatabase();

    // Run migrations
    await runMigrations();

    // Run seeders
    const skipSeeders = process.argv.includes('--no-seed');
    if (!skipSeeders) {
      await runSeeders();
    } else {
      console.log('💡 Skipping seeders (--no-seed flag provided)');
    }

    console.log('\n✅ Database reset completed successfully!');
    console.log(`\nYou can now start the server with: npm run dev`);
  } catch (error) {
    console.error('\n❌ Database reset failed:', error.message);
    process.exit(1);
  }
}

// Run reset
resetDatabase();

