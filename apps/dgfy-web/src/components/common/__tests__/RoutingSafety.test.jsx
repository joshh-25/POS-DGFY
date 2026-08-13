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
import {
  isWorkflowPageVisible,
  isWorkflowPathBlocked,
  modeHasCapability,
  WORKFLOW_PAGE_CAPABILITIES,
  WORKFLOW_ROUTE_CAPABILITIES
} from '../../../features/settings/workflowMode.js';

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

    ['services', 'fnbDining', 'hospitalityReservations', 'productionWorkflows', 'inventory'].forEach((capability) => {
      expect(layout).toContain(`requiredCapability: '${capability}'`);
      expect(main).toContain(`requiredCapability="${capability}"`);
    });
    expect(main).toContain('<Route path="*" element={<NotFoundPage />} />');
  });

  // The assertion above only proves the strings are present. These prove the
  // nav filter actually consumes them: every capability-gated page must be
  // hidden for every mode lacking that capability. Before this, `Layout.jsx`
  // declared `requiredCapability` but the nav filter never read it, so Job
  // Orders and Dispatch Orders rendered — then hard-403'd — in five modes.
  it('hides every capability-gated nav page for modes that lack the capability', () => {
    const modesWithoutProduction = [
      'retail',
      'healthcare',
      'ticketing_transport',
      'logistics_distribution',
      'education_institutions',
      'msme',
      'services',
      'fnb',
      'hospitality'
    ];

    modesWithoutProduction.forEach((mode) => {
      expect(modeHasCapability(mode, 'productionWorkflows')).toBe(false);
      expect(isWorkflowPageVisible('JobOrders', mode)).toBe(false);
      expect(isWorkflowPageVisible('DispatchOrders', mode)).toBe(false);
      expect(isWorkflowPathBlocked('/job-orders', mode)).toBe(true);
      expect(isWorkflowPathBlocked('/dispatch-orders', mode)).toBe(true);
    });

    // Food Manufacturing genuinely holds the capability and keeps both pages.
    expect(isWorkflowPageVisible('JobOrders', 'food_manufacturing')).toBe(true);
    expect(isWorkflowPageVisible('DispatchOrders', 'food_manufacturing')).toBe(true);
    expect(isWorkflowPathBlocked('/job-orders', 'food_manufacturing')).toBe(false);
  });

  it('gates Stock Movements on the same inventory capability its API enforces', () => {
    // backend/src/routes/stockMovements.js requires `inventory`; MSME and
    // Services are the two modes that do not hold it.
    expect(isWorkflowPageVisible('StockMovements', 'msme')).toBe(false);
    expect(isWorkflowPageVisible('StockMovements', 'services')).toBe(false);
    expect(isWorkflowPageVisible('StockMovements', 'retail')).toBe(true);
    expect(isWorkflowPageVisible('StockMovements', 'fnb')).toBe(true);
    expect(isWorkflowPageVisible('StockMovements', 'healthcare')).toBe(true);
  });

  it('keeps every nav item capability declaration in sync with the page/route capability maps', () => {
    const layout = fs.readFileSync(path.join(frontendRoot, 'Layout.jsx'), 'utf8');

    // Global nav pages named in the map must declare the same capability
    // inline. The map also covers workspace-only tabs such as Bookings,
    // Calendar, Providers, Kitchen, and Tables; those do not have independent
    // entries in the consolidated global navigation.
    Object.entries(WORKFLOW_PAGE_CAPABILITIES).forEach(([page, capability]) => {
      if (!layout.includes(`page: '${page}'`)) return;
      expect(layout).toMatch(
        new RegExp(`page: '${page}',[^}]*requiredCapability: '${capability}'`)
      );
    });

    // Page and route maps must cover the same capabilities.
    expect(new Set(Object.values(WORKFLOW_ROUTE_CAPABILITIES)))
      .toEqual(new Set(Object.values(WORKFLOW_PAGE_CAPABILITIES)));
  });
});
