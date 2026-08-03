import React from 'react';

export function ServiceTicketPrintView({ booking }) {
  if (!booking) return null;

  const {
    booking_number = 'BKG-PROVISIONAL',
    client_name = 'Walk-in Client',
    service_name = 'Service',
    variation_name = 'Standard',
    add_ons = [],
    provider_name = 'Unassigned',
    resource_name = 'Unassigned',
    scheduled_at = new Date().toLocaleString(),
    duration_minutes = 30,
    service_notes = '',
    booking_status = 'Confirmed'
  } = booking;

  return (
    <div data-testid="service-ticket-print-view" className="w-[80mm] p-4 bg-white text-slate-900 font-mono text-xs space-y-3">
      {/* Header */}
      <div className="text-center border-b border-slate-300 pb-2">
        <h2 className="text-sm font-bold uppercase tracking-wider">SERVICE TICKET</h2>
        <p className="text-[10px] text-slate-500">Operational Document — Non-Fiscal Receipt</p>
      </div>

      {/* Ticket Identity */}
      <div className="space-y-1">
        <div className="flex justify-between">
          <span className="font-bold">Booking #:</span>
          <span>{booking_number}</span>
        </div>
        <div className="flex justify-between">
          <span className="font-bold">Status:</span>
          <span className="uppercase font-semibold text-blue-700">{booking_status}</span>
        </div>
        <div className="flex justify-between">
          <span className="font-bold">Scheduled:</span>
          <span>{scheduled_at}</span>
        </div>
      </div>

      <div className="border-t border-dashed border-slate-300 my-2" />

      {/* Service Details */}
      <div className="space-y-1.5">
        <div>
          <p className="text-[10px] text-slate-500 uppercase font-semibold">Service</p>
          <p className="font-bold text-sm">{service_name}</p>
        </div>

        {variation_name && (
          <div className="flex justify-between text-[11px]">
            <span>Variation:</span>
            <span className="font-semibold">{variation_name}</span>
          </div>
        )}

        <div className="flex justify-between text-[11px]">
          <span>Duration:</span>
          <span className="font-semibold">{duration_minutes} mins</span>
        </div>

        {add_ons.length > 0 && (
          <div>
            <p className="text-[10px] text-slate-500 uppercase font-semibold mt-1">Add-ons</p>
            <ul className="list-disc list-inside space-y-0.5 text-[11px]">
              {add_ons.map((addon, index) => (
                <li key={index} className="truncate">
                  {typeof addon === 'string' ? addon : addon.name}
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>

      <div className="border-t border-dashed border-slate-300 my-2" />

      {/* Assignment & Notes */}
      <div className="space-y-1 text-[11px]">
        <div className="flex justify-between">
          <span>Client:</span>
          <span className="font-semibold">{client_name}</span>
        </div>
        <div className="flex justify-between">
          <span>Provider:</span>
          <span className="font-semibold">{provider_name}</span>
        </div>
        <div className="flex justify-between">
          <span>Resource / Room:</span>
          <span className="font-semibold">{resource_name}</span>
        </div>
        {service_notes && (
          <div className="mt-1 pt-1 border-t border-slate-100">
            <p className="text-[10px] text-slate-500 font-semibold">Notes:</p>
            <p className="italic text-slate-700">{service_notes}</p>
          </div>
        )}
      </div>

      {/* Footer */}
      <div className="border-t border-slate-300 pt-2 text-center text-[10px] text-slate-500">
        <p>Thank you for choosing our services!</p>
      </div>
    </div>
  );
}
