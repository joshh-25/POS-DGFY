import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  AlertCircle, Check, Grid2X2, List,
  RefreshCw, Search, Star, X
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import PosSettingsPagination from './PosSettingsPagination.jsx';
import {
  STOREFRONT_TYPOGRAPHY,
  StorefrontEmptyState,
  StorefrontSectionHeader
} from './StorefrontSectionPrimitives.jsx';
import { listStorefrontReviews } from './storefrontReviewsService.js';

const DEFAULT_PAGE_SIZE = 20;
const PAGE_SIZE_OPTIONS = [12, 20];
const REVIEW_FETCH_LIMIT = 50;
const DATE_RANGE_OPTIONS = [
  { value: 'all', label: 'All Time' },
  { value: 'today', label: 'Today' },
  { value: 'last_7', label: 'Last 7 Days' },
  { value: 'last_30', label: 'Last 30 Days' },
  { value: 'custom', label: 'Custom Range' }
];
const RATING_OPTIONS = [
  { value: 'all', label: 'All Ratings' },
  { value: '5', label: '5 Stars' },
  { value: '4', label: '4 Stars' },
  { value: '3', label: '3 Stars' },
  { value: '2', label: '2 Stars' },
  { value: '1', label: '1 Star' }
];

const formatDateTime = (value) => {
  if (!value) return 'Date unavailable';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return 'Date unavailable';
  return new Intl.DateTimeFormat(undefined, {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit'
  }).format(date);
};

const getInitials = (name) => {
  const initials = String(name || 'Customer')
    .trim()
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part.charAt(0).toUpperCase())
    .join('');
  return initials || 'CU';
};

const normalizeReview = (entry, index) => {
  const reviewerName = String(entry?.anonymous ? 'Anonymous' : entry?.reviewer_name || 'Customer').trim() || 'Customer';
  const parsedRating = Number(entry?.rating);
  const rating = Number.isFinite(parsedRating) ? Math.max(0, Math.min(5, parsedRating)) : 0;
  const orderReference = entry?.order_reference || entry?.order_number || entry?.order_code || '';
  return {
    id: String(entry?.review_id || `${reviewerName}-${entry?.submitted_at || index}`),
    name: reviewerName,
    initials: String(entry?.reviewer_initials || getInitials(reviewerName)).slice(0, 3).toUpperCase(),
    avatarUrl: String(entry?.reviewer_avatar_url || entry?.avatar_url || '').trim(),
    rating,
    comment: String(entry?.comment || '').trim(),
    submittedAt: entry?.submitted_at || entry?.created_at || null,
    orderReference: String(orderReference || '').trim(),
    verifiedPurchase: entry?.verified_purchase === true
  };
};

const getDateStart = (range, customFrom) => {
  const now = new Date();
  if (range === 'today') {
    const start = new Date(now);
    start.setHours(0, 0, 0, 0);
    return start;
  }
  if (range === 'last_7' || range === 'last_30') {
    const start = new Date(now);
    start.setHours(0, 0, 0, 0);
    start.setDate(start.getDate() - (range === 'last_7' ? 6 : 29));
    return start;
  }
  if (range === 'custom' && customFrom) {
    const start = new Date(`${customFrom}T00:00:00`);
    return Number.isNaN(start.getTime()) ? null : start;
  }
  return null;
};

const getDateEnd = (range, customTo) => {
  if (range === 'custom' && customTo) {
    const end = new Date(`${customTo}T23:59:59.999`);
    return Number.isNaN(end.getTime()) ? null : end;
  }
  return range === 'custom' && !customTo ? null : new Date();
};

const deriveSummary = (summary, reviews) => {
  const distribution = { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 };
  reviews.forEach((review) => {
    const rating = Math.round(Number(review.rating));
    if (distribution[rating] !== undefined) distribution[rating] += 1;
  });
  const ratings = reviews.map((review) => Number(review.rating)).filter((rating) => rating > 0);
  const fallbackAverage = ratings.length
    ? Math.round((ratings.reduce((sum, rating) => sum + rating, 0) / ratings.length) * 10) / 10
    : null;
  const rawDistribution = summary?.distribution || summary?.star_distribution;
  return {
    average_rating: Number.isFinite(Number(summary?.average_rating)) ? Number(summary.average_rating) : fallbackAverage,
    total_count: Number.isFinite(Number(summary?.total_count)) ? Number(summary.total_count) : reviews.length,
    distribution: rawDistribution && typeof rawDistribution === 'object' ? { ...distribution, ...rawDistribution } : distribution
  };
};

