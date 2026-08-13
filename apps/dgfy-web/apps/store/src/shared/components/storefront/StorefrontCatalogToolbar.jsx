import React, { useState } from 'react';
import { Box, ChevronDown, Filter, LayoutGrid, List, Search, SlidersHorizontal, Sparkles, X } from 'lucide-react';
import { StorefrontDropdown } from '../../../features/shared-storefront/components/StorefrontDropdown.jsx';

/**
 * Search/sort/category toolbar for the classic catalog section (eyebrow +
 * heading + subtitle + item-count pill, then search/sort/category on
 * desktop, or a category-chip strip + sort/view-toggle row on mobile).
 * Originally F&B-only; every visual value is sourced from `modeAdapter`
 * (copy) and `modeAdapter.heroTheme` (colors), so any mode using the shared
 * `filteredFnbViewModel`/`fnbCatalogPresentation` data (see
 * useFnbCatalogRuntime.js, which already runs for every mode) can reuse it
 * as-is by supplying its own theme/copy instead of forking the component.
 */
const StorefrontCatalogToolbar = ({
  FNB_CATEGORY_ICON_MAP,
  STYLES,
  catalogSearch,
  filteredFnbViewModel,
  fnbCategoryDropdownRef,
  fnbSortOption,
  fnbViewMode,
  isFnbCategoryDropdownOpen,
  isMobileViewport,
  modeAdapter,
  resolvedFnbSection,
  setActiveServiceTab,
  setCatalogSearch,
  setFnbSortOption,
  setFnbViewMode,
  setIsFnbCategoryDropdownOpen,
  showViewToggle = true
}) => {
  const fnbSections = Array.isArray(filteredFnbViewModel.menuSections) ? filteredFnbViewModel.menuSections : [];
  const itemNounSingular = modeAdapter.catalogItemNounSingular || 'item';
  const itemNounPlural = modeAdapter.catalogItemNounPlural || 'items';
  const toolbarTheme = modeAdapter.heroTheme || {};
  const toolbarAccent = toolbarTheme.accent || STYLES.colors.dark;
  const toolbarAccentDark = toolbarTheme.accentDark || STYLES.colors.dark;
  const toolbarAccentSoft = toolbarTheme.accentSoft || STYLES.colors.border;
  const toolbarSurface = '#ffffff';
  const toolbarBorder = modeAdapter.isRetailMode
    ? (toolbarTheme.palette?.border || toolbarTheme.borderSoft || '#e2e8f0')
    : '#edd4bc';
  const toolbarShadow = modeAdapter.isRetailMode ? 'rgba(26,78,141,0.08)' : 'rgba(73,38,20,0.06)';
  const toolbarAccentShadow = modeAdapter.isRetailMode ? 'rgba(26,78,141,0.24)' : 'rgba(217,119,6,0.28)';
  const toolbarCategoryActiveBackground = modeAdapter.isRetailMode ? toolbarAccentSoft : '#fff7ed';
  const toolbarCategoryActiveBorder = modeAdapter.isRetailMode ? toolbarBorder : '#fed7aa';
  const toolbarTextPrimary = toolbarTheme.textPrimary || STYLES.colors.dark;
  const toolbarTextMuted = toolbarTheme.textMuted || STYLES.colors.muted;
  const toolbarBodyFont = toolbarTheme.bodyFont || "'Avenir Next', 'Segoe UI', sans-serif";
  const toolbarDisplayFont = toolbarTheme.displayFont || toolbarBodyFont;
  const [isMobileSearchOpen, setIsMobileSearchOpen] = useState(false);

  if (isMobileViewport) {
    // Keep the category and filter rows aligned with the mobile catalog gutter.
    const mobileToolbarWidth = 'calc(100% - 32px)';
    const categoryOptions = [
      { key: '', label: 'All', count: filteredFnbViewModel.menuItems.length, iconToken: 'menu' },
      ...fnbSections.map((section) => ({
        key: section.sectionKey,
        label: section.sectionLabel,
        count: section.items?.length || 0,
        iconToken: section.visualMeta?.iconToken || 'menu'
      }))
    ];

    return (
      <div style={{ display: 'grid', gap: 16 }}>
        <div style={{ display: 'grid', gap: 10, width: mobileToolbarWidth, maxWidth: mobileToolbarWidth, minWidth: 0, boxSizing: 'border-box', margin: '0 auto' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', width: '100%', maxWidth: '100%', minWidth: 0, gap: 12, boxSizing: 'border-box' }}>
            {isMobileSearchOpen ? (
              <label style={{ position: 'relative', display: 'flex', alignItems: 'center', gap: 8, border: `1px solid ${toolbarBorder}`, borderRadius: 999, background: '#fff', padding: '0 8px 0 14px', height: 36, width: '100%', boxSizing: 'border-box' }}>
                <Search size={15} color={toolbarAccent} style={{ flexShrink: 0 }} />
                <input
                  autoFocus
                  value={catalogSearch}
                  onChange={(event) => setCatalogSearch(event.target.value)}
                  placeholder={modeAdapter.catalogSearchPlaceholder}
                  style={{ border: 'none', outline: 'none', background: 'transparent', width: '100%', minWidth: 0, fontSize: 13, color: toolbarTextPrimary, fontFamily: modeAdapter.heroTheme?.bodyFont }}
                />
                <button
                  type="button"
                  onClick={() => { setIsMobileSearchOpen(false); setCatalogSearch(''); }}
                  aria-label="Close search"
                  style={{ width: 24, height: 24, borderRadius: '50%', border: 'none', background: '#f1f5f9', color: '#64748b', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', flexShrink: 0 }}
                >
                  <X size={14} />
                </button>
              </label>
            ) : (
              <>
                <div style={{ fontSize: 16, fontWeight: 700, color: toolbarTextPrimary, fontFamily: toolbarDisplayFont, flexShrink: 0 }}>Browse by Category</div>
                <button
                  type="button"
                  onClick={() => setIsMobileSearchOpen(true)}
                  aria-label="Search"
                  style={{ width: 36, height: 36, borderRadius: '50%', border: 'none', background: toolbarAccent, color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', boxShadow: `0 8px 18px ${toolbarAccentShadow}`, cursor: 'pointer', flexShrink: 0 }}
                >
                  <Search size={16} strokeWidth={2.2} />
                </button>
              </>
            )}
          </div>
          <div className="no-scrollbar" style={{ display: 'flex', gap: 8, width: '100%', maxWidth: '100%', minWidth: 0, overflowX: 'auto', overflowY: 'hidden', scrollSnapType: 'x mandatory', paddingRight: 4, paddingBottom: 2, boxSizing: 'border-box', overscrollBehaviorX: 'contain' }}>
            {categoryOptions.map((option) => {
              const isActive = option.key === (resolvedFnbSection || '');
              const OptionIcon = FNB_CATEGORY_ICON_MAP[option.iconToken] || Sparkles;
              return (
                <button key={option.key || 'all'} type="button" onClick={() => setActiveServiceTab(option.key)} style={{ scrollSnapAlign: 'start', flexShrink: 0, width: 80, height: 76, borderRadius: 16, background: isActive ? toolbarCategoryActiveBackground : '#fff', border: isActive ? `1px solid ${toolbarCategoryActiveBorder}` : '1px solid #f1f5f9', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '8px 6px 7px', cursor: 'pointer', boxShadow: isActive ? 'none' : '0 4px 12px rgba(15,23,42,0.03)', transition: 'all 0.2s ease' }}>
                  <div style={{ width: 28, height: 28, display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: 6, color: isActive ? toolbarAccent : '#64748b' }}>
                    <OptionIcon size={18} />
                  </div>
                  <div style={{ fontSize: 12, fontWeight: isActive ? 800 : 700, color: isActive ? toolbarAccent : '#475569', textAlign: 'center', lineHeight: 1.15, display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden', textOverflow: 'ellipsis', minHeight: 28, maxWidth: '100%', fontFamily: modeAdapter.heroTheme?.bodyFont }}>
                    {option.label}
                  </div>
                </button>
              );
            })}
          </div>
        </div>

        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', width: mobileToolbarWidth, maxWidth: mobileToolbarWidth, minWidth: 0, gap: 10, boxSizing: 'border-box', margin: '0 auto' }}>
          <div style={{ fontSize: 15, fontWeight: 700, color: toolbarTextPrimary, flex: '1 1 auto', minWidth: 0, fontFamily: toolbarBodyFont }}>
            {resolvedFnbSection ? (filteredFnbViewModel.menuSections.find((s) => s.sectionKey === resolvedFnbSection)?.items?.length || 0) : filteredFnbViewModel.menuItems.length} items available
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexShrink: 0 }}>
            <StorefrontDropdown
              value={fnbSortOption}
              onChange={(nextValue) => setFnbSortOption(String(nextValue))}
              options={[
                { value: 'name_asc', label: 'All Prices' },
                { value: 'price_asc', label: 'Low to High' },
                { value: 'price_desc', label: 'High to Low' }
              ]}
              leading={<span style={{ display: 'inline-flex', alignItems: 'center', color: toolbarAccent }}><SlidersHorizontal size={16} /></span>}
              containerStyle={{ minWidth: 118 }}
              triggerStyle={{ minHeight: 36, borderRadius: 18, border: '1px solid #e2e8f0', background: '#fff', boxShadow: '0 2px 8px rgba(15,23,42,0.04)', padding: '0 36px 0 10px' }}
              selectedLabelStyle={{ color: '#0f172a', fontSize: 14, fontWeight: 700, fontFamily: modeAdapter.heroTheme?.bodyFont }}
            />
            {showViewToggle && (
              <div style={{ display: 'flex', background: '#f1f5f9', borderRadius: 18, padding: 2, alignItems: 'center' }}>
                <button type="button" onClick={() => setFnbViewMode('list')} style={{ width: 30, height: 32, borderRadius: 16, border: 'none', background: fnbViewMode === 'list' ? '#fff' : 'transparent', color: fnbViewMode === 'list' ? toolbarAccent : '#64748b', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', boxShadow: fnbViewMode === 'list' ? '0 2px 6px rgba(0,0,0,0.06)' : 'none', transition: 'all 0.2s ease' }}>
                  <List size={16} strokeWidth={fnbViewMode === 'list' ? 3 : 2} />
                </button>
                <button type="button" onClick={() => setFnbViewMode('grid')} style={{ width: 30, height: 32, borderRadius: 16, border: 'none', background: fnbViewMode === 'grid' ? '#fff' : 'transparent', color: fnbViewMode === 'grid' ? toolbarAccent : '#64748b', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', boxShadow: fnbViewMode === 'grid' ? '0 2px 6px rgba(0,0,0,0.06)' : 'none', transition: 'all 0.2s ease' }}>
                  <LayoutGrid size={16} strokeWidth={fnbViewMode === 'grid' ? 2.5 : 2} />
                </button>
              </div>
            )}
          </div>
        </div>
      </div>
    );
  }

  const categoryOptions = [
    { key: '', label: 'All', count: filteredFnbViewModel.menuItems.length, iconToken: 'menu', glyph: 'A', accent: toolbarAccent, accentSoft: toolbarAccentSoft },
    ...fnbSections.map((section) => ({
      key: section.sectionKey,
      label: section.sectionLabel,
      count: section.items?.length || 0,
      iconToken: section.visualMeta?.iconToken || 'menu',
      glyph: section.visualMeta?.glyph || String(section.sectionLabel || '').charAt(0).toUpperCase(),
      accent: modeAdapter.isRetailMode ? toolbarAccent : (section.visualMeta?.accent || '#475569'),
      accentSoft: modeAdapter.isRetailMode ? toolbarAccentSoft : (section.visualMeta?.accentSoft || '#f1f5f9')
    }))
  ];
  const activeCategoryOption = categoryOptions.find((option) => option.key === (resolvedFnbSection || '')) || categoryOptions[0];
  const ActiveCategoryIcon = FNB_CATEGORY_ICON_MAP[activeCategoryOption.iconToken] || Sparkles;
  const controlHeight = modeAdapter.isRetailMode ? 50 : 56;
  const controlRadius = modeAdapter.isRetailMode ? 10 : 18;
  const totalItems = filteredFnbViewModel.totalItems || 0;

  return (
    <div style={{ maxWidth: 1320, margin: '0 auto', width: '100%', padding: '0 24px', display: 'grid', gap: 22 }}>
      <div style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', gap: 14, flexDirection: 'row' }}>
        <div style={{ display: 'grid', gap: 8 }}>
          <div style={{ display: 'inline-flex', alignItems: 'center', gap: 8, fontSize: 12, fontWeight: 700, color: toolbarAccentDark, textTransform: 'uppercase', letterSpacing: '0.08em', fontFamily: toolbarBodyFont }}>
            <span style={{ width: 30, height: 1, background: toolbarAccent }} />
            {modeAdapter.catalogEyebrow || 'Curated Catalog'}
          </div>
          <h2 style={{ margin: 0, fontSize: modeAdapter.isRetailMode ? 34 : 36, fontWeight: modeAdapter.isRetailMode ? 800 : 900, color: toolbarTextPrimary || STYLES.colors.dark, lineHeight: 1.12, letterSpacing: '-0.025em', fontFamily: toolbarDisplayFont }}>{modeAdapter.catalogHeading}</h2>
          <p style={{ margin: 0, color: toolbarTextMuted || STYLES.colors.muted, fontSize: 15, lineHeight: 1.5, maxWidth: 720, fontFamily: toolbarBodyFont }}>{modeAdapter.catalogSubtitle}</p>
        </div>
        <div style={{ display: 'inline-flex', alignItems: 'center', gap: 10, padding: '10px 14px', borderRadius: 999, background: toolbarTheme.surfaceInset || '#fff3e8', border: `1px solid ${toolbarBorder}`, color: toolbarTextPrimary || STYLES.colors.dark, fontSize: 13, fontWeight: 700, fontFamily: toolbarBodyFont }}>
          <span style={{ width: 8, height: 8, borderRadius: 999, background: toolbarAccent }} />
          {totalItems} {totalItems === 1 ? itemNounSingular : itemNounPlural} available
        </div>
      </div>

      <div style={{ display: 'grid', gap: 14 }}>
        <div style={{ display: 'flex', flexDirection: 'row', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
          <label style={{ position: 'relative', display: 'flex', alignItems: 'center', gap: 12, border: `1px solid ${toolbarBorder}`, borderRadius: controlRadius, background: '#fff', padding: modeAdapter.isRetailMode ? '4px 4px 4px 18px' : '0 18px 0 42px', minHeight: controlHeight, flex: '1 1 320px', minWidth: 0, boxShadow: modeAdapter.isRetailMode ? 'none' : `0 14px 28px ${toolbarShadow}` }}>
            {!modeAdapter.isRetailMode ? <span style={{ width: 2, position: 'absolute', left: 28, top: 12, bottom: 12, borderRadius: 999, background: toolbarAccent, opacity: 0.65, pointerEvents: 'none' }} /> : null}
            <input value={catalogSearch} onChange={(event) => setCatalogSearch(event.target.value)} placeholder={modeAdapter.catalogSearchPlaceholder} style={{ border: 'none', outline: 'none', background: 'transparent', width: '100%', minWidth: 0, fontSize: 14, color: toolbarTextPrimary, fontFamily: toolbarBodyFont }} />
            <span style={{ width: modeAdapter.isRetailMode ? 40 : 42, height: modeAdapter.isRetailMode ? 40 : 42, borderRadius: modeAdapter.isRetailMode ? 8 : 999, background: toolbarAccent, color: '#fff', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', boxShadow: modeAdapter.isRetailMode ? 'none' : `0 10px 20px ${toolbarAccentShadow}`, flexShrink: 0 }}>
              <Search size={modeAdapter.isRetailMode ? 18 : 20} />
            </span>
          </label>

          <StorefrontDropdown
            value={fnbSortOption}
            onChange={(nextValue) => setFnbSortOption(String(nextValue))}
            options={[
              { value: 'name_asc', label: 'All Prices' },
              { value: 'price_asc', label: 'Price: Low to High' },
              { value: 'price_desc', label: 'Price: High to Low' }
            ]}
            leading={<span style={{ display: 'inline-flex', alignItems: 'center', gap: 10, color: toolbarAccent }}>{modeAdapter.isRetailMode ? <Filter size={18} /> : <><SlidersHorizontal size={18} /><span style={{ width: 1, height: '60%', minHeight: 24, borderRadius: 999, background: 'rgba(201,106,43,0.18)' }} /></>}</span>}
            containerStyle={{ minWidth: modeAdapter.isRetailMode ? 170 : 240, flex: `0 0 ${modeAdapter.isRetailMode ? 170 : 240}px` }}
            triggerStyle={{ minHeight: controlHeight, borderRadius: controlRadius, border: `1px solid ${toolbarBorder}`, background: '#fff', boxShadow: modeAdapter.isRetailMode ? 'none' : `0 14px 28px ${toolbarShadow}`, padding: '0 44px 0 16px' }}
            selectedLabelStyle={{ color: toolbarTextPrimary, fontSize: 14, fontWeight: 700 }}
          />

          <div ref={fnbCategoryDropdownRef} style={{ position: 'relative', width: modeAdapter.isRetailMode ? 240 : 290, flex: `0 0 ${modeAdapter.isRetailMode ? 240 : 290}px` }}>
            <button type="button" onClick={() => setIsFnbCategoryDropdownOpen((previous) => !previous)} style={{ position: 'relative', width: '100%', minHeight: controlHeight, borderRadius: controlRadius, border: `1px solid ${toolbarBorder}`, background: '#fff', padding: modeAdapter.isRetailMode ? '0 16px' : '0 18px 0 20px', display: 'flex', alignItems: 'center', gap: 12, cursor: 'pointer', boxShadow: modeAdapter.isRetailMode ? 'none' : `0 14px 28px ${toolbarShadow}` }}>
              <span style={{ width: modeAdapter.isRetailMode ? 22 : 38, height: modeAdapter.isRetailMode ? 22 : 38, borderRadius: modeAdapter.isRetailMode ? 0 : 14, background: modeAdapter.isRetailMode ? 'transparent' : activeCategoryOption.accentSoft, color: activeCategoryOption.accent, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', position: 'relative', flexShrink: 0 }}>
                {modeAdapter.isRetailMode ? <Box size={18} /> : React.createElement(ActiveCategoryIcon, { size: 18 })}
                {!modeAdapter.isRetailMode ? (
                <span style={{ position: 'absolute', right: -4, bottom: -4, width: 18, height: 18, borderRadius: 999, background: '#fff', border: `1px solid ${toolbarBorder}`, color: toolbarTextPrimary, fontSize: 10, fontWeight: 900, display: 'inline-flex', alignItems: 'center', justifyContent: 'center' }}>
                  {String(activeCategoryOption.glyph || 'A').slice(0, 1)}
                </span>
                ) : null}
              </span>
              <span style={{ display: 'grid', gap: 2, minWidth: 0, textAlign: 'left', flex: 1 }}>
                <span style={{ fontSize: modeAdapter.isRetailMode ? 10 : 12, fontWeight: 800, color: toolbarAccentDark, textTransform: 'uppercase', letterSpacing: '0.06em', lineHeight: 1 }}>{modeAdapter.isRetailMode ? 'Product Categories' : 'Category'}</span>
                <span style={{ fontSize: 14, fontWeight: modeAdapter.isRetailMode ? 700 : 800, color: toolbarTextPrimary, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', lineHeight: 1.15 }}>{modeAdapter.isRetailMode && !activeCategoryOption.key ? 'All products' : activeCategoryOption.label}</span>
              </span>
              {!modeAdapter.isRetailMode ? <span style={{ fontSize: 12, fontWeight: 800, color: toolbarTextMuted }}>{activeCategoryOption.count}</span> : null}
              <ChevronDown size={18} color={toolbarTextMuted} />
            </button>

            {isFnbCategoryDropdownOpen && (
              <div style={{ position: 'absolute', top: 'calc(100% + 10px)', left: 0, right: 0, zIndex: 40, padding: 10, borderRadius: 18, border: `1px solid ${toolbarBorder}`, background: toolbarSurface, boxShadow: '0 22px 48px rgba(15,23,42,0.14)', display: 'grid', gap: 8, maxHeight: 360, overflowY: 'auto' }}>
                {categoryOptions.map((option) => {
                  const isActive = option.key === (resolvedFnbSection || '');
                  const OptionIcon = FNB_CATEGORY_ICON_MAP[option.iconToken] || Sparkles;
                  return (
                    <button key={`catalog-category-dropdown-${option.key || 'all'}`} type="button" onClick={() => { setActiveServiceTab(option.key); setIsFnbCategoryDropdownOpen(false); }} style={{ width: '100%', borderRadius: 16, border: isActive ? '1px solid transparent' : `1px solid ${toolbarBorder}`, background: isActive ? toolbarAccent : toolbarSurface, color: isActive ? '#fff' : toolbarTextPrimary, padding: '10px 12px', display: 'flex', alignItems: 'center', gap: 12, cursor: 'pointer' }}>
                      <span style={{ width: 38, height: 38, borderRadius: 14, background: isActive ? 'rgba(255,255,255,0.16)' : option.accentSoft, color: isActive ? '#fff' : option.accent, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', position: 'relative', flexShrink: 0 }}>
                        {React.createElement(OptionIcon, { size: 18 })}
                        <span style={{ position: 'absolute', right: -4, bottom: -4, width: 18, height: 18, borderRadius: 999, background: '#fff', border: `1px solid ${isActive ? 'rgba(255,255,255,0.3)' : toolbarBorder}`, color: toolbarTextPrimary, fontSize: 10, fontWeight: 900, display: 'inline-flex', alignItems: 'center', justifyContent: 'center' }}>
                          {String(option.glyph || 'A').slice(0, 1)}
                        </span>
                      </span>
                      <span style={{ display: 'grid', gap: 2, minWidth: 0, textAlign: 'left', flex: 1 }}>
                        <span style={{ fontSize: modeAdapter.isRetailMode ? 12 : 14, fontWeight: modeAdapter.isRetailMode ? 700 : 800, lineHeight: 1.2, fontFamily: toolbarBodyFont }}>{option.label}</span>
                        <span style={{ fontSize: modeAdapter.isRetailMode ? 10 : 11, fontWeight: 700, opacity: isActive ? 0.82 : 0.6, fontFamily: toolbarBodyFont }}>{option.count} item{option.count === 1 ? '' : 's'}</span>
                      </span>
                    </button>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

export { StorefrontCatalogToolbar };
