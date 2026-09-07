import React from 'react';
import { TrackingDrawerCardHeader } from './TrackingDrawerCardHeader.jsx';
import {
  deriveTrackingDrawerTotals,
  formatTrackingDrawerDate,
  resolveTrackingDrawerStatus
} from '../model/trackingDrawerPresentation.js';

export function TrackingDrawerCard({ entry, entryPin, onViewOrder, selectedStore, withAssetOrigin, money }) {
  const status = resolveTrackingDrawerStatus(String(entry.status_label || entry.status || '').trim());
  const storeName = entry.store_name || selectedStore?.tenant_name || 'Storefront';
  const logoSource = entry.store_logo || selectedStore?.storefront_profile_image_url;
  const totals = deriveTrackingDrawerTotals(entry, money);

  return (
    <div style={{ flexShrink: 0, border: '1px solid #dbe5ee', borderRadius: 16, background: '#fff', overflow: 'hidden', boxShadow: '0 2px 6px rgba(15,23,42,0.04)' }}>
      <TrackingDrawerCardHeader
        dateLabel={formatTrackingDrawerDate(entry.created_at)}
        entryPin={entryPin}
        logoSource={logoSource}
        onViewOrder={onViewOrder}
        status={status}
        storeName={storeName}
        totalAmount={totals.totalAmount}
        withAssetOrigin={withAssetOrigin}
      />
    </div>
  );
}
