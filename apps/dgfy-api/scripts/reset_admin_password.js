import { Sequelize, DataTypes } from 'sequelize';
import dotenv from 'dotenv';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import bcrypt from 'bcryptjs';

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

const User = sequelize.define('User', {
    username: { type: DataTypes.STRING },
    email: { type: DataTypes.STRING, unique: true },
    password_hash: { type: DataTypes.STRING }, // Note: model uses password_hash, not password
    is_active: { type: DataTypes.BOOLEAN }
}, {
    tableName: 'users',
    timestamps: true,
    createdAt: 'created_at',
    updatedAt: 'updated_at'
});

async function resetPassword() {
    try {
        await sequelize.authenticate();
        console.log('Database connection OK.');

        const email = 'admin@test.com';
        const newPassword = 'Admin123!';

        const user = await User.findOne({ where: { email } });

        if (!user) {
            console.log(`User ${email} NOT found.`);
            return;
        }

        console.log(`User found: ${user.username}`);

        // Hash new password
        const salt = await bcrypt.genSalt(10);
        const hashedPassword = await bcrypt.hash(newPassword, salt);

        user.password_hash = hashedPassword;
        // ensure active
        user.is_active = true;

        await user.save();

        console.log(`Password for ${email} has been reset to: ${newPassword}`);

    } catch (error) {
        console.error('Error:', error);
    } finally {
        await sequelize.close();
    }
}

resetPassword();
