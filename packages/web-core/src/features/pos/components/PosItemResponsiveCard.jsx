import React from 'react';
import {
  BarChart3,
  CircleDollarSign,
  ImagePlus,
  Pencil,
  Receipt,
  ScanLine,
  ShoppingBag,
  Trash2
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { ResponsiveImage } from '@/src/components/media/ResponsiveImage.jsx';

export default function PosItemResponsiveCard({
  item,
  isServiceItem,
  imageSources,
  imageGallery = [],
  stock,
  profit,
  formatMoney,
  permissions,
  disabledActions,
  onDelete,
  onEdit,
  onImagePreview
}) {
  const itemName = item?.name || 'Unnamed item';

  return (
    <article className="pos-items-responsive-card hidden min-w-0 flex-col gap-2 rounded-xl border border-slate-300 bg-white p-2 shadow-[0_8px_20px_rgba(148,163,184,0.08)] transition-shadow hover:shadow-[0_12px_24px_rgba(148,163,184,0.12)] md:flex">
      <div className="pos-items-responsive-card-top grid min-w-0 shrink-0 grid-cols-[5rem_minmax(0,1fr)] items-stretch gap-2">
        <div className="pos-items-responsive-image relative h-[5rem] w-[5rem] min-w-0 overflow-hidden rounded-lg bg-slate-100">
          <button
            type="button"
            disabled={imageGallery.length === 0}
            aria-label={imageGallery.length > 0 ? `View ${itemName} image` : undefined}
            onClick={onImagePreview}
            className="absolute inset-0 flex items-center justify-center enabled:cursor-zoom-in"
          >
            <ImagePlus className="h-5 w-5 text-slate-300" />
            {imageSources?.src ? (
              <ResponsiveImage
                sources={imageSources}
                alt={itemName}
                sizes="80px"
                width={288}
                height={288}
                className="absolute h-full w-full object-cover"
                fallbackSrcs={[imageSources.configuredLargeSrc].filter(Boolean)}
              />
            ) : null}
          </button>
          <span
            data-testid="pos-item-stock-status"
            className={`pointer-events-none absolute left-1 top-1 z-10 inline-flex max-w-[calc(100%-0.5rem)] items-center gap-0.5 rounded-full border px-1 py-0.5 text-[8px] font-bold leading-none shadow-sm ${stock.badgeClassName}`}
          >
            <span aria-hidden="true" className={`h-1 w-1 shrink-0 rounded-full ${stock.dotClassName}`} />
            <span className="pos-items-responsive-stock-status-label">{stock.statusLabel}</span>
          </span>
        </div>

        <div className="pos-items-responsive-summary grid min-w-0 grid-cols-1 items-start gap-y-1">
          <div className="min-w-0">
            <h3
              className="pos-items-responsive-card-title line-clamp-2 break-words text-[13px] font-black leading-4 tracking-tight text-[#0F172A]"
              title={itemName}
              aria-label={itemName}
            >
              {itemName}
            </h3>
            <p className="mt-0.5 break-words text-[10.5px] font-medium leading-3 text-[#64748B]">
              {isServiceItem ? 'Service' : (item.folder?.name || item.product_folder || 'Uncategorized')}
            </p>
          </div>

          <div className="flex min-w-0 items-center gap-1 pt-1">
            <ScanLine className="h-3 w-3 shrink-0 text-[#1A4E8D]" aria-hidden="true" />
            <span className="sr-only">SKU: </span>
            <p className="min-w-0 break-all text-[10px] font-bold leading-3 text-[#0F172A]">{item.sku_code || 'Not set'}</p>
          </div>
        </div>
      </div>

      <div
        data-testid="pos-item-responsive-metrics"
        className="pos-items-responsive-metrics grid min-w-0 shrink-0 grid-cols-2 grid-rows-[repeat(2,minmax(2.25rem,auto))] overflow-hidden rounded-lg border border-slate-300/40 bg-white"
      >
        <div className="flex min-h-[2.25rem] min-w-0 items-center justify-between gap-1.5 border-b border-slate-300/40 px-2 py-1">
          <div className="flex min-w-0 items-center gap-1.5">
            <CircleDollarSign className="h-4 w-4 shrink-0 text-[#1A4E8D]" aria-hidden="true" />
            <p className="whitespace-nowrap text-[9px] font-medium leading-tight text-[#64748B]">Cost (₱):</p>
          </div>
          <p className="min-w-0 break-words text-right text-[12px] font-black leading-tight tabular-nums text-[#1A4E8D]">
            {isServiceItem && item.cost_per_unit == null ? 'Not tracked' : `₱${formatMoney(item.cost_per_unit)}`}
          </p>
        </div>
        <div className="flex min-h-[2.25rem] min-w-0 items-center justify-between gap-1.5 border-b border-l border-slate-300/40 px-2 py-1">
          <div className="flex min-w-0 items-center gap-1.5">
            <ShoppingBag className="h-4 w-4 shrink-0 text-[#1A4E8D]" aria-hidden="true" />
            <p className="whitespace-nowrap text-[9px] font-medium leading-tight text-[#64748B]">Stock:</p>
          </div>
          <p className={`min-w-0 break-words text-right text-[12px] font-black leading-tight tabular-nums ${stock.quantityClassName}`}>
            {isServiceItem ? '—' : stock.quantity}
          </p>
        </div>
        <div className="flex min-h-[2.25rem] min-w-0 items-center justify-between gap-1.5 px-2 py-1">
          <div className="flex min-w-0 items-center gap-1.5">
            <Receipt className="h-4 w-4 shrink-0 text-[#1A4E8D]" aria-hidden="true" />
            <p className="whitespace-nowrap text-[9px] font-medium leading-tight text-[#64748B]">Price (₱):</p>
          </div>
          <p className="min-w-0 break-words text-right text-[12px] font-black leading-tight tabular-nums text-[#1A4E8D]">
            ₱{formatMoney(item.default_sale_price)}
          </p>
        </div>
        <div className="flex min-h-[2.25rem] min-w-0 items-center justify-between gap-1.5 border-l border-slate-300/40 px-2 py-1">
          <div className="flex min-w-0 items-center gap-1.5">
            <BarChart3 className="h-4 w-4 shrink-0 text-[#1A4E8D]" aria-hidden="true" />
            <p className="whitespace-nowrap text-[9px] font-medium leading-tight text-[#64748B]">Profit (₱):</p>
          </div>
          <p className="min-w-0 break-words text-right text-[12px] font-black leading-tight tabular-nums text-emerald-700">
            {isServiceItem && item.cost_per_unit == null ? 'Not tracked' : formatMoney(profit)}
          </p>
        </div>
      </div>

      <div className="pos-items-responsive-actions grid min-w-0 shrink-0 grid-cols-2 gap-2">
        {permissions.canDelete ? (
          <Button
            type="button"
            variant="outline"
            onClick={onDelete}
            disabled={disabledActions.delete}
            className="h-8 min-w-0 rounded-lg border-rose-300 bg-white px-1.5 text-[11px] font-bold text-rose-600 shadow-sm hover:bg-rose-50 active:border-rose-600 active:bg-rose-600 active:text-white"
            title={`Delete ${itemName}`}
          >
            <Trash2 className="mr-1 h-3.5 w-3.5 shrink-0" />
            Delete
          </Button>
        ) : <span aria-hidden="true" />}
        {permissions.canEdit ? (
          <Button
            type="button"
            variant="outline"
            onClick={onEdit}
            disabled={disabledActions.edit}
            className="h-8 min-w-0 rounded-lg border-blue-300 bg-white px-1.5 text-[11px] font-bold text-[#1A4E8D] shadow-sm hover:bg-[#1A4E8D]/5 active:border-[#1A4E8D] active:bg-[#1A4E8D] active:text-white"
            title={`Edit ${itemName}`}
          >
            <Pencil className="mr-1 h-3.5 w-3.5 shrink-0" />
            Edit Item
          </Button>
        ) : <span aria-hidden="true" />}
      </div>
    </article>
  );
}
