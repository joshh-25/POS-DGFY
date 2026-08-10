import React from 'react';
import {
  ArrowLeft,
  ChefHat,
  Loader2,
  RefreshCw,
} from 'lucide-react';
import { FnbProductReviewsSection } from '../components/FnbProductReviewsSection.jsx';
import { FnbRecommendedPairings } from '../components/FnbRecommendedPairings.jsx';
import { ProductModifierGroups } from '../../../../shared/components/storefront/ProductModifierGroups.jsx';
import { FnbProductDesktopPurchasePanel } from '../components/FnbProductDesktopPurchasePanel.jsx';
import { FnbProductMobilePurchaseSummary } from '../components/FnbProductMobilePurchaseSummary.jsx';
import { FnbProductMediaGallery } from '../components/FnbProductMediaGallery.jsx';
import { FnbProductInfoHeader } from '../components/FnbProductInfoHeader.jsx';
import { FnbProductPriceQuantitySelector } from '../components/FnbProductPriceQuantitySelector.jsx';
import { FnbProductNavigationHeader } from '../components/FnbProductNavigationHeader.jsx';
import { FnbProductNutritionAllergens } from '../components/FnbProductNutritionAllergens.jsx';
import { resolveStorefrontImageSources } from '../../../../shared/utils/storefrontImageSources.js';

const FNB_DISPLAY_FONT = '"Outfit", "Avenir Next", "Segoe UI", sans-serif';
const FNB_BODY_FONT = '"Source Sans 3", "Segoe UI", sans-serif';

const money = (value) => `PHP ${Number(value || 0).toFixed(2)}`;

/* --- Button base (shared) --- */
const actionButtonBase = {
  fontFamily: FNB_BODY_FONT,
  minHeight: 46,
  borderRadius: 18,
  fontSize: 16,
  fontWeight: 800,
  cursor: 'pointer',
  display: 'inline-flex',
  alignItems: 'center',
  justifyContent: 'center',
  gap: 8,
  padding: '0 24px',
  transition: 'all 200ms cubic-bezier(0.16, 1, 0.3, 1)',
  letterSpacing: '0.01em'
};

function FnbProductDetailsState({
  description,
  icon,
  iconBackground,
  iconBorder,
  iconColor,
  isMobileViewport,
  primaryAction = null,
  primaryLabel = '',
  secondaryAction = null,
  secondaryLabel = '',
  title,
  type = 'status'
}) {
  return (
    <section style={{
      fontFamily: FNB_BODY_FONT,
      width: '100vw',
      marginLeft: 'calc(50% - 50vw)',
      background: '#ffffff',
      minHeight: '100vh',
      padding: isMobileViewport ? '32px 16px 48px' : '56px 24px 72px',
      boxSizing: 'border-box'
    }}>
      <div
        aria-live={type === 'alert' ? 'assertive' : 'polite'}
        aria-busy={type === 'loading' ? 'true' : undefined}
        role={type === 'alert' ? 'alert' : 'status'}
        style={{
          maxWidth: 920,
          margin: '0 auto',
          border: '1px solid rgba(226, 232, 240, 0.8)',
          borderRadius: 28,
          background: '#fff',
          padding: isMobileViewport ? 24 : 40,
          display: 'grid',
          gap: 16,
          boxShadow: '0 20px 48px rgba(15,23,42,0.04)'
        }}
      >
        <div style={{
          width: 56,
          height: 56,
          borderRadius: 18,
          background: iconBackground,
          color: iconColor,
          display: 'grid',
          placeItems: 'center',
          border: `1px solid ${iconBorder}`
        }}>
          {icon}
        </div>
        <h2 style={{
          margin: 0,
          fontSize: isMobileViewport ? 28 : 36,
          lineHeight: 1.05,
          fontWeight: 900,
          color: '#0f172a',
          fontFamily: FNB_DISPLAY_FONT
        }}>
          {title}
        </h2>
        <p style={{
          margin: 0,
          maxWidth: 560,
          fontSize: 16,
          lineHeight: 1.65,
          color: '#475569'
        }}>
          {description}
        </p>
        {(primaryAction || secondaryAction) && (
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10 }}>
            {primaryAction && (
              <button
                type="button"
                onClick={primaryAction}
                style={{
                  ...actionButtonBase,
                  minHeight: 48,
                  border: 'none',
                  background: '#22C55E',
                  color: '#fff',
                  boxShadow: '0 14px 28px rgba(34,197,94,0.24)'
                }}
              >
                {primaryLabel}
              </button>
            )}
            {secondaryAction && (
              <button
                type="button"
                onClick={secondaryAction}
                style={{
                  ...actionButtonBase,
                  minHeight: 48,
                  border: '1px solid #cbd5e1',
                  background: '#fff',
                  color: '#334155'
                }}
              >
                {secondaryLabel}
              </button>
            )}
          </div>
        )}
      </div>
    </section>
  );
}

