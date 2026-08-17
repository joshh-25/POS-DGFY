import React, { useMemo, useState } from 'react';
import { ChevronDown, ShoppingCart } from 'lucide-react';

import { PrimaryButton } from '../../../../shared/components/StorefrontActionPrimitives.jsx';
import { ServiceImage } from '../../ServiceImage.jsx';
import { SERVICES_BODY_FONT, SERVICES_DISPLAY_FONT } from '../../servicesTypography.js';
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
  servicesViewMode = 'grid',
  servicesDisplayFont = SERVICES_DISPLAY_FONT,
  servicesBodyFont = SERVICES_BODY_FONT,
  addActionLabel,
  unavailableLabel,
  missingImageLabel,
  isMobileViewport = false,
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
  const isMobileListView = isMobileViewport && servicesViewMode === 'list';
  const isMobileGridView = isMobileViewport && servicesViewMode === 'grid';
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

  const renderOptionGroup = (group, compact = false) => {
    const groupKey = String(group.group_id);
    const selectedIds = Array.isArray(optionSelection[groupKey]) ? optionSelection[groupKey] : [];
    if (group.selection_type === 'multi') {
      return (
        <fieldset key={groupKey} style={{ margin: 0, border: `1px solid ${servicesPrimaryBorder}`, borderRadius: compact ? 8 : 9, padding: compact ? '6px 8px' : '9px 11px', display: 'grid', gap: compact ? 4 : 7 }}>
          <legend style={{ padding: '0 4px', color: servicesPrimaryDark, fontSize: compact ? 11 : 12, fontWeight: 800 }}>
            {group.name}{group.is_required ? ' *' : ''}
          </legend>
          {group.options.map((option) => {
            const checked = selectedIds.includes(option.option_id);
            const reachedMaximum = !checked && selectedIds.length >= group.max_selections;
            return (
              <label key={option.option_id} style={{ display: 'flex', alignItems: 'center', gap: compact ? 6 : 8, color: '#334155', fontSize: compact ? 11 : 13, cursor: reachedMaximum ? 'not-allowed' : 'pointer' }}>
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
            style={{ width: '100%', minHeight: compact ? 38 : 36, boxSizing: 'border-box', appearance: 'none', WebkitAppearance: 'none', MozAppearance: 'none', border: `1px solid ${servicesPrimaryBorder}`, borderRadius: compact ? 8 : 6, background: '#ffffff', color: '#0f172a', padding: compact ? '0 30px 0 10px' : '0 36px 0 12px', font: 'inherit', fontFamily: servicesBodyFont, fontSize: compact ? 12 : 13, cursor: 'pointer' }}
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
          <ChevronDown size={compact ? 14 : 16} strokeWidth={2.5} aria-hidden="true" style={{ position: 'absolute', top: '50%', right: compact ? 9 : 11, transform: 'translateY(-50%)', color: '#0f172a', pointerEvents: 'none' }} />
        </div>
      </label>
    );
  };

  if (isMobileListView) {
    return (
      <article
        data-service-catalog-card="true"
        data-service-catalog-view="list"
        style={{
          minWidth: 0,
          width: 'calc(100% - 8px)',
          maxWidth: 'calc(100% - 8px)',
          margin: '0 auto',
          boxSizing: 'border-box',
          overflow: 'hidden',
          display: 'flex',
          flexDirection: 'row',
          gap: 12,
          alignItems: 'center',
          padding: 10,
          minHeight: 120,
          background: '#ffffff',
          border: `1px solid ${servicesPrimaryBorder}`,
          borderRadius: 20,
          boxShadow: '0 4px 16px rgba(15,23,42,0.04)',
          fontFamily: servicesBodyFont
        }}
      >
        <div style={{ width: 88, height: 88, borderRadius: 14, overflow: 'hidden', background: '#f8fafc', position: 'relative', flexShrink: 0 }}>
          <ServiceImage
            imageSources={imageSources}
            alt={title}
            sizes="88px"
            fallbackLabel={missingImageLabel}
            fallbackLabelStyle={{ fontSize: 10, lineHeight: 1.1 }}
            width={88}
            height={88}
            style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }}
          />
          <div style={{ position: 'absolute', inset: 0, background: 'linear-gradient(180deg, rgba(15,23,42,0) 42%, rgba(15,23,42,0.16) 100%)', pointerEvents: 'none' }} />
          <span style={{ position: 'absolute', right: 6, bottom: 6, minHeight: 24, display: 'inline-flex', alignItems: 'center', borderRadius: 999, background: servicesPrimary, color: '#ffffff', padding: '4px 7px', fontSize: 11, lineHeight: 1, fontWeight: 800, fontFamily: servicesBodyFont, whiteSpace: 'nowrap', boxShadow: `0 4px 12px ${servicesPrimaryShadow}` }}>
            {money(adjustedPrice)}
          </span>
        </div>

        <div style={{ flex: 1, minWidth: 0, alignSelf: 'stretch', display: 'flex', flexDirection: 'column', padding: '2px 0', overflow: 'hidden' }}>
          <div style={{ minWidth: 0, display: 'grid', gap: 4 }}>
            <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 8, minWidth: 0 }}>
              <h3 style={{ flex: 1, margin: 0, minWidth: 0, color: '#0f172a', fontSize: 16, fontWeight: 800, lineHeight: 1.15, letterSpacing: 0, fontFamily: servicesDisplayFont, display: '-webkit-box', WebkitLineClamp: 1, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>
                {title}
              </h3>
              {!available ? <span style={{ flexShrink: 0, color: servicesPrimaryDark, fontSize: 10, lineHeight: 1.1, fontWeight: 800, whiteSpace: 'nowrap' }}>{unavailableLabel}</span> : null}
            </div>
          </div>

          {description ? (
            <p style={{ minHeight: 34, margin: '5px 0 0', color: '#64748b', fontSize: 12, lineHeight: 1.4, display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden', fontFamily: servicesBodyFont }}>
              {description}
            </p>
          ) : null}

          <div style={{ display: 'flex', alignItems: 'flex-end', gap: 8, marginTop: 'auto', paddingTop: 4, minWidth: 0, width: '100%' }}>
            {optionGroups.length > 0 ? <div style={{ flex: 1, minWidth: 0, display: 'grid', gap: 6 }}>{optionGroups.map((group) => renderOptionGroup(group, true))}</div> : null}
            <button
              type="button"
              aria-label={`${available ? (addActionLabel || 'Add service') : (unavailableLabel || 'Unavailable')} ${title}`}
              disabled={!available || !optionSelectionValid}
              onClick={handleAdd}
              style={{ width: optionGroups.length > 0 ? 38 : '100%', minWidth: optionGroups.length > 0 ? 38 : 0, minHeight: 38, height: 38, flexShrink: 0, border: 'none', borderRadius: 12, padding: 0, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 7, background: !available || !optionSelectionValid ? '#e2e8f0' : servicesPrimary, color: '#ffffff', cursor: !available || !optionSelectionValid ? 'not-allowed' : 'pointer', fontFamily: servicesBodyFont, fontSize: 12, fontWeight: 800, whiteSpace: 'nowrap' }}
            >
              <ShoppingCart size={17} strokeWidth={2.25} />
            </button>
          </div>
        </div>
      </article>
    );
  }

  return (
    <article
      data-service-catalog-card="true"
      data-service-catalog-view={isMobileGridView ? 'grid' : 'desktop'}
      style={{
        minWidth: 0,
        overflow: 'hidden',
        display: 'flex',
        flexDirection: 'column',
        background: '#ffffff',
        border: `1px solid ${servicesPrimaryBorder}`,
        width: isMobileGridView ? 'calc(100% - 8px)' : undefined,
        maxWidth: isMobileGridView ? 'calc(100% - 8px)' : undefined,
        margin: isMobileGridView ? '0 auto' : undefined,
        borderRadius: isMobileGridView ? 20 : 8,
        boxShadow: '0 2px 4px rgba(15, 23, 42, 0.04)',
        fontFamily: servicesBodyFont
      }}
    >
      <div style={{ width: '100%', height: isMobileGridView ? 140 : undefined, aspectRatio: isMobileGridView ? undefined : '1.67 / 1', background: '#f8fafc', position: 'relative', overflow: 'hidden' }}>
        <ServiceImage
          imageSources={imageSources}
          alt={title}
          sizes={isMobileGridView ? 'calc(100vw - 40px)' : '(max-width: 720px) 100vw, (max-width: 1200px) 50vw, 25vw'}
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

      <div style={{ minWidth: 0, minHeight: 190, boxSizing: 'border-box', flex: 1, padding: isMobileGridView ? 12 : 16, display: 'flex', flexDirection: 'column', gap: 8, fontFamily: servicesBodyFont }}>
        <h3 style={{ margin: 0, color: '#0f172a', fontSize: 16, fontWeight: 800, lineHeight: '20px', letterSpacing: 0, fontFamily: servicesDisplayFont }}>
          {title}
        </h3>
        {description ? (
          <p style={{ margin: 0, minHeight: 35, color: '#64748b', fontSize: 13, lineHeight: 1.35, display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden', fontFamily: servicesBodyFont }}>
            {description}
          </p>
        ) : null}
        {optionGroups.map((group) => renderOptionGroup(group))}
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
