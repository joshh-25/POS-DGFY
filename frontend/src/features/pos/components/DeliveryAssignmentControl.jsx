import React from 'react';
import { Button } from '@/components/ui/button';
import { hasCompleteDeliveryAssignment, isManualDeliveryJob } from './orderFulfillmentUi.js';

const getAssignedPersonnel = (deliveryJob = {}) => (
  deliveryJob?.deliveryPersonnel || deliveryJob?.delivery_personnel || null
);

const getPersonnelId = (personnel = {}) => Number(
  personnel?.delivery_personnel_id || personnel?.id || 0
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
  const assignedPersonnelId = Number(deliveryJob?.delivery_personnel_id || getPersonnelId(assignedPersonnel));
  const [selectedPersonnelId, setSelectedPersonnelId] = React.useState(
    assignedPersonnelId > 0 ? String(assignedPersonnelId) : ''
  );
  const personnel = Array.isArray(deliveryPersonnelState?.personnel)
    ? deliveryPersonnelState.personnel
    : [];
  const status = String(deliveryJob?.status || 'pending_dispatch').trim().toLowerCase();
  const assignmentActionKey = `delivery-assignment:${normalizedOrderId}`;
  const assignmentSaving = actionLoading === assignmentActionKey;
  const assignmentComplete = hasCompleteDeliveryAssignment(deliveryJob || {});
  const assignmentLocked = ['picked_up', 'delivered', 'failed', 'cancelled'].includes(status);

  React.useEffect(() => {
    setSelectedPersonnelId(assignedPersonnelId > 0 ? String(assignedPersonnelId) : '');
  }, [assignedPersonnelId]);

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
        {assignedPersonnel?.display_name
          ? `Assigned to ${assignedPersonnel.display_name}. Assignment is locked after pickup starts.`
          : (assignmentComplete ? 'Delivery personnel assigned. Assignment is locked after pickup starts.' : 'Assignment is locked for this delivery state.')}
      </p>
    );
  }

  const selectablePersonnel = [...personnel];
  if (assignedPersonnel && assignedPersonnelId > 0 && !selectablePersonnel.some((person) => getPersonnelId(person) === assignedPersonnelId)) {
    selectablePersonnel.unshift(assignedPersonnel);
  }
  const disabled = locked || !isOnline || !canTransactPos || !hasActiveShift || !canAssignOrder || !selectedPersonnelId || selectablePersonnel.length === 0;
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
        <select
          aria-label={`Delivery personnel for order ${normalizedOrderId}`}
          value={selectedPersonnelId}
          onChange={(event) => setSelectedPersonnelId(event.target.value)}
          disabled={locked || !isOnline || !canTransactPos || !hasActiveShift || !canAssignOrder || assignmentSaving || deliveryPersonnelState?.loading}
          className="h-9 min-w-0 flex-1 rounded-md border border-blue-200 bg-white px-2 text-sm font-semibold text-slate-800 focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-100"
        >
          <option value="">Select delivery personnel</option>
          {selectablePersonnel.map((person) => {
            const personId = getPersonnelId(person);
            return (
              <option key={`delivery-personnel-${personId}`} value={personId}>
                {person.display_name}{person.phone ? ` · ${person.phone}` : ''}
              </option>
            );
          })}
        </select>
        <Button
          type="button"
          size="sm"
          disabled={disabled || assignmentSaving}
          onClick={() => onAssign(normalizedOrderId, Number(selectedPersonnelId))}
          className="h-9 shrink-0 !bg-[#2563EB] px-3 text-white hover:!bg-[#1D4ED8]"
        >
          {assignmentSaving ? 'Saving...' : assignmentComplete ? 'Reassign' : 'Assign Delivery'}
        </Button>
      </div>
      {deliveryPersonnelState?.loading ? (
        <p className="mt-2 text-[11px] text-slate-600">Loading active delivery personnel...</p>
      ) : selectablePersonnel.length === 0 ? (
        <p className="mt-2 text-[11px] text-amber-700">No active delivery personnel is registered for this location.</p>
      ) : null}
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
