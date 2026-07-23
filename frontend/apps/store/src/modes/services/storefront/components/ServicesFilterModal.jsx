import React from 'react';

import { STYLES } from '../../../../shared/theme/storefrontStyleTokens.js';
import { GhostButton, PrimaryButton } from '../../../../shared/components/StorefrontActionPrimitives.jsx';
import { StorefrontDropdown } from '../../../../features/shared-storefront/components/StorefrontDropdown.jsx';

/**
 * ServicesFilterModal — services-mode filter dialog (availability, service area,
 * duration). Pure view extracted verbatim from StorefrontApp.jsx; the
 * `isServiceFilterOpen` gate stays at the call site.
 */
export function ServicesFilterModal({
  isMobileViewport,
  serviceAvailabilityFilter,
  onAvailabilityChange,
  serviceAreaFilter,
  onAreaChange,
  serviceDurationFilter,
  onDurationChange,
  onClose
}) {
  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 2200,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: isMobileViewport ? 16 : 24
      }}
    >
      <div
        style={{
          position: 'absolute',
          inset: 0,
          background: 'rgba(15,23,42,0.45)',
          backdropFilter: 'blur(4px)'
        }}
      />
      <div
        style={{
          position: 'relative',
          zIndex: 1,
          width: '100%',
          maxWidth: 560,
          background: '#ffffff',
          borderRadius: 22,
          border: '1px solid #e5e7eb',
          boxShadow: '0 24px 60px rgba(15,23,42,0.18)',
          padding: isMobileViewport ? 18 : 22,
          display: 'grid',
          gap: 16
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
          <div>
            <div style={{ fontSize: 18, fontWeight: 900, color: STYLES.colors.dark }}>Filter Services</div>
            <div style={{ marginTop: 4, fontSize: 13, color: STYLES.colors.muted }}>
              Applies services-mode filters using storefront availability, service area, and duration fields from SKUpervisor-backed catalog records.
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            style={{
              width: 36,
              height: 36,
              borderRadius: 999,
              border: '1px solid #e5e7eb',
              background: '#fff',
              color: STYLES.colors.dark,
              cursor: 'pointer',
              fontWeight: 800
            }}
          >
            {'×'}
          </button>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: isMobileViewport ? '1fr' : '1fr 1fr', gap: 12 }}>
          <label style={{ display: 'grid', gap: 6, fontSize: 12, fontWeight: 700, color: STYLES.colors.muted }}>
            Availability
            <StorefrontDropdown
              value={serviceAvailabilityFilter}
              onChange={onAvailabilityChange}
              options={[
                { value: 'all', label: 'All services' },
                { value: 'available', label: 'Available now' },
                { value: 'unavailable', label: 'Unavailable' }
              ]}
              triggerStyle={{ minHeight: 42, borderRadius: 14 }}
              menuStyle={{ borderRadius: 18 }}
            />
          </label>
          <label style={{ display: 'grid', gap: 6, fontSize: 12, fontWeight: 700, color: STYLES.colors.muted }}>
            Service area
            <StorefrontDropdown
              value={serviceAreaFilter}
              onChange={onAreaChange}
              options={[
                { value: 'all', label: 'All areas' },
                { value: 'in_store', label: 'In-store' },
                { value: 'customer_location', label: 'Home / on-site' }
              ]}
              triggerStyle={{ minHeight: 42, borderRadius: 14 }}
              menuStyle={{ borderRadius: 18 }}
            />
          </label>
          <label style={{ display: 'grid', gap: 6, fontSize: 12, fontWeight: 700, color: STYLES.colors.muted }}>
            Duration
            <StorefrontDropdown
              value={serviceDurationFilter}
              onChange={onDurationChange}
              options={[
                { value: 'all', label: 'Any duration' },
                { value: 'short', label: 'Short under 1 hr' },
                { value: 'standard', label: 'Standard 1-2 hrs' },
                { value: 'extended', label: 'Extended 2+ hrs' }
              ]}
              triggerStyle={{ minHeight: 42, borderRadius: 14 }}
              menuStyle={{ borderRadius: 18 }}
            />
          </label>
        </div>

        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10, flexWrap: 'wrap' }}>
          <GhostButton
            style={{ minHeight: 42, fontSize: 13 }}
            onClick={() => {
              onAvailabilityChange('all');
              onAreaChange('all');
              onDurationChange('all');
            }}
          >
            Clear filters
          </GhostButton>
          <PrimaryButton style={{ minHeight: 42, fontSize: 13 }} onClick={onClose}>
            Apply filters
          </PrimaryButton>
        </div>
      </div>
    </div>
  );
}
