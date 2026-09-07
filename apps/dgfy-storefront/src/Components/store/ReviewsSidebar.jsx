import React from 'react';

const getReviewRatingLabel = (rating) => {
  const safeRating = Number(rating);
  if (!Number.isFinite(safeRating)) return '';
  return `${safeRating.toFixed(1)} / 5`;
};

export function ReviewsSidebar({ reviews = {}, theme = {} }) {
  const items = Array.isArray(reviews.items) ? reviews.items : [];

  return (
    <section className="sf-template__container">
      <div className="sf-template__section sf-review-card sf-stack">
        <div className="sf-section-heading">
          {reviews.eyebrow ? <p className="sf-section-eyebrow" style={{ fontFamily: theme.bodyFont }}>{reviews.eyebrow}</p> : null}
          <h2 className="sf-section-title" style={{ fontFamily: theme.displayFont }}>{reviews.title || 'Reviews'}</h2>
          {reviews.description ? (
            <p className="sf-section-description" style={{ fontFamily: theme.bodyFont }}>{reviews.description}</p>
          ) : null}
        </div>

        <div className="sf-card-grid sf-card-grid--reviews">
          <aside className="sf-summary-card">
            <p className="sf-summary-score" style={{ fontFamily: theme.displayFont }}>
              {Number.isFinite(Number(reviews.summary?.score)) ? Number(reviews.summary.score).toFixed(1) : '0.0'}
            </p>
            <p className="sf-summary-label" style={{ fontFamily: theme.bodyFont }}>
              {reviews.summary?.label || 'Summary data can describe trust, speed, or satisfaction.'}
            </p>
            {reviews.summary?.count ? (
              <span className="sf-pill" style={{ width: 'fit-content', fontFamily: theme.bodyFont }}>
                {reviews.summary.count} verified entries
              </span>
            ) : null}
          </aside>

          <div className="sf-review-grid">
            {items.length > 0 ? items.map((item) => (
              <article key={`${item.name}-${item.role || ''}`} className="sf-mode-card sf-stack" style={{ gap: 14 }}>
                <div className="sf-review-meta">
                  <div>
                    <p className="sf-review-name" style={{ fontFamily: theme.displayFont }}>{item.name}</p>
                    {item.role ? <p className="sf-review-role" style={{ fontFamily: theme.bodyFont }}>{item.role}</p> : null}
                  </div>
                  {item.rating ? (
                    <span className="sf-review-rating" style={{ fontFamily: theme.bodyFont }}>{getReviewRatingLabel(item.rating)}</span>
                  ) : null}
                </div>
                <p className="sf-review-quote" style={{ fontFamily: theme.bodyFont }}>{item.quote}</p>
              </article>
            )) : (
              <article className="sf-mode-card">
                <h3 className="sf-section-title" style={{ margin: 0, fontFamily: theme.displayFont }}>
                  {reviews.emptyTitle || 'No reviews yet'}
                </h3>
                <p className="sf-section-description" style={{ fontFamily: theme.bodyFont }}>
                  {reviews.emptyMessage || reviews.emptyLabel || 'Be the first to share your experience with this store.'}
                </p>
              </article>
            )}
          </div>
        </div>
      </div>
    </section>
  );
}
