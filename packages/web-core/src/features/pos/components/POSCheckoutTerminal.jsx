import { Suspense, useCallback, useEffect, useRef } from 'react';
import { lazyWithChunkRetry } from '../../../utils/chunkLoadRecovery.js';
import { usePosTerminalViewModel } from '../hooks/usePosTerminalViewModel.js';
import { useCustomerDisplaySync } from '../hooks/useCustomerDisplaySync.js';
import { usePosCustomerDisplaySync } from '../hooks/usePosCustomerDisplaySync.js';

const POSCheckoutTerminalView = lazyWithChunkRetry(() => import('./POSCheckoutTerminalView.jsx'));

export default function POSCheckoutTerminal(props) {
    const {
        customerDisplayEnabled = true,
        customerDisplayOpenRequest = 0,
        customerDisplayEndRequest = 0,
        onCustomerDisplayOpenRequestHandled,
        onCustomerDisplayEndRequestHandled,
        onCustomerDisplayControllerChange,
        onCustomerDisplayStatusChange,
        onCheckoutCompleted: onCheckoutCompletedProp,
        ...terminalProps
    } = props;
    const customerDisplayControllerRef = useRef(null);
    const handleCheckoutCompleted = useCallback((...args) => {
        customerDisplayControllerRef.current?.showCustomerDisplayCompleted?.(args[0] || null);
        return onCheckoutCompletedProp?.(...args);
    }, [onCheckoutCompletedProp]);
    const terminalViewModel = {
        ...usePosTerminalViewModel({ ...terminalProps, onCheckoutCompleted: handleCheckoutCompleted }),
    };
    const customerDisplay = useCustomerDisplaySync({
        activeShiftId: terminalViewModel.activeShiftId,
        cart: terminalViewModel.safeCart,
        cartSubtotal: terminalViewModel.cartSubtotal,
        cartTotal: terminalViewModel.cartTotal,
        cartTotalQuantity: terminalViewModel.cartTotalQuantity,
        calculatedDiscountAmount: terminalViewModel.calculatedDiscountAmount,
        checkoutConfirmModalOpen: terminalViewModel.checkoutConfirmModalOpen,
        checkoutLoading: terminalViewModel.checkoutLoading,
        normalizedTerminalId: terminalViewModel.normalizedTerminalId,
        restaurantServiceChargeAmount: terminalViewModel.restaurantServiceChargeAmount,
        serviceFeeAmount: terminalViewModel.serviceFeeAmount,
        enabled: customerDisplayEnabled,
        openRequestId: customerDisplayOpenRequest,
        endRequestId: customerDisplayEndRequest,
        onOpenRequestHandled: onCustomerDisplayOpenRequestHandled,
        onEndRequestHandled: onCustomerDisplayEndRequestHandled,
        sessionLocked: terminalProps.sessionLocked,
        setupCurrency: terminalViewModel.setupCurrency
    });
    useEffect(() => {
        customerDisplayControllerRef.current = customerDisplay;
        onCustomerDisplayControllerChange?.(customerDisplay);
        return () => {
            if (customerDisplayControllerRef.current === customerDisplay) {
                customerDisplayControllerRef.current = null;
            }
            onCustomerDisplayControllerChange?.(null);
        };
    }, [customerDisplay, onCustomerDisplayControllerChange]);

    useEffect(() => {
        onCustomerDisplayStatusChange?.({
            canOpen: customerDisplay.customerDisplayCanOpen,
            label: customerDisplay.customerDisplayStatusLabel,
            status: customerDisplay.customerDisplayStatus
        });
    }, [
        customerDisplay.customerDisplayCanOpen,
        customerDisplay.customerDisplayStatus,
        customerDisplay.customerDisplayStatusLabel,
        onCustomerDisplayStatusChange
    ]);

    usePosCustomerDisplaySync({
        scope: props.offlineSnapshotScope,
        terminalId: props.terminalId,
        locationId: props.selectedLocationId,
        cart: terminalViewModel.safeCart,
        subtotal: terminalViewModel.cartSubtotal,
        total: terminalViewModel.cartTotal,
        itemCount: terminalViewModel.cartTotalQuantity,
        currency: terminalViewModel.setupCurrency,
        businessName: terminalViewModel.setupMeta?.businessSettings?.pos_business_name
    });

    return (
        <Suspense fallback={<div className="flex h-full min-h-0 items-center justify-center text-sm text-slate-500">Loading POS terminal…</div>}>
            <POSCheckoutTerminalView viewModel={{ ...terminalViewModel, ...customerDisplay }} />
        </Suspense>
    );
}
