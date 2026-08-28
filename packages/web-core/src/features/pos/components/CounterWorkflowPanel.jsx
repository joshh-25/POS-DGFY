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
    <div data-testid="counter-workflow-panel" className="space-y-2">
      {buttonLayout ? (
        <fieldset className="space-y-1" aria-label="Order Method">
          <legend className="text-[11px] font-medium text-slate-500">Order Method</legend>
          <div className="grid grid-cols-2 gap-1.5 sm:grid-cols-4" data-testid="pos-checkout-order-method-buttons">
            {allowedMethods.map((method) => (
              <button
                key={method}
                type="button"
                aria-pressed={orderMethod === method}
                onClick={() => setOrderMethod(method)}
                disabled={disabled}
                className={`h-9 rounded-lg border px-2 text-[11px] font-extrabold transition ${
                  orderMethod === method
                    ? 'border-[#1A4E8D] bg-[#1A4E8D] text-white'
                    : 'border-slate-200 bg-white text-slate-700 hover:border-blue-300 hover:bg-blue-50'
                }`}
              >
                {ORDER_METHOD_LABELS[method] || method}
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
