import { Sequelize, DataTypes } from 'sequelize';
import dotenv from 'dotenv';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

dotenv.config({ path: join(__dirname, '..', '.env') });

const sequelize = new Sequelize(
    process.env.DB_NAME,
    process.env.DB_USER,
    process.env.DB_PASSWORD || '',
    {
        host: process.env.DB_HOST,
        dialect: process.env.DB_DIALECT,
        logging: false
    }
);

// Define Models
const Tenant = sequelize.define('Tenant', {
    id: { type: DataTypes.UUID, defaultValue: DataTypes.UUIDV4, primaryKey: true },
    name: { type: DataTypes.STRING },
    company_token: { type: DataTypes.STRING },
    db_name: { type: DataTypes.STRING }
}, { tableName: 'tenants', timestamps: true, createdAt: 'created_at', updatedAt: 'updated_at' });

const User = sequelize.define('User', {
    user_id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
    email: { type: DataTypes.STRING }
}, { tableName: 'users', timestamps: true });

async function checkTenants() {
    try {
        await sequelize.authenticate();
        console.log('Database connected.');

        const tenant = await Tenant.findOne({ where: { company_token: 'token-original' } });

        if (tenant) {
            console.log(`FOUND TENANT for 'token-original':`);
            console.log(`ID: ${tenant.id}`);
            console.log(`Name: ${tenant.name}`);
            console.log(`DB Name: ${tenant.db_name}`);
        } else {
            console.log(`Tenant with token 'token-original' NOT FOUND.`);
            // List all just in case
            const all = await Tenant.findAll();
            all.forEach(t => console.log(` - ${t.name}: ${t.company_token}`));
        }


    } catch (error) {
        console.error('Error:', error);
    } finally {
        await sequelize.close();
    }
}

checkTenants();
