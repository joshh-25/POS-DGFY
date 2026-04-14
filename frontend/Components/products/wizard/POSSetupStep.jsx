import React from 'react';
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";

export default function POSSetupStep({
  productItem,
  posConfig,
  onTogglePosVisibility,
  onUploadPosImage,
  onDeletePosImage,
  onOpenBulkPosSetup
}) {
  const missing = Array.isArray(posConfig?.pos_readiness?.missing_requirements)
    ? posConfig.pos_readiness.missing_requirements
    : [];

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
                src={posConfig.pos_image_url}
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
    </div>
  );
}

