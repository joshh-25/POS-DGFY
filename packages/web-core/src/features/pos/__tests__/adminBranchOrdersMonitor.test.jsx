// @vitest-environment jsdom
import React from 'react';
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import AdminBranchOrdersMonitor from '../components/AdminBranchOrdersMonitor.jsx';

afterEach(() => cleanup());

describe('AdminBranchOrdersMonitor', () => {
    const order = {
        pos_transaction_id: 42,
        customer_name: 'Hendry Sy',
        tracking_pin: 'SK-0WJ6Z2',
        fulfillment_status: 'out_for_delivery',
        order_method: 'pickup',
        payment_status: 'unpaid',
        created_at: '2026-08-13T13:39:15.000Z'
    };

    it('renders active branch orders in the Cashier History table style without dropping order details', () => {
        render(
            <AdminBranchOrdersMonitor
                orders={[order]}
                branchName="Tinda Han"
                formatDateTime={(value) => `formatted ${value}`}
                refreshAction={<button type="button" aria-label="Refresh branch activity">Refresh</button>}
            />
        );

        const monitor = screen.getByTestId('pos-admin-branch-order-monitor');
        const table = screen.getByRole('table', { name: 'Active online orders for Tinda Han' });
        const tableRegion = screen.getByRole('region', { name: 'Branch orders table' });
        const mobileView = screen.getByTestId('pos-admin-branch-orders-mobile-view');
        const heading = screen.getByRole('heading', { name: 'Active Orders' });
        const headerLayout = screen.getByTestId('pos-admin-branch-monitor-header');
        const refreshButton = within(headerLayout).getByRole('button', { name: 'Refresh branch activity' });

        expect(monitor.classList.contains('min-w-0')).toBe(true);
        expect(monitor.classList.contains('border')).toBe(false);
        expect(monitor.classList.contains('bg-slate-50')).toBe(false);
        expect(monitor.classList.contains('p-3')).toBe(false);
        expect(monitor.classList.contains('rounded-lg')).toBe(false);
        expect(headerLayout.className).toContain('justify-between');
        expect(headerLayout.contains(heading)).toBe(true);
        expect(headerLayout.contains(refreshButton)).toBe(true);
        expect(heading.className).toContain('text-xl');
        expect(table).toBeTruthy();
        expect(tableRegion).toBeTruthy();
        expect(tableRegion.classList.contains('border')).toBe(true);
        expect(tableRegion.classList.contains('rounded-xl')).toBe(true);
        expect(tableRegion.className).toContain('mt-3');
        ['Order', 'Fulfillment', 'Method', 'Payment', 'Created At'].forEach((label) => {
            expect(within(table).getByRole('columnheader', { name: label })).toBeTruthy();
        });
        expect(within(mobileView).getByText('Hendry Sy')).toBeTruthy();
        expect(within(mobileView).getByText('SK-0WJ6Z2')).toBeTruthy();
        expect(within(mobileView).getByText('out for delivery')).toBeTruthy();
        expect(within(mobileView).getByText('unpaid')).toBeTruthy();
        expect(within(table).getByText('pickup')).toBeTruthy();
        expect(within(table).getByText(`formatted ${order.created_at}`)).toBeTruthy();

        fireEvent.click(within(mobileView).getByRole('button', { name: 'Show details for SK-0WJ6Z2' }));
        const details = within(mobileView).getByRole('region', { name: 'Additional details for SK-0WJ6Z2' });
        expect(within(details).getByText('pickup')).toBeTruthy();
        expect(within(details).getByText(`formatted ${order.created_at}`)).toBeTruthy();

        expect(table.className).toContain('min-w-[780px]');
        expect(tableRegion.className).toContain('overflow-x-auto');
        expect(tableRegion.tabIndex).toBe(0);
        expect(screen.getByText('Scroll horizontally to view all columns.')).toBeTruthy();
    });

    it('does not create a duplicate refresh action when none is provided', () => {
        render(<AdminBranchOrdersMonitor orders={[order]} />);
        expect(screen.queryByRole('button', { name: 'Refresh' })).toBeNull();
    });

    it('keeps loading, error, and empty states visible', () => {
        const { rerender } = render(<AdminBranchOrdersMonitor loading />);
        expect(screen.getByRole('status').textContent).toBe('Loading orders…');

        rerender(<AdminBranchOrdersMonitor errorMessage="Could not load branch orders." />);
        expect(screen.getByRole('alert').textContent).toBe('Could not load branch orders.');
        expect(screen.queryByText('No active online orders for Selected branch.')).toBeNull();

        rerender(<AdminBranchOrdersMonitor branchName="Tinda Han" />);
        expect(screen.getByText('No active online orders for Tinda Han.')).toBeTruthy();
        expect(screen.queryByRole('table')).toBeNull();
    });

    it('keeps last orders visible and avoids an empty result when refresh fails', () => {
        render(
            <AdminBranchOrdersMonitor
                orders={[order]}
                branchName="Tinda Han"
                errorMessage="Branch orders are unavailable."
            />
        );

        expect(screen.getByRole('alert').textContent).toContain('Refresh failed — showing last results');
        expect(screen.getByRole('table', { name: 'Active online orders for Tinda Han' })).toBeTruthy();
        expect(within(screen.getByTestId('pos-admin-branch-orders-mobile-view')).getByText('Hendry Sy')).toBeTruthy();
        expect(screen.queryByText('No active online orders for Tinda Han.')).toBeNull();
    });
});
