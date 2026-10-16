/** @vitest-environment jsdom */

import React from 'react';
import { act, cleanup, render, renderHook, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import CustomerDisplayPage from '../../../../packages/web-core/src/features/pos/pages/CustomerDisplayPage.jsx';
import { useCustomerDisplaySync } from '../../../../packages/web-core/src/features/pos/hooks/useCustomerDisplaySync.js';
import {
    createCustomerDisplayTransport,
    CUSTOMER_DISPLAY_MESSAGE_TYPES
} from '../../../../packages/web-core/src/features/pos/services/customerDisplaySync.js';

const sessionId = 'cd-fallback-session-001';
const terminalId = 'JOHN-01';
const customerDisplayRoute = `/customer-display?sessionId=${sessionId}&terminalId=${terminalId}`;

const makeWindowPair = () => {
    let opener;
    const dispatchMessage = (data, source) => {
        queueMicrotask(() => {
            const event = new Event('message');
            Object.defineProperties(event, {
                data: { value: data },
                origin: { value: window.location.origin },
                source: { value: source }
            });
            window.dispatchEvent(event);
        });
    };

    const popup = {
        closed: false,
        close: vi.fn(() => {
            popup.closed = true;
        }),
        moveTo: vi.fn(),
        postMessage: vi.fn((data) => dispatchMessage(data, opener)),
        resizeTo: vi.fn()
    };

    opener = {
        closed: false,
        postMessage: vi.fn((data) => dispatchMessage(data, popup))
    };

    return { opener, popup };
};

const flushMessages = async () => {
    await act(async () => {
        await Promise.resolve();
        await Promise.resolve();
    });
};

const initialCart = [{
    item_id: 1,
    item_name: 'Casino Ethyl Alcohol',
    quantity: 1,
    sale_price: 90
}];

const addedCartLine = {
    item_id: 2,
    item_name: 'Performance Item 065',
    quantity: 1,
    sale_price: 50
};

beforeEach(() => {
    // The local in-app browser uses the postMessage fallback. Keep this
    // explicit so the regression test covers the same transport path.
    vi.stubGlobal('BroadcastChannel', undefined);
});

afterEach(() => {
    cleanup();
    vi.useRealTimers();
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
    try {
        delete window.opener;
    } catch {
        // jsdom may expose opener as a non-configurable property.
    }
});

describe('POS customer display synchronization', () => {
    it('treats closing the customer display window as an ended session', async () => {
        vi.useFakeTimers();
        const firstWindow = makeWindowPair();
        const secondWindow = makeWindowPair();
        const openSpy = vi.spyOn(window, 'open')
            .mockReturnValueOnce(firstWindow.popup)
            .mockReturnValueOnce(secondWindow.popup);
        const initialProps = {
            activeShiftId: 'shift-1',
            cart: initialCart,
            cartSubtotal: 90,
            cartTotal: 90,
            cartTotalQuantity: 1,
            normalizedTerminalId: terminalId,
            setupCurrency: 'PHP'
        };
        const { result, unmount } = renderHook(() => useCustomerDisplaySync(initialProps));

        try {
            act(() => {
                result.current.openCustomerDisplay();
            });
            expect(result.current.customerDisplayStatus).toBe('waiting');

            firstWindow.popup.closed = true;
            await act(async () => {
                await vi.advanceTimersByTimeAsync(1000);
            });

            expect(result.current.customerDisplayStatus).toBe('ended');

            act(() => {
                result.current.openCustomerDisplay();
            });
            expect(openSpy).toHaveBeenCalledTimes(2);
            expect(result.current.customerDisplayStatus).toBe('waiting');
        } finally {
            unmount();
        }
    });

    it('places the customer display on a secondary screen when window management is available', async () => {
        const { popup } = makeWindowPair();
        const callOrder = [];
        const openSpy = vi.spyOn(window, 'open').mockImplementation(() => {
            callOrder.push('window-open');
            return popup;
        });
        const getScreenDetails = vi.fn(() => {
            callOrder.push('screen-details');
            return Promise.resolve({
                currentScreen: {
                    availLeft: 0,
                    availTop: 0,
                    availWidth: 1920,
                    availHeight: 1080,
                    isPrimary: true
                },
                screens: [
                    {
                        availLeft: 0,
                        availTop: 0,
                        availWidth: 1920,
                        availHeight: 1080,
                        isPrimary: true
                    },
                    {
                        availLeft: 1920,
                        availTop: 0,
                        availWidth: 1280,
                        availHeight: 1080,
                        isPrimary: false
                    }
                ]
            });
        });
        vi.stubGlobal('getScreenDetails', getScreenDetails);
        const { result, unmount } = renderHook(() => useCustomerDisplaySync({
            activeShiftId: 'shift-1',
            cart: initialCart,
            cartSubtotal: 90,
            cartTotal: 90,
            cartTotalQuantity: 1,
            normalizedTerminalId: terminalId,
            setupCurrency: 'PHP'
        }));

        try {
            act(() => {
                result.current.openCustomerDisplay();
            });
            await flushMessages();

            expect(openSpy).toHaveBeenCalledWith(
                expect.any(String),
                'dgfy-pos-customer-display',
                'popup=yes,width=960,height=720,resizable=yes,scrollbars=yes'
            );
            expect(callOrder.slice(0, 2)).toEqual(['screen-details', 'window-open']);
            expect(getScreenDetails).toHaveBeenCalledTimes(1);
            expect(popup.resizeTo).toHaveBeenCalledWith(960, 720);
            expect(popup.moveTo).toHaveBeenCalledWith(2080, 180);
            expect(result.current.customerDisplayStatus).toBe('waiting');
        } finally {
            unmount();
        }
    });

    it('keeps the popup on its current screen when placement permission is denied', async () => {
        const { popup } = makeWindowPair();
        vi.spyOn(window, 'open').mockReturnValue(popup);
        vi.stubGlobal('getScreenDetails', vi.fn().mockRejectedValue(new Error('permission denied')));
        const { result, unmount } = renderHook(() => useCustomerDisplaySync({
            activeShiftId: 'shift-1',
            cart: initialCart,
            cartSubtotal: 90,
            cartTotal: 90,
            cartTotalQuantity: 1,
            normalizedTerminalId: terminalId,
            setupCurrency: 'PHP'
        }));

        try {
            act(() => {
                result.current.openCustomerDisplay();
            });
            await flushMessages();

            expect(result.current.customerDisplayStatus).toBe('waiting');
            expect(popup.resizeTo).not.toHaveBeenCalled();
            expect(popup.moveTo).not.toHaveBeenCalled();
        } finally {
            unmount();
        }
    });

    it('sends the committed payment summary to the customer display immediately', async () => {
        vi.useFakeTimers();
        const { opener, popup } = makeWindowPair();
        const openSpy = vi.spyOn(window, 'open').mockReturnValue(popup);
        const receivedSnapshots = [];
        const displayProps = {
            activeShiftId: 'shift-1',
            cart: initialCart,
            cartSubtotal: 90,
            cartTotal: 90,
            cartTotalQuantity: 1,
            checkoutConfirmModalOpen: true,
            normalizedTerminalId: terminalId,
            setupCurrency: 'PHP'
        };
        const { result, unmount } = renderHook(() => useCustomerDisplaySync(displayProps));
        let displayTransport;

        try {
            act(() => {
                result.current.openCustomerDisplay();
            });

            const openedUrl = openSpy.mock.calls[0][0];
            const openedHash = new URL(openedUrl).hash;
            const openedParams = new URLSearchParams(openedHash.slice(openedHash.indexOf('?') + 1));
            displayTransport = createCustomerDisplayTransport({
                role: 'display',
                sessionId: openedParams.get('sessionId'),
                terminalId,
                targetWindow: opener,
                onMessage: (message) => {
                    if (message.messageType === CUSTOMER_DISPLAY_MESSAGE_TYPES.SNAPSHOT) {
                        receivedSnapshots.push(message);
                    }
                }
            });
            displayTransport.send(CUSTOMER_DISPLAY_MESSAGE_TYPES.READY, {}, 0);
            await flushMessages();

            act(() => {
                result.current.showCustomerDisplayCompleted({
                    payment_type: 'cash',
                    total_amount: 90,
                    cash_received: 100,
                    change_amount: 10
                });
            });
            await flushMessages();

            const completedSnapshot = receivedSnapshots.at(-1);
            expect(completedSnapshot.payload.viewState).toBe('completed');
            expect(completedSnapshot.payload.paymentSummary).toEqual({
                paymentType: 'cash',
                isCash: true,
                totalDue: 90,
                amountPaid: 100,
                changeAmount: 10
            });
        } finally {
            displayTransport?.close();
            unmount();
        }
    });

    it('replays a cart update after the cashier health label becomes disconnected', async () => {
        vi.useFakeTimers();
        const { opener, popup } = makeWindowPair();
        const openSpy = vi.spyOn(window, 'open').mockReturnValue(popup);
        const receivedSnapshots = [];
        const initialProps = {
            activeShiftId: 'shift-1',
            cart: initialCart,
            cartSubtotal: 90,
            cartTotal: 90,
            cartTotalQuantity: 1,
            normalizedTerminalId: terminalId,
            setupCurrency: 'PHP'
        };
        const { result, rerender, unmount } = renderHook((props) => useCustomerDisplaySync(props), {
            initialProps
        });
        let displayTransport;

        try {
            act(() => {
                result.current.openCustomerDisplay();
            });

            const openedUrl = openSpy.mock.calls[0][0];
            const openedHash = new URL(openedUrl).hash;
            const openedParams = new URLSearchParams(openedHash.slice(openedHash.indexOf('?') + 1));
            displayTransport = createCustomerDisplayTransport({
                role: 'display',
                sessionId: openedParams.get('sessionId'),
                terminalId,
                targetWindow: opener,
                onMessage: (message) => {
                    if (message.messageType === CUSTOMER_DISPLAY_MESSAGE_TYPES.SNAPSHOT) {
                        receivedSnapshots.push(message);
                    }
                }
            });
            displayTransport.send(CUSTOMER_DISPLAY_MESSAGE_TYPES.READY, {}, 0);
            await flushMessages();

            expect(result.current.customerDisplayStatus).toBe('connected');
            expect(receivedSnapshots.at(-1).payload.total).toBe(90);

            await act(async () => {
                await vi.advanceTimersByTimeAsync(13000);
            });
            expect(result.current.customerDisplayStatus).toBe('disconnected');

            const snapshotCountBeforeCartUpdate = receivedSnapshots.length;
            rerender({
                ...initialProps,
                cart: [...initialCart, addedCartLine],
                cartSubtotal: 140,
                cartTotal: 140,
                cartTotalQuantity: 2
            });
            await flushMessages();

            expect(receivedSnapshots.length).toBeGreaterThan(snapshotCountBeforeCartUpdate);
            expect(receivedSnapshots.at(-1).payload.total).toBe(140);
            expect(receivedSnapshots.at(-1).payload.items.map((item) => item.name)).toEqual([
                'Casino Ethyl Alcohol',
                'Performance Item 065'
            ]);
        } finally {
            displayTransport?.close();
            unmount();
        }
    });

    it('re-handshakes the customer display after its first snapshot goes stale', async () => {
        vi.useFakeTimers();
        const { opener, popup } = makeWindowPair();
        Object.defineProperty(window, 'opener', { configurable: true, value: opener });
        let readyCount = 0;
        let revision = 0;
        const cashier = createCustomerDisplayTransport({
            role: 'cashier',
            sessionId,
            terminalId,
            targetWindow: popup,
            onMessage: (message) => {
                if (message.messageType !== CUSTOMER_DISPLAY_MESSAGE_TYPES.READY) return;
                readyCount += 1;
                revision += 1;
                cashier.send(CUSTOMER_DISPLAY_MESSAGE_TYPES.SNAPSHOT, {
                    viewState: 'active',
                    currency: 'PHP',
                    items: [{ key: 'line-0', name: 'Casino Ethyl Alcohol', quantity: 1, unitPrice: 90, lineTotal: 90, options: [] }],
                    itemCount: 1,
                    subtotal: 90,
                    discount: 0,
                    serviceFees: 0,
                    total: 90
                }, revision);
            }
        });

        try {
            render(
                <MemoryRouter initialEntries={[customerDisplayRoute]}>
                    <Routes>
                        <Route path="/customer-display" element={<CustomerDisplayPage />} />
                    </Routes>
                </MemoryRouter>
            );
            await flushMessages();

            expect(readyCount).toBe(1);
            expect(screen.getByTestId('customer-display-state').getAttribute('data-state')).toBe('active');

            await act(async () => {
                await vi.advanceTimersByTimeAsync(16000);
            });
            await flushMessages();

            expect(readyCount).toBeGreaterThan(1);
            expect(screen.getByTestId('customer-display-connection').textContent).toContain('Connected');
            expect(screen.getByTestId('customer-display-total').textContent).toContain('₱90.00');
        } finally {
            cashier.close();
        }
    });
});
