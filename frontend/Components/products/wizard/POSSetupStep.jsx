import React from 'react';
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { resolveAssetUrl } from '@/src/utils/assetUrl.js';
import StorefrontImageCarousel from '@/components/items/StorefrontImageCarousel';

const STOREFRONT_ITEM_IMAGE_MAX_COUNT = 5;

const parseStorefrontImageGallery = (value) => {
  if (Array.isArray(value)) return value;
  if (typeof value !== 'string') return [];

  try {
    const parsed = JSON.parse(value);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
};

export default function POSSetupStep({
  data = {},
  updateData,
  productItem,
  locations = [],
  posConfig,
  storefrontConfig,
  showStorefrontCatalogControls = true,
  onTogglePosVisibility,
  onUploadPosImage,
  onDeletePosImage,
  onToggleStorefrontVisibility,
  onToggleStorefrontLocationAvailability,
  onUploadStorefrontImage,
  onSetPrimaryStorefrontImage,
  onDeleteStorefrontImage,
  onOpenBulkPosSetup
}) {
  const missing = Array.isArray(posConfig?.pos_readiness?.missing_requirements)
    ? posConfig.pos_readiness.missing_requirements
    : [];
  const storefrontGallery = React.useMemo(() => {
    const entries = parseStorefrontImageGallery(storefrontConfig?.storefront_image_gallery);
    const gallery = entries
      .map((entry, index) => ({
        path: entry?.path || null,
        url: entry?.url || entry?.image_url || entry,
        is_primary: index === 0,
        sort_order: index
      }))
      .filter((entry) => entry.path || entry.url);
    const primaryUrl = storefrontConfig?.storefront_image_url || null;
    if (primaryUrl && !gallery.some((entry) => entry.url === primaryUrl)) {
      gallery.unshift({
        path: storefrontConfig?.storefront_image_path || null,
        url: primaryUrl,
        is_primary: true,
        sort_order: 0
      });
    }
    return gallery.map((entry, index) => ({
      ...entry,
      is_primary: index === 0,
      sort_order: index
    }));
  }, [storefrontConfig]);
  const storefrontLocationAvailability = React.useMemo(() => {
    const activeLocations = (Array.isArray(locations) ? locations : [])
      .filter((location) => location?.is_active !== false);
    const configuredRows = productItem
      ? (Array.isArray(storefrontConfig?.location_availability) ? storefrontConfig.location_availability : [])
      : (Array.isArray(data?.storefront_location_availability) ? data.storefront_location_availability : []);
    const configuredByLocationId = new Map(configuredRows.map((row) => [
      String(row?.location_id),
      row
    ]));
    return activeLocations.map((location) => {
      const configured = configuredByLocationId.get(String(location?.location_id));
      return {
        location_id: location.location_id,
        name: location.name,
        is_primary_storefront: location.is_primary_storefront === true,
        storefront_available: configured?.storefront_available !== false
      };
    });
  }, [data?.storefront_location_availability, locations, productItem, storefrontConfig]);

  const handleStorefrontLocationAvailabilityChange = (locationId, checked) => {
    const normalizedLocationId = Number.parseInt(locationId, 10);
    if (!Number.isInteger(normalizedLocationId) || normalizedLocationId <= 0) return;

    if (productItem) {
      onToggleStorefrontLocationAvailability?.(productItem, normalizedLocationId, checked);
      return;
    }

    if (!updateData) return;
    const sourceRows = storefrontLocationAvailability.length > 0 ? storefrontLocationAvailability : [];
    const hasLocationRow = sourceRows.some((row) => Number(row?.location_id) === normalizedLocationId);
    const nextRows = hasLocationRow
      ? sourceRows.map((row) => (
        Number(row?.location_id) === normalizedLocationId
          ? { ...row, storefront_available: Boolean(checked) }
          : row
      ))
      : [
        ...sourceRows,
        {
          location_id: normalizedLocationId,
          storefront_available: Boolean(checked)
        }
      ];
    updateData({ storefront_location_availability: nextRows });
  };

  return (
    <div className="space-y-6">
      <div className="rounded-xl border border-teal-200 bg-teal-50 p-4">
        <h3 className="mb-1 font-semibold text-teal-900">POS Setup</h3>
        <p className="text-sm text-teal-700">
          Configure POS visibility and menu image from the product wizard.
        </p>
      </div>
      <div className="space-y-3 rounded-lg border border-slate-200 bg-slate-50 p-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <Label>POS Controls</Label>
            <p className="text-xs text-slate-500">Use wizard-first POS setup to keep item cards compact.</p>
          </div>
          <div className="flex flex-wrap gap-2">
            {productItem && (
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => onTogglePosVisibility && onTogglePosVisibility(productItem, !(posConfig?.pos_visible !== false))}
                disabled={!onTogglePosVisibility}
              >
                {posConfig?.pos_visible !== false ? 'Disable in POS' : 'Enable in POS'}
              </Button>
            )}
            {onOpenBulkPosSetup && (
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={onOpenBulkPosSetup}
              >
                Open Bulk POS Setup
              </Button>
            )}
          </div>
        </div>

        {missing.length > 0 && (
          <div className="rounded-md border border-amber-200 bg-amber-50 p-3">
            <p className="text-xs font-semibold text-amber-900">POS readiness requirements</p>
            <ul className="mt-1 list-disc space-y-1 pl-4 text-xs text-amber-800">
              {missing.map((entry, index) => (
                <li key={`${entry?.code || 'missing'}-${index}`}>
                  {entry?.label || entry?.code || 'Complete missing requirement'}
                </li>
              ))}
            </ul>
          </div>
        )}

        {productItem ? (
          <div className="space-y-3">
            {posConfig?.pos_image_url ? (
              <img
                src={resolveAssetUrl(posConfig.pos_image_url)}
                alt={`${productItem?.name || 'Product'} POS menu`}
                className="h-28 w-40 rounded-md border border-slate-200 object-cover"
              />
            ) : (
              <p className="text-sm text-slate-500">No POS image uploaded yet.</p>
            )}
            <div className="flex flex-wrap gap-2">
              <label className="cursor-pointer rounded-md border border-slate-300 bg-white px-3 py-2 text-sm hover:bg-slate-100">
                Upload Image
                <input
                  type="file"
                  accept="image/*"
                  className="hidden"
                  onChange={(event) => {
                    const file = event.target.files?.[0];
                    if (file && onUploadPosImage) {
                      onUploadPosImage(productItem, file);
                    }
                    event.target.value = '';
                  }}
                />
              </label>
              <Button
                type="button"
                variant="outline"
                onClick={() => onDeletePosImage && onDeletePosImage(productItem)}
                disabled={!posConfig?.pos_image_url || !onDeletePosImage}
              >
                Remove Image
              </Button>
            </div>
          </div>
        ) : (
          <p className="text-sm text-slate-500">
            Save the product first, then reopen it to configure POS visibility and menu image.
          </p>
        )}
      </div>

      {showStorefrontCatalogControls && (
      <div className="space-y-3 rounded-lg border border-slate-200 bg-slate-50 p-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <Label>Storefront Catalog</Label>
            <p className="text-xs text-slate-500">Customer-facing visibility and item image are independent from POS.</p>
          </div>
          {productItem && (
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => onToggleStorefrontVisibility && onToggleStorefrontVisibility(productItem, !(storefrontConfig?.storefront_visible !== false))}
              disabled={!onToggleStorefrontVisibility}
            >
              {storefrontConfig?.storefront_visible !== false ? 'Disable in Storefront' : 'Enable in Storefront'}
            </Button>
          )}
        </div>

        {storefrontLocationAvailability.length > 0 && (
          <div className="rounded-md border border-slate-200 bg-white p-3">
            <div className="mb-2 flex items-center justify-between gap-3">
              <div>
                <p className="text-sm font-semibold text-slate-900">Branch availability</p>
                <p className="text-xs text-slate-500">Controls where this product appears inside the tenant store.</p>
              </div>
              <Badge variant="outline">
                {storefrontLocationAvailability.filter((row) => row.storefront_available !== false).length}/{storefrontLocationAvailability.length}
              </Badge>
            </div>
            <div className="grid gap-2 sm:grid-cols-2">
              {storefrontLocationAvailability.map((location) => (
                <div key={location.location_id} className="flex items-center justify-between gap-3 rounded-md border border-slate-100 px-3 py-2">
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium text-slate-800">{location.name || `Location ${location.location_id}`}</p>
                    <p className="text-xs text-slate-500">{location.is_primary_storefront ? 'Main branch' : 'Branch'}</p>
                  </div>
                  <Switch
                    checked={location.storefront_available !== false}
                    onCheckedChange={(checked) => handleStorefrontLocationAvailabilityChange(location.location_id, checked)}
                    disabled={productItem ? !onToggleStorefrontLocationAvailability : !updateData}
                    aria-label={`Toggle storefront availability for ${location.name || location.location_id}`}
                  />
                </div>
              ))}
            </div>
          </div>
        )}

        {productItem ? (
          <div className="space-y-3">
            {storefrontGallery.length > 0 ? (
              <StorefrontImageCarousel
                gallery={storefrontGallery}
                itemName={productItem?.name || 'Product'}
                variant="wizard"
                onSetPrimary={(index) => onSetPrimaryStorefrontImage && onSetPrimaryStorefrontImage(productItem, index)}
                onRemove={(index) => onDeleteStorefrontImage && onDeleteStorefrontImage(productItem, index)}
              />
            ) : (
              <p className="text-sm text-slate-500">No item image uploaded yet.</p>
            )}
            <div className="flex flex-wrap gap-2">
              <label
                className={`rounded-md border border-slate-300 px-3 py-2 text-sm ${storefrontGallery.length >= STOREFRONT_ITEM_IMAGE_MAX_COUNT ? 'cursor-not-allowed bg-slate-100 text-slate-400' : 'cursor-pointer bg-white hover:bg-slate-100'}`}
                aria-disabled={storefrontGallery.length >= STOREFRONT_ITEM_IMAGE_MAX_COUNT}
              >
                Add Item Images
                <input
                  type="file"
                  accept="image/*"
                  multiple
                  className="hidden"
                  onChange={(event) => {
                    const remainingSlots = STOREFRONT_ITEM_IMAGE_MAX_COUNT - storefrontGallery.length;
                    const files = Array.from(event.target.files || []).slice(0, Math.max(remainingSlots, 0));
                    if (files.length && onUploadStorefrontImage) {
                      onUploadStorefrontImage(productItem, files);
                    }
                    event.target.value = '';
                  }}
                  disabled={storefrontGallery.length >= STOREFRONT_ITEM_IMAGE_MAX_COUNT}
                />
              </label>
              <p className="basis-full text-xs text-slate-500">
                {Math.max(STOREFRONT_ITEM_IMAGE_MAX_COUNT - storefrontGallery.length, 0)} of {STOREFRONT_ITEM_IMAGE_MAX_COUNT} image slots remaining.
              </p>
              <Button
                type="button"
                variant="outline"
                onClick={() => onDeleteStorefrontImage && onDeleteStorefrontImage(productItem)}
                disabled={storefrontGallery.length === 0 || !onDeleteStorefrontImage}
              >
                Remove All Item Images
              </Button>
            </div>
          </div>
        ) : (
          <p className="text-sm text-slate-500">
            Save the product first, then reopen it to configure storefront visibility and item image.
          </p>
        )}
        </div>
        )}
      </div>
    );
  }
