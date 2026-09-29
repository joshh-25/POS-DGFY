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

    it('supports decimal manual quantity without deleting the line at zero', () => {
        const { result } = renderCart({
            catalog: [{ ...retailItem, unit_of_measure: 'kg', current_stock: 20 }]
        });

        act(() => result.current.addToCart({ ...retailItem, unit_of_measure: 'kg' }));
        act(() => result.current.setQuantityInputValue('1.25'));
        act(() => result.current.commitManualCartQuantity({ ...retailItem, unit_of_measure: 'kg' }));
        expect(result.current.cart[0].quantity).toBe(1.25);

        act(() => result.current.setQuantityInputValue('0'));
        act(() => result.current.commitManualCartQuantity({ ...retailItem, unit_of_measure: 'kg' }));
        expect(result.current.cart).toHaveLength(1);
        expect(result.current.cart[0].quantity).toBe(1.25);

        act(() => result.current.updateCartQuantity(result.current.cart[0].line_key, 0));
        expect(result.current.cart).toHaveLength(1);
        expect(result.current.cart[0].quantity).toBe(1.25);
    });

    it('keeps an item at quantity one until the trash action removes it', () => {
        const { result } = renderCart();

        act(() => result.current.addToCart(retailItem));
        const lineKey = result.current.cart[0].line_key;

        act(() => result.current.updateCartQuantity(lineKey, 0));
        expect(result.current.cart).toHaveLength(1);
        expect(result.current.cart[0].quantity).toBe(1);

        act(() => result.current.removeCartLine(lineKey));
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

    it('allows same-price quantity increases but protects the original parked line', () => {
        const { result } = renderCart({
            catalog: [{ ...retailItem, current_stock: 5 }]
        });
        const parkedLine = {
            ...retailItem,
            line_key: 'parked-coffee',
            item_name: retailItem.name,
            quantity: 1,
            base_sale_price: 100,
            sale_price: 100,
            parked_snapshot_line: true,
            parked_original_quantity: 1,
            service_option_ids: []
        };

        act(() => result.current.setCart([parkedLine]));
        act(() => result.current.addToCart(retailItem));
        expect(result.current.cart).toHaveLength(1);
        expect(result.current.cart[0]).toEqual(expect.objectContaining({
            line_key: 'parked-coffee',
            quantity: 2,
            sale_price: 100
        }));

        act(() => result.current.updateCartQuantity('parked-coffee', 0));
        expect(result.current.cart[0].quantity).toBe(2);
        act(() => result.current.removeCartLine('parked-coffee'));
        expect(result.current.cart).toHaveLength(1);
    });

    it('requires a reason before deleting an original parked line', () => {
        const onParkedLineDeleted = vi.fn();
        const { result } = renderCart({ onParkedLineDeleted });
        const parkedLine = {
            ...retailItem,
            line_key: 'parked-coffee',
            item_name: retailItem.name,
            quantity: 1,
            base_sale_price: 100,
            sale_price: 100,
            parked_snapshot_line: true,
            parked_original_quantity: 1,
            service_option_ids: []
        };

        act(() => result.current.setCart([parkedLine]));
        act(() => result.current.removeCartLine('parked-coffee'));
        expect(result.current.cart).toHaveLength(1);
        expect(result.current.parkedLineDeletionRequest).toEqual(expect.objectContaining({
            lineKey: 'parked-coffee'
        }));

        act(() => result.current.confirmParkedLineDeletion());
        expect(result.current.cart).toHaveLength(1);

        act(() => result.current.setParkedLineDeletionReason('Customer removed item'));
        act(() => result.current.confirmParkedLineDeletion());
        expect(result.current.cart).toEqual([]);
        expect(onParkedLineDeleted).toHaveBeenCalledWith(expect.objectContaining({
            reason: 'Customer removed item',
            line: expect.objectContaining({ line_key: 'parked-coffee' })
        }));
    });

    it('releases a claimed parked sale when its final original line is deleted', () => {
        const onCartBecameEmpty = vi.fn(() => Promise.resolve(true));
        const onParkedLineDeleted = vi.fn();
        const { result } = renderCart({
            activeParkedSale: { pos_parked_sale_id: 44 },
            onCartBecameEmpty,
            onParkedLineDeleted
        });
        const parkedLine = {
            ...retailItem,
            line_key: 'parked-coffee',
            item_name: retailItem.name,
            quantity: 1,
            base_sale_price: 100,
            sale_price: 100,
            parked_snapshot_line: true,
            parked_original_quantity: 1,
            service_option_ids: []
        };

        act(() => result.current.setCart([parkedLine]));
        act(() => result.current.removeCartLine('parked-coffee'));
        act(() => result.current.setParkedLineDeletionReason('Customer removed item'));
        act(() => result.current.confirmParkedLineDeletion());

        expect(onParkedLineDeleted).toHaveBeenCalledWith(expect.objectContaining({
            reason: 'Customer removed item',
            line: expect.objectContaining({ line_key: 'parked-coffee' })
        }));
        expect(onCartBecameEmpty).toHaveBeenCalledTimes(1);
        expect(result.current.cart).toHaveLength(1);
    });

    it('requires a reason when the parked-line marker is missing but the snapshot identity matches', () => {
        const onCartBecameEmpty = vi.fn(() => Promise.resolve(true));
        const onParkedLineDeleted = vi.fn();
        const { result } = renderCart({
            activeParkedSale: {
                pos_parked_sale_id: 44,
                snapshot: {
                    lines: [{
                        line_key: 'parked-coffee',
                        item_id: retailItem.item_id,
                        item_name: retailItem.name,
                        quantity: 1,
                        sale_price: 100
                    }]
                }
            },
            onCartBecameEmpty,
            onParkedLineDeleted
        });
        const parkedLineWithoutMarker = {
            ...retailItem,
            line_key: 'parked-coffee',
            item_name: retailItem.name,
            quantity: 1,
            base_sale_price: 100,
            sale_price: 100,
            service_option_ids: []
        };

        act(() => result.current.setCart([parkedLineWithoutMarker]));
        act(() => result.current.removeCartLine('parked-coffee'));
        expect(result.current.cart).toHaveLength(1);
        expect(result.current.parkedLineDeletionRequest).toEqual(expect.objectContaining({
            lineKey: 'parked-coffee'
        }));

        act(() => result.current.setParkedLineDeletionReason('Customer removed item'));
        act(() => result.current.confirmParkedLineDeletion());
        expect(onCartBecameEmpty).toHaveBeenCalledTimes(1);
        expect(result.current.cart).toHaveLength(1);
        expect(onParkedLineDeleted).toHaveBeenCalledWith(expect.objectContaining({
            reason: 'Customer removed item',
            line: expect.objectContaining({ line_key: 'parked-coffee' })
        }));
    });

    it('creates a separate line when the parked item price changed', () => {
        const { result } = renderCart({
            catalog: [{ ...retailItem, default_sale_price: 120, current_stock: 5 }]
        });
        act(() => result.current.setCart([{
            ...retailItem,
            line_key: 'parked-coffee',
            item_name: retailItem.name,
            quantity: 1,
            base_sale_price: 100,
            sale_price: 100,
            parked_snapshot_line: true,
            parked_original_quantity: 1,
            service_option_ids: []
        }]));

        act(() => result.current.addToCart({ ...retailItem, default_sale_price: 120 }));
        expect(result.current.cart).toHaveLength(2);
        expect(result.current.cart.map((line) => line.sale_price)).toEqual([100, 120]);
        expect(result.current.cart[0].quantity).toBe(1);
        expect(result.current.cart[1].parked_snapshot_line).not.toBe(true);

        act(() => result.current.updateCartQuantity('parked-coffee', 2));
        expect(result.current.cart[0].quantity).toBe(1);
    });

    it('adds a separate current-price line from catalog quantity controls after price drift', () => {
        const { result } = renderCart({
            catalog: [{ ...retailItem, default_sale_price: 120, current_stock: 5 }]
        });
        act(() => result.current.setCart([{
            ...retailItem,
            line_key: 'parked-coffee',
            item_name: retailItem.name,
            quantity: 1,
            base_sale_price: 100,
            sale_price: 100,
            parked_snapshot_line: true,
            parked_original_quantity: 1,
            service_option_ids: []
        }]));

        act(() => result.current.adjustCartQuantity({ ...retailItem, default_sale_price: 120 }, 1));
        expect(result.current.cart).toHaveLength(2);
        expect(result.current.cart.map((line) => line.sale_price)).toEqual([100, 120]);
        expect(result.current.cart[0].quantity).toBe(1);
        expect(result.current.cart[1].quantity).toBe(1);
    });

    it('does not allow additions to a missing parked item', () => {
        const { result } = renderCart({ catalog: [] });
        act(() => result.current.setCart([{
            ...retailItem,
            line_key: 'parked-missing-coffee',
            quantity: 1,
            base_sale_price: 100,
            sale_price: 100,
            parked_snapshot_line: true,
            parked_original_quantity: 1
        }]));

        act(() => result.current.updateCartQuantity('parked-missing-coffee', 2));
        expect(result.current.cart[0].quantity).toBe(1);
        act(() => result.current.removeCartLine('parked-missing-coffee'));
        expect(result.current.cart).toHaveLength(1);
    });
});
