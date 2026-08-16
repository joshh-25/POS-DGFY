import React from 'react';

export function FnbWorkflowPanel({
  orderMethod,
  setOrderMethod,
  tableNumber = '',
  setTableNumber,
  kitchenNotes = '',
  setKitchenNotes,
  paymentTypeField = null,
  disabled = false
}) {
  return (
    <div data-testid="fnb-workflow-panel" className="grid grid-cols-2 gap-2 max-[360px]:grid-cols-1">
      <label className="text-[11px] text-slate-500 block font-medium">
        Order Method
        <select
          value={orderMethod}
          onChange={(e) => setOrderMethod(e.target.value)}
          disabled={disabled}
          className="mt-1 h-8 w-full rounded-lg border border-slate-200 px-2 py-1 text-[12px] bg-white text-slate-800 font-semibold focus:outline-none focus:ring-1 focus:ring-blue-500"
        >
          <option value="dine_in">Dine In</option>
          <option value="takeout">Takeout</option>
          <option value="pickup">Pickup</option>
          <option value="delivery">Delivery</option>
        </select>
      </label>

      {orderMethod === 'dine_in' && (
        <label className="text-[11px] text-slate-500 block font-medium">
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
        <label className="text-[11px] text-slate-500 block font-medium">
          Kitchen Notes
          <input
            type="text"
            placeholder="Less ice, no onions, etc."
            value={kitchenNotes}
            onChange={(e) => setKitchenNotes(e.target.value)}
            disabled={disabled}
            className="mt-1 h-8 w-full rounded-lg border border-slate-200 px-2 text-[12px] text-slate-800"
          />
        </label>
      )}

      {paymentTypeField}
    </div>
  );
}
