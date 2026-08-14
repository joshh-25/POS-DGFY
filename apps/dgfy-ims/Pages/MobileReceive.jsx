import React, { useMemo, useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import {
    Package,
    CheckCircle,
    AlertCircle,
    Loader2,
    ChevronRight,
    Calendar,
    Truck,
    Factory,
    Minus,
    Plus,
    ThumbsUp,
    ThumbsDown
} from 'lucide-react';
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from "@/components/ui/select";
import { toast } from 'sonner';
import { validateReceiveToken, receiveViaToken } from '../../../packages/web-core/src/services/receiveTokenService.js';
import { cn } from "../../../packages/web-core/src/lib/utils.js";
import { format, addDays } from 'date-fns';
import { normalizeApiError } from '../../../packages/web-core/src/utils/errorHandler.js';
import { useLocations } from '../../../packages/web-core/src/hooks/useLocations.js';

export default function MobileReceive() {
    const { token } = useParams();
    const navigate = useNavigate();
    const [loading, setLoading] = useState(true);
    const [submitting, setSubmitting] = useState(false);
    const [error, setError] = useState(null);
    const [tokenData, setTokenData] = useState(null);
    const [orderData, setOrderData] = useState(null);
    const [notes, setNotes] = useState('');
    const [success, setSuccess] = useState(false);
    const [countdown, setCountdown] = useState(5);

    // State for editable quantities (keyed by line_item_id)
    const [receivedQuantities, setReceivedQuantities] = useState({});
    // State for JO production quantity
    const [productionQuantity, setProductionQuantity] = useState(0);
    // State for JO quality check
    const [qualityCheck, setQualityCheck] = useState('passed');
    const [poLocationId, setPoLocationId] = useState('');
    const [sourceLocationId, setSourceLocationId] = useState('');
    const [destinationLocationId, setDestinationLocationId] = useState('');
    const { locations, loading: loadingLocations } = useLocations();
    const activeLocations = useMemo(
        () => (Array.isArray(locations) ? locations.filter((location) => location?.is_active !== false) : []),
        [locations]
    );

    useEffect(() => {
        validateToken();
    }, [token]);

    // Auto-redirect after success
    useEffect(() => {
        if (success) {
            const timer = setInterval(() => {
                setCountdown(prev => {
                    if (prev <= 1) {
                        clearInterval(timer);
                        return 0;
                    }
                    return prev - 1;
                });
            }, 1000);

            return () => clearInterval(timer);
        }
    }, [success]);

    useEffect(() => {
        if (countdown === 0) {
            navigate('/');
        }
    }, [countdown, navigate]);

    // Initialize quantities when order data loads
    useEffect(() => {
        if (orderData && orderData.order_type) {
            if (orderData.order_type === 'PO') {
                // PO Logic
                const initialQuantities = {};
                (orderData.items || []).forEach(item => {
                    const remaining = parseFloat(item.quantity_remaining);
                    initialQuantities[item.line_item_id] = isNaN(remaining) ? 0 : remaining;
                });
                setReceivedQuantities(initialQuantities);
                if (activeLocations.length >= 1) {
                    setPoLocationId(String(activeLocations[0].location_id));
                } else {
                    setPoLocationId('');
                }
            } else if (orderData.order_type === 'JO') {
                // JO Logic
                const currentProduced = parseFloat(orderData.quantity_produced || 0);
                const total = parseFloat(orderData.quantity_to_produce || 0);
                const remaining = total - currentProduced;
                setProductionQuantity(isNaN(remaining) ? 0 : Math.max(0, remaining));
                if (activeLocations.length >= 2) {
                    setSourceLocationId(String(activeLocations[0].location_id));
                    setDestinationLocationId(String(activeLocations[1].location_id));
                } else {
                    setSourceLocationId('');
                    setDestinationLocationId('');
                }
            }
        }
    }, [orderData, activeLocations]);

    const validateToken = async () => {
        try {
            setLoading(true);
            setError(null);
            const result = await validateReceiveToken(token);
            console.log(`[MobileReceive] Token Validate Result for ${token}:`, JSON.stringify({
                order_type: result.order?.order_type,
                token_type: result.receiveToken?.token_type,
                order_number: result.order?.order_number
            }, null, 2));
            if (!result.order) {
                console.warn('[MobileReceive] Warning: Token valid but no order attached!');
            }
            setTokenData(result);
            setOrderData(result.order);
        } catch (err) {
            setError(err.response?.data?.message || err.message || 'Invalid or expired token');
        } finally {
            setLoading(false);
        }
    };

    const handleQuantityChange = (lineItemId, value) => {
        if (value === '') {
            setReceivedQuantities(prev => ({
                ...prev,
                [lineItemId]: ''
            }));
            return;
        }

        const numValue = parseFloat(value);
        const safeValue = isNaN(numValue) ? 0 : Math.max(0, numValue);

        setReceivedQuantities(prev => ({
            ...prev,
            [lineItemId]: safeValue
        }));
    };

    const adjustQuantity = (lineItemId, delta) => {
        const current = receivedQuantities[lineItemId] || 0;
        handleQuantityChange(lineItemId, current + delta);
    };

    const setToMax = (lineItemId) => {
        const item = orderData?.items?.find(i => i.line_item_id === lineItemId);
        if (item) {
            const remaining = parseFloat(item.quantity_remaining);
            setReceivedQuantities(prev => ({
                ...prev,
                [lineItemId]: isNaN(remaining) ? 0 : remaining
            }));
        }
    };

    const handleProductionQuantityChange = (value) => {
        if (value === '') {
            setProductionQuantity('');
            return;
        }
        const numValue = parseFloat(value);
        const safeValue = isNaN(numValue) ? 0 : Math.max(0, numValue);
        setProductionQuantity(safeValue);
    };

    const adjustProductionQuantity = (delta) => {
        handleProductionQuantityChange(productionQuantity + delta);
    };

    const setProductionToMax = () => {
        if (!orderData) {
            console.warn('[MobileReceive] Cannot set MAX: No order data');
            return;
        }
        const target = parseFloat(orderData.quantity_to_produce) || 0;
        const produced = parseFloat(orderData.quantity_produced) || 0;
        const maxAllowed = Math.max(0, target - produced);
        console.log('[MobileReceive] Setting Production MAX:', maxAllowed, '(Target:', target, 'Produced:', produced, ')');
        setProductionQuantity(maxAllowed);
    };

    const handleReceive = async () => {
        if (!orderData || !tokenData) return;

        setSubmitting(true);
        try {
            let receiptData;

            if (orderData.order_type === 'PO') {
                const totalReceiving = Object.values(receivedQuantities).reduce((sum, qty) => sum + qty, 0);
                if (totalReceiving === 0) {
                    toast.error('Please enter at least one quantity to receive');
                    setSubmitting(false);
                    return;
                }

                if (!poLocationId) {
                    toast.error('Please select a receive location.');
                    setSubmitting(false);
                    return;
                }

                receiptData = {
                    location_id: Number(poLocationId),
                    line_items: (orderData.items || [])
                        .filter(item => (receivedQuantities[item.line_item_id] || 0) > 0)
                        .map(item => ({
                            line_item_id: item.line_item_id,
                            quantity_received: receivedQuantities[item.line_item_id],
                            quality_check_status: 'passed'
                        })),
                    notes,
                    delivery_rating: 5
                };
            } else {
                if (productionQuantity <= 0) {
                    toast.error('Please enter a quantity greater than 0');
                    setSubmitting(false);
                    return;
                }

                if (!sourceLocationId || !destinationLocationId) {
                    toast.error('Please select source and destination locations.');
                    setSubmitting(false);
                    return;
                }
                if (sourceLocationId === destinationLocationId) {
                    toast.error('Source and destination locations must be different.');
                    setSubmitting(false);
                    return;
                }

                receiptData = {
                    quantity_produced: productionQuantity,
                    notes,
                    quality_check: qualityCheck,
                    source_location_id: Number(sourceLocationId),
                    destination_location_id: Number(destinationLocationId)
                };
            }

            await receiveViaToken(token, receiptData);

            setSuccess(true);
            toast.success(orderData.order_type === 'PO'
                ? 'Purchase Order received successfully!'
                : 'Job Order updated successfully!');
        } catch (err) {
            const normalized = normalizeApiError(err);
            if (!normalized.isGlobalCandidate) {
                toast.error(normalized.message || 'Failed to complete operation');
            }
        } finally {
            setSubmitting(false);
        }
    };

    // Calculate total being received
    const totalReceiving = orderData?.order_type === 'PO'
        ? Object.values(receivedQuantities).reduce((sum, qty) => sum + (parseFloat(qty) || 0), 0)
        : (parseFloat(productionQuantity) || 0);

    if (loading) {
        return (
            <div className="min-h-screen bg-slate-100 flex items-center justify-center p-4">
                <div className="bg-white rounded-2xl p-8 text-center shadow-lg">
                    <Loader2 className="w-12 h-12 animate-spin text-teal-600 mx-auto mb-4" />
                    <p className="text-slate-600">Loading order details...</p>
                </div>
            </div>
        );
    }

    // Safety check: if we have orderData but it's missing type/ID, something is wrong
    const isMalformed = orderData && (!orderData.order_type || (!orderData.order_id && !orderData.po_id && !orderData.jo_id));

    if (error || isMalformed) {
        return (
            <div className="min-h-screen bg-slate-100 flex items-center justify-center p-4">
                <div className="bg-white rounded-2xl p-8 text-center shadow-lg max-w-md w-full">
                    <AlertCircle className="w-16 h-16 text-red-500 mx-auto mb-4" />
                    <h2 className="text-xl font-bold text-slate-900 mb-2">{isMalformed ? 'Data Link Error' : 'Token Error'}</h2>
                    <p className="text-slate-600 mb-6">
                        {isMalformed
                            ? 'The server validated your scan but returned incomplete order information. Please try refreshing or contact admin.'
                            : error}
                    </p>
                    <div className="flex flex-col gap-3">
                        <Button onClick={() => window.location.reload()} variant="teal" className="w-full">
                            Refresh Page
                        </Button>
                        <Button onClick={() => navigate('/')} variant="outline" className="w-full">
                            Go to Dashboard
                        </Button>
                    </div>

                    {/* DEBUG PANEL IN ERROR VIEW */}
                    <div className="mt-8 p-4 bg-slate-800 text-white rounded-lg font-mono text-xs overflow-auto max-h-64 text-left border-2 border-red-500">
                        <p className="text-red-400 mb-1 font-bold">--- DIAGNOSTIC DATA ---</p>
                        <p>Order Type: {orderData?.order_type || 'UNDEFINED'}</p>
                        <p>Order Number: {orderData?.order_number || 'NULL'}</p>
                        <hr className="my-2 border-slate-700" />
                        <p className="text-gray-400">Raw Order Data:</p>
                        <pre>{JSON.stringify(orderData, null, 2)}</pre>
                    </div>
                </div>
            </div>
        );
    }

    if (success) {
        return (
            <div className="min-h-screen bg-gradient-to-b from-emerald-500 to-emerald-600 flex items-center justify-center p-4">
                <div className="bg-white rounded-2xl p-8 text-center shadow-lg max-w-md">
                    <div className="w-20 h-20 bg-emerald-100 rounded-full flex items-center justify-center mx-auto mb-6">
                        <CheckCircle className="w-12 h-12 text-emerald-600" />
                    </div>
                    <h2 className="text-2xl font-bold text-slate-900 mb-2">
                        {orderData?.order_type === 'PO' ? 'Received!' : 'Updated!'}
                    </h2>
                    <p className="text-slate-600 mb-2">{orderData?.order_number}</p>
                    <p className="text-sm text-slate-500 mb-6">
                        Stock has been updated successfully.
                    </p>
                    <Button onClick={() => navigate('/')} className="w-full bg-teal-600 hover:bg-teal-700">
                        Go to Dashboard
                    </Button>
                    <p className="text-xs text-slate-400 mt-3">
                        Redirecting in {countdown}s...
                    </p>
                </div>
            </div>
        );
    }

    // Improved determination of order type
    let isPO = orderData?.order_type === 'PO';
    // Fallback: Check order number pattern if type is missing/ambiguous
    if (!orderData?.order_type && orderData?.order_number?.startsWith('PO-')) {
        isPO = true;
        console.warn('[MobileReceive] Forced PO type based on order number pattern');
    }

    const remainingToProduce = (!isPO && orderData)
        ? Math.max(0, (parseFloat(orderData.quantity_to_produce || 0) - parseFloat(orderData.quantity_produced || 0)))
        : 0;

    const safeRemainingToProduce = isNaN(remainingToProduce) ? 0 : remainingToProduce;

    return (
        <div className="min-h-screen bg-slate-100">
            {/* Header */}
            <div className={cn(
                "px-4 py-6 text-white",
                isPO ? "bg-gradient-to-r from-teal-600 to-teal-700" : "bg-gradient-to-r from-blue-600 to-blue-700"
            )}>
                <div className="flex items-center gap-3 mb-2">
                    {isPO ? (
                        <Truck className="w-6 h-6" />
                    ) : (
                        <Factory className="w-6 h-6" />
                    )}
                    <Badge variant="secondary" className="bg-white/20 text-white border-0">
                        {isPO ? 'PO Receive' : 'JO Production'}
                    </Badge>
                </div>
                <h1 className="text-2xl font-bold">{orderData?.order_number}</h1>
                {isPO && orderData?.supplier_name && (
                    <p className="text-white/80 mt-1">{orderData.supplier_name}</p>
                )}
                {!isPO && orderData?.product_name && (
                    <p className="text-white/80 mt-1">{orderData.product_name}</p>
                )}
            </div>

            {/* Content */}
            <div className="p-4 space-y-4">
                {/* Items with Quantity Inputs */}
                <div className="bg-white rounded-xl shadow-sm overflow-hidden">
                    <div className="px-4 py-3 bg-slate-50 border-b border-slate-200 flex justify-between items-center">
                        <h2 className="font-semibold text-slate-900">
                            {isPO ? 'Items to Receive' : 'Production Output'}
                        </h2>
                        <span className="text-sm text-slate-500">
                            Enter quantity
                        </span>
                    </div>
                    <div className="divide-y divide-slate-100">
                        {isPO ? (
                            orderData?.items?.map((item, idx) => (
                                <div key={idx} className="px-4 py-4">
                                    {/* Item Info Row */}
                                    <div className="flex justify-between items-start mb-3">
                                        <div className="flex-1">
                                            <p className="font-medium text-slate-900">{item.item_name}</p>
                                            <p className="text-sm text-slate-500">{item.sku_code}</p>
                                        </div>
                                        <div className="text-right">
                                            <p className="text-sm text-slate-500">
                                                Expected: <span className="font-medium text-slate-700">{parseFloat(item.quantity_remaining) || 0}</span>
                                            </p>
                                            <p className="text-xs text-slate-400">
                                                {item.unit_of_measure}
                                            </p>
                                        </div>
                                    </div>

                                    {/* Quantity Input Row */}
                                    <div className="flex items-center gap-2">
                                        <Button
                                            variant="outline"
                                            size="icon"
                                            className="h-12 w-12 flex-shrink-0"
                                            onClick={() => adjustQuantity(item.line_item_id, -1)}
                                            disabled={receivedQuantities[item.line_item_id] <= 0}
                                        >
                                            <Minus className="w-5 h-5" />
                                        </Button>

                                        <div className="flex-1 relative">
                                            <Input
                                                type="number"
                                                inputMode="decimal"
                                                value={isNaN(receivedQuantities[item.line_item_id]) ? '' : (receivedQuantities[item.line_item_id] ?? '')}
                                                onChange={(e) => handleQuantityChange(item.line_item_id, e.target.value)}
                                                className="h-12 text-center text-xl font-bold pr-16"
                                                min={0}
                                            />
                                            <Button
                                                variant="ghost"
                                                size="sm"
                                                className="absolute right-1 top-1/2 -translate-y-1/2 text-xs text-teal-600 hover:text-teal-700"
                                                onClick={() => setToMax(item.line_item_id)}
                                            >
                                                MAX
                                            </Button>
                                        </div>

                                        <Button
                                            variant="outline"
                                            size="icon"
                                            className="h-12 w-12 flex-shrink-0"
                                            onClick={() => adjustQuantity(item.line_item_id, 1)}
                                        >
                                            <Plus className="w-5 h-5" />
                                        </Button>
                                    </div>
                                </div>
                            ))
                        ) : (
                            // JO Production Input
                            <div className="px-4 py-4">
                                <div className="flex justify-between items-start mb-3">
                                    <div className="flex-1">
                                        <p className="font-medium text-slate-900">Quantity Produced</p>
                                        <p className="text-sm text-slate-500">
                                            Remaining: {safeRemainingToProduce}
                                        </p>
                                    </div>
                                    <div className="text-right">
                                        <p className="text-sm text-slate-500">
                                            Total: <span className="font-medium text-slate-700">{parseFloat(orderData?.quantity_to_produce) || 0}</span>
                                        </p>
                                    </div>
                                </div>

                                <div className="flex items-center gap-2">
                                    <Button
                                        variant="outline"
                                        size="icon"
                                        className="h-12 w-12 flex-shrink-0"
                                        onClick={() => adjustProductionQuantity(-1)}
                                        disabled={productionQuantity <= 0}
                                    >
                                        <Minus className="w-5 h-5" />
                                    </Button>

                                    <div className="flex-1 relative">
                                        <Input
                                            type="number"
                                            inputMode="decimal"
                                            value={isNaN(productionQuantity) ? '' : productionQuantity}
                                            onChange={(e) => handleProductionQuantityChange(e.target.value)}
                                            className="h-12 text-center text-xl font-bold pr-16"
                                            min={0}
                                        />
                                        <Button
                                            variant="ghost"
                                            size="sm"
                                            className="absolute right-1 top-1/2 -translate-y-1/2 text-xs text-teal-600 hover:text-teal-700"
                                            onClick={setProductionToMax}
                                        >
                                            MAX
                                        </Button>
                                    </div>

                                    <Button
                                        variant="outline"
                                        size="icon"
                                        className="h-12 w-12 flex-shrink-0"
                                        onClick={() => adjustProductionQuantity(1)}
                                    >
                                        <Plus className="w-5 h-5" />
                                    </Button>
                                </div>

                                {/* Ingredients Summary */}
                                <div className="mt-6 pt-4 border-t border-slate-100">
                                    <p className="text-sm font-medium text-slate-700 mb-3">Ingredients Consumption (Est.)</p>
                                    <div className="space-y-2">
                                        {orderData?.ingredients?.map((ing, idx) => {
                                            const req = parseFloat(ing.quantity_required) || 0;
                                            const total = parseFloat(orderData.quantity_to_produce) || 1;
                                            const ratio = productionQuantity / total;
                                            const estimated = req * ratio;

                                            return (
                                                <div key={idx} className="flex justify-between items-center text-sm">
                                                    <span className="text-slate-600">{ing.item_name}</span>
                                                    <span className="text-slate-900 font-mono">
                                                        {(isNaN(estimated) ? 0 : estimated).toFixed(2)} {ing.unit_of_measure}
                                                    </span>
                                                </div>
                                            );
                                        })}
                                    </div>
                                </div>

                                {/* Quality Check */}
                                <div className="mt-6 pt-4 border-t border-slate-100">
                                    <p className="text-sm font-medium text-slate-700 mb-3">Quality Check</p>
                                    <Select value={qualityCheck} onValueChange={setQualityCheck}>
                                        <SelectTrigger className="w-full h-12">
                                            <SelectValue />
                                        </SelectTrigger>
                                        <SelectContent>
                                            <SelectItem value="passed">
                                                <div className="flex items-center gap-2">
                                                    <ThumbsUp className="w-4 h-4 text-emerald-500" />
                                                    Pass (Good Quality)
                                                </div>
                                            </SelectItem>
                                            <SelectItem value="failed">
                                                <div className="flex items-center gap-2">
                                                    <ThumbsDown className="w-4 h-4 text-red-500" />
                                                    Fail (Rejected/Scrap)
                                                </div>
                                            </SelectItem>
                                        </SelectContent>
                                    </Select>
                                </div>
                            </div>
                        )}
                    </div>
                </div>

                <div className="bg-white rounded-xl shadow-sm p-4 space-y-4">
                    {isPO ? (
                        <div className="space-y-2">
                            <label className="block text-sm font-medium text-slate-700">Receive Location</label>
                            <Select value={poLocationId} onValueChange={setPoLocationId} disabled={loadingLocations}>
                                <SelectTrigger className="h-12">
                                    <SelectValue placeholder={loadingLocations ? 'Loading locations...' : 'Select location'} />
                                </SelectTrigger>
                                <SelectContent>
                                    {activeLocations.map((location) => (
                                        <SelectItem key={`po-${location.location_id}`} value={String(location.location_id)}>
                                            {location.name}
                                        </SelectItem>
                                    ))}
                                </SelectContent>
                            </Select>
                        </div>
                    ) : (
                        <>
                            <div className="space-y-2">
                                <label className="block text-sm font-medium text-slate-700">Ingredient Source Location</label>
                                <Select value={sourceLocationId} onValueChange={setSourceLocationId} disabled={loadingLocations}>
                                    <SelectTrigger className="h-12">
                                        <SelectValue placeholder={loadingLocations ? 'Loading locations...' : 'Select source location'} />
                                    </SelectTrigger>
                                    <SelectContent>
                                        {activeLocations.map((location) => (
                                            <SelectItem key={`src-${location.location_id}`} value={String(location.location_id)}>
                                                {location.name}
                                            </SelectItem>
                                        ))}
                                    </SelectContent>
                                </Select>
                            </div>
                            <div className="space-y-2">
                                <label className="block text-sm font-medium text-slate-700">Output Destination Location</label>
                                <Select value={destinationLocationId} onValueChange={setDestinationLocationId} disabled={loadingLocations}>
                                    <SelectTrigger className="h-12">
                                        <SelectValue placeholder={loadingLocations ? 'Loading locations...' : 'Select destination location'} />
                                    </SelectTrigger>
                                    <SelectContent>
                                        {activeLocations.map((location) => (
                                            <SelectItem key={`dst-${location.location_id}`} value={String(location.location_id)}>
                                                {location.name}
                                            </SelectItem>
                                        ))}
                                    </SelectContent>
                                </Select>
                                {sourceLocationId && destinationLocationId && sourceLocationId === destinationLocationId && (
                                    <p className="text-xs text-red-600">Source and destination locations must be different.</p>
                                )}
                            </div>
                        </>
                    )}
                </div>

                {/* Summary */}
                <div className="bg-white rounded-xl shadow-sm p-4">
                    <div className="flex justify-between items-center">
                        <span className="text-slate-600">
                            {isPO ? 'Total Items' : 'Total Output'}
                        </span>
                        <span className="text-xl font-bold text-slate-900">
                            {isPO ? orderData?.total_items : orderData?.quantity_to_produce}
                        </span>
                    </div>
                    {isPO ? (
                        <>
                            <div className="flex justify-between items-center mt-2 pt-2 border-t border-slate-100">
                                <span className="text-slate-600">Total Expected</span>
                                <span className="font-medium text-slate-700">
                                    {orderData?.total_remaining}
                                </span>
                            </div>
                            <div className="flex justify-between items-center mt-2 pt-2 border-t border-slate-100">
                                <span className="text-slate-600 font-medium">Receiving Now</span>
                                <span className="text-xl font-bold text-teal-600">
                                    {isNaN(totalReceiving) ? 0 : totalReceiving}
                                </span>
                            </div>
                        </>
                    ) : (
                        <>
                            <div className="flex justify-between items-center mt-2 pt-2 border-t border-slate-100">
                                <span className="text-slate-600">Already Produced</span>
                                <span className="font-medium text-slate-700">
                                    {orderData?.quantity_produced || 0}
                                </span>
                            </div>
                            <div className="flex justify-between items-center mt-2 pt-2 border-t border-slate-100">
                                <span className="text-slate-600 font-medium">Producing Now</span>
                                <span className="text-xl font-bold text-teal-600">
                                    {isNaN(productionQuantity) ? 0 : productionQuantity}
                                </span>
                            </div>
                        </>
                    )}
                </div>

                {/* Notes */}
                <div className="bg-white rounded-xl shadow-sm p-4">
                    <label className="block text-sm font-medium text-slate-700 mb-2">
                        Notes (optional)
                    </label>
                    <Textarea
                        value={notes}
                        onChange={(e) => setNotes(e.target.value)}
                        placeholder={isPO ? "Add notes about this delivery..." : "Add notes about this production..."}
                        rows={2}
                        className="resize-none"
                    />
                </div>

                {/* Warning for JO with insufficient stock */}
                {!isPO && !orderData?.all_ingredients_sufficient && (
                    <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 flex items-start gap-3">
                        <AlertCircle className="w-5 h-5 text-amber-600 flex-shrink-0 mt-0.5" />
                        <div>
                            <p className="font-medium text-amber-800">Insufficient Stock</p>
                            <p className="text-sm text-amber-700">
                                Some ingredients don't have enough stock. Please verify before proceeding.
                            </p>
                        </div>
                    </div>
                )}
            </div>

            {/* Fixed Bottom Actions */}
            <div className="fixed bottom-0 left-0 right-0 bg-white border-t border-slate-200 p-4 shadow-lg">
                <Button
                    onClick={handleReceive}
                    disabled={
                        submitting
                        || (totalReceiving === 0)
                        || (isPO && !poLocationId)
                        || (!isPO && (!sourceLocationId || !destinationLocationId || sourceLocationId === destinationLocationId))
                    }
                    className={cn(
                        "w-full h-14 text-lg font-semibold",
                        isPO ? "bg-teal-600 hover:bg-teal-700" : "bg-blue-600 hover:bg-blue-700"
                    )}
                >
                    {submitting ? (
                        <>
                            <Loader2 className="w-5 h-5 mr-2 animate-spin" />
                            Processing...
                        </>
                    ) : (
                        <>
                            <CheckCircle className="w-5 h-5 mr-2" />
                            {isPO ? `Receive ${totalReceiving} Items` : `Complete ${totalReceiving} Units`}
                        </>
                    )}
                </Button>
            </div>

            {/* Bottom padding for fixed button */}
            <div className="h-24" />

            {import.meta.env.DEV && (
            <div className="p-4 m-4 bg-slate-800 text-white rounded-lg font-mono text-xs overflow-auto max-h-96 border-2 border-red-500">
                <p className="text-red-400 mb-1 font-bold">--- DIAGNOSTIC DATA ---</p>
                <p>Is PO Detected: {isPO ? 'YES' : 'NO'}</p>
                <p>Order Type: {orderData?.order_type || 'UNDEFINED'}</p>
                <p>Order Number: {orderData?.order_number || 'NULL'}</p>
                <hr className="my-2 border-slate-700" />
                <p className="text-gray-400">Raw Order Data:</p>
                <pre>{JSON.stringify(orderData, null, 2)}</pre>
            </div>
            )}
        </div>
    );
}
