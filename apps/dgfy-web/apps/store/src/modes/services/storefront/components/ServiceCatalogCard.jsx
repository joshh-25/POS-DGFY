import React, { useMemo, useState } from 'react';
import { ChevronDown, ShoppingCart } from 'lucide-react';

import { PrimaryButton } from '../../../../shared/components/StorefrontActionPrimitives.jsx';
import { ServiceImage } from '../../ServiceImage.jsx';
import {
  buildDefaultServiceOptionSelection,
  getServiceOptionAdjustedPrice,
  isServiceOptionSelectionValid,
  normalizeServiceOptionGroups,
  resolveSelectedServiceOptions
} from '../model/serviceOptionSelection.js';

export function ServiceCatalogCard({
  item,
  imageSources,
  available,
  money,
  servicesPrimary,
  servicesPrimaryDark,
  servicesPrimarySoft,
  servicesPrimaryBorder,
  servicesPrimaryShadow,
  servicesDisplayFont = "'Lexend', 'Segoe UI', Arial, sans-serif",
  servicesBodyFont = "'Source Sans 3', 'Segoe UI', sans-serif",
  addActionLabel,
  unavailableLabel,
  missingImageLabel,
  onAdd
}) {
  const title = String(item?.variantName || item?.name || '').trim();
  const categoryLabel = String(
    item?.categoryMeta?.label
      || item?.folder_name
      || item?.service_detail?.service_category
      || item?.category
      || ''
  ).trim();
  const description = String(item?.description || item?.categoryMeta?.description || '').trim();
  const optionGroups = useMemo(
    () => normalizeServiceOptionGroups(item),
    [item]
  );
  const [optionSelection, setOptionSelection] = useState(
    () => buildDefaultServiceOptionSelection(optionGroups)
  );

  const selectedOptions = useMemo(
    () => resolveSelectedServiceOptions(optionGroups, optionSelection),
    [optionGroups, optionSelection]
  );
  const optionSelectionValid = isServiceOptionSelectionValid(optionGroups, optionSelection);
  const adjustedPrice = getServiceOptionAdjustedPrice(item?.default_sale_price, selectedOptions);
  const formatAdjustment = (centavos) => {
    const value = Number(centavos || 0) / 100;
    if (!value) return '';
    return ` (${value > 0 ? '+' : '-'}${money(Math.abs(value))})`;
  };
  const handleAdd = (event) => {
    if (!available || !optionSelectionValid) return;
    onAdd(event, {
      selected_option_ids: selectedOptions.map((option) => option.option_id),
      selected_options: selectedOptions,
      service_option_groups: optionGroups,
      unit_price: adjustedPrice
    });
  };

  return (
    <article
      data-service-catalog-card="true"
      style={{
        minWidth: 0,
        overflow: 'hidden',
        display: 'flex',
        flexDirection: 'column',
        background: '#ffffff',
        border: `1px solid ${servicesPrimaryBorder}`,
        borderRadius: 8,
        boxShadow: '0 2px 4px rgba(15, 23, 42, 0.04)',
        fontFamily: servicesBodyFont
      }}
    >
      <div style={{ width: '100%', aspectRatio: '1.67 / 1', background: '#f8fafc', position: 'relative', overflow: 'hidden' }}>
        <ServiceImage
          imageSources={imageSources}
          alt={title}
          sizes="(max-width: 720px) 100vw, (max-width: 1200px) 50vw, 25vw"
          fallbackLabel={missingImageLabel}
          width={480}
          height={300}
          style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }}
        />

        <div style={{ position: 'absolute', left: 10, right: 10, bottom: 10, display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', gap: 10 }}>
          {categoryLabel ? (
            <span style={{ maxWidth: '70%', minHeight: 24, display: 'inline-flex', alignItems: 'center', borderRadius: 6, background: 'rgba(255,255,255,0.92)', color: servicesPrimaryDark, padding: '3px 9px', fontSize: 11, fontWeight: 800, fontFamily: servicesBodyFont, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {categoryLabel}
            </span>
          ) : <span />}
          <span style={{ minHeight: 30, display: 'inline-flex', alignItems: 'center', borderRadius: 6, background: servicesPrimary, color: '#ffffff', padding: '4px 10px', fontSize: 13.5, fontWeight: 800, fontFamily: servicesBodyFont, whiteSpace: 'nowrap' }}>
            {money(adjustedPrice)}
          </span>
        </div>

        {!available ? (
          <span style={{ position: 'absolute', top: 12, right: 12, minHeight: 30, display: 'inline-flex', alignItems: 'center', borderRadius: 999, background: servicesPrimarySoft, color: servicesPrimaryDark, border: `1px solid ${servicesPrimaryBorder}`, padding: '0 10px', fontSize: 11, fontWeight: 800 }}>
            {unavailableLabel}
          </span>
        ) : null}
      </div>

      <div style={{ minWidth: 0, minHeight: 190, boxSizing: 'border-box', flex: 1, padding: 16, display: 'flex', flexDirection: 'column', gap: 8, fontFamily: servicesBodyFont }}>
        <h3 style={{ margin: 0, color: '#0f172a', fontSize: 16, fontWeight: 800, lineHeight: '20px', letterSpacing: 0, fontFamily: servicesDisplayFont }}>
          {title}
        </h3>
        {description ? (
          <p style={{ margin: 0, minHeight: 35, color: '#64748b', fontSize: 13, lineHeight: 1.35, display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden', fontFamily: servicesBodyFont }}>
            {description}
          </p>
        ) : null}
        {optionGroups.map((group) => {
          const groupKey = String(group.group_id);
          const selectedIds = Array.isArray(optionSelection[groupKey]) ? optionSelection[groupKey] : [];
          if (group.selection_type === 'multi') {
            return (
              <fieldset key={groupKey} style={{ margin: 0, border: `1px solid ${servicesPrimaryBorder}`, borderRadius: 9, padding: '9px 11px', display: 'grid', gap: 7 }}>
                <legend style={{ padding: '0 4px', color: servicesPrimaryDark, fontSize: 12, fontWeight: 800 }}>
                  {group.name}{group.is_required ? ' *' : ''}
                </legend>
                {group.options.map((option) => {
                  const checked = selectedIds.includes(option.option_id);
                  const reachedMaximum = !checked && selectedIds.length >= group.max_selections;
                  return (
                    <label key={option.option_id} style={{ display: 'flex', alignItems: 'center', gap: 8, color: '#334155', fontSize: 13, cursor: reachedMaximum ? 'not-allowed' : 'pointer' }}>
                      <input
                        type="checkbox"
                        checked={checked}
                        disabled={reachedMaximum}
                        onChange={() => setOptionSelection((previous) => ({
                          ...previous,
                          [groupKey]: checked
                            ? selectedIds.filter((optionId) => optionId !== option.option_id)
                            : [...selectedIds, option.option_id]
                        }))}
                      />
                      <span>{option.name}{formatAdjustment(option.price_adjustment_centavos)}</span>
                    </label>
                  );
                })}
              </fieldset>
            );
          }

          return (
            <label key={groupKey} style={{ display: 'block', position: 'relative' }}>
              <span style={{ position: 'absolute', width: 1, height: 1, padding: 0, margin: -1, overflow: 'hidden', clip: 'rect(0, 0, 0, 0)', whiteSpace: 'nowrap', border: 0 }}>
                {group.name}{group.is_required ? ' required' : ''}
              </span>
              <div style={{ position: 'relative' }}>
                <select
                  aria-label={group.name}
                  value={selectedIds[0] || ''}
                  onChange={(event) => setOptionSelection((previous) => ({
                    ...previous,
                    [groupKey]: event.target.value ? [Number(event.target.value)] : []
                  }))}
                  style={{ width: '100%', minHeight: 36, boxSizing: 'border-box', appearance: 'none', WebkitAppearance: 'none', MozAppearance: 'none', border: `1px solid ${servicesPrimaryBorder}`, borderRadius: 6, background: '#ffffff', color: '#0f172a', padding: '0 36px 0 12px', font: 'inherit', fontFamily: servicesBodyFont, fontSize: 13, cursor: 'pointer' }}
                >
                  {!group.is_required && group.min_selections === 0 && group.group_type !== 'variation' ? (
                    <option value="">No {group.name.toLowerCase()}</option>
                  ) : null}
                  {group.options.map((option) => (
                    <option key={option.option_id} value={option.option_id}>
                      {option.name}{formatAdjustment(option.price_adjustment_centavos)}
                    </option>
                  ))}
                </select>
                <ChevronDown size={16} strokeWidth={2.5} aria-hidden="true" style={{ position: 'absolute', top: '50%', right: 11, transform: 'translateY(-50%)', color: '#0f172a', pointerEvents: 'none' }} />
              </div>
            </label>
          );
        })}
        <PrimaryButton
          accentColor={servicesPrimary}
          accentDarkColor={servicesPrimaryDark}
          shadowColor={servicesPrimaryShadow}
          disabled={!available || !optionSelectionValid}
          onClick={handleAdd}
          style={{ width: '100%', minHeight: 44, marginTop: 'auto', borderRadius: 6, padding: '0 16px', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 8, fontFamily: servicesBodyFont, fontSize: 13.5, fontWeight: 700, background: servicesPrimary, boxShadow: 'none' }}
        >
          <ShoppingCart size={18} strokeWidth={2.25} />
          {available ? (optionSelectionValid ? addActionLabel : 'Select required options') : unavailableLabel}
        </PrimaryButton>
      </div>
    </article>
  );
}
