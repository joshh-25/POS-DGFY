import React from 'react';
import { StorefrontOrderInstructions } from '../../shared/components/storefront/StorefrontOrderInstructions.jsx';

export function TrackingDrawerTotals({ subtotal, discount, discountLabel = 'Promo / Discount', deliveryFee, serviceFee, totalAmount, specialInstructions = '' }) {
  if (!(subtotal || discount || deliveryFee || serviceFee || specialInstructions)) return null;

  return (
    <div style={{ marginTop: 12, padding: '12px 14px', borderRadius: 12, background: '#f8fafc', border: '1px solid #e2e8f0', display: 'grid', gap: 8 }}>
      {subtotal && <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, color: '#64748b', fontWeight: 600 }}><span>Subtotal</span><span style={{ fontWeight: 700, color: '#334155' }}>{subtotal}</span></div>}
      {discount && <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, color: '#15803d', fontWeight: 700 }}><span>{discountLabel || 'Promo / Discount'}</span><span style={{ fontWeight: 800 }}>{discount}</span></div>}
      {deliveryFee && <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, color: '#64748b', fontWeight: 600 }}><span>Delivery Fee</span><span style={{ fontWeight: 700, color: '#334155' }}>{deliveryFee}</span></div>}
      {serviceFee && <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, color: '#64748b', fontWeight: 600 }}><span>Service Fee</span><span style={{ fontWeight: 700, color: '#334155' }}>{serviceFee}</span></div>}
      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 14, fontWeight: 900, color: '#0f172a', paddingTop: 8, borderTop: '1px solid #e2e8f0' }}><span>Total</span><span>{totalAmount}</span></div>
      <StorefrontOrderInstructions value={specialInstructions} accentColor="#1a4e8d" compact />
    </div>
  );
}
