import { Sequelize } from 'sequelize';

const listDbs = async () => {
    const s = new Sequelize('mysql', 'root', '', { host: 'localhost', dialect: 'mysql', logging: false });
    try {
        const [results] = await s.query('SHOW DATABASES');
        console.log('DatabasesFound:');
        console.log(JSON.stringify(results.map(r => r.Database), null, 2));
    } catch (e) {
        console.error('Error:', e.message);
    } finally {
        await s.close();
    }
};

listDbs();
