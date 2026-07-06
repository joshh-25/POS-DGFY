import app from './app.js';
import { PORT } from './config/env.js';
import { initializeRedis, closeRedis } from './config/redis.js';
import sequelize from './config/db.js';

const start = async () => {
    await initializeRedis();

    try {
        await sequelize.authenticate();
        console.log('[dgfy-api] Database connection established.');
    } catch (error) {
        console.error('[dgfy-api] Unable to connect to the database:', error.message);
    }

    const server = app.listen(PORT, () => {
        console.log(`[dgfy-api] listening on port ${PORT}`);
    });

    const shutdown = async (signal) => {
        console.log(`[dgfy-api] Received ${signal}, shutting down...`);
        server.close(async () => {
            await closeRedis();
            await sequelize.close();
            process.exit(0);
        });
    };

    process.on('SIGTERM', () => shutdown('SIGTERM'));
    process.on('SIGINT', () => shutdown('SIGINT'));
};

start();
