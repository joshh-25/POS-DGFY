import React, { lazy, Suspense } from 'react';
import { CheckCircle2, Pencil, Store } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { STOREFRONT_TYPOGRAPHY } from '../../../../../packages/web-core/src/features/pos/settings/StorefrontSectionPrimitives.jsx';

const MapPinPicker = lazy(() => import('../../../../../packages/web-core/src/components/maps/MapPinPicker.jsx'));
const REGISTRATION_LOCATION_MAP_HEIGHT_CLASS = 'h-[150px] rounded-xl sm:h-[340px] lg:h-[420px]';

const getLocationAddress = (location) => String(
  location?.address_line || location?.address || location?.formatted_address || location?.full_address || ''
).trim();

const isCoordinateValid = (value, min, max) => {
  if (value === null || value === undefined || String(value).trim() === '') return false;
  const coordinate = Number(value);
  return Number.isFinite(coordinate) && coordinate >= min && coordinate <= max;
};

const hasCoordinates = (location) => (
  isCoordinateValid(location?.latitude, -90, 90)
  && isCoordinateValid(location?.longitude, -180, 180)
);

function RegistrationBranchLocationPanel({
  location = {},
  candidate,
  onCandidateChange,
  onAddressChange,
  onAdd,
  onCancel,
  onChangeLocation,
  disabled = false
}) {
  const hasAddedLocation = Boolean(getLocationAddress(location) && hasCoordinates(location));
  const isCandidateReady = Boolean(candidate && getLocationAddress(candidate) && hasCoordinates(candidate));
  const shouldHighlightLocationSearch = hasAddedLocation && Boolean(candidate);
  const shownLocation = candidate || location;
  const selectedAddress = getLocationAddress(candidate);
  const locationEditorAction = (
    <Button
      type="button"
      onClick={onAdd}
      disabled={disabled || !isCandidateReady}
      aria-label={hasAddedLocation ? 'Update branch location' : 'Add branch location'}
      className="h-11 min-h-11 w-auto shrink-0 whitespace-nowrap rounded-lg bg-[#1A4E8D] px-2 text-xs font-extrabold text-white hover:bg-[#143F73] sm:px-3"
    >
      {hasAddedLocation ? 'Update location' : 'Add location'}
    </Button>
  );

  return (
    <div className="min-w-0 space-y-3">
      <section className="min-w-0 rounded-lg border border-slate-200 p-3 sm:p-4" aria-label="Branch location selection">
        <div className="flex items-center gap-2">
          <Store className="h-4 w-4 text-[#1A4E8D]" aria-hidden="true" />
          <h3 className={STOREFRONT_TYPOGRAPHY.itemLabel}>
            {candidate ? 'Selected location' : hasAddedLocation ? 'Branch location added' : 'Choose a location'}
          </h3>
          {hasAddedLocation && !candidate ? (
            <Button
              type="button"
              variant="outline"
              onClick={onChangeLocation}
              disabled={disabled}
              aria-label="Change branch location"
              title="Change location"
              className="ml-auto h-10 w-10 min-h-10 shrink-0 rounded-lg border-blue-200 p-0 text-[#1A4E8D] hover:bg-blue-50 focus-visible:ring-2 focus-visible:ring-blue-300"
            >
              <Pencil className="h-4 w-4" aria-hidden="true" />
            </Button>
          ) : null}
        </div>

        {candidate ? (
          <div className="mt-3">
            <p className="text-xs leading-5 text-slate-500">Review the address, then add this place as your first branch location.</p>
            <div className="grid gap-1.5">
              <Label htmlFor="registration-address" className={STOREFRONT_TYPOGRAPHY.fieldLabel}>Business address</Label>
              <Input
                id="registration-address"
                value={selectedAddress}
                onChange={(event) => onAddressChange(event.target.value.slice(0, 255))}
                placeholder="Street, City, Province"
                disabled={disabled}
                aria-required="true"
                className="h-9 rounded-lg border-slate-200 text-[13px]"
              />
            </div>
            {!isCandidateReady ? (
              <p className="text-xs leading-5 text-slate-500" role="status">
                {hasCoordinates(candidate)
                  ? 'Add a business address to use this map pin.'
                  : 'Choose a point on the map and provide its address before adding the branch.'}
              </p>
            ) : null}
            <div className="mt-3 flex justify-end">
              <Button
                type="button"
                variant="outline"
                onClick={onCancel}
                disabled={disabled}
                className="min-h-10 rounded-lg border-rose-200/70 bg-rose-50/70 px-3 text-xs font-bold text-rose-700 hover:bg-rose-100/80 focus-visible:ring-2 focus-visible:ring-rose-300"
              >
                Cancel
              </Button>
            </div>
          </div>
        ) : hasAddedLocation ? (
          <div className="mt-3 space-y-3">
            <div className="rounded-lg border border-emerald-200 bg-emerald-50/70 p-3" role="status" aria-live="polite">
              <div className="flex items-start gap-2">
                <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-emerald-700" aria-hidden="true" />
                <div className="min-w-0">
                  <p className="text-xs font-bold text-emerald-900">Added to registration draft</p>
                  <p className="mt-1 break-words text-xs leading-5 text-emerald-900">{getLocationAddress(location)}</p>
                  <p className="mt-1 text-xs leading-5 text-emerald-800">It becomes active after your registration is approved.</p>
                </div>
              </div>
            </div>
          </div>
        ) : (
          <p className="mt-3 rounded-lg border border-blue-100 bg-blue-50/70 p-3 text-xs leading-5 text-slate-700" role="status">
            Search for an address below or click the map to place a pin. Then add it as your first branch location.
          </p>
        )}
      </section>

      <div className="min-w-0">
        <Suspense fallback={<div className="flex h-[260px] items-center justify-center rounded-2xl border border-slate-200 bg-slate-50 px-3 text-center text-xs text-slate-500 sm:h-[340px] lg:h-[420px]">Loading map picker…</div>}>
          <MapPinPicker
            latitude={shownLocation.latitude}
            longitude={shownLocation.longitude}
            addressLine={getLocationAddress(shownLocation)}
            onChange={onCandidateChange}
            defaultAdjustMode
            locationEditorMode
            locationEditorAction={locationEditorAction}
            mapHeightClassName={REGISTRATION_LOCATION_MAP_HEIGHT_CLASS}
            searchInputClassName={shouldHighlightLocationSearch
              ? 'ring-2 ring-blue-300/70 ring-offset-2 ring-offset-white shadow-[0_0_14px_rgba(59,130,246,0.20)] transition-shadow duration-200'
              : ''}
          />
        </Suspense>
      </div>
    </div>
  );
}

export default RegistrationBranchLocationPanel;
