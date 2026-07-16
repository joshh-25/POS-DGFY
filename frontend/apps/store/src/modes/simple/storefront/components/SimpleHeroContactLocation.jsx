import React from 'react';
import { Maximize } from 'lucide-react';
import { StoresMap } from '../../../../discovery/components/StoresMap.jsx';
import { getStorefrontContactIcon } from '../../../../features/shared-storefront/utils/storefrontDisplayUtils.jsx';

const SimpleHeroContactLocation = ({
  STYLES,
  STOREFRONT_CONTACT_INFO_COLUMNS,
  STOREFRONT_INFO_ICON_COLUMN,
  STOREFRONT_INFO_ROW_GAP,
  StorefrontExpandableBusinessHours,
  hasAboutSection,
  hasContactRows,
  hasMapData,
  heroTheme,
  isMobileViewport,
  openStorefrontActionLink,
  setIsExpandedMapOpen,
  simpleHeroModel,
  visibleContactRows
}) => (
  <div style={{ display: 'grid', gap: 14, paddingLeft: (!isMobileViewport && hasAboutSection) ? 26 : 0, borderLeft: (!isMobileViewport && hasAboutSection) ? '1px solid #eef2f6' : 'none', alignContent: 'start' }}>
    <div style={{ fontSize: 13, fontWeight: 800, color: STYLES.colors.dark, textTransform: 'uppercase', letterSpacing: '0.06em', fontFamily: heroTheme.bodyFont }}>Contact & Location</div>
    <div style={{ display: 'grid', gridTemplateColumns: hasMapData && !isMobileViewport ? STOREFRONT_CONTACT_INFO_COLUMNS : '1fr', gap: 20, alignItems: 'start' }}>
      {hasContactRows && (
        <div style={{ display: 'grid', gap: 16, alignContent: 'start', paddingTop: 4 }}>
          {visibleContactRows.map((row) => {
            const icon = getStorefrontContactIcon(row.label);
            const isCompactSingleLine = !isMobileViewport && ['call', 'phone', 'facebook', 'messenger', 'message', 'hours'].includes(String(row.label || '').trim().toLowerCase());
            const content = (
              <div style={{ display: 'grid', gridTemplateColumns: `${STOREFRONT_INFO_ICON_COLUMN}px minmax(0, 1fr)`, alignItems: 'start', columnGap: STOREFRONT_INFO_ROW_GAP, fontSize: 13, color: '#111827', fontFamily: heroTheme.bodyFont }}>
                <div style={{ width: STOREFRONT_INFO_ICON_COLUMN, minWidth: STOREFRONT_INFO_ICON_COLUMN, color: heroTheme.accentDark || STYLES.colors.brandDark, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, marginTop: 1 }}>{icon}</div>
                <div style={{ minWidth: 0, display: 'grid', gap: row.actionHref ? 4 : 0 }}>
                  {row.label === 'Hours' && row.rawHoursData ? (
                    <StorefrontExpandableBusinessHours schedule={row.rawHoursData} theme={heroTheme} />
                  ) : (
                    <div style={{ fontSize: 13, fontWeight: 600, color: '#334155', whiteSpace: isCompactSingleLine ? 'nowrap' : 'normal', wordBreak: isCompactSingleLine ? 'normal' : 'break-word', lineHeight: 1.35 }}>{row.value}</div>
                  )}
                  {row.actionHref ? (
                    <button type="button" onClick={(event) => { event.preventDefault(); event.stopPropagation(); openStorefrontActionLink(row.actionHref); }} style={{ padding: 0, border: 'none', background: 'transparent', color: heroTheme.accent || STYLES.colors.brand, fontSize: 12, fontWeight: 800, cursor: 'pointer', justifySelf: 'start', fontFamily: heroTheme.bodyFont }}>
                      {row.actionLabel || 'Open'}
                    </button>
                  ) : null}
                </div>
              </div>
            );
            return row.href ? (
              <button key={row.label} type="button" onClick={() => openStorefrontActionLink(row.href)} style={{ padding: 0, border: 'none', background: 'transparent', textAlign: 'left', cursor: 'pointer' }}>
                {content}
              </button>
            ) : (
              <div key={row.label}>{content}</div>
            );
          })}
        </div>
      )}

      {hasMapData && (
        <div style={{ display: 'grid', gap: 10, alignContent: 'start', marginTop: isMobileViewport ? 0 : -30 }}>
          <div style={{ position: 'relative', width: '100%', height: 156, borderRadius: 14, overflow: 'hidden', border: '1px solid #edf2f7', background: '#f8fafc' }}>
            <StoresMap stores={simpleHeroModel.mapStores} selectedKey={simpleHeroModel.mapSelectedKey} onSelectStore={() => { }} />
            <button
              type="button"
              onClick={() => setIsExpandedMapOpen(true)}
              aria-label="Open large map"
              title="Open large map"
              style={{
                position: 'absolute',
                top: 12,
                right: 12,
                width: 36,
                height: 36,
                borderRadius: 10,
                background: '#fff',
                border: '1px solid #cbd5e1',
                boxShadow: '0 4px 12px rgba(15,23,42,0.1)',
                display: 'grid',
                placeItems: 'center',
                cursor: 'pointer',
                color: '#334155',
                zIndex: 10
              }}
            >
              <Maximize size={18} />
            </button>
          </div>
        </div>
      )}
    </div>
  </div>
);

export { SimpleHeroContactLocation };

