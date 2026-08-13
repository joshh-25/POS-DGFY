import React, { useRef, useState } from 'react';
import { ChevronDown, LayoutGrid, List, Search, SlidersHorizontal, Sparkles, X } from 'lucide-react';
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
  showSearch = true,
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
  const toolbarBorder = toolbarTheme.borderSoft || '#edd4bc';
  const toolbarAccentShadow = toolbarTheme.accentShadow || 'rgba(201,106,43,0.24)';
  const toolbarTextPrimary = toolbarTheme.textPrimary || STYLES.colors.dark;
  const toolbarTextMuted = toolbarTheme.textMuted || STYLES.colors.muted;
  const catalogHorizontalPadding = Number.isFinite(Number(modeAdapter.catalogHorizontalPadding))
    ? Number(modeAdapter.catalogHorizontalPadding)
    : 24;
  const catalogUseOuterGutter = modeAdapter.catalogUseOuterGutter === true;
  const isCompactToolbar = modeAdapter.catalogToolbarVariant === 'services-compact';
  const [isMobileSearchOpen, setIsMobileSearchOpen] = useState(false);
  const catalogSearchInputRef = useRef(null);

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
            {showSearch && isMobileSearchOpen ? (
              <label style={{ position: 'relative', display: 'flex', alignItems: 'center', gap: 8, border: `1px solid ${toolbarBorder}`, borderRadius: 999, background: '#fff', padding: '0 8px 0 14px', height: 36, width: '100%', boxSizing: 'border-box' }}>
                <Search size={15} color={toolbarAccent} style={{ flexShrink: 0 }} />
                <input
                  autoFocus
                  value={catalogSearch}
                  onChange={(event) => setCatalogSearch(event.target.value)}
                  placeholder={modeAdapter.catalogSearchPlaceholder}
                  style={{ border: 'none', outline: 'none', background: 'transparent', width: '100%', minWidth: 0, fontSize: 13, color: toolbarTextPrimary, fontFamily: modeAdapter.heroTheme?.bodyFont }}
                />
                {showSearch ? <button
                  type="button"
                  onClick={() => { setIsMobileSearchOpen(false); setCatalogSearch(''); }}
                  aria-label="Close search"
                  style={{ width: 24, height: 24, borderRadius: '50%', border: 'none', background: '#f1f5f9', color: '#64748b', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', flexShrink: 0 }}
                >
                  <X size={14} />
                </button> : null}
              </label>
            ) : (
              <>
                <div style={{ fontSize: 16, fontWeight: 700, color: '#0f172a', fontFamily: modeAdapter.heroTheme?.bodyFont, flexShrink: 0 }}>Browse by Category</div>
                {showSearch ? <button
                  type="button"
                  onClick={() => setIsMobileSearchOpen(true)}
                  aria-label="Search"
                  style={{ width: 36, height: 36, borderRadius: '50%', border: 'none', background: toolbarAccent, color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', boxShadow: `0 8px 18px ${toolbarAccentShadow}`, cursor: 'pointer', flexShrink: 0 }}
                >
                  <Search size={16} strokeWidth={2.2} />
                </button> : null}
              </>
            )}
          </div>
          <div className="no-scrollbar" style={{ display: 'flex', gap: 8, width: '100%', maxWidth: '100%', minWidth: 0, overflowX: 'auto', overflowY: 'hidden', scrollSnapType: 'x mandatory', paddingRight: 4, paddingBottom: 2, boxSizing: 'border-box', overscrollBehaviorX: 'contain' }}>
            {categoryOptions.map((option) => {
              const isActive = option.key === (resolvedFnbSection || '');
              const OptionIcon = FNB_CATEGORY_ICON_MAP[option.iconToken] || Sparkles;
              return (
                <button key={option.key || 'all'} type="button" onClick={() => setActiveServiceTab(option.key)} style={{ scrollSnapAlign: 'start', flexShrink: 0, width: 80, height: 76, borderRadius: 16, background: isActive ? toolbarAccentSoft : '#fff', border: isActive ? `1px solid ${toolbarBorder}` : '1px solid #f1f5f9', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '8px 6px 7px', cursor: 'pointer', boxShadow: isActive ? 'none' : '0 4px 12px rgba(15,23,42,0.03)', transition: 'all 0.2s ease' }}>
                  <div style={{ width: 28, height: 28, display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: 6, color: isActive ? toolbarAccent : '#64748b' }}>
                    <OptionIcon size={18} />
                  </div>
                  <div style={{ fontSize: 12, fontWeight: isActive ? 800 : 700, color: isActive ? toolbarAccentDark : '#475569', textAlign: 'center', lineHeight: 1.15, display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden', textOverflow: 'ellipsis', minHeight: 28, maxWidth: '100%', fontFamily: modeAdapter.heroTheme?.bodyFont }}>
                    {option.label}
                  </div>
                </button>
              );
            })}
          </div>
        </div>

        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', width: mobileToolbarWidth, maxWidth: mobileToolbarWidth, minWidth: 0, gap: 10, boxSizing: 'border-box', margin: '0 auto' }}>
          <div style={{ fontSize: 16, fontWeight: 700, color: '#0f172a', flex: '1 1 auto', minWidth: 0, fontFamily: modeAdapter.heroTheme?.bodyFont }}>
            {resolvedFnbSection ? (filteredFnbViewModel.menuSections.find((s) => s.sectionKey === resolvedFnbSection)?.items?.length || 0) : filteredFnbViewModel.menuItems.length} {((resolvedFnbSection ? (filteredFnbViewModel.menuSections.find((s) => s.sectionKey === resolvedFnbSection)?.items?.length || 0) : filteredFnbViewModel.menuItems.length) === 1) ? itemNounSingular : itemNounPlural} available
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
      accent: section.visualMeta?.accent || '#475569',
      accentSoft: section.visualMeta?.accentSoft || '#f1f5f9'
    }))
  ];
  const activeCategoryOption = categoryOptions.find((option) => option.key === (resolvedFnbSection || '')) || categoryOptions[0];
  const ActiveCategoryIcon = FNB_CATEGORY_ICON_MAP[activeCategoryOption.iconToken] || Sparkles;
  const controlHeight = isCompactToolbar ? 44 : 56;
  const controlRadius = isCompactToolbar ? 8 : 18;
  const toolbarControlGap = isCompactToolbar ? 16 : 12;
  const priceControlWidth = isCompactToolbar ? 150 : 240;
  const categoryControlWidth = isCompactToolbar ? 215 : 290;
  const totalItems = filteredFnbViewModel.totalItems || 0;

  return (
    <div style={{ maxWidth: modeAdapter.catalogMaxWidth || 1320, margin: '0 auto', width: catalogUseOuterGutter ? `calc(100% - ${catalogHorizontalPadding * 2}px)` : '100%', padding: catalogUseOuterGutter ? 0 : `0 ${catalogHorizontalPadding}px`, boxSizing: 'border-box', display: 'grid', gap: 22, fontFamily: toolbarTheme.bodyFont }}>
      <div style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', gap: isCompactToolbar ? 16 : 14, flexDirection: 'row', paddingBottom: modeAdapter.catalogHeaderDivider ? 20 : 0, borderBottom: modeAdapter.catalogHeaderDivider ? `1px solid ${toolbarBorder}` : 'none' }}>
        <div style={{ display: isCompactToolbar ? 'block' : 'grid', gap: isCompactToolbar ? 0 : 8 }}>
          <div style={{ display: 'inline-flex', alignItems: 'center', gap: 8, fontSize: isCompactToolbar ? 12.5 : 12, fontWeight: isCompactToolbar ? 700 : 800, color: toolbarAccentDark, textTransform: 'uppercase', letterSpacing: isCompactToolbar ? '0.09em' : '0.1em', lineHeight: isCompactToolbar ? '20px' : undefined, margin: isCompactToolbar ? '0 0 4px' : 0 }}>
            <span style={{ width: 30, height: 1, background: toolbarAccent }} />
            {modeAdapter.catalogEyebrow || 'Curated Catalog'}
          </div>
          <h2 style={{ margin: 0, fontSize: isCompactToolbar ? 26.4 : 36, fontWeight: isCompactToolbar ? 800 : 900, color: toolbarTextPrimary || STYLES.colors.dark, letterSpacing: isCompactToolbar ? 'normal' : '-0.03em', lineHeight: isCompactToolbar ? '33px' : undefined, fontFamily: modeAdapter.heroTheme?.displayFont }}>{modeAdapter.catalogHeading}</h2>
          {modeAdapter.catalogSubtitle ? <p style={{ margin: 0, color: toolbarTextMuted || STYLES.colors.muted, fontSize: 15, maxWidth: 720 }}>{modeAdapter.catalogSubtitle}</p> : null}
        </div>
        <div style={{ display: 'inline-flex', alignItems: 'center', gap: isCompactToolbar ? 6 : 10, padding: isCompactToolbar ? '6px 13px' : '10px 14px', borderRadius: isCompactToolbar ? 8 : 999, background: isCompactToolbar ? '#fff' : (toolbarTheme.surfaceInset || '#fff3e8'), border: `1px solid ${toolbarBorder}`, color: toolbarTextPrimary || STYLES.colors.dark, fontSize: isCompactToolbar ? 12 : 13, fontWeight: 800, lineHeight: isCompactToolbar ? '19px' : undefined }}>
          <span style={{ width: isCompactToolbar ? 7 : 8, height: isCompactToolbar ? 7 : 8, borderRadius: 999, background: toolbarAccent }} />
          {totalItems} {totalItems === 1 ? itemNounSingular : itemNounPlural} available
        </div>
      </div>

      <div style={{ display: 'grid', gap: 14 }}>
        <div style={{ display: 'flex', flexDirection: 'row', alignItems: 'center', gap: toolbarControlGap, flexWrap: 'wrap' }}>
          {showSearch ? <label style={{ position: 'relative', display: 'flex', alignItems: 'center', gap: isCompactToolbar ? 0 : 12, border: isCompactToolbar ? 'none' : `1px solid ${toolbarBorder}`, borderRadius: controlRadius, background: '#fff', padding: isCompactToolbar ? 0 : '0 18px 0 42px', minHeight: controlHeight, flex: '1 1 320px', minWidth: 0, boxShadow: isCompactToolbar ? 'none' : '0 14px 28px rgba(15,23,42,0.06)' }}>
            {!isCompactToolbar ? <span style={{ width: 2, position: 'absolute', left: 28, top: 12, bottom: 12, borderRadius: 999, background: toolbarAccent, opacity: 0.65, pointerEvents: 'none' }} /> : null}
            <input
              ref={catalogSearchInputRef}
              value={catalogSearch}
              onChange={(event) => setCatalogSearch(event.target.value)}
              placeholder={modeAdapter.catalogSearchPlaceholder}
              style={isCompactToolbar
                ? { height: controlHeight, border: `1px solid ${toolbarBorder}`, borderRadius: controlRadius, outline: 'none', background: '#fff', width: '100%', minWidth: 0, boxSizing: 'border-box', padding: '0 56px 0 16px', fontSize: 14, color: toolbarTextPrimary }
                : { border: 'none', outline: 'none', background: 'transparent', width: '100%', minWidth: 0, fontSize: 14, color: toolbarTextPrimary }}
            />
            {isCompactToolbar ? (
              <button
                type="button"
                aria-label="Search services"
                onClick={() => catalogSearchInputRef.current?.focus()}
                style={{ position: 'absolute', top: '50%', right: 4, width: 36, height: 36, transform: 'translateY(-50%)', border: 'none', borderRadius: 6, background: toolbarAccent, color: '#fff', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer' }}
              >
                <Search size={16} />
              </button>
            ) : (
              <span style={{ width: 42, height: 42, borderRadius: 999, background: toolbarAccent, color: '#fff', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', boxShadow: `0 10px 20px ${toolbarAccentShadow}`, flexShrink: 0 }}>
                <Search size={20} />
              </span>
            )}
          </label> : null}

          <StorefrontDropdown
            value={fnbSortOption}
            onChange={(nextValue) => setFnbSortOption(String(nextValue))}
            options={[
              { value: 'name_asc', label: 'All Prices' },
              { value: 'price_asc', label: 'Price: Low to High' },
              { value: 'price_desc', label: 'Price: High to Low' }
            ]}
              leading={isCompactToolbar
                ? <span style={{ display: 'inline-flex', alignItems: 'center', color: toolbarAccent }}><SlidersHorizontal size={isCompactToolbar ? 16 : 18} /></span>
                : <span style={{ display: 'inline-flex', alignItems: 'center', gap: 10, color: toolbarAccent }}><SlidersHorizontal size={18} /><span style={{ width: 1, height: '60%', minHeight: 24, borderRadius: 999, background: toolbarBorder }} /></span>}
              chevronSize={isCompactToolbar ? 16 : 18}
              containerStyle={{ minWidth: priceControlWidth, flex: `0 0 ${priceControlWidth}px` }}
            triggerStyle={{ minHeight: controlHeight, borderRadius: controlRadius, border: `1px solid ${toolbarBorder}`, background: '#fff', boxShadow: isCompactToolbar ? 'none' : '0 14px 28px rgba(15,23,42,0.06)', padding: isCompactToolbar ? '0 40px 0 20px' : '0 44px 0 16px' }}
            selectedLabelStyle={{ color: toolbarTextPrimary, fontSize: 14, fontWeight: 700, fontFamily: toolbarTheme.bodyFont }}
          />

          <div ref={fnbCategoryDropdownRef} style={{ position: 'relative', width: categoryControlWidth, flex: `0 0 ${categoryControlWidth}px` }}>
            <button type="button" aria-label={`Category ${activeCategoryOption.label} ${activeCategoryOption.count}`} onClick={() => setIsFnbCategoryDropdownOpen((previous) => !previous)} style={{ position: 'relative', width: '100%', minHeight: controlHeight, borderRadius: controlRadius, border: `1px solid ${toolbarBorder}`, background: '#fff', padding: isCompactToolbar ? '0 16px' : '0 18px 0 20px', display: 'flex', alignItems: 'center', gap: isCompactToolbar ? 10 : 12, cursor: 'pointer', boxShadow: isCompactToolbar ? 'none' : '0 14px 28px rgba(15,23,42,0.06)' }}>
              <span style={{ width: isCompactToolbar ? 28 : 38, height: isCompactToolbar ? 28 : 38, borderRadius: isCompactToolbar ? 8 : 14, background: activeCategoryOption.accentSoft, color: activeCategoryOption.accent, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', position: 'relative', flexShrink: 0 }}>
                {React.createElement(ActiveCategoryIcon, { size: isCompactToolbar ? 16 : 18 })}
                {!isCompactToolbar ? <span style={{ position: 'absolute', right: -4, bottom: -4, width: 18, height: 18, borderRadius: 999, background: '#fff', border: `1px solid ${toolbarBorder}`, color: toolbarTextPrimary, fontSize: 10, fontWeight: 900, display: 'inline-flex', alignItems: 'center', justifyContent: 'center' }}>
                  {String(activeCategoryOption.glyph || 'A').slice(0, 1)}
                </span> : null}
              </span>
              <span style={{ display: 'grid', gap: 2, minWidth: 0, textAlign: 'left', flex: 1 }}>
                <span style={{ fontSize: isCompactToolbar ? 10 : 12, fontWeight: 800, color: toolbarAccentDark, textTransform: 'uppercase', letterSpacing: '0.06em', lineHeight: 1 }}>{isCompactToolbar ? 'Service Categories' : 'Category'}</span>
                <span style={{ fontSize: 14, fontWeight: 800, color: toolbarTextPrimary, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', lineHeight: 1.15 }}>{activeCategoryOption.label}</span>
              </span>
              <span style={{ fontSize: 12, fontWeight: 800, color: toolbarTextMuted }}>{activeCategoryOption.count}</span>
              <ChevronDown size={isCompactToolbar ? 16 : 18} color={toolbarTextMuted} />
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
                        <span style={{ fontSize: 14, fontWeight: 800, lineHeight: 1.15 }}>{option.label}</span>
                        <span style={{ fontSize: 11, fontWeight: 700, opacity: isActive ? 0.82 : 0.6 }}>{option.count} {option.count === 1 ? itemNounSingular : itemNounPlural}</span>
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
