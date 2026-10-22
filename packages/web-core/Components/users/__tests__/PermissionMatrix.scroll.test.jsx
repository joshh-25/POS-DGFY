/** @vitest-environment jsdom */
import React from 'react';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import PermissionMatrix from '../PermissionMatrix.jsx';

describe('PermissionMatrix presentation', () => {
  afterEach(() => cleanup());

  it('renders all functions immediately in the selected button panel', () => {
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

    fireEvent.click(screen.getByRole('button', { name: /Other \/ Legacy/ }));
    expect(screen.getAllByText('Other / Legacy — Point of Sale').length).toBeGreaterThan(0);
    expect(screen.getByText('Test 1')).toBeTruthy();
    expect(screen.getByText('Test 24')).toBeTruthy();
    expect(screen.queryByText('No buttons match your search.')).toBeNull();
    expect(screen.queryByText('Deselect All')).toBeNull();
  });

  it('preserves child selections when a parent button is disabled', () => {
    function Harness() {
      const [permissions, setPermissions] = React.useState(['items:view', 'items:create']);
      return (
        <PermissionMatrix
          permissions={permissions}
          onChange={setPermissions}
          onMasterAdminChange={vi.fn()}
        />
      );
    }

    render(<Harness />);

    fireEvent.click(screen.getByRole('button', { name: /^Items/ }));
    fireEvent.click(screen.getByRole('switch', { name: 'Enable Items Button' }));

    const addItems = screen.getByRole('checkbox', { name: 'Add Items' });
    expect(addItems.checked).toBe(true);
    expect(addItems.disabled).toBe(true);
  });
});
