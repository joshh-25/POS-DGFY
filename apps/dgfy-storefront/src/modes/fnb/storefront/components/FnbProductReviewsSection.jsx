import { Star } from 'lucide-react';

const STAR_COLOR = '#f59e0b';
const STAR_SOFT = '#fef3c7';
const FNB_DISPLAY_FONT = '"Outfit", "Avenir Next", "Segoe UI", sans-serif';

const formatRelativeDate = (value) => {
  const date = value ? new Date(value) : null;
  if (!date || Number.isNaN(date.getTime())) return 'Recently';
  const diffMs = Date.now() - date.getTime();
  const diffDays = Math.max(0, Math.floor(diffMs / (1000 * 60 * 60 * 24)));
  if (diffDays <= 0) return 'Today';
  if (diffDays === 1) return '1 day ago';
  if (diffDays < 30) return `${diffDays} days ago`;
  const diffMonths = Math.floor(diffDays / 30);
  if (diffMonths <= 1) return '1 month ago';
  if (diffMonths < 12) return `${diffMonths} months ago`;
  const diffYears = Math.floor(diffMonths / 12);
  return diffYears <= 1 ? '1 year ago' : `${diffYears} years ago`;
};

function FractionalStars({ value = 0, size = 16, gap = 4 }) {
  const rating = Math.max(0, Math.min(5, Number(value || 0)));
  return (
    <div style={{ display: 'inline-flex', alignItems: 'center', gap }}>
      {Array.from({ length: 5 }, (_, index) => {
        const fillRatio = Math.max(0, Math.min(1, rating - index));
        return (
          <span key={`fractional-star-${index}`} style={{ position: 'relative', width: size, height: size, display: 'inline-grid', placeItems: 'center' }}>
            <Star size={size} color="#cbd5e1" strokeWidth={1.8} />
            <span style={{ position: 'absolute', inset: 0, width: `${fillRatio * 100}%`, overflow: 'hidden', display: 'grid', placeItems: 'center', transition: 'width 220ms ease' }}>
              <Star size={size} color={STAR_COLOR} fill={STAR_COLOR} strokeWidth={1.8} />
            </span>
          </span>
        );
      })}
    </div>
  );
}

