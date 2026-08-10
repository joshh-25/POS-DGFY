
import { User, sequelize } from '../models/index.js';

async function listUsers() {
    try {
        await sequelize.authenticate();
        console.log('Connection has been established successfully.');

        const users = await User.findAll({
            attributes: ['user_id', 'username', 'email', 'role', 'is_active']
        });

        console.log(`Found ${users.length} users:`);
        users.forEach(u => console.log(JSON.stringify(u.toJSON(), null, 2)));

    } catch (error) {
        console.error('Unable to connect to the database:', error);
    } finally {
        await sequelize.close();
    }
}

listUsers();
