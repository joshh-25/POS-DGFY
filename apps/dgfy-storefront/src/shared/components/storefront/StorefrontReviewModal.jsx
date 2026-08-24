import React from 'react';
import { X, Star } from 'lucide-react';

import { STYLES } from '../../theme/storefrontStyleTokens.js';
import { PrimaryButton } from '../StorefrontActionPrimitives.jsx';
import { maskReviewerName } from '../../../features/shared-storefront/utils/storefrontDisplayUtils.jsx';
import { BOOKING_FIELD_STYLE } from '../../../modes/services/booking/model/serviceBookingFields.js';

/**
 * StorefrontReviewModal — shared customer-review composer used by services and
 * simple modes. Extracted verbatim from two near-duplicate inline blocks in
 * StorefrontApp.jsx; the only per-mode differences (accent colours, title font,
 * star-key prefix, and message placeholder) are props. The `isReviewModalOpen`
 * gate stays at the call site.
 */
export function StorefrontReviewModal({
  isMobileViewport,
  eyebrowColor,
  titleFontFamily,
  starColor,
  starBg,
  starShadow,
  keyPrefix = 'review-rating',
  messagePlaceholder,
  reviewDraft,
  onReviewDraftChange,
  onClose,
  onSubmit
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
      <div
        style={{
          position: 'absolute',
          inset: 0,
          background: 'rgba(15,23,42,0.52)',
          backdropFilter: 'blur(5px)'
        }}
      />
      <section
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
            <div style={{ fontSize: 12, fontWeight: 800, color: eyebrowColor, textTransform: 'uppercase', letterSpacing: '0.08em' }}>
              Customer Review
            </div>
            <div style={{ fontSize: isMobileViewport ? 26 : 30, fontWeight: 900, color: STYLES.colors.dark, lineHeight: 1.08, fontFamily: titleFontFamily }}>
              Share your experience
            </div>
            <div style={{ fontSize: 14, lineHeight: 1.65, color: STYLES.colors.muted }}>
              Rate the storefront experience and leave a short message. Publishing will be connected once the review backend is ready.
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            style={{
              width: 40,
              height: 40,
              borderRadius: 999,
              border: '1px solid #cbd5e1',
              background: '#fff',
              color: '#0f172a',
              cursor: 'pointer',
              display: 'grid',
              placeItems: 'center',
              flexShrink: 0
            }}
            aria-label="Close review modal"
          >
            <X size={18} />
          </button>
        </div>

        <div style={{ display: 'grid', gap: 16 }}>
          <label style={{ display: 'grid', gap: 8, fontSize: 13, color: '#334155' }}>
            Your name
            <input
              value={reviewDraft.name}
              onChange={(event) => onReviewDraftChange((previous) => ({ ...previous, name: event.target.value }))}
              placeholder="How should we identify your review?"
              style={BOOKING_FIELD_STYLE}
            />
          </label>

          <div style={{ display: 'grid', gap: 10 }}>
            <label style={{ display: 'inline-flex', alignItems: 'center', gap: 10, fontSize: 13, color: '#334155', cursor: 'pointer', width: 'fit-content' }}>
              <input
                type="checkbox"
                checked={reviewDraft.anonymous}
                onChange={(event) => onReviewDraftChange((previous) => ({ ...previous, anonymous: event.target.checked }))}
              />
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
                  <button
                    key={`${keyPrefix}-${starValue}`}
                    type="button"
                    onClick={() => onReviewDraftChange((previous) => ({ ...previous, rating: starValue }))}
                    style={{
                      width: 46,
                      height: 46,
                      borderRadius: 14,
                      border: `1px solid ${selected ? starColor : '#dbe5ee'}`,
                      background: selected ? starBg : '#ffffff',
                      color: selected ? starColor : '#94a3b8',
                      cursor: 'pointer',
                      display: 'grid',
                      placeItems: 'center',
                      boxShadow: selected ? starShadow : 'none'
                    }}
                    aria-label={`Rate ${starValue} star${starValue === 1 ? '' : 's'}`}
                  >
                    <Star size={18} fill={selected ? starColor : 'none'} color={selected ? starColor : '#94a3b8'} />
                  </button>
                );
              })}
            </div>
          </div>

          <label style={{ display: 'grid', gap: 8, fontSize: 13, color: '#334155' }}>
            Your review
            <textarea
              value={reviewDraft.message}
              onChange={(event) => onReviewDraftChange((previous) => ({ ...previous, message: event.target.value }))}
              placeholder={messagePlaceholder}
              style={{ ...BOOKING_FIELD_STYLE, minHeight: 144, resize: 'vertical' }}
            />
          </label>
        </div>

        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: isMobileViewport ? 'stretch' : 'center', flexDirection: isMobileViewport ? 'column' : 'row', gap: 12 }}>
          <div style={{ fontSize: 12, lineHeight: 1.6, color: '#64748b' }}>
            Reviews are prepared on the storefront now. Submission and moderation will connect once backend review support is available.
          </div>
          <PrimaryButton
            onClick={onSubmit}
            style={{ minHeight: 46, minWidth: isMobileViewport ? '100%' : 180, justifyContent: 'center' }}
          >
            Send Review
          </PrimaryButton>
        </div>
      </section>
    </div>
  );
}
