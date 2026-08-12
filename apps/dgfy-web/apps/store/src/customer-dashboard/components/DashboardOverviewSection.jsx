import React from 'react';
import { OverviewActivityPanel } from './OverviewActivityPanel.jsx';
import { OverviewDefaultAddressCard } from './OverviewDefaultAddressCard.jsx';
import { OverviewIdentityCards } from './OverviewIdentityCards.jsx';
import { OverviewKpiGrid } from './OverviewKpiGrid.jsx';
import { OverviewQuickActions } from './OverviewQuickActions.jsx';
import { OverviewDiscoveryCta } from './OverviewDiscoveryCta.jsx';

export function DashboardOverviewSection(props) {
  const { isMobileViewport } = props;
  return (
    <div style={{ display: 'grid', gridTemplateColumns: '1fr', gap: 24 }}>
      <div data-testid="overview-discovery-layout" style={{ display: 'grid', gridTemplateColumns: isMobileViewport ? '1fr' : 'minmax(0, 1.15fr) minmax(0, 1fr)', gap: isMobileViewport ? 16 : 24, alignItems: 'stretch' }}>
        <OverviewIdentityCards {...props} />
        <OverviewDiscoveryCta {...props} />
      </div>
      <OverviewKpiGrid {...props} />
      <div style={{ display: 'grid', gridTemplateColumns: isMobileViewport ? '1fr' : '2fr 1fr', gap: isMobileViewport ? 16 : 24 }}>
        <OverviewActivityPanel {...props} />
        <OverviewDefaultAddressCard {...props} />
      </div>
      <OverviewQuickActions {...props} />
    </div>
  );
}
