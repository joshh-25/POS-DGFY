
import { User, sequelize } from '../models/index.js';

async function checkUser() {
    try {
        await sequelize.authenticate();
        console.log('Connection has been established successfully.');

        const user = await User.findOne({
            where: { email: 'mama@gmail.com' },
            attributes: ['user_id', 'username', 'email', 'role', 'is_active']
        });

        if (user) {
            console.log('User found:', JSON.stringify(user.toJSON(), null, 2));
        } else {
            console.log('User mama@gmail.com not found.');
        } // End if

    } catch (error) {
        console.error('Unable to connect to the database:', error);
    } finally {
        await sequelize.close();
    }
}

checkUser();