export function FnbProductReviewsSection({
  accentColor = '#0F6FFF',
  accentSoft = '#eff6ff',
  actionButtonBase,
  canWriteReview,
  displayFont = FNB_DISPLAY_FONT,
  isMobileViewport,
  compactTypography = false,
  itemNoun = 'item',
  onOpenWriteReview,
  ratingScore,
  reviewCount,
  reviewDistribution,
  reviewEntries,
  reviewSectionHighlighted,
  reviewsLoading
}) {
  const hasReviewSummary = Number.isFinite(Number(ratingScore)) && Number(ratingScore) > 0;

  return (
    <div
      id="fnb-item-reviews-section"
      style={{
        display: 'grid',
        gap: 16,
        borderTop: '1px solid rgba(226, 232, 240, 0.6)',
        paddingTop: 24,
        marginTop: 24,
        scrollMarginTop: 96,
        transition: 'box-shadow 220ms ease, border-color 220ms ease',
        ...(reviewSectionHighlighted ? {
          borderRadius: 24,
          paddingInline: 16,
          paddingBottom: 12,
          marginInline: -16,
          boxShadow: '0 0 0 2px rgba(15,111,255,0.16), 0 18px 36px rgba(15,111,255,0.08)'
        } : {})
      }}
    >
      <div style={{ display: 'flex', alignItems: isMobileViewport ? 'stretch' : 'center', justifyContent: 'space-between', gap: 16, flexDirection: isMobileViewport ? 'column' : 'row' }}>
        <div style={{ display: 'grid', gap: 6 }}>
          <h3 style={{ margin: 0, fontSize: 18, fontWeight: compactTypography ? 700 : 800, color: '#0f172a', fontFamily: displayFont }}>Reviews & Ratings</h3>
          <div style={{ fontSize: 13, color: '#64748b' }}>Verified customer feedback for this {itemNoun}.</div>
        </div>
        {canWriteReview ? (
          <button
            type="button"
            onClick={onOpenWriteReview}
            style={{
              ...actionButtonBase,
              minHeight: 42,
              padding: '0 18px',
              borderRadius: 14,
              border: '1px solid #bfdbfe',
              background: accentSoft,
              color: accentColor,
              boxShadow: '0 10px 24px rgba(15,111,255,0.08)'
            }}
          >
            Write a Review
          </button>
        ) : null}
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: isMobileViewport ? '1fr' : 'minmax(0, 280px) minmax(0, 1fr)', gap: 18 }}>
        <div style={{ border: '1px solid rgba(226, 232, 240, 0.8)', borderRadius: 20, background: '#fff', padding: 18, display: 'grid', gap: 14, boxShadow: '0 12px 26px rgba(15,23,42,0.04)' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <div style={{ fontSize: 34, fontWeight: 900, color: '#0f172a', lineHeight: 1 }}>{hasReviewSummary ? Number(ratingScore).toFixed(2) : '0.00'}</div>
            <div style={{ display: 'grid', gap: 6 }}>
              <FractionalStars value={ratingScore || 0} size={18} />
              <div style={{ fontSize: 12, color: '#64748b' }}>{Number(reviewCount || 0)} review{Number(reviewCount || 0) === 1 ? '' : 's'}</div>
            </div>
          </div>
          {Array.from({ length: 5 }, (_, index) => 5 - index).map((starValue) => {
            const total = Math.max(1, Number(reviewCount || 0));
            const count = Number(reviewDistribution?.[starValue] || 0);
            const percent = Math.max(0, Math.min(100, (count / total) * 100));
            return (
              <div key={`rating-dist-${starValue}`} style={{ display: 'grid', gridTemplateColumns: '36px 1fr 32px', gap: 10, alignItems: 'center' }}>
                <div style={{ fontSize: 12, fontWeight: 700, color: '#475569' }}>{starValue}{'\u2605'}</div>
                <div style={{ height: 8, borderRadius: 999, background: '#e2e8f0', overflow: 'hidden' }}><div style={{ width: `${percent}%`, height: '100%', borderRadius: 999, background: '#f59e0b' }} /></div>
                <div style={{ fontSize: 12, color: '#64748b', textAlign: 'right' }}>{count}</div>
              </div>
            );
          })}
        </div>

        <div style={{ display: 'grid', gap: 12 }}>
          {reviewsLoading ? (
            <div style={{ display: 'grid', placeItems: 'center', minHeight: 200, border: '1px solid rgba(226, 232, 240, 0.8)', borderRadius: 20, background: '#fff', color: '#64748b', fontSize: 14, padding: 20, textAlign: 'center' }}>Loading customer reviews...</div>
          ) : reviewEntries.length > 0 ? (
            <div style={{ display: 'grid', gap: 12 }}>
              {reviewEntries.map((entry) => {
                const reviewerName = String(entry?.reviewer_name || 'Customer').trim() || 'Customer';
                const initials = String(entry?.reviewer_initials || reviewerName.split(/\s+/).map((part) => part.charAt(0).toUpperCase()).slice(0, 2).join('') || 'CU').slice(0, 2);
                const mediaEntries = Array.isArray(entry?.media) ? entry.media : [];
                return (
                  <article key={`review-card-${entry?.review_id || `${reviewerName}-${entry?.submitted_at || ''}`}`} style={{ border: '1px solid rgba(226, 232, 240, 0.8)', borderRadius: 20, background: '#fff', padding: 18, display: 'grid', gap: 12, boxShadow: '0 12px 26px rgba(15,23,42,0.04)' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                      <div style={{ width: 42, height: 42, borderRadius: '50%', background: accentSoft, color: accentColor, display: 'grid', placeItems: 'center', fontSize: 14, fontWeight: 800, flexShrink: 0 }}>{initials}</div>
                      <div style={{ minWidth: 0, display: 'grid', gap: 4 }}>
                        <div style={{ fontSize: 14, fontWeight: 800, color: '#0f172a', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{reviewerName}</div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                          <FractionalStars value={entry?.rating || 0} size={14} gap={2} />
                          <div style={{ fontSize: 12, color: '#64748b' }}>{formatRelativeDate(entry?.submitted_at)}{entry?.verified_purchase === true ? ' - Verified Order' : ''}</div>
                        </div>
                      </div>
                    </div>
                    {String(entry?.title || '').trim() ? <div style={{ fontSize: 14, fontWeight: 700, color: '#0f172a' }}>{String(entry.title).trim()}</div> : null}
                    {String(entry?.comment || '').trim() ? <div style={{ fontSize: 14, lineHeight: 1.7, color: '#475569' }}>{String(entry.comment).trim()}</div> : null}
                    {mediaEntries.length > 0 ? (
                      <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
                        {mediaEntries.slice(0, 4).map((mediaEntry, index) => <div key={`review-media-${entry?.review_id || 'item'}-${index}`} style={{ width: 72, height: 72, borderRadius: 12, background: STAR_SOFT, border: '1px dashed #fdba74', display: 'grid', placeItems: 'center', color: '#c2410c', fontSize: 11, fontWeight: 700, flexShrink: 0 }}>{String(mediaEntry?.label || mediaEntry?.name || 'Photo').trim()}</div>)}
                      </div>
                    ) : null}
                  </article>
                );
              })}
            </div>
          ) : (
            <div style={{ display: 'grid', placeItems: 'center', minHeight: 200, border: '1px solid rgba(226, 232, 240, 0.8)', borderRadius: 20, background: '#fff', color: '#64748b', fontSize: 14, padding: 20, textAlign: 'center' }}>No verified reviews for this item yet.</div>
          )}
        </div>
      </div>
    </div>
  );
}
