import React from 'react';

export function StorefrontReviewsSection({
  isMobileViewport,
  viewportWidth,
  title = 'Customer Reviews',
  subtitle,
  onWriteReview,
  writeReviewLabel = 'Write a Review',
  writeButton,
  reviewSummary = null,
  reviewHighlights = [],
  emptyMessage,
  titleFontFamily,
  cardVariant = 'soft',
  sectionPadding = null,
  summaryEnabled = false,
  starSymbol = '*'
}) {
  const reviewScore = Number(reviewSummary?.score);
  const reviewCount = Number(reviewSummary?.total_count ?? reviewSummary?.totalCount ?? reviewHighlights.length);
  const hasReviewSummary = Number.isFinite(reviewScore) && reviewScore > 0;
  const reviewGridColumns = isMobileViewport ? '1fr' : viewportWidth < 1024 ? 'repeat(2, minmax(0, 1fr))' : 'repeat(3, minmax(0, 1fr))';
  const cardBackground = cardVariant === 'white' ? '#ffffff' : '#fcfdff';
  const cardBorderStyle = cardVariant === 'white' ? '1px solid #dbe5ee' : '1px solid #dbe5ee';
  const cardShadow = cardVariant === 'white' ? '0 14px 28px rgba(15,23,42,0.06)' : '0 10px 24px rgba(15, 23, 42, 0.05)';
  const emptyBackground = cardVariant === 'white' ? '#ffffff' : '#fcfdff';
  const emptyBorder = cardVariant === 'white' ? '1px dashed #cbd5e1' : '1px solid #dbe5ee';

  return (
    <section
      style={{
        marginTop: 0,
        marginLeft: 'calc(50% - 50vw)',
        width: '100vw',
        padding: sectionPadding || (isMobileViewport ? '36px 0 30px' : '72px 0 42px'),
        background: 'linear-gradient(180deg, #f8fafc 0%, #f1f5f9 100%)',
        borderTop: '1px solid #e2e8f0',
        borderBottom: '1px solid #e2e8f0',
        display: 'grid',
        gap: 18
      }}
    >
      <div
        style={{
          maxWidth: 1320,
          width: '100%',
          margin: '0 auto',
          paddingLeft: isMobileViewport ? 16 : 24,
          paddingRight: isMobileViewport ? 16 : 24,
          display: 'grid',
          gap: 18
        }}
      >
        <div
          style={{
            display: 'flex',
            alignItems: isMobileViewport ? 'flex-start' : 'center',
            justifyContent: 'space-between',
            flexDirection: isMobileViewport ? 'column' : 'row',
            gap: 16
          }}
        >
          <div>
            <h2 style={{ margin: 0, fontSize: isMobileViewport ? 24 : 32, fontWeight: 900, color: '#0f172a', fontFamily: titleFontFamily }}>
              {title}
            </h2>
            {subtitle && (
              <p style={{ margin: '6px 0 0 0', fontSize: 14, color: '#64748b' }}>
                {subtitle}
              </p>
            )}
          </div>

          <div style={{ display: 'grid', gap: 10, justifyItems: isMobileViewport ? 'stretch' : 'end', width: isMobileViewport ? '100%' : 'auto' }}>
            {writeButton || (
              <button
                type="button"
                onClick={onWriteReview}
                style={{
                  minHeight: 46,
                  minWidth: isMobileViewport ? '100%' : 168,
                  justifyContent: 'center',
                  borderRadius: 12,
                  border: 'none',
                  background: '#1a4e8d',
                  color: '#ffffff',
                  padding: '0 18px',
                  fontWeight: 800,
                  cursor: 'pointer'
                }}
              >
                {writeReviewLabel}
              </button>
            )}

            {summaryEnabled && hasReviewSummary && (
              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 12,
                  padding: '10px 14px',
                  border: '1px solid #dbe5ee',
                  borderRadius: 16,
                  background: '#fcfdff',
                  boxShadow: '0 10px 24px rgba(15, 23, 42, 0.05)'
                }}
              >
                <div style={{ fontSize: 24, fontWeight: 900, color: '#0f172a', lineHeight: 1 }}>
                  {reviewScore.toFixed(1)}
                </div>
                <div style={{ display: 'grid', gap: 4 }}>
                  <div style={{ display: 'inline-flex', alignItems: 'center', gap: 2, color: '#f59e0b', fontSize: 14, lineHeight: 1 }}>
                    {Array.from({ length: 5 }, (_, index) => (
                      <span key={`review-summary-star-${index}`} style={{ opacity: index < Math.round(reviewScore) ? 1 : 0.25 }}>
                        {starSymbol}
                      </span>
                    ))}
                  </div>
                  <div style={{ fontSize: 12, color: '#64748b' }}>
                    from {reviewCount} review{reviewCount === 1 ? '' : 's'}
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>

        {reviewHighlights.length > 0 ? (
          <div style={{ display: 'grid', gridTemplateColumns: reviewGridColumns, gap: 18 }}>
            {reviewHighlights.map((review, index) => {
              const reviewerName = String(review?.reviewer_name || '').trim() || 'Customer';
              const rating = Number(review?.rating);
              const comment = String(review?.comment || '').trim();
              return (
                <article
                  key={`customer-review-${index}`}
                  style={{
                    background: cardBackground,
                    border: cardBorderStyle,
                    borderRadius: cardVariant === 'white' ? 20 : 18,
                    padding: cardVariant === 'white' ? (isMobileViewport ? 16 : 18) : 18,
                    boxShadow: cardShadow,
                    display: 'grid',
                    gap: cardVariant === 'white' ? 10 : 12,
                    alignContent: 'start'
                  }}
                >
                  <div style={{ display: 'grid', gap: 6 }}>
                    <div style={{ fontSize: 15, fontWeight: 800, color: '#0f172a' }}>{reviewerName}</div>
                    {Number.isFinite(rating) && rating > 0 && (
                      <div style={{ display: 'inline-flex', alignItems: 'center', gap: 2, color: '#f59e0b', fontSize: 14, lineHeight: 1 }}>
                        {Array.from({ length: 5 }, (_, starIndex) => (
                          <span key={`review-card-star-${index}-${starIndex}`} style={{ opacity: starIndex < Math.round(rating) ? 1 : 0.25 }}>
                            {starSymbol}
                          </span>
                        ))}
                      </div>
                    )}
                  </div>
                  <p style={{ margin: 0, fontSize: cardVariant === 'white' ? 14 : 13, lineHeight: 1.6, color: '#334155' }}>
                    {comment || 'Review comment will appear here once available in SKUpervisor.'}
                  </p>
                </article>
              );
            })}
          </div>
        ) : (
          <div
            style={{
              background: emptyBackground,
              border: emptyBorder,
              borderRadius: cardVariant === 'white' ? 20 : 18,
              padding: isMobileViewport ? 20 : 24,
              boxShadow: cardVariant === 'white' ? 'none' : '0 10px 24px rgba(15, 23, 42, 0.05)',
              fontSize: 14,
              color: '#64748b',
              textAlign: cardVariant === 'white' ? 'center' : 'left'
            }}
          >
            {emptyMessage}
          </div>
        )}
      </div>
    </section>
  );
}

export default StorefrontReviewsSection;
