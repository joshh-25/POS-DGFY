import cron from 'node-cron';
import fs from 'fs/promises';
import path from 'path';
import logger from '../config/logger.js';
import { TEMP_DIR } from '../config/uploadConfig.js'; // Assuming we export this or defined hardcoded

// Fallback if not exported
const UPLOAD_DIR = 'uploads/temp';

/**
 * Initialize the cleanup job
 * Runs every 15 minutes to delete files older than 1 hour
 */
export const initCleanupJob = () => {
    logger.info('Initializing file cleanup service...');

    // Fix 8.3: Run once immediately to clear files leaked before a restart
    cleanupTempFiles().catch(err =>
        logger.warn('Startup cleanup failed:', err.message)
    );

    // Run every 15 minutes
    cron.schedule('*/15 * * * *', async () => {
        logger.info('Running scheduled file cleanup...');
        try {
            await cleanupTempFiles();
        } catch (error) {
            logger.error('Error during file cleanup:', error);
        }
    });
};

/**
 * Cleanup temporary files older than 1 hour
 */
export const cleanupTempFiles = async () => {
    try {
        const files = await fs.readdir(UPLOAD_DIR);
        const now = Date.now();
        const ONE_HOUR = 60 * 60 * 1000;
        let deletedCount = 0;

        for (const file of files) {
            if (file === '.gitkeep') continue;

            const filePath = path.join(UPLOAD_DIR, file);
            try {
                const stats = await fs.stat(filePath);
                if (now - stats.mtimeMs > ONE_HOUR) {
                    await fs.unlink(filePath);
                    deletedCount++;
                }
            } catch (err) {
                logger.warn(`Failed to process/delete file ${file}:`, err.message);
            }
        }

        if (deletedCount > 0) {
            logger.info(`Cleanup completed. Deleted ${deletedCount} old files.`);
        }
    } catch (error) {
        if (error.code === 'ENOENT') {
            // Directory doesn't exist yet, which is fine
            return;
        }
        throw error;
    }
};
