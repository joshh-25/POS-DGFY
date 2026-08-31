import React from 'react';

// Phase 227 (#1273). Per-card checkbox for the Active Queue's bulk "add to run" selection.
// Purely presentational -- selection state lives in the parent (IncomingQueueWorkspace), this
// component only renders the control and forwards the toggle. The disabled reason (from
// deliveryRunEligibility.js's getRunAssignEligibility) is surfaced as both `title` (desktop
// hover) and `aria-label` so the "why can't I select this" answer is available without a
// separate tooltip component.

export default function QueueOrderSelectCheckbox({
  orderId,
  checked = false,
  eligible = true,
  reason = '',
  disabled = false,
  onToggle = () => {}
}) {
  const isDisabled = disabled || !eligible;
  const label = eligible
    ? `Select order ${orderId} for bulk add to run`
    : `Order ${orderId} is not eligible for bulk add to run: ${reason}`;

  return (
    <input
      type="checkbox"
      className="h-4 w-4 shrink-0 rounded border-slate-300 text-[#1A4E8D] focus:ring-2 focus:ring-blue-200 disabled:cursor-not-allowed disabled:opacity-40"
      checked={checked}
      disabled={isDisabled}
      title={eligible ? undefined : reason}
      aria-label={label}
      onChange={(event) => onToggle(orderId, event.target.checked)}
    />
  );
}
