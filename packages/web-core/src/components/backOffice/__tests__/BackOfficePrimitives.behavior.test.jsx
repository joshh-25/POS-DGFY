/** @vitest-environment jsdom */
import React from 'react';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
    BackOfficeDataTable,
    BackOfficeEmptyState,
    BackOfficeMetric,
    BackOfficeReportDataTable,
    BackOfficeReportMetric,
    BackOfficeReportSectionCard,
    BackOfficeSectionCard,
    BackOfficeStatusPill
} from '../BackOfficePrimitives.jsx';

afterEach(() => cleanup());

describe('Back Office presentation primitives', () => {
    it('preserves the Business Admin card, metric, status, empty, and clickable table contracts', () => {
        const onRowClick = vi.fn();

        render(
            <BackOfficeSectionCard title="Branches" subtitle="Current scope">
                <BackOfficeMetric label="Visible branches" value="2" hint="Active locations" />
                <BackOfficeStatusPill value="in_progress" />
                <BackOfficeDataTable
                    columns={[{ key: 'name', label: 'Branch' }, { key: 'status', label: 'Status' }]}
                    rows={[{ id: 7, name: 'Masu Cafe', status: 'open' }]}
                    onRowClick={onRowClick}
                />
            </BackOfficeSectionCard>
        );

        expect(screen.getByText('Branches')).toBeTruthy();
        expect(screen.getByText('Visible branches')).toBeTruthy();
        expect(screen.getByText('in progress')).toBeTruthy();
        expect(screen.getByText('Masu Cafe')).toBeTruthy();

        fireEvent.click(screen.getByText('Masu Cafe').closest('tr'));
        expect(onRowClick).toHaveBeenCalledWith({ id: 7, name: 'Masu Cafe', status: 'open' });
    });

    it('keeps the responsive Reports presentation in one shared implementation', () => {
        render(
            <BackOfficeReportSectionCard title="Sales trend" actions={<button type="button">Export</button>}>
                <BackOfficeReportMetric label="Net sales" value="₱1,200.00" tone="positive" />
                <BackOfficeReportDataTable
                    columns={[{ key: 'date', label: 'Date' }, { key: 'total', label: 'Total', align: 'right' }]}
                    rows={[{ id: 11, date: '2026-09-21', total: '₱1,200.00' }]}
                />
            </BackOfficeReportSectionCard>
        );

        expect(screen.getByText('Sales trend')).toBeTruthy();
        expect(screen.getByText('Export')).toBeTruthy();
        expect(screen.getByText('Net sales')).toBeTruthy();
        expect(screen.getByRole('table')).toBeTruthy();
        expect(screen.getAllByText('₱1,200.00').length).toBeGreaterThanOrEqual(2);
    });

    it('supports the shared empty state without feature-specific business logic', () => {
        render(<BackOfficeEmptyState message="Nothing is available." />);
        expect(screen.getByText('Nothing is available.')).toBeTruthy();
    });

    it('keeps the primitive variants available for direct consumers', () => {
        render(
            <>
                <BackOfficeMetric label="Admin metric" value="1" />
                <BackOfficeReportMetric label="Report metric" value="2" />
            </>
        );

        expect(screen.getByText('Admin metric')).toBeTruthy();
        expect(screen.getByText('Report metric')).toBeTruthy();
    });
});
