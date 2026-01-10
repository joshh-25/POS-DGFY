import React, { useState, useEffect } from 'react';
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
    Plus
} from 'lucide-react';
import { toast } from 'sonner';
import { validateReceiveToken, markTokenUsed } from '../src/services/receiveTokenService.js';
import { receivePurchaseOrder } from '../src/services/purchaseOrderService.js';
import { completeJobOrder } from '../src/services/jobOrderService.js';
import { cn } from "../src/lib/utils.js";
import { format, addDays } from 'date-fns';

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
                        navigate('/');
                        return 0;
                    }
                    return prev - 1;
                });
            }, 1000);

            return () => clearInterval(timer);
        }
    }, [success, navigate]);

    // Initialize quantities when order data loads
    useEffect(() => {
        if (orderData?.items) {
            const initialQuantities = {};
            orderData.items.forEach(item => {
                // Default to remaining quantity
                initialQuantities[item.line_item_id] = item.quantity_remaining;
            });
            setReceivedQuantities(initialQuantities);
        }
    }, [orderData]);

    const validateToken = async () => {
        try {
            setLoading(true);
            setError(null);
            const result = await validateReceiveToken(token);
            setTokenData(result);
            setOrderData(result.order);
        } catch (err) {
            setError(err.response?.data?.message || err.message || 'Invalid or expired token');
        } finally {
            setLoading(false);
        }
    };

    const handleQuantityChange = (lineItemId, value) => {
        const numValue = parseFloat(value) || 0;
        // Find the item to get max allowed
        const item = orderData?.items?.find(i => i.line_item_id === lineItemId);
        const maxAllowed = item?.quantity_remaining || 0;

        // Clamp between 0 and remaining
        const clampedValue = Math.max(0, Math.min(numValue, maxAllowed));

        setReceivedQuantities(prev => ({
            ...prev,
            [lineItemId]: clampedValue
        }));
    };

    const adjustQuantity = (lineItemId, delta) => {
        const current = receivedQuantities[lineItemId] || 0;
        handleQuantityChange(lineItemId, current + delta);
    };

    const setToMax = (lineItemId) => {
        const item = orderData?.items?.find(i => i.line_item_id === lineItemId);
        if (item) {
            setReceivedQuantities(prev => ({
                ...prev,
                [lineItemId]: item.quantity_remaining
            }));
        }
    };

    const handleReceive = async () => {
        if (!orderData || !tokenData) return;

        // Validate at least one item has quantity
        const totalReceiving = Object.values(receivedQuantities).reduce((sum, qty) => sum + qty, 0);
        if (totalReceiving === 0) {
            toast.error('Please enter at least one quantity to receive');
            return;
        }

        setSubmitting(true);
        try {
            if (orderData.order_type === 'PO') {
                // Prepare receipt data with user-entered quantities
                const line_items = orderData.items
                    .filter(item => receivedQuantities[item.line_item_id] > 0)
                    .map(item => ({
                        line_item_id: item.line_item_id,
                        quantity_received: receivedQuantities[item.line_item_id],
                        quality_check_status: 'passed'
                    }));

                await receivePurchaseOrder(orderData.order_id, {
                    line_items,
                    notes,
                    delivery_rating: 5
                });
            } else {
                // JO completion (no partial - all or nothing)
                await completeJobOrder(orderData.order_id, null, notes);
            }

            // Mark token as used
            await markTokenUsed(tokenData.token_id);

            setSuccess(true);
            toast.success(orderData.order_type === 'PO'
                ? 'Purchase Order received successfully!'
                : 'Job Order completed successfully!');
        } catch (err) {
            toast.error(err.response?.data?.message || err.message || 'Failed to complete operation');
        } finally {
            setSubmitting(false);
        }
    };

    // Calculate total being received
    const totalReceiving = Object.values(receivedQuantities).reduce((sum, qty) => sum + (qty || 0), 0);

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

    if (error) {
        return (
            <div className="min-h-screen bg-slate-100 flex items-center justify-center p-4">
                <div className="bg-white rounded-2xl p-8 text-center shadow-lg max-w-md">
                    <AlertCircle className="w-16 h-16 text-red-500 mx-auto mb-4" />
                    <h2 className="text-xl font-bold text-slate-900 mb-2">Token Error</h2>
                    <p className="text-slate-600 mb-6">{error}</p>
                    <Button onClick={() => navigate('/')} variant="outline">
                        Go to Dashboard
                    </Button>
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
                        {orderData?.order_type === 'PO' ? 'Received!' : 'Completed!'}
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

    const isPO = orderData?.order_type === 'PO';

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
                        {isPO ? 'PO Receive' : 'JO Complete'}
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
                            {isPO ? 'Items to Receive' : 'Ingredients Required'}
                        </h2>
                        {isPO && (
                            <span className="text-sm text-slate-500">
                                Enter quantities
                            </span>
                        )}
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
                                                Expected: <span className="font-medium text-slate-700">{item.quantity_remaining}</span>
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
                                                value={receivedQuantities[item.line_item_id] ?? ''}
                                                onChange={(e) => handleQuantityChange(item.line_item_id, e.target.value)}
                                                className="h-12 text-center text-xl font-bold pr-16"
                                                min={0}
                                                max={item.quantity_remaining}
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
                                            disabled={receivedQuantities[item.line_item_id] >= item.quantity_remaining}
                                        >
                                            <Plus className="w-5 h-5" />
                                        </Button>
                                    </div>
                                </div>
                            ))
                        ) : (
                            orderData?.ingredients?.map((ing, idx) => (
                                <div key={idx} className="px-4 py-3">
                                    <div className="flex justify-between items-start">
                                        <div className="flex-1">
                                            <p className="font-medium text-slate-900">{ing.item_name}</p>
                                            <p className="text-sm text-slate-500">
                                                Stock: {ing.current_stock} {ing.unit_of_measure}
                                            </p>
                                        </div>
                                        <div className="text-right">
                                            <Badge variant={ing.sufficient ? "default" : "destructive"} className="mb-1">
                                                {ing.sufficient ? '✓ OK' : '✗ Low'}
                                            </Badge>
                                            <p className="text-sm text-slate-600">
                                                Need: {ing.quantity_required}
                                            </p>
                                        </div>
                                    </div>
                                </div>
                            ))
                        )}
                    </div>
                </div>

                {/* Summary */}
                <div className="bg-white rounded-xl shadow-sm p-4">
                    <div className="flex justify-between items-center">
                        <span className="text-slate-600">
                            {isPO ? 'Total Items' : 'Quantity to Produce'}
                        </span>
                        <span className="text-xl font-bold text-slate-900">
                            {isPO ? orderData?.total_items : orderData?.quantity_to_produce}
                        </span>
                    </div>
                    {isPO && (
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
                                    {totalReceiving}
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
                    disabled={submitting || (isPO && totalReceiving === 0) || (!isPO && !orderData?.all_ingredients_sufficient)}
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
                            {isPO ? `Receive ${totalReceiving} Items` : 'Complete Production'}
                        </>
                    )}
                </Button>
            </div>

            {/* Bottom padding for fixed button */}
            <div className="h-24" />
        </div>
    );
}
