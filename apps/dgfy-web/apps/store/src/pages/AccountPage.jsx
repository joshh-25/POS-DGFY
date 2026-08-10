import React from 'react';
import { useParams, useNavigate } from 'react-router-dom';

export function AccountPage({ accountData = {}, loading = false }) {
  const { slug } = useParams();
  const navigate = useNavigate();

  const handleBack = () => {
    navigate(`/tenant-store/${slug}`);
  };

  if (loading) {
    return (
      <div style={{ padding: 20, textAlign: 'center' }}>
        <p>Loading account...</p>
      </div>
    );
  }

  const { me = {}, orders = [], bookings = [] } = accountData;

  return (
    <div style={{ padding: 16 }}>
      <div style={{ marginBottom: 16, display: 'flex', alignItems: 'center', gap: 12 }}>
        <button
          type="button"
          onClick={handleBack}
          style={{
            borderRadius: 8,
            border: '1px solid #334155',
            background: '#fff',
            padding: '8px 12px',
            fontWeight: 600,
            cursor: 'pointer'
          }}
        >
          ← Back
        </button>
        <h2 style={{ margin: 0, fontSize: 20 }}>My Account</h2>
      </div>

      <div style={{ display: 'grid', gap: 16 }}>
        {me?.name && (
          <div style={{
            border: '1px solid #e2e8f0',
            borderRadius: 12,
            padding: 16,
            background: '#fff'
          }}>
            <h3 style={{ margin: '0 0 8px 0', fontSize: 16 }}>Profile</h3>
            <p style={{ margin: 0, color: '#334155' }}>{me.name}</p>
            {me.email && <p style={{ margin: '4px 0 0 0', color: '#64748b', fontSize: 14 }}>{me.email}</p>}
            {me.phone && <p style={{ margin: '4px 0 0 0', color: '#64748b', fontSize: 14 }}>{me.phone}</p>}
          </div>
        )}

        <div style={{
          border: '1px solid #e2e8f0',
          borderRadius: 12,
          padding: 16,
          background: '#fff'
        }}>
          <h3 style={{ margin: '0 0 12px 0', fontSize: 16 }}>My Orders</h3>
          {orders.length === 0 ? (
            <p style={{ color: '#64748b', fontSize: 14 }}>No orders yet</p>
          ) : (
            <div style={{ display: 'grid', gap: 8 }}>
              {orders.slice(0, 5).map((order, index) => (
                <div key={order.pos_transaction_id || order.tracking_pin || index} style={{ borderTop: index > 0 ? '1px solid #e2e8f0' : 'none', paddingTop: index > 0 ? 8 : 0 }}>
                  <div style={{ fontSize: 13, fontWeight: 600 }}>{order.tracking_pin || 'Order'}</div>
                  <div style={{ fontSize: 12, color: '#64748b' }}>{order.status_label || order.status}</div>
                </div>
              ))}
            </div>
          )}
        </div>

        {bookings.length > 0 && (
          <div style={{
            border: '1px solid #e2e8f0',
            borderRadius: 12,
            padding: 16,
            background: '#fff'
          }}>
            <h3 style={{ margin: '0 0 12px 0', fontSize: 16 }}>My Bookings</h3>
            <div style={{ display: 'grid', gap: 8 }}>
              {bookings.map((booking, index) => (
                <div key={index} style={{ borderTop: index > 0 ? '1px solid #e2e8f0' : 'none', paddingTop: index > 0 ? 8 : 0 }}>
                  <div style={{ fontSize: 13, fontWeight: 600 }}>{booking.service_name || 'Service'}</div>
                  <div style={{ fontSize: 12, color: '#64748b' }}>{booking.status || 'Pending'}</div>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}