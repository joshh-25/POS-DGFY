import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import dbStore from '../utils/dbStore.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Path to log file: backend/logs/user_feedback.log
const LOG_FILE = path.join(__dirname, '../../logs/user_feedback.log');

export const submitFeedback = async (req, res) => {
    try {
        const { type, description, url, context } = req.body;

        if (!type || !description) {
            return res.status(400).json({ message: 'Type and Description are required' });
        }

        const store = dbStore.getStore();
        const entry = {
            timestamp: new Date().toISOString(),
            type,
            description,
            url: url || 'N/A',
            context: context || {},
            tenant: store ? {
                id: store.tenantId,
                name: store.tenantName
            } : null,
            user: req.user ? {
                id: req.user.user_id,
                username: req.user.username,
                email: req.user.email
            } : { id: 'Anonymous', username: 'Anonymous', email: 'N/A' }
        };

        const logLine = JSON.stringify(entry) + '\n';

        // Append to log file
        fs.appendFile(LOG_FILE, logLine, (err) => {
            if (err) {
                console.error('Error writing feedback log:', err);
                return res.status(500).json({ message: 'Failed to save feedback' });
            }
            res.status(201).json({ message: 'Feedback submitted successfully' });
        });

    } catch (error) {
        console.error('Feedback Error:', error);
        res.status(500).json({ message: 'Internal Server Error' });
    }
};
