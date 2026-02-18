import { Sequelize } from 'sequelize';
import dotenv from 'dotenv';
dotenv.config();

const sequelize = new Sequelize(process.env.DATABASE_URL, {
    dialect: 'mysql',
    logging: false
});

async function checkAdmin() {
    try {
        const [results] = await sequelize.query("SELECT * FROM users WHERE email = 'admin@test.com'");
        if (results.length > 0) {
            console.log('✅ Admin user found:', results[0].email);
        } else {
            console.log('❌ Admin user NOT found');
        }
    } catch (error) {
        console.error('Error checking admin:', error);
    } finally {
        await sequelize.close();
    }
}

checkAdmin();
