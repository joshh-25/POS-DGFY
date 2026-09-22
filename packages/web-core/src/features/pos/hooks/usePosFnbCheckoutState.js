import { useEffect, useMemo, useRef } from 'react';
import { posToast as toast } from '@/src/utils/iminRuntimeFeedback.js';
import { buildFnbCheckCartLines } from '../utils/fnbCheckoutCart.js';

const FNB_ORDER_METHODS = Object.freeze(['dine_in', 'takeout', 'pickup', 'delivery']);

export const resolveFnbCheckoutContext = ({ fnbContext, isFnbWorkflow, allowedMethods }) => {
    const normalizedFnbContext = fnbContext && typeof fnbContext === 'object' ? fnbContext : null;
    const hasFnbCheckoutContext = Boolean(Number(normalizedFnbContext?.fnb_check_id) > 0);
    const checkoutUsesFnbContract = Boolean(isFnbWorkflow || hasFnbCheckoutContext);

    return {
        normalizedFnbContext,
        hasFnbCheckoutContext,
        checkoutUsesFnbContract,
        allowedMethods: Array.isArray(allowedMethods) ? allowedMethods : []
    };
};

export const usePosFnbCheckoutState = ({
    normalizedFnbContext,
    hasFnbCheckoutContext,
    checkoutUsesFnbContract,
    workflowMode,
    allowedMethods,
    orderMethod,
    setOrderMethod,
    catalogLoading,
    safeCart,
    safeCatalog,
    setCart,
    setTableNumber,
    setKitchenNotes
}) => {
    const checkoutAllowedOrderMethods = useMemo(() => (
        checkoutUsesFnbContract
            ? [...new Set([...allowedMethods, ...FNB_ORDER_METHODS])]
            : allowedMethods
    ), [allowedMethods, checkoutUsesFnbContract]);
    const fnbCheckoutHydrationRef = useRef({ key: '', status: '' });

    useEffect(() => {
        if (!checkoutAllowedOrderMethods.includes(orderMethod)) {
            setOrderMethod(checkoutAllowedOrderMethods[0] || (workflowMode === 'services' ? 'walk_in' : 'dine_in'));
        }
    }, [checkoutAllowedOrderMethods, orderMethod, setOrderMethod, workflowMode]);

    useEffect(() => {
        if (!hasFnbCheckoutContext || !normalizedFnbContext) return;

        const requestedOrderMethod = String(normalizedFnbContext.fnb_order_method || '').trim();
        if (requestedOrderMethod && checkoutAllowedOrderMethods.includes(requestedOrderMethod)) {
            setOrderMethod(requestedOrderMethod);
        }
        setTableNumber(String(normalizedFnbContext.fnb_table_label_snapshot || '').trim());
        setKitchenNotes(String(normalizedFnbContext.fnb_notes || '').trim());
    }, [checkoutAllowedOrderMethods, hasFnbCheckoutContext, normalizedFnbContext, setKitchenNotes, setOrderMethod, setTableNumber]);

    useEffect(() => {
        if (!hasFnbCheckoutContext || !normalizedFnbContext) return;

        const checkId = Number(normalizedFnbContext.fnb_check_id);
        const checkLines = Array.isArray(normalizedFnbContext.fnb_check_lines)
            ? normalizedFnbContext.fnb_check_lines
            : [];
        if (!Number.isInteger(checkId) || checkId <= 0 || checkLines.length === 0 || catalogLoading) return;

        const lineFingerprint = checkLines.map((line, index) => (
            [
                line?.check_line_id || index,
                line?.item_id || '',
                line?.quantity || '',
                line?.status || '',
                JSON.stringify(line?.modifiers_snapshot || [])
            ].join(':')
        )).join('|');
        const hydrationKey = `${normalizedFnbContext.fnb_checkout_request_id || checkId}:${lineFingerprint}`;
        const previous = fnbCheckoutHydrationRef.current;
        if (previous.key === hydrationKey && previous.status === 'loaded') return;

        if (safeCart.length > 0) {
            if (previous.key !== hydrationKey || previous.status !== 'blocked') {
                fnbCheckoutHydrationRef.current = { key: hydrationKey, status: 'blocked' };
                toast.error(`Clear the current sale before loading F&B check #${checkId}.`);
            }
            return;
        }

        const { lines, missingItemIds, invalidPriceItemIds } = buildFnbCheckCartLines({
            check: { check_id: checkId, lines: checkLines },
            catalog: safeCatalog
        });
        if (missingItemIds.length > 0) {
            fnbCheckoutHydrationRef.current = { key: hydrationKey, status: 'blocked' };
            toast.error(`Check #${checkId} includes an item unavailable in this POS catalog.`);
            return;
        }
        if (invalidPriceItemIds.length > 0 || lines.length === 0) {
            fnbCheckoutHydrationRef.current = { key: hydrationKey, status: 'blocked' };
            toast.error(`Check #${checkId} has an item without a valid selling price.`);
            return;
        }

        setCart(lines);
        fnbCheckoutHydrationRef.current = { key: hydrationKey, status: 'loaded' };
        toast.message(`Loaded ${lines.length} item${lines.length === 1 ? '' : 's'} from F&B check #${checkId}.`);
    }, [catalogLoading, hasFnbCheckoutContext, normalizedFnbContext, safeCart.length, safeCatalog, setCart]);

    return { checkoutAllowedOrderMethods };
};
