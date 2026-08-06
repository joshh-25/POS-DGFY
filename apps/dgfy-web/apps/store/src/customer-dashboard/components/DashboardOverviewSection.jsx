import React from 'react';
import { OverviewActivityPanel } from './OverviewActivityPanel.jsx';
import { OverviewDefaultAddressCard } from './OverviewDefaultAddressCard.jsx';
import { OverviewIdentityCards } from './OverviewIdentityCards.jsx';
import { OverviewKpiGrid } from './OverviewKpiGrid.jsx';
import { OverviewQuickActions } from './OverviewQuickActions.jsx';

export function DashboardOverviewSection(props) {
  const { isMobileViewport } = props;
  return (
    <div style={{ display: 'grid', gap: isMobileViewport ? 16 : 24 }}>
      <OverviewIdentityCards {...props} />
      <OverviewKpiGrid {...props} />
      <div style={{ display: 'grid', gridTemplateColumns: isMobileViewport ? '1fr' : '2fr 1fr', gap: isMobileViewport ? 16 : 24 }}>
        <OverviewActivityPanel {...props} />
        <OverviewDefaultAddressCard {...props} />
      </div>
      <OverviewQuickActions {...props} />
    </div>
  );
}
