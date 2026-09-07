/* @vitest-environment jsdom */
import React from 'react';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import { StorefrontBusinessInformationPanel } from './StorefrontBusinessInformationPanel.jsx';

vi.mock('../../../discovery/components/StoresMapLazy.jsx', () => ({
  StoresMap: () => <div data-testid="mock-store-map" />
}));

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

const longAbout = 'Casa Amara is a warm and elegant restaurant serving flavorful Filipino favorites, grilled dishes, pasta, and desserts. We create satisfying meals in a comfortable place made for family, friends, and neighbors.';

function mockDescriptionOverflow() {
  const originalGetComputedStyle = window.getComputedStyle;
  vi.spyOn(window, 'getComputedStyle').mockImplementation((element, pseudoElement) => {
    const style = originalGetComputedStyle.call(window, element, pseudoElement);
    Object.defineProperty(style, 'lineHeight', { configurable: true, value: '22px' });
    return style;
  });
  vi.spyOn(HTMLElement.prototype, 'scrollHeight', 'get').mockReturnValue(88);
}

const baseProps = {
  aboutText: longAbout,
  galleryImages: ['https://example.test/one.jpg', 'https://example.test/two.jpg'],
  galleryImagesFull: ['https://example.test/one.jpg', 'https://example.test/two.jpg', 'https://example.test/three.jpg'],
  galleryOverflowCount: 1,
  mapStores: [{ id: 'store-1' }],
  visibleContactRows: [
    { label: 'Call', value: '+63 900 000 0000', href: 'tel:+639000000000' },
    { label: 'Hours', value: 'Open now' }
  ],
  visibleWhyChooseUs: ['Configured reason one', 'Configured reason two', 'Configured reason three'],
  palette: { accent: '#1a4e8d', accentSoft: '#e8f1fb', bodyFont: 'Inter, sans-serif' },
  selectedBranchLabel: 'Tabuc Suba',
  storeName: 'Configured Store'
};

it('owns the shared desktop card width, layout, configured content, and palette accent', () => {
  mockDescriptionOverflow();
  render(<StorefrontBusinessInformationPanel {...baseProps} />);

  const panel = screen.getByTestId('storefront-business-information-panel');
  expect(panel.style.maxWidth).toBe('1320px');
  expect(panel.style.padding).toBe('24px');
  expect(panel.style.gap).toBe('24px');
  expect(screen.getByText('Configured reason one')).toBeTruthy();
  expect(screen.queryByText('products currently available')).toBeNull();

  const seeMore = screen.getByRole('button', { name: 'See More' });
  expect(seeMore).toBeTruthy();
  expect(screen.getByText('About Us').style.fontSize).toBe('13px');
  expect(screen.getByText('Why Choose Us?')).toBeTruthy();
  expect(screen.getByTestId('storefront-contact-location-layout').style.gridTemplateColumns).toBe('minmax(0, 0.96fr) minmax(248px, 1.04fr)');
  expect(screen.getByTestId('storefront-business-information-map')).toBeTruthy();
  expect(screen.getByText('Configured reason one').previousSibling.style.background).toBe('rgb(232, 241, 251)');
});

it('shows the full About description without See More when no gallery is configured', () => {
  mockDescriptionOverflow();
  render(<StorefrontBusinessInformationPanel {...baseProps} galleryImages={[]} galleryImagesFull={[]} galleryOverflowCount={0} />);

  expect(screen.queryByRole('button', { name: 'See More' })).toBeNull();
  expect(screen.getByText(longAbout).getAttribute('data-expanded')).toBe('true');
});

it('keeps the no-gallery full description behavior on mobile', () => {
  mockDescriptionOverflow();
  render(<StorefrontBusinessInformationPanel {...baseProps} isMobileViewport galleryImages={[]} galleryImagesFull={[]} galleryOverflowCount={0} />);

  expect(screen.queryByRole('button', { name: 'See More' })).toBeNull();
  expect(screen.getByText(longAbout).getAttribute('data-expanded')).toBe('true');
});

it('uses the same business-information contract on mobile and keeps configured interactions', () => {
  mockDescriptionOverflow();
  const openAction = vi.fn();
  render(<StorefrontBusinessInformationPanel {...baseProps} isMobileViewport openStorefrontActionLink={openAction} />);

  expect(screen.getByTestId('storefront-business-information-panel')).toBeTruthy();
  expect(screen.getByText('About Us')).toBeTruthy();
  expect(screen.getByText('About Us').style.fontSize).toBe('15px');
  expect(screen.getByText('Contact & Location')).toBeTruthy();
  const aboutLayout = screen.getByTestId('storefront-business-information-about-layout');
  expect(aboutLayout.style.gridTemplateColumns).toBe('minmax(0, 1fr) 88px');
  expect(aboutLayout.style.gap).toBe('10px');
  expect(screen.getByText(longAbout).parentElement.parentElement.style.marginTop).toBe('4px');
  const galleryPreview = screen.getByRole('button', { name: 'View store photos' });
  expect(galleryPreview.style.gridRow).toBe('2');
  expect(galleryPreview.style.marginTop).toBe('4px');
  expect(screen.getByText('Tabuc Suba')).toBeTruthy();
  expect(screen.getByText('Why Choose Us?')).toBeTruthy();
  fireEvent.click(galleryPreview);
  expect(screen.getByRole('dialog', { name: 'Store gallery viewer' })).toBeTruthy();
  expect(screen.getByTestId('storefront-gallery-lightbox-counter').textContent).toBe('1 / 3');
  fireEvent.click(screen.getByRole('button', { name: 'Close image viewer' }));
  fireEvent.click(screen.getByRole('button', { name: /\+63 900/ }));
  expect(openAction).toHaveBeenCalledWith('tel:+639000000000');
  fireEvent.click(screen.getByRole('button', { name: 'See all' }));
  expect(screen.getByText('Configured reason three')).toBeTruthy();
});