function ReviewStars({ rating, size = 'h-3.5 w-3.5', label = true }) {
  const numericRating = Number(rating || 0);
  return (
    <span className="inline-flex items-center gap-0.5" aria-label={label ? `${numericRating.toFixed(1)} out of 5 stars` : undefined}>
      {Array.from({ length: 5 }, (_, index) => (
        <Star
          key={index}
          className={`${size} ${index < Math.round(numericRating) ? 'fill-amber-400 text-amber-500' : 'text-slate-200'}`}
          aria-hidden="true"
        />
      ))}
      {label ? <span className="sr-only">{numericRating.toFixed(1)} out of 5</span> : null}
    </span>
  );
}

function ReviewAvatar({ review }) {
  return review.avatarUrl ? (
    <img src={review.avatarUrl} alt="" className="h-8 w-8 shrink-0 rounded-full object-cover" />
  ) : (
    <span className="grid h-8 w-8 shrink-0 place-items-center rounded-full bg-blue-50 text-[11px] font-extrabold text-[#1A4E8D]" aria-hidden="true">
      {review.initials}
    </span>
  );
}

function ExpandableReviewText({ review, lines = 3 }) {
  const [expanded, setExpanded] = useState(false);
  const isLong = review.comment.length > (lines === 3 ? 180 : 300);
  const clampClass = lines === 5 ? 'line-clamp-5' : 'line-clamp-3';
  if (!review.comment) return <span className="text-slate-400">No written comment.</span>;
  return (
    <div>
      <p className={`${expanded ? '' : clampClass} whitespace-pre-line leading-5 text-slate-700`}>
        {review.comment}
      </p>
      {isLong ? (
        <button type="button" onClick={() => setExpanded((value) => !value)} className="mt-1 text-[12px] font-bold text-[#1A4E8D] underline-offset-2 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#1A4E8D]/30">
          {expanded ? 'Show less' : 'Show more'}
        </button>
      ) : null}
    </div>
  );
}

function ReviewViewToggle({ view, onChange, location }) {
  return (
    <div className="inline-flex shrink-0 rounded-lg border border-slate-200 bg-white p-0.5" role="group" aria-label={`${location} review view`}>
      <button
        type="button"
        aria-pressed={view === 'list'}
        onClick={() => onChange('list')}
        className={`inline-flex min-h-8 items-center gap-1.5 rounded-md px-2.5 text-[12px] font-bold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#1A4E8D]/30 ${view === 'list' ? 'bg-[#1A4E8D] text-white' : 'text-slate-600 hover:bg-slate-50'}`}
      >
        <List className="h-3.5 w-3.5" aria-hidden="true" />List
      </button>
      <button
        type="button"
        aria-pressed={view === 'cards'}
        onClick={() => onChange('cards')}
        className={`inline-flex min-h-8 items-center gap-1.5 rounded-md px-2.5 text-[12px] font-bold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#1A4E8D]/30 ${view === 'cards' ? 'bg-[#1A4E8D] text-white' : 'text-slate-600 hover:bg-slate-50'}`}
      >
        <Grid2X2 className="h-3.5 w-3.5" aria-hidden="true" />Cards
      </button>
    </div>
  );
}

