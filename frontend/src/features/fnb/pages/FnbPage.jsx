import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { CalendarClock, ChefHat, ClipboardList, LayoutGrid, Percent, Plus, RefreshCcw, Utensils } from 'lucide-react';
import { toast } from 'sonner';
import { getItems } from '../../../services/itemService.js';
import {
  createFnbDiningArea,
  createFnbKitchenStation,
  createFnbModifierGroup,
  createFnbReservation,
  getFnbDashboard,
  getFnbServiceChargeSettings,
  listFnbChecks,
  listFnbDiningAreas,
  listFnbItemKitchenRoutes,
  listFnbItemModifierGroups,
  listFnbKitchenStations,
  listFnbModifierGroups,
  listFnbReservations,
  mergeFnbChecks,
  replaceFnbItemModifierGroups,
  splitFnbCheck,
  transferFnbCheck,
  updateFnbCheckStatus,
  updateFnbKitchenTicketStatus,
  updateFnbReservationStatus,
  updateFnbServiceChargeSettings,
  upsertFnbItemKitchenRoute
} from '../api/fnbApi.js';

const tabs = [
  { key: 'floor', label: 'Tables', icon: LayoutGrid },
  { key: 'checks', label: 'Checks', icon: ClipboardList },
  { key: 'kitchen', label: 'Kitchen', icon: ChefHat },
  { key: 'menu', label: 'Menu', icon: Utensils },
  { key: 'reservations', label: 'Reservations', icon: CalendarClock },
  { key: 'settings', label: 'Service Charge', icon: Percent }
];

const money = (value) => Number(value || 0).toFixed(2);
const nowLocalInput = () => {
  const now = new Date();
  now.setMinutes(now.getMinutes() - now.getTimezoneOffset());
  return now.toISOString().slice(0, 16);
};

const reservationAssignedTableIds = (reservation) => {
  const ids = [
    ...(Array.isArray(reservation?.reservationTables)
      ? reservation.reservationTables.map((entry) => entry.table_id)
      : []),
    reservation?.table_id
  ];
  return [...new Set(ids.map((entry) => Number(entry)).filter((entry) => Number.isInteger(entry) && entry > 0))];
};

const statusBadgeClass = (status) => {
  const normalized = String(status || '').trim();
  if (['available', 'ready', 'paid', 'confirmed', 'served', 'seated'].includes(normalized)) return 'border-emerald-200 bg-emerald-50 text-emerald-700';
  if (['queued', 'preparing', 'sent_to_kitchen', 'waitlisted', 'held'].includes(normalized)) return 'border-amber-200 bg-amber-50 text-amber-700';
  if (['cancelled', 'voided', 'no_show', 'out_of_service'].includes(normalized)) return 'border-rose-200 bg-rose-50 text-rose-700';
  return 'border-slate-200 bg-slate-50 text-slate-700';
};

const Field = ({ label, children }) => (
  <label className="block text-xs font-medium text-slate-600">
    <span>{label}</span>
    <div className="mt-1">{children}</div>
  </label>
);

const TextInput = (props) => (
  <input
    {...props}
    className={`h-10 w-full rounded-lg border border-slate-200 px-3 text-sm outline-none focus:border-teal-500 focus:ring-2 focus:ring-teal-100 ${props.className || ''}`}
  />
);

const SelectInput = (props) => (
  <select
    {...props}
    className={`h-10 w-full rounded-lg border border-slate-200 px-3 text-sm outline-none focus:border-teal-500 focus:ring-2 focus:ring-teal-100 ${props.className || ''}`}
  />
);

const ActionButton = ({ children, className = '', ...props }) => (
  <button
    {...props}
    className={`inline-flex items-center justify-center gap-2 rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50 ${className}`}
  >
    {children}
  </button>
);

