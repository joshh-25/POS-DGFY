import React, { useEffect, useMemo, useState } from 'react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  getFnbModifierGroupMinimum,
  isAvailableFnbModifierGroup,
  isAvailableFnbModifierOption,
  validateFnbModifierSelections,
} from '../utils/fnbModifierValidation.js';

const MAX_ITEM_NOTE_LENGTH = 1000;
const ITEM_DISCOUNT_OPTIONS = [
  { value: 'employee', label: 'Employee' },
  { value: 'pwd', label: 'PWD' },
  { value: 'senior', label: 'Senior' },
  { value: 'promo', label: 'Promo' },
  { value: 'manual', label: 'Other' },
];

const normalizeItemDiscountType = (value) => {
  const normalized = String(value || '').trim().toLowerCase();
  return ITEM_DISCOUNT_OPTIONS.some((option) => option.value === normalized) ? normalized : 'manual';
};

export default function ItemOptionsDialog({
  open = false,
  line = null,
  locationId = null,
  itemDiscount = null,
  globalDiscount = null,
  discountApprovers = [],
  discountApproversLoading = false,
  discountEmployees = [],
  discountEmployeesLoading = false,
  defaultDiscountApprover = null,
  onClose,
  onSave,
}) {
  const [note, setNote] = useState(() => String(line?.special_instructions || ''));
  const [selections, setSelections] = useState(() => (
    Array.isArray(line?.line_modifiers) ? line.line_modifiers : []
  ));
  const [itemDiscountEnabled, setItemDiscountEnabled] = useState(() => itemDiscount?.enabled === true);
  const [discountType, setDiscountType] = useState(() => normalizeItemDiscountType(itemDiscount?.discount_type));
  const [discountMethod, setDiscountMethod] = useState(() => itemDiscount?.method || 'percentage');
  const [discountRate, setDiscountRate] = useState(() => itemDiscount?.rate || '');
  const [discountAmount, setDiscountAmount] = useState(() => itemDiscount?.amount || '');
  const [customerName, setCustomerName] = useState(() => itemDiscount?.customer_name || '');
  const [idNumber, setIdNumber] = useState(() => itemDiscount?.id_number || '');
  const [employeeName, setEmployeeName] = useState(() => itemDiscount?.employee_name || '');
  const [employeeId, setEmployeeId] = useState(() => itemDiscount?.employee_id || '');
  const [employeeDirectoryId, setEmployeeDirectoryId] = useState(() => itemDiscount?.employee_directory_id || '');
  const [promoCode, setPromoCode] = useState(() => itemDiscount?.promo_code || '');
  const [discountReason, setDiscountReason] = useState(() => itemDiscount?.reason || '');
  const [approverUserId, setApproverUserId] = useState(() => itemDiscount?.approver_user_id || defaultDiscountApprover?.user_id || '');
  const [managerPin, setManagerPin] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (itemDiscount?.enabled || !defaultDiscountApprover) return;
    setApproverUserId((current) => current || String(defaultDiscountApprover.user_id || ''));
  }, [defaultDiscountApprover, itemDiscount?.enabled]);

  const groups = useMemo(
    () => (line?.modifier_groups || []).filter((group) => isAvailableFnbModifierGroup(group, locationId)),
    [line, locationId],
  );
  const visibleGroups = groups.filter(
    (group) => !group.parent_modifier_option_id
      || selections.some((entry) => Number(entry.modifier_option_id) === Number(group.parent_modifier_option_id)),
  );
  const modifierError = validateFnbModifierSelections(groups, selections, locationId);
  const grossAmount = Number(line?.quantity || 0) * Number(line?.sale_price || 0);
  const estimatedItemDiscount = itemDiscountEnabled
    ? ['senior', 'pwd'].includes(discountType)
      ? (() => {
        const vatExemptAmount = grossAmount / 1.12;
        return Math.min(grossAmount, (grossAmount - vatExemptAmount) + (vatExemptAmount * 0.2));
      })()
      : discountType === 'promo'
        ? 0
        : discountMethod === 'fixed'
          ? Math.min(grossAmount, Math.max(0, Number(discountAmount || 0)))
          : Math.min(grossAmount, Math.max(0, grossAmount * (Number(discountRate || 0) / 100)))
    : 0;

  const toggleModifier = (group, option) => {
    const groupId = Number(group.modifier_group_id);
    const optionId = Number(option.modifier_option_id);
    const selected = selections.some(
      (entry) => Number(entry.modifier_group_id) === groupId
        && Number(entry.modifier_option_id) === optionId,
    );
    const max = Math.max(1, Number(group.max_select || 1));
    setSelections((current) => {
      if (selected) {
        return current.filter((entry) => !(
          Number(entry.modifier_group_id) === groupId
          && Number(entry.modifier_option_id) === optionId
        ));
      }
      const outside = current.filter((entry) => Number(entry.modifier_group_id) !== groupId);
      const inside = current.filter((entry) => Number(entry.modifier_group_id) === groupId);
      return max === 1
        ? [...outside, { modifier_group_id: groupId, modifier_option_id: optionId }]
        : [...outside, ...inside.slice(-(max - 1)), { modifier_group_id: groupId, modifier_option_id: optionId }];
    });
  };

  const setModifierQuantity = (group, option, quantity) => {
    const groupId = Number(group.modifier_group_id);
    const optionId = Number(option.modifier_option_id);
    const normalized = Math.min(99, Math.max(1, Number.parseInt(quantity || 1, 10) || 1));
    setSelections((current) => current.map((entry) => (
      Number(entry.modifier_group_id) === groupId
      && Number(entry.modifier_option_id) === optionId
        ? { ...entry, quantity: normalized }
        : entry
    )));
  };

  const handleSave = async () => {
    if (modifierError || saving) return;
    setSaving(true);
    try {
      const result = await onSave?.({
        note: note.trim().slice(0, MAX_ITEM_NOTE_LENGTH),
        selections,
        item_discount: itemDiscountEnabled
          ? {
              enabled: true,
              discount_type: discountType,
              method: discountMethod,
              rate: discountMethod === 'percentage' ? discountRate : '',
              amount: discountMethod === 'fixed' ? discountAmount : '',
              customer_name: customerName.trim(),
              id_number: idNumber.trim(),
              employee_name: employeeName.trim(),
              employee_id: employeeId.trim(),
              employee_directory_id: employeeDirectoryId,
              promo_code: promoCode.trim().toUpperCase(),
              reason: discountReason.trim().slice(0, 500),
              approver_user_id: approverUserId,
              manager_pin: managerPin,
            }
          : null,
      });
      if (result !== false) setManagerPin('');
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(nextOpen) => !nextOpen && !saving && onClose?.()}>
      <DialogContent className="max-h-[90vh] w-[calc(100vw-1.5rem)] max-w-xl overflow-y-auto rounded-xl border border-slate-200 bg-white p-0 shadow-2xl sm:w-full">
        <DialogHeader className="border-b border-slate-200 px-5 py-3 text-left">
          <DialogTitle className="text-lg font-black text-slate-900">
            Customize {line?.item_name || 'menu item'}
          </DialogTitle>
          <DialogDescription className="sr-only">
            Item customization controls.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3 p-4">
          <section aria-labelledby="item-note-section-title" className="rounded-xl border border-slate-200 p-3">
            <h3 id="item-note-section-title" className="text-sm font-black text-slate-900">Item note</h3>
            <label className="mt-2 block text-xs font-bold text-slate-700" htmlFor="pos-item-options-note">
              Note for this item
            </label>
            <textarea
              id="pos-item-options-note"
              value={note}
              onChange={(event) => setNote(event.target.value.slice(0, MAX_ITEM_NOTE_LENGTH))}
              placeholder="e.g. No onions"
              maxLength={MAX_ITEM_NOTE_LENGTH}
              rows={3}
              className="mt-1 w-full resize-y rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-900 outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20"
            />
            <p className="mt-1 text-right text-[11px] text-slate-500">{note.length}/{MAX_ITEM_NOTE_LENGTH}</p>
          </section>

          <section aria-labelledby="item-modifiers-section-title" className="rounded-xl border border-slate-200 p-3">
            <h3 id="item-modifiers-section-title" className="text-sm font-black text-slate-900">Modifiers</h3>
            <div className="mt-2 space-y-3">
              {visibleGroups.map((group) => {
                const min = getFnbModifierGroupMinimum(group);
                const max = Math.max(1, Number(group.max_select || 1));
                return (
                  <fieldset key={group.modifier_group_id} className="rounded-lg border border-slate-200 p-3">
                    <legend className="px-1 text-sm font-bold text-slate-900">
                      {group.display_name || group.name}{' '}
                      <span className="text-xs font-normal text-slate-500">
                        ({min ? `choose ${min}–${max}` : `up to ${max}`})
                      </span>
                    </legend>
                    <div className="mt-2 grid gap-2 sm:grid-cols-2">
                      {(group.options || [])
                        .filter((option) => isAvailableFnbModifierOption(option, locationId))
                        .map((option) => {
                          const selection = selections.find(
                            (entry) => Number(entry.modifier_option_id) === Number(option.modifier_option_id),
                          );
                          const checked = Boolean(selection);
                          return (
                            <div
                              key={option.modifier_option_id}
                              className={`rounded-lg border p-3 ${checked ? 'border-blue-500 bg-blue-50' : 'border-slate-200'}`}
                            >
                              <label className="flex cursor-pointer items-center justify-between gap-3">
                                <span className="flex items-center gap-2">
                                  <input
                                    type={max === 1 ? 'radio' : 'checkbox'}
                                    name={`item-options-modifier-${group.modifier_group_id}`}
                                    checked={checked}
                                    onChange={() => toggleModifier(group, option)}
                                  />
                                  <span className="text-sm font-semibold text-slate-900">{option.name}</span>
                                </span>
                                <span className="text-xs font-bold text-blue-700">
                                  {Number(option.price_delta) ? `+₱${Number(option.price_delta).toFixed(2)} each` : 'Included'}
                                </span>
                              </label>
                              {checked && (
                                <label className="mt-2 flex items-center justify-end gap-2 text-xs font-semibold text-slate-600">
                                  Quantity
                                  <Input
                                    aria-label={`${option.name} quantity`}
                                    type="number"
                                    min="1"
                                    max="99"
                                    value={selection.quantity || 1}
                                    onChange={(event) => setModifierQuantity(group, option, event.target.value)}
                                    className="h-8 w-16 rounded border bg-white px-2"
                                  />
                                </label>
                              )}
                            </div>
                          );
                        })}
                    </div>
                  </fieldset>
                );
              })}
              {!groups.length && <p className="rounded-lg bg-slate-50 p-3 text-sm text-slate-600">No modifiers are configured for this item.</p>}
              {modifierError && <p role="alert" className="text-sm font-semibold text-rose-600">{modifierError}</p>}
            </div>
          </section>

          <section aria-labelledby="item-discount-section-title" className="rounded-xl border border-slate-200 p-3">
            <h3 id="item-discount-section-title" className="text-sm font-black text-slate-900">Discount for this item</h3>
            <label className="mt-2 flex items-center gap-2 text-sm font-semibold text-slate-800">
              <input
                type="checkbox"
                checked={itemDiscountEnabled}
                onChange={(event) => setItemDiscountEnabled(event.target.checked)}
                className="h-4 w-4 accent-teal-600"
              />
              Apply an item-only discount
            </label>
            {itemDiscountEnabled && (
              <div className="mt-3 space-y-3 rounded-lg border border-teal-200 bg-teal-50/60 p-3">
                <div className="grid grid-cols-2 gap-2 sm:grid-cols-5" role="tablist" aria-label="Item discount type">
                  {ITEM_DISCOUNT_OPTIONS.map((option) => {
                    const active = discountType === option.value;
                    return (
                      <button
                        key={option.value}
                        type="button"
                        role="tab"
                        aria-selected={active}
                        className={`rounded-md border px-2 py-2 text-xs font-bold transition ${active ? 'border-teal-600 bg-teal-600 text-white' : 'border-slate-300 bg-white text-slate-700 hover:border-teal-400'}`}
                        onClick={() => {
                          setDiscountType(option.value);
                          if (['senior', 'pwd'].includes(option.value)) setDiscountRate('20');
                          if (option.value === 'employee' && !discountRate) setDiscountRate('15');
                        }}
                      >
                        {option.label}
                      </button>
                    );
                  })}
                </div>

                {discountType !== 'employee' && (
                  <label className="block text-xs font-bold text-slate-700" htmlFor="pos-item-discount-customer-name">
                    Customer name {['senior', 'pwd', 'promo'].includes(discountType) && <span className="text-rose-600">*</span>}
                    <Input
                      id="pos-item-discount-customer-name"
                      value={customerName}
                      onChange={(event) => setCustomerName(event.target.value)}
                      placeholder="Enter customer name"
                      className="mt-1 h-9 rounded-md border-slate-300 bg-white"
                    />
                  </label>
                )}

                {['senior', 'pwd'].includes(discountType) && (
                  <label className="block text-xs font-bold text-slate-700" htmlFor="pos-item-discount-id-number">
                    Senior/PWD ID number <span className="text-rose-600">*</span>
                    <Input
                      id="pos-item-discount-id-number"
                      value={idNumber}
                      onChange={(event) => setIdNumber(event.target.value)}
                      placeholder="Enter ID number"
                      className="mt-1 h-9 rounded-md border-slate-300 bg-white"
                    />
                  </label>
                )}

                {discountType === 'promo' && (
                  <label className="block text-xs font-bold text-slate-700" htmlFor="pos-item-discount-promo-code">
                    Promo code <span className="text-rose-600">*</span>
                    <Input
                      id="pos-item-discount-promo-code"
                      value={promoCode}
                      onChange={(event) => setPromoCode(event.target.value.toUpperCase())}
                      placeholder="Enter promo code"
                      className="mt-1 h-9 rounded-md border-slate-300 bg-white"
                    />
                  </label>
                )}

                {discountType === 'employee' && (
                  <div className="grid grid-cols-2 gap-2">
                    <label className="text-xs font-bold text-slate-700" htmlFor="pos-item-discount-employee-name">
                      Employee name <span className="text-rose-600">*</span>
                      <select
                        id="pos-item-discount-employee-name"
                        aria-label="Employee name"
                        value={employeeDirectoryId}
                        disabled={discountEmployeesLoading}
                        onChange={(event) => {
                          const selected = discountEmployees.find((employee) => Number(employee.employee_id) === Number(event.target.value));
                          setEmployeeDirectoryId(selected ? String(selected.employee_id) : '');
                          setEmployeeName(selected?.full_name || '');
                          setEmployeeId(selected?.employee_code || '');
                        }}
                        className="mt-1 h-9 w-full rounded-md border border-slate-300 bg-white px-2 text-sm font-semibold text-slate-900 disabled:opacity-60"
                      >
                        <option value="">{discountEmployeesLoading ? 'Loading…' : 'Select registered employee'}</option>
                        {discountEmployees.map((employee) => (
                          <option key={employee.employee_id} value={employee.employee_id}>
                            {employee.full_name} ({employee.employee_code} · {employee.location_name})
                          </option>
                        ))}
                      </select>
                    </label>
                    <label className="text-xs font-bold text-slate-700" htmlFor="pos-item-discount-employee-id">
                      Employee ID
                      <Input
                        id="pos-item-discount-employee-id"
                        value={employeeId}
                        readOnly
                        placeholder="Auto-filled"
                        className="mt-1 h-9 rounded-md border-slate-300 bg-slate-50"
                      />
                    </label>
                  </div>
                )}

                {['employee', 'manual'].includes(discountType) ? (
                  <div className="grid grid-cols-2 gap-2">
                    <label className="text-xs font-bold text-slate-700">
                      Discount method
                      <select
                        aria-label="Item discount method"
                        value={discountMethod}
                        onChange={(event) => setDiscountMethod(event.target.value)}
                        className="mt-1 h-9 w-full rounded-md border border-slate-300 bg-white px-2 text-sm font-semibold text-slate-900"
                      >
                        <option value="percentage">Percentage</option>
                        <option value="fixed">Fixed amount</option>
                      </select>
                    </label>
                    <label className="text-xs font-bold text-slate-700">
                      {discountMethod === 'fixed' ? 'Amount' : 'Rate (%)'}
                      <Input
                        aria-label={discountMethod === 'fixed' ? 'Item discount amount' : 'Item discount rate'}
                        type="text"
                        inputMode="decimal"
                        value={discountMethod === 'fixed' ? discountAmount : discountRate}
                        onChange={(event) => (discountMethod === 'fixed' ? setDiscountAmount(event.target.value) : setDiscountRate(event.target.value))}
                        placeholder={discountMethod === 'fixed' ? '0.00' : '15'}
                        className="mt-1 h-9 rounded-md border-slate-300 bg-white"
                      />
                    </label>
                  </div>
                ) : (
                  <p className="rounded-md border border-teal-200 bg-white px-3 py-2 text-xs font-semibold text-teal-800">
                    The configured {discountType === 'promo' ? 'promo' : 'Senior/PWD'} discount rate is verified by the server.
                  </p>
                )}
                <label className="block text-xs font-bold text-slate-700" htmlFor="pos-item-discount-reason">
                  Reason (optional)
                  <Input
                    id="pos-item-discount-reason"
                    value={discountReason}
                    onChange={(event) => setDiscountReason(event.target.value.slice(0, 500))}
                    placeholder="e.g. Customer recovery"
                    className="mt-1 h-9 rounded-md border-slate-300 bg-white"
                  />
                </label>
                <div className="grid grid-cols-2 gap-2">
                  <label className="text-xs font-bold text-slate-700">
                    Authorizing employee
                    <select
                      aria-label="Authorizing employee"
                      value={approverUserId}
                      onChange={(event) => setApproverUserId(event.target.value)}
                      disabled={discountApproversLoading}
                      className="mt-1 h-9 w-full rounded-md border border-slate-300 bg-white px-2 text-sm font-semibold text-slate-900 disabled:opacity-60"
                    >
                      <option value="">{discountApproversLoading ? 'Loading…' : 'Select employee'}</option>
                      {discountApprovers.map((approver) => (
                        <option key={approver.user_id} value={approver.user_id}>{approver.username}</option>
                      ))}
                    </select>
                  </label>
                  <label className="text-xs font-bold text-slate-700" htmlFor="pos-item-discount-pin">
                    Approval PIN
                    <Input
                      id="pos-item-discount-pin"
                      type="password"
                      inputMode="numeric"
                      autoComplete="one-time-code"
                      value={managerPin}
                      onChange={(event) => setManagerPin(event.target.value.replace(/[^0-9]/g, '').slice(0, 12))}
                      placeholder="Enter PIN"
                      className="mt-1 h-9 rounded-md border-slate-300 bg-white"
                    />
                  </label>
                </div>
                <p className="text-xs font-bold text-rose-700">Item discount: -₱{estimatedItemDiscount.toFixed(2)}</p>
              </div>
            )}
            {globalDiscount ? (
              <div className="mt-3 rounded-lg border border-blue-200 bg-blue-50/70 p-3">
                <div className="flex items-center justify-between gap-3 text-xs">
                  <span className="font-bold text-blue-900">Global discount also applies to this item</span>
                  <span className="font-black text-blue-800">-₱{Number(globalDiscount.amount || 0).toFixed(2)}</span>
                </div>
                <p className="mt-1 text-xs font-semibold text-blue-800">
                  {globalDiscount.label || 'Global discount'} · {globalDiscount.rate == null ? 'Fixed amount' : `${Number(globalDiscount.rate).toFixed(2)}%`}
                </p>
              </div>
            ) : (
              <p className="mt-3 rounded-lg border border-dashed border-slate-300 bg-slate-50 p-3 text-xs text-slate-600">
                No global discount is applied to this sale.
              </p>
            )}
          </section>
        </div>

        <DialogFooter className="border-t border-slate-200 px-5 py-3 sm:justify-end">
          <Button type="button" variant="outline" onClick={onClose} disabled={saving}>Cancel</Button>
          <Button type="button" className="bg-[#1A4E8D] text-white hover:bg-[#143F73]" onClick={handleSave} disabled={Boolean(modifierError) || saving}>
            {saving ? 'Saving…' : 'Save changes'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
