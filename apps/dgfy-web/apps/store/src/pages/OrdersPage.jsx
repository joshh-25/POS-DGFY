import React from 'react';
import { useParams, useNavigate } from 'react-router-dom';

export function OrdersPage({ orders = [], loading = false }) {
  const { slug } = useParams();
  const navigate = useNavigate();

  const handleBack = () => {
    navigate(`/tenant-store/${slug}`);
  };

  if (loading) {
    return (
      <div style={{ padding: 20, textAlign: 'center' }}>
        <p>Loading orders...</p>
      </div>
    );
  }

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
        <h2 style={{ margin: 0, fontSize: 20 }}>My Orders</h2>
      </div>

      {orders.length === 0 ? (
        <div style={{ textAlign: 'center', padding: 40, color: '#64748b' }}>
          <p style={{ fontSize: 16 }}>No orders yet</p>
          <p style={{ fontSize: 14 }}>Your order history will appear here</p>
        </div>
      ) : (
        <div style={{ display: 'grid', gap: 12 }}>
          {orders.map((order, index) => (
            <div
              key={order.pos_transaction_id || order.tracking_pin || index}
              style={{
                border: '1px solid #e2e8f0',
                borderRadius: 12,
                padding: 16,
                background: '#fff'
              }}
            >
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 8 }}>
                <strong style={{ fontSize: 14 }}>{order.tracking_pin || order.receipt_number || 'Order'}</strong>
                <span style={{
                  fontSize: 12,
                  padding: '4px 8px',
                  borderRadius: 4,
                  background: order.status === 'completed' ? '#dcfce7' : '#fef3c7',
                  color: order.status === 'completed' ? '#166534' : '#92400e'
                }}>
                  {order.status_label || order.status || 'Processing'}
                </span>
              </div>
              <div style={{ fontSize: 13, color: '#475569' }}>
                {order.total_amount ? `₱${Number(order.total_amount).toFixed(2)}` : '—'}
              </div>
              <div style={{ fontSize: 12, color: '#64748b', marginTop: 4 }}>
                {order.created_at || 'Recent'}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}