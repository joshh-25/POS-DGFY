import React from 'react';
import { Check, Sparkles } from 'lucide-react';
import { FNB_CATEGORY_ICON_MAP } from '../../../modes/fnb/storefront/model/fnbStorefrontPresentation.js';

export function StorefrontCategoryFilterBar({
  filteredFnbViewModel,
  isMobileViewport,
  modeAdapter,
  onCategoryChange,
  resolvedSection
}) {
  const sections = Array.isArray(filteredFnbViewModel?.menuSections)
    ? filteredFnbViewModel.menuSections
    : [];
  const allItems = Array.isArray(filteredFnbViewModel?.menuItems)
    ? filteredFnbViewModel.menuItems
    : [];
  const theme = modeAdapter?.heroTheme || {};
  const accent = theme.accent || '#ea580c';
  const accentSoft = theme.accentSoft || '#fff7ed';
  const textPrimary = theme.textPrimary || '#0f172a';
  const textMuted = theme.textMuted || '#64748b';
  const options = [
    {
      key: '',
      label: modeAdapter?.catalogCategoryAllLabel || 'All items',
      count: allItems.length,
      iconToken: modeAdapter?.catalogCategoryIconToken || 'menu'
    },
    ...sections.map((section) => ({
      key: section.sectionIdentity,
      label: section.sectionLabel,
      count: Array.isArray(section.items) ? section.items.length : 0,
      iconToken: section.visualMeta?.iconToken || 'menu'
    }))
  ];
  const activeKey = resolvedSection || '';

  return (
    <section
      aria-label="Menu categories"
      data-storefront-category-filters="true"
      style={{
        display: 'grid',
        gap: 12,
        maxWidth: 1320,
        width: '100%',
        margin: '0 auto',
        padding: isMobileViewport ? '0 16px' : '0 24px',
        boxSizing: 'border-box'
      }}
    >
      <div style={{ display: 'grid', gap: 3 }}>
        <div style={{ color: accent, fontSize: 11, fontWeight: 900, letterSpacing: '0.1em', textTransform: 'uppercase' }}>
          Browse categories
        </div>
        <div style={{ color: textMuted, fontSize: 13 }}>
          Choose a category to see its available products.
        </div>
      </div>
      <div
        className="no-scrollbar"
        style={{
          display: 'flex',
          gap: 10,
          overflowX: isMobileViewport ? 'auto' : 'visible',
          overflowY: 'hidden',
          flexWrap: isMobileViewport ? 'nowrap' : 'wrap',
          paddingBottom: 2
        }}
      >
        {options.map((option) => {
          const isActive = option.key === activeKey;
          const OptionIcon = FNB_CATEGORY_ICON_MAP[option.iconToken] || Sparkles;
          return (
            <button
              key={option.key || 'all'}
              type="button"
              aria-pressed={isActive}
              aria-label={`${option.label}, ${option.count} ${option.count === 1 ? 'item' : 'items'}`}
              onClick={() => onCategoryChange(option.key)}
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: 8,
                flex: isMobileViewport ? '0 0 auto' : '0 1 auto',
                minHeight: 42,
                borderRadius: 999,
                border: `1px solid ${isActive ? accent : '#e2e8f0'}`,
                background: isActive ? accent : '#fff',
                color: isActive ? '#fff' : textPrimary,
                padding: '8px 14px',
                cursor: 'pointer',
                boxShadow: isActive ? `0 8px 18px ${accentSoft}99` : '0 3px 10px rgba(15,23,42,0.04)',
                whiteSpace: 'nowrap'
              }}
            >
              <OptionIcon size={16} aria-hidden="true" />
              <span style={{ fontSize: 13, fontWeight: 800 }}>{option.label}</span>
              <span style={{ display: 'inline-flex', alignItems: 'center', gap: 3, opacity: isActive ? 0.88 : 0.65, fontSize: 11, fontWeight: 800 }}>
                {option.count}
                {isActive ? <Check size={13} strokeWidth={3} aria-hidden="true" /> : null}
              </span>
            </button>
          );
        })}
      </div>
    </section>
  );
}
