import React, { useEffect, useMemo, useState } from 'react';
import { requestJson } from '../../../services/requestJson.js';
import { createStorefrontIdempotencyKey } from '../../../shared/utils/idempotency.js';

const money = (centavos) => `₱${(Number(centavos || 0) / 100).toFixed(2)}`;

export function LaundryStorefrontCatalog({
  catalog = [], loading = false, error = '', selectedStore = null, locationId = null,
  customerName = '', customerEmail = '', customerPhone = ''
}) {
  const [quantities, setQuantities] = useState({});
  const [fulfillmentMode, setFulfillmentMode] = useState('pickup');
  const [address, setAddress] = useState('');
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState(false);
  const [availability, setAvailability] = useState(null);
  const [quote, setQuote] = useState(null);
  const [orderResult, setOrderResult] = useState(null);
  const lines = useMemo(() => catalog
    .map((item) => ({ item, quantity: Number(quantities[item.id] || 0) }))
    .filter(({ quantity }) => quantity > 0), [catalog, quantities]);
  const hasFixed = lines.some(({ item }) => item.pricingMode === 'fixed');
  const hasPerKilo = lines.some(({ item }) => item.pricingMode === 'per_kilo');

  useEffect(() => {
    if (!locationId) { setAvailability(null); return undefined; }
    let active = true;
    requestJson(`/api/v1/store/laundry/availability?location_id=${encodeURIComponent(locationId)}`, {
      storeSlug: selectedStore?.slug, selectedLocationId: locationId
    }).then((result) => { if (active) setAvailability(result?.payload || result?.data?.payload || null); })
      .catch(() => { if (active) setAvailability(null); });
    return () => { active = false; };
  }, [locationId, selectedStore?.slug]);

  const paymentSessionReference = orderResult?.payment_session?.public_reference;
  useEffect(() => {
    if (!paymentSessionReference || !selectedStore?.slug) return undefined;
    let active = true;
    const refresh = async () => {
      try {
        const result = await requestJson(`/api/v1/store/laundry/payment-sessions/${encodeURIComponent(paymentSessionReference)}`, {
          storeSlug: selectedStore.slug
        });
        const session = result?.data?.payment_session;
        if (active && session) setOrderResult((current) => ({ ...current, payment_session: session }));
      } catch { /* The customer can still use the shown QR/reference if a status check is temporarily unavailable. */ }
    };
    const timer = window.setInterval(refresh, 5000);
    return () => { active = false; window.clearInterval(timer); };
  }, [paymentSessionReference, selectedStore?.slug]);

  const submit = async () => {
    if (!locationId || lines.length === 0) return;
    setBusy(true);
    setMessage('');
    setOrderResult(null);
    const requestLines = lines.map(({ item, quantity }) => ({
      variantId: String(item.id),
      externalLineReference: String(item.externalLineReference || item.id),
      mode: item.pricingMode === 'fixed' ? 'fixed' : 'per_kilo',
      quantity: hasFixed && item.pricingMode === 'per_kilo' ? 1 : quantity,
      ...(hasFixed && item.pricingMode === 'per_kilo' ? { measurementGrams: Math.round(quantity * 1000) } : {})
    }));
    const fulfillment = { mode: fulfillmentMode, addressSnapshot: fulfillmentMode === 'delivery' ? address : '' };
    try {
      if (!hasFixed) {
        const result = await requestJson('/api/v1/store/laundry/orders', {
          method: 'POST', storeSlug: selectedStore?.slug, selectedStore, selectedLocationId: locationId,
          headers: { 'idempotency-key': createStorefrontIdempotencyKey('laundry-order') },
          body: {
            location_id: String(locationId), mode: 'per_kilo', lines: requestLines, fulfillment,
            customer: { displayName: customerName, email: customerEmail, phone: customerPhone }
          }
        });
        setOrderResult(result?.data || result?.payload || result);
        setMessage('Laundry order submitted. Keep your tracking reference to check its status.');
      } else {
        const idempotencyKey = createStorefrontIdempotencyKey('laundry-payment');
        const result = await requestJson('/api/v1/commerce-payments/dglaundry/booking-groups/payment-sessions', {
          method: 'POST', storeSlug: selectedStore?.slug, selectedStore, selectedLocationId: locationId,
          headers: { 'idempotency-key': idempotencyKey },
          body: {
            location_id: String(locationId),
            mode: hasPerKilo ? 'mixed' : 'fixed',
            idempotency_key: idempotencyKey,
            lines: requestLines,
            fulfillment,
            store_slug: selectedStore?.slug,
            customer: { displayName: customerName, email: customerEmail, phone: customerPhone }
          }
        });
        const data = result?.data || result?.payload || result;
        setOrderResult(data);
        if (data?.payment_required) setMessage('Payment session created. Complete payment to submit the fixed-price laundry order.');
        else setMessage('Reservation created. Final weighing and payment happen at the laundry counter.');
      }
    } catch (submitError) {
      if (Number(submitError?.status) === 503) {
        setMessage('Online payment for fixed-price laundry items is not available yet. Your order was not submitted.');
      } else {
        setMessage(submitError?.message || 'We could not submit this laundry order. Please try again.');
      }
    } finally {
      setBusy(false);
    }
  };

  const requestQuote = async () => {
    if (!locationId || lines.length === 0) return;
    setBusy(true);
    setMessage('');
    try {
      const result = await requestJson('/api/v1/store/laundry/quotes', {
        method: 'POST', storeSlug: selectedStore?.slug, selectedStore, selectedLocationId: locationId,
        headers: { 'idempotency-key': createStorefrontIdempotencyKey('laundry-quote') },
        body: {
          location_id: String(locationId),
          mode: hasFixed ? (hasPerKilo ? 'mixed' : 'fixed') : 'per_kilo',
          lines: lines.map(({ item, quantity }) => ({
            variantId: String(item.id),
            externalLineReference: String(item.externalLineReference || item.id),
            mode: item.pricingMode === 'fixed' ? 'fixed' : 'per_kilo',
            quantity
          })),
          fulfillment: { mode: fulfillmentMode, addressSnapshot: fulfillmentMode === 'delivery' ? address : '' }
        }
      });
      setQuote(result?.quote || result);
      setMessage('Quote refreshed. Final per-kilo total is confirmed after weighing.');
    } catch (quoteError) {
      setMessage(quoteError?.message || 'We could not prepare a quote. Please try again.');
    } finally { setBusy(false); }
  };

  const cancelPayment = async () => {
    if (!paymentSessionReference) return;
    setBusy(true);
    try {
      const result = await requestJson(`/api/v1/store/laundry/payment-sessions/${encodeURIComponent(paymentSessionReference)}/cancel`, {
        method: 'POST', storeSlug: selectedStore?.slug
      });
      const data = result?.data || result;
      setOrderResult((current) => ({ ...current, payment_session: data?.payment_session || current?.payment_session }));
      setMessage(data?.cancellation?.outcome === 'cancelled' ? 'Payment cancelled and the laundry reservation was released.' : 'The payment could not be cancelled yet. Check the payment status before retrying.');
    } catch (cancelError) {
      setMessage(cancelError?.message || 'We could not cancel this payment session.');
    } finally { setBusy(false); }
  };

  const refreshOrder = async () => {
    if (!orderResult?.externalOrderReference || !orderResult?.externalTrackingReference) return;
    setBusy(true);
    try {
      const result = await requestJson(`/api/v1/store/laundry/orders/${encodeURIComponent(orderResult.externalOrderReference)}?location_id=${encodeURIComponent(locationId)}&external_tracking_reference=${encodeURIComponent(orderResult.externalTrackingReference)}`, {
        storeSlug: selectedStore?.slug
      });
      setOrderResult((current) => ({ ...current, currentOrder: result?.payload || result }));
      setMessage('Laundry order status refreshed.');
    } catch (statusError) {
      setMessage(statusError?.message || 'We could not refresh this order status.');
    } finally { setBusy(false); }
  };

  const cancelOrder = async () => {
    if (!orderResult?.externalOrderReference || !orderResult?.externalTrackingReference) return;
    setBusy(true);
    try {
      await requestJson(`/api/v1/store/laundry/orders/${encodeURIComponent(orderResult.externalOrderReference)}/cancel`, {
        method: 'POST', storeSlug: selectedStore?.slug,
        headers: { 'idempotency-key': createStorefrontIdempotencyKey('laundry-cancel') },
        body: { location_id: String(locationId), external_tracking_reference: orderResult.externalTrackingReference, reason: 'Customer requested cancellation' }
      });
      setMessage('Cancellation requested. Refresh the order status for the latest update.');
    } catch (cancelError) {
      setMessage(cancelError?.message || 'We could not cancel this laundry order.');
    } finally { setBusy(false); }
  };

  if (loading) return <section className="mx-auto max-w-5xl p-6" aria-live="polite">Loading laundry services…</section>;
  if (error) return <section className="mx-auto max-w-5xl p-6" role="alert">{error}</section>;

  return <section className="mx-auto grid max-w-6xl gap-8 px-4 py-8 md:grid-cols-[minmax(0,1fr)_20rem]" aria-label="Laundry ordering">
    <div>
      <header className="mb-6">
        <p className="text-sm font-semibold uppercase tracking-wide text-teal-700">Laundry</p>
        <h1 className="mt-1 text-3xl font-bold">Wash, fold, and care</h1>
        <p className="mt-2 text-slate-600">Choose a service. Per-kilo orders are confirmed for weighing at drop-off; fixed-price orders require online payment.</p>
      </header>
      {availability?.online === false && <p className="mb-4 rounded-lg bg-amber-50 p-3 text-amber-900">Online ordering is currently unavailable for this branch.</p>}
      {catalog.length === 0 && <p className="rounded-lg border p-5 text-slate-600">No laundry services are listed for this branch yet.</p>}
      <div className="grid gap-3 sm:grid-cols-2">
        {catalog.map((item) => <article key={item.id} className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
          <h2 className="font-semibold">{item.name}</h2>
          {item.description && <p className="mt-1 text-sm text-slate-600">{item.description}</p>}
          <p className="mt-3 text-sm font-medium text-teal-800">{item.pricingMode === 'per_kilo' ? `${money(item.unitAmountCentavos)} / kg` : `${money(item.unitAmountCentavos)} fixed price`}</p>
          <label className="mt-3 flex items-center gap-2 text-sm">
            <span>{item.pricingMode === 'per_kilo' ? 'Estimated kg' : 'Quantity'}</span>
            <input className="w-24 rounded-md border px-2 py-1" type="number" min="0" step={item.pricingMode === 'per_kilo' ? '0.1' : '1'} value={quantities[item.id] || ''} onChange={(event) => setQuantities((previous) => ({ ...previous, [item.id]: event.target.value }))} />
          </label>
        </article>)}
      </div>
    </div>
    <aside className="h-fit rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
      <h2 className="text-lg font-semibold">Your laundry order</h2>
      {lines.length === 0 ? <p className="mt-3 text-sm text-slate-500">Select one or more services to continue.</p> : <ul className="mt-3 space-y-2 text-sm">
        {lines.map(({ item, quantity }) => <li key={item.id} className="flex justify-between gap-3"><span>{item.name} × {quantity}</span><span>{item.pricingMode === 'per_kilo' ? 'weighed later' : money(item.unitAmountCentavos * quantity)}</span></li>)}
      </ul>}
      <label className="mt-5 block text-sm font-medium">Fulfillment
        <select className="mt-1 w-full rounded-md border p-2" value={fulfillmentMode} onChange={(event) => setFulfillmentMode(event.target.value)}>
          <option value="pickup">Drop off / pickup</option><option value="delivery">Delivery</option>
        </select>
      </label>
      {fulfillmentMode === 'delivery' && <label className="mt-3 block text-sm font-medium">Delivery address<textarea className="mt-1 w-full rounded-md border p-2" rows="2" value={address} onChange={(event) => setAddress(event.target.value)} /></label>}
      <button type="button" disabled={busy || lines.length === 0 || availability?.online === false} onClick={submit} className="mt-5 w-full rounded-lg bg-teal-700 px-4 py-3 font-semibold text-white disabled:cursor-not-allowed disabled:opacity-50">
        {busy ? 'Submitting…' : hasFixed ? 'Continue to payment' : 'Submit laundry order'}
      </button>
      <button type="button" disabled={busy || lines.length === 0 || availability?.online === false} onClick={requestQuote} className="mt-2 w-full rounded-lg border border-teal-700 px-4 py-2 font-semibold text-teal-800 disabled:opacity-50">Get estimate</button>
      {message && <p className="mt-3 text-sm" role="status">{message}</p>}
      {quote && <p className="mt-2 text-sm text-slate-600">Estimate prepared. Per-kilo totals may change after the final weight is recorded.</p>}
      {orderResult?.externalOrderReference && <p className="mt-2 break-all text-xs text-slate-600">Order reference: {orderResult.externalOrderReference}</p>}
      {orderResult?.externalTrackingReference && <p className="mt-2 break-all text-xs text-slate-600">Private tracking key: {orderResult.externalTrackingReference}</p>}
      {orderResult?.externalTrackingReference && <div className="mt-3 grid grid-cols-2 gap-2">
        <button type="button" disabled={busy} onClick={refreshOrder} className="rounded-lg border px-3 py-2 text-sm font-medium">Refresh status</button>
        <button type="button" disabled={busy} onClick={cancelOrder} className="rounded-lg border px-3 py-2 text-sm font-medium">Request cancel</button>
      </div>}
      {orderResult?.currentOrder && <p className="mt-2 text-sm text-slate-700">Current status: {orderResult.currentOrder.statusLabel || orderResult.currentOrder.status || 'Processing'}</p>}
      {orderResult?.payment_session && <p className="mt-2 break-all text-xs text-slate-600">Payment reference: {orderResult.payment_session.public_reference}</p>}
      {orderResult?.payment_session?.qr_code_image_url && <img className="mx-auto mt-3 h-48 w-48 rounded border" src={orderResult.payment_session.qr_code_image_url} alt="Payment QR code" />}
      {orderResult?.payment_session?.checkout_url && <a className="mt-3 block text-center font-semibold text-teal-800 underline" href={orderResult.payment_session.checkout_url} target="_blank" rel="noreferrer">Open secure payment page</a>}
      {orderResult?.payment_session?.booking_group?.children?.map((child) => child.externalTrackingReference && <p key={child.externalOrderReference} className="mt-2 break-all text-xs text-slate-600">Laundry order {child.externalOrderReference}; private tracking key: {child.externalTrackingReference}</p>)}
      {['paid', 'finalized'].includes(orderResult?.payment_session?.status) && <p className="mt-3 rounded bg-emerald-50 p-3 text-sm text-emerald-800" role="status">Payment confirmed. The laundry order has been submitted.</p>}
      {paymentSessionReference && !['paid', 'finalized', 'cancelled', 'expired', 'failed'].includes(orderResult?.payment_session?.status) && <button type="button" disabled={busy} onClick={cancelPayment} className="mt-3 w-full rounded-lg border px-4 py-2 text-sm font-semibold">Cancel payment and reservation</button>}
    </aside>
  </section>;
}
