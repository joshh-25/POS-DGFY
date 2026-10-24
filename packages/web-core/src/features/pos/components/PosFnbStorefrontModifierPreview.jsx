import React, { useMemo, useState } from 'react';
import { ProductModifierGroups } from '@/src/features/fnb/components/ProductModifierGroups.jsx';

const MONEY_FORMATTER = new Intl.NumberFormat('en-PH', {
  useGrouping: true,
  minimumFractionDigits: 2,
  maximumFractionDigits: 2
});

const formatMoney = (value) => {
  const amount = Number(value || 0);
  return `₱${MONEY_FORMATTER.format(Number.isFinite(amount) ? amount : 0)}`;
};

const availableAtLocation = (entity, locationId) => {
  if (locationId == null) return true;
  const availability = entity?.location_availability || entity?.locationAvailability;
  if (!Array.isArray(availability) || availability.length === 0) return true;
  const row = availability.find((entry) => Number(entry.location_id) === Number(locationId));
  return row?.is_available !== false;
};

const buildStorefrontGroups = (sourceGroups = [], locationId) => sourceGroups
  .filter((group) => group && group.is_active !== false && group.visible_in_storefront !== false && availableAtLocation(group, locationId))
  .map((group, groupIndex) => {
    const options = (Array.isArray(group.options) ? group.options : [])
      .filter((option) => option
        && option.is_active !== false
        && option.visible_in_storefront !== false
        && option.is_sold_out !== true
        && availableAtLocation(option, locationId))
      .map((option, optionIndex) => ({
        modifier_option_id: option.modifier_option_id ?? option.option_id ?? option.id ?? `preview-option-${groupIndex}-${optionIndex}`,
        option_name: String(option.option_name || option.name || option.label || '').trim(),
        price_delta: Number(option.price_delta ?? option.price ?? 0) || 0,
        is_default: option.is_default === true
      }))
      .filter((option) => option.option_name);

    if (!options.length) return null;
    const minSelect = Number(group.min_select || 0) || 0;
    const maxSelect = Math.max(1, Number(group.max_select ?? options.length) || options.length);
    return {
      modifier_group_id: group.modifier_group_id ?? group.group_id ?? `preview-group-${groupIndex}`,
      group_name: String(group.display_name || group.group_name || group.name || group.label || `Option group ${groupIndex + 1}`).trim(),
      group_kind: group.group_kind === 'combo_choice' ? 'combo_choice' : 'modifier',
      parent_modifier_option_id: group.parent_modifier_option_id ? Number(group.parent_modifier_option_id) : null,
      min_select: minSelect,
      max_select: maxSelect,
      required: group.required === true || minSelect > 0,
      options
    };
  })
  .filter(Boolean);

const buildDefaultSelections = (groups) => groups.flatMap((group) => (
  group.options
    .filter((option) => option.is_default === true)
    .slice(0, group.max_select)
    .map((option) => ({
      modifier_group_id: group.modifier_group_id,
      modifier_option_id: option.modifier_option_id,
      option_name: option.option_name,
      price_delta: option.price_delta,
      quantity: 1
    }))
));

export default function PosFnbStorefrontModifierPreview({ groups = [], operatingLocationId = null }) {
  const modifierGroups = useMemo(() => buildStorefrontGroups(groups, operatingLocationId), [groups, operatingLocationId]);
  const [expandedGroups, setExpandedGroups] = useState(() => (
    modifierGroups[0] ? { [modifierGroups[0].modifier_group_id]: true } : {}
  ));
  const [selectedModifiers, setSelectedModifiers] = useState(() => buildDefaultSelections(modifierGroups));
  const modifierCounts = useMemo(() => selectedModifiers.reduce((counts, selection) => {
    const groupId = String(selection.modifier_group_id);
    counts[groupId] = (counts[groupId] || 0) + 1;
    return counts;
  }, {}), [selectedModifiers]);

  const toggleGroup = (groupId) => setExpandedGroups((current) => ({ ...current, [groupId]: !current[groupId] }));
  const toggleModifier = (group, option) => {
    setSelectedModifiers((current) => {
      const exists = current.some((entry) => Number(entry.modifier_group_id) === Number(group.modifier_group_id)
        && Number(entry.modifier_option_id) === Number(option.modifier_option_id));
      if (exists) {
        return current.filter((entry) => !(Number(entry.modifier_group_id) === Number(group.modifier_group_id)
          && Number(entry.modifier_option_id) === Number(option.modifier_option_id)));
      }
      const maxSelect = Math.max(0, Number(group.max_select || 0));
      const selection = {
        modifier_group_id: group.modifier_group_id,
        modifier_option_id: option.modifier_option_id,
        option_name: option.option_name,
        price_delta: Number(option.price_delta || 0),
        quantity: 1
      };
      if (maxSelect === 1) {
        return [...current.filter((entry) => Number(entry.modifier_group_id) !== Number(group.modifier_group_id)), selection];
      }
      const groupSelections = current.filter((entry) => Number(entry.modifier_group_id) === Number(group.modifier_group_id));
      if (maxSelect > 0 && groupSelections.length >= maxSelect) return current;
      return [...current, selection];
    });
  };
  const setModifierQuantity = (group, option, quantity) => {
    const normalizedQuantity = Math.min(99, Math.max(1, Number.parseInt(quantity || 1, 10) || 1));
    setSelectedModifiers((current) => current.map((entry) => (
      Number(entry.modifier_group_id) === Number(group.modifier_group_id)
      && Number(entry.modifier_option_id) === Number(option.modifier_option_id)
        ? { ...entry, quantity: normalizedQuantity }
        : entry
    )));
  };

  if (!modifierGroups.length) {
    return <p className="mt-3 rounded-lg border border-dashed border-slate-300 bg-white px-3 py-3 text-xs text-slate-500">No storefront-visible options are currently available for this item.</p>;
  }

  return (
    <div data-testid="pos-fnb-storefront-modifier-preview" className="mt-3 rounded-lg bg-white px-3 py-2 sm:px-4">
      <ProductModifierGroups
        expandedGroups={expandedGroups}
        formatMoney={formatMoney}
        modifierCounts={modifierCounts}
        modifierGroups={modifierGroups}
        onToggleGroup={toggleGroup}
        onToggleModifier={toggleModifier}
        onModifierQuantityChange={setModifierQuantity}
        selectedModifiers={selectedModifiers}
        spacing={(value) => value * 8}
      />
      <p className="mt-2 text-[10px] leading-4 text-slate-500">Preview only. Option selections here are not saved or added to an order.</p>
    </div>
  );
}
