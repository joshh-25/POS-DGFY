import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { AlertTriangle, Bell, CalendarCheck, Clock, ListChecks, RefreshCw, Search, UserRound, UsersRound } from 'lucide-react';
import { posToast as toast } from '@/src/utils/iminRuntimeFeedback.js';
import { getAllUsers } from '@/services/userService.js';
import {
  createServiceAssignment,
  createServiceResource,
  createServiceWaitlistEntry,
  listServiceAssignments,
  listServiceBookings,
  listServiceClients,
  listServiceReminders,
  listServiceResources,
  listServiceWaitlist,
  listServicesCatalog,
  queueDueServiceReminders,
  sendDueServiceReminders,
  settleServiceBooking,
  updateServiceAssignment,
  updateServiceBookingStatus,
  updateServiceWaitlistStatus
} from '../../services/api/servicesApi.js';
import {
  ServiceBookingTable,
  ServiceClientsPanel,
  ServiceRemindersPanel,
  ServiceTeamResourcesPanel,
  ServiceWaitlistPanel
} from '../../services/components/ServiceOperationsPanels.jsx';

const ACTIVE_STATUSES = ['requested', 'confirmed', 'checked_in', 'in_service'];
const CALENDAR_STATUS_OPTIONS = ['all', ...ACTIVE_STATUSES];
const emptyResource = { name: '', resource_type: 'provider', capacity: 1, location_id: '' };
const emptyAssignment = { item_id: '', resource_id: '', user_id: '', location_id: '' };
const emptyWaitlist = { service_item_id: '', customer_name: '', customer_email: '', customer_phone: '', preferred_start_at: '', preferred_end_at: '', notes: '' };

const isToday = (value) => {
  const date = new Date(value);
  const today = new Date();
  return Number.isFinite(date.getTime())
    && date.getFullYear() === today.getFullYear()
    && date.getMonth() === today.getMonth()
    && date.getDate() === today.getDate();
};

const dateBucket = (value) => {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? 'Unscheduled' : date.toLocaleDateString([], { weekday: 'short', month: 'short', day: 'numeric' });
};

const bookingStartTime = (booking) => {
  const value = new Date(booking?.start_at).getTime();
  return Number.isFinite(value) ? value : Number.MAX_SAFE_INTEGER;
};

const sortBookingsByStart = (rows) => [...rows].sort((left, right) => (
  bookingStartTime(left) - bookingStartTime(right)
  || Number(left?.booking_id || 0) - Number(right?.booking_id || 0)
));

const toIsoOrNull = (value) => {
  if (!value) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
};

