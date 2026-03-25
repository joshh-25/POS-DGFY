/**
 * File Management Service
 *
 * Handles file system operations safely, restricted to the uploads directory.
 */

import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';
import logger from '../config/logger.js';

// Define the root directory for all file operations
// Using absolute path relative to this file
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const UPLOADS_ROOT = path.resolve(__dirname, '../../uploads');

/**
 * Ensure the uploads directory exists
 */
const ensureRootExists = async () => {
    try {
        await fs.access(UPLOADS_ROOT);
    } catch {
        await fs.mkdir(UPLOADS_ROOT, { recursive: true });
    }
};

/**
 * Validate and resolve a path to ensure it stays within UPLOADS_ROOT
 * @param {string} relativePath 
 * @returns {string} Absolute path
 */
const resolveSafePath = (relativePath) => {
    // Normalize path to basic characters
    const safeRelative = path.normalize(relativePath).replace(/^(\.\.[/\\])+/, '');
    const absolutePath = path.join(UPLOADS_ROOT, safeRelative);

    if (!absolutePath.startsWith(UPLOADS_ROOT)) {
        throw new Error('Access denied: Path is outside the allowed directory.');
    }

    return absolutePath;
};

/**
 * List files and directories in a path
 * @param {string} directoryPath - Relative path to list (default: root)
 * @returns {Promise<Array>} List of file objects
 */
export const listFiles = async (directoryPath = '') => {
    await ensureRootExists();
    const absolutePath = resolveSafePath(directoryPath);

    try {
        const entries = await fs.readdir(absolutePath, { withFileTypes: true });

        // Get file details (stats)
        const fileList = await Promise.all(entries.map(async (entry) => {
            const entryPath = path.join(absolutePath, entry.name);
            const relativeEntryPath = path.relative(UPLOADS_ROOT, entryPath).replace(/\\/g, '/');
            let stats = { size: 0, mtime: new Date() };

            try {
                stats = await fs.stat(entryPath);
            } catch {
                // Ignore stat errors (e.g. broken links)
            }

            return {
                name: entry.name,
                path: relativeEntryPath,
                type: entry.isDirectory() ? 'folder' : 'file',
                size: stats.size,
                modified: stats.mtime
            };
        }));

        return fileList;
    } catch (error) {
        logger.error(`Error listing files in ${directoryPath}:`, error);
        throw new Error(`Failed to list files: ${error.message}`, { cause: error });
    }
};

/**
 * Create a new folder
 * @param {string} folderPath - Relative path for the new folder
 * @returns {Promise<Object>} Created folder details
 */
export const createFolder = async (folderPath) => {
    await ensureRootExists();
    const absolutePath = resolveSafePath(folderPath);

    try {
        // Check if exists
        try {
            await fs.access(absolutePath);
            throw new Error('Folder already exists');
        } catch (err) {
            if (err.message === 'Folder already exists') throw err;
            // Does not exist, proceed
        }

        await fs.mkdir(absolutePath, { recursive: true });
        logger.info(`Folder created: ${folderPath}`);

        return {
            success: true,
            path: folderPath,
            message: `Folder '${folderPath}' created successfully`
        };
    } catch (error) {
        logger.error(`Error creating folder ${folderPath}:`, error);
        throw new Error(`Failed to create folder: ${error.message}`, { cause: error });
    }
};

/**
 * Move a file or folder
 * @param {string} sourcePath - Current relative path
 * @param {string} destinationPath - Target relative path (including filename if renaming)
 * @returns {Promise<Object>} Operation result
 */
export const moveFile = async (sourcePath, destinationPath) => {
    await ensureRootExists();
    const absoluteSource = resolveSafePath(sourcePath);
    let absoluteDest = resolveSafePath(destinationPath);

    try {
        // Check if source exists
        try {
            await fs.access(absoluteSource);
        } catch {
            throw new Error(`Source file or folder '${sourcePath}' does not exist`);
        }

        // Check if destination is a directory
        let isDestDir = false;
        try {
            const destStats = await fs.stat(absoluteDest);
            isDestDir = destStats.isDirectory();
        } catch {
            // Destination doesn't exist yet, which is fine for file moves (renaming/moving)
        }

        // If destination is an existing directory, append the source filename
        if (isDestDir) {
            const fileName = path.basename(absoluteSource);
            absoluteDest = path.join(absoluteDest, fileName);
        }

        // Check if target already exists to avoid unintended overwrites
        // (Optional: could add an overwrite flag later)
        try {
            await fs.access(absoluteDest);
            throw new Error(`Destination '${path.relative(UPLOADS_ROOT, absoluteDest)}' already exists`);
        } catch (err) {
            if (err.code !== 'ENOENT') throw err;
        }

        await fs.rename(absoluteSource, absoluteDest);

        const newPath = path.relative(UPLOADS_ROOT, absoluteDest).replace(/\\/g, '/');
        logger.info(`Moved ${sourcePath} to ${newPath}`);

        return {
            success: true,
            from: sourcePath,
            to: newPath,
            message: `Moved successfully to ${newPath}`
        };
    } catch (error) {
        logger.error(`Error moving ${sourcePath} to ${destinationPath}:`, error);
        throw new Error(`Failed to move item: ${error.message}`, { cause: error });
    }
};

export default {
    listFiles,
    createFolder,
    moveFile
};
