
import { Sequelize } from 'sequelize';
import dotenv from 'dotenv';

async function run() {
    const masterSequelize = new Sequelize('', 'root', '', {
        host: 'localhost',
        dialect: 'mysql',
        logging: false
    });

    try {
        const [dbs] = await masterSequelize.query("SHOW DATABASES;");
        const dbNames = dbs.map(db => db.Database).filter(name =>
            !['information_schema', 'mysql', 'performance_schema', 'phpmyadmin'].includes(name)
        );

        console.log(`Applying migration to ${dbNames.length} databases...`);

        for (const dbName of dbNames) {
            process.stdout.write(`Migrating ${dbName}... `);
            const sequelize = new Sequelize(dbName, 'root', '', {
                host: 'localhost',
                dialect: 'mysql',
                logging: false
            });

            try {
                // Check if product_composition table exists
                const [tables] = await sequelize.query(`SHOW TABLES LIKE 'product_composition';`);
                if (tables.length > 0) {
                    await sequelize.query(`ALTER TABLE product_composition MODIFY COLUMN quantity_required DECIMAL(24, 12) NOT NULL;`);
                    console.log("SUCCESS");
                } else {
                    console.log("SKIP (no table)");
                }
            } catch (e) {
                console.log(`FAILED: ${e.message}`);
            } finally {
                await sequelize.close();
            }
        }

    } catch (error) {
        console.error("Migration failed:", error);
    } finally {
        process.exit(0);
    }
}

run();
