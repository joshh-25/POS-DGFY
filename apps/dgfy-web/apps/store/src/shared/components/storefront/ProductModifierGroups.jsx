import { ChefHat, ChevronDown, Droplet, Egg, Flame, Info, Sliders, Utensils } from 'lucide-react';

const formatGroupName = (name) => {
  const formatted = String(name || '').trim();
  const lower = formatted.toLowerCase();
  if (lower === 'breakfast_add_ons' || lower === 'breakfast_add-ons') return 'Breakfast Add-ons';
  if (lower === 'sauce_pairing' || lower === 'sauce_pairings') return 'Sauce Pairing';
  return formatted.split(/[_\s]+/).filter(Boolean).map((part) => part.charAt(0).toUpperCase() + part.slice(1).toLowerCase()).join(' ');
};

const getModifierIcon = (name) => {
  const normalized = String(name || '').toLowerCase();
  if (normalized.includes('egg')) return Egg;
  if (normalized.includes('bacon') || normalized.includes('pork') || normalized.includes('meat') || normalized.includes('beef') || normalized.includes('chicken') || normalized.includes('danggit') || normalized.includes('fish')) return ChefHat;
  if (normalized.includes('spicy') || normalized.includes('hot') || normalized.includes('chili') || normalized.includes('pepper')) return Flame;
  if (normalized.includes('mayo') || normalized.includes('sauce') || normalized.includes('dip') || normalized.includes('syrup') || normalized.includes('honey') || normalized.includes('gravy')) return Droplet;
  if (normalized.includes('rice')) return Utensils;
  return null;
};

export const formatModifierPriceDelta = (value, formatMoney) => {
  const amount = Number(value || 0) || 0;
  const sign = amount < 0 ? '-' : amount > 0 ? '+' : '';
  return `${sign}${formatMoney(Math.abs(amount)).replace('PHP ', '')}`;
};

/**
 * ProductModifierGroups — the customer-facing add-on picker.
 *
 * Lives in `shared/` rather than `modes/fnb/` because nothing about it is
 * restaurant-specific: it takes modifier groups as data and renders them. The
 * backing tables are generic too (`fnb_item_modifier_groups.item_id` is an FK
 * onto `items`), and both checkout resolvers read those rows without any
 * workflow-mode check. Its previous location under `modes/fnb/` was the last
 * structural reason add-ons looked F&B-only.
 *
 * Reaching it from a retail or services product page still needs those modes
 * to have a product-detail route and a card that navigates to it — neither
 * exists today (retail renders `ServiceProductCard`, which has no
 * `onViewDetails`). That wiring is storefront UX work and belongs with the
 * mixed-basket phase, not with this de-gating pass.
 */
