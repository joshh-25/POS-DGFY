import React, { useState } from 'react';
import { Box, ChevronDown, Filter, LayoutGrid, List, Search, Sparkles, X } from 'lucide-react';

import { StorefrontDropdown } from '../../../../features/shared-storefront/components/StorefrontDropdown.jsx';
import { VoucherCodePanel } from '../../../../shared/components/storefront/VoucherCodePanel.jsx';
import { SIMPLE_CATEGORY_ICON_MAP } from '../model/simpleCategoryIconMap.jsx';

const SORT_OPTIONS = [
  { value: 'name_asc', label: 'All Prices' },
  { value: 'price_asc', label: 'Price: Low to High', mobileLabel: 'Low to High' },
  { value: 'price_desc', label: 'Price: High to Low', mobileLabel: 'High to Low' },
];

// RF-4 (PR #1583 review): `key` is the stable `sectionIdentity` (folder_id-based), never the
// normalized `sectionKey` display text -- Simple mode consumes the same F&B view model
// (`getFoodBeverageStorefrontViewModel`) as StorefrontCatalogToolbar.jsx, so it has the identical
// exposure: two distinct folders can share a `sectionKey` but never a `sectionIdentity`. `label`
// stays name-derived, display only.
function buildCategoryOptions(viewModel) {
  const sections = Array.isArray(viewModel?.menuSections) ? viewModel.menuSections : [];
  return [
    { key: '', label: 'All', count: viewModel?.menuItems?.length || 0, iconToken: 'menu' },
    ...sections.map((section) => ({
      key: section.sectionIdentity,
      label: section.sectionLabel,
      count: section.items?.length || 0,
      iconToken: section.visualMeta?.iconToken || 'menu',
    })),
  ];
}

