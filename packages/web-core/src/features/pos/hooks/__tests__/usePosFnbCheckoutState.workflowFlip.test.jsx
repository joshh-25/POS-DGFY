/** @vitest-environment jsdom */

import { useState } from 'react';
import { renderHook, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { resolvePosWorkflow } from '../../utils/posWorkflowResolver.js';
import { resolveFnbCheckoutContext, usePosFnbCheckoutState } from '../usePosFnbCheckoutState.js';

vi.mock('@/src/utils/iminRuntimeFeedback.js', () => ({
    posToast: {
        error: vi.fn(),
        info: vi.fn(),
        message: vi.fn(),
        success: vi.fn()
    }
}));

// Mirrors the wiring in usePosTerminalViewModel.js: orderMethod is seeded once from the
// resolved workflow, and usePosFnbCheckoutState owns re-syncing it afterwards (issue #2824).
const useOrderMethodHarness = ({ workflowMode, isDineInCashCheckoutRequested = false, initialMethod = null }) => {
    const posWorkflow = resolvePosWorkflow(workflowMode);
    const [orderMethod, setOrderMethod] = useState(
        () => initialMethod || posWorkflow.allowedMethods[0] || 'dine_in'
    );
    const fnbContext = resolveFnbCheckoutContext({
        fnbContext: null,
        isFnbWorkflow: posWorkflow.mode === 'fnb' || isDineInCashCheckoutRequested,
        allowedMethods: posWorkflow.allowedMethods
    });
    const { checkoutAllowedOrderMethods } = usePosFnbCheckoutState({
        normalizedFnbContext: fnbContext.normalizedFnbContext,
        hasFnbCheckoutContext: fnbContext.hasFnbCheckoutContext,
        checkoutUsesFnbContract: fnbContext.checkoutUsesFnbContract,
        workflowMode: posWorkflow.mode,
        allowedMethods: posWorkflow.allowedMethods,
        orderMethod,
        setOrderMethod,
        catalogLoading: false,
        safeCart: [],
        safeCatalog: [],
        setCart: vi.fn(),
        setTableNumber: vi.fn(),
        setKitchenNotes: vi.fn()
    });

    return { orderMethod, setOrderMethod, checkoutAllowedOrderMethods };
};

describe('orderMethod re-sync when the resolved POS workflow changes (issue #2824)', () => {
    it('seeds walk_in on the counter fallback, then selects dine_in once the workflow resolves to fnb', async () => {
        const { result, rerender } = renderHook(useOrderMethodHarness, {
            initialProps: { workflowMode: 'food_manufacturing' }
        });

        expect(result.current.orderMethod).toBe('walk_in');
        expect(result.current.checkoutAllowedOrderMethods).not.toContain('dine_in');

        rerender({ workflowMode: 'fnb' });

        await waitFor(() => expect(result.current.orderMethod).toBe('dine_in'));
        expect(result.current.checkoutAllowedOrderMethods).toContain('dine_in');
    });

    it('does not reset dine_in while a dine-in cash checkout is hydrating on a non-fnb workflow', async () => {
        const { result } = renderHook(useOrderMethodHarness, {
            initialProps: {
                workflowMode: 'food_manufacturing',
                isDineInCashCheckoutRequested: true,
                initialMethod: 'dine_in'
            }
        });

        await waitFor(() => expect(result.current.checkoutAllowedOrderMethods).toContain('dine_in'));
        expect(result.current.orderMethod).toBe('dine_in');
    });

    it('keeps a still-allowed method when the workflow resolves to fnb', async () => {
        const { result, rerender } = renderHook(useOrderMethodHarness, {
            initialProps: { workflowMode: 'food_manufacturing', initialMethod: 'delivery' }
        });

        rerender({ workflowMode: 'fnb', initialMethod: 'delivery' });

        await waitFor(() => expect(result.current.checkoutAllowedOrderMethods).toContain('dine_in'));
        expect(result.current.orderMethod).toBe('delivery');
    });
});
