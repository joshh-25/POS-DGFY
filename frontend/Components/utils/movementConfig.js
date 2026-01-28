import {
    ArrowDownCircle,
    ArrowUpCircle,
    ArrowLeftRight,
    RotateCcw,
    AlertCircle,
    Settings2,
    Package
} from 'lucide-react';

/**
 * Configuration for stock movement types
 * Used across StockMovements page, RecentMovements dashboard widget, and modals
 */
export const movementConfig = {
    purchase_receipt: {
        icon: ArrowDownCircle,
        color: "text-emerald-600",
        bg: "bg-emerald-50 border-emerald-200",
        label: "Purchase Receipt",
        description: "Stock received from purchase order",
        isPositive: true
    },
    production_consumption: {
        icon: ArrowUpCircle,
        color: "text-red-500",
        bg: "bg-red-50 border-red-200",
        label: "Production Consumption",
        description: "Stock used in production/job orders",
        isPositive: false
    },
    transfer: {
        icon: ArrowLeftRight,
        color: "text-blue-500",
        bg: "bg-blue-50 border-blue-200",
        label: "Transfer",
        description: "Stock moved between locations",
        isPositive: null // neutral
    },
    return: {
        icon: RotateCcw,
        color: "text-blue-500",
        bg: "bg-blue-50 border-blue-200",
        label: "Return",
        description: "Stock returned to inventory",
        isPositive: true
    },
    calculated_loss: {
        icon: AlertCircle,
        color: "text-red-600",
        bg: "bg-red-50 border-red-200",
        label: "Calculated Loss",
        description: "Stock loss due to waste, spoilage, damage, or pilferage",
        isPositive: false
    },
    adjustment: {
        icon: Settings2,
        color: "text-purple-600",
        bg: "bg-purple-50 border-purple-200",
        label: "Adjustment",
        description: "Manual stock correction (increase)",
        isPositive: true
    },
    production_output: {
        icon: Package,
        color: "text-emerald-600",
        bg: "bg-emerald-50 border-emerald-200",
        label: "Production Output",
        description: "Finished goods from production/job orders",
        isPositive: true
    }
};

/**
 * Get movement config by type with fallback
 */
export const getMovementConfig = (type) => {
    return movementConfig[type] || movementConfig.transfer;
};

/**
 * Check if movement type adds to stock
 */
export const isPositiveMovement = (type) => {
    return ['purchase_receipt', 'return', 'adjustment', 'production_output'].includes(type);
};

/**
 * Get all movement types as array (for select options)
 */
export const getMovementTypes = () => {
    return Object.entries(movementConfig).map(([value, config]) => ({
        value,
        label: config.label,
        icon: config.icon,
        color: config.color
    }));
};

/**
 * Loss reasons for calculated_loss movements
 */
export const lossReasons = [
    { value: 'waste', label: 'Waste', description: 'Unusable material from processing' },
    { value: 'spoilage', label: 'Spoilage', description: 'Expired or deteriorated stock' },
    { value: 'damage', label: 'Damage', description: 'Physical damage to stock' },
    { value: 'pilferage', label: 'Pilferage', description: 'Missing stock (theft/loss)' }
];

/**
 * Default warehouse locations
 * TODO: Move to settings/API-driven configuration
 */
export const defaultLocations = [
    'Main Warehouse',
    'Production Floor',
    'Shipping Area',
    'Quality Control',
    'Cold Storage'
];