export function SimpleCatalogToolbar({
  catalogSearch,
  checkoutVoucherCode,
  setCheckoutVoucherCode,
  handleVoucherCardApply,
  categoryDropdownRef,
  filteredCatalogViewModel,
  isCategoryDropdownOpen,
  isMobileViewport,
  modeAdapter,
  resolvedSection,
  sortOption,
  viewMode,
  onCategoryChange,
  onCategoryDropdownOpenChange,
  onSearchChange,
  onSortChange,
  onViewModeChange,
}) {
  const [isMobileSearchOpen, setIsMobileSearchOpen] = useState(false);
  const theme = modeAdapter.heroTheme || {};
  const palette = theme.catalogPalette || theme.palette || {};
  const typography = theme.typography || {};
  const accent = palette.primary || theme.accent || '#176B3A';
  const accentDark = palette.primaryHover || theme.accentDark || '#0F5A30';
  const surface = palette.surface || '#FFFBF0';
  const border = palette.border || '#E4C98E';
  const textPrimary = palette.textPrimary || theme.textPrimary || '#0f172a';
  const textMuted = palette.textSecondary || theme.textMuted || '#64748b';
  const bodyFont = theme.bodyFont || "'Avenir Next', 'Segoe UI', sans-serif";
  const displayFont = theme.displayFont || bodyFont;
  const categories = buildCategoryOptions(filteredCatalogViewModel);
  const activeCategory = categories.find((option) => option.key === (resolvedSection || '')) || categories[0];
  const activeCount = resolvedSection
    ? categories.find((option) => option.key === resolvedSection)?.count || 0
    : filteredCatalogViewModel?.menuItems?.length || 0;

  // #694: same entry point StorefrontCatalogToolbar.jsx adds for fnb/retail -- applying a code here
  // re-fetches the catalog in place, no new data flow needed.
  // #750 (RF-5, PR #753 review): see StorefrontCatalogToolbar.jsx's own note -- same fix, same
  // reasoning. No `triggerLabel` passed here deliberately.
  const voucherEntry = handleVoucherCardApply ? (
    <VoucherCodePanel
      code={checkoutVoucherCode}
      onChange={setCheckoutVoucherCode}
      onClear={() => setCheckoutVoucherCode?.('')}
      onApplyVoucher={handleVoucherCardApply}
      compact
      accentColor={accent}
      bodyFont={bodyFont}
      isMobile={isMobileViewport}
      helperText="Prices update in place below -- no need to open checkout."
    />
  ) : null;

  if (isMobileViewport) {
    return (
      <div style={{ display: 'grid', gap: 16 }}>
        <div style={{ display: 'grid', gap: 10, width: 'calc(100% - 32px)', margin: '0 auto', minWidth: 0 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12 }}>
            {isMobileSearchOpen ? (
              <label style={{ display: 'flex', alignItems: 'center', gap: 8, border: `1px solid ${border}`, borderRadius: 999, background: '#fff', padding: '0 8px 0 14px', height: 36, width: '100%', boxSizing: 'border-box' }}>
                <Search size={15} color={accent} />
                <input
                  autoFocus
                  aria-label="Search simple catalog products"
                  value={catalogSearch}
                  onChange={(event) => onSearchChange(event.target.value)}
                  placeholder={modeAdapter.catalogSearchPlaceholder}
                  style={{ border: 0, outline: 0, background: 'transparent', width: '100%', minWidth: 0, fontSize: 13, color: textPrimary, fontFamily: bodyFont }}
                />
                <button type="button" aria-label="Close search" onClick={() => { setIsMobileSearchOpen(false); onSearchChange(''); }} style={{ width: 24, height: 24, borderRadius: '50%', border: 0, background: '#f1f5f9', color: '#64748b', display: 'grid', placeItems: 'center', cursor: 'pointer' }}>
                  <X size={14} />
                </button>
              </label>
            ) : (
              <>
                <div style={{ fontSize: typography.catalogTitle?.mobile || 16, fontWeight: typography.catalogTitle?.weight || 700, color: textPrimary, fontFamily: displayFont }}>Browse by Category</div>
                <button type="button" aria-label="Search" onClick={() => setIsMobileSearchOpen(true)} style={{ width: 36, height: 36, borderRadius: '50%', border: 0, background: accent, color: '#fff', display: 'grid', placeItems: 'center', cursor: 'pointer', boxShadow: '0 4px 12px rgba(23,107,58,0.10)' }}>
                  <Search size={16} />
                </button>
              </>
            )}
          </div>

          <div className="no-scrollbar" style={{ display: 'flex', gap: 8, overflowX: 'auto', padding: '0 4px 2px 0', scrollSnapType: 'x mandatory' }}>
            {categories.map((option) => {
              const active = option.key === (resolvedSection || '');
              const Icon = SIMPLE_CATEGORY_ICON_MAP[option.iconToken] || Sparkles;
              return (
                <button key={option.key || 'all'} type="button" onClick={() => onCategoryChange(option.key)} style={{ scrollSnapAlign: 'start', flexShrink: 0, width: 80, height: 76, borderRadius: 16, background: active ? '#F4EBCF' : '#FFFBF0', border: `1.5px solid ${active ? 'rgba(23,107,58,0.5)' : 'rgba(228,201,142,0.9)'}`, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '8px 6px 7px', cursor: 'pointer' }}>
                  <Icon size={18} color={active ? accent : '#64748b'} />
                  <span style={{ marginTop: 6, minHeight: 28, display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden', fontSize: typography.label?.size || 12, fontWeight: typography.label?.weight || 700, lineHeight: typography.label?.lineHeight || 1.15, color: active ? accent : '#475569', textAlign: 'center', fontFamily: bodyFont }}>{option.label}</span>
                </button>
              );
            })}
          </div>
        </div>

        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', width: 'calc(100% - 32px)', margin: '0 auto', gap: 10 }}>
          <div style={{ fontSize: 15, fontWeight: 700, color: textPrimary, fontFamily: bodyFont }}>{activeCount} items available</div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <StorefrontDropdown
              value={sortOption}
              onChange={(value) => onSortChange(String(value))}
              options={SORT_OPTIONS.map((option) => ({ value: option.value, label: option.mobileLabel || option.label }))}
              leading={<Filter size={16} color={accent} />}
              containerStyle={{ minWidth: 118 }}
              triggerStyle={{ minHeight: 36, borderRadius: 18, border: `1px solid ${border}`, background: surface, padding: '0 36px 0 10px' }}
              selectedLabelStyle={{ color: textPrimary, fontSize: 14, fontWeight: 700, fontFamily: bodyFont }}
            />
            <div style={{ display: 'flex', background: '#f1f5f9', borderRadius: 18, padding: 2 }}>
              {[
                { value: 'list', Icon: List },
                { value: 'grid', Icon: LayoutGrid },
              ].map(({ value, Icon }) => (
                <button key={value} type="button" aria-label={`${value} view`} onClick={() => onViewModeChange(value)} style={{ width: 30, height: 32, borderRadius: 16, border: 0, background: viewMode === value ? '#fff' : 'transparent', color: viewMode === value ? accent : '#64748b', display: 'grid', placeItems: 'center', cursor: 'pointer' }}>
                  <Icon size={16} />
                </button>
              ))}
            </div>
          </div>
        </div>

        {voucherEntry && (
          <div style={{ width: 'calc(100% - 32px)', margin: '0 auto' }}>
            {voucherEntry}
          </div>
        )}
      </div>
    );
  }

  return (
    <div style={{ maxWidth: 1320, margin: '0 auto', width: '100%', padding: '0 24px', display: 'grid', gap: 22, boxSizing: 'border-box' }}>
      <div style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', gap: 14 }}>
        <div style={{ display: 'grid', gap: 8 }}>
          <div style={{ display: 'inline-flex', alignItems: 'center', gap: 8, fontSize: 12, fontWeight: 700, color: accentDark, textTransform: 'uppercase', letterSpacing: '0.08em', fontFamily: bodyFont }}><span style={{ width: 30, height: 1, background: accent }} />{modeAdapter.catalogEyebrow || 'Product Catalog'}</div>
          <h2 style={{ margin: 0, fontSize: typography.catalogTitle?.desktop || 32, fontWeight: typography.catalogTitle?.weight || 700, color: textPrimary, lineHeight: typography.catalogTitle?.lineHeight || 1.2, fontFamily: displayFont }}>{modeAdapter.catalogHeading}</h2>
          <p style={{ margin: 0, color: textMuted, fontSize: 15, lineHeight: 1.5, maxWidth: 720, fontFamily: bodyFont }}>{modeAdapter.catalogSubtitle}</p>
        </div>
        <div style={{ display: 'grid', gap: 8, justifyItems: 'end' }}>
          <div style={{ display: 'inline-flex', alignItems: 'center', gap: 10, padding: '10px 14px', borderRadius: 999, background: '#FFFBF0', border: `1px solid ${border}`, color: textPrimary, fontSize: 13, fontWeight: 700, fontFamily: bodyFont }}><span style={{ width: 8, height: 8, borderRadius: 999, background: accent }} />{filteredCatalogViewModel?.totalItems || 0} items available</div>
          {voucherEntry && <div style={{ width: 260, minWidth: 0 }}>{voucherEntry}</div>}
        </div>
      </div>

      <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
        <label style={{ display: 'flex', alignItems: 'center', gap: 12, border: `1px solid ${border}`, borderRadius: 10, background: surface, padding: '4px 4px 4px 18px', minHeight: 50, flex: '1 1 320px', minWidth: 0, boxSizing: 'border-box' }}>
          <input aria-label="Search simple catalog products" value={catalogSearch} onChange={(event) => onSearchChange(event.target.value)} placeholder={modeAdapter.catalogSearchPlaceholder} style={{ border: 0, outline: 0, background: 'transparent', width: '100%', minWidth: 0, fontSize: 14, color: textPrimary, fontFamily: bodyFont }} />
          <span style={{ width: 40, height: 40, borderRadius: 8, background: accent, color: '#fff', display: 'grid', placeItems: 'center' }}><Search size={18} /></span>
        </label>

        <StorefrontDropdown value={sortOption} onChange={(value) => onSortChange(String(value))} options={SORT_OPTIONS} leading={<Filter size={18} color={accent} />} containerStyle={{ minWidth: 170, flex: '0 0 170px' }} triggerStyle={{ minHeight: 50, borderRadius: 10, border: `1px solid ${border}`, background: surface, padding: '0 44px 0 16px' }} selectedLabelStyle={{ color: textPrimary, fontSize: 14, fontWeight: 700 }} />

        <div ref={categoryDropdownRef} style={{ position: 'relative', width: 240, flex: '0 0 240px' }}>
          <button type="button" onClick={() => onCategoryDropdownOpenChange(!isCategoryDropdownOpen)} style={{ width: '100%', minHeight: 50, borderRadius: 10, border: `1px solid ${border}`, background: surface, padding: '0 16px', display: 'flex', alignItems: 'center', gap: 12, cursor: 'pointer' }}>
            <Box size={18} color={accent} />
            <span style={{ display: 'grid', gap: 2, minWidth: 0, textAlign: 'left', flex: 1 }}><span style={{ fontSize: 10, fontWeight: 800, color: accentDark, textTransform: 'uppercase', letterSpacing: '0.06em' }}>Product Categories</span><span style={{ fontSize: 14, fontWeight: 700, color: textPrimary, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{activeCategory.key ? activeCategory.label : 'All products'}</span></span>
            <ChevronDown size={18} color={textMuted} />
          </button>
          {isCategoryDropdownOpen ? (
            <div style={{ position: 'absolute', top: 'calc(100% + 10px)', insetInline: 0, zIndex: 40, padding: 10, borderRadius: 12, border: `1px solid ${border}`, background: surface, boxShadow: '0 12px 28px rgba(23,107,58,0.10)', display: 'grid', gap: 8, maxHeight: 360, overflowY: 'auto' }}>
              {categories.map((option) => {
                const active = option.key === (resolvedSection || '');
                const Icon = SIMPLE_CATEGORY_ICON_MAP[option.iconToken] || Sparkles;
                return <button key={option.key || 'all'} type="button" onClick={() => { onCategoryChange(option.key); onCategoryDropdownOpenChange(false); }} style={{ borderRadius: 10, border: active ? '1px solid transparent' : `1px solid ${border}`, background: active ? accent : surface, color: active ? '#fff' : textPrimary, padding: '10px 12px', display: 'flex', alignItems: 'center', gap: 12, cursor: 'pointer' }}><Icon size={18} /><span style={{ display: 'grid', textAlign: 'left' }}><span style={{ fontSize: 12, fontWeight: 700 }}>{option.label}</span><span style={{ fontSize: 10, fontWeight: 700, opacity: 0.75 }}>{option.count} item{option.count === 1 ? '' : 's'}</span></span></button>;
              })}
            </div>
          ) : null}
        </div>
      </div>
    </div>
  );
}
