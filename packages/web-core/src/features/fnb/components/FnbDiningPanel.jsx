import React, { useCallback, useEffect, useState } from 'react';
import { ArrowRightLeft, CheckCircle2, ChefHat, ChevronDown, GitMerge, LayoutGrid, RefreshCw, Scissors, Utensils } from 'lucide-react';
import { toast } from 'sonner';
import {
  createFnbCheck,
  createFnbKitchenTicket,
  getFnbServiceChargeSettings,
  listFnbChecks,
  listFnbDiningAreas,
  listFnbKitchenStations,
  mergeFnbChecks,
  splitFnbCheck,
  transferFnbCheck,
  updateFnbKitchenTicketStatus
} from '../api/fnbApi.js';
import {
    formatKitchenQuantity,
    getKitchenLineName,
    getTicketSnapshotLines,
  getTicketSourceLabel
} from '../utils/kitchenQueueDisplay.js';

const kitchenStatusTransitions = Object.freeze({
    queued: ['preparing', 'cancelled'],
    preparing: ['ready', 'cancelled'],
    ready: ['served', 'cancelled'],
    served: [],
    cancelled: []
});

const statusLabel = (status) => String(status || '').replace(/_/g, ' ');

export default function FnbDiningPanel({ onSelectCheckoutContext, canTransact = false, locationId = null }) {
    const [diningAreas, setDiningAreas] = useState([]);
    const [checks, setChecks] = useState([]);
    const [stations, setStations] = useState([]);
    const [serviceCharge, setServiceCharge] = useState(null);
    const [loading, setLoading] = useState(true);
    const [busy, setBusy] = useState('');
    const [newCheck, setNewCheck] = useState({ table_id: '', guest_count: 2, order_method: 'dine_in' });
    const [checkLineSelections, setCheckLineSelections] = useState({});
    const [checkTransferTargets, setCheckTransferTargets] = useState({});
    const [checkMergeSources, setCheckMergeSources] = useState({});

    const loadQueue = useCallback(async () => {
        setLoading(true);
        try {
            const [areasData, checksData, stationsData, serviceChargeData] = await Promise.all([
                listFnbDiningAreas(),
                listFnbChecks({
                    statuses: 'open,sent_to_kitchen,partially_paid',
                    limit: 50,
                    ...(locationId ? { location_id: locationId } : {})
                }),
                listFnbKitchenStations(),
                getFnbServiceChargeSettings()
            ]);
            setDiningAreas(Array.isArray(areasData?.dining_areas) ? areasData.dining_areas : []);
            setChecks(Array.isArray(checksData?.checks) ? checksData.checks : []);
            setStations(Array.isArray(stationsData?.kitchen_stations) ? stationsData.kitchen_stations : []);
            setServiceCharge(serviceChargeData?.service_charge || null);
        } catch (error) {
            toast.error(error?.response?.data?.message || 'Unable to load Food & Beverage queue.');
        } finally {
            setLoading(false);
        }
    }, [locationId]);

    useEffect(() => {
        loadQueue();
    }, [loadQueue]);

    const tables = diningAreas.flatMap((area) => (area.tables || []).map((table) => ({
        ...table,
        area_name: area.name
    })));

    const selectedTable = tables.find((table) => String(table.table_id) === String(newCheck.table_id));

    const buildCheckoutContext = (check, fallbackTable = null) => ({
        fnb_check_id: check.check_id,
        fnb_location_id: check.location_id || locationId || null,
        fnb_table_id: check.table_id || null,
        fnb_table_label_snapshot: check.table?.label || check.table?.table_number || fallbackTable?.label || null,
        fnb_guest_count: check.guest_count || null,
        fnb_server_id: check.server_id || null,
        fnb_order_method: check.order_method || null,
        fnb_notes: check.notes || null,
        fnb_check_lines: Array.isArray(check.lines) ? check.lines : [],
        fnb_checkout_request_id: `${check.check_id}:${Date.now()}`,
        restaurant_service_charge: serviceCharge
    });

    const openCheck = async () => {
        setBusy('open');
        try {
            const data = await createFnbCheck({
                table_id: newCheck.table_id ? Number(newCheck.table_id) : null,
                location_id: locationId || undefined,
                guest_count: Number(newCheck.guest_count || 1),
                order_method: newCheck.order_method
            });
            const check = data?.check;
            if (check) {
                onSelectCheckoutContext?.({
                    ...buildCheckoutContext(check, selectedTable),
                    fnb_guest_count: check.guest_count || Number(newCheck.guest_count || 1)
                });
            }
            await loadQueue();
            toast.success('F&B check opened.');
        } catch (error) {
            toast.error(error?.response?.data?.message || 'Unable to open F&B check.');
        } finally {
            setBusy('');
        }
    };

    const handleCheckForCheckout = (check) => {
        const activeLines = (Array.isArray(check.lines) ? check.lines : [])
            .filter((line) => line?.status !== 'voided');
        if (activeLines.length === 0) {
            toast.error(`Check #${check.check_id} has no active items. Add an item before checkout.`);
            return;
        }
        onSelectCheckoutContext?.(buildCheckoutContext(check));
        toast.message(`Attached check #${check.check_id} to checkout.`);
    };

    const fireTicket = async (check) => {
        setBusy(`ticket-${check.check_id}`);
        try {
            await createFnbKitchenTicket(check.check_id, {
                kitchen_station_id: stations[0]?.kitchen_station_id || null,
                lines_snapshot: check.lines || []
            });
            await loadQueue();
            toast.success('Kitchen ticket queued.');
        } catch (error) {
            toast.error(error?.response?.data?.message || 'Unable to queue kitchen ticket.');
        } finally {
            setBusy('');
        }
    };

    const progressTicket = async (ticket, status) => {
        setBusy(`ticket-status-${ticket.kitchen_ticket_id}`);
        try {
            await updateFnbKitchenTicketStatus(ticket.kitchen_ticket_id, { status });
            await loadQueue();
            toast.success('Kitchen ticket updated.');
        } catch (error) {
            toast.error(error?.response?.data?.message || 'Unable to update kitchen ticket.');
        } finally {
            setBusy('');
        }
    };

    const transferSelectedCheck = async (check) => {
        const tableId = Number(checkTransferTargets[check.check_id]);
        if (!Number.isInteger(tableId) || tableId <= 0) return;
        setBusy(`transfer-${check.check_id}`);
        try {
            await transferFnbCheck(check.check_id, { table_id: tableId });
            setCheckTransferTargets((prev) => ({ ...prev, [check.check_id]: '' }));
            await loadQueue();
            toast.success('F&B check transferred.');
        } catch (error) {
            toast.error(error?.response?.data?.message || 'Unable to transfer F&B check.');
        } finally {
            setBusy('');
        }
    };

    const splitSelectedCheck = async (check) => {
        const lineIds = (checkLineSelections[check.check_id] || [])
            .map((entry) => Number(entry))
            .filter((entry) => Number.isInteger(entry) && entry > 0);
        if (lineIds.length === 0) return;
        setBusy(`split-${check.check_id}`);
        try {
            await splitFnbCheck(check.check_id, { line_ids: lineIds });
            setCheckLineSelections((prev) => ({ ...prev, [check.check_id]: [] }));
            await loadQueue();
            toast.success('F&B check split.');
        } catch (error) {
            toast.error(error?.response?.data?.message || 'Unable to split F&B check.');
        } finally {
            setBusy('');
        }
    };

    const mergeSelectedChecks = async (check) => {
        const sourceCheckId = Number(checkMergeSources[check.check_id]);
        if (!Number.isInteger(sourceCheckId) || sourceCheckId <= 0) return;
        setBusy(`merge-${check.check_id}`);
        try {
            await mergeFnbChecks(check.check_id, { source_check_id: sourceCheckId });
            setCheckMergeSources((prev) => ({ ...prev, [check.check_id]: '' }));
            await loadQueue();
            toast.success('F&B checks merged.');
        } catch (error) {
            toast.error(error?.response?.data?.message || 'Unable to merge F&B checks.');
        } finally {
            setBusy('');
        }
    };

    const toggleSplitLine = (checkId, lineId, checked) => {
        const normalizedLineId = Number(lineId);
        if (!Number.isInteger(normalizedLineId) || normalizedLineId <= 0) return;
        setCheckLineSelections((prev) => {
            const next = new Set(prev[checkId] || []);
            if (checked) next.add(normalizedLineId);
            else next.delete(normalizedLineId);
            return { ...prev, [checkId]: Array.from(next) };
        });
    };

    const kitchenTicketCount = checks.reduce(
        (total, check) => total + (Array.isArray(check.kitchenTickets) ? check.kitchenTickets.length : 0),
        0
    );
    const serviceChargeEnabled = serviceCharge?.enabled === true;
    const serviceChargeValue = serviceChargeEnabled ? `${Number(serviceCharge?.rate || 0)}%` : 'Off';
    const summaryMetrics = [
        {
            label: 'Open checks',
            value: loading ? '—' : checks.length,
            helper: checks.length > 0 ? 'Needs service' : 'None active',
            icon: LayoutGrid,
            iconClass: 'bg-blue-50 text-[#1A4E8D]'
        },
        {
            label: 'Tables',
            value: loading ? '—' : tables.length,
            helper: 'Available on floor',
            icon: LayoutGrid,
            iconClass: 'bg-teal-50 text-teal-700'
        },
        {
            label: 'Kitchen tickets',
            value: loading ? '—' : kitchenTicketCount,
            helper: stations.length > 0 ? `${stations.length} station${stations.length === 1 ? '' : 's'} ready` : 'No stations configured',
            icon: ChefHat,
            iconClass: 'bg-amber-50 text-amber-700'
        },
        {
            label: 'Service charge',
            value: loading ? '—' : serviceChargeValue,
            helper: serviceChargeEnabled ? (serviceCharge?.label || 'Enabled') : 'Not applied',
            icon: Utensils,
            iconClass: 'bg-slate-100 text-slate-600'
        }
    ];

    return (
        <section data-testid="pos-fnb-service-panel" className="overflow-hidden rounded-2xl border border-slate-200 bg-slate-50/70 shadow-sm">
            <div className="border-b border-slate-200 bg-white px-4 py-4 sm:px-6">
                <div className="flex flex-wrap items-start justify-between gap-4">
                    <div className="flex min-w-0 items-start gap-3">
                        <div className="grid h-11 w-11 shrink-0 place-items-center rounded-xl bg-teal-50 text-teal-700">
                            <Utensils className="h-5 w-5" />
                        </div>
                        <div className="min-w-0">
                            <div className="flex flex-wrap items-center gap-2">
                                <h2 className="text-xl font-bold tracking-tight text-slate-950">F&B service</h2>
                                <span className="rounded-full bg-emerald-50 px-2.5 py-1 text-[11px] font-bold uppercase tracking-wide text-emerald-700">Live POS</span>
                            </div>
                            <p className="mt-1 max-w-2xl text-sm text-slate-500">Open checks, manage tables, and keep kitchen tickets moving.</p>
                        </div>
                    </div>
                    <button
                        type="button"
                        onClick={loadQueue}
                        disabled={loading}
                        aria-label="Refresh F&B service"
                        className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-3.5 py-2.5 text-sm font-bold text-slate-700 shadow-sm transition hover:border-slate-300 hover:bg-slate-50 disabled:cursor-wait disabled:opacity-60"
                    >
                        <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
                        {loading ? 'Refreshing' : 'Refresh'}
                    </button>
                </div>
            </div>

            <div className="grid gap-3 border-b border-slate-200 bg-white px-4 py-4 sm:grid-cols-2 sm:px-6 xl:grid-cols-4">
                {summaryMetrics.map((metric) => {
                    const MetricIcon = metric.icon;
                    return (
                        <div key={metric.label} className="flex items-center gap-3 rounded-xl border border-slate-200 bg-slate-50/70 px-3.5 py-3">
                            <span className={`grid h-10 w-10 shrink-0 place-items-center rounded-xl ${metric.iconClass}`}>
                                <MetricIcon className="h-4.5 w-4.5" />
                            </span>
                            <div className="min-w-0">
                                <p className="text-[11px] font-bold uppercase tracking-[0.12em] text-slate-500">{metric.label}</p>
                                <div className="mt-0.5 flex items-baseline gap-2">
                                    <p className="text-lg font-extrabold text-slate-950">{metric.value}</p>
                                    <p className="truncate text-xs text-slate-500">{metric.helper}</p>
                                </div>
                            </div>
                        </div>
                    );
                })}
            </div>

            <div className="grid gap-4 p-4 sm:p-6 xl:grid-cols-[minmax(300px,360px)_minmax(0,1fr)]">
                <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm sm:p-5">
                    <div className="mb-4 flex items-start gap-3">
                        <span className="grid h-9 w-9 shrink-0 place-items-center rounded-lg bg-blue-50 text-[#1A4E8D]">
                            <LayoutGrid className="h-4 w-4" />
                        </span>
                        <div>
                            <p className="text-[11px] font-bold uppercase tracking-[0.12em] text-[#1A4E8D]">Start a check</p>
                            <h3 className="mt-1 text-lg font-bold text-slate-950">Open a new check</h3>
                            <p className="mt-1 text-sm leading-5 text-slate-500">Choose a table or start a takeout order.</p>
                        </div>
                    </div>
                    <div className="space-y-3">
                        <label className="block text-xs font-semibold text-slate-600">
                            Table
                            <select
                                value={newCheck.table_id}
                                onChange={(event) => setNewCheck((prev) => ({ ...prev, table_id: event.target.value }))}
                                className="mt-1.5 h-11 w-full rounded-xl border border-slate-200 bg-white px-3 text-sm text-slate-800 outline-none transition focus:border-[#1A4E8D] focus:ring-2 focus:ring-blue-100"
                            >
                                <option value="">Takeout / no table</option>
                                {tables.map((table) => (
                                    <option key={table.table_id} value={table.table_id}>
                                        {table.area_name} - {table.label || table.table_number}
                                    </option>
                                ))}
                            </select>
                        </label>
                        <div className="grid grid-cols-2 gap-3">
                            <label className="block text-xs font-semibold text-slate-600">
                                Guests
                                <input
                                    type="number"
                                    min="1"
                                    value={newCheck.guest_count}
                                    onChange={(event) => setNewCheck((prev) => ({ ...prev, guest_count: event.target.value }))}
                                    className="mt-1.5 h-11 w-full rounded-xl border border-slate-200 px-3 text-sm text-slate-800 outline-none transition focus:border-[#1A4E8D] focus:ring-2 focus:ring-blue-100"
                                />
                            </label>
                            <label className="block text-xs font-semibold text-slate-600">
                                Method
                                <select
                                    value={newCheck.order_method}
                                    onChange={(event) => setNewCheck((prev) => ({ ...prev, order_method: event.target.value }))}
                                    className="mt-1.5 h-11 w-full rounded-xl border border-slate-200 bg-white px-3 text-sm text-slate-800 outline-none transition focus:border-[#1A4E8D] focus:ring-2 focus:ring-blue-100"
                                >
                                    <option value="dine_in">Dine In</option>
                                    <option value="takeout">Takeout</option>
                                    <option value="pickup">Pickup</option>
                                    <option value="delivery">Delivery</option>
                                </select>
                            </label>
                        </div>
                        {canTransact ? (
                            <button
                                type="button"
                                onClick={openCheck}
                                disabled={busy === 'open'}
                                className="mt-1 inline-flex h-11 w-full items-center justify-center rounded-xl bg-[#0F766E] px-3 text-sm font-bold text-white shadow-sm transition hover:bg-[#0D6B63] disabled:cursor-wait disabled:opacity-50"
                            >
                                {busy === 'open' ? 'Opening check...' : 'Open check'}
                            </button>
                        ) : (
                            <p className="mt-1 rounded-xl border border-slate-200 bg-slate-50 px-3 py-3 text-xs leading-5 text-slate-500">Live actions require POS transaction access.</p>
                        )}
                    </div>
                </div>

                <div className="min-w-0 rounded-xl border border-slate-200 bg-white p-4 shadow-sm sm:p-5">
                    <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
                        <div>
                            <div className="flex items-center gap-2">
                                <h3 className="text-lg font-bold text-slate-950">Active checks</h3>
                                <span className="rounded-full bg-slate-100 px-2 py-0.5 text-xs font-bold text-slate-600">{loading ? '—' : checks.length}</span>
                            </div>
                            <p className="mt-1 text-sm text-slate-500">Select a check to continue checkout or send it to the kitchen.</p>
                        </div>
                        {checks.length > 0 && <span className="rounded-full bg-emerald-50 px-2.5 py-1 text-[11px] font-bold uppercase tracking-wide text-emerald-700">Needs attention</span>}
                    </div>

                    {loading && (
                        <div className="grid gap-3 lg:grid-cols-2" aria-label="Loading active checks">
                            {[0, 1].map((entry) => <div key={entry} className="h-36 animate-pulse rounded-xl bg-slate-100" />)}
                        </div>
                    )}

                    {!loading && checks.length === 0 && (
                        <div className="flex min-h-[220px] flex-col items-center justify-center rounded-xl border border-dashed border-slate-300 bg-slate-50/70 px-6 py-8 text-center">
                            <span className="grid h-12 w-12 place-items-center rounded-2xl bg-emerald-50 text-emerald-700">
                                <CheckCircle2 className="h-6 w-6" />
                            </span>
                            <p className="mt-4 text-base font-bold text-slate-900">No active checks</p>
                            <p className="mt-1 max-w-sm text-sm leading-5 text-slate-500">Everything is clear. Open a check on the left when the next guest is ready.</p>
                        </div>
                    )}

                    {!loading && checks.length > 0 && (
                        <div className="grid gap-3 lg:grid-cols-2">
                            {checks.map((check) => (
                                <article key={check.check_id} className="rounded-xl border border-slate-200 bg-white p-4 transition hover:border-slate-300 hover:shadow-md">
                                    <div className="flex items-start justify-between gap-3">
                                        <div className="min-w-0">
                                            <div className="flex flex-wrap items-center gap-2">
                                                <p className="text-base font-bold text-slate-950">Check #{check.check_id}</p>
                                                <span className="rounded-full bg-blue-50 px-2 py-1 text-[11px] font-bold capitalize text-[#1A4E8D]">{statusLabel(check.status)}</span>
                                            </div>
                                            <p className="mt-1 text-xs text-slate-500">{check.table?.label || check.table?.table_number || check.order_method} · {check.guest_count || 1} guests</p>
                                        </div>
                                        <span className="grid h-9 w-9 shrink-0 place-items-center rounded-lg bg-slate-50 text-slate-500">
                                            <LayoutGrid className="h-4 w-4" />
                                        </span>
                                    </div>

                                    {canTransact && (
                                        <div className="mt-4 grid gap-2 sm:grid-cols-2">
                                            <button type="button" onClick={() => handleCheckForCheckout(check)} className="inline-flex h-10 items-center justify-center rounded-lg bg-[#1A4E8D] px-3 text-xs font-bold text-white transition hover:bg-[#153F73]">
                                                Use for checkout
                                            </button>
                                            <button type="button" onClick={() => fireTicket(check)} disabled={Boolean(busy)} className="inline-flex h-10 items-center justify-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 text-xs font-bold text-slate-700 transition hover:bg-slate-50 disabled:opacity-50">
                                                <ChefHat className="h-3.5 w-3.5" />
                                                Fire ticket
                                            </button>
                                        </div>
                                    )}

                                    {(check.lines || []).length > 0 && (
                                        <div className="mt-4 rounded-lg bg-slate-50 px-3 py-2.5">
                                            <div className="mb-1.5 flex items-center justify-between gap-2 text-[11px] font-bold uppercase tracking-wide text-slate-500">
                                                <span>Items</span>
                                                <span>{(check.lines || []).length} line{(check.lines || []).length === 1 ? '' : 's'}</span>
                                            </div>
                                            {(check.lines || []).slice(0, 4).map((line, index) => (
                                                <div key={line.check_line_id || `${check.check_id}-${line.item_id || index}`} className="flex items-start justify-between gap-3 py-0.5 text-xs">
                                                    <span className="min-w-0 break-words font-medium leading-4 text-slate-700">{getKitchenLineName(line, index)}</span>
                                                    <span className="shrink-0 text-slate-500">x{formatKitchenQuantity(line.quantity)}</span>
                                                </div>
                                            ))}
                                            {(check.lines || []).length > 4 && <p className="mt-1 text-xs text-slate-500">+{(check.lines || []).length - 4} more lines</p>}
                                        </div>
                                    )}

                                    {canTransact && (
                                        <details className="mt-4 overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm" data-testid={`fnb-pos-live-actions-${check.check_id}`}>
                                            <summary aria-label={`Manage actions for check ${check.check_id}`} className="flex cursor-pointer list-none items-center justify-between gap-3 px-3 py-3 text-xs font-bold text-slate-700 marker:hidden [&::-webkit-details-marker]:hidden">
                                                <span className="flex min-w-0 items-center gap-2">
                                                    <span className="grid h-7 w-7 shrink-0 place-items-center rounded-lg bg-slate-100 text-slate-600">
                                                        <GitMerge className="h-3.5 w-3.5" />
                                                    </span>
                                                    <span className="min-w-0 break-words">Manage check actions</span>
                                                </span>
                                                <span className="flex shrink-0 items-center gap-2 text-[11px] font-semibold text-slate-400">
                                                    <span className="hidden sm:inline">Transfer · Split · Merge</span>
                                                    <ChevronDown className="h-4 w-4" />
                                                </span>
                                            </summary>
                                            <div className="grid min-w-0 grid-cols-1 gap-3 border-t border-slate-200 bg-slate-50/60 px-3 py-3">
                                                <div className="min-w-0">
                                                    <label className="block text-[11px] font-semibold text-slate-600" htmlFor={`fnb-transfer-${check.check_id}`}>Move table</label>
                                                    <select
                                                        id={`fnb-transfer-${check.check_id}`}
                                                        value={checkTransferTargets[check.check_id] || ''}
                                                        onChange={(event) => setCheckTransferTargets((prev) => ({ ...prev, [check.check_id]: event.target.value }))}
                                                        title="Choose a table to move this check to"
                                                        className="mt-1 h-10 min-w-0 w-full rounded-lg border border-slate-200 bg-white px-2.5 text-xs text-slate-700"
                                                    >
                                                        <option value="">Choose table</option>
                                                        {tables.filter((table) => Number(table.table_id) !== Number(check.table_id)).map((table) => (
                                                            <option key={table.table_id} value={table.table_id}>{table.area_name} - {table.label || table.table_number}</option>
                                                        ))}
                                                    </select>
                                                    <button type="button" onClick={() => transferSelectedCheck(check)} disabled={Boolean(busy) || !checkTransferTargets[check.check_id]} className="mt-1 inline-flex h-9 w-full items-center justify-center gap-1 rounded-lg border border-slate-200 bg-white px-2 text-xs font-bold text-slate-700 transition hover:bg-slate-50 disabled:opacity-50">
                                                        <ArrowRightLeft className="h-3.5 w-3.5" />
                                                        Transfer
                                                    </button>
                                                </div>
                                                <div className="min-w-0">
                                                    <span className="block text-[11px] font-semibold text-slate-600">Split lines</span>
                                                    <div className="mt-1 max-h-20 space-y-1 overflow-y-auto rounded-lg border border-slate-200 bg-white p-1.5">
                                                        {(check.lines || []).map((line, index) => {
                                                            const lineId = Number(line.check_line_id);
                                                            const selectable = Number.isInteger(lineId) && lineId > 0;
                                                            return (
                                                                <label key={line.check_line_id || `${check.check_id}-split-${index}`} className={`flex items-start justify-between gap-2 text-[11px] leading-4 text-slate-700 ${selectable ? '' : 'opacity-50'}`}>
                                                                    <span className="flex min-w-0 items-center gap-1.5">
                                                                        <input
                                                                            type="checkbox"
                                                                            disabled={!selectable}
                                                                            checked={selectable && (checkLineSelections[check.check_id] || []).includes(lineId)}
                                                                            onChange={(event) => toggleSplitLine(check.check_id, line.check_line_id, event.target.checked)}
                                                                        />
                                                                        <span className="min-w-0 break-words">{line.item?.name || line.item_name || `Item #${line.item_id || index + 1}`}</span>
                                                                    </span>
                                                                    <span className="shrink-0 text-slate-500">x{formatKitchenQuantity(line.quantity)}</span>
                                                                </label>
                                                            );
                                                        })}
                                                        {(check.lines || []).length === 0 && <p className="px-1 text-[11px] text-slate-500">No lines to split.</p>}
                                                    </div>
                                                    <button type="button" onClick={() => splitSelectedCheck(check)} disabled={Boolean(busy) || (checkLineSelections[check.check_id] || []).length === 0} className="mt-1 inline-flex h-9 w-full items-center justify-center gap-1 rounded-lg border border-slate-200 bg-white px-2 text-xs font-bold text-slate-700 transition hover:bg-slate-50 disabled:opacity-50">
                                                        <Scissors className="h-3.5 w-3.5" />
                                                        Split
                                                    </button>
                                                </div>
                                                <div className="min-w-0">
                                                    <label className="block text-[11px] font-semibold text-slate-600" htmlFor={`fnb-merge-${check.check_id}`}>Merge with</label>
                                                    <select
                                                        id={`fnb-merge-${check.check_id}`}
                                                        value={checkMergeSources[check.check_id] || ''}
                                                        onChange={(event) => setCheckMergeSources((prev) => ({ ...prev, [check.check_id]: event.target.value }))}
                                                        title="Choose another check to merge into this check"
                                                        className="mt-1 h-10 min-w-0 w-full rounded-lg border border-slate-200 bg-white px-2.5 text-xs text-slate-700"
                                                    >
                                                        <option value="">Choose check</option>
                                                        {checks.filter((entry) => Number(entry.check_id) !== Number(check.check_id)).map((entry) => (
                                                            <option key={entry.check_id} value={entry.check_id}>Check #{entry.check_id}</option>
                                                        ))}
                                                    </select>
                                                    <button type="button" onClick={() => mergeSelectedChecks(check)} disabled={Boolean(busy) || !checkMergeSources[check.check_id]} className="mt-1 inline-flex h-9 w-full items-center justify-center gap-1 rounded-lg border border-slate-200 bg-white px-2 text-xs font-bold text-slate-700 transition hover:bg-slate-50 disabled:opacity-50">
                                                        <GitMerge className="h-3.5 w-3.5" />
                                                        Merge
                                                    </button>
                                                </div>
                                            </div>
                                        </details>
                                    )}

                                    {(check.kitchenTickets || []).length > 0 && (
                                        <div className="mt-4 space-y-2 border-t border-slate-100 pt-3">
                                            {(check.kitchenTickets || []).slice(0, 2).map((ticket) => (
                                                <div key={ticket.kitchen_ticket_id} className="rounded-lg border border-slate-100 bg-slate-50/60 p-2.5 text-xs">
                                                    <div className="flex flex-wrap items-center justify-between gap-2">
                                                        <span className="font-bold text-slate-700">{ticket.ticket_number} · {statusLabel(ticket.status)}</span>
                                                        <span className="text-slate-500">{ticket.station?.name || getTicketSourceLabel(ticket, check)}</span>
                                                    </div>
                                                    <div className="mt-2 space-y-1">
                                                        {getTicketSnapshotLines(ticket, check).slice(0, 3).map((line, index) => (
                                                            <div key={line.check_line_id || `${ticket.kitchen_ticket_id}-${line.item_id || index}`} className="flex items-center justify-between gap-2">
                                                                <span className="text-slate-600">{getKitchenLineName(line, index)}</span>
                                                                <span className="text-slate-500">x{formatKitchenQuantity(line.quantity)}</span>
                                                            </div>
                                                        ))}
                                                    </div>
                                                    {canTransact && (kitchenStatusTransitions[ticket.status] || []).length > 0 && (
                                                        <div className="mt-2 flex flex-wrap gap-1" data-testid={`fnb-pos-ticket-actions-${ticket.kitchen_ticket_id}`}>
                                                            {(kitchenStatusTransitions[ticket.status] || []).map((status) => (
                                                                <button key={status} type="button" onClick={() => progressTicket(ticket, status)} disabled={Boolean(busy)} className="rounded-md border border-slate-200 bg-white px-2 py-1 text-[11px] font-semibold capitalize text-slate-600 disabled:opacity-50">
                                                                    {statusLabel(status)}
                                                                </button>
                                                            ))}
                                                        </div>
                                                    )}
                                                </div>
                                            ))}
                                        </div>
                                    )}
                                </article>
                            ))}
                        </div>
                    )}
                </div>
            </div>
        </section>
    );
}
