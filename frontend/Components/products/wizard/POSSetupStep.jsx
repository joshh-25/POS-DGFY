import React from 'react';
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { resolveAssetUrl } from '@/src/utils/assetUrl.js';

export default function POSSetupStep({
  productItem,
  posConfig,
  storefrontConfig,
  showStorefrontCatalogControls = true,
  onTogglePosVisibility,
  onUploadPosImage,
  onDeletePosImage,
  onToggleStorefrontVisibility,
  onUploadStorefrontImage,
  onSetPrimaryStorefrontImage,
  onDeleteStorefrontImage,
  onOpenBulkPosSetup
}) {
  const missing = Array.isArray(posConfig?.pos_readiness?.missing_requirements)
    ? posConfig.pos_readiness.missing_requirements
    : [];
  const storefrontGallery = React.useMemo(() => {
    const entries = Array.isArray(storefrontConfig?.storefront_image_gallery)
      ? storefrontConfig.storefront_image_gallery
      : [];
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

        {productItem ? (
          <div className="space-y-3">
            {storefrontGallery.length > 0 ? (
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
                {storefrontGallery.map((entry, index) => (
                  <div key={`${entry.url || entry.path}-${index}`} className="rounded-md border border-slate-200 bg-white p-2">
                    <div className="relative">
                      <img
                        src={resolveAssetUrl(entry.url || entry.path)}
                        alt={`${productItem?.name || 'Product'} storefront image ${index + 1}`}
                        className="h-24 w-full rounded-md object-cover"
                      />
                      {index === 0 && (
                        <Badge className="absolute left-2 top-2 bg-emerald-600 text-white hover:bg-emerald-600">
                          Primary
                        </Badge>
                      )}
                    </div>
                    <div className="mt-2 flex flex-wrap gap-2">
                      {index > 0 && (
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          onClick={() => onSetPrimaryStorefrontImage && onSetPrimaryStorefrontImage(productItem, index)}
                          disabled={!onSetPrimaryStorefrontImage}
                        >
                          Set first
                        </Button>
                      )}
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        onClick={() => onDeleteStorefrontImage && onDeleteStorefrontImage(productItem, index)}
                        disabled={!onDeleteStorefrontImage}
                      >
                        Remove
                      </Button>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-sm text-slate-500">No item image uploaded yet.</p>
            )}
            <div className="flex flex-wrap gap-2">
              <label className="cursor-pointer rounded-md border border-slate-300 bg-white px-3 py-2 text-sm hover:bg-slate-100">
                Add Item Images
                <input
                  type="file"
                  accept="image/*"
                  multiple
                  className="hidden"
                  onChange={(event) => {
                    const files = Array.from(event.target.files || []);
                    if (files.length && onUploadStorefrontImage) {
                      onUploadStorefrontImage(productItem, files);
                    }
                    event.target.value = '';
                  }}
                />
              </label>
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
