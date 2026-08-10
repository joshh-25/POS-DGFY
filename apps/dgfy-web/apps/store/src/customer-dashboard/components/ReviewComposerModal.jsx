import React from 'react';
import { Star, X } from 'lucide-react';

export function ReviewComposerModal({ composer, setComposer, submitting, error, onClose, onSubmit, theme }) {
  if (!composer.activity) return null;
  return (
    <div style={{ position: 'fixed', inset: 0, zIndex: 2590, background: 'rgba(15, 23, 42, 0.5)', display: 'grid', placeItems: 'center', padding: 20 }}>
      <div role="dialog" aria-modal="true" aria-labelledby="dgfy-review-composer-title" style={{ width: 'min(520px, 100%)', background: theme.surface, borderRadius: 18, border: `1px solid ${theme.border}`, boxShadow: '0 24px 70px rgba(15, 23, 42, 0.24)', padding: 22, display: 'grid', gap: 16 }}>
        <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12 }}>
          <div><h3 id="dgfy-review-composer-title" style={{ margin: 0, fontSize: 20, fontWeight: 800, color: theme.text }}>Write a review</h3><p style={{ margin: '6px 0 0', fontSize: 14, color: theme.muted, lineHeight: 1.55 }}>Share your experience for {composer.activity.store_name || 'this store'}.</p></div>
          <button type="button" onClick={onClose} style={{ border: `1px solid ${theme.border}`, background: theme.surface, color: theme.muted, borderRadius: 10, width: 40, height: 40, display: 'grid', placeItems: 'center', cursor: submitting ? 'not-allowed' : 'pointer' }}><X size={18} /></button>
        </div>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          {[1, 2, 3, 4, 5].map((star) => <button key={`review-star-${star}`} type="button" onClick={() => setComposer((previous) => ({ ...previous, rating: star }))} style={{ border: 'none', background: 'transparent', color: composer.rating >= star ? '#F59E0B' : '#CBD5E1', cursor: 'pointer', padding: 0 }} aria-label={`${star} star rating`}><Star size={24} fill="currentColor" /></button>)}
        </div>
        <textarea value={composer.comment} onChange={(event) => setComposer((previous) => ({ ...previous, comment: event.target.value.slice(0, 500) }))} placeholder="Tell other customers what stood out about your order." rows={5} style={{ width: '100%', borderRadius: 12, border: `1px solid ${theme.border}`, padding: 14, fontSize: 14, color: theme.text, resize: 'vertical', outline: 'none', boxSizing: 'border-box' }} />
        {error ? <div role="alert" style={{ fontSize: 13, color: '#DC2626' }}>{error}</div> : null}
        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10, flexWrap: 'wrap' }}>
          <button type="button" onClick={onClose} style={{ border: `1px solid ${theme.border}`, background: theme.surface, color: theme.text, borderRadius: 10, padding: '10px 16px', fontSize: 14, fontWeight: 700, cursor: submitting ? 'not-allowed' : 'pointer' }}>Cancel</button>
          <button type="button" onClick={onSubmit} disabled={submitting} style={{ border: 'none', background: theme.primary, color: '#fff', borderRadius: 10, padding: '10px 18px', fontSize: 14, fontWeight: 800, cursor: submitting ? 'not-allowed' : 'pointer', opacity: submitting ? 0.7 : 1 }}>{submitting ? 'Sending...' : 'Submit Review'}</button>
        </div>
      </div>
    </div>
  );
}
