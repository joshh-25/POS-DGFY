import React, { Suspense, lazy, useCallback, useEffect, useState } from 'react';
import { Navigate } from 'react-router-dom';
import { usePermission } from '@/hooks/usePermission';
import { CalendarCheck, CheckCircle2, Clock, UserCheck, XCircle } from 'lucide-react';
import { toast } from 'sonner';
import { useWorkflowMode } from '../../settings/WorkflowModeContext.jsx';
import { isFnbWorkflowMode, isHospitalityWorkflowMode, isServicesWorkflowMode } from '../../settings/workflowMode.js';
import { listServiceBookings, updateServiceBookingStatus } from '../../services/api/servicesApi.js';

const FnbDiningPanel = lazy(() => import('../../fnb/components/FnbDiningPanel.jsx'));
const HospitalityPosPanel = lazy(() => import('../components/HospitalityPosPanel.jsx'));

const servicePosActions = [
    { status: 'confirmed', label: 'Confirm', icon: CalendarCheck },
    { status: 'checked_in', label: 'Check In', icon: UserCheck },
    { status: 'in_service', label: 'Start', icon: Clock },
    { status: 'completed', label: 'Complete', icon: CheckCircle2 },
    { status: 'no_show', label: 'No-Show', icon: XCircle }
];

const serviceStatusTransitions = {
    requested: ['confirmed', 'no_show'],
    confirmed: ['checked_in', 'no_show'],
    checked_in: ['in_service', 'no_show'],
    in_service: ['completed'],
    no_show: ['confirmed']
};

const formatBookingTime = (value) => {
    if (!value) return 'Unscheduled';
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return 'Unscheduled';
    return date.toLocaleString([], { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
};

function ServicesPosQueue() {
    const [bookings, setBookings] = useState([]);
    const [loading, setLoading] = useState(true);
    const [updatingId, setUpdatingId] = useState(null);

    const loadQueue = useCallback(async () => {
        setLoading(true);
        try {
            const data = await listServiceBookings({ limit: 30, statuses: 'requested,confirmed,checked_in,in_service' });
            setBookings(Array.isArray(data?.bookings) ? data.bookings : []);
        } catch (error) {
            toast.error(error?.response?.data?.message || 'Unable to load service queue.');
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => {
        loadQueue();
    }, [loadQueue]);

    const updateStatus = async (bookingId, status) => {
        setUpdatingId(bookingId);
        try {
            await updateServiceBookingStatus(bookingId, { status });
            await loadQueue();
            toast.success('Service booking updated.');
        } catch (error) {
            toast.error(error?.response?.data?.message || 'Unable to update service booking.');
        } finally {
            setUpdatingId(null);
        }
    };

    return (
        <section className="rounded-lg border border-teal-200 bg-white p-4 shadow-sm">
            <div className="mb-3 flex items-center justify-between gap-3">
                <div className="flex items-center gap-2">
                    <CalendarCheck className="h-5 w-5 text-teal-700" />
                    <div>
                        <h2 className="text-lg font-semibold text-slate-900">Services Queue</h2>
                        <p className="text-sm text-slate-500">Check in appointments, complete service work, and keep unpaid tickets ready for POS collection.</p>
                    </div>
                </div>
                <button type="button" onClick={loadQueue} className="rounded-lg border border-slate-300 px-3 py-2 text-sm font-semibold text-slate-700">Refresh</button>
            </div>
            <div className="grid gap-3 lg:grid-cols-2">
                {bookings.map((booking) => (
                    <article key={booking.booking_id} className="rounded-lg border border-slate-200 p-3">
                        <div className="flex items-start justify-between gap-3">
                            <div>
                                <p className="text-sm font-semibold text-slate-900">{booking.public_reference}</p>
                                <p className="mt-1 text-sm text-slate-600">{booking.service_name || booking.serviceItem?.name || 'Service'}</p>
                                <p className="text-xs text-slate-500">{booking.customer_name || 'Guest'} - {formatBookingTime(booking.start_at)}</p>
                            </div>
                            <span className="rounded-full bg-slate-100 px-2 py-1 text-xs font-semibold text-slate-700">{booking.status}</span>
                        </div>
                        <div className="mt-3 flex flex-wrap gap-2">
                            {servicePosActions.filter((action) => (serviceStatusTransitions[booking.status] || []).includes(action.status)).map((action) => {
                                const Icon = action.icon;
                                return (
                                    <button
                                        key={action.status}
                                        type="button"
                                        disabled={updatingId === booking.booking_id || booking.status === action.status}
                                        onClick={() => updateStatus(booking.booking_id, action.status)}
                                        className="inline-flex items-center gap-1.5 rounded-lg border border-slate-300 bg-white px-2.5 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-50"
                                    >
                                        <Icon className="h-3.5 w-3.5" />
                                        {action.label}
                                    </button>
                                );
                            })}
                        </div>
                    </article>
                ))}
                {!loading && bookings.length === 0 && <p className="text-sm text-slate-500">No active service bookings in the POS queue.</p>}
            </div>
        </section>
    );
}

export default function PosPageShell({ CheckoutTerminal }) {
    const { loading, can } = usePermission();
    const { workflowMode } = useWorkflowMode();
    const canViewPos = can('pos:view');
    const canTransactPos = can('pos:transact');
    const [fnbCheckoutContext, setFnbCheckoutContext] = useState(null);

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
                <p className="text-sm text-slate-500">Checkout POS-visible items, collect service payments, issue digital receipts, and generate daily Z-reading.</p>
            </div>
            {isServicesWorkflowMode(workflowMode) && <ServicesPosQueue />}
            {isHospitalityWorkflowMode(workflowMode) && (
                <Suspense fallback={<section className="rounded-lg border border-sky-100 bg-white p-4 text-sm text-slate-500 shadow-sm">Loading Hospitality front desk POS...</section>}>
                    <HospitalityPosPanel />
                </Suspense>
            )}
            {isFnbWorkflowMode(workflowMode) && (
                <Suspense fallback={<section className="rounded-lg border border-red-100 bg-white p-4 text-sm text-slate-500 shadow-sm">Loading Food & Beverage service controls...</section>}>
                    <FnbDiningPanel onSelectCheckoutContext={setFnbCheckoutContext} />
                </Suspense>
            )}
            <CheckoutTerminal canViewHistory={canViewPos} fnbContext={fnbCheckoutContext} />
        </div>
    );
}
