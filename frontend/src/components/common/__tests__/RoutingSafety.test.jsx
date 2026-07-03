/** @vitest-environment jsdom */
import React from 'react';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { MemoryRouter, Route, Routes } from 'react-router-dom';

const browserSession = vi.hoisted(() => ({
  getAccessToken: vi.fn(),
  refreshBrowserSession: vi.fn()
}));

vi.mock('../../../services/browserSession.js', () => browserSession);

import ProtectedRoute from '../../ProtectedRoute.jsx';
import LegalDocument from '../../../../Pages/LegalDocument.jsx';

const frontendRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../../../');

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe('routing safety', () => {
  it('shows a visible loading shell while a protected session is being restored', () => {
    browserSession.getAccessToken.mockReturnValue('');
    browserSession.refreshBrowserSession.mockReturnValue(new Promise(() => {}));

    render(
      <MemoryRouter>
        <ProtectedRoute><div>Private content</div></ProtectedRoute>
      </MemoryRouter>
    );

    expect(screen.getByText('Checking your session')).toBeTruthy();
    expect(screen.queryByText('Private content')).toBeNull();
  });

  it('renders an explicit invalid-document state for unknown legal slugs', () => {
    render(
      <MemoryRouter initialEntries={['/legal/not-a-real-document']}>
        <Routes>
          <Route path="/legal/:slug" element={<LegalDocument />} />
        </Routes>
      </MemoryRouter>
    );

    expect(screen.getByRole('heading', { name: 'Legal document not found' })).toBeTruthy();
    expect(screen.queryByRole('heading', { name: 'DGFY Company Registration Terms' })).toBeNull();
  });

  it('keeps navigation capability identifiers aligned with route gates and registers a wildcard route', () => {
    const layout = fs.readFileSync(path.join(frontendRoot, 'Layout.jsx'), 'utf8');
    const main = fs.readFileSync(path.join(frontendRoot, 'src/main.jsx'), 'utf8');

    ['services', 'fnbDining', 'hospitalityReservations'].forEach((capability) => {
      expect(layout).toContain(`requiredCapability: '${capability}'`);
      expect(main).toContain(`requiredCapability="${capability}"`);
    });
    expect(main).toContain('<Route path="*" element={<NotFoundPage />} />');
  });
});
