import React from 'react';

import { StorefrontPromoSection as SharedStorefrontPromoSection } from '../../../../shared/components/storefront/sections/StorefrontPromoSection.jsx';
import { StorefrontReviewsSection as SharedStorefrontReviewsSection } from '../../../../shared/components/storefront/sections/StorefrontReviewsSection.jsx';
import { StorefrontFooterSection as SharedStorefrontFooterSection } from '../../../../shared/components/storefront/sections/StorefrontFooterSection.jsx';
import { getStorefrontSocialFooterLinks } from '../../../../features/shared-storefront/utils/storefrontDisplayUtils.jsx';

/**
 * FnbCommunitySection — the F&B storefront community tail: promo section, customer
 * reviews, and footer. Pure view extracted verbatim from StorefrontApp.jsx. The
 * isFnbMode/subpage/model gate stays at the call site.
 */
export function FnbCommunitySection({
  fnbCommunityModel,
  promoSectionModel,
  isMobileViewport,
  viewportWidth,
  modeAdapter,
  checkoutPromoCode,
  onApplyPromo,
  onWriteReview
}) {
  return (
    <>
      <SharedStorefrontPromoSection
        items={promoSectionModel}
        isMobileViewport={isMobileViewport}
        layoutVariant="compact"
        palette="fnb"
        titleFontFamily={modeAdapter.heroTheme?.displayFont}
        bodyFontFamily={modeAdapter.heroTheme?.bodyFont}
        sectionPadding={isMobileViewport ? '20px 0 24px' : '36px 0 40px'}
        contentMaxWidth={1280}
        sectionBackground="#ffffff"
        titleSize={isMobileViewport ? 28 : 36}
        subtitleSize={isMobileViewport ? 14 : 16}
        activePromoCode={checkoutPromoCode}
        onApplyPromo={onApplyPromo}
        collapseSpacing
      />

      <SharedStorefrontReviewsSection
        isMobileViewport={isMobileViewport}
        viewportWidth={viewportWidth}
        title="Customer Reviews"
        subtitle="See what diners are saying about this menu storefront."
        onWriteReview={onWriteReview}
        reviewHighlights={fnbCommunityModel.reviewHighlights}
        emptyMessage="Customer reviews will appear here once this storefront adds review data in SKUpervisor."
        titleFontFamily={modeAdapter.heroTheme?.displayFont}
        bodyFontFamily={modeAdapter.heroTheme?.bodyFont}
        cardVariant="white"
        writeButtonColor="#f97316"
        sectionPadding={isMobileViewport ? '20px 0 24px' : '36px 0 40px'}
        contentMaxWidth={1280}
        titleSize={isMobileViewport ? 28 : 36}
        subtitleSize={isMobileViewport ? 14 : 16}
        collapseSpacing
        starSymbol="*"
      />

      <SharedStorefrontFooterSection
        isMobileViewport={isMobileViewport}
        name={fnbCommunityModel.name}
        registrationYear={fnbCommunityModel.registrationYear}
        description={fnbCommunityModel.tagline || fnbCommunityModel.aboutText || 'Food and beverage storefront powered by SKUpervisor content.'}
        displayFont={modeAdapter.heroTheme?.displayFont}
        bodyFontFamily={modeAdapter.heroTheme?.bodyFont}
        sectionPadding={isMobileViewport ? '28px 16px 24px' : '48px 32px 36px'}
        badgeLinks={getStorefrontSocialFooterLinks(fnbCommunityModel.footerLinks)}
        columns={[
          {
            title: 'Menu Categories',
            items: fnbCommunityModel.menuCategories.slice(0, 5).map((group) => ({ label: group.label })),
            emptyText: 'No categories yet.'
          },
          {
            title: 'Socials',
            items: fnbCommunityModel.footerLinks
              .filter((link) => ['Website', 'Facebook', 'Instagram', 'TikTok', 'Messenger'].includes(link.label))
              .map((link) => ({ label: link.label, href: link.href })),
            emptyText: 'No social links yet.'
          },
          {
            title: 'Contact',
            items: [
              ...fnbCommunityModel.footerLinks
                .filter((link) => ['Call', 'Email'].includes(link.label))
                .map((link) => ({
                  label: link.label === 'Call' ? String(link.href).replace('tel:', '') : String(link.href).replace('mailto:', ''),
                  href: link.href
                })),
              ...(fnbCommunityModel.hours ? [{ label: fnbCommunityModel.hours }] : []),
              { label: fnbCommunityModel.locationLabel }
            ]
          }
        ]}
      />
    </>
  );
}
