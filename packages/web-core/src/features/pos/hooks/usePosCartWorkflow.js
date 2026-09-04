import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { posToast as toast } from '@/src/utils/iminRuntimeFeedback.js';
import { fetchPosItemOptionGroups } from '../services/posService';
import { isServiceCatalogItem } from '../utils/posCatalogAvailability.js';
import { allowsDecimalQuantity } from '@/src/utils/uomConverter.js';
import {
    buildStockExceededMessage,
    createCartLineKey,
    getLineKey,
    isSeniorPwdDiscountEligible,
    resolvePosCatalogImageSources,
    round4,
    toArray
} from '../utils/posCheckoutTerminalUtils.js';
import {
    buildDefaultLineModifiers,
    buildKitchenStationSnapshot,
    getFnbModifierGroups,
    resolveModifierDelta
} from '../utils/posCheckoutTerminalModifiers.js';

export const QTY_METER_LONG_PRESS_MS = 300;
export const QTY_METER_MOVE_CANCEL_PX = 10;
export const QTY_METER_MAX_DRAG_PX = 96;
export const QTY_METER_MIN_QTY = 0;
export const QTY_METER_MAX_QTY = 20;

const EMPTY_SERVICE_OPTIONS_MODAL = { open: false, item: null, groups: [] };

/**
 * Owns the current-sale cart workflow without owning checkout, payment, or
 * parked-sale API orchestration. The terminal keeps the existing render and
 * business-calculation contracts while this hook centralizes cart mutations,
 * service options, quantity gestures, and add-to-cart feedback.
 */
