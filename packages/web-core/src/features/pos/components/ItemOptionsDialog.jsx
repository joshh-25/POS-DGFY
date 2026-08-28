import React, { useMemo, useState } from 'react';
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
export default function ItemOptionsDialog({
  open = false,
  line = null,
  locationId = null,
  globalDiscount = null,
  onClose,
  onSave,
}) {
  const [note, setNote] = useState(() => String(line?.special_instructions || ''));
  const [selections, setSelections] = useState(() => (
    Array.isArray(line?.line_modifiers) ? line.line_modifiers : []
  ));
  const [saving, setSaving] = useState(false);

  const groups = useMemo(
    () => (line?.modifier_groups || []).filter((group) => isAvailableFnbModifierGroup(group, locationId)),
    [line, locationId],
  );
  const visibleGroups = groups.filter(
    (group) => !group.parent_modifier_option_id
      || selections.some((entry) => Number(entry.modifier_option_id) === Number(group.parent_modifier_option_id)),
  );
  const modifierError = validateFnbModifierSelections(groups, selections, locationId);

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
      await onSave?.({
        note: note.trim().slice(0, MAX_ITEM_NOTE_LENGTH),
        selections,
      });
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

          <p className="rounded-lg border border-dashed border-slate-300 bg-slate-50 p-3 text-xs text-slate-600">
            Apply discounts from the checkout discount action, where you can select the eligible items and quantities.
          </p>
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
