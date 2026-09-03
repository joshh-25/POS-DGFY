export const DEFAULT_RATING_LABEL = '0.0';

export const formatStorefrontRating = (reviewSummary = null) => {
  const score = Number(reviewSummary?.score);
  if (!Number.isFinite(score) || score <= 0) return DEFAULT_RATING_LABEL;

  const count = Number(reviewSummary?.total_count ?? reviewSummary?.totalCount);
  return Number.isFinite(count) && count > 0
    ? `${score.toFixed(1)} (${count})`
    : score.toFixed(1);
};
