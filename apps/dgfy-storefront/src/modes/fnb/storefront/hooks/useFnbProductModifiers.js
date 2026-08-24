import { useCallback } from 'react';

/** Keeps F&B modifier selection rules beside the F&B product-detail feature. */
export function useFnbProductModifiers({ setSelectedModifiers }) {
  const toggleFnbDetailModifier = useCallback((group, option) => {
    if (!group || !option) return;
    const groupId = group.modifier_group_id;
    const optionId = option.modifier_option_id;

    setSelectedModifiers((previous) => {
      const normalized = Array.isArray(previous) ? previous : [];
      const exists = normalized.some((entry) => (
        Number(entry.modifier_group_id) === Number(groupId)
        && Number(entry.modifier_option_id) === Number(optionId)
      ));
      const maxSelect = Math.max(0, Number(group.max_select || 0));
      if (exists) {
        return normalized.filter((entry) => !(Number(entry.modifier_group_id) === Number(groupId) && Number(entry.modifier_option_id) === Number(optionId)));
      }
      if (maxSelect === 1) {
        return [
          ...normalized.filter((entry) => Number(entry.modifier_group_id) !== Number(groupId)),
          { modifier_group_id: groupId, modifier_option_id: optionId, option_name: option.option_name, price_delta: Number(option.price_delta || 0), quantity: 1 }
        ];
      }
      const groupSelections = normalized.filter((entry) => Number(entry.modifier_group_id) === Number(groupId));
      if (maxSelect > 0 && groupSelections.length >= maxSelect) return normalized;
      return [
        ...normalized,
        { modifier_group_id: groupId, modifier_option_id: optionId, option_name: option.option_name, price_delta: Number(option.price_delta || 0), quantity: 1 }
      ];
    });
  }, [setSelectedModifiers]);

  const setFnbDetailModifierQuantity = useCallback((group, option, quantity) => {
    const normalizedQuantity = Math.min(99, Math.max(1, Number.parseInt(quantity || 1, 10) || 1));
    setSelectedModifiers((previous) => (Array.isArray(previous) ? previous : []).map((entry) => (
      Number(entry.modifier_group_id) === Number(group?.modifier_group_id)
      && Number(entry.modifier_option_id) === Number(option?.modifier_option_id)
        ? { ...entry, quantity: normalizedQuantity }
        : entry
    )));
  }, [setSelectedModifiers]);

  return { toggleFnbDetailModifier, setFnbDetailModifierQuantity };
}
