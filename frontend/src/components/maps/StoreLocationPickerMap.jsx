import React from 'react';
import MapPinPicker from './MapPinPicker.jsx';

export default function StoreLocationPickerMap({
  latitude,
  longitude,
  deliveryRadiusKm = 0,
  onCoordinatesChange,
  disabled = false
}) {
  if (disabled) {
    return (
      <div className="rounded-xl border border-slate-200 bg-slate-50 p-4 text-sm text-slate-600">
        Location map is unavailable while this form is disabled.
      </div>
    );
  }

  return (
    <MapPinPicker
      latitude={latitude}
      longitude={longitude}
      deliveryRadiusKm={deliveryRadiusKm}
      onChange={onCoordinatesChange}
    />
  );
}
