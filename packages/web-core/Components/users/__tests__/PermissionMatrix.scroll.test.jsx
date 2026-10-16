/** @vitest-environment jsdom */
import React from 'react';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import PermissionMatrix from '../PermissionMatrix.jsx';

describe('PermissionMatrix scrolling', () => {
  afterEach(() => cleanup());

  it('keeps an expanded permission group scrollable when its contents exceed the panel height', () => {
    render(
      <PermissionMatrix
        permissions={[]}
        onChange={vi.fn()}
        onMasterAdminChange={vi.fn()}
        permissionGroups={{
          POS: {
            label: 'Point of Sale',
            permissions: Object.fromEntries(
              Array.from({ length: 24 }, (_, index) => [`PERMISSION_${index + 1}`, `pos:test_${index + 1}`])
            )
          }
        }}
      />
    );

    fireEvent.click(screen.getByText('Point of Sale'));

    const contentPanel = screen.getByText('PERMISSION 1').closest('div')?.parentElement;
    expect(contentPanel?.className).toContain('max-h-96');
    expect(contentPanel?.className).toContain('overflow-y-auto');
    expect(contentPanel?.className).not.toContain('overflow-hidden');
  });
});
