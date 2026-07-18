import React from 'react';

export default function FnbReservationPanel({
  form,
  setForm,
  loading,
  selectedStore,
  error,
  result,
  isDesktopCheckout,
  onSubmit
}) {
  const updateField = (field, value) => setForm((prev) => ({ ...prev, [field]: value }));
  const inputStyle = { width: '100%', marginTop: 6, border: '1px solid #cbd5e1', borderRadius: 12, padding: '11px 12px' };

  return (
    <div style={{ maxWidth: 680, border: '1px solid #d9e4e8', borderRadius: 18, padding: 16, background: '#fff', boxShadow: '0 8px 24px rgba(15,23,42,.04)' }}>
      <h3 style={{ marginTop: 0, marginBottom: 4, fontSize: 22 }}>Reservation Request</h3>
      <div style={{ display: 'grid', gridTemplateColumns: isDesktopCheckout ? '1fr 1fr' : '1fr', gap: 10, marginTop: 12 }}>
        <label style={{ display: 'block', fontSize: 12, color: '#475569' }}>
          Name
          <input value={form.customer_name} onChange={(e) => updateField('customer_name', e.target.value)} style={inputStyle} />
        </label>
        <label style={{ display: 'block', fontSize: 12, color: '#475569' }}>
          Phone
          <input value={form.customer_phone} onChange={(e) => updateField('customer_phone', e.target.value)} style={inputStyle} />
        </label>
        <label style={{ display: 'block', fontSize: 12, color: '#475569' }}>
          Email
          <input value={form.customer_email} onChange={(e) => updateField('customer_email', e.target.value)} style={inputStyle} />
        </label>
        <label style={{ display: 'block', fontSize: 12, color: '#475569' }}>
          Party Size
          <input type="number" min="1" value={form.party_size} onChange={(e) => updateField('party_size', e.target.value)} style={inputStyle} />
        </label>
        <label style={{ display: 'block', fontSize: 12, color: '#475569' }}>
          When
          <input type="datetime-local" value={form.requested_at} onChange={(e) => updateField('requested_at', e.target.value)} style={inputStyle} />
        </label>
        <label style={{ display: 'block', fontSize: 12, color: '#475569' }}>
          Notes
          <input value={form.notes} onChange={(e) => updateField('notes', e.target.value)} style={inputStyle} />
        </label>
      </div>
      <button type="button" onClick={onSubmit} disabled={loading || !selectedStore} style={{ marginTop: 14, borderRadius: 12, border: '1px solid #0f766e', background: '#0f766e', color: '#fff', padding: '11px 16px', fontWeight: 800 }}>
        {loading ? 'Sending...' : 'Send Request'}
      </button>
      {error && <p style={{ color: '#b91c1c', marginTop: 10 }}>{error}</p>}
      {result?.public_reference && (
        <div style={{ marginTop: 10, border: '1px solid #99f6e4', background: '#ecfeff', borderRadius: 12, padding: '10px 12px', color: '#0f766e', fontSize: 13 }}>
          Request reference: <strong>{result.public_reference}</strong>
        </div>
      )}
    </div>
  );
}
