import React from 'react';
import { ChevronDown, LayoutGrid, List, Search, SlidersHorizontal, Sparkles } from 'lucide-react';
import { StorefrontDropdown } from '../../../../features/shared-storefront/components/StorefrontDropdown.jsx';

const FnbCatalogToolbar = ({
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
  setIsFnbCategoryDropdownOpen
}) => {
  const fnbSections = Array.isArray(filteredFnbViewModel.menuSections) ? filteredFnbViewModel.menuSections : [];

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
            <div style={{ fontSize: 16, fontWeight: 700, color: '#0f172a', fontFamily: modeAdapter.heroTheme?.bodyFont }}>Browse by Category</div>
            <button type="button" onClick={() => setActiveServiceTab('')} style={{ padding: '0 6px 0 0', border: 'none', background: 'transparent', fontSize: 14, fontWeight: 700, color: '#3b82f6', cursor: 'pointer', flexShrink: 0, fontFamily: modeAdapter.heroTheme?.bodyFont }}>
              View all
            </button>
          </div>
          <div className="no-scrollbar" style={{ display: 'flex', gap: 8, width: '100%', maxWidth: '100%', minWidth: 0, overflowX: 'auto', overflowY: 'hidden', scrollSnapType: 'x mandatory', paddingRight: 4, paddingBottom: 2, boxSizing: 'border-box', overscrollBehaviorX: 'contain' }}>
            {categoryOptions.map((option) => {
              const isActive = option.key === (resolvedFnbSection || '');
              const OptionIcon = FNB_CATEGORY_ICON_MAP[option.iconToken] || Sparkles;
              return (
                <button key={option.key || 'all'} type="button" onClick={() => setActiveServiceTab(option.key)} style={{ scrollSnapAlign: 'start', flexShrink: 0, width: 80, height: 76, borderRadius: 16, background: isActive ? '#fff7ed' : '#fff', border: isActive ? '1px solid #fed7aa' : '1px solid #f1f5f9', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '8px 6px 7px', cursor: 'pointer', boxShadow: isActive ? 'none' : '0 4px 12px rgba(15,23,42,0.03)', transition: 'all 0.2s ease' }}>
                  <div style={{ width: 28, height: 28, display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: 6, color: isActive ? '#f97316' : '#64748b' }}>
                    <OptionIcon size={18} />
                  </div>
                  <div style={{ fontSize: 12, fontWeight: isActive ? 800 : 700, color: isActive ? '#f97316' : '#475569', textAlign: 'center', lineHeight: 1.15, display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden', textOverflow: 'ellipsis', minHeight: 28, maxWidth: '100%', fontFamily: modeAdapter.heroTheme?.bodyFont }}>
                    {option.label}
                  </div>
                </button>
              );
            })}
          </div>
        </div>

        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', width: mobileToolbarWidth, maxWidth: mobileToolbarWidth, minWidth: 0, gap: 10, boxSizing: 'border-box', margin: '0 auto' }}>
          <div style={{ fontSize: 16, fontWeight: 700, color: '#0f172a', flex: '1 1 auto', minWidth: 0, fontFamily: modeAdapter.heroTheme?.bodyFont }}>
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
              leading={<span style={{ display: 'inline-flex', alignItems: 'center', color: '#f97316' }}><SlidersHorizontal size={16} /></span>}
              containerStyle={{ minWidth: 118 }}
              triggerStyle={{ minHeight: 36, borderRadius: 18, border: '1px solid #e2e8f0', background: '#fff', boxShadow: '0 2px 8px rgba(15,23,42,0.04)', padding: '0 36px 0 10px' }}
              selectedLabelStyle={{ color: '#0f172a', fontSize: 14, fontWeight: 700, fontFamily: modeAdapter.heroTheme?.bodyFont }}
            />
            <div style={{ display: 'flex', background: '#f1f5f9', borderRadius: 18, padding: 2, alignItems: 'center' }}>
              <button type="button" onClick={() => setFnbViewMode('list')} style={{ width: 30, height: 32, borderRadius: 16, border: 'none', background: fnbViewMode === 'list' ? '#fff' : 'transparent', color: fnbViewMode === 'list' ? '#f97316' : '#64748b', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', boxShadow: fnbViewMode === 'list' ? '0 2px 6px rgba(0,0,0,0.06)' : 'none', transition: 'all 0.2s ease' }}>
                <List size={16} strokeWidth={fnbViewMode === 'list' ? 3 : 2} />
              </button>
              <button type="button" onClick={() => setFnbViewMode('grid')} style={{ width: 30, height: 32, borderRadius: 16, border: 'none', background: fnbViewMode === 'grid' ? '#fff' : 'transparent', color: fnbViewMode === 'grid' ? '#f97316' : '#64748b', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', boxShadow: fnbViewMode === 'grid' ? '0 2px 6px rgba(0,0,0,0.06)' : 'none', transition: 'all 0.2s ease' }}>
                <LayoutGrid size={16} strokeWidth={fnbViewMode === 'grid' ? 2.5 : 2} />
              </button>
            </div>
          </div>
        </div>
      </div>
    );
  }

  const fnbTheme = modeAdapter.heroTheme || {};
  const toolbarAccent = fnbTheme.accent || '#c96a2b';
  const toolbarAccentDark = fnbTheme.accentDark || '#6f3415';
  const toolbarAccentSoft = fnbTheme.accentSoft || '#fff0e2';
  const toolbarSurface = '#ffffff';
  const toolbarBorder = fnbTheme.borderSoft || '#edd4bc';
  const toolbarTextPrimary = fnbTheme.textPrimary || '#2f1f16';
  const toolbarTextMuted = fnbTheme.textMuted || '#7c6757';
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
  const controlHeight = 56;
  const controlRadius = 18;

  return (
    <div style={{ maxWidth: 1320, margin: '0 auto', width: '100%', padding: '0 24px', display: 'grid', gap: 22 }}>
      <div style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', gap: 14, flexDirection: 'row' }}>
        <div style={{ display: 'grid', gap: 8 }}>
          <div style={{ display: 'inline-flex', alignItems: 'center', gap: 8, fontSize: 12, fontWeight: 800, color: modeAdapter.heroTheme?.accentDark || '#6f3415', textTransform: 'uppercase', letterSpacing: '0.1em' }}>
            <span style={{ width: 30, height: 1, background: modeAdapter.heroTheme?.accent || '#c96a2b' }} />
            Curated Menu
          </div>
          <h2 style={{ margin: 0, fontSize: 36, fontWeight: 900, color: modeAdapter.heroTheme?.textPrimary || STYLES.colors.dark, letterSpacing: '-0.03em', fontFamily: modeAdapter.heroTheme?.displayFont }}>{modeAdapter.catalogHeading}</h2>
          <p style={{ margin: 0, color: modeAdapter.heroTheme?.textMuted || STYLES.colors.muted, fontSize: 15, maxWidth: 720 }}>{modeAdapter.catalogSubtitle}</p>
        </div>
        <div style={{ display: 'inline-flex', alignItems: 'center', gap: 10, padding: '10px 14px', borderRadius: 999, background: modeAdapter.heroTheme?.surfaceInset || '#fff3e8', border: `1px solid ${modeAdapter.heroTheme?.borderSoft || '#edd4bc'}`, color: modeAdapter.heroTheme?.textPrimary || STYLES.colors.dark, fontSize: 13, fontWeight: 800 }}>
          <span style={{ width: 8, height: 8, borderRadius: 999, background: modeAdapter.heroTheme?.accent || '#c96a2b' }} />
          {filteredFnbViewModel.totalItems || 0} menu item{Number(filteredFnbViewModel.totalItems || 0) === 1 ? '' : 's'} available
        </div>
      </div>

      <div style={{ display: 'grid', gap: 14 }}>
        <div style={{ display: 'flex', flexDirection: 'row', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
          <label style={{ position: 'relative', display: 'flex', alignItems: 'center', gap: 12, border: `1px solid ${toolbarBorder}`, borderRadius: controlRadius, background: '#fff', padding: '0 18px 0 42px', minHeight: controlHeight, flex: '1 1 320px', minWidth: 0, boxShadow: '0 14px 28px rgba(73,38,20,0.06)' }}>
            <span style={{ width: 2, position: 'absolute', left: 28, top: 12, bottom: 12, borderRadius: 999, background: toolbarAccent, opacity: 0.65, pointerEvents: 'none' }} />
            <input value={catalogSearch} onChange={(event) => setCatalogSearch(event.target.value)} placeholder={modeAdapter.catalogSearchPlaceholder} style={{ border: 'none', outline: 'none', background: 'transparent', width: '100%', minWidth: 0, fontSize: 14, color: toolbarTextPrimary }} />
            <span style={{ width: 42, height: 42, borderRadius: 999, background: toolbarAccent, color: '#fff', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', boxShadow: '0 10px 20px rgba(201,106,43,0.24)', flexShrink: 0 }}>
              <Search size={20} />
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
            leading={<span style={{ display: 'inline-flex', alignItems: 'center', gap: 10, color: toolbarAccent }}><SlidersHorizontal size={18} /><span style={{ width: 1, height: '60%', minHeight: 24, borderRadius: 999, background: 'rgba(201,106,43,0.18)' }} /></span>}
            containerStyle={{ minWidth: 240, flex: '0 0 240px' }}
            triggerStyle={{ minHeight: controlHeight, borderRadius: controlRadius, border: `1px solid ${toolbarBorder}`, background: '#fff', boxShadow: '0 14px 28px rgba(73,38,20,0.06)', padding: '0 44px 0 16px' }}
            selectedLabelStyle={{ color: toolbarTextPrimary, fontSize: 14, fontWeight: 700 }}
          />

          <div ref={fnbCategoryDropdownRef} style={{ position: 'relative', width: 290, flex: '0 0 290px' }}>
            <button type="button" onClick={() => setIsFnbCategoryDropdownOpen((previous) => !previous)} style={{ position: 'relative', width: '100%', minHeight: controlHeight, borderRadius: controlRadius, border: `1px solid ${toolbarBorder}`, background: '#fff', padding: '0 18px 0 20px', display: 'flex', alignItems: 'center', gap: 12, cursor: 'pointer', boxShadow: '0 14px 28px rgba(73,38,20,0.06)' }}>
              <span style={{ width: 38, height: 38, borderRadius: 14, background: activeCategoryOption.accentSoft, color: activeCategoryOption.accent, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', position: 'relative', flexShrink: 0 }}>
                {React.createElement(ActiveCategoryIcon, { size: 18 })}
                <span style={{ position: 'absolute', right: -4, bottom: -4, width: 18, height: 18, borderRadius: 999, background: '#fff', border: `1px solid ${toolbarBorder}`, color: toolbarTextPrimary, fontSize: 10, fontWeight: 900, display: 'inline-flex', alignItems: 'center', justifyContent: 'center' }}>
                  {String(activeCategoryOption.glyph || 'A').slice(0, 1)}
                </span>
              </span>
              <span style={{ display: 'grid', gap: 2, minWidth: 0, textAlign: 'left', flex: 1 }}>
                <span style={{ fontSize: 12, fontWeight: 800, color: toolbarAccentDark, textTransform: 'uppercase', letterSpacing: '0.06em', lineHeight: 1 }}>Category</span>
                <span style={{ fontSize: 14, fontWeight: 800, color: toolbarTextPrimary, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', lineHeight: 1.15 }}>{activeCategoryOption.label}</span>
              </span>
              <span style={{ fontSize: 12, fontWeight: 800, color: toolbarTextMuted }}>{activeCategoryOption.count}</span>
              <ChevronDown size={18} color={toolbarTextMuted} />
            </button>

            {isFnbCategoryDropdownOpen && (
              <div style={{ position: 'absolute', top: 'calc(100% + 10px)', left: 0, right: 0, zIndex: 40, padding: 10, borderRadius: 18, border: `1px solid ${toolbarBorder}`, background: toolbarSurface, boxShadow: '0 22px 48px rgba(15,23,42,0.14)', display: 'grid', gap: 8, maxHeight: 360, overflowY: 'auto' }}>
                {categoryOptions.map((option) => {
                  const isActive = option.key === (resolvedFnbSection || '');
                  const OptionIcon = FNB_CATEGORY_ICON_MAP[option.iconToken] || Sparkles;
                  return (
                    <button key={`fnb-category-dropdown-${option.key || 'all'}`} type="button" onClick={() => { setActiveServiceTab(option.key); setIsFnbCategoryDropdownOpen(false); }} style={{ width: '100%', borderRadius: 16, border: isActive ? '1px solid transparent' : `1px solid ${toolbarBorder}`, background: isActive ? toolbarAccent : toolbarSurface, color: isActive ? '#fff' : toolbarTextPrimary, padding: '10px 12px', display: 'flex', alignItems: 'center', gap: 12, cursor: 'pointer' }}>
                      <span style={{ width: 38, height: 38, borderRadius: 14, background: isActive ? 'rgba(255,255,255,0.16)' : option.accentSoft, color: isActive ? '#fff' : option.accent, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', position: 'relative', flexShrink: 0 }}>
                        {React.createElement(OptionIcon, { size: 18 })}
                        <span style={{ position: 'absolute', right: -4, bottom: -4, width: 18, height: 18, borderRadius: 999, background: '#fff', border: `1px solid ${isActive ? 'rgba(255,255,255,0.3)' : toolbarBorder}`, color: toolbarTextPrimary, fontSize: 10, fontWeight: 900, display: 'inline-flex', alignItems: 'center', justifyContent: 'center' }}>
                          {String(option.glyph || 'A').slice(0, 1)}
                        </span>
                      </span>
                      <span style={{ display: 'grid', gap: 2, minWidth: 0, textAlign: 'left', flex: 1 }}>
                        <span style={{ fontSize: 14, fontWeight: 800, lineHeight: 1.15 }}>{option.label}</span>
                        <span style={{ fontSize: 11, fontWeight: 700, opacity: isActive ? 0.82 : 0.6 }}>{option.count} item{option.count === 1 ? '' : 's'}</span>
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

export { FnbCatalogToolbar };
