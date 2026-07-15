import React from 'react';
import { ChevronRight, ExternalLink } from 'lucide-react';
import { TrackingDrawerOrderLines } from './TrackingDrawerOrderLines.jsx';
import { TrackingDrawerTotals } from './TrackingDrawerTotals.jsx';
import { TrackingDrawerCardHeader } from './TrackingDrawerCardHeader.jsx';
import {
  deriveTrackingDrawerItems,
  deriveTrackingDrawerTotals,
  formatTrackingDrawerDate,
  resolveTrackingDrawerStatus
} from '../model/trackingDrawerPresentation.js';

export function TrackingDrawerCard({ entry, entryPin, expanded, onToggle, onViewOrder, selectedStore, withAssetOrigin, money }) {
  const status = resolveTrackingDrawerStatus(String(entry.status_label || entry.status || '').trim());
  const storeName = entry.store_name || selectedStore?.tenant_name || 'Storefront';
  const logoSource = entry.store_logo || selectedStore?.storefront_profile_image_url;
  const items = deriveTrackingDrawerItems(entry);
  const totals = deriveTrackingDrawerTotals(entry, money);

  return (
    <div style={{ flexShrink: 0, border: expanded ? '1.5px solid #93c5fd' : '1px solid #e2e8f0', borderRadius: 16, background: '#fff', overflow: 'hidden', boxShadow: expanded ? '0 8px 28px rgba(26,78,141,0.10)' : '0 2px 6px rgba(15,23,42,0.04)', transition: 'border-color 160ms ease, box-shadow 160ms ease' }}>
      <TrackingDrawerCardHeader
        dateLabel={formatTrackingDrawerDate(entry.created_at)}
        entryPin={entryPin}
        expanded={expanded}
        logoSource={logoSource}
        onToggle={onToggle}
        status={status}
        storeName={storeName}
        totalAmount={totals.totalAmount}
        withAssetOrigin={withAssetOrigin}
      />
      {expanded && (
        <div style={{ borderTop: '1px solid #e8f0f8' }}>
          <div style={{ padding: '0 16px 16px' }}>
            <TrackingDrawerOrderLines entryPin={entryPin} items={items} money={money} withAssetOrigin={withAssetOrigin} />
            <TrackingDrawerTotals {...totals} />
          </div>
          <div style={{ borderTop: '1px solid #e8f0f8', padding: '12px 16px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <button type="button" onClick={(event) => { event.stopPropagation(); onViewOrder(); }} style={{ display: 'inline-flex', alignItems: 'center', gap: 6, border: 'none', background: 'transparent', color: '#1a4e8d', fontSize: 13, fontWeight: 700, cursor: 'pointer', padding: 0 }}>
              <ExternalLink size={14} />
              View order details
            </button>
            <ChevronRight size={16} color="#94a3b8" />
          </div>
        </div>
      )}
    </div>
  );
}

