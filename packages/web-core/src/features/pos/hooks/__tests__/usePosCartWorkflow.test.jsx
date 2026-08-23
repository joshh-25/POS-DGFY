/** @vitest-environment jsdom */

import { act, renderHook } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fetchPosItemOptionGroups } from '../../services/posService';
import { usePosCartWorkflow } from '../usePosCartWorkflow.js';

vi.mock('../../services/posService', () => ({
    fetchPosItemOptionGroups: vi.fn()
}));

const retailItem = {
    item_id: 11,
    name: 'Coffee',
    category: 'Beverage',
    default_sale_price: 100,
    current_stock: 5,
    unit_of_measure: 'pcs',
    vat_type: 'vatable'
};

const serviceItem = {
    item_id: 12,
    name: 'Haircut',
    category: 'Service',
    default_sale_price: 500,
    current_stock: 0,
    unit_of_measure: 'service',
    vat_type: 'vatable'
};

const workflow = {
    mode: 'services',
    allowedMethods: ['walk_in', 'appointment']
};

const renderCart = (overrides = {}) => renderHook(() => usePosCartWorkflow({
    catalog: [retailItem, serviceItem],
    posWorkflow: workflow,
    ...overrides
}));

describe('usePosCartWorkflow', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        fetchPosItemOptionGroups.mockResolvedValue({ groups: [] });
    });

    it('adds a line, merges the same item, and clamps quantity to catalog stock', () => {
        const { result } = renderCart();

        act(() => result.current.addToCart(retailItem));
        act(() => result.current.addToCart(retailItem, { quantity: 3 }));
        expect(result.current.cart).toHaveLength(1);
        expect(result.current.cart[0].quantity).toBe(4);

        act(() => result.current.updateCartQuantity(result.current.cart[0].line_key, 99));
        expect(result.current.cart[0].quantity).toBe(5);
    });

    it('supports decimal manual quantity and removes a line at zero', () => {
        const { result } = renderCart({
            catalog: [{ ...retailItem, unit_of_measure: 'kg', current_stock: 20 }]
        });

        act(() => result.current.addToCart({ ...retailItem, unit_of_measure: 'kg' }));
        act(() => result.current.setQuantityInputValue('1.25'));
        act(() => result.current.commitManualCartQuantity({ ...retailItem, unit_of_measure: 'kg' }));
        expect(result.current.cart[0].quantity).toBe(1.25);

        act(() => result.current.updateCartQuantity(result.current.cart[0].line_key, 0));
        expect(result.current.cart).toEqual([]);
    });

    it('loads service options before adding a service line', async () => {
        fetchPosItemOptionGroups.mockResolvedValueOnce({
            groups: [{ group_id: 7, name: 'Duration', options: [] }]
        });
        const { result } = renderCart();

        let addedImmediately;
        await act(async () => {
            addedImmediately = await result.current.addCatalogItemToCart(serviceItem, { quantity: 2 });
        });

        expect(addedImmediately).toBe(false);
        expect(fetchPosItemOptionGroups).toHaveBeenCalledWith(serviceItem.item_id);
        expect(result.current.serviceOptionsModal).toMatchObject({
            open: true,
            item: serviceItem,
            quantity: 2
        });

        act(() => result.current.handleConfirmServiceOptions({
            serviceItem,
            selectedOptionIds: [],
            selectedOptionDetails: []
        }));
        expect(result.current.cart[0]).toMatchObject({ item_id: serviceItem.item_id, quantity: 2 });
        expect(result.current.serviceOptionsModal.open).toBe(false);
    });

    it('blocks cart mutations while checkout is blocked', () => {
        const notify = vi.fn();
        const { result } = renderCart({
            checkoutBlockedReason: 'Open a shift before using POS.',
            onCartBecameEmpty: notify
        });

        act(() => result.current.addToCart(retailItem));
        expect(result.current.cart).toEqual([]);
        expect(notify).not.toHaveBeenCalled();
        expect(result.current.posActionsBlocked).toBe(true);
    });

    it('keeps a claimed parked sale protected when the last item is removed', () => {
        const onCartBecameEmpty = vi.fn(() => Promise.resolve(true));
        const { result } = renderCart({
            activeParkedSale: { pos_parked_sale_id: 44 },
            onCartBecameEmpty
        });

        act(() => result.current.addToCart(retailItem));
        const lineKey = result.current.cart[0].line_key;
        act(() => result.current.removeCartLine(lineKey));

        expect(onCartBecameEmpty).toHaveBeenCalledTimes(1);
        expect(result.current.cart).toHaveLength(1);
    });
});
