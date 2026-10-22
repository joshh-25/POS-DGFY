import React from 'react';

export function StorefrontCourierDetails({ delivery }) {
  if (!delivery || !['rider_assigned', 'picked_up', 'delivered'].includes(delivery.stage)) return null;
  const courier = String(delivery.courier_name || '').trim();
  const reference = String(delivery.courier_reference || '').trim();
  const rider = String(delivery.rider_name || '').trim();
  const link = String(delivery.tracking_url || '').trim();
  const safeLink = /^https:\/\/[^\s/]+(?:\/[^\s]*)?$/i.test(link) ? link : null;
  if (!courier && !reference && !rider && !safeLink) return null;
  return (
    <section aria-label="Courier details" className="rounded-xl border border-slate-200 bg-white p-4 text-sm text-slate-700">
      <h3 className="font-bold text-slate-900">Courier details</h3>
      {courier ? <p>Courier: {courier}</p> : null}
      {reference ? <p>Booking reference: {reference}</p> : null}
      {rider ? <p>Rider: {rider}</p> : null}
      {safeLink ? <a href={safeLink} target="_blank" rel="noopener noreferrer" className="font-semibold text-blue-700 underline">Open courier tracking</a> : null}
    </section>
  );
}
