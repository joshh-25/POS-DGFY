import React, { useCallback, useEffect, useState } from 'react';
import { ChefHat, LayoutGrid, Utensils } from 'lucide-react';
import { toast } from 'sonner';
import {
    createFnbCheck,
    createFnbKitchenTicket,
    getFnbServiceChargeSettings,
    listFnbChecks,
    listFnbDiningAreas,
    listFnbKitchenStations,
    updateFnbKitchenTicketStatus
} from '../api/fnbApi.js';
import {
    formatKitchenQuantity,
    getKitchenLineName,
    getTicketSnapshotLines,
    getTicketSourceLabel
} from '../utils/kitchenQueueDisplay.js';

export default function FnbDiningPanel({ onSelectCheckoutContext }) {
    const [diningAreas, setDiningAreas] = useState([]);
    const [checks, setChecks] = useState([]);
    const [stations, setStations] = useState([]);
    const [serviceCharge, setServiceCharge] = useState(null);
    const [loading, setLoading] = useState(true);
    const [busy, setBusy] = useState('');
    const [newCheck, setNewCheck] = useState({ table_id: '', guest_count: 2, order_method: 'dine_in' });

    const loadQueue = useCallback(async () => {
        setLoading(true);
        try {
            const [areasData, checksData, stationsData, serviceChargeData] = await Promise.all([
                listFnbDiningAreas(),
                listFnbChecks({ statuses: 'open,sent_to_kitchen,partially_paid', limit: 50 }),
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
    }, []);

    useEffect(() => {
        loadQueue();
    }, [loadQueue]);

    const tables = diningAreas.flatMap((area) => (area.tables || []).map((table) => ({
        ...table,
        area_name: area.name
    })));

    const selectedTable = tables.find((table) => String(table.table_id) === String(newCheck.table_id));

    const openCheck = async () => {
        setBusy('open');
        try {
            const data = await createFnbCheck({
                table_id: newCheck.table_id ? Number(newCheck.table_id) : null,
                guest_count: Number(newCheck.guest_count || 1),
                order_method: newCheck.order_method
            });
            const check = data?.check;
            if (check) {
                onSelectCheckoutContext?.({
                    fnb_check_id: check.check_id,
                    fnb_table_id: check.table_id || null,
                    fnb_table_label_snapshot: check.table?.label || check.table?.table_number || selectedTable?.label || null,
                    fnb_guest_count: check.guest_count || Number(newCheck.guest_count || 1),
                    fnb_server_id: check.server_id || null,
                    restaurant_service_charge: serviceCharge
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
        onSelectCheckoutContext?.({
            fnb_check_id: check.check_id,
            fnb_table_id: check.table_id || null,
            fnb_table_label_snapshot: check.table?.label || check.table?.table_number || null,
            fnb_guest_count: check.guest_count || null,
            fnb_server_id: check.server_id || null,
            restaurant_service_charge: serviceCharge
        });
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

    return (
        <section className="rounded-lg border border-red-200 bg-white p-4 shadow-sm">
            <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
                <div className="flex items-center gap-2">
                    <Utensils className="h-5 w-5 text-red-700" />
                    <div>
                        <h2 className="text-lg font-semibold text-slate-900">Food & Beverage Service</h2>
                        <p className="text-sm text-slate-500">Attach a table/check to checkout and keep kitchen tickets moving.</p>
                    </div>
                </div>
                <button type="button" onClick={loadQueue} className="rounded-lg border border-slate-300 px-3 py-2 text-sm font-semibold text-slate-700">Refresh</button>
            </div>
            <div className="grid gap-4 xl:grid-cols-[320px_1fr]">
                <div className="rounded-lg border border-slate-200 p-3">
                    <div className="mb-2 flex items-center gap-2 text-sm font-semibold text-slate-900">
                        <LayoutGrid className="h-4 w-4" />
                        Open Check
                    </div>
                    <div className="space-y-2">
                        <label className="block text-xs text-slate-500">
                            Table
                            <select
                                value={newCheck.table_id}
                                onChange={(event) => setNewCheck((prev) => ({ ...prev, table_id: event.target.value }))}
                                className="mt-1 w-full rounded-lg border border-slate-200 px-2 py-2 text-sm"
                            >
                                <option value="">Takeout / no table</option>
                                {tables.map((table) => (
                                    <option key={table.table_id} value={table.table_id}>
                                        {table.area_name} - {table.label || table.table_number}
                                    </option>
                                ))}
                            </select>
                        </label>
                        <div className="grid grid-cols-2 gap-2">
                            <label className="block text-xs text-slate-500">
                                Guests
                                <input
                                    type="number"
                                    min="1"
                                    value={newCheck.guest_count}
                                    onChange={(event) => setNewCheck((prev) => ({ ...prev, guest_count: event.target.value }))}
                                    className="mt-1 w-full rounded-lg border border-slate-200 px-2 py-2 text-sm"
                                />
                            </label>
                            <label className="block text-xs text-slate-500">
                                Method
                                <select
                                    value={newCheck.order_method}
                                    onChange={(event) => setNewCheck((prev) => ({ ...prev, order_method: event.target.value }))}
                                    className="mt-1 w-full rounded-lg border border-slate-200 px-2 py-2 text-sm"
                                >
                                    <option value="dine_in">Dine In</option>
                                    <option value="takeout">Takeout</option>
                                    <option value="pickup">Pickup</option>
                                    <option value="delivery">Delivery</option>
                                </select>
                            </label>
                        </div>
                        <button
                            type="button"
                            onClick={openCheck}
                            disabled={busy === 'open'}
                            className="w-full rounded-lg bg-red-600 px-3 py-2 text-sm font-semibold text-white hover:bg-red-700 disabled:opacity-50"
                        >
                            {busy === 'open' ? 'Opening...' : 'Open Check'}
                        </button>
                    </div>
                </div>
                <div className="grid gap-3 lg:grid-cols-2">
                    {checks.map((check) => (
                        <article key={check.check_id} className="rounded-lg border border-slate-200 p-3">
                            <div className="flex items-start justify-between gap-3">
                                <div>
                                    <p className="text-sm font-semibold text-slate-900">Check #{check.check_id}</p>
                                    <p className="text-xs text-slate-500">{check.table?.label || check.table?.table_number || check.order_method} - {check.guest_count || 1} guests</p>
                                </div>
                                <span className="rounded-full bg-slate-100 px-2 py-1 text-xs font-semibold text-slate-700">{check.status}</span>
                            </div>
                            <div className="mt-3 flex flex-wrap gap-2">
                                <button type="button" onClick={() => handleCheckForCheckout(check)} className="rounded-lg border border-slate-300 px-2.5 py-1.5 text-xs font-semibold text-slate-700">
                                    Use for checkout
                                </button>
                                <button type="button" onClick={() => fireTicket(check)} disabled={Boolean(busy)} className="inline-flex items-center gap-1 rounded-lg border border-slate-300 px-2.5 py-1.5 text-xs font-semibold text-slate-700 disabled:opacity-50">
                                    <ChefHat className="h-3.5 w-3.5" />
                                    Fire ticket
                                </button>
                            </div>
                            {(check.lines || []).length > 0 && (
                                <div className="mt-3 rounded-lg border border-slate-100 bg-slate-50 p-2">
                                    {(check.lines || []).slice(0, 4).map((line, index) => (
                                        <div key={line.check_line_id || `${check.check_id}-${line.item_id || index}`} className="flex items-center justify-between gap-2 text-xs">
                                            <span className="font-medium text-slate-700">{getKitchenLineName(line, index)}</span>
                                            <span className="text-slate-500">x{formatKitchenQuantity(line.quantity)}</span>
                                        </div>
                                    ))}
                                    {(check.lines || []).length > 4 && (
                                        <p className="mt-1 text-xs text-slate-500">+{(check.lines || []).length - 4} more lines</p>
                                    )}
                                </div>
                            )}
                            {(check.kitchenTickets || []).length > 0 && (
                                <div className="mt-3 space-y-2 border-t border-slate-100 pt-3">
                                    {(check.kitchenTickets || []).slice(0, 2).map((ticket) => (
                                        <div key={ticket.kitchen_ticket_id} className="rounded-lg border border-slate-100 p-2 text-xs">
                                            <div className="flex flex-wrap items-center justify-between gap-2">
                                                <span className="font-semibold text-slate-700">{ticket.ticket_number} - {ticket.status}</span>
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
                                            <div className="mt-2 flex flex-wrap gap-1">
                                                {['preparing', 'ready', 'served'].map((status) => (
                                                    <button key={status} type="button" onClick={() => progressTicket(ticket, status)} disabled={Boolean(busy)} className="rounded border border-slate-200 px-2 py-1 text-slate-600 disabled:opacity-50">
                                                        {status}
                                                    </button>
                                                ))}
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            )}
                        </article>
                    ))}
                    {!loading && checks.length === 0 && <p className="text-sm text-slate-500">No active F&B checks.</p>}
                </div>
            </div>
        </section>
    );
}
