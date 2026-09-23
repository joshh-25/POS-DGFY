import { useEffect, useMemo, useRef, useState } from 'react';
import { Check, Filter, Search, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import usePosReportsPopoverPosition from './usePosReportsPopoverPosition.js';

const buildDraft = ({
  cashierId,
  paymentType,
  source,
  categoryId
}) => ({
  cashierId: cashierId || '',
  paymentType: paymentType || '',
  source: source || '',
  categoryId: categoryId || ''
});

const optionButtonClass = (selected) => [
  'inline-flex min-h-9 min-w-[8rem] max-w-[12rem] shrink-0 items-center justify-center gap-1.5 overflow-hidden whitespace-nowrap rounded-lg border px-3 py-1 text-center text-[11px] font-extrabold transition-colors',
  'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#1A4E8D]/35 focus-visible:ring-offset-1',
  selected
    ? 'border-[#1A4E8D] bg-[#1A4E8D] text-white shadow-sm'
    : 'border-[#A9C5EA] bg-white text-[#1A4E8D] hover:border-[#1A4E8D] hover:bg-[#F5F9FF]'
].join(' ');

function FilterSection({ title, children, labelledBy }) {
  return (
    <section className="space-y-1.5" aria-labelledby={labelledBy}>
      <h3 id={labelledBy} className="text-[12px] font-black uppercase tracking-[0.12em] text-slate-600">{title}</h3>
      {children}
    </section>
  );
}

export default function PosReportsFilterPanel({
  open = false,
  onClose,
  onApplyFilters,
  cashierId,
  cashiers = [],
  paymentType,
  paymentOptions = [],
  source,
  sourceOptions = [],
  categoryId,
  categories = [],
  anchorRef
}) {
  const [draft, setDraft] = useState(() => buildDraft({ cashierId, paymentType, source, categoryId }));
  const [cashierSearch, setCashierSearch] = useState('');
  const position = usePosReportsPopoverPosition({ open, anchorRef, maxWidth: 432 });
  const panelRef = useRef(null);

  useEffect(() => {
    if (!open) return undefined;

    const closeOnEscape = (event) => {
      if (event.key === 'Escape') onClose?.();
    };

    document.addEventListener('keydown', closeOnEscape);
    return () => document.removeEventListener('keydown', closeOnEscape);
  }, [onClose, open]);

  useEffect(() => {
    if (!open) return undefined;

    const closeOnOutsidePointerDown = (event) => {
      if (!panelRef.current?.contains(event.target)) onClose?.();
    };

    document.addEventListener('pointerdown', closeOnOutsidePointerDown);
    return () => document.removeEventListener('pointerdown', closeOnOutsidePointerDown);
  }, [onClose, open]);

  const filteredCashiers = useMemo(() => {
    const query = cashierSearch.trim().toLowerCase();
    if (!query) return cashiers;
    return cashiers.filter((cashier) => String(cashier?.cashier_name || '').toLowerCase().includes(query));
  }, [cashierSearch, cashiers]);

  const resetDraft = () => {
    setDraft(buildDraft({
      cashierId: '',
      paymentType: '',
      source: '',
      categoryId: ''
    }));
    setCashierSearch('');
  };

  const updateDraft = (field, value) => {
    setDraft((current) => ({ ...current, [field]: value }));
  };

  const applyDraft = () => {
    onApplyFilters?.({ ...draft });
  };

  if (!open) return null;

  return (
      <div
        ref={panelRef}
        id="pos-reports-filter-dialog"
        role="dialog"
        aria-modal="false"
        aria-labelledby="pos-reports-filter-title"
        aria-describedby="pos-reports-filter-description"
        style={{
          top: position?.top ?? 80,
          left: position?.left ?? 12,
          width: position?.width ?? 'calc(100vw - 24px)',
          maxHeight: position ? position.maxHeight : 'calc(100dvh - 92px)'
        }}
        className="fixed z-[80] flex max-h-[calc(100dvh-92px)] max-w-[27rem] flex-col overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-2xl shadow-slate-950/20 lg:max-h-none lg:overflow-visible"
      >
        <header className="flex shrink-0 items-start justify-between gap-3 border-b border-slate-200 px-3 py-2.5 sm:px-4 lg:px-3 lg:py-2">
          <div className="flex min-w-0 items-start gap-2.5">
            <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-blue-50 text-[#1A4E8D]">
              <Filter aria-hidden="true" className="h-4 w-4" />
            </div>
            <div className="min-w-0">
              <h2 id="pos-reports-filter-title" className="text-[17px] font-black text-slate-950">Filter</h2>
              <p id="pos-reports-filter-description" className="mt-0.5 text-[11px] font-medium leading-4 text-slate-500">Select the transaction history you want to review.</p>
            </div>
          </div>
          <Button type="button" variant="ghost" onClick={onClose} aria-label="Close filters" className="h-8 w-8 shrink-0 rounded-full p-0 text-slate-500 hover:bg-slate-100 hover:text-slate-950">
            <X aria-hidden="true" className="h-5 w-5" />
          </Button>
        </header>

        <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-3 py-3 sm:px-4 lg:px-3 lg:py-2.5">
          <div className="space-y-3 lg:space-y-2.5">
            <FilterSection title="Payment Type" labelledBy="pos-reports-filter-payment-heading">
              <div role="group" aria-labelledby="pos-reports-filter-payment-heading" className="flex min-w-0 gap-1.5 overflow-x-auto overscroll-x-contain pb-1 touch-pan-x [scrollbar-width:thin]">
                {paymentOptions.map((option) => (
                  <button
                    key={option.value || 'all-payments'}
                    type="button"
                    aria-pressed={draft.paymentType === option.value}
                    onClick={() => updateDraft('paymentType', option.value)}
                    className={optionButtonClass(draft.paymentType === option.value)}
                  >
                    {draft.paymentType === option.value ? <Check aria-hidden="true" className="h-3.5 w-3.5" /> : null}
                    <span className="truncate">{option.value ? option.label : 'All'}</span>
                  </button>
                ))}
              </div>
            </FilterSection>

            <FilterSection title="Sources" labelledBy="pos-reports-filter-source-heading">
              <div role="group" aria-labelledby="pos-reports-filter-source-heading" className="flex min-w-0 gap-1.5 overflow-x-auto overscroll-x-contain pb-1 touch-pan-x [scrollbar-width:thin]">
                {sourceOptions.map((option) => (
                  <button
                    key={option.value || 'all-sources'}
                    type="button"
                    aria-pressed={draft.source === option.value}
                    onClick={() => updateDraft('source', option.value)}
                    className={optionButtonClass(draft.source === option.value)}
                  >
                    {draft.source === option.value ? <Check aria-hidden="true" className="h-3.5 w-3.5" /> : null}
                    <span className="truncate">{option.value ? option.label : 'All'}</span>
                  </button>
                ))}
              </div>
            </FilterSection>

            <FilterSection title="Categories" labelledBy="pos-reports-filter-category-heading">
              <div role="group" aria-labelledby="pos-reports-filter-category-heading" className="flex min-w-0 gap-1.5 overflow-x-auto overscroll-x-contain pb-1 touch-pan-x [scrollbar-width:thin]">
                <button type="button" aria-pressed={!draft.categoryId} onClick={() => updateDraft('categoryId', '')} className={optionButtonClass(!draft.categoryId)}>
                  {!draft.categoryId ? <Check aria-hidden="true" className="h-3.5 w-3.5" /> : null}
                  All
                </button>
                {categories.map((entry) => {
                  const value = entry.folder_id || '';
                  const selected = Boolean(value) && draft.categoryId === value;
                  return (
                    <button
                      key={entry.folder_id || entry.name}
                      type="button"
                      aria-pressed={selected}
                      disabled={!value}
                      onClick={() => updateDraft('categoryId', value)}
                      className={`${optionButtonClass(selected)} disabled:cursor-not-allowed disabled:border-slate-200 disabled:bg-slate-50 disabled:text-slate-400`}
                    >
                      {selected ? <Check aria-hidden="true" className="h-3.5 w-3.5" /> : null}
                      <span className="min-w-0 truncate">{entry.name}</span>
                    </button>
                  );
                })}
              </div>
              {categories.length === 0 ? <p className="text-[12px] font-medium text-slate-500">No categories are available for this report.</p> : null}
            </FilterSection>

            <FilterSection title="Cashier" labelledBy="pos-reports-filter-cashier-heading">
              <label className="relative block">
                <span className="sr-only">Search Cashier</span>
                <Search aria-hidden="true" className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                <Input
                  type="search"
                  value={cashierSearch}
                  onChange={(event) => setCashierSearch(event.target.value)}
                  placeholder="Search Cashier"
                  aria-label="Search Cashier"
                  className="h-9 rounded-lg pl-9"
                />
              </label>
              <div role="group" aria-labelledby="pos-reports-filter-cashier-heading" className="flex min-w-0 gap-1.5 overflow-x-auto overscroll-x-contain pb-1 touch-pan-x [scrollbar-width:thin]">
                <button type="button" aria-pressed={!draft.cashierId} onClick={() => updateDraft('cashierId', '')} className={optionButtonClass(!draft.cashierId)}>
                  {!draft.cashierId ? <Check aria-hidden="true" className="h-3.5 w-3.5" /> : null}
                  All cashiers
                </button>
                {filteredCashiers.map((cashier) => {
                  const value = String(cashier.cashier_id);
                  const selected = draft.cashierId === value;
                  return (
                    <button key={value} type="button" aria-pressed={selected} onClick={() => updateDraft('cashierId', value)} className={optionButtonClass(selected)}>
                      {selected ? <Check aria-hidden="true" className="h-3.5 w-3.5" /> : null}
                      <span className="truncate">{cashier.cashier_name}</span>
                    </button>
                  );
                })}
              </div>
              {filteredCashiers.length === 0 ? <p className="text-[12px] font-medium text-slate-500">No cashiers match your search.</p> : null}
            </FilterSection>
          </div>
        </div>

        <footer className="grid shrink-0 gap-1.5 border-t border-slate-200 bg-white px-3 py-2.5 sm:grid-cols-2 sm:px-4 lg:px-3 lg:py-2">
          <Button type="button" variant="outline" onClick={resetDraft} className="min-h-9 rounded-lg border-rose-200 bg-rose-50/30 px-3 text-[11px] font-extrabold text-rose-700 hover:bg-rose-50">
            Reset All
          </Button>
          <Button type="button" onClick={applyDraft} className="min-h-9 rounded-lg bg-[#1A4E8D] px-3 text-[11px] font-extrabold text-white hover:bg-[#143F73]">
            <Filter aria-hidden="true" className="mr-2 h-4 w-4" />
            Apply Filters
          </Button>
        </footer>
      </div>
  );
}
