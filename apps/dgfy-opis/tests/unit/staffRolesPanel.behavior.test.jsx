/** @vitest-environment jsdom */

import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import StaffRolesPanel from '../../src/features/businessAdmin/StaffRolesPanel.jsx';

const mockApi = vi.hoisted(() => ({
    staffRoles: vi.fn(),
    users: vi.fn(),
    roleCatalog: vi.fn(),
    createStaffRole: vi.fn(),
    updateStaffRole: vi.fn(),
    setStaffRoleStatus: vi.fn(),
    userLocationGrants: vi.fn(),
    assignStaffRole: vi.fn(),
    updateUserLocationGrants: vi.fn()
}));

vi.mock('../../src/features/businessAdmin/businessAdminService.js', () => ({
    businessAdminApi: mockApi,
    getBusinessAdminErrorMessage: (error) => error?.message || 'Request failed'
}));

const roleCatalog = {
    workflow_mode: 'fnb',
    permission_groups: [
        {
            key: 'INVENTORY',
            label: 'Inventory Management',
            permissions: {
                VIEW_ITEMS: 'items:view',
                CREATE_ITEMS: 'items:create'
            }
        },
        {
            key: 'POS',
            label: 'Point of Sale',
            permissions: {
                VIEW_POS: 'pos:view',
                REFUND_TRANSACTION: 'pos:refund',
                TRANSACT_POS: 'pos:transact'
            }
        }
    ]
};

beforeEach(() => {
    mockApi.staffRoles.mockResolvedValue({ roles: [{ staff_role_id: 7, name: 'Cashier', capabilities: ['pos:view'], is_active: true }] });
    mockApi.users.mockResolvedValue([]);
    mockApi.roleCatalog.mockResolvedValue(roleCatalog);
    mockApi.createStaffRole.mockResolvedValue({ role: { staff_role_id: 8 } });
    mockApi.updateStaffRole.mockResolvedValue({});
    mockApi.setStaffRoleStatus.mockResolvedValue({});
    mockApi.userLocationGrants.mockResolvedValue({ locations: [], granted_location_ids: [] });
    mockApi.assignStaffRole.mockResolvedValue({});
    mockApi.updateUserLocationGrants.mockResolvedValue({});
});

afterEach(() => {
    cleanup();
    vi.clearAllMocks();
});

describe('StaffRolesPanel WAPI role editor', () => {
    it('keeps role authoring separate and requires an explicit parent-permission action', async () => {
        render(<StaffRolesPanel canManage onSaved={vi.fn()} />);

        await waitFor(() => expect(screen.getByRole('button', { name: /create new role/i })).toBeTruthy());
        expect(screen.getByRole('heading', { name: 'Existing roles' })).toBeTruthy();
        expect(screen.getByRole('heading', { name: 'Assign role & branch access' })).toBeTruthy();

        fireEvent.click(screen.getByRole('button', { name: /create new role/i }));
        expect(screen.getByRole('heading', { name: 'Create new role' })).toBeTruthy();
        expect(screen.queryByRole('heading', { name: 'Assign role & branch access' })).toBeNull();

        const search = screen.getByRole('searchbox', { name: 'Search permissions' });
        fireEvent.change(search, { target: { value: 'pos:refund' } });
        expect(screen.getByRole('checkbox', { name: 'Process Refunds' })).toBeTruthy();
        fireEvent.click(screen.getByRole('checkbox', { name: 'Process Refunds' }));
        expect(screen.getByText(/Some selected actions need parent access/i)).toBeTruthy();
        expect(screen.getByRole('button', { name: 'Add required permissions' })).toBeTruthy();

        fireEvent.change(search, { target: { value: '' } });
        expect(screen.getByRole('checkbox', { name: 'View POS' }).checked).toBe(false);
        fireEvent.click(screen.getByRole('button', { name: 'Add required permissions' }));
        expect(screen.getByRole('checkbox', { name: 'View POS' }).checked).toBe(true);

        fireEvent.change(screen.getByRole('textbox', { name: 'Role name' }), { target: { value: 'Refund specialist' } });
        fireEvent.click(screen.getByRole('button', { name: 'Create role' }));

        await waitFor(() => expect(mockApi.createStaffRole).toHaveBeenCalledWith({
            name: 'Refund specialist',
            capabilities: ['pos:refund', 'pos:view'],
            is_active: true
        }));
        await waitFor(() => expect(screen.getByRole('button', { name: /create new role/i })).toBeTruthy());
    });

    it('preserves the existing role status controls and sends edit payloads without status changes', async () => {
        render(<StaffRolesPanel canManage onSaved={vi.fn()} />);
        await waitFor(() => expect(screen.getByRole('button', { name: 'Deactivate' })).toBeTruthy());

        fireEvent.click(screen.getByRole('button', { name: 'Edit' }));
        expect(screen.getByRole('heading', { name: 'Edit role' })).toBeTruthy();
        fireEvent.change(screen.getByRole('textbox', { name: 'Role name' }), { target: { value: 'Updated cashier' } });
        fireEvent.click(screen.getByRole('button', { name: 'Save changes' }));

        await waitFor(() => expect(mockApi.updateStaffRole).toHaveBeenCalledWith(7, {
            name: 'Updated cashier',
            capabilities: ['pos:view']
        }));
        expect(mockApi.setStaffRoleStatus).not.toHaveBeenCalled();
    });
});
