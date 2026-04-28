import { Package, Beaker, Box, Factory, Wrench } from 'lucide-react';
import {
    DEFAULT_WORKFLOW_MODE,
    normalizeWorkflowMode,
    resolveWorkflowModeFamily
} from '@/src/features/settings/workflowMode.js';

/**
 * Category Constants - Single Source of Truth for Frontend
 * 
 * Database structure:
 * - category: 'raw_material' | 'packaging' | 'product' | 'supplies'
 * - product_type: 'work_in_progress' | 'finished_goods' (only for category='product')
 * 
 * Frontend displays 5 effective categories by combining these fields
 */

// Database category values
export const CATEGORIES = {
    RAW_MATERIAL: 'raw_material',
    PACKAGING: 'packaging',
    PRODUCT: 'product',
    SUPPLIES: 'supplies'
};

// Product type values
export const PRODUCT_TYPES = {
    WORK_IN_PROGRESS: 'work_in_progress',
    FINISHED_GOODS: 'finished_goods'
};

const resolveWorkflowMode = (workflowModeOrOptions = DEFAULT_WORKFLOW_MODE) => {
    if (typeof workflowModeOrOptions === 'string') {
        return normalizeWorkflowMode(workflowModeOrOptions);
    }
    if (workflowModeOrOptions && typeof workflowModeOrOptions === 'object') {
        return normalizeWorkflowMode(workflowModeOrOptions.workflowMode);
    }
    return DEFAULT_WORKFLOW_MODE;
};

// Centralized display configuration
export const CATEGORY_DISPLAY_CONFIG = {
    raw_material: {
        icon: Beaker,
        color: 'bg-purple-100 text-purple-700 border-purple-200',
        label: 'Raw Material',
        badgeColor: 'bg-purple-100 text-purple-700'
    },
    packaging: {
        icon: Box,
        color: 'bg-amber-100 text-amber-700 border-amber-200',
        label: 'Packaging',
        badgeColor: 'bg-amber-100 text-amber-700'
    },
    work_in_progress: {
        icon: Factory,
        color: 'bg-orange-100 text-orange-700 border-orange-200',
        label: 'Work In Progress',
        badgeColor: 'bg-orange-100 text-orange-700'
    },
    finished_goods: {
        icon: Package,
        color: 'bg-blue-100 text-blue-700 border-blue-200',
        label: 'Finished Goods',
        badgeColor: 'bg-blue-100 text-blue-700'
    },
    supplies: {
        icon: Wrench,
        color: 'bg-slate-100 text-slate-700 border-slate-200',
        label: 'Supplies',
        badgeColor: 'bg-slate-100 text-slate-700'
    }
};

/**
 * Get effective category for display (combines category + product_type)
 * @param {object} item - Item object with category and product_type fields
 * @returns {string} Effective category key for display config
 */
export const getEffectiveCategory = (item) => {
    if (!item) return null;

    // For products, use product_type as the effective category
    if (item.category === CATEGORIES.PRODUCT && item.product_type) {
        return item.product_type;
    }

    // For non-products, use category directly
    return item.category;
};

/**
 * Get display label for an item's category
 * @param {object} item - Item object
 * @returns {string} Display label
 */
export const getCategoryLabel = (item) => {
    const effectiveCategory = getEffectiveCategory(item);
    return CATEGORY_DISPLAY_CONFIG[effectiveCategory]?.label || effectiveCategory || 'Unknown';
};

/**
 * Get icon component for an item's category
 * @param {object} item - Item object
 * @returns {Component} Lucide icon component
 */
export const getCategoryIcon = (item) => {
    const effectiveCategory = getEffectiveCategory(item);
    return CATEGORY_DISPLAY_CONFIG[effectiveCategory]?.icon || Package;
};

/**
 * Get color classes for an item's category
 * @param {object} item - Item object
 * @returns {string} Tailwind color classes
 */
export const getCategoryColor = (item) => {
    const effectiveCategory = getEffectiveCategory(item);
    return CATEGORY_DISPLAY_CONFIG[effectiveCategory]?.color || 'bg-slate-100 text-slate-700 border-slate-200';
};

/**
 * Get badge color classes for an item's category
 * @param {object} item - Item object
 * @returns {string} Tailwind color classes for badges
 */
export const getCategoryBadgeColor = (item) => {
    const effectiveCategory = getEffectiveCategory(item);
    return CATEGORY_DISPLAY_CONFIG[effectiveCategory]?.badgeColor || 'bg-slate-100 text-slate-700';
};

/**
 * Check if item is manufactured (created via Product Wizard)
 * @param {object} item - Item object
 * @returns {boolean}
 */
