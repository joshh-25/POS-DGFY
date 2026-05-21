/**
 * AI Context Service
 *
 * Builds dynamic context for AI conversations including
 * user information, current inventory stats, and system state.
 */

import { Op } from 'sequelize';
import dbStore from '../utils/dbStore.js';
import logger from '../config/logger.js';
import { buildVisibleWhere } from '../utils/softDeletePolicy.js';

/**
 * Build complete context for AI conversation
 * @param {number} userId - The user's ID
 * @returns {Promise<Object>} Context object
 */
export const buildContext = async (userId) => {
  try {
    const [user, stats] = await Promise.all([
      getUserContext(userId),
      getInventoryStats()
    ]);

    return {
      user,
      stats,
      lowStockCount: stats.lowStockCount || 0,
      pendingPOCount: stats.pendingPOCount || 0,
      activeJOCount: stats.activeJOCount || 0,
      activeDOCount: stats.activeDOCount || 0,
      timestamp: new Date().toISOString()
    };
  } catch (error) {
    logger.error('Failed to build AI context:', error);
    // Return minimal context on error
    return {
      user: { name: 'User', role: 'staff' },
      stats: {},
      lowStockCount: 0,
      pendingPOCount: 0,
      activeJOCount: 0,
      activeDOCount: 0,
      timestamp: new Date().toISOString()
    };
  }
};

/**
 * Get user context
 * @param {number} userId - User ID
 * @returns {Promise<Object>} User context
 */
export const getUserContext = async (userId) => {
  try {
    const User = dbStore.get('User');
    const user = await User.findOne({
      where: buildVisibleWhere({ user_id: userId }),
      attributes: ['user_id', 'username', 'email', 'role']
    });

    if (!user) {
      return { name: 'Unknown User', role: 'staff' };
    }

    return {
      id: user.user_id,
      name: user.username,
      email: user.email,
      role: user.role
    };
  } catch (error) {
    logger.error('Failed to get user context:', error);
    return { name: 'User', role: 'staff' };
  }
};

/**
 * Get current inventory statistics
 * Delegates to dashboardService to ensure a single source of truth for value calculations.
 * @returns {Promise<Object>} Inventory stats
 */
export const getInventoryStats = async () => {
  try {
    const Item = dbStore.get('Item');
    const PurchaseOrder = dbStore.get('PurchaseOrder');
    const JobOrder = dbStore.get('JobOrder');
    const DispatchOrder = dbStore.get('DispatchOrder');
    const sequelize = dbStore.getStore()?.sequelize || dbStore.get('sequelize');

    // Get item counts
    const [totalItems, lowStockItems, healthyItems, overstockItems] = await Promise.all([
      Item.count({
        where: buildVisibleWhere({ status: 'active' })
      }),
      Item.count({
        where: buildVisibleWhere({
          status: 'active',
          current_stock: {
            [Op.lte]: sequelize.col('min_threshold')
          }
        })
      }),
      Item.count({
        where: buildVisibleWhere({
          status: 'active',
          current_stock: {
            [Op.gt]: sequelize.col('min_threshold'),
            [Op.lte]: sequelize.col('max_capacity')
          }
        })
      }),
      Item.count({
        where: buildVisibleWhere({
          status: 'active',
          current_stock: {
            [Op.gt]: sequelize.col('max_capacity')
          }
        })
      })
    ]);

    // Get PO, JO, and DO counts
    const [pendingPOCount, activeJOCount, activeDOCount] = await Promise.all([
      PurchaseOrder.count({
        where: {
          status: { [Op.in]: ['pending', 'partial'] },
          archived_at: null
        }
      }),
      JobOrder.count({
        where: {
          status: { [Op.in]: ['draft', 'in_progress'] },
          archived_at: null
        }
      }),
      DispatchOrder.count({
        where: {
          status: { [Op.in]: ['draft', 'confirmed', 'partial'] },
          archived_at: null
        }
      })
    ]);

    // Calculate total inventory value using DB aggregation (single source of truth)
    const inventoryValueResult = await Item.findAll({
      where: buildVisibleWhere({ status: 'active' }),
      attributes: [
        [sequelize.fn('SUM', sequelize.literal('current_stock * cost_per_unit')), 'total_value']
      ],
      raw: true
    });
    const totalValue = parseFloat(inventoryValueResult[0]?.total_value || 0);

    return {
      totalItems,
      lowStockCount: lowStockItems,
      healthyCount: healthyItems,
      overstockCount: overstockItems,
      pendingPOCount,
      activeJOCount,
      activeDOCount,
      totalValue: Math.round(totalValue * 100) / 100
    };
  } catch (error) {
    logger.error('Failed to get inventory stats:', error);
    return {
      totalItems: 0,
      lowStockCount: 0,
      healthyCount: 0,
      overstockCount: 0,
      pendingPOCount: 0,
      activeJOCount: 0,
      activeDOCount: 0,
      totalValue: 0
    };
  }
};

/**
 * Get a quick summary for display
 * @param {number} userId - User ID
 * @returns {Promise<string>} Summary text
 */
export const getQuickSummary = async (userId) => {
  const context = await buildContext(userId);
  const { stats } = context;

  const alerts = [];
  if (stats.lowStockCount > 0) {
    alerts.push(`${stats.lowStockCount} items low on stock`);
  }
  if (stats.pendingPOCount > 0) {
    alerts.push(`${stats.pendingPOCount} pending purchase orders`);
  }
  if (stats.activeJOCount > 0) {
    alerts.push(`${stats.activeJOCount} active job orders`);
  }

  if (alerts.length === 0) {
    return 'All systems healthy. No alerts.';
  }

  return `Attention needed: ${alerts.join(', ')}.`;
};

/**
 * Check if user has permission for an action
 * @param {string} userRole - User's role
 * @param {string} requiredRole - Required role for the action
 * @returns {boolean} Whether user has permission
 */
export const hasPermission = (userRole, requiredRole) => {
  const roleHierarchy = {
    staff: 1,
    manager: 2,
    admin: 3
  };

  const userLevel = roleHierarchy[userRole] || 0;
  const requiredLevel = roleHierarchy[requiredRole] || 0;

  return userLevel >= requiredLevel;
};

/**
 * Get permission error message
 * @param {string} action - The action being attempted
 * @param {string} requiredRole - Required role
 * @returns {string} Error message
 */
export const getPermissionError = (action, requiredRole) => {
  return `You don't have permission to ${action}. This action requires ${requiredRole} or higher role. Please contact an administrator if you need access.`;
};

/**
 * Check if user has a specific granular permission
 * @param {Object} user - User object with permissions array and is_master_admin flag
 * @param {string} requiredPermission - Required permission string (e.g., 'users:manage')
 * @returns {boolean} Whether user has the permission
 */
export const hasGranularPermission = (user, requiredPermission) => {
  // Master admin bypasses all permission checks
  if (user.is_master_admin) {
    return true;
  }

  // Check if user has the specific permission
  const userPermissions = user.permissions || [];
  return userPermissions.includes(requiredPermission);
};

/**
 * Get granular permission error message
 * @param {string} action - The action being attempted
 * @param {string} requiredPermission - Required permission
 * @returns {string} Error message
 */
export const getGranularPermissionError = (action, requiredPermission) => {
  return `You don't have permission to ${action}. This action requires the "${requiredPermission}" permission. Please contact an administrator if you need access.`;
};

export default {
  buildContext,
  getUserContext,
  getInventoryStats,
  getQuickSummary,
  hasPermission,
  getPermissionError,
  hasGranularPermission,
  getGranularPermissionError
};
