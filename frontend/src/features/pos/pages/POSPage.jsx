import React from 'react';
import { Navigate } from 'react-router-dom';
import POSCheckoutTerminal from '../components/POSCheckoutTerminal';
import { usePermission } from '@/hooks/usePermission';

export default function POSPage() {
    const { loading, can } = usePermission();
    const canViewPos = can('pos:view');
    const canTransactPos = can('pos:transact');

    if (loading) {
        return <p className="text-sm text-slate-500">Loading POS permissions...</p>;
    }

    if (!canViewPos && !canTransactPos) {
        return <Navigate to="/" replace />;
    }

    return (
        <div className="space-y-4">
            <div>
                <h1 className="text-2xl font-semibold text-slate-900">POS Terminal</h1>
                <p className="text-sm text-slate-500">Checkout POS-visible items, issue digital receipts, and generate daily Z-reading.</p>
            </div>
            <POSCheckoutTerminal canViewHistory={canViewPos} layoutContext="standalone" />
        </div>
    );
}