export default function PosServicesOperationsWorkspace({ permissions = {}, isOnline = true, settlementContext = {} }) {
  const tabs = useMemo(() => [
    ...(permissions.viewBookings ? [{ id: 'today', label: 'Today', icon: CalendarCheck }, { id: 'calendar', label: 'Calendar', icon: Clock }] : []),
    ...(permissions.viewResources ? [{ id: 'team', label: 'Team & Resources', icon: UserRound }] : []),
    ...(permissions.viewWaitlist ? [{ id: 'waitlist', label: 'Waitlist', icon: ListChecks }] : []),
    ...(permissions.viewReminders ? [{ id: 'reminders', label: 'Reminders', icon: Bell }] : []),
    ...(permissions.viewClients ? [{ id: 'clients', label: 'Clients', icon: UsersRound }] : [])
  ], [permissions]);
  const [activeTab, setActiveTab] = useState(() => tabs[0]?.id || '');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState('');
  const [bookings, setBookings] = useState([]);
  const [catalog, setCatalog] = useState([]);
  const [resources, setResources] = useState([]);
  const [assignments, setAssignments] = useState([]);
  const [users, setUsers] = useState([]);
  const [waitlist, setWaitlist] = useState([]);
  const [reminders, setReminders] = useState([]);
  const [clients, setClients] = useState([]);
  const [resourceForm, setResourceForm] = useState(emptyResource);
  const [assignmentForm, setAssignmentForm] = useState(emptyAssignment);
  const [waitlistForm, setWaitlistForm] = useState(emptyWaitlist);
  const [updatingBookingId, setUpdatingBookingId] = useState(null);
  const [updatingWaitlistId, setUpdatingWaitlistId] = useState(null);
  const [loadError, setLoadError] = useState('');
  const [calendarSearch, setCalendarSearch] = useState('');
  const [calendarStatus, setCalendarStatus] = useState('all');
  const [reminderOutcome, setReminderOutcome] = useState(null);
  const [settlementBooking, setSettlementBooking] = useState(null);
  const [settlementForm, setSettlementForm] = useState({ payment_type: 'cash', cash_received: '' });
  const [settlingBookingId, setSettlingBookingId] = useState(null);
  const [settlementResult, setSettlementResult] = useState(null);

  useEffect(() => {
    if (!tabs.some((tab) => tab.id === activeTab)) setActiveTab(tabs[0]?.id || '');
  }, [activeTab, tabs]);

  const loadWorkspace = useCallback(async () => {
    if (!isOnline || tabs.length === 0) {
      setLoading(false);
      return;
    }
    setLoading(true);
    setLoadError('');
    try {
      const [bookingData, catalogData, resourceData, assignmentData, waitlistData, reminderData, clientData, userData] = await Promise.all([
        permissions.viewBookings ? listServiceBookings({ limit: 120 }) : null,
        (permissions.viewResources || permissions.viewWaitlist) ? listServicesCatalog({ limit: 300 }) : null,
        permissions.viewResources ? listServiceResources() : null,
        permissions.viewResources ? listServiceAssignments() : null,
        permissions.viewWaitlist ? listServiceWaitlist({ limit: 80 }) : null,
        permissions.viewReminders ? listServiceReminders({ limit: 80 }) : null,
        permissions.viewClients ? listServiceClients({ limit: 160 }) : null,
        permissions.viewResources ? getAllUsers().catch(() => []) : null
      ]);
      setBookings(Array.isArray(bookingData?.bookings) ? bookingData.bookings : []);
      setCatalog(Array.isArray(catalogData?.services) ? catalogData.services : []);
      setResources(Array.isArray(resourceData?.resources) ? resourceData.resources : []);
      setAssignments(Array.isArray(assignmentData?.assignments) ? assignmentData.assignments : []);
      setWaitlist(Array.isArray(waitlistData?.waitlist) ? waitlistData.waitlist : []);
      setReminders(Array.isArray(reminderData?.reminders) ? reminderData.reminders : []);
      setClients(Array.isArray(clientData?.clients) ? clientData.clients : []);
      setUsers(Array.isArray(userData) ? userData : Array.isArray(userData?.users) ? userData.users : []);
    } catch (error) {
      const message = error?.response?.data?.message || 'Unable to load Services operations.';
      setLoadError(message);
      toast.error(message);
    } finally {
      setLoading(false);
    }
  }, [isOnline, permissions, tabs.length]);

  useEffect(() => { loadWorkspace(); }, [loadWorkspace]);

  const activeBookings = useMemo(() => sortBookingsByStart(
    bookings.filter((booking) => ACTIVE_STATUSES.includes(booking.status))
  ), [bookings]);
  const todayBookings = useMemo(() => activeBookings.filter((booking) => isToday(booking.start_at)), [activeBookings]);
  const todayCounts = useMemo(() => ACTIVE_STATUSES.reduce((counts, status) => ({
    ...counts,
    [status]: todayBookings.filter((booking) => booking.status === status).length
  }), {}), [todayBookings]);
  const filteredCalendarBookings = useMemo(() => {
    const query = calendarSearch.trim().toLowerCase();
    return activeBookings.filter((booking) => {
      if (calendarStatus !== 'all' && booking.status !== calendarStatus) return false;
      if (!query) return true;
      return [
        booking.public_reference,
        booking.service_name,
        booking.service?.name,
        booking.customer_name,
        booking.customer_email,
        booking.customer_phone
      ].some((value) => String(value || '').toLowerCase().includes(query));
    });
  }, [activeBookings, calendarSearch, calendarStatus]);
  const calendarGroups = useMemo(() => {
    const groups = new Map();
    filteredCalendarBookings.forEach((booking) => {
      const key = dateBucket(booking.start_at);
      groups.set(key, [...(groups.get(key) || []), booking]);
    });
    return [...groups.entries()];
  }, [filteredCalendarBookings]);
  const serviceOptions = useMemo(() => catalog.map((service) => ({ value: String(service.item_id), label: service.name })), [catalog]);

  const updateBooking = async (bookingId, status) => {
    if (!permissions.manageBookings) return;
    setUpdatingBookingId(bookingId);
    try { await updateServiceBookingStatus(bookingId, { status }); await loadWorkspace(); toast.success('Booking updated.'); }
    catch (error) { toast.error(error?.response?.data?.message || 'Unable to update booking.'); }
    finally { setUpdatingBookingId(null); }
  };

  const createResource = async (event) => {
    event.preventDefault();
    if (!permissions.manageResources || saving) return;
    setSaving('resource');
    try {
      await createServiceResource({
        ...resourceForm,
        capacity: Number(resourceForm.capacity || 1),
        location_id: resourceForm.location_id ? Number(resourceForm.location_id) : null
      });
      setResourceForm(emptyResource);
      await loadWorkspace();
      toast.success('Resource created.');
    }
    catch (error) { toast.error(error?.response?.data?.message || 'Unable to create resource.'); }
    finally { setSaving(''); }
  };

  const createAssignment = async (event) => {
    event.preventDefault();
    if (!permissions.manageResources || saving) return;
    const hasAssignmentAnchor = assignmentForm.resource_id || assignmentForm.user_id || assignmentForm.location_id;
    if (!hasAssignmentAnchor) {
      toast.error('Select a resource, provider, or location before creating the assignment.');
      return;
    }
    setSaving('assignment');
    try {
      await createServiceAssignment({ item_id: Number(assignmentForm.item_id), resource_id: assignmentForm.resource_id ? Number(assignmentForm.resource_id) : null, user_id: assignmentForm.user_id ? Number(assignmentForm.user_id) : null, location_id: assignmentForm.location_id ? Number(assignmentForm.location_id) : null });
      setAssignmentForm(emptyAssignment); await loadWorkspace(); toast.success('Assignment created.');
    } catch (error) { toast.error(error?.response?.data?.message || 'Unable to create assignment.'); }
    finally { setSaving(''); }
  };

  const deactivateAssignment = async (assignmentId) => {
    if (!permissions.manageResources || saving) return;
    setSaving(`assignment-${assignmentId}`);
    try { await updateServiceAssignment(assignmentId, { is_active: false }); await loadWorkspace(); toast.success('Assignment removed.'); }
    catch (error) { toast.error(error?.response?.data?.message || 'Unable to remove assignment.'); }
    finally { setSaving(''); }
  };

  const createWaitlist = async (event) => {
    event.preventDefault();
    if (!permissions.manageWaitlist || saving) return;
    if (!waitlistForm.customer_email && !waitlistForm.customer_phone) {
      toast.error('Enter a client email or phone number before adding the waitlist entry.');
      return;
    }
    const preferredStart = toIsoOrNull(waitlistForm.preferred_start_at);
    const preferredEnd = toIsoOrNull(waitlistForm.preferred_end_at);
    if (preferredStart && preferredEnd && new Date(preferredEnd).getTime() <= new Date(preferredStart).getTime()) {
      toast.error('Preferred Until must be later than Preferred From.');
      return;
    }
    setSaving('waitlist');
    try {
      await createServiceWaitlistEntry({ service_item_id: Number(waitlistForm.service_item_id), customer_name: waitlistForm.customer_name, customer_email: waitlistForm.customer_email || null, customer_phone: waitlistForm.customer_phone || null, preferred_start_at: preferredStart, preferred_end_at: preferredEnd, notes: waitlistForm.notes || null });
      setWaitlistForm(emptyWaitlist); await loadWorkspace(); toast.success('Waitlist entry added.');
    } catch (error) { toast.error(error?.response?.data?.message || 'Unable to add waitlist entry.'); }
    finally { setSaving(''); }
  };

  const updateWaitlist = async (entryId, status) => {
    if (!permissions.manageWaitlist || updatingWaitlistId !== null) return;
    setUpdatingWaitlistId(entryId);
    try { await updateServiceWaitlistStatus(entryId, { status }); await loadWorkspace(); toast.success('Waitlist updated.'); }
    catch (error) { toast.error(error?.response?.data?.message || 'Unable to update waitlist.'); }
    finally { setUpdatingWaitlistId(null); }
  };

  const processReminders = async (action, lookaheadHours = 24) => {
    if (!permissions.manageReminders || saving) return;
    setSaving(action);
    setReminderOutcome(null);
    try {
      const result = action === 'queue-reminders'
        ? await queueDueServiceReminders({ lookahead_hours: Number(lookaheadHours) })
        : await sendDueServiceReminders();
      setReminderOutcome({ action, ...result });
      await loadWorkspace();
      toast.success(action === 'queue-reminders' ? 'Due reminders queued.' : 'Due reminders processed.');
    }
    catch (error) { toast.error(error?.response?.data?.message || 'Unable to process reminders.'); }
    finally { setSaving(''); }
  };

  const settlementReady = Boolean(
    permissions.manageBookings
    && settlementContext.shiftId
    && settlementContext.terminalId
    && settlementContext.locationId
  );

  const submitSettlement = async (event) => {
    event.preventDefault();
    if (!settlementBooking || !settlementReady || settlingBookingId !== null) return;
    const paymentType = settlementForm.payment_type;
    const cashReceived = paymentType === 'cash' ? Number(settlementForm.cash_received) : null;
    if (paymentType === 'cash' && (!Number.isFinite(cashReceived) || cashReceived < Number(settlementBooking.total_amount || 0))) {
      toast.error('Cash received must cover the booking total.');
      return;
    }
    setSettlingBookingId(settlementBooking.booking_id);
    try {
      const result = await settleServiceBooking(settlementBooking.booking_id, {
        payment_type: paymentType,
        ...(paymentType === 'cash' ? { cash_received: cashReceived } : {}),
        shift_id: Number(settlementContext.shiftId),
        terminal_id: String(settlementContext.terminalId),
        location_id: Number(settlementContext.locationId)
      });
      setSettlementResult(result);
      setSettlementBooking(null);
      setSettlementForm({ payment_type: 'cash', cash_received: '' });
      await loadWorkspace();
      toast.success(result?.idempotency?.idempotent_replay ? 'Existing settlement loaded.' : 'Booking payment collected.');
    } catch (error) {
      toast.error(error?.response?.data?.message || 'Unable to settle booking.');
    } finally {
      setSettlingBookingId(null);
    }
  };

  if (!isOnline) return <div className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900"><p className="font-bold">Service operations are available online only.</p><p className="mt-1">Reconnect to manage bookings, resources, waitlist, reminders, and clients.</p></div>;
  if (tabs.length === 0) return <p className="rounded-lg border border-amber-200 bg-amber-50 p-4 text-sm text-amber-800">You do not have permission to view Services operations.</p>;

  return <div className="space-y-4" data-testid="pos-services-operations-workspace">
    <div className="flex flex-wrap items-center justify-between gap-3">
      <div role="tablist" aria-label="Service operations navigation" className="flex min-w-0 flex-1 gap-2 overflow-x-auto rounded-xl border border-slate-200 bg-white p-2">{tabs.map((tab) => { const Icon = tab.icon; return <button key={tab.id} role="tab" aria-selected={activeTab === tab.id} type="button" onClick={() => setActiveTab(tab.id)} className={`inline-flex shrink-0 items-center gap-2 rounded-lg px-3 py-2 text-sm font-bold ${activeTab === tab.id ? 'bg-teal-700 text-white' : 'bg-slate-50 text-slate-700'}`}><Icon className="h-4 w-4" />{tab.label}</button>; })}</div>
      <button type="button" onClick={loadWorkspace} disabled={loading} className="inline-flex items-center gap-2 rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm font-bold text-slate-700 hover:bg-slate-50 disabled:opacity-60"><RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />{loading ? 'Refreshing...' : 'Refresh'}</button>
    </div>
    {loadError && <div role="alert" className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-rose-200 bg-rose-50 p-4 text-sm text-rose-900"><span className="inline-flex items-center gap-2 font-semibold"><AlertTriangle className="h-4 w-4" />{loadError}</span><button type="button" onClick={loadWorkspace} className="rounded-md border border-rose-300 bg-white px-3 py-1.5 font-bold">Retry</button></div>}
    {permissions.manageBookings && !settlementReady && <p className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm font-semibold text-amber-900">Open your cashier shift on the selected terminal and location before collecting a service payment. Scheduling operations remain available.</p>}
    {settlementResult?.pos_transaction && <div role="status" className="rounded-lg border border-teal-200 bg-teal-50 p-3 text-sm text-teal-950"><p className="font-bold">Payment recorded: {settlementResult.pos_transaction.invoice_number}</p><p className="mt-1">Transaction #{settlementResult.pos_transaction.pos_transaction_id} · {settlementResult.pos_transaction.document_type?.replace(/_/g, ' ')} · {settlementResult.pos_transaction.payment_type} · PHP {Number(settlementResult.pos_transaction.total_amount || 0).toFixed(2)}</p><p className="mt-1 text-xs">The payment receipt is available through POS Transaction History. The booking ticket remains a separate document.</p></div>}
    {settlementBooking && <form onSubmit={submitSettlement} role="dialog" aria-modal="true" aria-labelledby="service-settlement-heading" className="rounded-xl border-2 border-teal-600 bg-white p-4 shadow-lg"><div className="flex flex-wrap items-start justify-between gap-3"><div><h2 id="service-settlement-heading" className="text-lg font-bold text-slate-950">Collect payment for {settlementBooking.public_reference}</h2><p className="text-sm text-slate-600">Authoritative total: PHP {Number(settlementBooking.total_amount || 0).toFixed(2)}</p></div><button type="button" disabled={settlingBookingId !== null} onClick={() => setSettlementBooking(null)} className="rounded-md border border-slate-300 px-3 py-2 text-sm font-bold">Cancel</button></div><div className="mt-4 grid gap-3 sm:grid-cols-2"><label className="text-xs font-semibold text-slate-600">Payment method<select aria-label="Service payment method" value={settlementForm.payment_type} onChange={(event) => setSettlementForm({ payment_type: event.target.value, cash_received: '' })} className="mt-1 w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm"><option value="cash">Cash</option><option value="gcash">GCash</option><option value="maya">Maya</option><option value="card">Card</option><option value="bank_transfer">Bank transfer</option><option value="qrph">QR Ph</option></select></label>{settlementForm.payment_type === 'cash' && <label className="text-xs font-semibold text-slate-600">Cash received<input aria-label="Cash received" type="number" min={Number(settlementBooking.total_amount || 0)} step="0.01" required value={settlementForm.cash_received} onChange={(event) => setSettlementForm((previous) => ({ ...previous, cash_received: event.target.value }))} className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm" /></label>}</div><button type="submit" disabled={settlingBookingId !== null} className="mt-4 rounded-md bg-teal-700 px-4 py-2 text-sm font-bold text-white disabled:opacity-60">{settlingBookingId !== null ? 'Recording payment...' : 'Confirm Payment'}</button></form>}
    {activeTab === 'today' && <section className="space-y-4" aria-labelledby="pos-services-today-heading">
      <div><h2 id="pos-services-today-heading" className="text-lg font-bold text-slate-950">Today</h2><p className="text-sm text-slate-500">Confirm, check in, start, complete, cancel, or mark today&apos;s appointments as no-show.</p></div>
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">{ACTIVE_STATUSES.map((status) => <div key={status} className="rounded-xl border border-slate-200 bg-white p-3"><p className="text-xs font-bold uppercase text-slate-500">{status.replace(/_/g, ' ')}</p><p className="mt-1 text-2xl font-black text-slate-950">{todayCounts[status] || 0}</p></div>)}</div>
      <ServiceBookingTable bookings={todayBookings} updatingBookingId={updatingBookingId} onStatusChange={updateBooking} emptyText={loading ? 'Loading appointments...' : 'No appointments scheduled today.'} canManage={permissions.manageBookings} canSettle={settlementReady} settlingBookingId={settlingBookingId} onSettle={(booking) => { setSettlementResult(null); setSettlementBooking(booking); }} />
    </section>}
    {activeTab === 'calendar' && <section className="space-y-4" aria-labelledby="pos-services-calendar-heading">
      <div><h2 id="pos-services-calendar-heading" className="text-lg font-bold text-slate-950">Calendar</h2><p className="text-sm text-slate-500">Review active appointments in chronological order and narrow the schedule by status or client.</p></div>
      <div className="grid gap-3 rounded-xl border border-slate-200 bg-white p-3 sm:grid-cols-[minmax(0,1fr)_220px]">
        <label className="relative block"><span className="sr-only">Search calendar bookings</span><Search className="pointer-events-none absolute left-3 top-2.5 h-4 w-4 text-slate-400" /><input aria-label="Search calendar bookings" value={calendarSearch} onChange={(event) => setCalendarSearch(event.target.value)} placeholder="Search ticket, service, or client" className="w-full rounded-md border border-slate-300 py-2 pl-9 pr-3 text-sm" /></label>
        <label><span className="sr-only">Filter calendar by status</span><select aria-label="Filter calendar by status" value={calendarStatus} onChange={(event) => setCalendarStatus(event.target.value)} className="w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm">{CALENDAR_STATUS_OPTIONS.map((status) => <option key={status} value={status}>{status === 'all' ? 'All active statuses' : status.replace(/_/g, ' ')}</option>)}</select></label>
      </div>
      {calendarGroups.map(([day, rows]) => <section key={day} className="space-y-2"><h3 className="text-sm font-bold uppercase text-slate-500">{day}</h3><ServiceBookingTable bookings={rows} updatingBookingId={updatingBookingId} onStatusChange={updateBooking} emptyText="No appointments." canManage={permissions.manageBookings} canSettle={settlementReady} settlingBookingId={settlingBookingId} onSettle={(booking) => { setSettlementResult(null); setSettlementBooking(booking); }} /></section>)}
      {!loading && calendarGroups.length === 0 && <p className="rounded-lg border border-slate-200 bg-white p-6 text-sm text-slate-500">{calendarSearch || calendarStatus !== 'all' ? 'No appointments match the current calendar filters.' : 'No active appointments yet.'}</p>}
    </section>}
    {activeTab === 'team' && <ServiceTeamResourcesPanel resourceForm={resourceForm} setResourceForm={setResourceForm} assignmentForm={assignmentForm} setAssignmentForm={setAssignmentForm} serviceOptions={serviceOptions} resources={resources} users={users} assignments={assignments} saving={saving} loading={loading} onResourceSubmit={createResource} onAssignmentSubmit={createAssignment} onDeactivateAssignment={deactivateAssignment} canManage={permissions.manageResources} />}
    {activeTab === 'waitlist' && <ServiceWaitlistPanel waitlistForm={waitlistForm} setWaitlistForm={setWaitlistForm} serviceOptions={serviceOptions} waitlist={waitlist} saving={saving} loading={loading} updatingWaitlistId={updatingWaitlistId} onSubmit={createWaitlist} onStatusChange={updateWaitlist} canManage={permissions.manageWaitlist} />}
    {activeTab === 'reminders' && <ServiceRemindersPanel reminders={reminders} loading={loading} saving={saving} outcome={reminderOutcome} onQueue={(lookaheadHours) => processReminders('queue-reminders', lookaheadHours)} onSend={() => processReminders('send-reminders')} canManage={permissions.manageReminders} />}
    {activeTab === 'clients' && <ServiceClientsPanel clients={clients} loading={loading} />}
  </div>;
}
