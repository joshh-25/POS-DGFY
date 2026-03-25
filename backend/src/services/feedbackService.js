import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const LOG_FILE = path.join(__dirname, '../../logs/user_feedback.log');

/**
 * Read and parse all feedback entries from the log file
 */
export const getAllFeedback = async () => {
    try {
        // Check if file exists
        try {
            await fs.access(LOG_FILE);
        } catch {
            // File doesn't exist yet, return empty array
            return [];
        }

        const fileContent = await fs.readFile(LOG_FILE, 'utf-8');
        const lines = fileContent.trim().split('\n').filter(line => line.trim());

        const feedback = lines.map((line, index) => {
            try {
                const parsed = JSON.parse(line);
                return {
                    id: index + 1, // Add sequential ID for frontend reference
                    ...parsed
                };
            } catch (parseError) {
                console.error('Error parsing feedback line:', line, parseError);
                return null;
            }
        }).filter(entry => entry !== null);

        // Sort by timestamp descending (newest first)
        feedback.sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));

        return feedback;
    } catch (error) {
        console.error('Error reading feedback log:', error);
        throw new Error('Failed to retrieve feedback', { cause: error });
    }
};

/**
 * Get filtered feedback based on query parameters
 */
export const getFilteredFeedback = async (filters = {}) => {
    const allFeedback = await getAllFeedback();
    let filtered = [...allFeedback];

    // Filter by type (bug/idea)
    if (filters.type && filters.type !== 'all') {
        filtered = filtered.filter(f => f.type === filters.type);
    }

    // Filter by search term (searches in description)
    if (filters.search) {
        const searchLower = filters.search.toLowerCase();
        filtered = filtered.filter(f =>
            f.description.toLowerCase().includes(searchLower) ||
            (f.url && f.url.toLowerCase().includes(searchLower))
        );
    }

    // Filter by date range
    if (filters.startDate) {
        const startDate = new Date(filters.startDate);
        filtered = filtered.filter(f => new Date(f.timestamp) >= startDate);
    }

    if (filters.endDate) {
        const endDate = new Date(filters.endDate);
        endDate.setHours(23, 59, 59, 999); // Include the entire end date
        filtered = filtered.filter(f => new Date(f.timestamp) <= endDate);
    }

    return filtered;
};

/**
 * Get feedback statistics
 */
export const getFeedbackStats = async () => {
    const allFeedback = await getAllFeedback();

    return {
        total: allFeedback.length,
        bugs: allFeedback.filter(f => f.type === 'bug').length,
        ideas: allFeedback.filter(f => f.type === 'idea').length,
        latest: allFeedback[0] || null
    };
};
