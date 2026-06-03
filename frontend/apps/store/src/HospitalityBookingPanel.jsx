import React, { useEffect, useMemo, useState } from 'react';

const API_BASE = '/api/v1/store/hospitality';
const apiOrigin = (import.meta.env.VITE_API_BASE_URL || import.meta.env.VITE_API_ORIGIN || '').replace(/\/$/, '');
const withApiOrigin = (url) => {
  if (!url || typeof url !== 'string') return url;
  if (!url.startsWith('/')) return url;
  return apiOrigin ? `${apiOrigin}${url}` : url;
};

const todayDate = () => new Date().toISOString().slice(0, 10);

const addDays = (dateText, days) => {
  const date = new Date(`${dateText}T00:00:00`);
  date.setDate(date.getDate() + days);
  return date.toISOString().slice(0, 10);
};

const money = (value, currency = 'PHP') => {
  const amount = Number(value || 0);
  return new Intl.NumberFormat('en-PH', {
    style: 'currency',
    currency,
    maximumFractionDigits: 2
  }).format(Number.isFinite(amount) ? amount : 0);
};

const createIdempotencyKey = () => `hospitality-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;

const readStoreAuthToken = () => {
  if (typeof window === 'undefined') return '';
  return String(window.__SKU_STOREFRONT_AUTH_TOKEN__ || '').trim();
};

const parseList = (payload, key) => {
  if (Array.isArray(payload)) return payload;
  if (Array.isArray(payload?.data)) return payload.data;
  if (Array.isArray(payload?.data?.[key])) return payload.data[key];
  if (Array.isArray(payload?.[key])) return payload[key];
  return [];
};

const requestJson = async (path, {
  method = 'GET',
  body = null,
  selectedStore = null,
  selectedLocationId = null,
  authToken = ''
} = {}) => {
  const headers = {
    Accept: 'application/json'
  };
  if (body) headers['Content-Type'] = 'application/json';
  if (selectedStore?.slug) headers['x-store-slug'] = selectedStore.slug;
  if (selectedStore?.store_slug) headers['x-store-slug'] = selectedStore.store_slug;
  if (selectedStore?.tenant_slug) headers['x-tenant-slug'] = selectedStore.tenant_slug;
  if (selectedStore?.tenant_id) headers['x-tenant-id'] = String(selectedStore.tenant_id);
  if (selectedLocationId) headers['x-location-id'] = String(selectedLocationId);
  if (authToken) headers.Authorization = `Bearer ${authToken}`;
  if (!['GET', 'HEAD', 'OPTIONS'].includes(String(method || 'GET').toUpperCase()) && typeof document !== 'undefined') {
    const csrfToken = decodeURIComponent(String(document.cookie || '')
      .split(';')
      .map((entry) => entry.trim())
      .find((entry) => entry.startsWith('sku_csrf_token='))
      ?.slice('sku_csrf_token='.length) || '');
    if (csrfToken) headers['x-csrf-token'] = csrfToken;
  }

  const response = await fetch(withApiOrigin(`${API_BASE}${path}`), {
    method,
    credentials: 'include',
    headers,
    body: body ? JSON.stringify(body) : null
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok || payload?.success === false) {
    const message = payload?.message || payload?.error || `Request failed with HTTP ${response.status}`;
    throw new Error(message);
  }
  return payload?.data ?? payload;
};

const Field = ({ label, children }) => (
  <label style={{ display: 'grid', gap: 6, fontSize: 12, fontWeight: 800, color: '#475569' }}>
    {label}
    {children}
  </label>
);

const inputStyle = {
  width: '100%',
  minHeight: 42,
  border: '1px solid #cbd5e1',
  borderRadius: 8,
  padding: '9px 11px',
  fontSize: 14,
  color: '#0f172a',
  background: '#ffffff',
  boxSizing: 'border-box'
};

const buttonStyle = {
  minHeight: 42,
  border: 'none',
  borderRadius: 8,
  padding: '10px 14px',
  background: '#0f766e',
  color: '#ffffff',
  fontWeight: 850,
  cursor: 'pointer'
};

const ghostButtonStyle = {
  ...buttonStyle,
  background: '#f8fafc',
  color: '#0f172a',
  border: '1px solid #cbd5e1'
};

export default function HospitalityBookingPanel({
  selectedStore,
  selectedLocationId,
  isMobileViewport = false
}) {
  const [checkInDate, setCheckInDate] = useState(todayDate);
  const [checkOutDate, setCheckOutDate] = useState(() => addDays(todayDate(), 1));
  const [adults, setAdults] = useState(2);
  const [children, setChildren] = useState(0);
  const [roomTypes, setRoomTypes] = useState([]);
  const [amenities, setAmenities] = useState([]);
  const [packages, setPackages] = useState([]);
  const [selectedRoomTypeId, setSelectedRoomTypeId] = useState('');
  const [selectedAmenityIds, setSelectedAmenityIds] = useState([]);
  const [selectedPackageIds, setSelectedPackageIds] = useState([]);
  const [quote, setQuote] = useState(null);
  const [hold, setHold] = useState(null);
  const [confirmation, setConfirmation] = useState(null);
  const [acceptedPolicies, setAcceptedPolicies] = useState(false);
  const [bookingAttemptKey, setBookingAttemptKey] = useState('');
  const [lookupReference, setLookupReference] = useState('');
  const [lookupResult, setLookupResult] = useState(null);
  const [customerBookings, setCustomerBookings] = useState([]);
  const [customer, setCustomer] = useState({
    customer_name: '',
    customer_email: '',
    customer_phone: '',
    special_requests: ''
  });
  const [loading, setLoading] = useState('');
  const [error, setError] = useState('');

  const selectedRoomType = useMemo(() => (
    roomTypes.find((entry) => String(entry.room_type_id) === String(selectedRoomTypeId)) || null
  ), [roomTypes, selectedRoomTypeId]);

  const selectedAddOns = useMemo(() => amenities
    .filter((entry) => selectedAmenityIds.includes(String(entry.amenity_id)))
    .map((entry) => ({
      amenity_id: entry.amenity_id,
      name: entry.name,
      price: Number(entry.price || entry.price_delta || 0),
      quantity: 1
    })), [amenities, selectedAmenityIds]);

  const selectedPackages = useMemo(() => packages
    .filter((entry) => selectedPackageIds.includes(String(entry.package_id)))
    .map((entry) => ({
      package_id: entry.package_id,
      name: entry.name,
      price_delta: Number(entry.price_delta || entry.price || 0),
      quantity: 1
    })), [packages, selectedPackageIds]);

  const basePayload = () => ({
    room_type_id: selectedRoomTypeId,
    check_in_date: checkInDate,
    check_out_date: checkOutDate,
    adults: Number(adults || 1),
    children: Number(children || 0),
    room_count: 1,
    add_ons: selectedAddOns,
    packages: selectedPackages
  });

  const searchAvailability = async () => {
    setLoading('search');
    setError('');
      setQuote(null);
      setHold(null);
      setConfirmation(null);
      setAcceptedPolicies(false);
      setBookingAttemptKey('');
    try {
      const params = new URLSearchParams({
        check_in_date: checkInDate,
        check_out_date: checkOutDate,
        adults: String(adults || 1),
        children: String(children || 0)
      });
      const [availability, amenityPayload, packagePayload] = await Promise.all([
        requestJson(`/availability?${params.toString()}`, { selectedStore, selectedLocationId }),
        requestJson('/amenities?activeOnly=true', { selectedStore, selectedLocationId }),
        requestJson('/packages?activeOnly=true', { selectedStore, selectedLocationId })
      ]);
      const nextRoomTypes = parseList(availability, 'room_types');
      setRoomTypes(nextRoomTypes);
      setAmenities(parseList(amenityPayload, 'amenities'));
      setPackages(parseList(packagePayload, 'packages'));
      setSelectedRoomTypeId((current) => (
        nextRoomTypes.some((entry) => String(entry.room_type_id) === String(current))
          ? current
          : String(nextRoomTypes[0]?.room_type_id || '')
      ));
    } catch (err) {
      setError(err.message || 'Unable to search room availability.');
    } finally {
      setLoading('');
    }
  };

  useEffect(() => {
    if (selectedStore) searchAvailability();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedStore?.tenant_id, selectedStore?.slug, selectedLocationId]);

  const buildQuote = async () => {
    if (!selectedRoomTypeId) {
      setError('Choose a room type before requesting a quote.');
      return null;
    }
    setLoading('quote');
    setError('');
    try {
      const data = await requestJson('/quote', {
        method: 'POST',
        body: basePayload(),
        selectedStore,
        selectedLocationId
      });
      setQuote(data);
      return data;
    } catch (err) {
      setError(err.message || 'Unable to build booking quote.');
      return null;
    } finally {
      setLoading('');
    }
  };

  const reserveHold = async () => {
    if (!selectedRoomTypeId) {
      setError('Choose a room type before creating a booking hold.');
      return null;
    }
    setLoading('hold');
    setError('');
    try {
      const data = await requestJson('/booking-holds', {
        method: 'POST',
        body: basePayload(),
        selectedStore,
        selectedLocationId
      });
      setHold(data);
      setQuote(data.quote || quote);
      return data;
    } catch (err) {
      setError(err.message || 'Unable to reserve this room.');
      return null;
    } finally {
      setLoading('');
    }
  };

  const confirmBooking = async () => {
    const trimmedName = customer.customer_name.trim();
    if (!trimmedName) {
      setError('Guest name is required to confirm the booking.');
      return;
    }
    if (!acceptedPolicies) {
      setError('Review and accept the booking policies before confirming.');
      return;
    }
    const activeQuote = quote || await buildQuote();
    if (!activeQuote) return;
    const activeHold = hold || await reserveHold();
    if (!activeHold) return;
    const attemptKey = bookingAttemptKey || createIdempotencyKey();
    setBookingAttemptKey(attemptKey);
    setLoading('confirm');
    setError('');
    try {
      const data = await requestJson('/bookings', {
        method: 'POST',
        body: {
          ...basePayload(),
          ...customer,
          customer_name: trimmedName,
          nightly_rate: selectedRoomType?.starting_rate || selectedRoomType?.default_rate || activeQuote?.pricing?.room_subtotal,
          total_amount: activeQuote?.pricing?.total,
          deposit_amount: activeQuote?.pricing?.deposit_due || 0,
          payment_status: 'unpaid',
          hold_token: activeHold.hold_token,
          idempotency_key: attemptKey,
          add_ons_snapshot: { add_ons: selectedAddOns, packages: selectedPackages },
          policies_snapshot: {
            source: 'direct_booking',
            hold_expires_at: activeHold.expires_at || null
          }
        },
        selectedStore,
        selectedLocationId,
        authToken: readStoreAuthToken()
      });
      setConfirmation(data);
      setLookupReference(data?.public_reference || '');
      setBookingAttemptKey('');
    } catch (err) {
      setError(err.message || 'Unable to confirm this booking.');
    } finally {
      setLoading('');
    }
  };

  const lookupBooking = async () => {
    const reference = lookupReference.trim();
    if (!reference) return;
    setLoading('lookup');
    setError('');
    try {
      const data = await requestJson(`/bookings/${encodeURIComponent(reference)}`, {
        selectedStore,
        selectedLocationId
      });
      setLookupResult(data);
    } catch (err) {
      setError(err.message || 'Unable to find this booking.');
    } finally {
      setLoading('');
    }
  };

  const loadCustomerBookings = async () => {
    const authToken = readStoreAuthToken();
    if (!authToken) {
      setError('Sign in to view saved stay history.');
      return;
    }
    setLoading('history');
    setError('');
    try {
      const data = await requestJson('/bookings', {
        selectedStore,
        selectedLocationId,
        authToken
      });
      setCustomerBookings(parseList(data, 'reservations'));
    } catch (err) {
      setError(err.message || 'Unable to load stay history.');
    } finally {
      setLoading('');
    }
  };

  const claimLookupBooking = async () => {
    const authToken = readStoreAuthToken();
    const reference = (lookupResult?.public_reference || lookupReference).trim();
    if (!authToken || !reference) {
      setError('Sign in and enter a booking reference before claiming a stay.');
      return;
    }
    setLoading('claim');
    setError('');
    try {
      const data = await requestJson(`/bookings/${encodeURIComponent(reference)}/claim`, {
        method: 'POST',
        selectedStore,
        selectedLocationId,
        authToken
      });
      setLookupResult(data);
      await loadCustomerBookings();
    } catch (err) {
      setError(err.message || 'Unable to claim this booking.');
    } finally {
      setLoading('');
    }
  };

  const toggleSelection = (value, setter) => {
    setter((current) => (
      current.includes(String(value))
        ? current.filter((entry) => entry !== String(value))
        : [...current, String(value)]
    ));
  };

  const currency = quote?.pricing?.currency || selectedRoomType?.currency || 'PHP';
  const depositDue = Number(quote?.pricing?.deposit_due || 0);
  const paymentDueText = quote?.pricing?.payment_due_at === 'property' ? 'Due at property' : 'Due online';

  return (
    <section style={{
      display: 'grid',
      gap: 18,
      margin: isMobileViewport ? '12px 0 0' : '18px auto 0',
      padding: isMobileViewport ? '16px' : '24px',
      maxWidth: 1320,
      background: '#ffffff',
      border: '1px solid #dbe5ee',
      borderRadius: 8,
      boxShadow: '0 18px 48px rgba(15,23,42,0.08)'
    }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 14, flexWrap: 'wrap', alignItems: 'flex-end' }}>
        <div style={{ display: 'grid', gap: 6 }}>
          <div style={{ fontSize: 12, fontWeight: 900, textTransform: 'uppercase', color: '#0f766e' }}>Direct Booking</div>
          <h1 style={{ margin: 0, fontSize: isMobileViewport ? 26 : 34, color: '#0f172a' }}>Room Availability</h1>
          <p style={{ margin: 0, color: '#64748b', fontSize: 14, maxWidth: 760 }}>
            Search dates, choose a room type, add paid add-ons or packages, then confirm a PMS-backed reservation.
          </p>
        </div>
        {selectedStore?.tenant_name ? (
          <div style={{ textAlign: isMobileViewport ? 'left' : 'right', color: '#334155', fontWeight: 800 }}>
            {selectedStore.tenant_name}
          </div>
        ) : null}
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: isMobileViewport ? '1fr' : 'repeat(5, minmax(0, 1fr))', gap: 10 }}>
        <Field label="Check-in">
          <input type="date" value={checkInDate} min={todayDate()} onChange={(event) => setCheckInDate(event.target.value)} style={inputStyle} />
        </Field>
        <Field label="Check-out">
          <input type="date" value={checkOutDate} min={addDays(checkInDate, 1)} onChange={(event) => setCheckOutDate(event.target.value)} style={inputStyle} />
        </Field>
        <Field label="Adults">
          <input type="number" min="1" value={adults} onChange={(event) => setAdults(event.target.value)} style={inputStyle} />
        </Field>
        <Field label="Children">
          <input type="number" min="0" value={children} onChange={(event) => setChildren(event.target.value)} style={inputStyle} />
        </Field>
        <button type="button" onClick={searchAvailability} disabled={loading === 'search'} style={{ ...buttonStyle, alignSelf: 'end', opacity: loading === 'search' ? 0.65 : 1 }}>
          {loading === 'search' ? 'Searching...' : 'Search'}
        </button>
      </div>

      {error ? (
        <div role="alert" style={{ border: '1px solid #fecaca', background: '#fef2f2', color: '#991b1b', borderRadius: 8, padding: 12, fontSize: 13, fontWeight: 700 }}>
          {error}
        </div>
      ) : null}

      <div style={{ display: 'grid', gridTemplateColumns: isMobileViewport ? '1fr' : 'minmax(0, 1.4fr) minmax(320px, 0.8fr)', gap: 16, alignItems: 'start' }}>
        <div style={{ display: 'grid', gap: 12 }}>
          {roomTypes.length === 0 ? (
            <div style={{ border: '1px dashed #cbd5e1', borderRadius: 8, padding: 18, color: '#64748b', fontWeight: 700 }}>
              No available room types for the selected dates yet.
            </div>
          ) : roomTypes.map((roomType) => {
            const active = String(roomType.room_type_id) === String(selectedRoomTypeId);
            return (
              <button
                key={roomType.room_type_id}
                type="button"
                onClick={() => setSelectedRoomTypeId(String(roomType.room_type_id))}
                style={{
                  textAlign: 'left',
                  border: active ? '2px solid #0f766e' : '1px solid #dbe5ee',
                  borderRadius: 8,
                  padding: 16,
                  background: active ? '#ecfeff' : '#ffffff',
                  cursor: 'pointer',
                  display: 'grid',
                  gap: 10
                }}
              >
                <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
                  <div>
                    <div style={{ fontSize: 18, fontWeight: 900, color: '#0f172a' }}>{roomType.name}</div>
                    <div style={{ fontSize: 13, color: '#64748b' }}>{roomType.description || `${roomType.available_rooms || 0} room(s) available`}</div>
                  </div>
                  <div style={{ fontSize: 18, fontWeight: 900, color: '#0f766e' }}>{money(roomType.starting_rate, roomType.currency)}</div>
                </div>
                <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', fontSize: 12, color: '#334155', fontWeight: 800 }}>
                  <span>Up to {roomType.max_occupancy || adults} guests</span>
                  <span>{roomType.available_rooms || 0} available</span>
                  {(roomType.amenities || []).slice(0, 4).map((amenity) => (
                    <span key={`${roomType.room_type_id}-${amenity}`}>{String(amenity)}</span>
                  ))}
                </div>
              </button>
            );
          })}
        </div>

        <aside style={{ display: 'grid', gap: 14 }}>
          <div style={{ border: '1px solid #dbe5ee', borderRadius: 8, padding: 14, display: 'grid', gap: 12 }}>
            <div style={{ fontSize: 16, fontWeight: 900, color: '#0f172a' }}>Paid add-ons</div>
            {[...amenities, ...packages].length === 0 ? (
              <div style={{ color: '#64748b', fontSize: 13 }}>No add-ons or packages are published yet.</div>
            ) : null}
            {amenities.map((amenity) => (
              <label key={amenity.amenity_id} style={{ display: 'flex', gap: 10, alignItems: 'center', fontSize: 13, color: '#334155', fontWeight: 700 }}>
                <input
                  type="checkbox"
                  checked={selectedAmenityIds.includes(String(amenity.amenity_id))}
                  onChange={() => toggleSelection(amenity.amenity_id, setSelectedAmenityIds)}
                />
                <span style={{ flex: 1 }}>{amenity.name}</span>
                <span>{money(amenity.price || amenity.price_delta || 0, currency)}</span>
              </label>
            ))}
            {packages.map((bundle) => (
              <label key={bundle.package_id} style={{ display: 'flex', gap: 10, alignItems: 'center', fontSize: 13, color: '#334155', fontWeight: 700 }}>
                <input
                  type="checkbox"
                  checked={selectedPackageIds.includes(String(bundle.package_id))}
                  onChange={() => toggleSelection(bundle.package_id, setSelectedPackageIds)}
                />
                <span style={{ flex: 1 }}>{bundle.name}</span>
                <span>{money(bundle.price_delta || bundle.price || 0, currency)}</span>
              </label>
            ))}
          </div>

          <div style={{ border: '1px solid #dbe5ee', borderRadius: 8, padding: 14, display: 'grid', gap: 10 }}>
            <div style={{ fontSize: 16, fontWeight: 900, color: '#0f172a' }}>Guest details</div>
            <input placeholder="Guest name" value={customer.customer_name} onChange={(event) => setCustomer({ ...customer, customer_name: event.target.value })} style={inputStyle} />
            <input placeholder="Email" value={customer.customer_email} onChange={(event) => setCustomer({ ...customer, customer_email: event.target.value })} style={inputStyle} />
            <input placeholder="Phone" value={customer.customer_phone} onChange={(event) => setCustomer({ ...customer, customer_phone: event.target.value })} style={inputStyle} />
            <textarea placeholder="Special requests" value={customer.special_requests} onChange={(event) => setCustomer({ ...customer, special_requests: event.target.value })} rows={3} style={{ ...inputStyle, resize: 'vertical' }} />
          </div>

          <div style={{ border: '1px solid #dbe5ee', borderRadius: 8, padding: 14, display: 'grid', gap: 10, background: '#f8fafc' }}>
            <div style={{ fontSize: 16, fontWeight: 900, color: '#0f172a' }}>Quote</div>
            {quote ? (
              <div style={{ display: 'grid', gap: 6, fontSize: 13, color: '#334155' }}>
                {(quote.lines || []).map((line, index) => (
                  <div key={`${line.description}-${index}`} style={{ display: 'flex', justifyContent: 'space-between', gap: 10 }}>
                    <span>{line.description}</span>
                    <strong>{money(line.amount, currency)}</strong>
                  </div>
                ))}
                <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10, borderTop: '1px solid #cbd5e1', paddingTop: 8, fontSize: 18, color: '#0f172a' }}>
                  <strong>Total</strong>
                  <strong>{money(quote.pricing?.total, currency)}</strong>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10, color: '#475569' }}>
                  <span>Deposit</span>
                  <strong>{depositDue > 0 ? money(depositDue, currency) : paymentDueText}</strong>
                </div>
              </div>
            ) : (
              <div style={{ color: '#64748b', fontSize: 13 }}>Build a quote before confirming the booking.</div>
            )}
            {hold?.hold_token ? (
              <div style={{ fontSize: 12, color: '#0f766e', fontWeight: 800 }}>
                Hold reserved until {new Date(hold.expires_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
              </div>
            ) : null}
            <div style={{ border: '1px solid #cbd5e1', borderRadius: 8, padding: 10, background: '#ffffff', display: 'grid', gap: 8 }}>
              <div style={{ fontSize: 13, fontWeight: 900, color: '#0f172a' }}>Policies</div>
              <div style={{ fontSize: 12, lineHeight: 1.5, color: '#475569' }}>
                Check-in and check-out dates, selected add-ons, package pricing, and total stay amount are saved with the booking. Deposit and payment collection are completed by the property; online card capture is not enabled for this booking engine yet.
              </div>
              <label style={{ display: 'flex', alignItems: 'flex-start', gap: 8, fontSize: 12, fontWeight: 800, color: '#334155' }}>
                <input type="checkbox" checked={acceptedPolicies} onChange={(event) => setAcceptedPolicies(event.target.checked)} />
                <span>I reviewed the stay details and booking policies.</span>
              </label>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
              <button type="button" onClick={buildQuote} disabled={loading === 'quote'} style={ghostButtonStyle}>
                {loading === 'quote' ? 'Quoting...' : 'Quote'}
              </button>
              <button type="button" onClick={reserveHold} disabled={loading === 'hold'} style={ghostButtonStyle}>
                {loading === 'hold' ? 'Holding...' : 'Hold'}
              </button>
            </div>
            <button type="button" onClick={confirmBooking} disabled={loading === 'confirm'} style={{ ...buttonStyle, opacity: loading === 'confirm' ? 0.65 : 1 }}>
              {loading === 'confirm' ? 'Confirming...' : 'Confirm Booking'}
            </button>
          </div>
        </aside>
      </div>

      {confirmation?.public_reference ? (
        <div style={{ border: '1px solid #bbf7d0', background: '#f0fdf4', borderRadius: 8, padding: 14, display: 'grid', gap: 6 }}>
          <strong style={{ color: '#166534' }}>Booking confirmed</strong>
          <span style={{ color: '#334155' }}>Reference: {confirmation.public_reference}</span>
        </div>
      ) : null}

      <div style={{ borderTop: '1px solid #e2e8f0', paddingTop: 14, display: 'grid', gridTemplateColumns: isMobileViewport ? '1fr' : 'minmax(0, 1fr) auto', gap: 10, alignItems: 'end' }}>
        <Field label="Booking lookup">
          <input placeholder="Enter booking reference" value={lookupReference} onChange={(event) => setLookupReference(event.target.value)} style={inputStyle} />
        </Field>
        <button type="button" onClick={lookupBooking} disabled={loading === 'lookup'} style={ghostButtonStyle}>
          {loading === 'lookup' ? 'Checking...' : 'Check Booking'}
        </button>
        {lookupResult?.public_reference ? (
          <div style={{ gridColumn: '1 / -1', color: '#334155', fontSize: 13, fontWeight: 700 }}>
            {lookupResult.public_reference}: {lookupResult.status} from {lookupResult.check_in_date} to {lookupResult.check_out_date}
            {readStoreAuthToken() ? (
              <button type="button" onClick={claimLookupBooking} disabled={loading === 'claim'} style={{ ...ghostButtonStyle, marginLeft: 10, minHeight: 32, padding: '6px 10px' }}>
                {loading === 'claim' ? 'Claiming...' : 'Save to My Stays'}
              </button>
            ) : null}
          </div>
        ) : null}
      </div>

      <div style={{ borderTop: '1px solid #e2e8f0', paddingTop: 14, display: 'grid', gap: 10 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
          <strong style={{ color: '#0f172a' }}>My Stays</strong>
          <button type="button" onClick={loadCustomerBookings} disabled={loading === 'history'} style={ghostButtonStyle}>
            {loading === 'history' ? 'Loading...' : 'Load Stay History'}
          </button>
        </div>
        {customerBookings.length > 0 ? (
          <div style={{ display: 'grid', gap: 8 }}>
            {customerBookings.map((booking) => (
              <div key={booking.public_reference} style={{ border: '1px solid #dbe5ee', borderRadius: 8, padding: 10, display: 'flex', justifyContent: 'space-between', gap: 10, flexWrap: 'wrap', color: '#334155', fontSize: 13, fontWeight: 700 }}>
                <span>{booking.public_reference}: {booking.status}</span>
                <span>{booking.check_in_date} to {booking.check_out_date}</span>
                <span>{money(booking.total_amount, currency)}</span>
              </div>
            ))}
          </div>
        ) : (
          <div style={{ color: '#64748b', fontSize: 13 }}>Signed-in customers can load saved stay history or claim a booking by reference.</div>
        )}
      </div>
    </section>
  );
}
