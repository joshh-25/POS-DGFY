/**
 * AI Tool Registry - Single Source of Truth
 *
 * This registry provides metadata about AI tools and serves as the
 * authoritative source for documentation generation and validation.
 *
 * IMPORTANT: When adding new tools, update them in aiTools.js and
 * ensure handlers exist in aiToolExecutor.js. Run `npm run validate:ai`
 * to verify consistency.
 */

import { AI_TOOLS, TOOL_CATEGORIES, TOOL_PERMISSIONS, getToolsForRole, getToolByName, toolRequiresConfirmation, getOpenAITools } from './aiTools.js';

// Registry metadata
export const REGISTRY_VERSION = '1.2.0';
export const REGISTRY_UPDATED = '2026-01-31';

/**
 * Get summary statistics about available tools
 */
export const getToolStats = () => {
  const byCategory = {};
  const byConfirmation = { requires: 0, noConfirmation: 0 };
  const byRole = { staff: 0, manager: 0, admin: 0, any: 0 };

  for (const tool of AI_TOOLS) {
    // Count by category
    const cat = tool.category || 'unknown';
    byCategory[cat] = (byCategory[cat] || 0) + 1;

    // Count by confirmation requirement
    if (tool.requiresConfirmation) {
      byConfirmation.requires++;
    } else {
      byConfirmation.noConfirmation++;
    }

    // Count by required role
    if (tool.requiredRole) {
      byRole[tool.requiredRole]++;
    } else {
      byRole.any++;
    }
  }

  return {
    totalTools: AI_TOOLS.length,
    byCategory,
    byConfirmation,
    byRole
  };
};

/**
 * Get all tool names
 */
export const getToolNames = () => {
  return AI_TOOLS.map(tool => tool.function.name);
};

/**
 * Get tools grouped by category
 */
export const getToolsByCategory = () => {
  const grouped = {};

  for (const tool of AI_TOOLS) {
    const cat = tool.category || 'uncategorized';
    if (!grouped[cat]) {
      grouped[cat] = [];
    }
    grouped[cat].push({
      name: tool.function.name,
      description: tool.function.description,
      requiresConfirmation: tool.requiresConfirmation || false,
      requiredRole: tool.requiredRole || null,
      parameters: tool.function.parameters
    });
  }

  return grouped;
};

/**
 * Get tools that require confirmation (write operations)
 */
export const getWriteTools = () => {
  return AI_TOOLS
    .filter(tool => tool.requiresConfirmation)
    .map(tool => ({
      name: tool.function.name,
      description: tool.function.description,
      requiredRole: tool.requiredRole || 'manager',
      category: tool.category
    }));
};

/**
 * Get read-only tools (no confirmation needed)
 */
export const getReadTools = () => {
  return AI_TOOLS
    .filter(tool => !tool.requiresConfirmation)
    .map(tool => ({
      name: tool.function.name,
      description: tool.function.description,
      requiredRole: tool.requiredRole || null,
      category: tool.category
    }));
};

/**
 * Validate that a tool name exists
 */
export const isValidTool = (toolName) => {
  return AI_TOOLS.some(tool => tool.function.name === toolName);
};

/**
 * Get documentation-ready tool info
 */
export const getToolDocumentation = (toolName) => {
  const tool = getToolByName(toolName);
  if (!tool) return null;

  const params = tool.function.parameters?.properties || {};
  const required = tool.function.parameters?.required || [];

  return {
    name: tool.function.name,
    description: tool.function.description,
    category: tool.category,
    requiresConfirmation: tool.requiresConfirmation || false,
    requiredRole: tool.requiredRole || null,
    parameters: Object.entries(params).map(([key, schema]) => ({
      name: key,
      type: schema.type,
      description: schema.description,
      required: required.includes(key),
      enum: schema.enum || null
    }))
  };
};

// Re-export everything from aiTools for convenience
export {
  AI_TOOLS,
  TOOL_CATEGORIES,
  TOOL_PERMISSIONS,
  getToolsForRole,
  getToolByName,
  toolRequiresConfirmation,
  getOpenAITools
};

export default {
  REGISTRY_VERSION,
  REGISTRY_UPDATED,
  AI_TOOLS,
  TOOL_CATEGORIES,
  TOOL_PERMISSIONS,
  getToolStats,
  getToolNames,
  getToolsByCategory,
  getWriteTools,
  getReadTools,
  isValidTool,
  getToolDocumentation,
  getToolsForRole,
  getToolByName,
  toolRequiresConfirmation,
  getOpenAITools
};
