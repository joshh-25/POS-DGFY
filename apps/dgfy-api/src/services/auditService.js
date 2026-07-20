

import dbStore from '../utils/dbStore.js';
import logger from '../config/logger.js';

/**
 * Log a user action to the audit/history log
 * @param {number} userId - ID of the user performing the action
 * @param {string} entityType - Type of entity affected (e.g., 'Item', 'Supplier')
 * @param {number} entityId - ID of the entity affected
 * @param {string} action - Action performed (CREATE, UPDATE, DELETE, VIEW)
 * @param {Object} changes - Details of changes (key-value pairs)
 * @param {Object} metadata - Additional info (ip_address, user_agent, etc.)
 */
export const logAction = async (userId, entityType, entityId, action, changes = {}, metadata = {}) => {
    try {
        const AuditLog = dbStore.get('AuditLog');
        await AuditLog.create({
            user_id: userId,
            entity_type: entityType,
            entity_id: entityId,
            action: action,
            changes: changes,
            ip_address: metadata.ip_address || null,
            user_agent: metadata.user_agent || 'AI Assistant',
            timestamp: new Date()
        });

        logger.info(`AUDIT: [${action}] ${entityType} ${entityId} by User ${userId}`);
    } catch (error) {
        // We log the error but don't throw it to avoid blocking the main action
        logger.error('Failed to create audit log:', error);
    }
};

export default {
    logAction
};