export const ProductModifierGroups = ({
  expandedGroups,
  formatMoney,
  modifierCounts,
  modifierGroups,
  onToggleGroup,
  onToggleModifier,
  onModifierQuantityChange,
  selectedModifiers,
  spacing
}) => {
  if (!Array.isArray(modifierGroups) || modifierGroups.length === 0) return null;

  return (
    <div style={{ display: 'grid', gap: 16, borderTop: '1px solid rgba(226,232,240,0.6)', paddingTop: spacing(2) }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
        <div style={{ display: 'inline-flex', alignItems: 'center', gap: 8, fontSize: 14, fontWeight: 800, color: '#0f172a' }}><Sliders size={16} color="#475569" />Customize Order</div>
        <div style={{ display: 'inline-flex', alignItems: 'center', gap: 4, fontSize: 12, color: '#64748b', fontWeight: 600 }}><span style={{ borderRadius: 999, padding: '2px 8px', background: '#f1f5f9', color: '#475569', border: '1px solid #cbd5e1', fontWeight: 800 }}>Choose options</span><Info size={16} /></div>
      </div>
      <div style={{ display: 'grid', gap: 12 }}>
        {modifierGroups.filter((group) => !group.parent_modifier_option_id || (selectedModifiers || []).some((entry) => Number(entry.modifier_option_id) === Number(group.parent_modifier_option_id))).map((group) => {
          const isExpanded = !!expandedGroups[group.modifier_group_id];
          const selectedCount = Number(modifierCounts?.[group.modifier_group_id] || 0);
          const isSingleSelect = Number(group.max_select || 0) === 1;
          const required = group.required === true || Number(group.min_select || 0) > 0;
          const minimum = required ? Math.max(1, Number(group.min_select || 0)) : Number(group.min_select || 0);
          const maximum = Math.max(0, Number(group.max_select || 0));
          const rangeLabel = isSingleSelect ? 'Pick one' : `${minimum > 0 ? `Pick ${minimum}-${maximum || group.options.length}` : `Up to ${maximum || group.options.length}`}`;
          return (
            <div key={`modifier-group-${group.modifier_group_id}`} style={{ border: '1px solid rgba(226, 232, 240, 0.8)', borderRadius: 16, background: '#f8fafc', overflow: 'hidden' }}>
              <button type="button" onClick={() => onToggleGroup(group.modifier_group_id)} style={{ width: '100%', background: '#fff', border: 'none', padding: '14px 16px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, cursor: 'pointer', textAlign: 'left' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <span style={{ fontSize: 14, fontWeight: 800, color: '#334155' }}>{formatGroupName(group.group_name)}</span>
                  <span style={{ fontSize: 10, fontWeight: 700, color: required ? '#166534' : '#c2410c', background: required ? '#dcfce7' : '#ffedd5', border: `1px solid ${required ? '#86efac' : '#fed7aa'}`, borderRadius: 999, padding: '2px 8px' }}>{group.group_kind === 'combo_choice' ? 'Combo choice' : (required ? 'Required' : 'Optional')}</span>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <span style={{ fontSize: 12, fontWeight: 700, color: '#475569' }}>{selectedCount > 0 ? `${selectedCount} selected` : rangeLabel}</span>
                  <ChevronDown size={16} color="#64748b" style={{ transform: isExpanded ? 'rotate(180deg)' : 'none', transition: 'transform 160ms ease' }} />
                </div>
              </button>
              {isExpanded && (
                <div style={{ padding: '8px 16px 16px', display: 'grid', gap: 4, background: '#fff', borderTop: '1px solid rgba(226, 232, 240, 0.6)' }}>
                  {group.options.map((option) => {
                    const selection = (selectedModifiers || []).find((entry) => Number(entry.modifier_group_id) === Number(group.modifier_group_id) && Number(entry.modifier_option_id) === Number(option.modifier_option_id));
                    const selected = Boolean(selection);
                    const disabled = !selected && !isSingleSelect && maximum > 0 && selectedCount >= maximum;
                    const OptionIcon = getModifierIcon(option.option_name);
                    return (
                      <label key={`option-${group.modifier_group_id}-${option.modifier_option_id}`} style={{ display: 'grid', gridTemplateColumns: OptionIcon ? 'auto auto 1fr auto' : 'auto 1fr auto', gap: 12, alignItems: 'center', minHeight: 40, padding: '4px 0', cursor: disabled ? 'not-allowed' : 'pointer', transition: 'all 120ms ease', opacity: disabled ? 0.45 : (selected ? 1 : 0.85) }}>
                        <input type={isSingleSelect ? 'radio' : 'checkbox'} name={`modifier-group-${group.modifier_group_id}`} checked={selected} disabled={disabled} onChange={() => onToggleModifier(group, option)} style={{ width: 18, height: 18, accentColor: '#f97316', cursor: disabled ? 'not-allowed' : 'pointer' }} />
                        {OptionIcon && <span style={{ width: 24, height: 24, borderRadius: '50%', background: selected ? '#fff' : '#f8fafc', border: '1px solid rgba(226, 232, 240, 0.8)', display: 'grid', placeItems: 'center', color: '#f97316' }}><OptionIcon size={12} /></span>}
                        <span style={{ fontSize: 14, fontWeight: 600, color: selected ? '#0f172a' : '#475569' }}>{option.option_name}</span>
                        <span style={{ fontSize: 12, fontWeight: 700, color: selected ? '#ea580c' : '#64748b', whiteSpace: 'nowrap' }}>{formatModifierPriceDelta(Number(option.price_delta || 0) * Number(selection?.quantity || 1), formatMoney)}</span>
                        {selected && <input aria-label={`${option.option_name} quantity`} type="number" min="1" max="99" value={selection.quantity || 1} onClick={(event) => event.stopPropagation()} onChange={(event) => onModifierQuantityChange?.(group, option, event.target.value)} style={{ width: 58, minHeight: 34, border: '1px solid #cbd5e1', borderRadius: 8, padding: '4px 8px', fontWeight: 700 }} />}
                      </label>
                    );
                  })}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
};
