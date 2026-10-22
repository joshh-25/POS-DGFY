import React from 'react';
import { Button } from '@/components/ui/button';
import { hasCompleteDeliveryAssignment, isManualDeliveryJob } from './orderFulfillmentUi.js';

const getAssignedPersonnel = (deliveryJob = {}) => (
  deliveryJob?.deliveryPersonnel || deliveryJob?.delivery_personnel || null
);
const getCourierService = (deliveryJob = {}, assignedPersonnel = null) => {
  if (deliveryJob?.courier_service) return deliveryJob.courier_service;
  const personnelId = Number(deliveryJob?.delivery_personnel_id || assignedPersonnel?.delivery_personnel_id || 0);
  return personnelId > 0 ? 'own' : '';
};

export default function DeliveryAssignmentControl({
  orderId,
  deliveryJob = null,
  directDelivery = false,
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
  const assignedPersonnelId = Number(deliveryJob?.delivery_personnel_id || assignedPersonnel?.delivery_personnel_id || 0);
  const assignedPersonnelName = String(
    deliveryJob?.delivery_personnel_name || assignedPersonnel?.display_name || ''
  ).trim();
  const [selectedPersonnelName, setSelectedPersonnelName] = React.useState(
    assignedPersonnelName
  );
  const [courierService, setCourierService] = React.useState(getCourierService(deliveryJob, assignedPersonnel));
  const [courierServiceName, setCourierServiceName] = React.useState(deliveryJob?.courier_service_name || '');
  const [courierReference, setCourierReference] = React.useState(deliveryJob?.courier_reference || '');
  const [trackingUrl, setTrackingUrl] = React.useState(deliveryJob?.tracking_url || '');
  const status = String(deliveryJob?.status || 'pending_dispatch').trim().toLowerCase();
  const assignmentActionKey = `delivery-assignment:${normalizedOrderId}`;
  const assignmentSaving = actionLoading === assignmentActionKey;
  const assignmentComplete = hasCompleteDeliveryAssignment(deliveryJob || {});
  const assignmentLocked = ['picked_up', 'delivered', 'failed', 'cancelled'].includes(status);

  React.useEffect(() => {
    setSelectedPersonnelName(assignedPersonnelName);
    setCourierService(getCourierService(deliveryJob, assignedPersonnel));
    setCourierServiceName(deliveryJob?.courier_service_name || '');
    setCourierReference(deliveryJob?.courier_reference || '');
    setTrackingUrl(deliveryJob?.tracking_url || '');
  }, [assignedPersonnelId, assignedPersonnelName, deliveryJob?.courier_service, deliveryJob?.courier_service_name, deliveryJob?.courier_reference, deliveryJob?.tracking_url]);

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
        {directDelivery ? 'Assignment is available after the order is confirmed.' : 'Mark the order as Out for Delivery before assigning delivery personnel.'}
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
  const registryPersonnel = Array.isArray(deliveryPersonnelState?.personnel) ? deliveryPersonnelState.personnel : [];
  const matchedRegistryEntry = registryPersonnel.find(
    (person) => person?.is_active !== false
      && String(person?.display_name || '').trim().toLowerCase() === normalizedPersonnelName.toLowerCase()
  );
  const validTrackingUrl = !trackingUrl.trim() || /^https:\/\/[^\s/]+(?:\/[^\s]*)?$/i.test(trackingUrl.trim());
  const directFieldsValid = !directDelivery || (Boolean(courierService)
    && (courierService !== 'other' || Boolean(courierServiceName.trim()))
    && (courierService !== 'own' || Boolean(matchedRegistryEntry || normalizedPersonnelName)) && validTrackingUrl);
  const disabled = locked || !isOnline || !canTransactPos || !hasActiveShift || !canAssignOrder
    || !directFieldsValid || (!directDelivery && !normalizedPersonnelName);
  const errorMessage = String(deliveryPersonnelState?.errorMessage || '').trim();
  // Phase 205 (#1080): a datalist gives a real registry picker while keeping the input a plain
  // free-text field by construction -- ADR 0034's 2026-08-12 amendment requires the free-text
  // fallback to keep working unchanged.
  const datalistId = `delivery-personnel-options-${normalizedOrderId}`;

  return (
    <div id={`delivery-assignment-${normalizedOrderId}`} className="mt-3 rounded-lg border border-blue-100 bg-blue-50/50 px-3 py-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-xs font-extrabold uppercase tracking-wide text-[#1A4E8D]">Delivery personnel</p>
        <span className={`text-[11px] font-bold ${assignmentComplete ? 'text-emerald-700' : 'text-amber-700'}`}>
          {assignmentComplete ? 'Assigned' : 'Required before dispatch'}
        </span>
      </div>
      {directDelivery ? (
        <div className="mt-3 space-y-2">
          <fieldset className="flex flex-wrap gap-3 text-xs font-semibold text-slate-700">
            <legend className="mb-1">Courier company</legend>
            {[
              ['own', 'Own'], ['maxim', 'Maxim'], ['grabexpress', 'GrabExpress'],
              ['lalamove', 'Lalamove'], ['other', 'Other']
            ].map(([value, label]) => (
              <label key={value} className="inline-flex items-center gap-1">
                <input type="radio" name={`courier-service-${normalizedOrderId}`} value={value}
                  checked={courierService === value} onChange={() => setCourierService(value)}
                  disabled={assignmentSaving || locked || !isOnline} />{label}
              </label>
            ))}
          </fieldset>
          {courierService === 'other' ? (
            <input aria-label="Other courier company" placeholder="Courier company name" maxLength={120}
              value={courierServiceName} onChange={(event) => setCourierServiceName(event.target.value)}
              className="h-9 w-full rounded-md border border-blue-200 px-2 text-sm" />
          ) : null}
          <input aria-label="Courier booking reference" placeholder="Booking reference (optional)" maxLength={120}
            value={courierReference} onChange={(event) => setCourierReference(event.target.value)}
            className="h-9 w-full rounded-md border border-blue-200 px-2 text-sm" />
          <input aria-label="Courier tracking link" placeholder="HTTPS tracking link (optional)" maxLength={1000}
            value={trackingUrl} onChange={(event) => setTrackingUrl(event.target.value)}
            className="h-9 w-full rounded-md border border-blue-200 px-2 text-sm" />
          {!validTrackingUrl ? <p className="text-xs text-rose-700">Tracking link must start with HTTPS.</p> : null}
        </div>
      ) : null}
      <div className="mt-2 flex flex-col gap-2 sm:flex-row">
        <input
          type="text"
          list={registryPersonnel.length > 0 ? datalistId : undefined}
          aria-label={`Delivery personnel for order ${normalizedOrderId}`}
          placeholder={directDelivery && courierService !== 'own' ? 'Rider name (optional)' : 'Pick a registered rider or type a name'}
          value={selectedPersonnelName}
          maxLength={255}
          autoComplete="off"
          onChange={(event) => setSelectedPersonnelName(event.target.value)}
          disabled={locked || !isOnline || !canTransactPos || !hasActiveShift || !canAssignOrder || assignmentSaving}
          className="h-9 min-w-0 flex-1 rounded-md border border-blue-200 bg-white px-2 text-sm font-semibold text-slate-800 focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-100"
        />
        {registryPersonnel.length > 0 ? (
          <datalist id={datalistId}>
            {registryPersonnel
              .filter((person) => person?.is_active !== false)
              .map((person) => <option key={person.delivery_personnel_id} value={person.display_name} />)}
          </datalist>
        ) : null}
        <Button
          type="button"
          size="sm"
          disabled={disabled || assignmentSaving}
          onClick={() => onAssign(normalizedOrderId, {
            ...(matchedRegistryEntry ? { id: matchedRegistryEntry.delivery_personnel_id }
              : normalizedPersonnelName ? { name: normalizedPersonnelName } : {}),
            ...(directDelivery ? {
              courier_service: courierService,
              courier_service_name: courierService === 'other' ? courierServiceName.trim() : null,
              courier_reference: courierReference.trim() || null,
              tracking_url: trackingUrl.trim() || null
            } : {})
          })}
          className="h-9 shrink-0 !bg-[#2563EB] px-3 text-white hover:!bg-[#1D4ED8]"
        >
          {assignmentSaving ? 'Saving...' : directDelivery
            ? (assignmentComplete ? 'Change rider' : 'Assign rider')
            : (assignmentComplete ? 'Reassign' : 'Assign Delivery')}
        </Button>
      </div>
      <p className="mt-2 text-[11px] text-slate-600">{directDelivery
        ? 'Choose a courier company. Own requires a rider name; other couriers may be assigned before a rider is known.'
        : 'Pick a registered rider or type a third-party courier name.'}</p>
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
