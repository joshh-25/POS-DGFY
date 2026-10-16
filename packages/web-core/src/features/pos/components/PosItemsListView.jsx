import React from 'react';
import { ImagePlus, Pencil, Trash2 } from 'lucide-react';
import { ResponsiveImage } from '@/src/components/media/ResponsiveImage.jsx';
import PosTableActionButton from './PosTableActionButton.jsx';
import PosTableSurface, {
  POS_TABLE_HEADER_CELL_CLASS,
  POS_TABLE_ROW_CLASS
} from './PosTableSurface.jsx';

export default function PosItemsListView({
  items,
  formatMoney,
  permissions,
  disabledActions,
  onDelete,
  onEdit,
  onImagePreview
}) {
  return (
    <div data-testid="pos-items-list-view" className="pos-items-list-view hidden min-w-0">
      <PosTableSurface className="rounded-xl">
        <div className="w-full overflow-x-auto overscroll-x-contain">
          <table className="min-w-[640px] min-[1024px]:min-w-[840px] w-full table-fixed text-left text-[11px] min-[1024px]:text-[13px]">
            <caption className="sr-only">POS item list</caption>
            <colgroup>
              <col className="pos-items-list-column-item w-[24%]" />
              <col className="pos-items-list-column-category w-[11%]" />
              <col className="pos-items-list-column-sku w-[14%]" />
              <col className="pos-items-list-column-price w-[9%]" />
              <col className="pos-items-list-column-cost w-[9%]" />
              <col className="pos-items-list-column-profit w-[10%]" />
              <col className="pos-items-list-column-stock w-[8%]" />
              <col className="pos-items-list-column-actions w-[15%]" />
            </colgroup>
            <thead className="border-b border-slate-200 bg-slate-50 text-[#0F172A]">
              <tr>
                <th scope="col" className={`${POS_TABLE_HEADER_CELL_CLASS} px-3 py-2.5`}>Item</th>
                <th scope="col" className={`${POS_TABLE_HEADER_CELL_CLASS} px-2 py-2.5`}>Category</th>
                <th scope="col" className={`${POS_TABLE_HEADER_CELL_CLASS} px-2 py-2.5`}>SKU</th>
                <th scope="col" className={`${POS_TABLE_HEADER_CELL_CLASS} whitespace-nowrap px-2 py-2.5`}>Price (₱)</th>
                <th scope="col" className={`${POS_TABLE_HEADER_CELL_CLASS} whitespace-nowrap px-2 py-2.5`}>Cost (₱)</th>
                <th scope="col" className={`${POS_TABLE_HEADER_CELL_CLASS} pos-items-list-profit-cell whitespace-nowrap px-2 py-2.5`}>Profit (₱)</th>
                <th scope="col" className={`${POS_TABLE_HEADER_CELL_CLASS} px-2 py-2.5`}>Stock</th>
                <th scope="col" className={`${POS_TABLE_HEADER_CELL_CLASS} px-2 py-2.5 !text-center`}>Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {items.map((presentation) => {
                const {
                  item,
                  isServiceItem,
                  imageSources,
                  previewSources,
                  stockQuantity,
                  profit,
                  stockStatusLabel,
                  stockQuantityClassName
                } = presentation;
                const itemName = item?.name || 'Unnamed item';
                const category = isServiceItem
                  ? 'Service'
                  : item?.folder?.name || item?.product_folder || 'Uncategorized';
                const canEdit = isServiceItem ? permissions.canManageServiceCatalog : permissions.canEdit;
                const costNotTracked = isServiceItem && item?.cost_per_unit == null;

                return (
                  <tr key={item.item_id} className={`${POS_TABLE_ROW_CLASS} min-h-14`}>
                    <th scope="row" className="px-3 py-2 text-left font-normal">
                      <div className="flex min-w-0 items-center gap-2.5">
                        <div className="relative h-11 w-11 shrink-0 overflow-hidden rounded-md bg-slate-100">
                          <button
                            type="button"
                            disabled={previewSources.gallery.length === 0}
                            aria-label={previewSources.gallery.length > 0 ? `View ${itemName} image` : undefined}
                            onClick={() => onImagePreview(presentation)}
                            className="absolute inset-0 flex items-center justify-center enabled:cursor-zoom-in"
                          >
                            <ImagePlus aria-hidden="true" className="h-5 w-5 text-slate-300" />
                            {imageSources.src ? (
                              <ResponsiveImage
                                sources={imageSources}
                                alt={itemName}
                                sizes="44px"
                                width={176}
                                height={176}
                                className="absolute h-full w-full object-cover"
                                fallbackSrcs={[imageSources.configuredLargeSrc].filter(Boolean)}
                              />
                            ) : null}
                          </button>
                        </div>
                        <span className="sr-only">Stock status: {stockStatusLabel}. </span>
                        <span
                          className="line-clamp-2 min-w-0 break-words font-bold leading-4 text-slate-950"
                          title={itemName}
                        >
                          {itemName}
                        </span>
                      </div>
                    </th>
                    <td className="min-w-0 break-words px-2 py-2 text-[11px] font-semibold leading-4 text-slate-600" title={category}>
                      {category}
                    </td>
                    <td className="min-w-0 break-all px-2 py-2 text-[11px] leading-4 text-slate-600" title={item?.sku_code || 'Not set'}>
                      {item?.sku_code || 'Not set'}
                    </td>
                    <td className="whitespace-nowrap px-2 py-2 font-bold tabular-nums text-[#1A4E8D]">
                      ₱{formatMoney(item?.default_sale_price)}
                    </td>
                    <td className="px-2 py-2 font-bold tabular-nums text-slate-800">
                      {costNotTracked ? 'Not tracked' : `₱${formatMoney(item?.cost_per_unit)}`}
                    </td>
                    <td className="pos-items-list-profit-cell px-2 py-2 font-bold tabular-nums text-emerald-600">
                      {costNotTracked ? 'Not tracked' : `₱${formatMoney(profit)}`}
                    </td>
                    <td className={`px-2 py-2 font-black tabular-nums ${stockQuantityClassName}`}>
                      {isServiceItem ? '—' : stockQuantity}
                    </td>
                    <td className="px-2 py-2">
                      <div className="flex items-center justify-center gap-2">
                        {canEdit ? (
                          <PosTableActionButton
                            icon={Pencil}
                            onClick={() => onEdit(item)}
                            disabled={disabledActions.edit || (isServiceItem && disabledActions.serviceEdit)}
                            aria-label={`Edit ${itemName}`}
                            title={`Edit ${itemName}`}
                          />
                        ) : null}
                        {permissions.canDelete ? (
                          <PosTableActionButton
                            icon={Trash2}
                            tone="danger"
                            onClick={() => onDelete(item)}
                            disabled={disabledActions.delete}
                            aria-label={`Delete ${itemName}`}
                            title={`Delete ${itemName}`}
                          />
                        ) : null}
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </PosTableSurface>
    </div>
  );
}
