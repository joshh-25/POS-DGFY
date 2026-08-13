/* @vitest-environment jsdom */
import React from 'react';
import { cleanup, render } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { RetailOrderStoreHeader } from '../modes/retail/checkout/components/RetailOrderStoreHeader.jsx';

const props = {
  brandColor: '#1a4e8d',
  brandShadow: 'rgba(26,78,141,.18)',
  displayFont: 'Arial',
  isDeliveryOrder: true,
  isMobileViewport: false,
  onBack: vi.fn(),
  selectedStore: { tenant_name: 'Tinda Han' },
  textOnBrand: '#fff',
  withAssetOrigin: (value) => value
};

afterEach(cleanup);

describe('RetailOrderStoreHeader', () => {
  it('uses a full-viewport header shell on desktop while retaining centered content', () => {
    const { container } = render(<RetailOrderStoreHeader {...props} isResponsiveFlow={false} />);
    const header = container.querySelector('section');

    expect(header.style.width).toBe('100vw');
    expect(header.style.marginLeft).toBe('calc(50% - 50vw)');
    expect(header.firstElementChild.style.maxWidth).toBe('1240px');
  });

  it('keeps the responsive header constrained to its mobile parent', () => {
    const { container } = render(<RetailOrderStoreHeader {...props} isMobileViewport isResponsiveFlow />);
    const header = container.querySelector('section');

    expect(header.style.width).toBe('100%');
    expect(header.style.marginLeft).toBe('0px');
  });
});
