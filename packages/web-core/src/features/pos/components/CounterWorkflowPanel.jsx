import React from 'react';
import { ORDER_METHOD_LABELS } from './orderFulfillmentUi.js';

export function CounterWorkflowPanel({
  orderMethod,
  setOrderMethod,
  allowedMethods = [],
  disabled = false
}) {
  return (
    <div data-testid="counter-workflow-panel" className="space-y-2">
      <label className="text-[11px] text-slate-500 block font-medium">
        Order Method
        <select
          value={orderMethod}
          onChange={(e) => setOrderMethod(e.target.value)}
          disabled={disabled}
          className="mt-1 h-8 w-full rounded-lg border border-slate-200 px-2 py-1 text-[12px] bg-white text-slate-800 font-semibold focus:outline-none focus:ring-1 focus:ring-blue-500"
        >
          {allowedMethods.map((method) => (
            <option key={method} value={method}>
              {ORDER_METHOD_LABELS[method] || method}
            </option>
          ))}
        </select>
      </label>
    </div>
  );
}
