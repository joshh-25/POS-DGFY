import React, { useMemo, useState } from 'react';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle
} from '@/components/ui/dialog';
import { Clock, Tag, Check, Plus } from 'lucide-react';

export function ServiceOptionsModal({
  open,
  onOpenChange,
  serviceItem,
  optionGroups = [],
  onConfirmOptions
}) {
  const [selectedOptionIds, setSelectedOptionIds] = useState([]);
  const serviceDetail = serviceItem?.service_detail || serviceItem?.serviceDetail || {};
  const addonsEnabled = serviceDetail.addons_enabled === true;
  const basePrice = Number(serviceItem?.default_sale_price || serviceItem?.price) || 0;
  const baseDuration = Number(serviceItem?.duration_minutes || serviceDetail.duration_minutes) || 30;
  const visibleOptionGroups = useMemo(
    () => optionGroups.filter((group) => group.group_type !== 'addon' || addonsEnabled),
    [addonsEnabled, optionGroups]
  );

  // Flatten options from groups to compute client preview
  const allOptions = useMemo(() => {
    const map = new Map();
    for (const group of visibleOptionGroups) {
      for (const opt of group.options || []) {
        map.set(Number(opt.option_id), { ...opt, groupType: group.group_type, groupName: group.name });
      }
    }
    return map;
  }, [visibleOptionGroups]);

  const effectiveSelectedOptionIds = useMemo(
    () => selectedOptionIds.filter((id) => allOptions.has(Number(id))),
    [allOptions, selectedOptionIds]
  );

  // Compute live estimated price and duration
  const { totalPrice, totalDuration, selectedOptionDetails } = useMemo(() => {
    let priceAdj = 0;
    let durAdj = 0;
    const details = [];

    for (const id of effectiveSelectedOptionIds) {
      const opt = allOptions.get(Number(id));
      if (opt) {
        priceAdj += (Number(opt.price_adjustment_centavos) || 0) / 100;
        durAdj += Number(opt.duration_adjustment_minutes) || 0;
        details.push(opt);
      }
    }

    return {
      totalPrice: Math.max(0, basePrice + priceAdj),
      totalDuration: Math.max(1, baseDuration + durAdj),
      selectedOptionDetails: details
    };
  }, [effectiveSelectedOptionIds, allOptions, basePrice, baseDuration]);

  const handleSelectOption = (groupId, optionId, groupType, maxSelections = 1) => {
    const optId = Number(optionId);
    setSelectedOptionIds((prev) => {
      if (groupType === 'variation' || maxSelections === 1) {
        // Single select for variation groups: remove existing options from this group
        const groupOptionIds = new Set(
          (visibleOptionGroups.find((g) => g.group_id === groupId)?.options || []).map((o) => Number(o.option_id))
        );
        const filtered = prev.filter((id) => !groupOptionIds.has(id));
        return [...filtered, optId];
      } else {
        // Multi select for addon groups
        if (prev.includes(optId)) {
          return prev.filter((id) => id !== optId);
        } else {
          return [...prev, optId];
        }
      }
    });
  };

  const handleConfirm = () => {
    onConfirmOptions?.({
      serviceItem,
      selectedOptionIds: effectiveSelectedOptionIds,
      selectedOptionDetails,
      totalPrice,
      totalDuration
    });
    onOpenChange?.(false);
  };

  if (!serviceItem) return null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md w-full rounded-2xl p-6 bg-white shadow-2xl">
        <DialogHeader>
          <div className="flex items-center gap-2 text-blue-600 text-xs font-bold uppercase tracking-wider">
            <Tag className="h-4 w-4" />
            <span>Service Options & Add-ons</span>
          </div>
          <DialogTitle className="text-lg font-extrabold text-slate-900 mt-1">
            {serviceItem.name || serviceItem.item_name}
          </DialogTitle>
          <DialogDescription className="text-xs text-slate-500">
            Customize variations, duration, and optional add-ons for this service.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 my-3 max-h-[50vh] overflow-y-auto pr-1">
          {visibleOptionGroups.length === 0 ? (
            <div className="rounded-xl border border-dashed border-slate-200 p-4 text-center text-xs text-slate-500">
              No additional options or add-ons configured for this service.
            </div>
          ) : (
            visibleOptionGroups.map((group) => {
              const isVariation = group.group_type === 'variation';
              return (
                <div key={group.group_id} className="rounded-xl border border-slate-200 p-3 bg-slate-50/50 space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-bold text-slate-800">{group.name}</span>
                    <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-blue-50 text-blue-700">
                      {isVariation ? 'Select One' : 'Add-ons'}
                    </span>
                  </div>

                  <div className="space-y-1.5">
                    {(group.options || []).map((opt) => {
                      const optId = Number(opt.option_id);
                      const isSelected = selectedOptionIds.includes(optId);
                      const priceAdj = (Number(opt.price_adjustment_centavos) || 0) / 100;
                      const durAdj = Number(opt.duration_adjustment_minutes) || 0;

                      return (
                        <button
                          key={optId}
                          type="button"
                          onClick={() => handleSelectOption(group.group_id, optId, group.group_type, group.max_selections)}
                          className={`w-full flex items-center justify-between p-2 rounded-lg border text-left text-xs transition-all ${
                            isSelected
                              ? 'border-blue-500 bg-blue-50/80 font-bold text-blue-900 shadow-sm'
                              : 'border-slate-200 bg-white hover:border-slate-300 text-slate-700'
                          }`}
                        >
                          <div className="flex items-center gap-2 min-w-0">
                            <div className={`h-4 w-4 rounded-${isVariation ? 'full' : 'md'} border flex items-center justify-center shrink-0 ${
                              isSelected ? 'border-blue-600 bg-blue-600 text-white' : 'border-slate-300 bg-white'
                            }`}>
                              {isSelected && <Check className="h-3 w-3 stroke-[3]" />}
                            </div>
                            <span className="truncate">{opt.name}</span>
                          </div>

                          <div className="flex items-center gap-2 text-[11px] shrink-0 font-medium text-slate-600">
                            {durAdj !== 0 && (
                              <span className="flex items-center gap-0.5 text-slate-500">
                                <Clock className="h-3 w-3" />
                                {durAdj > 0 ? `+${durAdj}m` : `${durAdj}m`}
                              </span>
                            )}
                            {priceAdj !== 0 && (
                              <span className={priceAdj > 0 ? 'text-emerald-700 font-bold' : 'text-slate-500'}>
                                {priceAdj > 0 ? `+₱${priceAdj.toFixed(2)}` : `-₱${Math.abs(priceAdj).toFixed(2)}`}
                              </span>
                            )}
                          </div>
                        </button>
                      );
                    })}
                  </div>
                </div>
              );
            })
          )}

          {/* Quote Summary Box */}
          <div className="rounded-xl border border-blue-200 bg-blue-50/60 p-3 flex items-center justify-between text-xs">
            <div>
              <p className="text-slate-500 text-[11px]">Total Duration</p>
              <p className="font-extrabold text-slate-900 flex items-center gap-1 mt-0.5">
                <Clock className="h-3.5 w-3.5 text-blue-600" />
                {totalDuration} mins
              </p>
            </div>
            <div className="text-right">
              <p className="text-slate-500 text-[11px]">Final Quote Price</p>
              <p className="font-extrabold text-blue-700 text-sm mt-0.5">
                ₱{totalPrice.toFixed(2)}
              </p>
            </div>
          </div>
        </div>

        <DialogFooter className="flex items-center justify-end gap-2 pt-2 border-t border-slate-100">
          <Button type="button" variant="outline" size="sm" onClick={() => onOpenChange?.(false)}>
            Cancel
          </Button>
          <Button type="button" size="sm" onClick={handleConfirm} className="bg-blue-600 hover:bg-blue-700 text-white font-bold">
            <Plus className="h-4 w-4 mr-1" /> Add Service to Sale
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