export const isManufactured = (item) => {
    return item?.category === CATEGORIES.PRODUCT;
};

/**
 * Check if item is purchasable (can appear in POs)
 * @param {object} item - Item object
 * @returns {boolean}
 */
export const isPurchasable = (item, workflowModeOrOptions = DEFAULT_WORKFLOW_MODE) => {
    if (!item) return false;
    const workflowMode = resolveWorkflowMode(workflowModeOrOptions);
    const categories = resolveWorkflowModeFamily(workflowMode) === 'msme'
        ? [CATEGORIES.RAW_MATERIAL, CATEGORIES.PACKAGING, CATEGORIES.SUPPLIES, CATEGORIES.PRODUCT]
        : [CATEGORIES.RAW_MATERIAL, CATEGORIES.PACKAGING, CATEGORIES.SUPPLIES];

    return categories.includes(item.category);
};

/**
 * Check if item should be shown under MSME category filters.
 * Legacy manufacturing categories map to supplies for MSME visibility.
 * @param {object} item - Item object
 * @returns {'product'|'supplies'|null}
 */
export const getMsmeCategoryView = (item) => {
    if (!item) return null;
    if (item.category === CATEGORIES.PRODUCT) {
        return CATEGORIES.PRODUCT;
    }
    return [
        CATEGORIES.RAW_MATERIAL,
        CATEGORIES.PACKAGING,
        CATEGORIES.SUPPLIES
    ].includes(item.category) ? CATEGORIES.SUPPLIES : null;
};

/**
 * Check if item can be added to suppliers
 * @param {object} item - Item object
 * @returns {boolean}
 */
export const canBeSupplierItem = (item, workflowModeOrOptions = DEFAULT_WORKFLOW_MODE) => {
    return isPurchasable(item, workflowModeOrOptions);
};

/**
 * Check if item can be a JO output (product to manufacture)
 * @param {object} item - Item object
 * @returns {boolean}
 */
export const canBeJobOrderOutput = (item) => {
    return item?.category === CATEGORIES.PRODUCT;
};

/**
 * Check if item can be a JO input (ingredient/component)
 * @param {object} item - Item object
 * @returns {boolean}
 */
export const canBeJobOrderInput = (item) => {
    if (!item) return false;

    // Products (both WIP and Finished) can be inputs
    if (item.category === CATEGORIES.PRODUCT) {
        return true;
    }

    // Raw materials and packaging can be inputs
    if ([CATEGORIES.RAW_MATERIAL, CATEGORIES.PACKAGING].includes(item.category)) {
        return true;
    }

    // Supplies cannot be inputs
    return false;
};

/**
 * Check if item can be used in Product Wizard as ingredient
 * @param {object} item - Item object
 * @returns {boolean}
 */
export const canBeProductIngredient = (item) => {
    if (!item) return false;
    return [
        CATEGORIES.RAW_MATERIAL,
        CATEGORIES.PRODUCT // Both WIP and Finished can be ingredients
    ].includes(item.category);
};

/**
 * Check if item can be used in Product Wizard as packaging
 * @param {object} item - Item object
 * @returns {boolean}
 */
export const canBeProductPackaging = (item) => {
    return item?.category === CATEGORIES.PACKAGING;
};

/**
 * Check if item can be dispatched via a Dispatch Order.
 * Only finished goods are dispatched to customers; raw materials, WIP, packaging,
 * and supplies are consumed internally (production) or purchased — never dispatched.
 * @param {object} item - Item object
 * @returns {boolean}
 */
export const canBeDispatched = (item) => {
    if (!item) return false;
    return item.category === CATEGORIES.PRODUCT && item.product_type === PRODUCT_TYPES.FINISHED_GOODS;
};

/**
 * Get category configuration for legacy compatibility
 * (Used in components that expect categoryConfig object)
 */
export const getCategoryConfig = (item) => {
    const effectiveCategory = getEffectiveCategory(item);
    const config = CATEGORY_DISPLAY_CONFIG[effectiveCategory];

    if (!config) {
        return {
            icon: Package,
            color: 'bg-slate-100 text-slate-700',
            label: 'Unknown'
        };
    }

    return config;
};

export default {
    CATEGORIES,
    PRODUCT_TYPES,
    CATEGORY_DISPLAY_CONFIG,
    getEffectiveCategory,
    getCategoryLabel,
    getCategoryIcon,
    getCategoryColor,
    getCategoryBadgeColor,
    isManufactured,
    isPurchasable,
    getMsmeCategoryView,
    canBeSupplierItem,
    canBeJobOrderOutput,
    canBeJobOrderInput,
    canBeProductIngredient,
    canBeProductPackaging,
    canBeDispatched,
    getCategoryConfig
};
