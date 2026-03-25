import React, { useState, useEffect } from 'react';
import {
    DollarSign,
    Save,
    RefreshCw,
    AlertCircle,
    Info,
    CreditCard
} from 'lucide-react';
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import * as adminService from '@/services/adminService';
import { toast } from 'sonner';
import { normalizeApiError } from '@/src/utils/errorHandler.js';

export default function AdminPricing() {
    const [settings, setSettings] = useState({
        premium_plan_price: '',
        standard_plan_price: '',
        // paypal_product_id: '' // DISABLED - switching to PayMongo
    });
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    const [error, setError] = useState('');

    useEffect(() => {
        loadSettings();
    }, []);

    const loadSettings = async () => {
        setLoading(true);
        setError('');
        try {
            const response = await adminService.getPricing();
            if (response.success) {
                setSettings(response.data);
            }
        } catch (err) {
            setError('Failed to load pricing settings');
            console.error(err);
        } finally {
            setLoading(false);
        }
    };

    const handleSave = async (e) => {
        e.preventDefault();
        setSaving(true);
        setError('');

        try {
            await adminService.updatePricing(settings);
            toast.success('Pricing settings updated successfully');
        } catch (err) {
            const normalized = normalizeApiError(err);
            if (!normalized.isGlobalCandidate) {
                toast.error(`Failed to save changes: ${normalized.message}`);
            }
        } finally {
            setSaving(false);
        }
    };

    const handleChange = (e) => {
        const { name, value } = e.target;
        setSettings(prev => ({
            ...prev,
            [name]: value
        }));
    };

    if (loading) {
        return (
            <div className="flex flex-col items-center justify-center p-12 bg-white rounded-xl shadow-sm border border-slate-200">
                <RefreshCw className="w-8 h-8 text-slate-400 animate-spin mb-3" />
                <p className="text-slate-600">Loading pricing settings...</p>
            </div>
        );
    }

    return (
        <div className="max-w-4xl mx-auto">
            {/* Header */}
            <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-6 mb-6">
                <div className="flex items-center justify-between">
                    <div>
                        <h1 className="text-3xl font-bold text-slate-900 flex items-center gap-3">
                            <DollarSign className="w-8 h-8 text-green-600" />
                            Plan Pricing
                        </h1>
                        <p className="text-slate-500 text-sm mt-1">
                            Configure subscription plans and PayPal product integration
                        </p>
                    </div>
                </div>
            </div>

            {/* Form */}
            <form onSubmit={handleSave} className="space-y-6">
                <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
                    <div className="p-6 border-b border-slate-100 bg-slate-50/50">
                        <h2 className="text-lg font-semibold text-slate-900 flex items-center gap-2">
                            <CreditCard className="w-5 h-5 text-slate-400" />
                            Subscription Tiers
                        </h2>
                    </div>

                    <div className="p-6 space-y-6">
                        {/* Messages */}
                        {error && (
                            <div className="bg-red-50 border border-red-200 rounded-lg p-4 flex items-center gap-2 text-red-800">
                                <AlertCircle className="w-5 h-5 shrink-0" />
                                {error}
                            </div>
                        )}
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                            <div className="space-y-2">
                                <label className="text-sm font-medium text-slate-700">
                                    Standard Plan Monthly Price (USD)
                                </label>
                                <div className="relative">
                                    <span className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400">$</span>
                                    <Input
                                        type="number"
                                        step="0.01"
                                        name="standard_plan_price"
                                        value={settings.standard_plan_price}
                                        onChange={handleChange}
                                        className="pl-7"
                                        placeholder="0.00"
                                    />
                                </div>
                                <p className="text-xs text-slate-500 flex items-center gap-1">
                                    <Info className="w-3 h-3" />
                                    Usually set to 0.00 for a free-to-register model.
                                </p>
                            </div>

                            <div className="space-y-2">
                                <label className="text-sm font-medium text-slate-700">
                                    Premium Plan Monthly Price (USD)
                                </label>
                                <div className="relative">
                                    <span className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400">$</span>
                                    <Input
                                        type="number"
                                        step="0.01"
                                        name="premium_plan_price"
                                        value={settings.premium_plan_price}
                                        onChange={handleChange}
                                        className="pl-7"
                                        placeholder="29.99"
                                    />
                                </div>
                                <p className="text-xs text-slate-500 flex items-center gap-1">
                                    <Info className="w-3 h-3" />
                                    Price charged to users for AI features and premium support.
                                </p>
                            </div>
                        </div>
                    </div>
                </div>

                <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
                    <div className="p-6 border-b border-slate-100 bg-slate-50/50">
                        <h2 className="text-lg font-semibold text-slate-900 flex items-center gap-2">
                            <RefreshCw className="w-5 h-5 text-slate-400" />
                            PayPal Integration (DISABLED - switching to PayMongo)
                        </h2>
                    </div>

                    {/* <div className="p-6 space-y-4">
                        <div className="space-y-2">
                            <label className="text-sm font-medium text-slate-700">
                                PayPal Product ID
                            </label>
                            <Input
                                type="text"
                                name="paypal_product_id"
                                value={settings.paypal_product_id}
                                onChange={handleChange}
                                placeholder="PROD-XXXXXXXXXXXXXXXXX"
                            />
                            <p className="text-xs text-slate-500">
                                The Product ID created in your PayPal Dashboard that represents this application.
                            </p>
                        </div>
                    </div> */}
                </div>

                <div className="flex justify-end">
                    <Button
                        type="submit"
                        disabled={saving}
                        className="bg-green-600 hover:bg-green-700 h-11 px-8"
                    >
                        {saving ? (
                            <>
                                <RefreshCw className="w-5 h-5 mr-2 animate-spin" />
                                Saving Changes...
                            </>
                        ) : (
                            <>
                                <Save className="w-5 h-5 mr-2" />
                                Save Pricing Settings
                            </>
                        )}
                    </Button>
                </div>
            </form>
        </div>
    );
}
