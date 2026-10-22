import React from 'react';
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import StorefrontImageCarousel from '@/components/items/StorefrontImageCarousel';
import SelectedItemImageCarousel from '@/components/items/SelectedItemImageCarousel';
import { toast } from 'sonner';

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
  onTogglePosAlwaysAvailable,
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
        variants: entry?.variants || entry?.image_variants || null,
        is_primary: index === 0,
        sort_order: index
      }))
      .filter((entry) => entry.path || entry.url);
    const primaryUrl = storefrontConfig?.storefront_image_url || null;
    if (primaryUrl && !gallery.some((entry) => entry.url === primaryUrl)) {
      gallery.unshift({
        path: storefrontConfig?.storefront_image_path || null,
        url: primaryUrl,
        variants: storefrontConfig?.storefront_image_variants || null,
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

  const selectedStorefrontImageFiles = Array.isArray(data?.storefront_image_files)
    ? data.storefront_image_files.filter(Boolean).slice(0, STOREFRONT_ITEM_IMAGE_MAX_COUNT)
    : [];

  const handleSelectStorefrontImageFiles = (selectedFiles) => {
    if (!updateData) return;
    const remainingSlots = Math.max(STOREFRONT_ITEM_IMAGE_MAX_COUNT - selectedStorefrontImageFiles.length, 0);
    const files = (Array.isArray(selectedFiles) ? selectedFiles : []).slice(0, remainingSlots);
    if (selectedFiles.length > files.length) {
      toast.error(`Only ${remainingSlots} more item image${remainingSlots === 1 ? '' : 's'} can be selected. Galleries are limited to ${STOREFRONT_ITEM_IMAGE_MAX_COUNT} images.`);
    }
    if (files.length === 0) return;
    updateData({
      storefront_image_files: [...selectedStorefrontImageFiles, ...files].slice(0, STOREFRONT_ITEM_IMAGE_MAX_COUNT)
    });
  };

  const removeSelectedStorefrontImageFile = (imageIndex) => {
    if (!updateData) return;
    updateData({
      storefront_image_files: selectedStorefrontImageFiles.filter((_, index) => index !== imageIndex)
    });
  };

  return (
    <div className="space-y-6">
      <div className="space-y-3 rounded-lg border border-slate-200 bg-slate-50 p-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <Label>POS Controls</Label>
            <p className="text-xs text-slate-500">Use wizard-first POS setup to keep item cards compact.</p>
          </div>
        </div>

        {productItem && (
          <div className="product-wizard-toggle-list">
            <div className="product-wizard-toggle-row">
              <div className="product-wizard-toggle-row__copy">
                <Label htmlFor="product-pos-visible-toggle">Visible in POS</Label>
                <p>Show this item on POS terminal cards.</p>
              </div>
              <Switch
                id="product-pos-visible-toggle"
                checked={posConfig?.pos_visible !== false}
                onCheckedChange={(checked) => onTogglePosVisibility && onTogglePosVisibility(productItem, checked)}
                disabled={!onTogglePosVisibility}
                aria-label={posConfig?.pos_visible !== false ? 'Disable in POS' : 'Enable in POS'}
              />
            </div>
            <div className="product-wizard-toggle-row">
              <div className="product-wizard-toggle-row__copy">
                <Label htmlFor="product-pos-always-available-toggle">Always available</Label>
                <p>Keep this item available even when stock is zero.</p>
              </div>
              <Switch
                id="product-pos-always-available-toggle"
                checked={posConfig?.pos_always_available === true}
                onCheckedChange={(checked) => onTogglePosAlwaysAvailable && onTogglePosAlwaysAvailable(productItem, checked)}
                disabled={!onTogglePosAlwaysAvailable}
                aria-label={posConfig?.pos_always_available === true ? 'Always Available: On' : 'Always Available: Off'}
              />
            </div>
          </div>
        )}

        {onOpenBulkPosSetup && (
          <div className="product-wizard-inline-actions">
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={onOpenBulkPosSetup}
            >
              Open Bulk POS Setup
            </Button>
          </div>
        )}

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
          <p className="text-sm text-slate-500">
            POS terminal cards use the item images added in Storefront Catalog below.
          </p>
        ) : (
          <p className="text-sm text-slate-500">
            Save the product first, then reopen it to configure POS visibility.
          </p>
        )}
      </div>

      {showStorefrontCatalogControls && (
      <div className="space-y-3 rounded-lg border border-slate-200 bg-slate-50 p-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <Label>Storefront Catalog</Label>
            <p className="text-xs text-slate-500">Customer-facing visibility stays separate while item images are shared with POS.</p>
          </div>
          {productItem && (
            <div className="product-wizard-toggle-row product-wizard-toggle-row--compact">
              <div className="product-wizard-toggle-row__copy">
                <Label htmlFor="product-storefront-visible-toggle">Visible in Storefront</Label>
              </div>
              <Switch
                id="product-storefront-visible-toggle"
                checked={storefrontConfig?.storefront_visible !== false}
                onCheckedChange={(checked) => onToggleStorefrontVisibility && onToggleStorefrontVisibility(productItem, checked)}
                disabled={!onToggleStorefrontVisibility}
                aria-label={storefrontConfig?.storefront_visible !== false ? 'Disable in Storefront' : 'Enable in Storefront'}
              />
            </div>
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
              <div className="product-wizard-image-empty">
                <p>No item image uploaded yet.</p>
                <span>Upload up to {STOREFRONT_ITEM_IMAGE_MAX_COUNT} images for POS and Storefront.</span>
              </div>
            )}
            <div className="product-wizard-image-actions">
              <p className="product-wizard-image-actions__count">
                {Math.max(STOREFRONT_ITEM_IMAGE_MAX_COUNT - storefrontGallery.length, 0)} of {STOREFRONT_ITEM_IMAGE_MAX_COUNT} image slots remaining.
              </p>
              <div className="product-wizard-image-actions__buttons">
                <label
                  className={`product-wizard-image-upload ${storefrontGallery.length >= STOREFRONT_ITEM_IMAGE_MAX_COUNT ? 'product-wizard-image-upload--disabled' : ''}`}
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
                      const selectedFiles = Array.from(event.target.files || []);
                      const files = selectedFiles.slice(0, Math.max(remainingSlots, 0));
                      if (selectedFiles.length > files.length) {
                        toast.error(`Only ${Math.max(remainingSlots, 0)} more item image${remainingSlots === 1 ? '' : 's'} can be uploaded. Galleries are limited to ${STOREFRONT_ITEM_IMAGE_MAX_COUNT} images.`);
                      }
                      if (files.length && onUploadStorefrontImage) {
                        onUploadStorefrontImage(productItem, files);
                      }
                      event.target.value = '';
                    }}
                    disabled={storefrontGallery.length >= STOREFRONT_ITEM_IMAGE_MAX_COUNT}
                  />
                </label>
                <Button
                  type="button"
                  variant="outline"
                  className="product-wizard-image-remove-all"
                  onClick={() => onDeleteStorefrontImage && onDeleteStorefrontImage(productItem)}
                  disabled={storefrontGallery.length === 0 || !onDeleteStorefrontImage}
                >
                  Remove All Item Images
                </Button>
              </div>
            </div>
          </div>
        ) : (
          <div className="space-y-3">
            <div className="product-wizard-image-empty">
              <p>Choose item images now.</p>
              <span>They will be uploaded after the product is saved.</span>
            </div>
            <div className="product-wizard-image-actions">
              <p className="product-wizard-image-actions__count">
                {Math.max(STOREFRONT_ITEM_IMAGE_MAX_COUNT - selectedStorefrontImageFiles.length, 0)} of {STOREFRONT_ITEM_IMAGE_MAX_COUNT} image slots remaining.
              </p>
              <div className="product-wizard-image-actions__buttons">
                <label className="product-wizard-image-upload">
                  Choose Item Images
                  <input
                    type="file"
                    accept="image/*"
                    multiple
                    className="hidden"
                    onChange={(event) => {
                      handleSelectStorefrontImageFiles(Array.from(event.target.files || []));
                      event.target.value = '';
                    }}
                  />
                </label>
              </div>
            </div>
            <SelectedItemImageCarousel
              files={selectedStorefrontImageFiles}
              itemName={data?.name || 'Product'}
              onRemove={removeSelectedStorefrontImageFile}
            />
          </div>
        )}
        </div>
        )}
      </div>
    );
  }
