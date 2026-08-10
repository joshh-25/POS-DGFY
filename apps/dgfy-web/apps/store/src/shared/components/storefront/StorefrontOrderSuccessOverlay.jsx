import React from 'react';
import { Check, Clock3 } from 'lucide-react';

export function StorefrontOrderSuccessOverlay({ visible = false }) {
  if (!visible) return null;

  return (
    <div style={{ position: 'fixed', inset: 0, zIndex: 2600, background: 'rgba(15,23,42,0.42)', backdropFilter: 'blur(8px)', display: 'grid', placeItems: 'center', pointerEvents: 'none', padding: 20 }}>
      <div style={{ width: 'min(420px, calc(100vw - 32px))', borderRadius: 28, background: '#ffffff', border: '1px solid #dbe5ee', boxShadow: '0 30px 80px rgba(15,23,42,0.24)', padding: '30px 28px 26px', display: 'grid', justifyItems: 'center', gap: 18, textAlign: 'center' }}>
        <div style={{ position: 'relative', width: 118, height: 118, display: 'grid', placeItems: 'center' }}>
          <div style={{ position: 'absolute', inset: 0, borderRadius: '50%', background: 'rgba(34,197,94,0.12)', animation: 'dgfySuccessPulse 1.25s ease-out infinite' }} />
          <div style={{ position: 'absolute', inset: 12, borderRadius: '50%', background: 'rgba(34,197,94,0.16)', animation: 'dgfySuccessPulse 1.25s ease-out infinite 0.12s' }} />
          <div style={{ position: 'relative', width: 72, height: 72, borderRadius: '50%', background: 'linear-gradient(135deg,#22c55e 0%,#16a34a 100%)', color: '#fff', display: 'grid', placeItems: 'center', boxShadow: '0 0 0 10px rgba(34,197,94,0.18), 0 18px 40px rgba(34,197,94,0.28)', animation: 'dgfySuccessPop 320ms ease-out' }}>
            <Check size={34} strokeWidth={3.4} />
          </div>
        </div>
        <div style={{ display: 'grid', gap: 8 }}>
          <div style={{ fontSize: 24, fontWeight: 900, color: '#0f172a', letterSpacing: '-0.02em' }}>
            Order Submitted successfully.
          </div>
          <div style={{ fontSize: 14, lineHeight: 1.6, color: '#64748b', maxWidth: 300 }}>
            Your order has been sent to the store team. We will open tracking as soon as the next update is ready.
          </div>
        </div>
        <div style={{ display: 'inline-flex', alignItems: 'center', gap: 8, minHeight: 40, padding: '0 14px', borderRadius: 14, background: '#eff6ff', border: '1px solid #dbeafe', color: '#1d4ed8', fontSize: 13, fontWeight: 800 }}>
          <Clock3 size={14} />
          Redirecting to tracking...
        </div>
      </div>
      <style>{`
        @keyframes dgfySuccessPulse {
          0% { transform: scale(0.92); opacity: 0.9; }
          70% { transform: scale(1.08); opacity: 0; }
          100% { transform: scale(1.12); opacity: 0; }
        }
        @keyframes dgfySuccessPop {
          0% { transform: scale(0.82); opacity: 0; }
          100% { transform: scale(1); opacity: 1; }
        }
      `}</style>
    </div>
  );
}