function ReviewSummary({ summary, reviews }) {
  const average = Number.isFinite(Number(summary?.average_rating)) ? Number(summary.average_rating) : null;
  const total = Number.isFinite(Number(summary?.total_count)) ? Number(summary.total_count) : reviews.length;
  const distribution = summary?.distribution || {};
  const maxCount = Math.max(1, ...[1, 2, 3, 4, 5].map((star) => Number(distribution[star] || 0)));
  return (
    <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm shadow-slate-200/50 sm:p-5" aria-label="Review summary">
      <div className="grid gap-5 md:grid-cols-[minmax(130px,0.7fr)_minmax(140px,0.7fr)_minmax(0,1.7fr)] md:items-center">
        <div className="border-b border-slate-100 pb-4 md:border-b-0 md:border-r md:pb-0 md:pr-5">
          <p className="text-[28px] font-extrabold leading-none tracking-tight text-[#0F172A]">{average == null ? '—' : average.toFixed(1)}</p>
          <ReviewStars rating={average || 0} size="h-4 w-4" />
          <p className="mt-1.5 text-[11px] font-semibold text-[#64748B]">Average Rating</p>
        </div>
        <div className="border-b border-slate-100 pb-4 md:border-b-0 md:border-r md:pb-0 md:pr-5">
          <p className="text-[28px] font-extrabold leading-none tracking-tight text-[#0F172A]">{total.toLocaleString()}</p>
          <p className="mt-2 text-[11px] font-semibold text-[#64748B]">Total Reviews</p>
        </div>
        <div className="min-w-0">
          <p className="mb-2 text-[12px] font-extrabold uppercase tracking-[0.08em] text-[#8399BA]">Rating Distribution</p>
          <div className="space-y-1.5">
            {[5, 4, 3, 2, 1].map((star) => {
              const count = Number(distribution[star] || 0);
              return (
                <div key={star} className="grid grid-cols-[24px_minmax(0,1fr)_32px] items-center gap-2 text-[11px] font-semibold text-slate-600">
                  <span aria-label={`${star} star`}>{star}★</span>
                  <div className="h-2 overflow-hidden rounded-full bg-slate-100" role="progressbar" aria-label={`${star} star reviews`} aria-valuemin="0" aria-valuemax={maxCount} aria-valuenow={count}>
                    <div className="h-full rounded-full bg-[#3B82F6] transition-[width]" style={{ width: `${Math.round((count / maxCount) * 100)}%` }} />
                  </div>
                  <span className="text-right tabular-nums text-slate-500">{count}</span>
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </section>
  );
}

function ReviewList({ reviews, hasOrderReferences }) {
  return (
    <div className="overflow-hidden rounded-xl border border-slate-200 bg-white" data-testid="storefront-reviews-list" role="table" aria-label="Customer reviews">
      <div className={`hidden border-b border-slate-100 bg-slate-50 px-3 py-2.5 text-[11px] font-extrabold uppercase tracking-[0.06em] text-[#64748B] sm:grid ${hasOrderReferences ? 'grid-cols-[minmax(130px,1.1fr)_minmax(90px,0.65fr)_minmax(220px,2fr)_minmax(110px,0.7fr)_minmax(140px,0.85fr)]' : 'grid-cols-[minmax(130px,1.1fr)_minmax(90px,0.65fr)_minmax(220px,2fr)_minmax(140px,0.85fr)]'}`} role="row">
        <span role="columnheader">Customer</span><span role="columnheader">Rating</span><span role="columnheader">Review</span>{hasOrderReferences ? <span role="columnheader">Order</span> : null}<span role="columnheader">Date</span>
      </div>
      {reviews.map((review) => (
        <div key={review.id} className={`grid gap-3 border-b border-slate-100 px-3 py-3 last:border-b-0 sm:items-start sm:gap-4 ${hasOrderReferences ? 'sm:grid-cols-[minmax(130px,1.1fr)_minmax(90px,0.65fr)_minmax(220px,2fr)_minmax(110px,0.7fr)_minmax(140px,0.85fr)]' : 'sm:grid-cols-[minmax(130px,1.1fr)_minmax(90px,0.65fr)_minmax(220px,2fr)_minmax(140px,0.85fr)]'}`} role="row">
          <div className="flex min-w-0 items-center gap-2" role="cell"><ReviewAvatar review={review} /><span className="min-w-0 truncate text-[13px] font-bold text-[#0F172A]">{review.name}</span></div>
          <div className="flex items-center gap-2" role="cell"><ReviewStars rating={review.rating} label={false} /><span className="text-[12px] font-bold tabular-nums text-slate-600">{review.rating.toFixed(1)}</span></div>
          <div className="min-w-0 text-[12px]" role="cell"><ExpandableReviewText review={review} lines={3} /></div>
          {hasOrderReferences ? <div className="text-[12px] font-semibold text-slate-600" role="cell">{review.orderReference || '—'}</div> : null}
          <div className="text-[11px] leading-4 text-slate-500" role="cell">{formatDateTime(review.submittedAt)}</div>
        </div>
      ))}
    </div>
  );
}

function ReviewGrid({ reviews }) {
  return (
    <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3" data-testid="storefront-reviews-grid" aria-label="Customer review cards">
      {reviews.map((review) => (
        <article key={review.id} className="min-w-0 rounded-xl border border-slate-200 bg-white p-3.5 shadow-sm shadow-slate-200/40">
          <div className="flex items-start justify-between gap-3">
            <div className="flex min-w-0 items-center gap-2"><ReviewAvatar review={review} /><div className="min-w-0"><p className="truncate text-[13px] font-bold text-[#0F172A]">{review.name}</p><p className="mt-0.5 text-[11px] text-slate-500">{formatDateTime(review.submittedAt)}</p></div></div>
            <div className="shrink-0 text-right"><div className="flex items-center justify-end gap-1"><ReviewStars rating={review.rating} label={false} /><span className="text-[12px] font-bold tabular-nums text-slate-600">{review.rating.toFixed(1)}</span></div>{review.orderReference ? <p className="mt-1 text-[11px] font-semibold text-slate-500">Order {review.orderReference}</p> : null}</div>
          </div>
          <div className="mt-3 border-t border-slate-100 pt-3 text-[12px]"><ExpandableReviewText review={review} lines={5} /></div>
          {review.verifiedPurchase ? <p className="mt-3 inline-flex items-center gap-1 text-[11px] font-semibold text-emerald-700"><Check className="h-3.5 w-3.5" aria-hidden="true" />Verified purchase</p> : null}
        </article>
      ))}
    </div>
  );
}

function ReviewLoadingState() {
  return (
    <div className="space-y-3" aria-label="Loading reviews" aria-busy="true">
      <div className="grid gap-3 rounded-2xl border border-slate-200 bg-white p-5 sm:grid-cols-3"><div className="h-12 animate-pulse rounded-lg bg-slate-100" /><div className="h-12 animate-pulse rounded-lg bg-slate-100" /><div className="h-24 animate-pulse rounded-lg bg-slate-100 sm:col-span-1" /></div>
      <div className="overflow-hidden rounded-xl border border-slate-200 bg-white">{Array.from({ length: 5 }, (_, index) => <div key={index} className="grid gap-3 border-b border-slate-100 p-4 last:border-b-0 sm:grid-cols-4"><div className="h-8 animate-pulse rounded bg-slate-100" /><div className="h-4 animate-pulse rounded bg-slate-100" /><div className="h-8 animate-pulse rounded bg-slate-100 sm:col-span-1" /><div className="h-4 animate-pulse rounded bg-slate-100" /></div>)}</div>
    </div>
  );
}

function ReviewFilteredEmptyState({ onClear }) {
  return (
    <div className="rounded-xl border border-dashed border-slate-200 bg-slate-50/70 px-4 py-10 text-center">
      <Search className="mx-auto h-7 w-7 text-slate-400" aria-hidden="true" />
      <h3 className={`mt-3 ${STOREFRONT_TYPOGRAPHY.itemLabel}`}>No reviews found.</h3>
      <p className={`mx-auto mt-1 max-w-xs ${STOREFRONT_TYPOGRAPHY.sectionDescription}`}>No reviews match your current search or filters.</p>
      <Button type="button" variant="outline" onClick={onClear} className="mt-4 min-h-9 rounded-lg border-blue-200 px-3 text-[12px] font-bold text-[#1A4E8D] hover:bg-blue-50">Clear Filters</Button>
    </div>
  );
}

export default function StorefrontReviewsSettings({ tenantId = '' }) {
  const [view, setView] = useState('list');
  const [query, setQuery] = useState('');
  const [ratingFilter, setRatingFilter] = useState('all');
  const [dateRange, setDateRange] = useState('all');
  const [customFrom, setCustomFrom] = useState('');
  const [customTo, setCustomTo] = useState('');
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(DEFAULT_PAGE_SIZE);
  const [reviews, setReviews] = useState([]);
  const [summary, setSummary] = useState(null);
  const [loading, setLoading] = useState(true);
  const [hasLoaded, setHasLoaded] = useState(false);
  const [error, setError] = useState('');

  const loadReviews = useCallback(async () => {
    const normalizedTenantId = String(tenantId || '').trim();
    if (!normalizedTenantId) {
      setReviews([]);
      setSummary(null);
      setHasLoaded(true);
      setLoading(false);
      setError('');
      return;
    }
    setLoading(true);
    setError('');
    try {
      const result = await listStorefrontReviews({ tenantId: normalizedTenantId, limit: REVIEW_FETCH_LIMIT });
      const normalizedReviews = (Array.isArray(result?.reviews) ? result.reviews : []).map(normalizeReview);
      setReviews(normalizedReviews);
      setSummary(deriveSummary(result?.summary, normalizedReviews));
      setHasLoaded(true);
    } catch (loadError) {
      setError(loadError?.response?.data?.message || 'Unable to load reviews. Please try again.');
      setHasLoaded(true);
    } finally {
      setLoading(false);
    }
  }, [tenantId]);

  useEffect(() => { void loadReviews(); }, [loadReviews]);

  const filteredReviews = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase();
    const start = getDateStart(dateRange, customFrom);
    const end = getDateEnd(dateRange, customTo);
    return reviews.filter((review) => {
      const matchesQuery = !normalizedQuery || [review.name, review.comment, review.orderReference]
        .some((value) => String(value || '').toLowerCase().includes(normalizedQuery));
      const matchesRating = ratingFilter === 'all' || Math.round(review.rating) === Number(ratingFilter);
      const submittedAt = review.submittedAt ? new Date(review.submittedAt) : null;
      const matchesDate = !start || !submittedAt || Number.isNaN(submittedAt.getTime()) || (submittedAt >= start && (!end || submittedAt <= end));
      return matchesQuery && matchesRating && matchesDate;
    });
  }, [customFrom, customTo, dateRange, query, ratingFilter, reviews]);

  useEffect(() => { setPage(1); }, [customFrom, customTo, dateRange, query, ratingFilter, pageSize]);

  const clearFilters = () => {
    setQuery('');
    setRatingFilter('all');
    setDateRange('all');
    setCustomFrom('');
    setCustomTo('');
    setPage(1);
  };
  const totalPages = Math.max(1, Math.ceil(filteredReviews.length / pageSize));
  const safePage = Math.min(page, totalPages);
  const visibleReviews = filteredReviews.slice((safePage - 1) * pageSize, safePage * pageSize);
  const hasOrderReferences = reviews.some((review) => Boolean(review.orderReference));
  const normalizedSummary = deriveSummary(summary, reviews);
  const isPartialFeed = normalizedSummary.total_count > reviews.length && reviews.length >= REVIEW_FETCH_LIMIT;
  const showInitialLoading = loading && !hasLoaded;
  const hasReviews = reviews.length > 0;

  return (
    <div className="space-y-4" data-testid="storefront-reviews-settings">
      <div className="flex min-w-0 flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <StorefrontSectionHeader title="Reviews" description="Customer feedback from your storefront." hasData={false} />
        <ReviewViewToggle view={view} onChange={setView} location="Header" />
      </div>
      {error && hasReviews ? <div className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-[12px] text-amber-800" role="alert"><span className="inline-flex items-center gap-1.5"><AlertCircle className="h-4 w-4 shrink-0" aria-hidden="true" />{error} Previously loaded reviews are still shown.</span><Button type="button" variant="outline" onClick={() => void loadReviews()} disabled={loading} className="min-h-8 border-amber-300 px-2.5 text-[11px] font-bold text-amber-800 hover:bg-amber-100"><RefreshCw className="mr-1 h-3.5 w-3.5" aria-hidden="true" />Retry</Button></div> : null}
      {showInitialLoading ? <ReviewLoadingState /> : error && !hasReviews ? (
        <div className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-8 text-center" role="alert"><AlertCircle className="mx-auto h-7 w-7 text-rose-600" aria-hidden="true" /><h3 className="mt-3 text-[14px] font-extrabold text-rose-900">Unable to load reviews.</h3><p className="mt-1 text-[12px] text-rose-700">Please try again.</p><Button type="button" variant="outline" onClick={() => void loadReviews()} disabled={loading} className="mt-4 min-h-9 border-rose-300 px-3 text-[12px] font-bold text-rose-700 hover:bg-rose-100"><RefreshCw className="mr-1.5 h-3.5 w-3.5" aria-hidden="true" />Retry</Button></div>
      ) : (
        <>
          <ReviewSummary summary={normalizedSummary} reviews={reviews} />
          {isPartialFeed ? <p className="text-[11px] leading-4 text-slate-500">Showing the latest {reviews.length} approved reviews available to this view.</p> : null}
          <div className="rounded-xl border border-slate-200 bg-slate-50/60 p-3">
            <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-[minmax(0,1fr)_150px_155px_auto] lg:items-end">
              <div className="relative min-w-0 sm:col-span-2 lg:col-span-1"><Label htmlFor="storefront-review-search" className="sr-only">Search reviews</Label><Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" aria-hidden="true" /><Input id="storefront-review-search" type="search" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search reviews..." className="h-9 w-full min-w-0 rounded-lg border-slate-200 bg-white pl-9 pr-9 text-[13px]" />{query ? <button type="button" aria-label="Clear review search" onClick={() => setQuery('')} className="absolute right-2 top-1/2 grid h-6 w-6 -translate-y-1/2 place-items-center rounded text-slate-400 hover:bg-slate-100 hover:text-slate-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#1A4E8D]/30"><X className="h-3.5 w-3.5" aria-hidden="true" /></button> : null}</div>
              <label className="grid min-w-0 gap-1"><span className="text-[10px] font-extrabold uppercase tracking-[0.06em] text-[#64748B]">Rating</span><select aria-label="Filter reviews by rating" value={ratingFilter} onChange={(event) => setRatingFilter(event.target.value)} className="h-9 w-full min-w-0 rounded-lg border border-slate-200 bg-white px-2.5 text-[12px] font-semibold text-slate-700 outline-none focus:border-[#1A4E8D] focus:ring-2 focus:ring-[#1A4E8D]/20">{RATING_OPTIONS.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}</select></label>
              <label className="grid min-w-0 gap-1"><span className="text-[10px] font-extrabold uppercase tracking-[0.06em] text-[#64748B]">Date Range</span><select aria-label="Filter reviews by date range" value={dateRange} onChange={(event) => setDateRange(event.target.value)} className="h-9 w-full min-w-0 rounded-lg border border-slate-200 bg-white px-2.5 text-[12px] font-semibold text-slate-700 outline-none focus:border-[#1A4E8D] focus:ring-2 focus:ring-[#1A4E8D]/20">{DATE_RANGE_OPTIONS.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}</select></label>
            </div>
            {dateRange === 'custom' ? <div className="mt-2 grid min-w-0 gap-2 sm:grid-cols-2 lg:max-w-[310px]"><label className="grid min-w-0 gap-1"><span className="text-[10px] font-extrabold uppercase tracking-[0.06em] text-[#64748B]">From</span><Input type="date" aria-label="Review date from" value={customFrom} onChange={(event) => setCustomFrom(event.target.value)} className="h-9 w-full min-w-0 rounded-lg border-slate-200 bg-white text-[13px]" /></label><label className="grid min-w-0 gap-1"><span className="text-[10px] font-extrabold uppercase tracking-[0.06em] text-[#64748B]">To</span><Input type="date" aria-label="Review date to" value={customTo} onChange={(event) => setCustomTo(event.target.value)} className="h-9 w-full min-w-0 rounded-lg border-slate-200 bg-white text-[13px]" /></label></div> : null}
          </div>
          {!hasReviews ? <StorefrontEmptyState icon={Star} title="No reviews yet." description="Customer reviews will appear here once they are submitted through your storefront." className="bg-white py-10" /> : filteredReviews.length === 0 ? <ReviewFilteredEmptyState onClear={clearFilters} /> : <>
            {view === 'list' ? <ReviewList reviews={visibleReviews} hasOrderReferences={hasOrderReferences} /> : <ReviewGrid reviews={visibleReviews} />}
            <PosSettingsPagination
              page={safePage}
              totalPages={totalPages}
              pageSize={pageSize}
              total={filteredReviews.length}
              itemLabel="reviews"
              pageSizeOptions={PAGE_SIZE_OPTIONS}
              pageSizeLabel="Reviews per page"
              pageInputLabel="Go to reviews page"
              previousLabel="Previous reviews page"
              nextLabel="Next reviews page"
              onPageChange={setPage}
              onPageSizeChange={setPageSize}
              disabled={loading}
              className="mt-3"
            />
          </>}
        </>
      )}
    </div>
  );
}
