import React from 'react';
import { ArrowLeft, MapPin, RefreshCw, Store } from 'lucide-react';

import './StorefrontLoadBoundary.css';

const StorefrontLoadingState = () => (
  <section className="storefront-load-boundary" aria-busy="true" aria-live="polite">
    <div className="storefront-load-boundary__nav">
      <div className="storefront-load-boundary__back-skeleton" aria-hidden="true" />
      <img className="storefront-load-boundary__logo" src="/dgfy-logo.png" alt="DGFY" />
      <div className="storefront-load-boundary__nav-skeleton" aria-hidden="true" />
    </div>

    <div className="storefront-load-boundary__loading-card">
      <span className="storefront-load-boundary__pin" aria-hidden="true">
        <MapPin size={25} strokeWidth={2.25} />
      </span>
      <div>
        <h1>Loading storefront</h1>
        <p>We’re getting the latest store details and items ready for you.</p>
      </div>
      <span className="storefront-load-boundary__spinner" aria-hidden="true" />
    </div>

    <div className="storefront-load-boundary__skeleton" aria-hidden="true">
      <div className="storefront-load-boundary__hero-skeleton" />
      <div className="storefront-load-boundary__content-skeleton">
        <div />
        <div />
        <div />
      </div>
    </div>
    <span className="storefront-load-boundary__sr-only">Loading storefront</span>
  </section>
);

const StorefrontErrorState = ({ errorMessage, onRetry, onBackToDiscovery }) => (
  <section className="storefront-load-boundary storefront-load-boundary--error" role="alert">
    <div className="storefront-load-boundary__error-card">
      <span className="storefront-load-boundary__error-icon" aria-hidden="true">
        <Store size={30} strokeWidth={2} />
      </span>
      <p className="storefront-load-boundary__eyebrow">DGFY STOREFRONT</p>
      <h1>Unable to load this storefront</h1>
      <p className="storefront-load-boundary__error-copy">
        {errorMessage || 'The store details are temporarily unavailable. Please try again.'}
      </p>
      <div className="storefront-load-boundary__actions">
        <button type="button" className="storefront-load-boundary__primary" onClick={onRetry}>
          <RefreshCw size={17} aria-hidden="true" />
          Try Again
        </button>
        <button type="button" className="storefront-load-boundary__secondary" onClick={onBackToDiscovery}>
          <ArrowLeft size={17} aria-hidden="true" />
          Back to Discovery
        </button>
      </div>
    </div>
  </section>
);

export function StorefrontLoadBoundary({
  children,
  errorMessage = '',
  hasStoreProfile,
  isLoading,
  onBackToDiscovery,
  onRetry,
}) {
  if (hasStoreProfile) return children;

  if (errorMessage && !isLoading) {
    return (
      <StorefrontErrorState
        errorMessage={errorMessage}
        onRetry={onRetry}
        onBackToDiscovery={onBackToDiscovery}
      />
    );
  }

  return <StorefrontLoadingState />;
}