export function FnbProductDetailsPage({
  item,
  loading = false,
  loadError = '',
  onRetry = null,
  storeName,
  storeLogoUrl,
  branchLabel,
  onBack,
  quantity,
  setQuantity,
  selectedModifiers,
  modifierGroups,
  modifierCounts,
  onToggleModifier,
  onAddToCart,
  onBuyNow,
  available,
  unitPrice,
  totalPrice,
  nutritionCards,
  allergens,
  relatedItems,
  onSelectRelatedItem,
  onQuickAdd,
  isMobileViewport,
  ratingScore = null,
  reviewCount = null,
  reviewDistribution = null,
  reviews = [],
  reviewsLoading = false,
  canWriteReview = false,
  onOpenWriteReview = null,
  reviewSectionHighlighted = false
}) {
  const [isMobileSummaryOpen, setIsMobileSummaryOpen] = React.useState(false);
  const [expandedGroups, setExpandedGroups] = React.useState(() => {
    const initial = {};
    if (Array.isArray(modifierGroups) && modifierGroups.length > 0) {
      initial[modifierGroups[0].modifier_group_id] = true;
    }
    return initial;
  });

  if (!item && loading) {
    return (
      <FnbProductDetailsState
        description="Please wait while we confirm that this item exists and is available in the current storefront catalog."
        icon={<Loader2 className="animate-spin" size={24} />}
        iconBackground="#eff6ff"
        iconBorder="#bfdbfe"
        iconColor="#2563eb"
        isMobileViewport={isMobileViewport}
        title="Checking item availability..."
        type="loading"
      />
    );
  }

  if (!item && loadError) {
    return (
      <FnbProductDetailsState
        description="We could not load the latest item information. Try again, or return to the menu."
        icon={<RefreshCw size={24} />}
        iconBackground="#fef2f2"
        iconBorder="#fecaca"
        iconColor="#dc2626"
        isMobileViewport={isMobileViewport}
        primaryAction={onRetry}
        primaryLabel={<><RefreshCw size={16} /> Try Again</>}
        secondaryAction={onBack}
        secondaryLabel={<><ArrowLeft size={16} /> Back to Menu</>}
        title="Unable to load item"
        type="alert"
      />
    );
  }

  if (!item) {
    return (
      <FnbProductDetailsState
        description="The item link is valid but the product is no longer available in the current storefront catalog."
        icon={<ChefHat size={24} />}
        iconBackground="#fff"
        iconBorder="#fed7aa"
        iconColor="#f97316"
        isMobileViewport={isMobileViewport}
        primaryAction={onBack}
        primaryLabel={<><ArrowLeft size={16} /> Back to Menu</>}
        title="Item not available"
      />
    );
  }

  /* --- Derived display values --- */
  const imageSources = resolveStorefrontImageSources(item, { preferred: 'large' });
  const imageUrl = imageSources.src;
  const description = String(item.descriptionPreview || item.description || '').trim();
  const sectionLabel = String(item.sectionLabel || item.folder_name || item.category || 'Menu').trim();
  const availabilityLabel = String(item.inventory_display?.label || (available ? 'Available' : 'Availability not provided')).trim();

  const selectedModifiersTotal = Array.isArray(selectedModifiers)
    ? selectedModifiers.reduce((sum, entry) => sum + Number(entry?.price_delta || 0), 0)
    : 0;

  const desktopSummaryTop = isMobileViewport ? 'auto' : 88;
  const hasModifiers = Array.isArray(modifierGroups) && modifierGroups.length > 0;
  const reviewEntries = Array.isArray(reviews) ? reviews : [];
  const serviceFee = 0;
  const safeQuantity = Math.max(1, Number(quantity || 1));
  const subtotalPrice = Number(unitPrice || 0) * safeQuantity;

  const renderRecommendedPairings = () => (
    <FnbRecommendedPairings
      formatMoney={money}
      isMobileViewport={isMobileViewport}
      onQuickAdd={onQuickAdd}
      onSelectRelatedItem={onSelectRelatedItem}
      relatedItems={relatedItems}
    />
  );

  const renderReviewsSection = () => (
    <FnbProductReviewsSection
      actionButtonBase={actionButtonBase}
      canWriteReview={canWriteReview}
      isMobileViewport={isMobileViewport}
      onOpenWriteReview={onOpenWriteReview}
      ratingScore={ratingScore}
      reviewCount={reviewCount}
      reviewDistribution={reviewDistribution}
      reviewEntries={reviewEntries}
      reviewSectionHighlighted={reviewSectionHighlighted}
      reviewsLoading={reviewsLoading}
    />
  );
  /* --- Spacing tokens (8px grid) --- */
  const sp = (n) => n * 8;

  const toggleGroupExpand = (groupId) => {
    setExpandedGroups((prev) => ({ ...prev, [groupId]: !prev[groupId] }));
  };

  const standardImageHeight = isMobileViewport ? 300 : 450;

  return (
    <section style={{
      fontFamily: FNB_BODY_FONT,
      width: '100vw',
      marginLeft: 'calc(50% - 50vw)',
      background: '#ffffff',
      minHeight: '100vh',
      paddingBottom: isMobileViewport ? 140 : 64,
      boxSizing: 'border-box'
    }}>

      <FnbProductNavigationHeader
        branchLabel={branchLabel}
        isMobileViewport={isMobileViewport}
        onBack={onBack}
        spacing={sp}
        storeLogoUrl={storeLogoUrl}
        storeName={storeName}
      />

      {/* -- Page content -- */}
      <div style={{
        maxWidth: 1320,
        margin: '0 auto',
        padding: isMobileViewport ? `${sp(2)}px ${sp(2)}px ${sp(5)}px` : `${sp(3)}px ${sp(3)}px ${sp(4)}px`,
        boxSizing: 'border-box'
      }}>

        {/* Breadcrumb */}
        <nav
          aria-label="breadcrumb"
          style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 8, marginBottom: sp(2), fontSize: 12, color: '#64748b', fontWeight: 600 }}
        >
          <span style={{ color: '#64748b' }}>Menu</span>
          <span aria-hidden="true" style={{ color: '#cbd5e1', fontSize: 14 }}>{'>'}</span>
          <span style={{ color: '#64748b' }}>{sectionLabel}</span>
          <span aria-hidden="true" style={{ color: '#cbd5e1', fontSize: 14 }}>{'>'}</span>
          <span style={{ color: '#15803d' }} aria-current="page">{item.name}</span>
        </nav>

        {/* -- Main 2-col grid -- */}
        <div style={{
          display: 'grid',
          gridTemplateColumns: isMobileViewport ? '1fr' : 'minmax(0, 1.05fr) minmax(340px, 0.95fr)',
          gap: isMobileViewport ? sp(2) : sp(4),
          alignItems: 'start'
        }}>

          {/* -- LEFT COLUMN: Image + Info -- */}
          <div style={{ display: 'grid', gap: sp(2) }}>

            <FnbProductMediaGallery
              available={available}
              availabilityLabel={availabilityLabel}
              imageSources={imageSources}
              imageUrl={imageUrl}
              itemName={item.name}
              sectionLabel={sectionLabel}
              standardImageHeight={standardImageHeight}
            />

            {/* Tabbed Switcher for Nutrition & Allergens (Dynamic and completely containerless) */}
            {!isMobileViewport && hasModifiers ? (
              <FnbProductNutritionAllergens allergens={allergens} isMobileViewport={isMobileViewport} nutritionCards={nutritionCards} />
            ) : null}
            {!isMobileViewport && renderRecommendedPairings()}
            {!isMobileViewport && renderReviewsSection()}
          </div>

          {/* -- RIGHT COLUMN: Summary + Sticky Actions (Consolidated clean cardless panel) -- */}
          <div style={{ display: 'grid', gap: sp(2), position: isMobileViewport ? 'static' : 'sticky', top: desktopSummaryTop, alignSelf: 'start' }}>

            <div style={{
              padding: isMobileViewport ? '8px 4px' : '16px 8px',
              display: 'grid',
              gap: sp(2)
            }}>
              <FnbProductInfoHeader
                description={description}
                isMobileViewport={isMobileViewport}
                itemName={item.name}
                ratingScore={ratingScore}
                reviewCount={reviewCount}
                spacing={sp}
              />

              <FnbProductPriceQuantitySelector
                formatMoney={money}
                isMobileViewport={isMobileViewport}
                quantity={quantity}
                setQuantity={setQuantity}
                spacing={sp}
                unitPrice={unitPrice}
              />

              {/* Repositioned Nutrition & Allergens (if no modifiers are present) */}
              {isMobileViewport || !hasModifiers ? (
                <FnbProductNutritionAllergens allergens={allergens} isMobileViewport={isMobileViewport} nutritionCards={nutritionCards} />
              ) : null}


              <ProductModifierGroups
                expandedGroups={expandedGroups}
                formatMoney={money}
                modifierCounts={modifierCounts}
                modifierGroups={modifierGroups}
                onToggleGroup={toggleGroupExpand}
                onToggleModifier={onToggleModifier}
                selectedModifiers={selectedModifiers}
                spacing={sp}
              />

              {isMobileViewport && renderReviewsSection()}

              {isMobileViewport && renderRecommendedPairings()}

              {/* Total + CTA buttons */}
              {!isMobileViewport ? (
                <FnbProductDesktopPurchasePanel
                  actionButtonBase={actionButtonBase}
                  available={available}
                  formatMoney={money}
                  onAddToCart={onAddToCart}
                  onBuyNow={onBuyNow}
                  selectedModifiersTotal={selectedModifiersTotal}
                  totalPrice={totalPrice}
                />
              ) : null}
          </div>
        </div>
      </div>
      </div>

      {isMobileViewport ? (
        <FnbProductMobilePurchaseSummary
          actionButtonBase={actionButtonBase}
          available={available}
          displayFont={FNB_DISPLAY_FONT}
          formatMoney={money}
          imageSources={imageSources}
          isOpen={isMobileSummaryOpen}
          itemName={item.name}
          onAddToCart={onAddToCart}
          onBuyNow={onBuyNow}
          onClose={() => setIsMobileSummaryOpen(false)}
          onOpen={() => setIsMobileSummaryOpen(true)}
          quantity={safeQuantity}
          selectedModifiersTotal={selectedModifiersTotal}
          serviceFee={serviceFee}
          spacing={sp}
          subtotalPrice={subtotalPrice}
          totalPrice={totalPrice}
        />
      ) : null}
    </section>
  );
}
