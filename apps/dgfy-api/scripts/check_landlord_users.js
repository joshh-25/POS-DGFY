
import { Sequelize } from 'sequelize';
import dotenv from 'dotenv';
dotenv.config();

const sequelize = new Sequelize(
    process.env.DB_NAME || 'sku',
    process.env.DB_USER || 'root',
    process.env.DB_PASSWORD || '',
    {
        host: process.env.DB_HOST || 'localhost',
        dialect: 'mysql',
        logging: false
    }
);

async function checkUsers() {
    try {
        const [users] = await sequelize.query("SELECT user_id, username, email, role FROM users");
        console.log("--- Users in Landlord DB (sku) ---");
        console.table(users);

        const [aiConvs] = await sequelize.query("SHOW TABLES LIKE 'ai_conversations'");
        if (aiConvs.length > 0) {
            console.log("ai_conversations table exists in Landlord DB.");
            const [counts] = await sequelize.query("SELECT COUNT(*) as count FROM ai_conversations");
            console.log(`Count: ${counts[0].count}`);
        } else {
            console.log("ai_conversations table does NOT exist in Landlord DB.");
        }

    } catch (error) {
        console.error("Error:", error.message);
    } finally {
        await sequelize.close();
    }
}

checkUsers();
