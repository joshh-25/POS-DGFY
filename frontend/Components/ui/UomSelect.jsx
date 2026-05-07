import React from 'react';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from './select';
import {
    filterUomOptions,
    getGroupedUomOptions,
    getUomLabel,
    groupUomOptions,
    normalizeUom,
    isValidUom
} from '../../src/utils/uomConverter';

/**
 * UomSelect - A specialized dropdown for selecting Unit of Measure
 * 
 * Displays UOM options grouped by category (Weight, Volume, Count)
 * with proper labels and standardized values.
 * 
 * @param {Object} props
 * @param {string} props.value - Current UOM value
 * @param {function} props.onValueChange - Callback when value changes
 * @param {string} props.placeholder - Placeholder text
 * @param {string} props.className - Additional CSS classes
 * @param {boolean} props.showGroups - Whether to show group headers (default: true)
 * @param {boolean} props.disabled - Whether the select is disabled
 */
export function UomSelect({
    value,
    onValueChange,
    placeholder = "Select unit...",
    className,
    showGroups = true,
    disabled = false,
    allowedGroups = [],
    allowedUnits = [],
    ...props
}) {
    const filteredOptions = filterUomOptions({ allowedGroups, allowedUnits });
    const normalizedValue = normalizeUom(value);
    const hasFilter = (allowedGroups?.length || 0) > 0 || (allowedUnits?.length || 0) > 0;
    const hasCurrentOption = filteredOptions.some((option) => option.value === normalizedValue);
    const options = hasFilter
        ? [
            ...filteredOptions,
            ...(normalizedValue && !hasCurrentOption ? [{
                value: normalizedValue,
                label: `Legacy/current value: ${getUomLabel(normalizedValue)}`,
                group: 'Legacy',
                groupKey: 'legacy'
            }] : [])
        ]
        : filteredOptions;
    const groupedOptions = hasFilter ? groupUomOptions(options) : getGroupedUomOptions();

    // Get display label for current value
    const displayLabel = value ? getUomLabel(normalizedValue) : null;

    const handleChange = (newValue) => {
        if (onValueChange) {
            onValueChange(newValue);
        }
    };

    return (
        <Select value={normalizedValue || ''} onValueChange={handleChange} {...props}>
            <SelectTrigger className={className} disabled={disabled}>
                <SelectValue placeholder={placeholder}>
                    {displayLabel}
                </SelectValue>
            </SelectTrigger>
            <SelectContent className="max-h-[300px] overflow-y-auto">
                {showGroups ? (
                    // Grouped display with headers
                    Object.entries(groupedOptions).map(([groupLabel, options]) => (
                        <div key={groupLabel}>
                            {/* Group Header */}
                            <div className="px-2 py-1.5 text-xs font-semibold text-slate-500 uppercase tracking-wider bg-slate-50 sticky top-0">
                                {groupLabel}
                            </div>
                            {/* Group Options */}
                            {options.map((option) => (
                                <SelectItem key={option.value} value={option.value}>
                                    {option.label}
                                </SelectItem>
                            ))}
                        </div>
                    ))
                ) : (
                    // Flat display without groups
                    Object.values(groupedOptions).flat().map((option) => (
                        <SelectItem key={option.value} value={option.value}>
                            {option.label}
                        </SelectItem>
                    ))
                )}
            </SelectContent>
        </Select>
    );
}

/**
 * UomDisplay - Simple display component for showing a UOM with its full label
 * 
 * @param {Object} props
 * @param {string} props.uom - The UOM abbreviation to display
 * @param {boolean} props.showFull - Show full label (default) or just abbreviation
 * @param {string} props.className - Additional CSS classes
 */
export function UomDisplay({ uom, showFull = true, className }) {
    if (!uom) return null;

    const normalized = normalizeUom(uom);
    const label = showFull ? getUomLabel(normalized) : normalized;
    const isKnown = isValidUom(uom);

    return (
        <span
            className={`${className || ''} ${!isKnown ? 'text-amber-600' : ''}`}
            title={!isKnown ? 'Unknown UOM - no conversion available' : getUomLabel(normalized)}
        >
            {label}
        </span>
    );
}

export default UomSelect;
