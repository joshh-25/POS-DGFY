import React from 'react';
import { ChevronRight, Home } from 'lucide-react';
import { CustomerDashboardEmptyState } from '../model/customerDashboardPresentation.jsx';
import { CUSTOMER_DASHBOARD_TYPOGRAPHY } from '../model/customerDashboardPresentation.jsx';

export function OverviewDefaultAddressCard({ isMobileViewport, theme, defaultAddress, allAddresses, setActiveNav }) {
  return <>
    {!isMobileViewport ? (
      <div style={{ background: theme.surface, borderRadius: 16, border: `1px solid ${theme.border}`, display: 'flex', flexDirection: 'column' }}>
        <div style={{ padding: 24, borderBottom: `1px solid ${theme.border}` }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 24 }}>
            <div style={{ fontSize: CUSTOMER_DASHBOARD_TYPOGRAPHY.cardTitle, fontWeight: 700, color: theme.text }}>Default Address</div>
            <button onClick={() => setActiveNav('addresses')} style={{ background: 'transparent', border: 'none', color: theme.primary, fontSize: CUSTOMER_DASHBOARD_TYPOGRAPHY.compactAction, fontWeight: 600, cursor: 'pointer' }}>
              Manage addresses
            </button>
          </div>
          {defaultAddress ? (
            <div style={{ display: 'flex', gap: 16, alignItems: 'flex-start' }}>
              <div style={{ width: 48, height: 48, borderRadius: '50%', background: theme.infoBg, color: theme.primary, display: 'grid', placeItems: 'center', flexShrink: 0 }}>
                <Home size={20} />
              </div>
              <div>
                <span style={{ background: theme.successBg, color: theme.success, fontSize: CUSTOMER_DASHBOARD_TYPOGRAPHY.badge, fontWeight: 700, padding: '2px 6px', borderRadius: 4, marginBottom: 4, display: 'inline-block' }}>Default</span>
                <div style={{ fontSize: CUSTOMER_DASHBOARD_TYPOGRAPHY.body, color: theme.muted, lineHeight: 1.5 }}>
                  {defaultAddress.address_line || 'Address line unavailable.'}
                </div>
              </div>
            </div>
          ) : (
            <CustomerDashboardEmptyState title="No addresses" desc="Add an address for faster checkout." isMobileViewport={isMobileViewport} />
          )}
        </div>
        <div style={{ padding: '16px 24px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', cursor: 'pointer' }} onClick={() => setActiveNav('addresses')}>
          <span style={{ fontSize: CUSTOMER_DASHBOARD_TYPOGRAPHY.secondary, color: theme.muted, fontWeight: 500 }}>{allAddresses.length} saved addresses</span>
          <ChevronRight size={16} color={theme.muted} />
        </div>
      </div>
    ) : null}
  </>;
}
