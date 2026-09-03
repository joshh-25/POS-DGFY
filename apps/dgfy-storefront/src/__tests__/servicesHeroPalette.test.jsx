/* @vitest-environment jsdom */
import React from 'react';
import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { FnbHeroBrandingSection } from '../modes/fnb/storefront/components/FnbHeroBrandingSection.jsx';
import { FnbHeroDesktopContactLocation } from '../modes/fnb/storefront/components/FnbHeroDesktopContactLocation.jsx';
import { FnbHeroDesktopWhyChooseUs } from '../modes/fnb/storefront/components/FnbHeroDesktopWhyChooseUs.jsx';
import { FnbHeroMobileInfoCards } from '../modes/fnb/storefront/components/FnbHeroMobileInfoCards.jsx';
import { FnbHeroMobileOverview } from '../modes/fnb/storefront/components/FnbHeroMobileOverview.jsx';
import { SERVICES_PALETTE } from '../modes/services/servicesPalette.js';

const servicesTheme = {
  accent: SERVICES_PALETTE.primary,
  accentDark: SERVICES_PALETTE.primaryDark,
  accentSoft: SERVICES_PALETTE.primarySoft,
  accentShadow: SERVICES_PALETTE.primaryShadow,
  bodyFont: "'Avenir Next', 'Segoe UI', sans-serif",
  displayFont: "'Avenir Next', 'Segoe UI', sans-serif",
  directionsColor: SERVICES_PALETTE.primary,
  followActiveColor: SERVICES_PALETTE.success,
  followColor: SERVICES_PALETTE.primary,
  surface: SERVICES_PALETTE.textPrimary,
  taglineColor: SERVICES_PALETTE.primaryLight
};

const baseHeroSectionModel = {
  actions: {
    canCall: true,
    callHref: 'tel:+639991234567'
  },
  coverImageSources: [],
  coverImageUrl: '',
  name: "Ralph's AC Solutions",
  orderLabel: 'Browse Services',
  profileImageSources: [],
  profileImageUrl: '',
  statusLabel: 'Open',
  tagline: 'Comfort at home, scheduled around you.'
};

const baseHeroStyles = {
  HERO_CANVAS_MAX_WIDTH: 1280,
  STYLES: {
    colors: { brandDark: SERVICES_PALETTE.primaryDark, dark: SERVICES_PALETTE.textPrimary },
    shadow: { lg: 'none' }
  }
};

const renderMobileOverview = () => render(
  <FnbHeroMobileOverview
    followEnabled
    followState={{ isFollowing: false, loading: false }}
    handleFollowAction={vi.fn()}
    heroSectionModel={baseHeroSectionModel}
    heroTheme={servicesTheme}
    mobileHeroMetaItems={[]}
    modeAdapter={{ heroDescription: '' }}
    openStorefrontActionLink={vi.fn()}
  />
);

afterEach(cleanup);

describe('Services storefront hero palette', () => {
  it('uses the Services palette for desktop hero accents and follow state', () => {
    render(
      <FnbHeroBrandingSection
        {...baseHeroStyles}
        desktopHeroMetaItems={[]}
        fnbViewModel={{}}
        followEnabled
        followState={{ isFollowing: false, loading: false }}
        handleFollowAction={vi.fn()}
        heroSectionModel={baseHeroSectionModel}
        heroShadow="none"
        heroTheme={servicesTheme}
        isBrandingImageBlocked={() => false}
        isMobileViewport={false}
        markBrandingImageError={vi.fn()}
        modeAdapter={{ heroDescription: '' }}
        onBrowseMenu={vi.fn()}
        openStorefrontActionLink={vi.fn()}
        profileImageKey="profile"
        selectedStore={{ slug: 'ralph-s-ac-solutions-8143ba', storefront_open: true }}
        shareEnabled={false}
        storefrontShareUrl=""
      />
    );

    const followButton = screen.getByRole('button', { name: 'Follow this storefront' });
    const followBadge = followButton.querySelector('span').lastElementChild;
    expect(getComputedStyle(followBadge).backgroundColor).toBe('rgb(26, 78, 141)');
    expect(screen.getByText(baseHeroSectionModel.tagline).style.color).toBe('rgb(174, 232, 244)');
    expect(screen.getByRole('button', { name: 'Browse Services' }).style.boxShadow).toBe('0 10px 25px rgba(26,78,141,0.24)');
  });

  it('uses Services blue for desktop directions and Why Choose Us accents', () => {
    render(
      <FnbHeroDesktopContactLocation
        {...baseHeroStyles}
        STOREFRONT_CONTACT_INFO_COLUMNS='1fr'
        STOREFRONT_INFO_ICON_COLUMN={28}
        STOREFRONT_INFO_ROW_GAP={10}
        StorefrontExpandableBusinessHours={() => null}
        deliveryPlatformLinks={[]}
        hasAboutOrGallerySection={false}
        hasContactRows
        hasMapData={false}
        heroTheme={servicesTheme}
        mapSelectedKey=""
        mapStores={[]}
        openStorefrontActionLink={vi.fn()}
        setIsExpandedMapOpen={vi.fn()}
        visibleContactRows={[{
          actionHref: 'https://maps.example.test',
          actionLabel: 'Get directions',
          label: 'Address',
          value: 'General Luna Avenue'
        }]}
      />
    );
    expect(screen.getByRole('button', { name: 'Get directions' }).style.color).toBe('rgb(26, 78, 141)');

    cleanup();
    const { container } = render(
      <FnbHeroDesktopWhyChooseUs
        {...baseHeroStyles}
        heroTheme={servicesTheme}
        visibleWhyChooseUs={['Clear service durations and rates.']}
      />
    );
    const icon = container.querySelector('svg').parentElement;
    expect(icon.style.background).toBe('rgb(238, 246, 253)');
    expect(icon.style.color).toBe('rgb(26, 78, 141)');
  });

  it('uses the Services palette in mobile overview and information cards', () => {
    renderMobileOverview();

    expect(screen.getByRole('button', { name: 'Call' }).style.boxShadow).toBe('0 10px 24px rgba(26,78,141,0.24)');
    expect(screen.getByText(baseHeroSectionModel.tagline).style.color).toBe('rgb(174, 232, 244)');
    const followButton = screen.getByRole('button', { name: 'Follow this storefront' });
    const followBadge = followButton.querySelector('span').lastElementChild;
    expect(getComputedStyle(followBadge).backgroundColor).toBe('rgb(26, 78, 141)');

    cleanup();
    render(
      <FnbHeroMobileInfoCards
        aboutText="Service details"
        addressText=""
        deliveryPlatformLinks={[]}
        displayHours=""
        galleryImages={[]}
        galleryImagesFull={[]}
        hasAboutSection
        hasAboutToggle={false}
        hasContactRows={false}
        hasGallerySection={false}
        hasMapData={false}
        hasMobileStoreDetailsSummary={false}
        hasWhyChooseUs
        heroTheme={servicesTheme}
        modeAdapter={{}}
        mapSelectedKey=""
        mapStores={[]}
        openStorefrontActionLink={vi.fn()}
        selectedBranchLabel=""
        setIsExpandedMapOpen={vi.fn()}
        storefrontCityLabel=""
        visibleContactRows={[]}
        visibleWhyChooseUs={['A technician visits your address.']}
      />
    );
    const infoIcon = [...document.querySelectorAll('svg')].find((node) => node.parentElement?.style.background === 'rgb(238, 246, 253)')?.parentElement;
    expect(infoIcon).toBeTruthy();
  });
});
