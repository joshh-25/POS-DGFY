import React from 'react';
import {
    Accessibility,
    BadgeCheck,
    ChevronDown,
    CreditCard,
    Eye,
    EyeOff,
    Lock,
    MessageSquare,
    Pencil,
    Percent,
    Plus,
    Tag,
    Ticket,
    Trash2,
    UserRound
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { resolveAssetVariantUrl } from '@/src/utils/assetUrl.js';
import { formatQuantity, money, toArray } from '../utils/posCheckoutTerminalUtils.js';
import {
    buildDiscountAllocationTotals,
    buildDiscountItemSelection,
    getAvailableDiscountQuantity,
    getDiscountLineRef,
    getSelectableDiscountLines,
    isStatutoryBeneficiaryComplete,
    isStatutoryDiscountType
} from '../utils/posDiscountSelection.js';

export const POS_DISCOUNT_TYPE_OPTIONS = [
    { value: 'employee', label: 'Employee', icon: BadgeCheck },
    { value: 'senior', label: 'Senior Citizen', icon: UserRound },
    { value: 'pwd', label: 'PWD', icon: Accessibility },
    { value: 'promo', label: 'Promo', icon: Tag },
    { value: 'voucher', label: 'Voucher', icon: Ticket },
    { value: 'manual', label: 'Other', icon: Pencil }
];

export function POSDiscountWorkspace({ viewModel = {}, onCancel, embedded = false }) {
    const {
        discountApplying,
        discountApproversLoading,
        discountEmployeesLoading,
        discountDraft = {},
        discountModalOpen,
        discountPreviewTotals = {},
        employeeDiscountRateOptions = [],
        handleApplyGovernedDiscount,
        isCartLineSeniorPwdEligible,
        isTabletViewport,
        safeCart = [],
        safeCatalog = [],
        safeDiscountApprovers = [],
        safeDiscountEmployees = [],
        safeEligibleDiscountItems = [],
        setDiscountDraft,
        setShowDiscountPin,
        showDiscountPin
    } = viewModel;
    const [discountQuantityInput, setDiscountQuantityInput] = React.useState(null);

    const selectableDiscountLines = getSelectableDiscountLines(
        safeCart,
        discountDraft.type,
        isCartLineSeniorPwdEligible
    );
    const selectableDiscountEntries = selectableDiscountLines.map((line) => ({
        line,
        lineRef: getDiscountLineRef(line, safeCart.indexOf(line)),
        wholeCartQuantity: Math.floor(Number(line.quantity || 0))
    }));
    const selectableDiscountRefs = selectableDiscountEntries
        .filter((entry) => entry.wholeCartQuantity > 0)
        .map((entry) => entry.lineRef);
    const selectedDiscountRefs = new Set(
        safeEligibleDiscountItems
            .map((entry) => String(entry?.line_ref || '').trim())
            .filter(Boolean)
    );
    const selectedDiscountCount = selectableDiscountRefs.filter((lineRef) => selectedDiscountRefs.has(lineRef)).length;
    const allDiscountItemsSelected = selectableDiscountRefs.length > 0
        && selectedDiscountCount === selectableDiscountRefs.length;
    const additionalBeneficiaries = toArray(discountDraft.beneficiaries);
    const additionalAllocatedQuantityByLine = buildDiscountAllocationTotals(
        additionalBeneficiaries.map((beneficiary) => toArray(beneficiary.eligible_items))
    );
    const statutoryAllocatedQuantityByLine = buildDiscountAllocationTotals([
        safeEligibleDiscountItems,
        ...additionalBeneficiaries.map((beneficiary) => toArray(beneficiary.eligible_items))
    ]);
    const hasUnallocatedStatutoryQuantity = selectableDiscountEntries.some(({ lineRef, wholeCartQuantity }) => (
        wholeCartQuantity > Number(statutoryAllocatedQuantityByLine.get(lineRef) || 0)
    ));
    const canAddStatutoryBeneficiary = hasUnallocatedStatutoryQuantity
        && additionalBeneficiaries.every(isStatutoryBeneficiaryComplete);

    React.useEffect(() => {
        if (!discountModalOpen) setDiscountQuantityInput(null);
    }, [discountModalOpen]);

    const updateDiscountItemSelection = (nextLineRefs) => {
        setDiscountDraft((previous) => {
            const nextSelection = buildDiscountItemSelection({
                cart: safeCart,
                type: previous.type,
                draft: previous,
                isEligible: isCartLineSeniorPwdEligible,
                selectAllWhenEmpty: false,
                selectedLineRefs: nextLineRefs
            });
            const eligibleItems = nextSelection.eligible_items.map((entry) => {
                const selectableEntry = selectableDiscountEntries.find(({ lineRef }) => lineRef === entry.line_ref);
                const availableQuantity = getAvailableDiscountQuantity({
                    allocationTotals: additionalAllocatedQuantityByLine,
                    lineRef: entry.line_ref,
                    wholeCartQuantity: selectableEntry?.wholeCartQuantity
                });
                return { ...entry, eligible_quantity: Math.min(entry.eligible_quantity, availableQuantity) };
            }).filter((entry) => entry.eligible_quantity > 0);
            return {
                ...previous,
                eligible_item_ids: [...new Set(eligibleItems.map((entry) => entry.item_id))],
                eligible_items: eligibleItems
            };
        });
    };

    const handleDiscountTypeChange = (type) => {
        setDiscountQuantityInput(null);
        setDiscountDraft((previous) => {
            const nextSelection = buildDiscountItemSelection({
                cart: safeCart,
                type,
                draft: { ...previous, eligible_item_ids: [], eligible_items: [] },
                isEligible: isCartLineSeniorPwdEligible
            });
            return {
                ...previous,
                ...nextSelection,
                type,
                rate: type === 'employee' ? '15' : (isStatutoryDiscountType(type) ? '20' : previous.rate),
                beneficiaries: isStatutoryDiscountType(type)
                    ? toArray(previous.beneficiaries).map((beneficiary) => ({ ...beneficiary, category: type }))
                    : []
            };
        });
    };

    const updateDiscountQuantity = (lineRef, eligibleQuantity) => {
        setDiscountDraft((previous) => ({
            ...previous,
            eligible_items: toArray(previous.eligible_items).map((entry) => (
                String(entry?.line_ref || '').trim() === lineRef
                    ? { ...entry, eligible_quantity: eligibleQuantity }
                    : entry
            ))
        }));
    };

    const employeeDiscountIdentityFields = discountDraft.type === 'employee' ? (
        <div className="grid gap-2.5 sm:grid-cols-2">
            <div className="space-y-1">
                <label className="text-xs font-semibold text-[#0F172A]">Employee Name <span className="text-rose-500">*</span></label>
                <div className="relative">
                    <UserRound className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-slate-400" aria-hidden="true" />
                    <select
                        aria-label="Employee Name"
                        value={discountDraft.employee_directory_id || ''}
                        disabled={discountEmployeesLoading}
                        onChange={(event) => {
                            const selected = safeDiscountEmployees.find((employee) => Number(employee.employee_id) === Number(event.target.value));
                            setDiscountDraft((previous) => ({
                                ...previous,
                                employee_directory_id: selected ? String(selected.employee_id) : '',
                                employee_name: selected?.full_name || '',
                                employee_id: selected?.employee_code || ''
                            }));
                        }}
                        className="h-9 w-full max-w-full truncate appearance-none rounded-lg border border-slate-200 bg-white pl-8 pr-8 text-xs font-medium"
                    >
                        <option value="">{discountEmployeesLoading ? 'Loading registered employees...' : 'Select registered employee'}</option>
                        {safeDiscountEmployees.map((employee) => <option key={employee.employee_id} value={employee.employee_id}>{employee.full_name}</option>)}
                    </select>
                    <ChevronDown className="pointer-events-none absolute right-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-slate-400" aria-hidden="true" />
                </div>
            </div>
            <div className="space-y-1">
                <label className="text-xs font-semibold text-[#0F172A]">Employee ID</label>
                <div className="relative">
                    <CreditCard className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-slate-400" aria-hidden="true" />
                    <Input readOnly className="h-9 bg-slate-50 pl-8 text-xs" placeholder="Auto-filled" value={discountDraft.employee_id || ''} />
                </div>
            </div>
        </div>
    ) : null;

    return (
        <div
            className={embedded
                ? 'space-y-3 rounded-xl border border-emerald-200 bg-emerald-50/20 p-3'
                : 'space-y-3'}
            data-testid={embedded ? 'pos-checkout-inline-discount-workspace' : 'pos-discount-workspace'}
        >
            {!embedded && (
                <>
                    <div className="flex items-center justify-between gap-3">
                        <div>
                            <p className="text-[11px] font-black uppercase tracking-wide text-emerald-800">Apply Discount</p>
                            <p className="mt-0.5 text-[11px] font-medium text-slate-500">One governed discount may be applied to this sale.</p>
                        </div>
                    </div>

                    <div className="grid grid-cols-3 gap-1.5 sm:grid-cols-6" role="tablist" aria-label="Discount Type">
                        {POS_DISCOUNT_TYPE_OPTIONS.map((option) => {
                            const TypeIcon = option.icon;
                            const active = discountDraft.type === option.value;
                            return (
                                <button
                                    key={option.value}
                                    type="button"
                                    role="tab"
                                    aria-selected={active}
                                    aria-controls="discount-type-panel"
                                    className={`flex min-h-14 flex-col items-center justify-center gap-0.5 rounded-lg border p-1 text-[10px] font-bold transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500 focus-visible:ring-offset-2 ${
                                        active
                                            ? 'border-emerald-500 bg-emerald-50 text-emerald-700 shadow-sm'
                                            : 'border-slate-200 bg-white text-slate-700 hover:border-emerald-200 hover:bg-slate-50'
                                    }`}
                                    onClick={() => handleDiscountTypeChange(option.value)}
                                >
                                    <TypeIcon className={`h-4 w-4 ${active ? 'text-emerald-600' : 'text-slate-600'}`} aria-hidden="true" />
                                    <span className="w-full whitespace-normal text-center leading-tight">{option.label}</span>
                                </button>
                            );
                        })}
                    </div>
                </>
            )}

            {isTabletViewport ? employeeDiscountIdentityFields : null}

            {isTabletViewport && discountDraft.type && discountDraft.type !== 'employee' ? (
                <div className="space-y-1">
                    <label className="text-xs font-semibold text-[#0F172A]">Customer Name <span className="text-rose-500">*</span></label>
                    <div className="relative">
                        <UserRound className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-slate-400" aria-hidden="true" />
                        <Input className="h-9 pl-8 text-xs" placeholder="Enter customer name" value={discountDraft.customer_name || ''} onChange={(event) => setDiscountDraft((previous) => ({ ...previous, customer_name: event.target.value }))} />
                    </div>
                </div>
            ) : null}

            <div id="discount-type-panel" role="tabpanel" className="grid gap-3 lg:grid-cols-[minmax(240px,0.8fr)_minmax(0,1.2fr)]">
                <section className="space-y-2 rounded-lg border border-slate-200 bg-white p-3" aria-labelledby="eligible-items-heading">
                    <div className="flex items-center justify-between gap-2">
                        <p id="eligible-items-heading" className="text-xs font-semibold text-[#0F172A]">Eligible Items</p>
                        <span className="text-[10px] font-semibold text-slate-500">{selectedDiscountCount}/{selectableDiscountRefs.length} selected</span>
                    </div>
                    <div className="flex items-center justify-between gap-2 rounded-lg border border-teal-100 bg-teal-50/60 px-2 py-1.5">
                        <label className="flex cursor-pointer items-center gap-2 text-[11px] font-bold text-teal-800">
                            <input
                                type="checkbox"
                                data-testid="pos-discount-select-all"
                                className="h-3.5 w-3.5 rounded border-slate-300 accent-teal-600 focus:ring-teal-500"
                                checked={allDiscountItemsSelected}
                                disabled={selectableDiscountRefs.length === 0}
                                onChange={(event) => updateDiscountItemSelection(event.target.checked ? selectableDiscountRefs : [])}
                            />
                            Select all items
                        </label>
                        <span className="text-[10px] font-medium text-teal-700">Uncheck items with no discount</span>
                    </div>
                    {isStatutoryDiscountType(discountDraft.type) ? (
                        <p className="text-[11px] text-slate-500">
                            Select eligible items and discount quantities for this customer.
                        </p>
                    ) : null}
                    <div className="max-h-52 space-y-1 overflow-y-auto pr-1">
                        {selectableDiscountEntries.length > 0 ? selectableDiscountEntries.map(({ line, lineRef, wholeCartQuantity }) => {
                            const checked = wholeCartQuantity > 0 && selectedDiscountRefs.has(lineRef);
                            const selectedEntry = safeEligibleDiscountItems.find((entry) => String(entry?.line_ref || '').trim() === lineRef);
                            const cartQuantity = wholeCartQuantity;
                            const requestedSelectedQuantity = Number(selectedEntry?.eligible_quantity ?? line.quantity);
                            const primaryAvailableQuantity = getAvailableDiscountQuantity({
                                allocationTotals: additionalAllocatedQuantityByLine,
                                lineRef,
                                wholeCartQuantity: cartQuantity
                            });
                            const selectedQuantity = Number.isFinite(requestedSelectedQuantity) && requestedSelectedQuantity > 0
                                ? Math.min(Math.max(1, Math.floor(requestedSelectedQuantity)), primaryAvailableQuantity)
                                : primaryAvailableQuantity;
                            const isEditingDiscountQuantity = discountQuantityInput?.lineRef === lineRef;
                            const quantityValue = isEditingDiscountQuantity ? discountQuantityInput.value : selectedQuantity;
                            const catalogItem = safeCatalog.find((item) => item.item_id === line.item_id);
                            const imageSrc = catalogItem?.pos_image_url || catalogItem?.image_url || line.pos_image_url || '';
                            const resolvedSrc = imageSrc ? resolveAssetVariantUrl(imageSrc, 'thumbnail') : '';

                            return (
                                <label
                                    key={`discount-line-${lineRef}`}
                                    className={`flex min-h-9 items-center justify-between gap-2 rounded-lg border px-2 py-1 text-xs ${
                                        cartQuantity > 0 ? 'cursor-pointer' : 'cursor-not-allowed opacity-70'
                                    } ${
                                        checked ? 'border-teal-200 bg-teal-50/20' : 'border-slate-200 bg-white'
                                    }`}
                                >
                                    <div className="flex min-w-0 items-center gap-2">
                                        <input
                                            type="checkbox"
                                            checked={checked}
                                            disabled={cartQuantity === 0}
                                            onChange={(event) => updateDiscountItemSelection(
                                                event.target.checked
                                                    ? [...selectedDiscountRefs, lineRef]
                                                    : [...selectedDiscountRefs].filter((entry) => entry !== lineRef)
                                            )}
                                            className="h-3.5 w-3.5 shrink-0 accent-teal-600"
                                        />
                                        <div className="flex h-6 w-6 shrink-0 items-center justify-center overflow-hidden rounded border border-slate-100 bg-slate-50">
                                            {resolvedSrc
                                                ? <img src={resolvedSrc} alt="" className="h-full w-full object-cover" />
                                                : <span className="text-[9px] font-bold uppercase text-slate-400">{line.item_name?.substring(0, 2) || 'IT'}</span>}
                                        </div>
                                        <span className="truncate font-semibold text-slate-700">{line.item_name}</span>
                                    </div>
                                    {checked ? (
                                        <div className="flex shrink-0 items-center gap-1 text-[10px] font-semibold text-slate-600">
                                            <span>Discount qty:</span>
                                            <Input
                                                aria-label={`Discount quantity for ${line.item_name}`}
                                                className="h-7 w-14 rounded-md px-1 text-center text-[10px]"
                                                type="number"
                                                inputMode="numeric"
                                                min="1"
                                                max={primaryAvailableQuantity}
                                                step="1"
                                                value={quantityValue}
                                                onClick={(event) => event.stopPropagation()}
                                                onFocus={() => {
                                                    if (!isEditingDiscountQuantity) setDiscountQuantityInput({ lineRef, value: '' });
                                                }}
                                                onKeyDown={(event) => {
                                                    if (['.', ',', 'e', 'E', '+', '-'].includes(event.key)) event.preventDefault();
                                                }}
                                                onChange={(event) => {
                                                    const rawValue = String(event.target.value || '');
                                                    if (!/^\d*$/.test(rawValue)) return;
                                                    if (!rawValue) {
                                                        setDiscountQuantityInput({ lineRef, value: '' });
                                                        return;
                                                    }
                                                    const requestedQuantity = Number(rawValue);
                                                    const eligibleQuantity = Number.isInteger(requestedQuantity) && requestedQuantity > 0
                                                        ? Math.min(requestedQuantity, primaryAvailableQuantity)
                                                        : 1;
                                                    setDiscountQuantityInput({ lineRef, value: String(eligibleQuantity) });
                                                    updateDiscountQuantity(lineRef, eligibleQuantity);
                                                }}
                                                onBlur={() => {
                                                    const rawValue = discountQuantityInput?.lineRef === lineRef
                                                        ? discountQuantityInput.value
                                                        : '';
                                                    const requestedQuantity = Number(rawValue);
                                                    const eligibleQuantity = Number.isInteger(requestedQuantity) && requestedQuantity > 0
                                                        ? Math.min(requestedQuantity, primaryAvailableQuantity)
                                                        : primaryAvailableQuantity;
                                                    updateDiscountQuantity(lineRef, eligibleQuantity);
                                                    setDiscountQuantityInput(null);
                                                }}
                                            />
                                            <span>of {formatQuantity(line.quantity)}</span>
                                        </div>
                                    ) : (
                                        <span className="shrink-0 rounded-md bg-slate-100 px-1.5 py-0.5 text-[10px] font-bold text-slate-600">
                                            {cartQuantity > 0 ? `Qty: ${formatQuantity(line.quantity)}` : 'No whole units'}
                                        </span>
                                    )}
                                </label>
                            );
                        }) : (
                            <div className="rounded-lg border border-dashed border-amber-200 bg-amber-50 px-3 py-4 text-center text-[11px] leading-relaxed text-amber-800" role="status">
                                {isStatutoryDiscountType(discountDraft.type)
                                    ? 'No eligible items are in this cart. In Items, enable Senior/PWD Eligible and save the item, then remove and re-add it to this cart.'
                                    : 'No items are available in this cart.'}
                            </div>
                        )}
                    </div>
                </section>

                <section className="space-y-3 rounded-lg border border-slate-200 bg-white p-3" aria-label="Discount details">
                    <div className="grid gap-2.5 sm:grid-cols-2">
                        {!isTabletViewport && discountDraft.type && discountDraft.type !== 'employee' && (
                            <div className={`space-y-1 ${['senior', 'pwd', 'promo', 'voucher'].includes(discountDraft.type) ? '' : 'sm:col-span-2'}`}>
                                <label className="text-xs font-semibold text-[#0F172A]">Customer Name <span className="text-rose-500">*</span></label>
                                <div className="relative">
                                    <UserRound className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-slate-400" aria-hidden="true" />
                                    <Input className="h-9 pl-8 text-xs" placeholder="Enter customer name" value={discountDraft.customer_name || ''} onChange={(event) => setDiscountDraft((previous) => ({ ...previous, customer_name: event.target.value }))} />
                                </div>
                            </div>
                        )}
                        {['senior', 'pwd'].includes(discountDraft.type) && (
                            <div className="space-y-1">
                                <label className="text-xs font-semibold text-[#0F172A]">Senior/PWD ID Number <span className="text-rose-500">*</span></label>
                                <div className="relative">
                                    <CreditCard className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-slate-400" aria-hidden="true" />
                                    <Input className="h-9 pl-8 text-xs" placeholder="Enter ID number" value={discountDraft.id_number || ''} onChange={(event) => setDiscountDraft((previous) => ({ ...previous, id_number: event.target.value }))} />
                                </div>
                            </div>
                        )}
                        {discountDraft.type === 'promo' && (
                            <div className="space-y-1">
                                <label className="text-xs font-semibold text-[#0F172A]">Promo Code <span className="text-rose-500">*</span></label>
                                <div className="relative">
                                    <Tag className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-slate-400" aria-hidden="true" />
                                    <Input className="h-9 pl-8 text-xs" placeholder="Enter promo code" value={discountDraft.promo_code || ''} onChange={(event) => setDiscountDraft((previous) => ({ ...previous, promo_code: event.target.value }))} />
                                </div>
                                <p className="text-[10px] font-medium text-slate-500">Enter a valid promo or campaign code.</p>
                            </div>
                        )}
                        {discountDraft.type === 'voucher' && (
                            <div className="space-y-1">
                                <label className="text-xs font-semibold text-[#0F172A]">Voucher Code <span className="text-rose-500">*</span></label>
                                <div className="relative">
                                    <Ticket className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-slate-400" aria-hidden="true" />
                                    <Input className="h-9 pl-8 text-xs" placeholder="Enter voucher code" value={discountDraft.voucher_code || ''} onChange={(event) => setDiscountDraft((previous) => ({ ...previous, voucher_code: event.target.value }))} />
                                </div>
                                <p className="text-[10px] font-medium text-slate-500">Discount amount is confirmed at checkout.</p>
                            </div>
                        )}
                    </div>

                    {isStatutoryDiscountType(discountDraft.type) ? (
                        <div className="space-y-2 border-t border-slate-100 pt-3">
                            {toArray(discountDraft.beneficiaries).map((beneficiary, beneficiaryIndex) => (
                                <div key={`statutory-beneficiary-${beneficiaryIndex}`} className="space-y-2 rounded-lg border border-teal-100 bg-teal-50/20 p-2.5">
                                    <div className="flex items-center justify-between gap-2">
                                        <p className="text-xs font-bold text-slate-800">Additional beneficiary {beneficiaryIndex + 2}</p>
                                        <button type="button" aria-label={`Remove beneficiary ${beneficiaryIndex + 2}`} className="rounded-md p-1 text-rose-600 hover:bg-rose-50" onClick={() => setDiscountDraft((previous) => ({ ...previous, beneficiaries: toArray(previous.beneficiaries).filter((_, index) => index !== beneficiaryIndex) }))}>
                                            <Trash2 className="h-3.5 w-3.5" />
                                        </button>
                                    </div>
                                    <div className="grid gap-2 sm:grid-cols-2">
                                        <Input aria-label={`Beneficiary ${beneficiaryIndex + 2} name`} className="h-8 text-xs" placeholder="Customer name" value={beneficiary.name || ''} onChange={(event) => setDiscountDraft((previous) => ({ ...previous, beneficiaries: toArray(previous.beneficiaries).map((entry, index) => index === beneficiaryIndex ? { ...entry, name: event.target.value } : entry) }))} />
                                        <Input aria-label={`Beneficiary ${beneficiaryIndex + 2} ID number`} className="h-8 text-xs" placeholder="Senior/PWD ID" value={beneficiary.id_number || ''} onChange={(event) => setDiscountDraft((previous) => ({ ...previous, beneficiaries: toArray(previous.beneficiaries).map((entry, index) => index === beneficiaryIndex ? { ...entry, id_number: event.target.value } : entry) }))} />
                                    </div>
                                    <div className="space-y-1">
                                        {selectableDiscountEntries.map(({ line, lineRef, wholeCartQuantity }) => {
                                            const selectedEntry = toArray(beneficiary.eligible_items).find((entry) => String(entry?.line_ref || '').trim() === lineRef);
                                            const selectedQuantity = Number(selectedEntry?.eligible_quantity || 0);
                                            const availableQuantity = getAvailableDiscountQuantity({
                                                allocationTotals: statutoryAllocatedQuantityByLine,
                                                currentQuantity: selectedQuantity,
                                                lineRef,
                                                wholeCartQuantity
                                            });
                                            return (
                                                <label key={`beneficiary-${beneficiaryIndex}-${lineRef}`} className="flex items-center justify-between gap-2 text-[11px] text-slate-700">
                                                    <span className="min-w-0 truncate">{line.item_name} <span className="text-slate-400">({availableQuantity} available)</span></span>
                                                    <Input aria-label={`Eligible quantity for beneficiary ${beneficiaryIndex + 2}, ${line.item_name}`} className="h-7 w-20 text-center text-[11px]" type="number" inputMode="numeric" min="0" max={availableQuantity} step="1" value={selectedEntry?.eligible_quantity || ''} placeholder="Qty" disabled={availableQuantity === 0} onChange={(event) => {
                                                        const quantity = Math.max(0, Math.min(Math.floor(Number(event.target.value) || 0), availableQuantity));
                                                        setDiscountDraft((previous) => ({
                                                            ...previous,
                                                            beneficiaries: toArray(previous.beneficiaries).map((current, index) => index === beneficiaryIndex ? {
                                                                ...current,
                                                                eligible_items: quantity > 0
                                                                    ? [...toArray(current.eligible_items).filter((entry) => String(entry?.line_ref || '').trim() !== lineRef), { line_ref: lineRef, item_id: Number(line.item_id), eligible_quantity: quantity }]
                                                                    : toArray(current.eligible_items).filter((entry) => String(entry?.line_ref || '').trim() !== lineRef)
                                                            } : current)
                                                        }));
                                                    }} />
                                                </label>
                                            );
                                        })}
                                    </div>
                                </div>
                            ))}
                            <Button type="button" variant="outline" className="h-8 w-full text-xs" disabled={!canAddStatutoryBeneficiary} onClick={() => setDiscountDraft((previous) => ({ ...previous, beneficiaries: [...toArray(previous.beneficiaries), { category: previous.type, name: '', id_number: '', eligible_items: [] }] }))}>
                                <Plus className="mr-1.5 h-3.5 w-3.5" /> Add another Senior/PWD
                            </Button>
                            {!hasUnallocatedStatutoryQuantity ? (
                                <p className="text-center text-[10px] font-medium text-slate-500">All eligible item quantities are already assigned.</p>
                            ) : !canAddStatutoryBeneficiary ? (
                                <p className="text-center text-[10px] font-medium text-slate-500">Complete the current beneficiary before adding another.</p>
                            ) : null}
                        </div>
                    ) : null}

                    {!isTabletViewport ? employeeDiscountIdentityFields : null}

                    {discountDraft.type === 'manual' && (
                        <div className="grid gap-2.5 sm:grid-cols-2">
                            <div className="space-y-1">
                                <label className="text-xs font-semibold text-[#0F172A]">Method <span className="text-rose-500">*</span></label>
                                <div className="relative">
                                    <CreditCard className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-slate-400" aria-hidden="true" />
                                    <select value={discountDraft.method} onChange={(event) => setDiscountDraft((previous) => ({ ...previous, method: event.target.value }))} className="h-9 w-full appearance-none rounded-lg border border-slate-200 bg-white pl-8 pr-8 text-xs font-medium">
                                        <option value="percentage">Percentage</option>
                                        <option value="fixed">Fixed Amount</option>
                                    </select>
                                    <ChevronDown className="pointer-events-none absolute right-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-slate-400" aria-hidden="true" />
                                </div>
                            </div>
                            <div className="space-y-1">
                                <label className="text-xs font-semibold text-[#0F172A]">{discountDraft.method === 'fixed' ? 'Amount' : 'Rate (%)'} <span className="text-rose-500">*</span></label>
                                <div className="relative">
                                    {discountDraft.method === 'fixed'
                                        ? <CreditCard className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-slate-400" aria-hidden="true" />
                                        : <Percent className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-slate-400" aria-hidden="true" />}
                                    <Input className="h-9 pl-8 text-xs" placeholder={discountDraft.method === 'fixed' ? 'Enter amount' : 'Enter rate'} type="number" min="0" max={discountDraft.method === 'percentage' ? 100 : undefined} value={discountDraft.method === 'fixed' ? discountDraft.amount : discountDraft.rate} onChange={(event) => setDiscountDraft((previous) => ({ ...previous, [previous.method === 'fixed' ? 'amount' : 'rate']: event.target.value }))} />
                                </div>
                            </div>
                            <div className="space-y-1 sm:col-span-2">
                                <label className="text-xs font-semibold text-[#0F172A]">Reason <span className="text-[10px] font-medium text-slate-400">(optional)</span></label>
                                <div className="relative">
                                    <MessageSquare className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-slate-400" aria-hidden="true" />
                                    <Input className="h-9 pl-8 text-xs" placeholder="Enter discount reason (optional)" value={discountDraft.reason || ''} onChange={(event) => setDiscountDraft((previous) => ({ ...previous, reason: event.target.value }))} />
                                </div>
                            </div>
                        </div>
                    )}

                    <div className="grid gap-2.5 sm:grid-cols-2">
                        {discountDraft.type === 'employee' && (
                            <div className="space-y-1 sm:col-span-2">
                                <label className="text-xs font-semibold text-[#0F172A]">Discount Rate <span className="text-rose-500">*</span></label>
                                <div className="relative">
                                    <Percent className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-slate-400" aria-hidden="true" />
                                    <select aria-label="Discount Rate" value={discountDraft.rate} onChange={(event) => setDiscountDraft((previous) => ({ ...previous, rate: event.target.value, method: 'percentage' }))} className="h-9 w-full appearance-none rounded-lg border border-slate-200 bg-white pl-8 pr-8 text-xs font-medium">
                                        {employeeDiscountRateOptions.map((rate) => <option key={rate} value={rate}>{rate}</option>)}
                                    </select>
                                    <ChevronDown className="pointer-events-none absolute right-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-slate-400" aria-hidden="true" />
                                </div>
                            </div>
                        )}
                        <div className="space-y-1">
                            <label className="text-xs font-semibold text-[#0F172A]">Authorizing employee <span className="text-rose-500">*</span></label>
                            <div className="relative">
                                <BadgeCheck className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-slate-400" aria-hidden="true" />
                                <select autoComplete="off" value={discountDraft.approver_user_id || ''} onChange={(event) => setDiscountDraft((previous) => ({ ...previous, approver_user_id: event.target.value }))} disabled={discountApproversLoading} className="h-9 w-full appearance-none rounded-lg border border-slate-200 bg-white pl-8 pr-8 text-xs font-medium">
                                    <option value="">{discountApproversLoading ? 'Loading authorized employees...' : 'Select authorized employee'}</option>
                                    {safeDiscountApprovers.map((approver) => <option key={approver.user_id} value={approver.user_id} disabled={approver.pos_approval_pin_configured !== true}>{approver.username} ({approver.role}){approver.pos_approval_pin_configured === true ? '' : ' — PIN not configured'}</option>)}
                                </select>
                                <ChevronDown className="pointer-events-none absolute right-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-slate-400" aria-hidden="true" />
                            </div>
                            {!discountApproversLoading && safeDiscountApprovers.length > 0 && !safeDiscountApprovers.some((approver) => approver.pos_approval_pin_configured === true) && <p className="text-xs font-medium text-amber-700">Authorized employees are listed, but each needs a POS approval PIN before they can approve a discount.</p>}
                            {!discountApproversLoading && safeDiscountApprovers.length === 0 && <p className="text-xs font-medium text-amber-700">No authorized employees are configured. Ask an administrator to grant discount authorization.</p>}
                        </div>
                        <div className="space-y-1">
                            <label className="text-xs font-semibold text-[#0F172A]">Employee PIN <span className="text-rose-500">*</span></label>
                            <div className="relative">
                                <Lock className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-slate-400" aria-hidden="true" />
                                <Input name="pos_discount_approval_pin" autoComplete="one-time-code" autoCorrect="off" spellCheck={false} data-1p-ignore="true" data-lpignore="true" data-bwignore="true" style={{ WebkitTextSecurity: showDiscountPin ? 'none' : 'disc' }} className="h-9 pl-8 pr-8 text-xs" placeholder="Enter employee PIN" type="text" inputMode="numeric" value={discountDraft.manager_pin || ''} onChange={(event) => setDiscountDraft((previous) => ({ ...previous, manager_pin: event.target.value }))} />
                                <button type="button" onClick={() => setShowDiscountPin((previous) => !previous)} className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600" aria-label={showDiscountPin ? 'Hide employee PIN' : 'Show employee PIN'}>
                                    {showDiscountPin ? <EyeOff className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />}
                                </button>
                            </div>
                        </div>
                    </div>
                </section>
            </div>

            {!embedded && (
                <div className="grid overflow-hidden rounded-xl border border-slate-200 bg-slate-50 text-center sm:grid-cols-3 sm:divide-x sm:divide-slate-200" data-testid="pos-discount-preview-summary">
                    <div className="px-2 py-2"><span className="block text-[10px] font-semibold text-slate-500">VAT Removed</span><span className="block text-sm font-bold text-slate-800">PHP {money(discountPreviewTotals.vatRemoved)}</span></div>
                    <div className="border-t border-slate-200 px-2 py-2 sm:border-t-0"><span className="block text-[10px] font-semibold text-slate-500">Discount</span><span className="block text-sm font-bold text-rose-600">- PHP {money(discountPreviewTotals.discountAmount)}</span></div>
                    <div className="border-t border-slate-200 bg-emerald-50/60 px-2 py-2 sm:border-t-0"><span className="block text-[10px] font-semibold text-slate-500">Total Amount Due</span><span className="block text-base font-black text-emerald-700">PHP {money(discountPreviewTotals.total)}</span></div>
                </div>
            )}

            <div className="flex justify-end gap-2">
                <Button type="button" variant="outline" onClick={onCancel} className="h-9 min-w-28 text-xs">Cancel</Button>
                <Button type="button" onClick={handleApplyGovernedDiscount} disabled={discountApplying} className="h-9 min-w-36 bg-emerald-600 text-xs font-bold text-white hover:bg-emerald-700" data-testid="pos-apply-governed-discount">
                    <Tag className="mr-1.5 h-3.5 w-3.5" />
                    {discountApplying ? 'Applying...' : 'Apply Discount'}
                </Button>
            </div>
        </div>
    );
}

export default React.memo(POSDiscountWorkspace);
