// @vitest-environment jsdom

import React from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen, waitFor } from '@testing-library/react';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import StorefrontItemQrCard from '../../../../Components/items/StorefrontItemQrCard.jsx';

vi.mock('qrcode', () => ({
  default: {
    toDataURL: vi.fn(() => Promise.resolve('data:image/png;base64,dGVzdA=='))
  }
}));

const testDirectory = path.dirname(fileURLToPath(import.meta.url));
const workspaceSource = fs.readFileSync(
  path.resolve(testDirectory, '../components/TerminalOperationsWorkspace.jsx'),
  'utf8'
);
const terminalPageSource = fs.readFileSync(
  path.resolve(testDirectory, '../pages/TerminalPage.jsx'),
  'utf8'
);
const qrCardSource = fs.readFileSync(
  path.resolve(testDirectory, '../../../../Components/items/StorefrontItemQrCard.jsx'),
  'utf8'
);

describe('POS customer-facing item QR contract', () => {
  afterEach(() => cleanup());

  it('renders the saved item Storefront QR inside Edit Item', () => {
    expect(terminalPageSource).toContain('store_tenant_slug');
    expect(workspaceSource).toContain('resolveStorefrontItemUrl');
    expect(workspaceSource).toContain('<StorefrontItemQrCard');
    expect(workspaceSource).toContain('itemName={editForm.name || activeEditItem.name}');
    expect(workspaceSource).toContain('itemUrl={activeEditStorefrontUrl}');
    expect(workspaceSource).toContain('compact');
    expect(workspaceSource).toContain('helperText=""');
    expect(workspaceSource).toContain('qrSize={104}');
  });

  it('places the item name above the generated QR code', () => {
    const namePosition = qrCardSource.indexOf('{normalizedItemName}');
    const imagePosition = qrCardSource.indexOf('alt={`${normalizedItemName} Storefront QR code`}');

    expect(namePosition).toBeGreaterThan(-1);
    expect(imagePosition).toBeGreaterThan(namePosition);
    expect(qrCardSource).toContain('Scan to open this item in Storefront View Details.');
    expect(qrCardSource).toContain('const resolvedQrSize');
    expect(qrCardSource).toContain('normalizedHelperText ? (');
  });

  it('keeps QR download and sharing inside the POS item QR component', () => {
    expect(qrCardSource).toContain('function downloadQrImage');
    expect(qrCardSource).toContain('onClick={handleDownload}');
    expect(qrCardSource).toContain('onClick={handleShare}');
    expect(qrCardSource).toContain("title=\"Share QR code\"");
    expect(qrCardSource).toContain('navigator.share');
  });

  it('shows a clear unavailable state instead of a blank panel when the Storefront URL is missing', () => {
    render(React.createElement(StorefrontItemQrCard, {
      itemName: 'Aloo Paratha',
      itemUrl: '',
      compact: true,
      qrSize: 104
    }));

    expect(screen.getByRole('status').textContent).toContain('Storefront QR unavailable');
    expect(screen.getByText('Configure the Storefront URL, then reopen this item.')).toBeTruthy();
  });

  it('renders the generated QR image when the Storefront URL is available', async () => {
    render(React.createElement(StorefrontItemQrCard, {
      itemName: 'Aloo Paratha',
      itemUrl: 'http://localhost:5175/tenant-store/masu-cafe/item?item=12',
      compact: true,
      qrSize: 104
    }));

    await waitFor(() => {
      expect(screen.getByRole('img', { name: 'Aloo Paratha Storefront QR code' })).toBeTruthy();
    });
    expect(screen.getByRole('link', { name: 'Open Storefront item' }).getAttribute('href'))
      .toBe('http://localhost:5175/tenant-store/masu-cafe/item?item=12');
  });
});