export default function FnbPage() {
  const [activeTab, setActiveTab] = useState('floor');
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState('');
  const [dashboard, setDashboard] = useState(null);
  const [diningAreas, setDiningAreas] = useState([]);
  const [checks, setChecks] = useState([]);
  const [stations, setStations] = useState([]);
  const [modifierGroups, setModifierGroups] = useState([]);
  const [itemKitchenRoutes, setItemKitchenRoutes] = useState([]);
  const [itemModifierGroups, setItemModifierGroups] = useState([]);
  const [menuItems, setMenuItems] = useState([]);
  const [reservations, setReservations] = useState([]);
  const [serviceCharge, setServiceCharge] = useState({ enabled: false, label: 'Restaurant service charge', rate: 0, taxable: false });
  const [areaForm, setAreaForm] = useState({ name: 'Main Dining', service_type: 'dine_in', table_count: 6, seat_count: 4 });
  const [stationForm, setStationForm] = useState({ name: 'Hot Line', station_type: 'hot_line', ticket_prefix: 'HOT' });
  const [modifierForm, setModifierForm] = useState({ name: 'Doneness', min_select: 1, max_select: 1, options_text: 'Rare\nMedium\nWell done' });
  const [routeForm, setRouteForm] = useState({ item_id: '', kitchen_station_id: '', default_course: 'main' });
  const [modifierAssignmentForm, setModifierAssignmentForm] = useState({ item_id: '', modifier_group_ids: [] });
  const [checkLineSelections, setCheckLineSelections] = useState({});
  const [checkTransferTargets, setCheckTransferTargets] = useState({});
  const [checkMergeSources, setCheckMergeSources] = useState({});
  const [reservationTableSelections, setReservationTableSelections] = useState({});
  const [reservationForm, setReservationForm] = useState({
    customer_name: '',
    customer_phone: '',
    party_size: 2,
    requested_at: nowLocalInput(),
    duration_minutes: 90,
    buffer_minutes: 15,
    table_ids: [],
    notes: ''
  });
  const [reservationFilters, setReservationFilters] = useState({ table_id: '', status: '', from: '', to: '' });

  const loadAll = useCallback(async () => {
    setLoading(true);
    try {
      const [
        dashboardData,
        diningData,
        checkData,
        stationData,
        modifierData,
        routeData,
        itemModifierData,
        itemData,
        reservationData,
        serviceChargeData
      ] = await Promise.all([
        getFnbDashboard(),
        listFnbDiningAreas(),
        listFnbChecks({ statuses: 'open,sent_to_kitchen,partially_paid', limit: 100 }),
        listFnbKitchenStations(),
        listFnbModifierGroups(),
        listFnbItemKitchenRoutes(),
        listFnbItemModifierGroups(),
        getItems({ limit: 200 }),
        listFnbReservations({
          limit: 100,
          ...(reservationFilters.status ? { status: reservationFilters.status } : {}),
          ...(reservationFilters.table_id ? { table_id: reservationFilters.table_id } : {}),
          ...(reservationFilters.from ? { from: new Date(reservationFilters.from).toISOString() } : {}),
          ...(reservationFilters.to ? { to: new Date(reservationFilters.to).toISOString() } : {})
        }),
        getFnbServiceChargeSettings()
      ]);
      setDashboard(dashboardData || null);
      setDiningAreas(Array.isArray(diningData?.dining_areas) ? diningData.dining_areas : []);
      setChecks(Array.isArray(checkData?.checks) ? checkData.checks : []);
      setStations(Array.isArray(stationData?.kitchen_stations) ? stationData.kitchen_stations : []);
      setModifierGroups(Array.isArray(modifierData?.modifier_groups) ? modifierData.modifier_groups : []);
      setItemKitchenRoutes(Array.isArray(routeData?.item_kitchen_routes) ? routeData.item_kitchen_routes : []);
      setItemModifierGroups(Array.isArray(itemModifierData?.item_modifier_groups) ? itemModifierData.item_modifier_groups : []);
      setMenuItems(Array.isArray(itemData?.items) ? itemData.items : []);
      setReservations(Array.isArray(reservationData?.reservations) ? reservationData.reservations : []);
      setServiceCharge(serviceChargeData?.service_charge || { enabled: false, label: 'Restaurant service charge', rate: 0, taxable: false });
    } catch (error) {
      toast.error(error?.response?.data?.message || 'Unable to load Food & Beverage console.');
    } finally {
      setLoading(false);
    }
  }, [reservationFilters]);

  useEffect(() => {
    loadAll();
  }, [loadAll]);

  const tableCount = useMemo(
    () => diningAreas.reduce((sum, area) => sum + (Array.isArray(area.tables) ? area.tables.length : 0), 0),
    [diningAreas]
  );
  const allTables = useMemo(() => diningAreas.flatMap((area) => (
    (area.tables || []).map((table) => ({ ...table, area_name: area.name }))
  )), [diningAreas]);
  const menuItemsById = useMemo(
    () => new Map(menuItems.map((item) => [Number(item.item_id), item])),
    [menuItems]
  );
  const reservationGroups = useMemo(() => {
    const groups = new Map();
    reservations.forEach((reservation) => {
      const key = Number.isFinite(new Date(reservation.requested_at).getTime())
        ? new Date(reservation.requested_at).toLocaleDateString()
        : 'Unscheduled';
      const entries = groups.get(key) || [];
      entries.push(reservation);
      groups.set(key, entries);
    });
    return Array.from(groups.entries());
  }, [reservations]);

  const submitWithRefresh = async (key, action, successMessage) => {
    setBusy(key);
    try {
      await action();
      await loadAll();
      toast.success(successMessage);
    } catch (error) {
      toast.error(error?.response?.data?.message || 'Unable to save Food & Beverage changes.');
    } finally {
      setBusy('');
    }
  };

  const createArea = () => submitWithRefresh('area', async () => {
    const tableCountValue = Math.max(1, Number(areaForm.table_count || 1));
    const tables = Array.from({ length: tableCountValue }).map((_, index) => ({
      table_number: String(index + 1),
      label: `${areaForm.name || 'Area'} ${index + 1}`,
      seat_count: Math.max(1, Number(areaForm.seat_count || 2))
    }));
    await createFnbDiningArea({
      name: areaForm.name,
      service_type: areaForm.service_type,
      tables
    });
  }, 'Dining area created.');

  const createStation = () => submitWithRefresh('station', async () => {
    await createFnbKitchenStation(stationForm);
  }, 'Kitchen station created.');

  const createModifier = () => submitWithRefresh('modifier', async () => {
    const options = String(modifierForm.options_text || '')
      .split('\n')
      .map((line) => line.trim())
      .filter(Boolean)
      .map((name, index) => ({ name, sort_order: index }));
    await createFnbModifierGroup({
      name: modifierForm.name,
      min_select: Number(modifierForm.min_select || 0),
      max_select: Number(modifierForm.max_select || 1),
      required: Number(modifierForm.min_select || 0) > 0,
      options
    });
  }, 'Modifier group created.');

  const saveItemKitchenRoute = () => submitWithRefresh('item-route', async () => {
    await upsertFnbItemKitchenRoute(Number(routeForm.item_id), {
      kitchen_station_id: Number(routeForm.kitchen_station_id),
      default_course: routeForm.default_course
    });
  }, 'Item kitchen route saved.');

  const saveItemModifierGroups = () => submitWithRefresh('item-modifiers', async () => {
    await replaceFnbItemModifierGroups(Number(modifierAssignmentForm.item_id), {
      modifier_groups: modifierAssignmentForm.modifier_group_ids.map((modifierGroupId, index) => ({
        modifier_group_id: Number(modifierGroupId),
        sort_order: index
      }))
    });
  }, 'Item modifier assignments saved.');

  const selectMenuItemForAssignment = (itemId) => {
    const normalizedItemId = String(itemId || '');
    const existingRoute = itemKitchenRoutes.find((route) => Number(route.item_id) === Number(normalizedItemId));
    const existingModifierGroupIds = itemModifierGroups
      .filter((assignment) => Number(assignment.item_id) === Number(normalizedItemId))
      .map((assignment) => String(assignment.modifier_group_id));
    setRouteForm({
      item_id: normalizedItemId,
      kitchen_station_id: existingRoute?.kitchen_station_id ? String(existingRoute.kitchen_station_id) : '',
      default_course: existingRoute?.default_course || 'main'
    });
    setModifierAssignmentForm({
      item_id: normalizedItemId,
      modifier_group_ids: existingModifierGroupIds
    });
  };

  const transferSelectedCheck = (check) => submitWithRefresh(`transfer-${check.check_id}`, async () => {
    await transferFnbCheck(check.check_id, { table_id: Number(checkTransferTargets[check.check_id]) });
  }, 'Check transferred.');

  const splitSelectedCheck = (check) => submitWithRefresh(`split-${check.check_id}`, async () => {
    const lineIds = Array.from(checkLineSelections[check.check_id] || [])
      .map((entry) => Number(entry))
      .filter((entry) => Number.isInteger(entry) && entry > 0);
    await splitFnbCheck(check.check_id, { line_ids: lineIds });
    setCheckLineSelections((prev) => ({ ...prev, [check.check_id]: new Set() }));
  }, 'Check split.');

  const mergeSelectedChecks = (check) => submitWithRefresh(`merge-${check.check_id}`, async () => {
    await mergeFnbChecks(check.check_id, { source_check_id: Number(checkMergeSources[check.check_id]) });
  }, 'Checks merged.');

  const toggleSplitLine = (checkId, lineId, checked) => {
    setCheckLineSelections((prev) => {
      const next = new Set(prev[checkId] || []);
      if (checked) {
        next.add(Number(lineId));
      } else {
        next.delete(Number(lineId));
      }
      return { ...prev, [checkId]: next };
    });
  };

  const createReservation = () => submitWithRefresh('reservation', async () => {
    await createFnbReservation({
      ...reservationForm,
      party_size: Number(reservationForm.party_size || 2),
      duration_minutes: Number(reservationForm.duration_minutes || 90),
      buffer_minutes: Number(reservationForm.buffer_minutes || 15),
      table_id: reservationForm.table_ids[0] ? Number(reservationForm.table_ids[0]) : null,
      table_ids: reservationForm.table_ids.map((entry) => Number(entry)).filter(Boolean),
      requested_at: new Date(reservationForm.requested_at).toISOString()
    });
    setReservationForm((prev) => ({ ...prev, customer_name: '', customer_phone: '', notes: '', table_ids: [] }));
  }, 'Reservation request created.');

  const updateReservation = (reservation, status) => submitWithRefresh(
    `reservation-${reservation.reservation_request_id}-${status}`,
    () => updateFnbReservationStatus(reservation.reservation_request_id, {
      status,
      table_ids: reservationTableSelections[reservation.reservation_request_id] || reservationAssignedTableIds(reservation),
      duration_minutes: Number(reservation.duration_minutes || 90),
      buffer_minutes: Number(reservation.buffer_minutes || 15)
    }),
    'Reservation updated.'
  );

  const saveServiceCharge = () => submitWithRefresh('service-charge', async () => {
    await updateFnbServiceChargeSettings({
      ...serviceCharge,
      rate: Number(serviceCharge.rate || 0)
    });
  }, 'Restaurant service charge settings saved.');

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold text-slate-900">Food & Beverage</h1>
          <p className="text-sm text-slate-500">Run floor service, checks, kitchen routing, menu modifiers, reservation requests, and restaurant service charge.</p>
        </div>
        <ActionButton type="button" onClick={loadAll} disabled={loading}>
          <RefreshCcw className="h-4 w-4" />
          Refresh
        </ActionButton>
      </div>

      <div className="grid gap-3 md:grid-cols-4">
        <div className="rounded-lg border border-slate-200 bg-white p-4">
          <p className="text-xs font-semibold uppercase text-slate-500">Open Checks</p>
          <p className="mt-2 text-2xl font-semibold text-slate-900">{dashboard?.open_checks ?? checks.length}</p>
        </div>
        <div className="rounded-lg border border-slate-200 bg-white p-4">
          <p className="text-xs font-semibold uppercase text-slate-500">Tables</p>
          <p className="mt-2 text-2xl font-semibold text-slate-900">{tableCount}</p>
        </div>
        <div className="rounded-lg border border-slate-200 bg-white p-4">
          <p className="text-xs font-semibold uppercase text-slate-500">Kitchen Stations</p>
          <p className="mt-2 text-2xl font-semibold text-slate-900">{stations.length}</p>
        </div>
        <div className="rounded-lg border border-slate-200 bg-white p-4">
          <p className="text-xs font-semibold uppercase text-slate-500">Pending Reservations</p>
          <p className="mt-2 text-2xl font-semibold text-slate-900">{reservations.filter((entry) => entry.status === 'requested').length}</p>
        </div>
      </div>

      <div className="flex flex-wrap gap-2 border-b border-slate-200">
        {tabs.map((tab) => {
          const Icon = tab.icon;
          const active = tab.key === activeTab;
          return (
            <button
              key={tab.key}
              type="button"
              onClick={() => setActiveTab(tab.key)}
              className={`inline-flex items-center gap-2 border-b-2 px-3 py-2 text-sm font-semibold ${active ? 'border-teal-600 text-teal-700' : 'border-transparent text-slate-500 hover:text-slate-900'}`}
            >
              <Icon className="h-4 w-4" />
              {tab.label}
            </button>
          );
        })}
      </div>

      {loading ? (
        <p className="rounded-lg border border-slate-200 bg-white p-4 text-sm text-slate-500">Loading Food & Beverage console...</p>
      ) : (
        <>
          {activeTab === 'floor' && (
            <div className="grid gap-4 xl:grid-cols-[1fr_360px]">
              <section className="rounded-lg border border-slate-200 bg-white p-4">
                <h2 className="text-lg font-semibold text-slate-900">Floor</h2>
                <div className="mt-4 grid gap-4 lg:grid-cols-2">
                  {diningAreas.map((area) => (
                    <article key={area.dining_area_id} className="rounded-lg border border-slate-200 p-3">
                      <div className="flex items-center justify-between gap-3">
                        <div>
                          <p className="text-sm font-semibold text-slate-900">{area.name}</p>
                          <p className="text-xs text-slate-500">{area.service_type}</p>
                        </div>
                        <span className="text-xs text-slate-500">{area.tables?.length || 0} tables</span>
                      </div>
                      <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-3">
                        {(area.tables || []).map((table) => (
                          <div key={table.table_id} className={`rounded-lg border px-3 py-2 text-sm ${statusBadgeClass(table.status)}`}>
                            <p className="font-semibold">{table.label || table.table_number}</p>
                            <p className="text-xs">{table.seat_count} seats - {table.status}</p>
                          </div>
                        ))}
                      </div>
                    </article>
                  ))}
                </div>
              </section>
              <section className="rounded-lg border border-slate-200 bg-white p-4">
                <h2 className="text-lg font-semibold text-slate-900">Create Area</h2>
                <div className="mt-3 space-y-3">
                  <Field label="Area Name"><TextInput value={areaForm.name} onChange={(event) => setAreaForm({ ...areaForm, name: event.target.value })} /></Field>
                  <Field label="Service Type">
                    <SelectInput value={areaForm.service_type} onChange={(event) => setAreaForm({ ...areaForm, service_type: event.target.value })}>
                      <option value="dine_in">Dine In</option>
                      <option value="outdoor">Outdoor</option>
                      <option value="bar">Bar</option>
                      <option value="private_room">Private Room</option>
                    </SelectInput>
                  </Field>
                  <div className="grid grid-cols-2 gap-2">
                    <Field label="Tables"><TextInput type="number" min="1" value={areaForm.table_count} onChange={(event) => setAreaForm({ ...areaForm, table_count: event.target.value })} /></Field>
                    <Field label="Seats Each"><TextInput type="number" min="1" value={areaForm.seat_count} onChange={(event) => setAreaForm({ ...areaForm, seat_count: event.target.value })} /></Field>
                  </div>
                  <ActionButton type="button" onClick={createArea} disabled={busy === 'area'} className="w-full">
                    <Plus className="h-4 w-4" />
                    Create Area
                  </ActionButton>
                </div>
              </section>
            </div>
          )}

          {activeTab === 'checks' && (
            <section className="rounded-lg border border-slate-200 bg-white p-4">
              <h2 className="text-lg font-semibold text-slate-900">Open Checks</h2>
              <div className="mt-4 grid gap-3 lg:grid-cols-2">
                {checks.map((check) => (
                  <article key={check.check_id} className="rounded-lg border border-slate-200 p-3">
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <p className="text-sm font-semibold text-slate-900">Check #{check.check_id}</p>
                        <p className="text-xs text-slate-500">{check.table?.label || check.table?.table_number || check.order_method} - {check.guest_count || 1} guests</p>
                      </div>
                      <span className={`rounded-full border px-2 py-1 text-xs font-semibold ${statusBadgeClass(check.status)}`}>{check.status}</span>
                    </div>
                    <div className="mt-3 flex flex-wrap gap-2">
                      {['sent_to_kitchen', 'partially_paid', 'paid', 'voided'].map((status) => (
                        <ActionButton key={status} type="button" onClick={() => submitWithRefresh(`check-${check.check_id}-${status}`, () => updateFnbCheckStatus(check.check_id, { status }), 'Check updated.')} disabled={Boolean(busy)}>
                          {status.replace(/_/g, ' ')}
                        </ActionButton>
                      ))}
                    </div>
                    <div className="mt-3 grid gap-2 border-t border-slate-100 pt-3 md:grid-cols-3">
                      <Field label="Transfer To">
                        <SelectInput value={checkTransferTargets[check.check_id] || ''} onChange={(event) => setCheckTransferTargets((prev) => ({ ...prev, [check.check_id]: event.target.value }))}>
                          <option value="">Table</option>
                          {allTables.filter((table) => Number(table.table_id) !== Number(check.table_id)).map((table) => (
                            <option key={table.table_id} value={table.table_id}>{table.area_name} - {table.label || table.table_number}</option>
                          ))}
                        </SelectInput>
                        <ActionButton type="button" onClick={() => transferSelectedCheck(check)} disabled={Boolean(busy) || !checkTransferTargets[check.check_id]} className="mt-2 w-full">Transfer</ActionButton>
                      </Field>
                      <Field label="Split Lines">
                        <div className="mt-1 max-h-32 space-y-1 overflow-y-auto rounded-lg border border-slate-200 p-2">
                          {(check.lines || []).map((line) => (
                            <label key={line.check_line_id} className="flex items-center justify-between gap-2 text-xs text-slate-700">
                              <span className="flex items-center gap-2">
                                <input
                                  type="checkbox"
                                  checked={(checkLineSelections[check.check_id] || new Set()).has(Number(line.check_line_id))}
                                  onChange={(event) => toggleSplitLine(check.check_id, line.check_line_id, event.target.checked)}
                                />
                                {line.item?.name || `Item #${line.item_id}`}
                              </span>
                              <span className="text-slate-500">x{line.quantity}</span>
                            </label>
                          ))}
                          {(check.lines || []).length === 0 && <p className="text-xs text-slate-500">No lines to split.</p>}
                        </div>
                        <ActionButton type="button" onClick={() => splitSelectedCheck(check)} disabled={Boolean(busy) || (checkLineSelections[check.check_id] || new Set()).size === 0} className="mt-2 w-full">Split</ActionButton>
                      </Field>
                      <Field label="Merge Source">
                        <SelectInput value={checkMergeSources[check.check_id] || ''} onChange={(event) => setCheckMergeSources((prev) => ({ ...prev, [check.check_id]: event.target.value }))}>
                          <option value="">Check</option>
                          {checks.filter((entry) => Number(entry.check_id) !== Number(check.check_id)).map((entry) => (
                            <option key={entry.check_id} value={entry.check_id}>Check #{entry.check_id}</option>
                          ))}
                        </SelectInput>
                        <ActionButton type="button" onClick={() => mergeSelectedChecks(check)} disabled={Boolean(busy) || !checkMergeSources[check.check_id]} className="mt-2 w-full">Merge</ActionButton>
                      </Field>
                    </div>
                  </article>
                ))}
                {checks.length === 0 && <p className="text-sm text-slate-500">No open checks.</p>}
              </div>
            </section>
          )}

          {activeTab === 'kitchen' && (
            <div className="grid gap-4 xl:grid-cols-[1fr_360px]">
              <section className="rounded-lg border border-slate-200 bg-white p-4">
                <h2 className="text-lg font-semibold text-slate-900">Kitchen Queue</h2>
                <div className="mt-4 grid gap-3">
                  {checks.flatMap((check) => check.kitchenTickets || []).map((ticket) => (
                    <article key={ticket.kitchen_ticket_id} className="rounded-lg border border-slate-200 p-3">
                      <div className="flex items-center justify-between gap-3">
                        <div>
                          <p className="text-sm font-semibold text-slate-900">{ticket.ticket_number}</p>
                          <p className="text-xs text-slate-500">{ticket.station?.name || 'Unassigned station'}</p>
                        </div>
                        <span className={`rounded-full border px-2 py-1 text-xs font-semibold ${statusBadgeClass(ticket.status)}`}>{ticket.status}</span>
                      </div>
                      <div className="mt-3 flex flex-wrap gap-2">
                        {['preparing', 'ready', 'served', 'cancelled'].map((status) => (
                          <ActionButton key={status} type="button" onClick={() => submitWithRefresh(`ticket-${ticket.kitchen_ticket_id}-${status}`, () => updateFnbKitchenTicketStatus(ticket.kitchen_ticket_id, { status }), 'Kitchen ticket updated.')} disabled={Boolean(busy)}>
                            {status}
                          </ActionButton>
                        ))}
                      </div>
                    </article>
                  ))}
                  {checks.flatMap((check) => check.kitchenTickets || []).length === 0 && <p className="text-sm text-slate-500">No active kitchen tickets.</p>}
                </div>
              </section>
              <section className="rounded-lg border border-slate-200 bg-white p-4">
                <h2 className="text-lg font-semibold text-slate-900">Create Station</h2>
                <div className="mt-3 space-y-3">
                  <Field label="Station Name"><TextInput value={stationForm.name} onChange={(event) => setStationForm({ ...stationForm, name: event.target.value })} /></Field>
                  <Field label="Type">
                    <SelectInput value={stationForm.station_type} onChange={(event) => setStationForm({ ...stationForm, station_type: event.target.value })}>
                      <option value="hot_line">Hot Line</option>
                      <option value="cold_line">Cold Line</option>
                      <option value="bar">Bar</option>
                      <option value="dessert">Dessert</option>
                      <option value="expo">Expo</option>
                      <option value="prep">Prep</option>
                      <option value="other">Other</option>
                    </SelectInput>
                  </Field>
                  <Field label="Ticket Prefix"><TextInput value={stationForm.ticket_prefix} onChange={(event) => setStationForm({ ...stationForm, ticket_prefix: event.target.value })} /></Field>
                  <ActionButton type="button" onClick={createStation} disabled={busy === 'station'} className="w-full">
                    <Plus className="h-4 w-4" />
                    Create Station
                  </ActionButton>
                </div>
              </section>
            </div>
          )}

          {activeTab === 'menu' && (
            <div className="grid gap-4 xl:grid-cols-[1fr_360px]">
              <section className="rounded-lg border border-slate-200 bg-white p-4">
                <h2 className="text-lg font-semibold text-slate-900">Modifier Groups</h2>
                <div className="mt-4 grid gap-3 lg:grid-cols-2">
                  {modifierGroups.map((group) => (
                    <article key={group.modifier_group_id} className="rounded-lg border border-slate-200 p-3">
                      <p className="text-sm font-semibold text-slate-900">{group.display_name || group.name}</p>
                      <p className="text-xs text-slate-500">Select {group.min_select} to {group.max_select}</p>
                      <div className="mt-2 flex flex-wrap gap-1">
                        {(group.options || []).map((option) => (
                          <span key={option.modifier_option_id} className="rounded-full border border-slate-200 bg-slate-50 px-2 py-1 text-xs text-slate-600">
                            {option.name}{Number(option.price_delta || 0) !== 0 ? ` - PHP ${money(option.price_delta)}` : ''}
                          </span>
                        ))}
                      </div>
                    </article>
                  ))}
                  {modifierGroups.length === 0 && <p className="text-sm text-slate-500">No modifier groups yet.</p>}
                </div>
                <div className="mt-5 border-t border-slate-100 pt-4">
                  <h3 className="text-sm font-semibold text-slate-900">Menu Item Assignments</h3>
                  <div className="mt-3 grid gap-3 lg:grid-cols-2">
                    <div className="rounded-lg border border-slate-200 p-3">
                      <p className="text-xs font-semibold uppercase text-slate-500">Kitchen routes</p>
                      <div className="mt-2 space-y-2">
                        {itemKitchenRoutes.slice(0, 8).map((route) => (
                          <div key={route.item_kitchen_route_id} className="flex items-center justify-between gap-2 text-xs">
                            <span className="font-medium text-slate-700">{route.item?.name || `Item #${route.item_id}`}</span>
                            <span className="text-slate-500">{route.station?.name || `Station #${route.kitchen_station_id}`} - {route.default_course}</span>
                          </div>
                        ))}
                        {itemKitchenRoutes.length === 0 && <p className="text-xs text-slate-500">No item kitchen routes configured.</p>}
                      </div>
                    </div>
                    <div className="rounded-lg border border-slate-200 p-3">
                      <p className="text-xs font-semibold uppercase text-slate-500">Modifier assignments</p>
                      <div className="mt-2 space-y-2">
                        {itemModifierGroups.slice(0, 8).map((assignment) => (
                          <div key={assignment.item_modifier_group_id} className="flex items-center justify-between gap-2 text-xs">
                            <span className="font-medium text-slate-700">{assignment.item?.name || `Item #${assignment.item_id}`}</span>
                            <span className="text-slate-500">{assignment.modifierGroup?.display_name || assignment.modifierGroup?.name || `Group #${assignment.modifier_group_id}`}</span>
                          </div>
                        ))}
                        {itemModifierGroups.length === 0 && <p className="text-xs text-slate-500">No item modifier groups configured.</p>}
                      </div>
                    </div>
                  </div>
                </div>
              </section>
              <section className="rounded-lg border border-slate-200 bg-white p-4">
                <h2 className="text-lg font-semibold text-slate-900">Create Modifier</h2>
                <div className="mt-3 space-y-3">
                  <Field label="Group Name"><TextInput value={modifierForm.name} onChange={(event) => setModifierForm({ ...modifierForm, name: event.target.value })} /></Field>
                  <div className="grid grid-cols-2 gap-2">
                    <Field label="Min"><TextInput type="number" min="0" value={modifierForm.min_select} onChange={(event) => setModifierForm({ ...modifierForm, min_select: event.target.value })} /></Field>
                    <Field label="Max"><TextInput type="number" min="1" value={modifierForm.max_select} onChange={(event) => setModifierForm({ ...modifierForm, max_select: event.target.value })} /></Field>
                  </div>
                  <Field label="Options">
                    <textarea
                      value={modifierForm.options_text}
                      onChange={(event) => setModifierForm({ ...modifierForm, options_text: event.target.value })}
                      rows={5}
                      className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm outline-none focus:border-teal-500 focus:ring-2 focus:ring-teal-100"
                    />
                  </Field>
                  <ActionButton type="button" onClick={createModifier} disabled={busy === 'modifier'} className="w-full">
                    <Plus className="h-4 w-4" />
                    Create Modifier
                  </ActionButton>
                </div>
                <div className="mt-5 border-t border-slate-100 pt-4">
                  <h3 className="text-sm font-semibold text-slate-900">Assign Item Workflow</h3>
                  <div className="mt-3 space-y-3">
                    <Field label="Menu Item">
                      <SelectInput value={routeForm.item_id} onChange={(event) => selectMenuItemForAssignment(event.target.value)}>
                        <option value="">Select item</option>
                        {menuItems.map((item) => (
                          <option key={item.item_id} value={item.item_id}>
                            {item.name}{item.sku_code ? ` - ${item.sku_code}` : ''}
                          </option>
                        ))}
                      </SelectInput>
                    </Field>
                    {routeForm.item_id && (
                      <p className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-xs text-slate-600">
                        Assigning {menuItemsById.get(Number(routeForm.item_id))?.name || `Item #${routeForm.item_id}`}
                      </p>
                    )}
                    <Field label="Kitchen Station">
                      <SelectInput value={routeForm.kitchen_station_id} onChange={(event) => setRouteForm({ ...routeForm, kitchen_station_id: event.target.value })}>
                        <option value="">Select station</option>
                        {stations.map((station) => (
                          <option key={station.kitchen_station_id} value={station.kitchen_station_id}>{station.name}</option>
                        ))}
                      </SelectInput>
                    </Field>
                    <Field label="Default Course">
                      <SelectInput value={routeForm.default_course} onChange={(event) => setRouteForm({ ...routeForm, default_course: event.target.value })}>
                        <option value="appetizer">Appetizer</option>
                        <option value="main">Main</option>
                        <option value="dessert">Dessert</option>
                        <option value="drink">Drink</option>
                        <option value="other">Other</option>
                      </SelectInput>
                    </Field>
                    <ActionButton type="button" onClick={saveItemKitchenRoute} disabled={busy === 'item-route' || !routeForm.item_id || !routeForm.kitchen_station_id} className="w-full">
                      Save Kitchen Route
                    </ActionButton>
                    <Field label="Modifier Groups">
                      <div className="mt-1 max-h-36 space-y-1 overflow-y-auto rounded-lg border border-slate-200 p-2">
                        {modifierGroups.map((group) => (
                          <label key={group.modifier_group_id} className="flex items-center gap-2 text-xs text-slate-700">
                            <input
                              type="checkbox"
                              checked={modifierAssignmentForm.modifier_group_ids.includes(String(group.modifier_group_id))}
                              onChange={(event) => {
                                const id = String(group.modifier_group_id);
                                setModifierAssignmentForm((prev) => ({
                                  ...prev,
                                  modifier_group_ids: event.target.checked
                                    ? [...new Set([...prev.modifier_group_ids, id])]
                                    : prev.modifier_group_ids.filter((entry) => entry !== id)
                                }));
                              }}
                            />
                            {group.display_name || group.name}
                          </label>
                        ))}
                      </div>
                    </Field>
                    <ActionButton type="button" onClick={saveItemModifierGroups} disabled={busy === 'item-modifiers' || !modifierAssignmentForm.item_id} className="w-full">
                      Save Modifier Assignment
                    </ActionButton>
                  </div>
                </div>
              </section>
            </div>
          )}

          {activeTab === 'reservations' && (
            <div className="grid gap-4 xl:grid-cols-[1fr_360px]">
              <section className="rounded-lg border border-slate-200 bg-white p-4">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <h2 className="text-lg font-semibold text-slate-900">Reservation Schedule</h2>
                  <div className="grid gap-2 sm:grid-cols-4">
                    <SelectInput value={reservationFilters.table_id} onChange={(event) => setReservationFilters((prev) => ({ ...prev, table_id: event.target.value }))}>
                      <option value="">All tables</option>
                      {allTables.map((table) => (
                        <option key={table.table_id} value={table.table_id}>{table.area_name} - {table.label || table.table_number}</option>
                      ))}
                    </SelectInput>
                    <SelectInput value={reservationFilters.status} onChange={(event) => setReservationFilters((prev) => ({ ...prev, status: event.target.value }))}>
                      <option value="">All statuses</option>
                      {['requested', 'confirmed', 'waitlisted', 'seated', 'cancelled', 'no_show'].map((status) => (
                        <option key={status} value={status}>{status.replace(/_/g, ' ')}</option>
                      ))}
                    </SelectInput>
                    <TextInput type="datetime-local" value={reservationFilters.from} onChange={(event) => setReservationFilters((prev) => ({ ...prev, from: event.target.value }))} />
                    <TextInput type="datetime-local" value={reservationFilters.to} onChange={(event) => setReservationFilters((prev) => ({ ...prev, to: event.target.value }))} />
                  </div>
                </div>
                <div className="mt-4 space-y-4">
                  {reservationGroups.map(([dateLabel, entries]) => (
                    <div key={dateLabel}>
                      <p className="text-xs font-semibold uppercase text-slate-500">{dateLabel}</p>
                      <div className="mt-2 grid gap-3 lg:grid-cols-2">
                        {entries.map((reservation) => (
                          <article key={reservation.reservation_request_id} className="rounded-lg border border-slate-200 p-3">
                            <div className="flex items-start justify-between gap-3">
                              <div>
                                <p className="text-sm font-semibold text-slate-900">{reservation.customer_name}</p>
                                <p className="text-xs text-slate-500">{reservation.public_reference} - party of {reservation.party_size}</p>
                              </div>
                              <span className={`rounded-full border px-2 py-1 text-xs font-semibold ${statusBadgeClass(reservation.status)}`}>{reservation.status}</span>
                            </div>
                            <p className="mt-2 text-xs text-slate-500">
                              {new Date(reservation.requested_at).toLocaleString()} - {reservation.duration_minutes || 90} min
                              {Number(reservation.buffer_minutes || 0) > 0 ? ` + ${reservation.buffer_minutes} min reset` : ''}
                            </p>
                            <Field label="Assigned Tables">
                              <div className="max-h-32 space-y-1 overflow-y-auto rounded-lg border border-slate-200 p-2">
                                {allTables.map((table) => {
                                  const currentIds = reservationTableSelections[reservation.reservation_request_id] || reservationAssignedTableIds(reservation);
                                  const checked = currentIds.includes(Number(table.table_id));
                                  return (
                                    <label key={table.table_id} className="flex items-center gap-2 text-xs text-slate-700">
                                      <input
                                        type="checkbox"
                                        checked={checked}
                                        onChange={(event) => setReservationTableSelections((prev) => {
                                          const next = new Set(prev[reservation.reservation_request_id] || reservationAssignedTableIds(reservation));
                                          if (event.target.checked) {
                                            next.add(Number(table.table_id));
                                          } else {
                                            next.delete(Number(table.table_id));
                                          }
                                          return { ...prev, [reservation.reservation_request_id]: Array.from(next) };
                                        })}
                                      />
                                      {table.area_name} - {table.label || table.table_number} ({table.seat_count} seats)
                                    </label>
                                  );
                                })}
                                {allTables.length === 0 && <p className="text-xs text-slate-500">No tables configured.</p>}
                              </div>
                            </Field>
                            <div className="mt-3 flex flex-wrap gap-2">
                              {['confirmed', 'waitlisted', 'seated', 'cancelled', 'no_show'].map((status) => (
                                <ActionButton key={status} type="button" onClick={() => updateReservation(reservation, status)} disabled={Boolean(busy)}>
                                  {status.replace(/_/g, ' ')}
                                </ActionButton>
                              ))}
                            </div>
                          </article>
                        ))}
                      </div>
                    </div>
                  ))}
                  {reservations.length === 0 && <p className="text-sm text-slate-500">No reservation requests.</p>}
                </div>
              </section>
              <section className="rounded-lg border border-slate-200 bg-white p-4">
                <h2 className="text-lg font-semibold text-slate-900">Create Request</h2>
                <div className="mt-3 space-y-3">
                  <Field label="Customer"><TextInput value={reservationForm.customer_name} onChange={(event) => setReservationForm({ ...reservationForm, customer_name: event.target.value })} /></Field>
                  <Field label="Phone"><TextInput value={reservationForm.customer_phone} onChange={(event) => setReservationForm({ ...reservationForm, customer_phone: event.target.value })} /></Field>
                  <div className="grid grid-cols-2 gap-2">
                    <Field label="Party Size"><TextInput type="number" min="1" value={reservationForm.party_size} onChange={(event) => setReservationForm({ ...reservationForm, party_size: event.target.value })} /></Field>
                    <Field label="When"><TextInput type="datetime-local" value={reservationForm.requested_at} onChange={(event) => setReservationForm({ ...reservationForm, requested_at: event.target.value })} /></Field>
                  </div>
                  <div className="grid grid-cols-2 gap-2">
                    <Field label="Duration Minutes"><TextInput type="number" min="15" max="480" value={reservationForm.duration_minutes} onChange={(event) => setReservationForm({ ...reservationForm, duration_minutes: event.target.value })} /></Field>
                    <Field label="Reset Buffer"><TextInput type="number" min="0" max="120" value={reservationForm.buffer_minutes} onChange={(event) => setReservationForm({ ...reservationForm, buffer_minutes: event.target.value })} /></Field>
                  </div>
                  <Field label="Tables">
                    <div className="max-h-36 space-y-1 overflow-y-auto rounded-lg border border-slate-200 p-2">
                      {allTables.map((table) => (
                        <label key={table.table_id} className="flex items-center gap-2 text-xs text-slate-700">
                          <input
                            type="checkbox"
                            checked={reservationForm.table_ids.includes(String(table.table_id))}
                            onChange={(event) => {
                              const id = String(table.table_id);
                              setReservationForm((prev) => ({
                                ...prev,
                                table_ids: event.target.checked
                                  ? [...new Set([...prev.table_ids, id])]
                                  : prev.table_ids.filter((entry) => entry !== id)
                              }));
                            }}
                          />
                          {table.area_name} - {table.label || table.table_number} ({table.seat_count} seats)
                        </label>
                      ))}
                      {allTables.length === 0 && <p className="text-xs text-slate-500">No tables configured.</p>}
                    </div>
                  </Field>
                  <Field label="Notes"><TextInput value={reservationForm.notes} onChange={(event) => setReservationForm({ ...reservationForm, notes: event.target.value })} /></Field>
                  <ActionButton type="button" onClick={createReservation} disabled={busy === 'reservation'} className="w-full">
                    <Plus className="h-4 w-4" />
                    Create Request
                  </ActionButton>
                </div>
              </section>
            </div>
          )}

          {activeTab === 'settings' && (
            <section className="max-w-xl rounded-lg border border-slate-200 bg-white p-4">
              <h2 className="text-lg font-semibold text-slate-900">Restaurant Service Charge</h2>
              <div className="mt-4 space-y-3">
                <label className="flex items-center gap-2 text-sm font-medium text-slate-700">
                  <input type="checkbox" checked={serviceCharge.enabled === true} onChange={(event) => setServiceCharge({ ...serviceCharge, enabled: event.target.checked })} />
                  Enable restaurant service charge
                </label>
                <Field label="Label"><TextInput value={serviceCharge.label || ''} onChange={(event) => setServiceCharge({ ...serviceCharge, label: event.target.value })} /></Field>
                <Field label="Rate (%)"><TextInput type="number" min="0" max="100" step="0.0001" value={serviceCharge.rate ?? 0} onChange={(event) => setServiceCharge({ ...serviceCharge, rate: event.target.value })} /></Field>
                <label className="flex items-center gap-2 text-sm font-medium text-slate-700">
                  <input type="checkbox" checked={serviceCharge.taxable === true} onChange={(event) => setServiceCharge({ ...serviceCharge, taxable: event.target.checked })} />
                  Mark snapshot as taxable for reporting review
                </label>
                <ActionButton type="button" onClick={saveServiceCharge} disabled={busy === 'service-charge'}>
                  Save Settings
                </ActionButton>
              </div>
            </section>
          )}
        </>
      )}
    </div>
  );
}
