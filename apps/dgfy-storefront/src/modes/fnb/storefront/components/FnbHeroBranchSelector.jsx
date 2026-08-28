import { MapPin } from 'lucide-react';
import { StorefrontDropdown } from '../../../../features/shared-storefront/components/StorefrontDropdown.jsx';

export function FnbHeroBranchSelector({
  bodyFont,
  hasSelectedBranchFromMenu,
  isMobileViewport,
  mobileDropdownMenuStyle,
  mobileDropdownOptionStyle,
  mobileNativeSelectStyle,
  onChange,
  selectedLocationId,
  storeLocations,
  textColor
}) {
  const options = (Array.isArray(storeLocations) ? storeLocations : []).map((location) => ({
    value: location.location_id,
    label: location.name || location.address_line || `Branch ${location.location_id}`
  }));

  if (options.length === 0) return null;

  if (isMobileViewport) {
    return (
      <StorefrontDropdown
        value={selectedLocationId ?? ''}
        onChange={onChange}
        options={options}
        triggerStyle={mobileNativeSelectStyle}
        containerStyle={{ minWidth: 0 }}
        menuStyle={mobileDropdownMenuStyle}
        optionStyle={mobileDropdownOptionStyle}
        selectedLabelStyle={{ fontSize: 14, fontWeight: 700 }}
      />
    );
  }

  return (
    <label style={{ display: 'inline-flex', alignItems: 'center', gap: hasSelectedBranchFromMenu ? 6 : 8, color: textColor, fontSize: 14, fontWeight: 700, cursor: 'pointer', fontFamily: bodyFont || '"Source Sans 3", "Segoe UI", sans-serif', minWidth: 0, maxWidth: 236, flex: '0 1 236px' }}>
      <MapPin size={16} />
      {!hasSelectedBranchFromMenu && <span>Branch:</span>}
      <StorefrontDropdown
        value={selectedLocationId ?? ''}
        onChange={onChange}
        options={options}
        triggerStyle={{
          minHeight: 34,
          border: 'none',
          background: 'transparent',
          boxShadow: 'none',
          padding: '4px 34px 4px 2px',
          fontFamily: bodyFont || '"Source Sans 3", "Segoe UI", sans-serif'
        }}
        containerStyle={{ minWidth: 0, flex: '1 1 auto' }}
        menuPlacement="bottom-end"
        menuStyle={{ minWidth: 320, width: 'max-content', maxWidth: 'min(420px, calc(100vw - 32px))', padding: 10 }}
        optionStyle={{ padding: '12px 18px', fontFamily: bodyFont || '"Source Sans 3", "Segoe UI", sans-serif' }}
        selectedLabelStyle={{ fontSize: 14, fontWeight: 700 }}
      />
    </label>
  );
}
