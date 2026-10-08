/** @vitest-environment jsdom */

import React from 'react';
import { cleanup, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import CustomerDisplayPage from '../../../../packages/web-core/src/features/pos/pages/CustomerDisplayPage.jsx';
import {
    createCustomerDisplayTransport,
    CUSTOMER_DISPLAY_MESSAGE_TYPES
} from '../../../../packages/web-core/src/features/pos/services/customerDisplaySync.js';

class FakeBroadcastChannel {
    constructor(name) {
        this.name = name;
        this.listeners = new Set();
        if (!FakeBroadcastChannel.channels.has(name)) FakeBroadcastChannel.channels.set(name, new Set());
        FakeBroadcastChannel.channels.get(name).add(this);
    }

    addEventListener(type, listener) {
        if (type === 'message') this.listeners.add(listener);
    }

    removeEventListener(type, listener) {
        if (type === 'message') this.listeners.delete(listener);
    }

    postMessage(data) {
        const peers = FakeBroadcastChannel.channels.get(this.name) || new Set();
        for (const peer of peers) {
            if (peer === this) continue;
            for (const listener of peer.listeners) queueMicrotask(() => listener({ data }));
        }
    }

    close() {
        FakeBroadcastChannel.channels.get(this.name)?.delete(this);
        this.listeners.clear();
    }
}

FakeBroadcastChannel.channels = new Map();

const route = '/customer-display?sessionId=cd-test-session-001&terminalId=COUNTER-01';

beforeEach(() => {
    vi.stubGlobal('BroadcastChannel', FakeBroadcastChannel);
});
afterEach(() => {
    cleanup();
    FakeBroadcastChannel.channels.clear();
    vi.unstubAllGlobals();
});

describe('CustomerDisplayPage', () => {
    it('receives a cashier snapshot, ignores stale revisions, and handles session close', async () => {
        const cashier = createCustomerDisplayTransport({
            role: 'cashier',
            sessionId: 'cd-test-session-001',
            terminalId: 'COUNTER-01',
            onMessage: (message) => {
                if (message.messageType !== CUSTOMER_DISPLAY_MESSAGE_TYPES.READY) return;
                cashier.send(CUSTOMER_DISPLAY_MESSAGE_TYPES.SNAPSHOT, {
                    viewState: 'active',
                    currency: 'PHP',
                    items: [{ key: 'line-0', name: 'Latte', quantity: 2, unitPrice: 145, lineTotal: 290, options: [] }],
                    itemCount: 2,
                    subtotal: 290,
                    discount: 0,
                    serviceFees: 0,
                    total: 290
                }, 2);
            }
        });

        render(
            <MemoryRouter initialEntries={[route]}>
                <Routes>
                    <Route path="/customer-display" element={<CustomerDisplayPage />} />
                </Routes>
            </MemoryRouter>
        );

        await waitFor(() => expect(screen.getByTestId('customer-display-state').getAttribute('data-state')).toBe('active'));
        expect(screen.getByText('Latte')).toBeTruthy();
        expect(screen.getByTestId('customer-display-total').textContent).toContain('₱290.00');
        expect(screen.queryByText('Your order', { exact: true })).toBeNull();
        expect(screen.queryByText('Review your items', { exact: true })).toBeNull();
        expect(screen.queryByText('DGFY POS', { exact: true })).toBeNull();
        expect(screen.queryByText('Customer display', { exact: true })).toBeNull();

        cashier.send(CUSTOMER_DISPLAY_MESSAGE_TYPES.SNAPSHOT, {
            viewState: 'active',
            currency: 'PHP',
            items: [{ key: 'line-0', name: 'Stale item', quantity: 1, unitPrice: 1, lineTotal: 1, options: [] }],
            itemCount: 1,
            subtotal: 1,
            discount: 0,
            serviceFees: 0,
            total: 1
        }, 1);
        await expect.poll(() => screen.getByTestId('customer-display-total').textContent).toContain('₱290.00');
        expect(screen.queryByText('Stale item')).toBeNull();

        cashier.send(CUSTOMER_DISPLAY_MESSAGE_TYPES.SNAPSHOT, {
            viewState: 'completed',
            currency: 'PHP',
            items: [{ key: 'line-0', name: 'Latte', quantity: 2, unitPrice: 145, lineTotal: 290, options: [] }],
            itemCount: 2,
            subtotal: 290,
            discount: 0,
            serviceFees: 0,
            total: 290,
            paymentSummary: {
                paymentType: 'cash',
                isCash: true,
                totalDue: 290,
                amountPaid: 300,
                changeAmount: 10
            }
        }, 3);
        await waitFor(() => expect(screen.getByTestId('customer-display-state').getAttribute('data-state')).toBe('completed'));
        expect(screen.getByTestId('customer-display-completed')).toBeTruthy();
        expect(screen.getByText('Payment confirmed')).toBeTruthy();
        expect(screen.getByText('Thank you!')).toBeTruthy();
        expect(screen.getByTestId('customer-display-payment-change').textContent).toContain('₱10.00');

        cashier.send(CUSTOMER_DISPLAY_MESSAGE_TYPES.CLOSE, {}, 4);
        await waitFor(() => expect(screen.getByTestId('customer-display-state').getAttribute('data-state')).toBe('ended'));
        expect(screen.getByText('Display session ended')).toBeTruthy();
        cashier.close();
    });
});
