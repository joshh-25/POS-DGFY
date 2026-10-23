import { useRef, useState } from 'react';
import { ListFilter } from 'lucide-react';
import {
  PosFilterChoiceGroup,
  PosFilterDialogFooter,
  PosFilterDialogHeader
} from './PosFilterDialogParts.jsx';
import PosFilterDialogShell from './PosFilterDialogShell.jsx';
import PosCashierFilterControl from './PosCashierFilterControl.jsx';
import { POS_MODAL_HEADER_SURFACE_CLASS } from './posModalStyles.js';
import PosFloatingScrollbar from './PosFloatingScrollbar.jsx';
import { usePosViewportMode } from './PosResponsiveFormDrawer.jsx';
import usePosReportsPopoverPosition from './usePosReportsPopoverPosition.js';

const WIDE_REPORT_FILTER_CHOICE_GRID_CLASS = 'min-[1200px]:grid-cols-[repeat(auto-fit,minmax(5.5rem,1fr))]';

const buildDraft = ({
  cashierId,
  paymentType,
  source,
  deliveryProvider,
  categoryId
}) => ({
  cashierId: cashierId || '',
  paymentType: paymentType || '',
  source: source || '',
  deliveryProvider: deliveryProvider || '',
  categoryId: categoryId || ''
});

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
  deliveryProvider,
  deliveryProviderOptions = [],
  categoryId,
  categories = [],
  anchorRef
}) {
  const [draft, setDraft] = useState(() => buildDraft({ cashierId, paymentType, source, deliveryProvider, categoryId }));
  const [cashierSearch, setCashierSearch] = useState('');
  const [cashierPickerOpen, setCashierPickerOpen] = useState(false);
  const filterScrollRef = useRef(null);
  const viewportMode = usePosViewportMode();
  const isMobileDialog = viewportMode === 'mobile';
  const position = usePosReportsPopoverPosition({
    open,
    anchorRef,
    maxWidth: 464,
    wideViewportMaxWidth: 760,
    fitContentHeight: true
  });

  const resetDraft = () => {
    setDraft(buildDraft({
      cashierId: '',
      paymentType: '',
      source: '',
      deliveryProvider: '',
      categoryId: ''
    }));
    setCashierSearch('');
    setCashierPickerOpen(false);
  };

  const updateDraft = (field, value) => {
    setDraft((current) => ({ ...current, [field]: value }));
  };

  const applyDraft = () => {
    onApplyFilters?.({ ...draft });
  };

  const paymentFilterOptions = paymentOptions.map((option) => ({
    ...option,
    label: option.value ? option.label : 'All'
  }));
  const sourceFilterOptions = sourceOptions.map((option) => ({
    ...option,
    label: option.value ? option.label : 'All'
  }));
  const deliveryProviderFilterOptions = deliveryProviderOptions.map((option) => ({
    ...option,
    label: option.value ? option.label : 'All'
  }));
  const categoryFilterOptions = [
    { key: 'all-categories', value: '', label: 'All' },
    ...categories.map((entry) => ({
      key: entry.folder_id || entry.name,
      value: entry.folder_id || '',
      label: entry.name,
      disabled: !entry.folder_id
    }))
  ];
  const cashierFilterOptions = [
    ...cashiers.map((cashier) => ({
      key: String(cashier.cashier_id),
      value: String(cashier.cashier_id),
      label: cashier.cashier_name
    }))
  ];

  if (!open) return null;

  return (
      <PosFilterDialogShell
        open={open}
        onClose={onClose}
        mode="filters"
        mobile={isMobileDialog}
        fitContentHeight
        position={position}
        id="pos-reports-filter-dialog"
        ariaLabelledBy="pos-reports-filter-title"
        ariaDescribedBy="pos-reports-filter-description"
        className="rounded-2xl border-[#D9E5F3] shadow-2xl shadow-slate-950/15"
      >
        <PosFilterDialogHeader
          title="Filter"
          description={isMobileDialog ? 'Refine your Transaction History' : 'Select the transaction history you want to review.'}
          titleId="pos-reports-filter-title"
          descriptionId="pos-reports-filter-description"
          onClose={onClose}
          closeLabel="Close filters"
          mobile={isMobileDialog}
          className={['dgfy-pos-history-dialog-header rounded-t-2xl', POS_MODAL_HEADER_SURFACE_CLASS].join(' ')}
          titleClassName="text-xl font-black text-[#0F172A]"
          descriptionClassName="mt-0.5 text-[12px] text-slate-500"
        />

        <div className="relative min-h-0 min-w-0 flex-1">
          <div
            ref={filterScrollRef}
            id="pos-reports-filter-scroll-body"
            data-testid="pos-reports-filter-scroll-body"
            className={`min-h-0 min-w-0 h-full overflow-x-hidden overflow-y-auto overscroll-contain ${isMobileDialog ? 'px-4 py-3' : 'px-4 py-2.5'} dgfy-pos-history-dialog-body dgfy-pos-filter-dialog-scroll-body`}
          >
            <div className={`grid min-w-0 ${isMobileDialog ? 'gap-3' : 'gap-4'}`}>
              <PosFilterChoiceGroup
                label="Payment Type"
                value={draft.paymentType}
                options={paymentFilterOptions}
                onChange={(value) => updateDraft('paymentType', value)}
                testId="pos-reports-filter-payment"
                compact={!isMobileDialog}
                compactGridClassName={WIDE_REPORT_FILTER_CHOICE_GRID_CLASS}
                mobile={isMobileDialog}
                groupAriaLabel="Payment Type"
              />
              <PosFilterChoiceGroup
                label="Delivery Provider"
                value={draft.deliveryProvider}
                options={deliveryProviderFilterOptions}
                onChange={(value) => updateDraft('deliveryProvider', value)}
                testId="pos-reports-filter-delivery-provider"
                compact={!isMobileDialog}
                compactGridClassName={WIDE_REPORT_FILTER_CHOICE_GRID_CLASS}
                mobile={isMobileDialog}
                groupAriaLabel="Delivery Provider"
              />
              <PosFilterChoiceGroup
                label="Sources"
                value={draft.source}
                options={sourceFilterOptions}
                onChange={(value) => updateDraft('source', value)}
                testId="pos-reports-filter-source"
                compact={!isMobileDialog}
                compactGridClassName={WIDE_REPORT_FILTER_CHOICE_GRID_CLASS}
                mobile={isMobileDialog}
                groupAriaLabel="Sources"
              />
              <PosFilterChoiceGroup
                label="Categories"
                value={draft.categoryId}
                options={categoryFilterOptions}
                onChange={(value) => updateDraft('categoryId', value)}
                testId="pos-reports-filter-category"
                compact={!isMobileDialog}
                compactGridClassName={WIDE_REPORT_FILTER_CHOICE_GRID_CLASS}
                mobile={isMobileDialog}
                groupAriaLabel="Categories"
              />
              <PosCashierFilterControl
                value={draft.cashierId}
                searchValue={cashierSearch}
                options={cashierFilterOptions}
                onSearchChange={setCashierSearch}
                onChange={(value) => updateDraft('cashierId', String(value ?? ''))}
                expanded={cashierPickerOpen}
                onExpandedChange={setCashierPickerOpen}
                compact={!isMobileDialog}
                mobile={isMobileDialog}
                id="pos-reports-cashier-search"
                testIdPrefix="pos-reports-filter-cashier"
                optionName="pos-reports-filter-cashier"
              />
            </div>
          </div>
          <PosFloatingScrollbar
            scrollRef={filterScrollRef}
            targetId="pos-reports-filter-scroll-body"
          />
        </div>

        <PosFilterDialogFooter
          onReset={resetDraft}
          onApply={applyDraft}
          applyIcon={ListFilter}
          mobile={isMobileDialog}
          className={`${isMobileDialog ? 'gap-3 px-4 py-3' : 'gap-2 px-4 py-2.5'} dgfy-pos-history-dialog-footer`}
          leftButtonClassName="border-rose-300 bg-rose-50/40 text-[13px] font-extrabold text-rose-700 shadow-sm shadow-rose-100/70 hover:border-rose-400 hover:bg-rose-50 hover:text-rose-800"
          applyButtonClassName="text-[13px]"
        />
      </PosFilterDialogShell>
  );
}
