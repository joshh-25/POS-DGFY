import React, { useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { ChevronLeft, ChevronRight, RefreshCcw, ShieldAlert, Tag, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { GlobalPagination } from '@/components/ui/pagination';
import PosSearchField, { POS_CATALOG_TOOLBAR_SEARCH_FIELD_INPUT_CLASS } from '../components/PosSearchField.jsx';
import {
  DESKTOP_TABLE_PAGE_SIZE_OPTIONS,
  formatSavedAt,
  money,
  rowAboveSrpWarning,
  rowBelowCostWarning,
  rowNoDiscountWarning
} from './pricelistPresentation.js';

const PRICELIST_EDITOR_FOCUSABLE_SELECTOR = [
  'a[href]',
  'button:not([disabled])',
  'input:not([disabled])',
  'select:not([disabled])',
  'textarea:not([disabled])',
  '[tabindex]:not([tabindex="-1"])'
].join(',');

export default function PricelistItemsEditor({
  disabled,
  canManage,
  pricelist,
  editorLoading,
  editorError,
  restoreBanner,
  driftedRowCount,
  onRestoreLocalDraft,
  onDiscardLocalDraft,
  onRefreshDriftedRows,
  isMobileViewport,
  filteredRows,
  mobileIndex,
  onMobileIndexChange,
  search,
  onSearchChange,
  onClearSearch,
  pagedRows,
  desktopTotalPages,
  desktopPage,
  desktopPageSize,
  onDesktopPageChange,
  onDesktopPageSizeChange,
  onPriceChange,
  onPriceInputKeyDown,
  publishing,
  publishDisabled,
  onBackToList,
  onPublish
}) {
  const currentMobileRow = filteredRows[Math.min(mobileIndex, Math.max(0, filteredRows.length - 1))] || null;
  const editorDialogRef = useRef(null);
  const editorCloseButtonRef = useRef(null);
  const editorRestoreFocusRef = useRef(null);
  const publishingRef = useRef(publishing);

  useEffect(() => {
    publishingRef.current = publishing;
  }, [publishing]);

  useEffect(() => {
    if (typeof document === 'undefined') return undefined;

    editorRestoreFocusRef.current = document.activeElement;
    editorCloseButtonRef.current?.focus();

    const handleEditorKeyDown = (event) => {
      if (document.querySelector('[data-dialog-root="true"]')) return;

      if (event.key === 'Escape') {
        if (publishingRef.current) return;
        event.preventDefault();
        onBackToList();
        return;
      }

      if (event.key !== 'Tab') return;
      const dialog = editorDialogRef.current;
      if (!dialog) return;
      const focusableElements = Array.from(dialog.querySelectorAll(PRICELIST_EDITOR_FOCUSABLE_SELECTOR));
      if (focusableElements.length === 0) {
        event.preventDefault();
        dialog.focus();
        return;
      }

      const firstFocusable = focusableElements[0];
      const lastFocusable = focusableElements[focusableElements.length - 1];
      const activeElement = document.activeElement;
      if (!dialog.contains(activeElement)) {
        event.preventDefault();
        (event.shiftKey ? lastFocusable : firstFocusable).focus();
      } else if (event.shiftKey && activeElement === firstFocusable) {
        event.preventDefault();
        lastFocusable.focus();
      } else if (!event.shiftKey && activeElement === lastFocusable) {
        event.preventDefault();
        firstFocusable.focus();
      }
    };

    document.addEventListener('keydown', handleEditorKeyDown);
    return () => {
      document.removeEventListener('keydown', handleEditorKeyDown);
      const previousFocus = editorRestoreFocusRef.current;
      editorRestoreFocusRef.current = null;
      const restoreFocus = () => {
        const fallback = document.querySelector('[data-testid="pos-pricelists-new-button"]');
        const target = previousFocus && previousFocus !== document.body && previousFocus.isConnected
          ? previousFocus
          : fallback;
        target?.focus?.();
      };
      if (typeof window !== 'undefined' && typeof window.requestAnimationFrame === 'function') {
        window.requestAnimationFrame(restoreFocus);
      } else {
        restoreFocus();
      }
    };
  }, [onBackToList]);

  const editorModal = (
    <div
      className="pos-items-modal-overlay pos-mobile-no-focus-zoom fixed inset-0 z-[9999] flex items-start justify-center overflow-hidden bg-slate-700/30 px-3 py-3 backdrop-blur-[2px] sm:items-center sm:px-4 sm:py-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="pos-pricelist-items-modal-title"
      tabIndex={-1}
      ref={editorDialogRef}
      onClick={() => {
        if (!publishing) onBackToList();
      }}
    >
      <div
        className="pos-items-modal-panel pos-items-catalog-form-modal pos-items-mobile-sheet-panel pos-pricelist-items-modal relative flex h-[calc(100dvh-1.5rem)] w-full max-w-[64rem] flex-col overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-2xl shadow-slate-900/20 sm:h-[min(52rem,calc(100dvh-6rem))] sm:max-h-[calc(100dvh-2rem)]"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="pos-pricelist-items-modal-header -mx-px -mt-px flex shrink-0 flex-wrap items-center justify-between gap-2 rounded-t-[17px] border-b border-[#143F73] bg-[#1A4E8D] px-4 py-2.5 sm:flex-nowrap sm:gap-3 sm:px-5">
          <div className="flex min-w-0 flex-1 items-center gap-2.5">
            <div className="grid h-8 w-8 shrink-0 place-items-center rounded-lg bg-white text-[#1A4E8D] shadow-sm ring-1 ring-[#C7DCF3]">
              <Tag className="h-4 w-4" aria-hidden="true" />
            </div>
            <div className="min-w-0">
              <h2 id="pos-pricelist-items-modal-title" className="text-sm font-black text-white">
                Edit Pricelist Items
              </h2>
              <p className="mt-0.5 max-w-full break-words text-[10px] leading-3 text-blue-100">
                Configure item pricing, voucher prices, and discounts for {pricelist?.name || 'this pricelist'}
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onBackToList}
            disabled={publishing}
            ref={editorCloseButtonRef}
            aria-label="Close Edit Pricelist Items"
            className="ml-auto grid h-8 w-8 shrink-0 place-items-center rounded-lg text-blue-100 transition-colors hover:bg-white/15 hover:text-white focus-visible:outline-none focus:ring-2 focus:ring-white focus:ring-offset-2 focus:ring-offset-[#1A4E8D] disabled:cursor-not-allowed disabled:opacity-60"
          >
            <X className="h-3.5 w-3.5" aria-hidden="true" />
          </button>
        </div>

        <div className="pos-items-modal-body pos-items-modal-scroll-region min-h-0 flex-1 overflow-y-auto bg-[#F8FAFC] px-3 pb-3 pt-3 sm:px-4 sm:pb-4 sm:pt-4">
          <div className="mb-3 flex min-w-0 items-center gap-2">
            <PosSearchField
              ariaLabel="Search items in pricelist"
              variant="catalog"
              inputClassName={POS_CATALOG_TOOLBAR_SEARCH_FIELD_INPUT_CLASS}
              onClear={onClearSearch}
              placeholder="Search item by Name, SKU, or Barcode"
              className="min-w-0 flex-1"
              value={search}
              onChange={(event) => onSearchChange(event.target.value)}
            />
          </div>

          {editorError && <p className="mb-3 text-xs font-semibold text-rose-600" role="alert">{editorError}</p>}

          {restoreBanner && (
            <div className="mb-3 flex flex-wrap items-center justify-between gap-2 rounded-lg border border-amber-300 bg-amber-50 px-3 py-2 text-xs font-semibold text-amber-800">
              <span>Unsaved draft from {formatSavedAt(restoreBanner.savedAt)} found in this browser.</span>
              <div className="flex gap-2">
                <Button type="button" size="sm" variant="outline" className="h-7 text-[11px]" onClick={onRestoreLocalDraft}>Restore</Button>
                <Button type="button" size="sm" variant="ghost" className="h-7 text-[11px]" disabled={disabled || !canManage} onClick={onDiscardLocalDraft}>Discard</Button>
              </div>
            </div>
          )}

          {driftedRowCount > 0 && (
            <div className="mb-3 flex flex-wrap items-center justify-between gap-2 rounded-lg border border-sky-300 bg-sky-50 px-3 py-2 text-xs font-semibold text-sky-800">
              <span className="inline-flex items-center gap-1.5"><ShieldAlert className="h-3.5 w-3.5" /> {driftedRowCount} row(s) are still priced at an older SRP snapshot.</span>
              <Button type="button" size="sm" variant="outline" className="h-7 text-[11px]" disabled={disabled || !canManage} onClick={onRefreshDriftedRows}>
                <RefreshCcw className="mr-1 h-3.5 w-3.5" /> Refresh to current SRP
              </Button>
            </div>
          )}

          {editorLoading ? (
            <p className="rounded-lg border border-slate-200 bg-white p-4 text-xs text-slate-500">Loading catalog...</p>
          ) : isMobileViewport ? (
            <div className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm shadow-slate-200/70">
              {currentMobileRow ? (
                <div className="grid gap-3">
                  <div className="flex items-center justify-between">
                    <span className="text-[11px] font-semibold text-slate-500">Item {mobileIndex + 1} of {filteredRows.length}</span>
                  </div>
                  <div>
                    <div className="flex items-start justify-between gap-2">
                      <p className="min-w-0 text-sm font-black text-[#0F172A]">{currentMobileRow.name}</p>
                      <span data-testid="pos-pricelist-mobile-category" className="inline-flex shrink-0 items-center rounded-full border border-slate-200 bg-slate-100 px-2.5 py-1 text-[11px] font-medium text-slate-600">{currentMobileRow.category || 'product'}</span>
                    </div>
                    {currentMobileRow.sku_code && <p className="mt-0.5 text-[11px] text-slate-400">{currentMobileRow.sku_code}</p>}
                    <p className="mt-2 text-[11px] text-slate-500">
                      Cost: {currentMobileRow.cost_per_unit != null ? money(currentMobileRow.cost_per_unit) : '—'} · SRP: {money(currentMobileRow.srp_pesos)}
                    </p>
                  </div>
                  <div className="space-y-1">
                    <Label className="text-xs font-semibold text-[#0F172A]">Voucher price (₱)</Label>
                    <div className="relative">
                      <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-sm font-bold text-slate-400">₱</span>
                      <Input
                        type="number"
                        min="0"
                        step="0.01"
                        className="h-10 rounded-lg border-[#C7DCF3] pl-8 text-right text-sm font-black focus:border-[#1A4E8D] focus:ring-blue-100"
                        disabled={disabled || !canManage}
                        value={currentMobileRow.unit_price_pesos}
                        onChange={(event) => onPriceChange(currentMobileRow.item_id, event.target.value)}
                      />
                    </div>
                    {rowNoDiscountWarning(currentMobileRow) && <p className="text-[11px] font-semibold text-amber-700">No discount at this price.</p>}
                    {rowAboveSrpWarning(currentMobileRow) && <p className="text-[11px] font-semibold text-rose-600">Above SRP ({money(currentMobileRow.srp_pesos)}).</p>}
                    {rowBelowCostWarning(currentMobileRow) && <p className="text-[11px] font-semibold text-rose-600">Below cost ({money(currentMobileRow.cost_per_unit)}).</p>}
                  </div>
                  <div data-testid="pos-pricelist-mobile-item-navigation" className="grid grid-cols-2 gap-2">
                    <Button type="button" variant="outline" size="sm" className="h-9 w-full justify-center text-xs" disabled={mobileIndex === 0} onClick={() => onMobileIndexChange(Math.max(0, mobileIndex - 1))}>
                      <ChevronLeft className="mr-1 h-3.5 w-3.5" /> Previous item
                    </Button>
                    <Button type="button" variant="outline" size="sm" className="h-9 w-full justify-center text-xs" disabled={mobileIndex >= filteredRows.length - 1} onClick={() => onMobileIndexChange(Math.min(filteredRows.length - 1, mobileIndex + 1))}>
                      Next item <ChevronRight className="ml-1 h-3.5 w-3.5" />
                    </Button>
                  </div>
                </div>
              ) : <p className="text-xs text-slate-500">No items match your search.</p>}
            </div>
          ) : (
            <div className="min-w-0 overflow-hidden rounded-lg border border-slate-200 bg-white shadow-sm">
              <div className="overflow-x-auto">
                <table className="w-full min-w-[58rem] text-sm" data-testid="pos-pricelist-items-table">
                  <colgroup>
                    <col className="w-[28%]" />
                    <col className="w-[14%]" />
                    <col className="w-[12%]" />
                    <col className="w-[12%]" />
                    <col className="w-[17%]" />
                    <col className="w-[17%]" />
                  </colgroup>
                  <thead className="bg-[#F1F5F9]">
                    <tr>
                      <th className="px-3 py-3 text-left text-[10px] font-black uppercase tracking-[0.05em] text-slate-600">Item description</th>
                      <th className="px-3 py-3 text-left text-[10px] font-black uppercase tracking-[0.05em] text-slate-600">Category</th>
                      <th className="px-3 py-3 text-left text-[10px] font-black uppercase tracking-[0.05em] text-slate-600">Cost</th>
                      <th className="px-3 py-3 text-left text-[10px] font-black uppercase tracking-[0.05em] text-slate-600">SRP</th>
                      <th className="px-3 py-3 text-left text-[10px] font-black uppercase tracking-[0.05em] text-slate-600">Voucher price (₱)</th>
                      <th className="px-3 py-3 text-left text-[10px] font-black uppercase tracking-[0.05em] text-slate-600">Status / warnings</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {pagedRows.length > 0 ? pagedRows.map((row) => {
                      const noDiscount = rowNoDiscountWarning(row);
                      const aboveSrp = rowAboveSrpWarning(row);
                      const belowCost = rowBelowCostWarning(row);
                      return (
                        <tr key={row.item_id} className="align-middle">
                          <td className="px-3 py-3">
                            <div className="min-w-0">
                              <p className="break-words text-[13px] font-black leading-tight text-[#0F172A]">{row.name}</p>
                              {row.sku_code && <p className="mt-1 text-[11px] font-medium leading-tight text-slate-400">{row.sku_code}</p>}
                            </div>
                          </td>
                          <td className="px-3 py-3">
                            <span className="inline-flex items-center rounded-full border border-slate-200 bg-slate-100 px-3 py-1 text-[11px] font-medium text-slate-600">{row.category || 'product'}</span>
                          </td>
                          <td className="px-3 py-3 text-[13px] font-semibold text-slate-400">{row.cost_per_unit != null ? money(row.cost_per_unit) : '—'}</td>
                          <td className="px-3 py-3 text-[13px] font-black text-[#0F172A]">{money(row.srp_pesos)}</td>
                          <td className="px-3 py-3">
                            <div className="relative w-28">
                              <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-sm font-bold text-slate-400">₱</span>
                              <Input
                                type="number"
                                min="0"
                                step="0.01"
                                className="h-9 w-full rounded-lg border-[#C7DCF3] pl-8 pr-2 text-right text-[13px] font-black text-[#0F172A] focus:border-[#1A4E8D] focus:ring-blue-100"
                                disabled={disabled || !canManage}
                                aria-label={`Voucher price for ${row.name}`}
                                data-price-row={row.item_id}
                                value={row.unit_price_pesos}
                                onChange={(event) => onPriceChange(row.item_id, event.target.value)}
                                onKeyDown={(event) => onPriceInputKeyDown(event, row.item_id)}
                              />
                            </div>
                          </td>
                          <td className="px-3 py-3 text-[11px] font-semibold leading-4">
                            {noDiscount && <p className="text-amber-700">No discount at this price.</p>}
                            {aboveSrp && <p className="text-rose-600">Above SRP ({money(row.srp_pesos)}).</p>}
                            {belowCost && <p className="text-rose-600">Below cost ({money(row.cost_per_unit)}).</p>}
                            {!noDiscount && !aboveSrp && !belowCost && <span className="text-slate-400">—</span>}
                          </td>
                        </tr>
                      );
                    }) : (
                      <tr>
                        <td colSpan="6" className="px-3 py-8 text-center text-xs text-slate-500">No items match your search.</td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
              {desktopTotalPages > 1 && (
                <GlobalPagination
                  testId="pos-pricelist-items-pagination"
                  ariaLabel="Pricelist items pagination"
                  currentPage={desktopPage + 1}
                  totalPages={desktopTotalPages}
                  totalItems={filteredRows.length}
                  pageSize={desktopPageSize}
                  pageSizeOptions={DESKTOP_TABLE_PAGE_SIZE_OPTIONS}
                  itemLabel="items"
                  onPageChange={(nextPage) => onDesktopPageChange(nextPage - 1)}
                  onPageSizeChange={onDesktopPageSizeChange}
                  className="rounded-none border-0 border-t bg-slate-50 px-3 py-2 shadow-none"
                />
              )}
            </div>
          )}
        </div>

        <div className="pos-pricelist-items-modal-footer pos-items-modal-footer grid shrink-0 grid-cols-2 gap-2 border-t border-slate-200 bg-white px-3 py-2.5 sm:px-4">
          <Button type="button" variant="outline" onClick={onBackToList} disabled={publishing} className="h-10 min-w-0 w-full rounded-lg border-[#1A4E8D] px-2 text-[11px] font-bold text-[#1A4E8D] hover:bg-blue-50">
            Cancel
          </Button>
          <Button type="button" onClick={onPublish} disabled={publishDisabled} className="h-10 min-w-0 w-full rounded-lg bg-[#1A4E8D] px-2 text-[11px] font-bold text-white hover:bg-[#143F73]">
            {publishing ? 'Publishing…' : 'Publish'}
          </Button>
        </div>
      </div>
    </div>
  );

  return typeof document !== 'undefined' ? createPortal(editorModal, document.body) : editorModal;
}