export const usePosCartWorkflow = ({
    sessionLocked = false,
    checkoutBlockedReason = '',
    parkedSaleReleaseLoading = false,
    activeParkedSale = null,
    catalog = [],
    receiptSettings = {},
    posWorkflow = { allowedMethods: [] },
    isFnbWorkflow = false,
    normalizedFnbContext = null,
    setOrderMethod = () => {},
    onCartBecameEmpty = () => {},
    onCartLineRemoved = () => {},
    onCatalogAddAnimation = () => {}
} = {}) => {
    const [cart, setCart] = useState([]);
    const [serviceOptionsModal, setServiceOptionsModal] = useState(EMPTY_SERVICE_OPTIONS_MODAL);
    const [serviceOptionsLoadingItemId, setServiceOptionsLoadingItemId] = useState(null);
    const serviceOptionsRequestRef = useRef(0);
    const [editingQuantityItemId, setEditingQuantityItemId] = useState(null);
    const [quantityInputValue, setQuantityInputValue] = useState('');
    const [addToCartToasts, setAddToCartToasts] = useState([]);
    const [qtyMeterState, setQtyMeterState] = useState(null);
    const qtyMeterTimerRef = useRef(null);
    const qtyMeterGestureRef = useRef(null);

    const safeCart = useMemo(() => toArray(cart), [cart]);
    const posActionsBlocked = Boolean(checkoutBlockedReason) || parkedSaleReleaseLoading;
    const notifyPosActionBlocked = useCallback(() => {
        toast.error(
            parkedSaleReleaseLoading
                ? 'Returning the parked sale to the queue. Please wait.'
                : (checkoutBlockedReason || 'You cannot use the POS because the shift is closed.')
        );
    }, [checkoutBlockedReason, parkedSaleReleaseLoading]);
    const itemStockById = useMemo(
        () => new Map((catalog || []).map((item) => {
            if (isServiceCatalogItem(item) || item?.pos_always_available === true) {
                return [Number(item?.item_id), Number.POSITIVE_INFINITY];
            }
            const stock = Number(item?.current_stock);
            return [
                Number(item?.item_id),
                Number.isFinite(stock) ? Math.max(0, stock) : 0
            ];
        })),
        [catalog]
    );

    const triggerAddToCartToast = useCallback((item, addedQty = 1) => {
        if (!item) return;
        const itemId = item.item_id;
        const itemName = item.name || 'Item';
        const { src: imageSrc } = resolvePosCatalogImageSources(item, receiptSettings);

        setAddToCartToasts((prev) => {
            const existingIndex = prev.findIndex((entry) => entry.itemId === itemId);
            if (existingIndex !== -1) {
                const updated = [...prev];
                const existing = updated[existingIndex];
                updated[existingIndex] = {
                    ...existing,
                    quantity: existing.quantity + addedQty,
                    timestamp: Date.now()
                };
                return updated;
            }
            return [
                {
                    id: `toast-${itemId}-${Date.now()}`,
                    itemId,
                    itemName,
                    imageSrc: imageSrc || null,
                    quantity: addedQty,
                    timestamp: Date.now()
                },
                ...prev
            ].slice(0, 4);
        });
    }, [receiptSettings]);

    const handleDismissToast = useCallback((toastId) => {
        setAddToCartToasts((prev) => prev.filter((entry) => entry.id !== toastId));
    }, []);

    useEffect(() => {
        if (addToCartToasts.length === 0) return undefined;
        const timer = setInterval(() => {
            const now = Date.now();
            setAddToCartToasts((prev) => prev.filter((entry) => now - entry.timestamp < 2500));
        }, 250);
        return () => clearInterval(timer);
    }, [addToCartToasts.length]);

    const addToCart = (item, options = {}) => {
        if (posActionsBlocked) {
            notifyPosActionBlocked();
            return;
        }
        const requestedAddQty = Math.max(0.0001, Number(options.quantity || 1));
        const stockFromCatalog = itemStockById.get(Number(item.item_id));
        const maxStock = Number.isFinite(stockFromCatalog)
            ? stockFromCatalog
            : (stockFromCatalog === Number.POSITIVE_INFINITY ? Number.POSITIVE_INFINITY : Math.max(0, Number(item.current_stock) || 0));
        if (Number.isFinite(maxStock) && maxStock <= 0) {
            toast.error(buildStockExceededMessage({
                itemName: item.name,
                requestedQty: requestedAddQty,
                availableStock: maxStock,
                unit: item.unit_of_measure || ''
            }));
            return;
        }

        const defaultPrice = Number(item.default_sale_price ?? 0);
        if (!Number.isFinite(defaultPrice) || defaultPrice <= 0) {
            toast.error(`${item.name || 'Item'} needs a selling price before it can be sold in POS.`);
            return;
        }
        const serviceOptionIds = [...new Set((Array.isArray(options.selectedOptionIds) ? options.selectedOptionIds : [])
            .map((id) => Number(id))
            .filter((id) => Number.isInteger(id) && id > 0))]
            .sort((left, right) => left - right);
        const serviceOptionDetails = (Array.isArray(options.selectedOptionDetails) ? options.selectedOptionDetails : [])
            .filter((option) => Number(option?.option_id) > 0)
            .map((option) => ({
                option_id: Number(option.option_id),
                group_id: Number(option.group_id || 0) || null,
                group_name: String(option.groupName || option.group_name || '').trim() || null,
                group_type: String(option.groupType || option.group_type || 'addon').trim() || 'addon',
                name: String(option.name || '').trim(),
                price_adjustment_centavos: Number(option.price_adjustment_centavos) || 0,
                duration_adjustment_minutes: Number(option.duration_adjustment_minutes) || 0
            }));
        const modifierGroups = getFnbModifierGroups(item);
        const defaultModifiers = buildDefaultLineModifiers(item);
        const routed = buildKitchenStationSnapshot(item);
        const modifierLineSeed = {
            modifier_groups: modifierGroups,
            line_modifiers: defaultModifiers
        };
        const serviceOptionPriceDelta = serviceOptionDetails.reduce(
            (sum, option) => sum + ((Number(option.price_adjustment_centavos) || 0) / 100),
            0
        );
        const linePrice = round4(defaultPrice + resolveModifierDelta(modifierLineSeed, defaultModifiers) + serviceOptionPriceDelta);
        if (!Number.isFinite(linePrice) || linePrice <= 0) {
            toast.error(`${item.name || 'Service'} has an invalid price after applying its options.`);
            return;
        }
        const serviceOptionSignature = serviceOptionIds.join(',');
        // Only default order_method to 'appointment' when this service is the
        // very first line in an empty basket.
        if (isServiceCatalogItem(item) && cart.length === 0 && posWorkflow.allowedMethods.includes('appointment')) {
            setOrderMethod('appointment');
        }
        let stockWarning = '';
        setCart((prev) => {
            const existing = modifierGroups.length > 0 || serviceOptionIds.length > 0
                ? prev.find((line) => (
                    line.item_id === item.item_id
                    && [...new Set((Array.isArray(line.service_option_ids) ? line.service_option_ids : [])
                        .map((id) => Number(id))
                        .filter((id) => Number.isInteger(id) && id > 0))]
                        .sort((left, right) => left - right)
                        .join(',') === serviceOptionSignature
                ))
                : prev.find((line) => line.item_id === item.item_id);
            if (existing) {
                const requestedQty = Number(existing.quantity) + requestedAddQty;
                const safeQty = Number.isFinite(maxStock) ? round4(Math.min(requestedQty, maxStock)) : round4(requestedQty);
                if (Number.isFinite(maxStock) && requestedQty > maxStock) {
                    stockWarning = buildStockExceededMessage({
                        itemName: item.name,
                        requestedQty,
                        availableStock: maxStock,
                        unit: item.unit_of_measure || ''
                    });
                }
                return prev.map((line) => (
                    line.item_id === item.item_id
                        ? {
                            ...line,
                            quantity: safeQty,
                            vat_type: line.vat_type || item.vat_type || 'vatable',
                            senior_pwd_discount_eligible: isSeniorPwdDiscountEligible(item.senior_pwd_discount_eligible),
                            scan_metadata: options.scanMetadata || line.scan_metadata || null,
                            service_option_ids: serviceOptionIds.length > 0 ? serviceOptionIds : (line.service_option_ids || []),
                            service_option_details: serviceOptionDetails.length > 0 ? serviceOptionDetails : (line.service_option_details || [])
                        }
                        : line
                ));
            }
            return [
                ...prev,
                {
                    line_key: createCartLineKey(item.item_id),
                    item_id: item.item_id,
                    item_name: item.name,
                    quantity: Number.isFinite(maxStock) ? round4(Math.min(requestedAddQty, maxStock)) : round4(requestedAddQty),
                    base_sale_price: defaultPrice,
                    sale_price: linePrice,
                    price_override_reason: '',
                    unit_of_measure: item.unit_of_measure,
                    category: item.category,
                    vat_type: item.vat_type || 'vatable',
                    senior_pwd_discount_eligible: isSeniorPwdDiscountEligible(item.senior_pwd_discount_eligible),
                    course: isFnbWorkflow ? (routed.course || normalizedFnbContext?.default_course || 'main') : null,
                    kitchen_station_id: isFnbWorkflow ? (routed.kitchen_station_id || null) : null,
                    fnbKitchenRoutes: isFnbWorkflow && Array.isArray(item.fnbKitchenRoutes) ? item.fnbKitchenRoutes : [],
                    modifier_groups: isFnbWorkflow ? modifierGroups : [],
                    line_modifiers: isFnbWorkflow ? defaultModifiers : [],
                    service_option_ids: serviceOptionIds,
                    service_option_details: serviceOptionDetails,
                    special_instructions: '',
                    scan_metadata: options.scanMetadata || null
                }
            ];
        });
        if (stockWarning) toast.error(stockWarning);
        triggerAddToCartToast(item, requestedAddQty);
    };

    const addCatalogItemToCart = async (item, options = {}) => {
        if (!isServiceCatalogItem(item)) {
            addToCart(item, options);
            return true;
        }

        const requestId = serviceOptionsRequestRef.current + 1;
        serviceOptionsRequestRef.current = requestId;
        setServiceOptionsLoadingItemId(Number(item.item_id));
        try {
            const response = await fetchPosItemOptionGroups(item.item_id);
            if (requestId !== serviceOptionsRequestRef.current) return false;
            const groups = Array.isArray(response?.groups) ? response.groups : [];
            if (groups.length === 0) {
                addToCart(item, options);
                return true;
            }
            setServiceOptionsModal({ open: true, item, groups, quantity: options.quantity || 1 });
            return false;
        } catch (error) {
            toast.error(error?.response?.data?.message || 'Unable to load service options.');
            return false;
        } finally {
            if (requestId === serviceOptionsRequestRef.current) setServiceOptionsLoadingItemId(null);
        }
    };

    const handleConfirmServiceOptions = ({ serviceItem, selectedOptionIds, selectedOptionDetails }) => {
        const quantity = Math.max(0.0001, Number(serviceOptionsModal.quantity || 1));
        addToCart(serviceItem, { quantity, selectedOptionIds, selectedOptionDetails });
        setServiceOptionsModal(EMPTY_SERVICE_OPTIONS_MODAL);
    };

    const updateCartLine = (lineKey, patch, { allowWhenCheckoutBlocked = false } = {}) => {
        if (sessionLocked) {
            notifyPosActionBlocked();
            return false;
        }
        if (posActionsBlocked && !allowWhenCheckoutBlocked) {
            notifyPosActionBlocked();
            return false;
        }
        setCart((prev) => prev.map((line) => (
            getLineKey(line) === lineKey ? { ...line, ...patch } : line
        )));
        return true;
    };

    const updateCartQuantity = (lineKey, requestedQuantity) => {
        if (posActionsBlocked) {
            notifyPosActionBlocked();
            return;
        }
        const parsedQty = Number(requestedQuantity);
        if (!Number.isFinite(parsedQty)) return;

        let stockWarning = '';
        const nextCart = safeCart
            .map((line) => {
                if (getLineKey(line) !== lineKey) return line;
                const maxStock = itemStockById.get(Number(line.item_id));
                const safeMax = Number.isFinite(maxStock) ? maxStock : Number.POSITIVE_INFINITY;
                const safeQty = round4(Math.max(0, Math.min(parsedQty, safeMax)));
                if (Number.isFinite(safeMax) && parsedQty > safeMax) {
                    stockWarning = buildStockExceededMessage({
                        itemName: line.item_name,
                        requestedQty: parsedQty,
                        availableStock: safeMax,
                        unit: line.unit_of_measure || ''
                    });
                }
                // Quantity controls may never remove a cart line. Keep the
                // current line intact at zero; explicit removal belongs to
                // removeCartLine (the trash action) only.
                if (safeQty <= 0) return line;
                return { ...line, quantity: safeQty };
            })
            .filter(Boolean);

        if (nextCart.length === 0 && activeParkedSale?.pos_parked_sale_id) {
            void onCartBecameEmpty();
            return;
        }
        setCart(nextCart);
        if (stockWarning) toast.error(stockWarning);
    };

    const adjustCartQuantity = (item, delta) => {
        if (posActionsBlocked) {
            notifyPosActionBlocked();
            return;
        }
        const existing = safeCart.find((line) => line.item_id === item.item_id);
        if (!existing) {
            if (delta > 0) addCatalogItemToCart(item, { quantity: delta });
            return;
        }
        updateCartQuantity(getLineKey(existing), Number(existing.quantity || 0) + delta);
    };

    const commitManualCartQuantity = (item) => {
        const parsedQuantity = allowsDecimalQuantity(item.unit_of_measure)
            ? Math.max(0, round4(Number(quantityInputValue)) || 0)
            : Math.max(0, Math.floor(Number(quantityInputValue)) || 0);
        setEditingQuantityItemId(null);
        const existing = safeCart.find((line) => line.item_id === item.item_id);
        if (existing) updateCartQuantity(getLineKey(existing), parsedQuantity);
        else if (parsedQuantity > 0) addCatalogItemToCart(item, { quantity: parsedQuantity });
    };

    const clearQtyMeterTimer = () => {
        if (qtyMeterTimerRef.current) {
            clearTimeout(qtyMeterTimerRef.current);
            qtyMeterTimerRef.current = null;
        }
    };

    const handleQtyButtonPointerDown = (event, item) => {
        if (event.pointerType === 'mouse' && event.button !== 0) return;
        const buttonRect = event.currentTarget.getBoundingClientRect();
        qtyMeterGestureRef.current = {
            itemId: item.item_id,
            pointerId: event.pointerId,
            startX: event.clientX,
            startY: event.clientY,
            anchorX: buttonRect.left,
            anchorY: buttonRect.top + (buttonRect.height / 2),
            activated: false,
            cancelled: false,
            quantity: QTY_METER_MIN_QTY
        };
        clearQtyMeterTimer();
        qtyMeterTimerRef.current = setTimeout(() => {
            const gesture = qtyMeterGestureRef.current;
            if (!gesture || gesture.itemId !== item.item_id || gesture.cancelled) return;
            gesture.activated = true;
            setQtyMeterState({ quantity: gesture.quantity, x: gesture.anchorX, y: gesture.anchorY });
        }, QTY_METER_LONG_PRESS_MS);
    };

    const handleQtyButtonPointerMove = (event, item) => {
        const gesture = qtyMeterGestureRef.current;
        if (!gesture || gesture.itemId !== item.item_id || gesture.cancelled) return;
        const deltaX = event.clientX - gesture.startX;
        const deltaY = event.clientY - gesture.startY;
        if (!gesture.activated) {
            if (Math.hypot(deltaX, deltaY) > QTY_METER_MOVE_CANCEL_PX) {
                gesture.cancelled = true;
                clearQtyMeterTimer();
            }
            return;
        }
        const upwardPx = Math.min(QTY_METER_MAX_DRAG_PX, Math.max(0, -deltaY));
        const ratio = upwardPx / QTY_METER_MAX_DRAG_PX;
        const quantity = QTY_METER_MIN_QTY + Math.round(ratio * (QTY_METER_MAX_QTY - QTY_METER_MIN_QTY));
        gesture.quantity = quantity;
        setQtyMeterState({ quantity, x: gesture.anchorX, y: gesture.anchorY });
    };

    const handleQtyButtonPointerUp = (event, item) => {
        const gesture = qtyMeterGestureRef.current;
        clearQtyMeterTimer();
        qtyMeterGestureRef.current = null;
        setQtyMeterState(null);
        if (!gesture || gesture.itemId !== item.item_id || gesture.cancelled) return;

        const cardElement = event.currentTarget.closest('[data-pos-catalog-card]');
        if (gesture.activated) {
            if (gesture.quantity <= 0) return;
            adjustCartQuantity(item, gesture.quantity);
        } else {
            adjustCartQuantity(item, 1);
        }
        onCatalogAddAnimation(cardElement);
    };

    const handleQtyButtonPointerCancel = () => {
        clearQtyMeterTimer();
        qtyMeterGestureRef.current = null;
        setQtyMeterState(null);
    };

    const handleCartQtyButtonPointerDown = (event, line) => {
        if (event.pointerType === 'mouse' && event.button !== 0) return;
        const lineKey = getLineKey(line);
        const buttonRect = event.currentTarget.getBoundingClientRect();
        qtyMeterGestureRef.current = {
            itemId: lineKey,
            pointerId: event.pointerId,
            startX: event.clientX,
            startY: event.clientY,
            anchorX: buttonRect.left,
            anchorY: buttonRect.top + (buttonRect.height / 2),
            activated: false,
            cancelled: false,
            quantity: QTY_METER_MIN_QTY
        };
        clearQtyMeterTimer();
        qtyMeterTimerRef.current = setTimeout(() => {
            const gesture = qtyMeterGestureRef.current;
            if (!gesture || gesture.itemId !== lineKey || gesture.cancelled) return;
            gesture.activated = true;
            setQtyMeterState({ quantity: gesture.quantity, x: gesture.anchorX, y: gesture.anchorY });
        }, QTY_METER_LONG_PRESS_MS);
    };

    const handleCartQtyButtonPointerMove = (event, line) => {
        const lineKey = getLineKey(line);
        const gesture = qtyMeterGestureRef.current;
        if (!gesture || gesture.itemId !== lineKey || gesture.cancelled) return;
        const deltaX = event.clientX - gesture.startX;
        const deltaY = event.clientY - gesture.startY;
        if (!gesture.activated) {
            if (Math.hypot(deltaX, deltaY) > QTY_METER_MOVE_CANCEL_PX) {
                gesture.cancelled = true;
                clearQtyMeterTimer();
            }
            return;
        }
        const upwardPx = Math.min(QTY_METER_MAX_DRAG_PX, Math.max(0, -deltaY));
        const ratio = upwardPx / QTY_METER_MAX_DRAG_PX;
        const quantity = QTY_METER_MIN_QTY + Math.round(ratio * (QTY_METER_MAX_QTY - QTY_METER_MIN_QTY));
        gesture.quantity = quantity;
        setQtyMeterState({ quantity, x: gesture.anchorX, y: gesture.anchorY });
    };

    const handleCartQtyButtonPointerUp = (event, line) => {
        const lineKey = getLineKey(line);
        const gesture = qtyMeterGestureRef.current;
        clearQtyMeterTimer();
        qtyMeterGestureRef.current = null;
        setQtyMeterState(null);
        if (!gesture || gesture.itemId !== lineKey || gesture.cancelled) return;

        const currentQuantity = Number(line.quantity || 0);
        if (gesture.activated) {
            if (gesture.quantity <= 0) return;
            updateCartQuantity(lineKey, currentQuantity + gesture.quantity);
        } else {
            updateCartQuantity(lineKey, currentQuantity + 1);
        }
    };

    const handleCartQtyButtonPointerCancel = () => {
        clearQtyMeterTimer();
        qtyMeterGestureRef.current = null;
        setQtyMeterState(null);
    };

    const removeCartLine = (lineKey) => {
        if (posActionsBlocked) {
            notifyPosActionBlocked();
            return;
        }
        const nextCart = safeCart.filter((line) => getLineKey(line) !== lineKey);
        if (nextCart.length === 0 && activeParkedSale?.pos_parked_sale_id) {
            void onCartBecameEmpty();
            return;
        }
        onCartLineRemoved(lineKey);
        setCart(nextCart);
    };

    return {
        cart,
        setCart,
        safeCart,
        posActionsBlocked,
        notifyPosActionBlocked,
        itemStockById,
        serviceOptionsModal,
        setServiceOptionsModal,
        serviceOptionsLoadingItemId,
        editingQuantityItemId,
        setEditingQuantityItemId,
        quantityInputValue,
        setQuantityInputValue,
        addToCartToasts,
        handleDismissToast,
        qtyMeterState,
        addToCart,
        addCatalogItemToCart,
        handleConfirmServiceOptions,
        updateCartLine,
        updateCartQuantity,
        adjustCartQuantity,
        commitManualCartQuantity,
        handleQtyButtonPointerDown,
        handleQtyButtonPointerMove,
        handleQtyButtonPointerUp,
        handleQtyButtonPointerCancel,
        handleCartQtyButtonPointerDown,
        handleCartQtyButtonPointerMove,
        handleCartQtyButtonPointerUp,
        handleCartQtyButtonPointerCancel,
        removeCartLine,
        QTY_METER_MIN_QTY,
        QTY_METER_MAX_QTY
    };
};
