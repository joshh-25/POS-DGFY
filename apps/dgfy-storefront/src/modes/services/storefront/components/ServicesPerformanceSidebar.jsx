import React from 'react';
import { Sparkles } from 'lucide-react';

import { Badge } from '../../../../shared/components/StorefrontActionPrimitives.jsx';
import { STYLES } from '../../../../shared/theme/storefrontStyleTokens.js';
import { parseOptionalObject } from '../../../../shared/model/storefrontJsonModel.js';
import { SERVICE_CATEGORY_ICON_MAP } from '../model/serviceCategoryIconMap.jsx';
import { SERVICES_PALETTE } from '../../servicesPalette.js';
import { formatServiceNumber } from '../../servicesFormatters.js';

/**
 * ServicesPerformanceSidebar — desktop services aside: review-score performance
 * summary, optional service-family quick nav, and an optional promo card.
 *
 * Pure view extracted verbatim from StorefrontApp.jsx (services desktop sidebar).
 * The `isServicesMode && !isMobileViewport` gate stays at the call site.
 */
export function ServicesPerformanceSidebar({
  selectedStore,
  isMultiGroup,
  servicesViewModel,
  resolvedTab,
  onSelectServiceTab
}) {
  return (
    <aside style={{ display: 'grid', gap: 24, alignContent: 'start' }}>
      <div style={{ padding: 24, background: SERVICES_PALETTE.surface, borderRadius: STYLES.radius.card, border: `1px solid ${SERVICES_PALETTE.border}`, boxShadow: SERVICES_PALETTE.cardShadow }}>
        <div style={{ fontSize: 12, fontWeight: 800, color: SERVICES_PALETTE.textPrimary, letterSpacing: '0.08em', textTransform: 'uppercase', marginBottom: 20 }}>Performance Summary</div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 16, marginBottom: 20 }}>
          <div style={{ fontSize: 48, fontWeight: 900, color: SERVICES_PALETTE.textPrimary }}>{selectedStore.storefront_review_summary?.score?.toFixed(1) || '0.0'}</div>
          <div>
            <div style={{ color: SERVICES_PALETTE.warning, fontSize: 18 }}>*****</div>
            <div style={{ fontSize: 12, color: SERVICES_PALETTE.textMuted }}>from {formatServiceNumber(selectedStore.storefront_review_summary?.total_count || 0)} reviews</div>
          </div>
        </div>
        {isMultiGroup && (
          <div style={{ display: 'grid', gap: 8 }}>
            <div style={{ fontSize: 11, fontWeight: 700, color: SERVICES_PALETTE.textMuted, textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 4 }}>Service Families</div>
            {servicesViewModel.serviceGroups.map(group => {
              const GroupIcon = SERVICE_CATEGORY_ICON_MAP[group.categoryMeta?.iconToken] || Sparkles;
              return (
                <button
                  key={group.categoryKey}
                  type="button"
                  onClick={() => onSelectServiceTab(group.categoryKey)}
                  style={{
                    display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                    padding: '10px 14px', borderRadius: 12,
                    border: resolvedTab === group.categoryKey ? `1.5px solid ${group.categoryMeta.accent}` : `1px solid ${SERVICES_PALETTE.border}`,
                    background: resolvedTab === group.categoryKey ? group.categoryMeta.accentBg || SERVICES_PALETTE.primarySoft : SERVICES_PALETTE.surface,
                    color: resolvedTab === group.categoryKey ? group.categoryMeta.accent : SERVICES_PALETTE.textSecondary,
                    fontWeight: 700, fontSize: 13, cursor: 'pointer', textAlign: 'left',
                    transition: 'all 0.16s ease'
                  }}
                >
                  <span style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}>
                    <GroupIcon size={16} />
                    <span>{group.categoryMeta.label}</span>
                  </span>
                  <span style={{ fontSize: 12, fontWeight: 800, opacity: 0.8 }}>{formatServiceNumber(group.items.length)} services</span>
                </button>
              );
            })}
          </div>
        )}
      </div>

      {(() => {
        const promo = parseOptionalObject(selectedStore.storefront_promo);
        if (!promo || !promo.active) return null;
        return (
          <div style={{
            padding: 24, borderRadius: STYLES.radius.card, background: `linear-gradient(135deg, ${SERVICES_PALETTE.primary}, ${SERVICES_PALETTE.primaryDark})`,
            color: SERVICES_PALETTE.surface, boxShadow: SERVICES_PALETTE.cardShadow
          }}>
            <Badge background="rgba(255,255,255,0.2)" color="#fff">{promo.badge || 'PROMO'}</Badge>
            <div style={{ marginTop: 16, fontSize: 24, fontWeight: 900 }}>{promo.title}</div>
            <p style={{ marginTop: 8, fontSize: 14, opacity: 0.9 }}>{promo.subtitle}</p>
          </div>
        );
      })()}
    </aside>
  );
}
