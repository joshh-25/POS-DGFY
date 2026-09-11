import React, { useState } from 'react';

export function FnbWorkflowPanel({
  orderMethod,
  setOrderMethod,
  tableNumber = '',
  setTableNumber,
  kitchenNotes = '',
  setKitchenNotes,
  paymentTypeField = null,
  buttonLayout = false,
  isTabletViewport = false,
  disabled = false,
  cartItemCount = 0
}) {
  const orderMethods = [
    { value: 'dine_in', label: 'Dine In' },
    { value: 'takeout', label: 'Take Out' },
    { value: 'pickup', label: 'Pick Up' },
    { value: 'delivery', label: 'Delivery' }
  ];

  const hasCartItems = Number(cartItemCount) > 0;
  const hasOptionalDetails = orderMethod === 'dine_in' || (orderMethod === 'takeout' && Boolean(setKitchenNotes));
  const [optionalDetailsOpen, setOptionalDetailsOpen] = useState(() => !hasCartItems);

  const optionalDetailsHaveValues = Boolean(String(tableNumber || '').trim() || String(kitchenNotes || '').trim());
  const optionalDetailsLabel = optionalDetailsOpen
    ? 'Hide table & notes'
    : (optionalDetailsHaveValues ? 'Edit table & notes' : 'Add table & notes');

  return (
    <div data-testid="fnb-workflow-panel" className="grid w-full min-w-0 max-w-full grid-cols-2 gap-x-2 gap-y-0">
      {buttonLayout ? (
        <fieldset className="col-span-full w-full min-w-0 max-w-full space-y-1 py-[5px]" aria-label="Order Method">
          <legend className="text-[11px] font-bold text-slate-600">Order Method</legend>
          <div className="w-full min-w-0 max-w-full overflow-x-auto overflow-y-hidden overscroll-x-contain pb-1 touch-pan-x">
            <div className="grid w-max min-w-full grid-cols-4 gap-1.5 overflow-visible sm:w-full" data-testid="pos-checkout-order-method-buttons">
              {orderMethods.map((method) => (
                <button
                  key={method.value}
                  type="button"
                  aria-pressed={orderMethod === method.value}
                  onClick={() => setOrderMethod(method.value)}
                  disabled={disabled}
                  className={`h-9 min-w-[6.5rem] rounded-lg border px-2 text-[11px] font-extrabold transition sm:min-w-0 sm:w-full ${
                    orderMethod === method.value
                      ? 'border-[#1A4E8D] bg-[#1A4E8D] text-white'
                      : 'border-slate-200 bg-white text-slate-700 hover:border-blue-300 hover:bg-blue-50'
                  }`}
                >
                  {method.label}
                </button>
              ))}
            </div>
          </div>
        </fieldset>
      ) : (
        <label className="block text-[11px] font-bold text-slate-600">
          Order Method
          <select
            value={orderMethod}
            onChange={(e) => setOrderMethod(e.target.value)}
            disabled={disabled}
            className="mt-1 h-8 w-full rounded-lg border border-slate-200 bg-white px-2 py-1 text-[12px] font-semibold text-slate-800 focus:outline-none focus:ring-1 focus:ring-blue-500"
          >
            <option value="dine_in">Dine In</option>
            <option value="takeout">Takeout</option>
            <option value="pickup">Pickup</option>
            <option value="delivery">Delivery</option>
          </select>
        </label>
      )}

      {hasOptionalDetails && hasCartItems && (
        <button
          type="button"
          className="col-span-full h-8 rounded-lg border border-slate-200 bg-slate-50 px-2 text-left text-[11px] font-extrabold text-slate-700 hover:border-blue-300 hover:bg-blue-50"
           onClick={() => setOptionalDetailsOpen((open) => !open)}
           disabled={disabled}
           aria-expanded={optionalDetailsOpen}
         >
          {optionalDetailsLabel}
        </button>
      )}

      {(!hasCartItems || optionalDetailsOpen) && (
         <div className="contents">
          {orderMethod === 'dine_in' && (
            <label className="block text-[11px] font-bold text-slate-600">
              Table # (Optional)
              <input
                type="text"
                placeholder="e.g. T-04"
                value={tableNumber}
                onChange={(e) => setTableNumber?.(e.target.value)}
                disabled={disabled}
                className="mt-1 h-8 w-full rounded-lg border border-slate-200 px-2 text-[12px] text-slate-800"
              />
            </label>
          )}

          {(orderMethod === 'dine_in' || orderMethod === 'takeout') && setKitchenNotes && (
            <label className={`${orderMethod === 'takeout' && isTabletViewport ? 'col-span-full ' : ''}block text-[11px] font-bold text-slate-600`}>
              Order Notes (Global)
              <input
                type="text"
                placeholder="Applies to the whole order"
                value={kitchenNotes}
                onChange={(e) => setKitchenNotes(e.target.value)}
                disabled={disabled}
                className="mt-1 h-8 w-full rounded-lg border border-slate-200 px-2 text-[12px] text-slate-800"
              />
            </label>
          )}
        </div>
      )}

      {paymentTypeField ? (
        <div className="col-span-full w-full min-w-0 max-w-full">
          {paymentTypeField}
        </div>
      ) : null}
    </div>
  );
}
