import React from 'react';
import { RetailTrackingDrawerCardHeader } from './RetailTrackingDrawerCardHeader.jsx';
import {
  deriveRetailTrackingDrawerTotals,
  formatRetailTrackingDrawerDate,
  resolveRetailTrackingDrawerStatus
} from '../model/retailTrackingDrawerPresentation.js';

export function RetailTrackingDrawerCard({ entry, entryPin, onViewOrder, selectedStore, withAssetOrigin, money }) {
  const status = resolveRetailTrackingDrawerStatus(String(entry.status_label || entry.status || '').trim());
  const storeName = entry.store_name || selectedStore?.tenant_name || 'Storefront';
  const logoSource = entry.store_logo || selectedStore?.storefront_profile_image_url;
  const totals = deriveRetailTrackingDrawerTotals(entry, money);

  return (
    <div style={{ flexShrink: 0, border: '1px solid #dbe5ee', borderRadius: 16, background: '#fff', overflow: 'hidden', boxShadow: '0 2px 6px rgba(15,23,42,0.04)' }}>
      <RetailTrackingDrawerCardHeader
        dateLabel={formatRetailTrackingDrawerDate(entry.created_at)}
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
