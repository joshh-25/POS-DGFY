/** @vitest-environment jsdom */

import React from 'react';
import { afterEach, describe, expect, it } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import PosActivityAnalyticsPage from '../../src/features/businessAdmin/PosActivityAnalyticsPage.jsx';

afterEach(() => {
    cleanup();
});

const buildPayload = (overrides = {}) => ({
    daily: [
        { business_date: '2026-09-28', weekday: 0, weekday_label: 'Monday', sale_count: 12, payment_total: 5400 },
        { business_date: '2026-09-29', weekday: 1, weekday_label: 'Tuesday', sale_count: 0, payment_total: 0 }
    ],
    totals: { qualifying_sales: 12, payment_total: 5400 },
    customers: { distinct_linked_customers: 7, unlinked_transaction_count: 5 },
    weekday_hour_profile: [],
    quiet_periods: [
        { rank: 1, weekday: 1, weekday_label: 'Tuesday', hour: 3, hour_label: '3 AM', sale_count: 0, payment_total: 0, distinct_customer_count: 0, occurrences: 4, avg_sales_per_occurrence: 0 }
    ],
    meta: { as_of: '2026-09-30T00:00:00.000Z', timezone: 'Asia/Manila', source: 'pos_transaction_operational_ledger', date_from: '2026-09-28', date_to: '2026-09-29', branch_id: null, scope: 'all' },
    definitions: {
        qualifying_sale: 'One completed POS transaction with payment_status paid.',
        excluded: 'Voided and refund-related activity is excluded.',
        distinct_linked_customers: 'Explicit tenant profile links only.',
        quiet_periods: 'Ranked by average qualifying sales per weekday occurrence.'
    },
    guidance: {
        operating_hours_unknown: 'Branch operating schedules are not known.',
        historical_only: 'Historical activity only; not a live safety signal.',
        live_safety_excluded: 'Live safety needs terminal and sync state.'
    },
    posthog_role: {
        operational_source: 'Server-side ledger above.',
        exploratory_use: 'PostHog stays exploratory.'
    },
    ...overrides
});

describe('OPIS POS activity analytics workspace (#2193)', () => {
    it('renders daily values, customer counts, and quiet-period guidance labels', () => {
        render(<PosActivityAnalyticsPage data={buildPayload()} />);

        expect(screen.getByTestId('pos-activity-analytics')).toBeTruthy();
        expect(screen.getByText('Daily activity trend')).toBeTruthy();
        expect(screen.getByText('Historically quiet periods')).toBeTruthy();
        expect(screen.getByText('Customer summary')).toBeTruthy();
        expect(screen.getByText('Metric definitions')).toBeTruthy();
        // Daily row values surface in the table.
        expect(screen.getAllByText('2026-09-28').length).toBeGreaterThan(0);
        // Quiet-period explanatory copy is explicit.
        expect(screen.getByText('Planning guidance — not a live safety signal.')).toBeTruthy();
        expect(screen.getByText(/Historical activity only/)).toBeTruthy();
    });

    it('shows an empty state when no qualifying sales exist', () => {
        render(<PosActivityAnalyticsPage data={buildPayload({
            daily: [],
            totals: { qualifying_sales: 0, payment_total: 0 },
            quiet_periods: []
        })} />);

        expect(screen.getByText('No completed, paid POS sales were recorded for these filters.')).toBeTruthy();
        expect(screen.getByText(/No quiet-period guidance for this range/)).toBeTruthy();
    });

    it('never presents a live deployment-safe status', () => {
        const { container } = render(<PosActivityAnalyticsPage data={buildPayload()} />);
        const text = container.textContent || '';
        expect(text.toLowerCase()).not.toContain('safe to deploy');
        expect(text.toLowerCase()).not.toContain('deployment safe');
        expect(text).toContain('not a live safety signal');
    });

    it('renders an unavailable state without payload data', () => {
        render(<PosActivityAnalyticsPage data={null} />);
        expect(screen.getByText('POS activity analytics are unavailable for these filters.')).toBeTruthy();
    });
});
