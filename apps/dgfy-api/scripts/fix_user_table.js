
import sequelize from '../src/config/database.js';

const checkUserTable = async () => {
    try {
        console.log('Connecting to database...');
        await sequelize.authenticate();
        console.log('Connected.');

        console.log('Checking users table schema...');
        const [results] = await sequelize.query('DESCRIBE users');
        const columns = results.map(r => r.Field);
        console.log('Columns found:', columns);

        const expectedColumns = ['is_master_admin', 'permissions', 'last_login', 'is_active'];
        const missing = expectedColumns.filter(col => !columns.includes(col));

        if (missing.length > 0) {
            console.log('MISSING COLUMNS:', missing);

            // Auto-fix
            for (const col of missing) {
                if (col === 'is_master_admin') {
                    await sequelize.query('ALTER TABLE users ADD COLUMN is_master_admin TINYINT(1) NOT NULL DEFAULT 0');
                } else if (col === 'permissions') {
                    await sequelize.query('ALTER TABLE users ADD COLUMN permissions JSON NULL');
                } else if (col === 'last_login') {
                    await sequelize.query('ALTER TABLE users ADD COLUMN last_login DATETIME NULL');
                } else if (col === 'is_active') {
                    await sequelize.query('ALTER TABLE users ADD COLUMN is_active TINYINT(1) DEFAULT 1');
                }
                console.log(`Added column: ${col}`);
            }
        } else {
            console.log('All expected columns present.');
        }

        process.exit(0);
    } catch (error) {
        console.error('Error checking user table:', error);
        process.exit(1);
    }
};

checkUserTable();
