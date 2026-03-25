import React, { useEffect, useMemo, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { toast } from 'sonner';
import {
    fetchPosCatalog,
    createPosCheckout,
    closePosDay
} from '../services/posService';
import ReceiptPrintView from './ReceiptPrintView';

const money = (value) => Number(value || 0).toFixed(2);

const createIdempotencyKey = () => {
    if (window?.crypto?.randomUUID) return window.crypto.randomUUID();
    return `pos-${Date.now()}-${Math.random().toString(16).slice(2)}`;
};

export default function POSCheckoutTerminal() {
    const [catalog, setCatalog] = useState([]);
    const [catalogLoading, setCatalogLoading] = useState(true);
    const [search, setSearch] = useState('');
    const [orderMethod, setOrderMethod] = useState('dine_in');
    const [paymentType, setPaymentType] = useState('cash');
    const [discountAmount, setDiscountAmount] = useState('0');
    const [cart, setCart] = useState([]);
    const [checkoutLoading, setCheckoutLoading] = useState(false);
    const [closingDay, setClosingDay] = useState(false);
    const [lastReceipt, setLastReceipt] = useState(null);

    const loadCatalog = async () => {
        setCatalogLoading(true);
        try {
            const data = await fetchPosCatalog({ search: search || '', limit: 200 });
            setCatalog(data || []);
        } catch (error) {
            toast.error(error?.response?.data?.message || 'Failed to load POS catalog');
        } finally {
            setCatalogLoading(false);
        }
    };

    useEffect(() => {
        loadCatalog();
    }, []);

    useEffect(() => {
        const timeout = setTimeout(() => {
            loadCatalog();
        }, 250);
        return () => clearTimeout(timeout);
    }, [search]);

    const cartSubtotal = useMemo(
        () => cart.reduce((sum, line) => sum + (Number(line.quantity) * Number(line.sale_price)), 0),
        [cart]
    );

    const cartTotal = useMemo(() => {
        const discount = Number(discountAmount || 0);
        return Math.max(0, cartSubtotal - (Number.isFinite(discount) ? discount : 0));
    }, [cartSubtotal, discountAmount]);

    const addToCart = (item) => {
        const defaultPrice = Number(item.default_sale_price ?? item.cost_per_unit ?? 0);
        setCart((prev) => {
            const existing = prev.find((line) => line.item_id === item.item_id);
            if (existing) {
                return prev.map((line) => (
                    line.item_id === item.item_id
                        ? { ...line, quantity: Number(line.quantity) + 1 }
                        : line
                ));
            }
            return [
                ...prev,
                {
                    item_id: item.item_id,
                    item_name: item.name,
                    quantity: 1,
                    sale_price: defaultPrice,
                    unit_of_measure: item.unit_of_measure
                }
            ];
        });
    };

    const updateCartLine = (itemId, patch) => {
        setCart((prev) => prev.map((line) => (
            line.item_id === itemId
                ? { ...line, ...patch }
                : line
        )));
    };

    const removeCartLine = (itemId) => {
        setCart((prev) => prev.filter((line) => line.item_id !== itemId));
    };

    const handleCheckout = async () => {
        if (cart.length === 0) {
            toast.error('Add at least one item before checkout.');
            return;
        }

        setCheckoutLoading(true);
        try {
            const payload = {
                idempotency_key: createIdempotencyKey(),
                terminal_id: 'WEB-POS-01',
                order_method: orderMethod,
                payment_type: paymentType,
                discount_amount: Number(discountAmount || 0),
                lines: cart.map((line) => ({
                    item_id: line.item_id,
                    quantity: Number(line.quantity),
                    sale_price: Number(line.sale_price)
                }))
            };

            const data = await createPosCheckout(payload);
            setLastReceipt(data?.transaction || null);
            setCart([]);
            setDiscountAmount('0');
            toast.success(
                data?.idempotent_replay
                    ? 'Checkout replayed from idempotent request'
                    : 'Checkout completed successfully'
            );
            loadCatalog();
        } catch (error) {
            toast.error(error?.response?.data?.message || 'POS checkout failed');
        } finally {
            setCheckoutLoading(false);
        }
    };

    const handleCloseDay = async () => {
        setClosingDay(true);
        try {
            const result = await closePosDay();
            toast.success(
                `Z-reading generated: ${result?.summary?.transaction_count || 0} sale(s), PHP ${money(result?.summary?.total_amount)}`
            );
        } catch (error) {
            toast.error(error?.response?.data?.message || 'Failed to generate Z-reading');
        } finally {
            setClosingDay(false);
        }
    };

    return (
        <div className="grid grid-cols-1 xl:grid-cols-3 gap-6">
            <section className="xl:col-span-2 bg-white border border-slate-200 rounded-2xl p-4">
                <div className="flex flex-col sm:flex-row gap-3 sm:items-center sm:justify-between mb-4">
                    <h2 className="text-lg font-semibold text-slate-900">POS Catalog</h2>
                    <Input
                        value={search}
                        onChange={(event) => setSearch(event.target.value)}
                        placeholder="Search finished goods..."
                        className="sm:max-w-xs"
                    />
                </div>

                {catalogLoading ? (
                    <p className="text-sm text-slate-500">Loading catalog...</p>
                ) : (
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                        {catalog.map((item) => (
                            <button
                                key={item.item_id}
                                type="button"
                                onClick={() => addToCart(item)}
                                className="text-left border border-slate-200 rounded-xl p-3 hover:border-teal-300 hover:bg-teal-50 transition-colors"
                            >
                                <p className="font-medium text-slate-900">{item.name}</p>
                                <p className="text-xs text-slate-500">{item.sku_code}</p>
                                <div className="mt-2 text-xs text-slate-600 flex justify-between">
                                    <span>Stock: {Number(item.current_stock || 0).toFixed(2)}</span>
                                    <span>Default: PHP {money(item.default_sale_price ?? item.cost_per_unit)}</span>
                                </div>
                            </button>
                        ))}
                        {catalog.length === 0 && (
                            <p className="text-sm text-slate-500 col-span-full">No finished goods found.</p>
                        )}
                    </div>
                )}
            </section>

            <section className="bg-white border border-slate-200 rounded-2xl p-4">
                <h2 className="text-lg font-semibold text-slate-900 mb-4">Current Sale</h2>
                <div className="space-y-3 mb-4">
                    <label className="text-xs text-slate-500 block">
                        Order Method
                        <select
                            value={orderMethod}
                            onChange={(event) => setOrderMethod(event.target.value)}
                            className="w-full mt-1 border border-slate-200 rounded-lg px-2 py-2 text-sm"
                        >
                            <option value="dine_in">Dine In</option>
                            <option value="takeout">Takeout</option>
                            <option value="delivery">Delivery</option>
                            <option value="online">Online</option>
                        </select>
                    </label>

                    <label className="text-xs text-slate-500 block">
                        Payment Type
                        <select
                            value={paymentType}
                            onChange={(event) => setPaymentType(event.target.value)}
                            className="w-full mt-1 border border-slate-200 rounded-lg px-2 py-2 text-sm"
                        >
                            <option value="cash">Cash</option>
                            <option value="gcash">GCash</option>
                            <option value="maya">Maya</option>
                            <option value="card">Card</option>
                            <option value="bank_transfer">Bank Transfer</option>
                        </select>
                    </label>
                </div>

                <div className="space-y-3 max-h-72 overflow-auto mb-4">
                    {cart.map((line) => (
                        <div key={line.item_id} className="border border-slate-200 rounded-lg p-3">
                            <p className="text-sm font-medium text-slate-900">{line.item_name}</p>
                            <div className="grid grid-cols-2 gap-2 mt-2">
                                <label className="text-xs text-slate-500">
                                    Qty
                                    <Input
                                        type="number"
                                        min="0.0001"
                                        step="0.0001"
                                        value={line.quantity}
                                        onChange={(event) => updateCartLine(line.item_id, { quantity: Number(event.target.value || 0) })}
                                    />
                                </label>
                                <label className="text-xs text-slate-500">
                                    Price
                                    <Input
                                        type="number"
                                        min="0"
                                        step="0.0001"
                                        value={line.sale_price}
                                        onChange={(event) => updateCartLine(line.item_id, { sale_price: Number(event.target.value || 0) })}
                                    />
                                </label>
                            </div>
                            <div className="flex justify-between items-center mt-2">
                                <span className="text-xs text-slate-500">
                                    Subtotal: PHP {money(Number(line.quantity) * Number(line.sale_price))}
                                </span>
                                <Button type="button" variant="outline" size="sm" onClick={() => removeCartLine(line.item_id)}>
                                    Remove
                                </Button>
                            </div>
                        </div>
                    ))}
                    {cart.length === 0 && (
                        <p className="text-sm text-slate-500">Cart is empty.</p>
                    )}
                </div>

                <label className="text-xs text-slate-500 block mb-3">
                    Discount Amount
                    <Input
                        type="number"
                        min="0"
                        step="0.0001"
                        value={discountAmount}
                        onChange={(event) => setDiscountAmount(event.target.value)}
                    />
                </label>

                <div className="text-sm border-t border-slate-200 pt-3 space-y-1 mb-3">
                    <div className="flex justify-between">
                        <span className="text-slate-600">Subtotal</span>
                        <span className="font-medium">PHP {money(cartSubtotal)}</span>
                    </div>
                    <div className="flex justify-between">
                        <span className="text-slate-600">Total</span>
                        <span className="font-semibold text-slate-900">PHP {money(cartTotal)}</span>
                    </div>
                </div>

                <div className="grid grid-cols-1 gap-2">
                    <Button type="button" onClick={handleCheckout} disabled={checkoutLoading || cart.length === 0}>
                        {checkoutLoading ? 'Processing...' : 'Checkout'}
                    </Button>
                    <Button type="button" variant="outline" onClick={handleCloseDay} disabled={closingDay}>
                        {closingDay ? 'Generating...' : 'Close Day / Z-Reading'}
                    </Button>
                    <Button
                        type="button"
                        variant="outline"
                        onClick={() => window.print()}
                        disabled={!lastReceipt}
                    >
                        Print Last Receipt
                    </Button>
                </div>
            </section>

            <section className="xl:col-span-3">
                <ReceiptPrintView transaction={lastReceipt} />
            </section>
        </div>
    );
}

