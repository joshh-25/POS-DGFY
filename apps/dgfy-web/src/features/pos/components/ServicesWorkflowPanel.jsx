import React from 'react';

export function ServicesWorkflowPanel({
  visitType = 'walk_in',
  setVisitType,
  clientName = '',
  setClientName,
  appointmentDateTime = '',
  setAppointmentDateTime,
  provider = '',
  setProvider,
  resource = '',
  setResource,
  serviceNotes = '',
  setServiceNotes,
  disabled = false
}) {
  const isWalkIn = visitType === 'walk_in';

  return (
    <div data-testid="services-workflow-panel" className="space-y-2">
      <label className="text-[11px] text-slate-500 block font-medium">
        Visit Method
        <select
          value={visitType}
          onChange={(e) => setVisitType(e.target.value)}
          disabled={disabled}
          className="mt-1 h-8 w-full rounded-lg border border-slate-200 px-2 py-1 text-[12px] bg-white text-slate-800 font-semibold focus:outline-none focus:ring-1 focus:ring-blue-500"
        >
          <option value="walk_in">Walk-in</option>
          <option value="appointment">Appointment</option>
        </select>
      </label>

      <div className="grid grid-cols-2 gap-2">
        <label className="text-[11px] text-slate-500 block font-medium">
          Client Name
          <input
            type="text"
            placeholder="Walk-in Client"
            value={clientName}
            onChange={(e) => setClientName?.(e.target.value)}
            disabled={disabled}
            className="mt-1 h-8 w-full rounded-lg border border-slate-200 px-2 text-[12px] text-slate-800"
          />
        </label>
        <label className="text-[11px] text-slate-500 block font-medium">
          {isWalkIn ? 'Service Time' : 'Appointment Time'}
          <input
            type="datetime-local"
            value={appointmentDateTime}
            onChange={(e) => setAppointmentDateTime?.(e.target.value)}
            disabled={disabled}
            className="mt-1 h-8 w-full rounded-lg border border-slate-200 px-1 text-[11px] text-slate-800"
          />
        </label>
      </div>

      <div className="grid grid-cols-2 gap-2">
        <label className="text-[11px] text-slate-500 block font-medium">
          Provider / Employee
          <input
            type="text"
            placeholder="Any available"
            value={provider}
            onChange={(e) => setProvider?.(e.target.value)}
            disabled={disabled}
            className="mt-1 h-8 w-full rounded-lg border border-slate-200 px-2 text-[12px] text-slate-800"
          />
        </label>
        <label className="text-[11px] text-slate-500 block font-medium">
          Resource / Room
          <input
            type="text"
            placeholder="Room 1 / Chair 1"
            value={resource}
            onChange={(e) => setResource?.(e.target.value)}
            disabled={disabled}
            className="mt-1 h-8 w-full rounded-lg border border-slate-200 px-2 text-[12px] text-slate-800"
          />
        </label>
      </div>

      {setServiceNotes && (
        <label className="text-[11px] text-slate-500 block font-medium">
          Service Notes
          <input
            type="text"
            placeholder="Special requests or notes"
            value={serviceNotes}
            onChange={(e) => setServiceNotes(e.target.value)}
            disabled={disabled}
            className="mt-1 h-8 w-full rounded-lg border border-slate-200 px-2 text-[12px] text-slate-800"
          />
        </label>
      )}
    </div>
  );
}
