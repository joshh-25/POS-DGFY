/** @vitest-environment jsdom */
// issue #178 final-touch hardening: platform preset/canonical templates are
// unremovable through the curation surface, and the create form no longer
// offers the mislabeled "Canonical preset" checkbox (it was bound to
// is_preset - a platform-owned flag the server no longer accepts from this
// surface at all).
import React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import StoreTemplateManager from '../../../../../apps/dgfy-ims/Pages/admin/StoreTemplateManager.jsx';

const mocks = vi.hoisted(() => ({
  adminService: {
    listStoreTemplates: vi.fn(),
    listStoreTemplateAuditLogs: vi.fn(),
    createStoreTemplateDraft: vi.fn(),
    updateStoreTemplateModules: vi.fn(),
    publishStoreTemplate: vi.fn(),
    deprecateStoreTemplate: vi.fn()
  }
}));

vi.mock('@/services/adminService', () => mocks.adminService);

describe('StoreTemplateManager preset/canonical protection (issue #178 final-touch hardening)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.adminService.listStoreTemplates.mockResolvedValue({
      data: {
        templates: [
          {
            template_id: 1, template_key: 'fnb_full_service', label: 'Full-Service Restaurant',
            base_mode: 'fnb', status: 'published', version: 1, is_preset: true, is_canonical: true,
            modules: ['catalog']
          },
          {
            template_id: 2, template_key: 'fnb_counter_service', label: 'Counter-Service Eatery',
            base_mode: 'fnb', status: 'published', version: 1, is_preset: true, is_canonical: false,
            modules: ['catalog']
          },
          {
            template_id: 3, template_key: 'my_admin_template', label: 'My Admin Template',
            base_mode: 'retail', status: 'published', version: 1, is_preset: false, is_canonical: false,
            modules: ['catalog']
          }
        ]
      }
    });
  });

  afterEach(() => {
    cleanup();
  });

  it('does not offer the create-form preset checkbox', async () => {
    render(<StoreTemplateManager />);
    await screen.findByText('fnb_full_service');

    expect(screen.queryByText('Canonical preset')).toBeNull();
  });

  it('hides Deprecate for canonical and preset rows, and shows it for an admin-authored row', async () => {
    render(<StoreTemplateManager />);
    await screen.findByText('fnb_full_service');

    const canonicalRow = screen.getByText('fnb_full_service').closest('tr');
    const presetRow = screen.getByText('fnb_counter_service').closest('tr');
    const adminRow = screen.getByText('my_admin_template').closest('tr');

    expect(canonicalRow.querySelector('button[class*="destructive"], button')).toBeTruthy();
    expect(Array.from(canonicalRow.querySelectorAll('button')).some((b) => b.textContent === 'Deprecate')).toBe(false);
    expect(Array.from(presetRow.querySelectorAll('button')).some((b) => b.textContent === 'Deprecate')).toBe(false);
    expect(Array.from(adminRow.querySelectorAll('button')).some((b) => b.textContent === 'Deprecate')).toBe(true);

    expect(canonicalRow.textContent).toContain('Platform preset');
    expect(presetRow.textContent).toContain('Platform preset');
  });

  it('surfaces Canonical vs Preset provenance distinctly in the table', async () => {
    render(<StoreTemplateManager />);
    await screen.findByText('fnb_full_service');

    const canonicalRow = screen.getByText('fnb_full_service').closest('tr');
    const presetRow = screen.getByText('fnb_counter_service').closest('tr');
    const adminRow = screen.getByText('my_admin_template').closest('tr');

    expect(canonicalRow.textContent).toContain('Canonical');
    expect(presetRow.textContent).toContain('Preset');
    expect(presetRow.textContent).not.toContain('Canonical');
    expect(adminRow.textContent).not.toContain('Canonical');
    expect(adminRow.textContent).not.toContain('Preset');
  });
});
