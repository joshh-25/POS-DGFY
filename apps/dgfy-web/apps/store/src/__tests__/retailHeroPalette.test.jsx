/* @vitest-environment jsdom */
import React from 'react';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { FnbHeroMobileInfoCards } from '../modes/fnb/storefront/components/FnbHeroMobileInfoCards.jsx';
import { FnbHeroMobileOverview } from '../modes/fnb/storefront/components/FnbHeroMobileOverview.jsx';

const retailTheme = {
  accent: '#1A4E8D',
  bodyFont: "'Avenir Next', 'Segoe UI', sans-serif",
  displayFont: "'Avenir Next', 'Segoe UI', sans-serif",
  palette: {
    primary: '#1A4E8D',
    secondary: '#A9DCE8',
    accentSoft: '#EEF4FB',
    pageBackground: '#F8FAFC',
    retailHighlight: '#FF7A1A'
  }
};

const fnbTheme = {
  accent: '#f97316',
  bodyFont: "'Nunito Sans', sans-serif",
  displayFont: "'Bree Serif', serif"
};

const renderOverview = (heroTheme) => render(
  <FnbHeroMobileOverview
    followEnabled={false}
    followState={{}}
    handleFollowAction={vi.fn()}
    heroSectionModel={{
      name: 'Tinda Han',
      tagline: 'Everyday Filipino essentials, close to home.',
      actions: { canCall: true, callHref: 'tel:+639171234567' }
    }}
    heroTheme={heroTheme}
    mobileHeroMetaItems={[]}
    modeAdapter={{ heroDescription: '' }}
    openStorefrontActionLink={vi.fn()}
  />
);

const renderAboutCard = (heroTheme) => render(
  <FnbHeroMobileInfoCards
    aboutText="A neighborhood retail store with everyday essentials and convenient pickup."
    addressText=""
    deliveryPlatformLinks={[]}
    displayHours=""
    galleryImages={[]}
    galleryImagesFull={[]}
    hasAboutSection
    hasAboutToggle
    hasContactRows={false}
    hasGallerySection={false}
    hasMapData={false}
    hasMobileStoreDetailsSummary={false}
    hasWhyChooseUs={false}
    heroTheme={heroTheme}
    mapSelectedKey=""
    mapStores={[]}
    openStorefrontActionLink={vi.fn()}
    selectedBranchLabel=""
    setIsExpandedMapOpen={vi.fn()}
    storefrontCityLabel=""
    visibleContactRows={[]}
    visibleWhyChooseUs={[]}
  />
);

afterEach(cleanup);

describe('retail hero palette isolation', () => {
  it('uses retail blue on mobile hero actions and tagline', () => {
    const { container } = renderOverview(retailTheme);

    const callButton = screen.getByRole('button', { name: 'Call' });
    expect(callButton.style.background).toBe('rgb(26, 78, 141)');
    expect(callButton.style.boxShadow).toBe('0 3px 10px rgba(26,78,141,0.14)');
    expect(screen.getByText('Everyday Filipino essentials, close to home.').style.color).toBe('rgb(26, 78, 141)');
    expect(container.firstElementChild.style.background).toBe('rgb(248, 250, 252)');
  });

  it('uses the retail soft blue treatment on mobile information controls', () => {
    renderAboutCard(retailTheme);

    const aboutCard = screen.getByText('About Us').parentElement;
    const cardsSurface = aboutCard.parentElement;
    const seeMore = screen.getByRole('button', { name: /See more/i });

    expect(aboutCard.style.border).toContain('rgb(169, 220, 232)');
    expect(aboutCard.style.boxShadow).toBe('0 3px 12px rgba(26,78,141,0.05)');
    expect(cardsSurface.style.background).toBe('rgb(248, 250, 252)');
    expect(seeMore.style.color).toBe('rgb(26, 78, 141)');
    expect(seeMore.style.background).toBe('none');
    expect(seeMore.style.borderStyle).toBe('none');
    expect(seeMore.style.fontSize).toBe('12px');
    fireEvent.click(seeMore);
    expect(screen.getByRole('button', { name: /Show less/i })).toBeTruthy();
  });

  it('preserves the existing F&B orange fallback', () => {
    renderOverview(fnbTheme);

    const callButton = screen.getByRole('button', { name: 'Call' });
    expect(callButton.style.background).toBe('rgb(249, 115, 22)');
    expect(callButton.style.boxShadow).toBe('0 10px 24px rgba(234,88,12,0.2)');
    expect(screen.getByText('Everyday Filipino essentials, close to home.').style.color).toBe('rgb(249, 115, 22)');

    cleanup();
    renderAboutCard(fnbTheme);
    const seeMore = screen.getByRole('button', { name: /See more/i });
    expect(seeMore.style.color).toBe('rgb(249, 115, 22)');
    expect(seeMore.style.background).toBe('none');
  });
});
