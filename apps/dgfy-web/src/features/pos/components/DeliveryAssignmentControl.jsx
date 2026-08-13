import React from 'react';
import { Button } from '@/components/ui/button';
import { hasCompleteDeliveryAssignment, isManualDeliveryJob } from './orderFulfillmentUi.js';

const getAssignedPersonnel = (deliveryJob = {}) => (
  deliveryJob?.deliveryPersonnel || deliveryJob?.delivery_personnel || null
);

export default function DeliveryAssignmentControl({
  orderId,
  deliveryJob = null,
  canAssignOrder = false,
  deliveryPersonnelState = {},
  actionLoading = '',
  canTransactPos = false,
  locked = false,
  isOnline = true,
  hasActiveShift = false,
  onAssign = async () => false
}) {
  const normalizedOrderId = Number(orderId || 0);
  const assignedPersonnel = getAssignedPersonnel(deliveryJob || {});
  const assignedPersonnelName = String(
    deliveryJob?.delivery_personnel_name || assignedPersonnel?.display_name || ''
  ).trim();
  const [selectedPersonnelName, setSelectedPersonnelName] = React.useState(
    assignedPersonnelName
  );
  const status = String(deliveryJob?.status || 'pending_dispatch').trim().toLowerCase();
  const assignmentActionKey = `delivery-assignment:${normalizedOrderId}`;
  const assignmentSaving = actionLoading === assignmentActionKey;
  const assignmentComplete = hasCompleteDeliveryAssignment(deliveryJob || {});
  const assignmentLocked = ['picked_up', 'delivered', 'failed', 'cancelled'].includes(status);

  React.useEffect(() => {
    setSelectedPersonnelName(assignedPersonnelName);
  }, [assignedPersonnelName]);

  if (!isManualDeliveryJob(deliveryJob || {})) {
    return (
      <p className="mt-3 rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-xs text-slate-600">
        Delivery is managed by the external provider. Assignment and delivery status are read-only in POS.
      </p>
    );
  }

  if (!canAssignOrder) {
    return (
      <p className="mt-3 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800">
        Mark the order as Out for Delivery before assigning delivery personnel.
      </p>
    );
  }

  if (assignmentLocked) {
    return (
      <p className="mt-3 rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-xs text-slate-600">
        {assignedPersonnelName
          ? `Assigned to ${assignedPersonnelName}. Assignment is locked after pickup starts.`
          : (assignmentComplete ? 'Delivery personnel assigned. Assignment is locked after pickup starts.' : 'Assignment is locked for this delivery state.')}
      </p>
    );
  }

  const normalizedPersonnelName = selectedPersonnelName.trim();
  const disabled = locked || !isOnline || !canTransactPos || !hasActiveShift || !canAssignOrder || !normalizedPersonnelName;
  const errorMessage = String(deliveryPersonnelState?.errorMessage || '').trim();

  return (
    <div className="mt-3 rounded-lg border border-blue-100 bg-blue-50/50 px-3 py-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-xs font-extrabold uppercase tracking-wide text-[#1A4E8D]">Delivery personnel</p>
        <span className={`text-[11px] font-bold ${assignmentComplete ? 'text-emerald-700' : 'text-amber-700'}`}>
          {assignmentComplete ? 'Assigned' : 'Required before dispatch'}
        </span>
      </div>
      <div className="mt-2 flex flex-col gap-2 sm:flex-row">
        <input
          type="text"
          aria-label={`Delivery personnel for order ${normalizedOrderId}`}
          placeholder="Enter delivery personnel name"
          value={selectedPersonnelName}
          maxLength={255}
          autoComplete="off"
          onChange={(event) => setSelectedPersonnelName(event.target.value)}
          disabled={locked || !isOnline || !canTransactPos || !hasActiveShift || !canAssignOrder || assignmentSaving}
          className="h-9 min-w-0 flex-1 rounded-md border border-blue-200 bg-white px-2 text-sm font-semibold text-slate-800 focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-100"
        />
        <Button
          type="button"
          size="sm"
          disabled={disabled || assignmentSaving}
          onClick={() => onAssign(normalizedOrderId, normalizedPersonnelName)}
          className="h-9 shrink-0 !bg-[#2563EB] px-3 text-white hover:!bg-[#1D4ED8]"
        >
          {assignmentSaving ? 'Saving...' : assignmentComplete ? 'Reassign' : 'Assign Delivery'}
        </Button>
      </div>
      <p className="mt-2 text-[11px] text-slate-600">Third-party courier name; registration is not required.</p>
      {!hasActiveShift ? (
        <p className="mt-2 text-[11px] text-amber-700">Open a shift before assigning delivery personnel.</p>
      ) : null}
      {!canTransactPos ? (
        <p className="mt-2 text-[11px] text-slate-600">POS transact permission is required to assign delivery personnel.</p>
      ) : null}
      {errorMessage ? (
        <p className="mt-2 text-[11px] text-rose-700">{errorMessage}</p>
      ) : null}
    </div>
  );
}
