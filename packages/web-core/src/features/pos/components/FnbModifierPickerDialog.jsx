import React, { useMemo, useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import {
  getFnbModifierGroupMinimum,
  isAvailableFnbModifierGroup,
  isAvailableFnbModifierOption,
  validateFnbModifierSelections,
} from "../utils/fnbModifierValidation.js";

export { validateFnbModifierSelections } from "../utils/fnbModifierValidation.js";

export default function FnbModifierPickerDialog({
  open,
  line,
  locationId,
  onClose,
  onSave,
}) {
  const [selections, setSelections] = useState(() => (
    Array.isArray(line?.line_modifiers) ? line.line_modifiers : []
  ));
  const groups = useMemo(
    () =>
      (line?.modifier_groups || []).filter((group) =>
        isAvailableFnbModifierGroup(group, locationId),
      ),
    [line, locationId],
  );
  const visibleGroups = groups.filter(
    (group) =>
      !group.parent_modifier_option_id ||
      selections.some(
        (entry) =>
          Number(entry.modifier_option_id) ===
          Number(group.parent_modifier_option_id),
      ),
  );
  const error = validateFnbModifierSelections(groups, selections, locationId);
  const toggle = (group, option) => {
    const groupId = Number(group.modifier_group_id);
    const optionId = Number(option.modifier_option_id);
    const selected = selections.some(
      (entry) =>
        Number(entry.modifier_group_id) === groupId &&
        Number(entry.modifier_option_id) === optionId,
    );
    const max = Math.max(1, Number(group.max_select || 1));
    setSelections((current) => {
      if (selected)
        return current.filter(
          (entry) =>
            !(
              Number(entry.modifier_group_id) === groupId &&
              Number(entry.modifier_option_id) === optionId
            ),
        );
      const outside = current.filter(
        (entry) => Number(entry.modifier_group_id) !== groupId,
      );
      const inside = current.filter(
        (entry) => Number(entry.modifier_group_id) === groupId,
      );
      return max === 1
        ? [
            ...outside,
            { modifier_group_id: groupId, modifier_option_id: optionId },
          ]
        : [
            ...outside,
            ...inside.slice(-(max - 1)),
            { modifier_group_id: groupId, modifier_option_id: optionId },
          ];
    });
  };
  const setQuantity = (group, option, quantity) => {
    const groupId = Number(group.modifier_group_id);
    const optionId = Number(option.modifier_option_id);
    const normalized = Math.min(
      99,
      Math.max(1, Number.parseInt(quantity || 1, 10) || 1),
    );
    setSelections((current) =>
      current.map((entry) =>
        Number(entry.modifier_group_id) === groupId &&
        Number(entry.modifier_option_id) === optionId
          ? { ...entry, quantity: normalized }
          : entry,
      ),
    );
  };
  return (
    <Dialog open={open} onOpenChange={(next) => !next && onClose()}>
      <DialogContent className="max-h-[90vh] max-w-xl overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Customize {line?.item_name || "menu item"}</DialogTitle>
          <DialogDescription>
            Select required and optional restaurant modifiers. Prices update
            before checkout.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
        {visibleGroups.map((group) => {
            const min = getFnbModifierGroupMinimum(group);
            const max = Math.max(1, Number(group.max_select || 1));
            return (
              <fieldset
                key={group.modifier_group_id}
                className="rounded-xl border p-3"
              >
                <legend className="px-1 text-sm font-bold">
                  {group.display_name || group.name}{" "}
                  <span className="text-xs font-normal text-slate-500">
                    ({min ? `choose ${min}–${max}` : `up to ${max}`})
                  </span>
                </legend>
                <div className="mt-2 grid gap-2 sm:grid-cols-2">
                  {(group.options || [])
                    .filter((option) => isAvailableFnbModifierOption(option, locationId))
                    .map((option) => {
                      const selection = selections.find(
                        (entry) =>
                          Number(entry.modifier_option_id) ===
                          Number(option.modifier_option_id),
                      );
                      const checked = Boolean(selection);
                      return (
                        <div
                          key={option.modifier_option_id}
                          className={`rounded-lg border p-3 ${checked ? "border-blue-500 bg-blue-50" : "border-slate-200"}`}
                        >
                          <label className="flex cursor-pointer items-center justify-between gap-3">
                            <span className="flex items-center gap-2">
                              <input
                                type={max === 1 ? "radio" : "checkbox"}
                                name={`modifier-${group.modifier_group_id}`}
                                checked={checked}
                                onChange={() => toggle(group, option)}
                              />
                              <span className="text-sm font-semibold">
                                {option.name}
                              </span>
                            </span>
                            <span className="text-xs font-bold text-blue-700">
                              {Number(option.price_delta)
                                ? `+₱${Number(option.price_delta).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} each`
                                : "Included"}
                            </span>
                          </label>
                          {checked && (
                            <label className="mt-2 flex items-center justify-end gap-2 text-xs font-semibold text-slate-600">
                              Quantity
                              <input
                                aria-label={`${option.name} quantity`}
                                type="number"
                                min="1"
                                max="99"
                                value={selection.quantity || 1}
                                onChange={(event) =>
                                  setQuantity(group, option, event.target.value)
                                }
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
          {!groups.length && (
            <p className="rounded-lg bg-slate-50 p-4 text-sm text-slate-600">
              No available modifiers for this item at the current location.
            </p>
          )}
          {error && (
            <p role="alert" className="text-sm font-semibold text-rose-600">
              {error}
            </p>
          )}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button onClick={() => onSave(selections)} disabled={Boolean(error)}>
            Apply modifiers
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
