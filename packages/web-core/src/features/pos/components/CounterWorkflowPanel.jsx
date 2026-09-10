import React from 'react';
import { ORDER_METHOD_LABELS } from './orderFulfillmentUi.js';

export function CounterWorkflowPanel({
  orderMethod,
  setOrderMethod,
  allowedMethods = [],
  buttonLayout = false,
  disabled = false
}) {
  return (
    <div data-testid="counter-workflow-panel" className="space-y-4">
      {buttonLayout ? (
        <fieldset className="w-full min-w-0 max-w-full space-y-1 py-[5px]" aria-label="Order Method">
          <legend className="text-[11px] font-bold text-slate-600">Order Method</legend>
          <div className="w-full min-w-0 max-w-full overflow-x-auto overflow-y-hidden overscroll-x-contain pb-1 touch-pan-x">
            <div className="grid w-max min-w-full grid-cols-4 gap-1.5 overflow-visible sm:w-full" data-testid="pos-checkout-order-method-buttons">
              {allowedMethods.map((method) => (
                <button
                  key={method}
                  type="button"
                  aria-pressed={orderMethod === method}
                  onClick={() => setOrderMethod(method)}
                  disabled={disabled}
                  className={`h-9 min-w-[6.5rem] rounded-lg border px-2 text-[11px] font-extrabold transition sm:min-w-0 sm:w-full ${
                    orderMethod === method
                      ? 'border-[#1A4E8D] bg-[#1A4E8D] text-white'
                      : 'border-slate-200 bg-white text-slate-700 hover:border-blue-300 hover:bg-blue-50'
                  }`}
                >
                  {ORDER_METHOD_LABELS[method] || method}
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
            {allowedMethods.map((method) => (
              <option key={method} value={method}>
                {ORDER_METHOD_LABELS[method] || method}
              </option>
            ))}
          </select>
        </label>
      )}
    </div>
  );
}
