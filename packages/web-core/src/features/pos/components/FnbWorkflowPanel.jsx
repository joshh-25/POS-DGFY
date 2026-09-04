import React from 'react';

export function FnbWorkflowPanel({
  orderMethod,
  setOrderMethod,
  tableNumber = '',
  setTableNumber,
  kitchenNotes = '',
  setKitchenNotes,
  paymentTypeField = null,
  buttonLayout = false,
  disabled = false
}) {
  const orderMethods = [
    { value: 'dine_in', label: 'Dine In' },
    { value: 'takeout', label: 'Take Out' },
    { value: 'pickup', label: 'Pick Up' },
    { value: 'delivery', label: 'Delivery' }
  ];

  return (
    <div data-testid="fnb-workflow-panel" className="grid grid-cols-2 gap-2 max-[360px]:grid-cols-1">
      {buttonLayout ? (
        <fieldset className="col-span-full space-y-1" aria-label="Order Method">
          <legend className="text-[11px] font-medium text-slate-500">Order Method</legend>
          <div className="grid grid-cols-2 gap-1.5 sm:grid-cols-4" data-testid="pos-checkout-order-method-buttons">
            {orderMethods.map((method) => (
              <button
                key={method.value}
                type="button"
                aria-pressed={orderMethod === method.value}
                onClick={() => setOrderMethod(method.value)}
                disabled={disabled}
                className={`h-9 rounded-lg border px-2 text-[11px] font-extrabold transition ${
                  orderMethod === method.value
                    ? 'border-[#1A4E8D] bg-[#1A4E8D] text-white'
                    : 'border-slate-200 bg-white text-slate-700 hover:border-blue-300 hover:bg-blue-50'
                }`}
              >
                {method.label}
              </button>
            ))}
          </div>
        </fieldset>
      ) : (
        <label className="block text-[11px] font-medium text-slate-500">
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
          Order Notes (global)
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

      {paymentTypeField}
    </div>
  );
}
