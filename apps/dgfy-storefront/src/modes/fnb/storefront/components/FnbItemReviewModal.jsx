import React from 'react';
import { Star, X } from 'lucide-react';
import { PrimaryButton } from '../../../../shared/components/StorefrontActionPrimitives.jsx';

const fieldStyle = {
  width: '100%',
  boxSizing: 'border-box',
  border: '1px solid #cbd5e1',
  borderRadius: 12,
  minHeight: 46,
  padding: '11px 12px',
  color: '#0f172a',
  background: '#fff',
  fontSize: 14
};

function maskReviewerName(value) {
  const normalized = String(value || '').trim();
  if (!normalized) return 'Anonymous customer';
  const [firstName = '', ...remainingNames] = normalized.split(/\s+/);
  // Chrome 80-84 iMin/old-handset WebView has no Array.prototype.at (ES2022 / Chrome 92+). See #666.
  const lastInitial = remainingNames[remainingNames.length - 1]?.[0] || '';
  return `${firstName}${lastInitial ? ` ${lastInitial}.` : ''}`;
}

/** F&B-only review presentation. Submission ownership remains in the route shell. */
export function FnbItemReviewModal({
  isMobileViewport,
  isSubmitting,
  onClose,
  onDraftChange,
  onSubmit,
  reviewDraft
}) {
  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 2300,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: isMobileViewport ? 16 : 24
      }}
    >
      <div style={{ position: 'absolute', inset: 0, background: 'rgba(15,23,42,0.52)', backdropFilter: 'blur(5px)' }} />
      <section
        role="dialog"
        aria-modal="true"
        aria-labelledby="fnb-item-review-title"
        style={{
          position: 'relative',
          zIndex: 1,
          width: '100%',
          maxWidth: 640,
          maxHeight: 'min(90vh, 760px)',
          overflowY: 'auto',
          borderRadius: 28,
          border: '1px solid #dbe5ee',
          background: '#ffffff',
          boxShadow: '0 28px 64px rgba(15,23,42,0.22)',
          padding: isMobileViewport ? 20 : 28,
          display: 'grid',
          gap: 20
        }}
      >
        <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 16 }}>
          <div style={{ display: 'grid', gap: 8 }}>
            <div style={{ fontSize: 12, fontWeight: 800, color: '#f97316', textTransform: 'uppercase', letterSpacing: '0.08em' }}>Menu Review</div>
            <div id="fnb-item-review-title" style={{ fontSize: isMobileViewport ? 26 : 30, fontWeight: 900, color: '#0f172a', lineHeight: 1.08 }}>
              Share your dining experience
            </div>
            <div style={{ fontSize: 14, lineHeight: 1.65, color: '#64748b' }}>
              Rate this menu item and add a short comment if you want. Verified reviews appear after approval.
            </div>
          </div>
          <button type="button" onClick={onClose} style={{ width: 40, height: 40, borderRadius: 999, border: '1px solid #cbd5e1', background: '#fff', color: '#0f172a', cursor: 'pointer', display: 'grid', placeItems: 'center', flexShrink: 0 }} aria-label="Close review modal">
            <X size={18} />
          </button>
        </div>

        <div style={{ display: 'grid', gap: 16 }}>
          <label style={{ display: 'grid', gap: 8, fontSize: 13, color: '#334155' }}>
            Your name
            <input value={reviewDraft.name} onChange={(event) => onDraftChange({ name: event.target.value })} placeholder="How should we identify your review?" style={fieldStyle} />
          </label>
          <div style={{ display: 'grid', gap: 10 }}>
            <label style={{ display: 'inline-flex', alignItems: 'center', gap: 10, fontSize: 13, color: '#334155', cursor: 'pointer', width: 'fit-content' }}>
              <input type="checkbox" checked={reviewDraft.anonymous} onChange={(event) => onDraftChange({ anonymous: event.target.checked })} />
              Post this review anonymously
            </label>
            <div style={{ fontSize: 12, color: '#64748b' }}>
              Public name preview: <strong style={{ color: '#0f172a' }}>{reviewDraft.anonymous ? maskReviewerName(reviewDraft.name) : (String(reviewDraft.name || '').trim() || 'Your name')}</strong>
            </div>
          </div>
          <div style={{ display: 'grid', gap: 10 }}>
            <div style={{ fontSize: 13, fontWeight: 700, color: '#334155' }}>Your rating</div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
              {Array.from({ length: 5 }, (_, index) => {
                const starValue = index + 1;
                const selected = reviewDraft.rating >= starValue;
                return (
                  <button key={`fnb-review-rating-${starValue}`} type="button" onClick={() => onDraftChange({ rating: starValue })} style={{ width: 46, height: 46, borderRadius: 14, border: `1px solid ${selected ? '#f59e0b' : '#dbe5ee'}`, background: selected ? '#fff7ed' : '#ffffff', color: selected ? '#f59e0b' : '#94a3b8', cursor: 'pointer', display: 'grid', placeItems: 'center', boxShadow: selected ? '0 10px 20px rgba(245,158,11,0.16)' : 'none' }} aria-label={`Rate ${starValue} star${starValue === 1 ? '' : 's'}`}>
                    <Star size={18} fill={selected ? '#f59e0b' : 'none'} color={selected ? '#f59e0b' : '#94a3b8'} />
                  </button>
                );
              })}
            </div>
          </div>
          <label style={{ display: 'grid', gap: 8, fontSize: 13, color: '#334155' }}>
            Your review
            <textarea value={reviewDraft.message} onChange={(event) => onDraftChange({ message: event.target.value })} placeholder="Tell customers what stood out about the food, drinks, and overall order experience." style={{ ...fieldStyle, minHeight: 144, resize: 'vertical' }} />
          </label>
        </div>

        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: isMobileViewport ? 'stretch' : 'center', flexDirection: isMobileViewport ? 'column' : 'row', gap: 12 }}>
          <div style={{ fontSize: 12, lineHeight: 1.6, color: '#64748b' }}>Reviews are limited to completed delivery and pickup orders.</div>
          <PrimaryButton onClick={onSubmit} disabled={isSubmitting} style={{ minHeight: 46, minWidth: isMobileViewport ? '100%' : 180, justifyContent: 'center', opacity: isSubmitting ? 0.7 : 1 }}>
            {isSubmitting ? 'Submitting...' : 'Send Review'}
          </PrimaryButton>
        </div>
      </section>
    </div>
  );
}
