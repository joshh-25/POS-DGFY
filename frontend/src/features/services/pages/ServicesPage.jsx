import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  AlertTriangle,
  Bell,
  CalendarCheck,
  CheckCircle2,
  ClipboardList,
  Clock,
  History,
  ListChecks,
  MailCheck,
  RefreshCw,
  Send,
  SlidersHorizontal,
  UserRound,
  UsersRound
} from 'lucide-react';
import { toast } from 'sonner';
import {
  createServiceAssignment,
  createServiceCatalogEntry,
  createServiceResource,
  createServiceWaitlistEntry,
  getServicesDashboard,
  listServiceAssignments,
  listServiceBookings,
  listServiceClients,
  listServiceReminders,
  listServiceResources,
  listServiceWaitlist,
  listServicesCatalog,
  queueDueServiceReminders,
  sendDueServiceReminders,
  updateServiceAssignment,
  updateServiceBookingStatus,
  updateServiceCatalogEntry,
  updateServiceWaitlistStatus
} from '../api/servicesApi.js';
import ServiceOptionGroupManager from '../components/ServiceOptionGroupManager.jsx';
import ServiceCatalogForm from '../components/ServiceCatalogForm.jsx';
import {
  ServiceBookingTable
} from '../components/ServiceOperationsPanels.jsx';
import {
  buildServiceCatalogPayload,
  createServiceCatalogFormValues
} from '../catalog/serviceCatalogFormModel.js';
import { getAllUsers } from '../../../services/userService.js';

const STATUS_FLOW = ['requested', 'confirmed', 'checked_in', 'in_service', 'completed', 'cancelled', 'no_show'];
const ACTIVE_STATUSES = 'requested,confirmed,checked_in,in_service';

const tabs = [
  { id: 'today', label: 'Today', icon: CalendarCheck },
  { id: 'calendar', label: 'Calendar', icon: Clock },
  { id: 'services', label: 'Services', icon: ClipboardList },
  { id: 'options', label: 'Variations & Add-ons', icon: SlidersHorizontal },
  { id: 'team', label: 'Team & Resources', icon: UserRound },
  { id: 'waitlist', label: 'Waitlist', icon: ListChecks },
  { id: 'reminders', label: 'Reminders', icon: Bell },
  { id: 'clients', label: 'Clients', icon: UsersRound }
];

const money = (value) => `PHP ${Number(value || 0).toFixed(2)}`;
const formatDate = (value) => {
  if (!value) return 'Any time';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return 'Any time';
  return date.toLocaleDateString([], { month: 'short', day: 'numeric', year: 'numeric' });
};
const formatDateTime = (value) => {
  if (!value) return 'Unscheduled';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return 'Unscheduled';
  return date.toLocaleString([], { month: 'short', day: 'numeric', year: 'numeric', hour: '2-digit', minute: '2-digit' });
};
const dateBucket = (value) => {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return 'Unscheduled';
  return date.toLocaleDateString([], { weekday: 'short', month: 'short', day: 'numeric' });
};
const isToday = (value) => {
  const date = new Date(value);
  const now = new Date();
  return Number.isFinite(date.getTime())
    && date.getFullYear() === now.getFullYear()
    && date.getMonth() === now.getMonth()
    && date.getDate() === now.getDate();
};
const toIsoOrNull = (value) => {
  if (!value) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
};

const blankResourceForm = { name: '', resource_type: 'provider', capacity: 1 };
const blankAssignmentForm = { item_id: '', resource_id: '', user_id: '', location_id: '' };
const blankWaitlistForm = {
  service_item_id: '',
  customer_name: '',
  customer_email: '',
  customer_phone: '',
  preferred_start_at: '',
  preferred_end_at: '',
  notes: ''
};

const Field = ({ label, children }) => (
  <label className="block text-xs font-semibold text-slate-600">
    {label}
    <div className="mt-1">{children}</div>
  </label>
);

const inputClass = 'w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 outline-none focus:border-teal-600 focus:ring-2 focus:ring-teal-100';
const buttonClass = 'inline-flex items-center justify-center gap-2 rounded-md border border-slate-300 bg-white px-3 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-60';
const primaryButtonClass = 'inline-flex items-center justify-center gap-2 rounded-md bg-teal-700 px-3 py-2 text-sm font-semibold text-white hover:bg-teal-800 disabled:opacity-60';


const StatTile = ({ icon: Icon, label, value, hint }) => (
  <div className="rounded-lg border border-slate-200 bg-white p-4">
    <div className="flex items-center justify-between gap-3">
      <div>
        <p className="text-xs font-semibold uppercase tracking-normal text-slate-500">{label}</p>
        <p className="mt-1 text-2xl font-bold text-slate-950">{value}</p>
      </div>
      <div className="flex h-10 w-10 items-center justify-center rounded-md bg-teal-50 text-teal-700">
        <Icon className="h-5 w-5" />
      </div>
    </div>
    {hint && <p className="mt-2 text-xs text-slate-500">{hint}</p>}
  </div>
);

const PriorityTile = ({ icon: Icon, label, value, tone = 'slate' }) => {
  const toneClasses = {
    slate: 'border-slate-200 bg-slate-50 text-slate-700',
    amber: 'border-amber-200 bg-amber-50 text-amber-800',
    teal: 'border-teal-200 bg-teal-50 text-teal-800',
    rose: 'border-rose-200 bg-rose-50 text-rose-800'
  };
  return (
    <div className={`flex items-center gap-3 rounded-lg border px-3 py-2 ${toneClasses[tone] || toneClasses.slate}`}>
      <Icon className="h-4 w-4 shrink-0" />
      <div>
        <p className="text-xs font-semibold uppercase tracking-normal">{label}</p>
        <p className="text-lg font-bold">{value}</p>
      </div>
    </div>
  );
};

export default function ServicesPage() {
  const [activeTab, setActiveTab] = useState('today');
  const [dashboard, setDashboard] = useState(null);
  const [catalog, setCatalog] = useState([]);
  const [resources, setResources] = useState([]);
  const [users, setUsers] = useState([]);
  const [assignments, setAssignments] = useState([]);
  const [bookings, setBookings] = useState([]);
  const [waitlist, setWaitlist] = useState([]);
  const [reminders, setReminders] = useState([]);
  const [clients, setClients] = useState([]);
  const [loading, setLoading] = useState(true);
  const [catalogForm, setCatalogForm] = useState(createServiceCatalogFormValues);
  const [resourceForm, setResourceForm] = useState(blankResourceForm);
  const [assignmentForm, setAssignmentForm] = useState(blankAssignmentForm);
  const [waitlistForm, setWaitlistForm] = useState(blankWaitlistForm);
  const [saving, setSaving] = useState('');
  const [updatingBookingId, setUpdatingBookingId] = useState(null);
  const [updatingWaitlistId, setUpdatingWaitlistId] = useState(null);

  const loadServicesWorkspace = useCallback(async () => {
    setLoading(true);
    try {
      const [dashboardData, catalogData, resourceData, assignmentData, bookingData, waitlistData, reminderData, clientData, userData] = await Promise.all([
        getServicesDashboard(),
        listServicesCatalog({ limit: 300 }),
        listServiceResources(),
        listServiceAssignments(),
        listServiceBookings({ limit: 120 }),
        listServiceWaitlist({ limit: 80 }),
        listServiceReminders({ limit: 80 }),
        listServiceClients({ limit: 160 }),
        getAllUsers().catch(() => [])
      ]);
      setDashboard(dashboardData || null);
      setCatalog(Array.isArray(catalogData?.services) ? catalogData.services : []);
      setResources(Array.isArray(resourceData?.resources) ? resourceData.resources : []);
      setAssignments(Array.isArray(assignmentData?.assignments) ? assignmentData.assignments : []);
      setBookings(Array.isArray(bookingData?.bookings) ? bookingData.bookings : []);
      setWaitlist(Array.isArray(waitlistData?.waitlist) ? waitlistData.waitlist : []);
      setReminders(Array.isArray(reminderData?.reminders) ? reminderData.reminders : []);
      setClients(Array.isArray(clientData?.clients) ? clientData.clients : []);
      setUsers(Array.isArray(userData) ? userData : Array.isArray(userData?.users) ? userData.users : []);
    } catch (error) {
      toast.error(error?.response?.data?.message || 'Unable to load Services workspace.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadServicesWorkspace();
  }, [loadServicesWorkspace]);

  const bookingCounts = useMemo(() => {
    const counts = dashboard?.booking_status_counts || dashboard?.booking_counts || {};
    return STATUS_FLOW.reduce((acc, status) => ({ ...acc, [status]: Number(counts[status] || 0) }), {});
  }, [dashboard]);

  const serviceDeskMetrics = useMemo(() => ({
    today: Number(dashboard?.today_bookings || 0),
    checkedIn: Number(dashboard?.checked_in_count || 0),
    inService: Number(dashboard?.in_service_count || 0),
    remindersDue: Number(dashboard?.reminders_due || 0),
    overdue: Number(dashboard?.overdue_no_show_candidates || 0),
    waiting: Number(dashboard?.waiting_waitlist_count || dashboard?.waitlist_counts?.waiting || 0)
  }), [dashboard]);

  const todayBookings = useMemo(() => (
    bookings.filter((booking) => ACTIVE_STATUSES.split(',').includes(booking.status) && isToday(booking.start_at))
  ), [bookings]);

  const activeBookings = useMemo(() => (
    bookings.filter((booking) => ACTIVE_STATUSES.split(',').includes(booking.status))
  ), [bookings]);

  const calendarGroups = useMemo(() => {
    const groups = new Map();
    activeBookings.forEach((booking) => {
      const key = dateBucket(booking.start_at);
      groups.set(key, [...(groups.get(key) || []), booking]);
    });
    return [...groups.entries()];
  }, [activeBookings]);

  const serviceOptions = catalog.map((service) => ({ value: String(service.item_id), label: service.name }));

  const handleCatalogSubmit = async (event) => {
    event.preventDefault();
    setSaving('catalog');
    try {
      await createServiceCatalogEntry(buildServiceCatalogPayload(catalogForm));
      setCatalogForm(createServiceCatalogFormValues());
      await loadServicesWorkspace();
      toast.success('Service created.');
    } catch (error) {
      toast.error(error?.response?.data?.message || 'Unable to create service.');
    } finally {
      setSaving('');
    }
  };

  const handleAddonsToggle = async (service, enabled) => {
    const itemId = Number(service?.item_id);
    if (!itemId) return;
    setSaving(`addons-${itemId}`);
    try {
      await updateServiceCatalogEntry(itemId, { addons_enabled: enabled });
      setCatalog((previous) => previous.map((entry) => (
        Number(entry.item_id) === itemId
          ? { ...entry, service_detail: { ...entry.service_detail, addons_enabled: enabled } }
          : entry
      )));
      toast.success(enabled ? 'Service add-ons enabled.' : 'Service add-ons disabled.');
    } catch (error) {
      toast.error(error?.response?.data?.message || 'Unable to update service add-ons.');
    } finally {
      setSaving('');
    }
  };

  const handleResourceSubmit = async (event) => {
    event.preventDefault();
    setSaving('resource');
    try {
      await createServiceResource({ ...resourceForm, capacity: Number(resourceForm.capacity || 1) });
      setResourceForm(blankResourceForm);
      await loadServicesWorkspace();
      toast.success('Resource created.');
    } catch (error) {
      toast.error(error?.response?.data?.message || 'Unable to create resource.');
    } finally {
      setSaving('');
    }
  };

  const handleAssignmentSubmit = async (event) => {
    event.preventDefault();
    setSaving('assignment');
    try {
      await createServiceAssignment({
        item_id: Number(assignmentForm.item_id),
        resource_id: assignmentForm.resource_id ? Number(assignmentForm.resource_id) : null,
        user_id: assignmentForm.user_id ? Number(assignmentForm.user_id) : null,
        location_id: assignmentForm.location_id ? Number(assignmentForm.location_id) : null
      });
      setAssignmentForm(blankAssignmentForm);
      await loadServicesWorkspace();
      toast.success('Assignment created.');
    } catch (error) {
      toast.error(error?.response?.data?.message || 'Unable to create assignment.');
    } finally {
      setSaving('');
    }
  };

  const handleWaitlistSubmit = async (event) => {
    event.preventDefault();
    setSaving('waitlist');
    try {
      await createServiceWaitlistEntry({
        service_item_id: Number(waitlistForm.service_item_id),
        customer_name: waitlistForm.customer_name,
        customer_email: waitlistForm.customer_email || null,
        customer_phone: waitlistForm.customer_phone || null,
        preferred_start_at: toIsoOrNull(waitlistForm.preferred_start_at),
        preferred_end_at: toIsoOrNull(waitlistForm.preferred_end_at),
        notes: waitlistForm.notes || null
      });
      setWaitlistForm(blankWaitlistForm);
      await loadServicesWorkspace();
      toast.success('Waitlist entry added.');
    } catch (error) {
      toast.error(error?.response?.data?.message || 'Unable to add waitlist entry.');
    } finally {
      setSaving('');
    }
  };

  const handleStatusChange = async (bookingId, status) => {
    setUpdatingBookingId(bookingId);
    try {
      await updateServiceBookingStatus(bookingId, { status });
      await loadServicesWorkspace();
      toast.success('Booking updated.');
    } catch (error) {
      toast.error(error?.response?.data?.message || 'Unable to update booking.');
    } finally {
      setUpdatingBookingId(null);
    }
  };

  const handleWaitlistStatus = async (entryId, status) => {
    setUpdatingWaitlistId(entryId);
    try {
      await updateServiceWaitlistStatus(entryId, { status });
      await loadServicesWorkspace();
      toast.success('Waitlist updated.');
    } catch (error) {
      toast.error(error?.response?.data?.message || 'Unable to update waitlist.');
    } finally {
      setUpdatingWaitlistId(null);
    }
  };

  const deactivateAssignment = async (assignmentId) => {
    setSaving(`assignment-${assignmentId}`);
    try {
      await updateServiceAssignment(assignmentId, { is_active: false });
      await loadServicesWorkspace();
      toast.success('Assignment removed.');
    } catch (error) {
      toast.error(error?.response?.data?.message || 'Unable to remove assignment.');
    } finally {
      setSaving('');
    }
  };

  const handleQueueReminders = async () => {
    setSaving('queue-reminders');
    try {
      const result = await queueDueServiceReminders({ lookahead_hours: 24, limit: 200 });
      await loadServicesWorkspace();
      toast.success(`${result?.queued_count || 0} reminders queued.`);
    } catch (error) {
      toast.error(error?.response?.data?.message || 'Unable to queue reminders.');
    } finally {
      setSaving('');
    }
  };

  const handleSendReminders = async () => {
    setSaving('send-reminders');
    try {
      const result = await sendDueServiceReminders({ limit: 100 });
      await loadServicesWorkspace();
      toast.success(`${result?.sent_count || 0} sent, ${result?.skipped_count || 0} skipped, ${result?.failed_count || 0} failed.`);
    } catch (error) {
      toast.error(error?.response?.data?.message || 'Unable to process reminders.');
    } finally {
      setSaving('');
    }
  };

  return (
    <div className="mx-auto max-w-7xl space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-slate-950">Services</h1>
          <p className="mt-1 text-sm text-slate-600">Appointments, service catalog, resources, waitlist, clients, and POS-ready service tickets.</p>
        </div>
        <button type="button" onClick={loadServicesWorkspace} className={buttonClass}>
          <RefreshCw className="h-4 w-4" />
          Refresh
        </button>
      </div>

      <div className="grid gap-3 md:grid-cols-4">
        <StatTile icon={CalendarCheck} label="Future Bookings" value={dashboard?.future_bookings ?? 0} hint="Open scheduled service work" />
        <StatTile icon={History} label="Expected Revenue" value={money(dashboard?.expected_revenue)} hint="Open appointment value" />
        <StatTile icon={Clock} label="Postpaid Aging" value={money(dashboard?.postpaid_aging_total)} hint="Needs POS collection" />
        <StatTile icon={CheckCircle2} label="No-Shows" value={bookingCounts.no_show} hint="Follow-up priority" />
      </div>

      <section className="rounded-lg border border-slate-200 bg-white p-4">
        <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
          <div>
            <h2 className="text-lg font-semibold text-slate-950">Service Desk Priorities</h2>
            <p className="text-sm text-slate-500">Operational signals for today, reminders, waitlist follow-up, and appointments that may need no-show handling.</p>
          </div>
          <span className="rounded-full bg-slate-100 px-2 py-1 text-xs font-semibold text-slate-600">Live workspace</span>
        </div>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-6">
          <PriorityTile icon={CalendarCheck} label="Today" value={serviceDeskMetrics.today} tone="teal" />
          <PriorityTile icon={UserRound} label="Checked In" value={serviceDeskMetrics.checkedIn} tone="teal" />
          <PriorityTile icon={Clock} label="In Service" value={serviceDeskMetrics.inService} tone="slate" />
          <PriorityTile icon={Bell} label="Reminders" value={serviceDeskMetrics.remindersDue} tone="amber" />
          <PriorityTile icon={ListChecks} label="Waiting" value={serviceDeskMetrics.waiting} tone="amber" />
          <PriorityTile icon={AlertTriangle} label="Overdue" value={serviceDeskMetrics.overdue} tone={serviceDeskMetrics.overdue > 0 ? 'rose' : 'slate'} />
        </div>
      </section>

      <div className="flex gap-2 overflow-x-auto border-b border-slate-200 pb-2">
        {tabs.map((tab) => {
          const Icon = tab.icon;
          const active = activeTab === tab.id;
          return (
            <button key={tab.id} type="button" onClick={() => setActiveTab(tab.id)} className={`inline-flex shrink-0 items-center gap-2 rounded-md px-3 py-2 text-sm font-semibold ${active ? 'bg-teal-700 text-white' : 'bg-white text-slate-700 hover:bg-slate-50'}`}>
              <Icon className="h-4 w-4" />
              {tab.label}
            </button>
          );
        })}
      </div>

      {activeTab === 'today' && (
        <section className="space-y-4">
          <div>
            <h2 className="text-lg font-semibold text-slate-950">Today</h2>
            <p className="text-sm text-slate-500">Use this as the daily service desk: confirm, check in, start, complete, or mark no-show.</p>
          </div>
          <ServiceBookingTable bookings={todayBookings} updatingBookingId={updatingBookingId} onStatusChange={handleStatusChange} emptyText={loading ? 'Loading appointments...' : 'No appointments scheduled today.'} />
        </section>
      )}

      {activeTab === 'calendar' && (
        <section className="space-y-4">
          <div>
            <h2 className="text-lg font-semibold text-slate-950">Calendar</h2>
            <p className="text-sm text-slate-500">A simple schedule list grouped by day for service businesses that do not need manufacturing queues.</p>
          </div>
          {calendarGroups.map(([day, rows]) => (
            <div key={day} className="space-y-2">
              <h3 className="text-sm font-bold uppercase tracking-normal text-slate-500">{day}</h3>
              <ServiceBookingTable bookings={rows} updatingBookingId={updatingBookingId} onStatusChange={handleStatusChange} emptyText="No appointments." />
            </div>
          ))}
          {!loading && calendarGroups.length === 0 && <p className="rounded-lg border border-slate-200 bg-white p-6 text-sm text-slate-500">No active appointments yet.</p>}
        </section>
      )}

      {activeTab === 'services' && (
        <section className="grid gap-4 xl:grid-cols-[380px_minmax(0,1fr)]">
          <ServiceCatalogForm
            values={catalogForm}
            onChange={setCatalogForm}
            onSubmit={handleCatalogSubmit}
            saving={saving === 'catalog'}
          />

          <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
            {catalog.map((service) => (
              <article key={service.item_id} className="rounded-lg border border-slate-200 bg-white p-4">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <h3 className="font-semibold text-slate-950">{service.name}</h3>
                    <p className="mt-1 text-sm text-slate-500">{service.service_detail?.service_category || 'General service'}</p>
                  </div>
                  <span className="rounded-full bg-teal-50 px-2 py-1 text-xs font-semibold text-teal-800">{money(service.default_sale_price)}</span>
                </div>
                <div className="mt-3 grid grid-cols-2 gap-2 text-xs text-slate-600">
                  <span>{Number(service.service_detail?.duration_minutes || 0)} min</span>
                  <span>{service.service_detail?.payment_policy || 'customer_choice'}</span>
                  <span>{service.service_detail?.bookable === false ? 'Not bookable' : 'Bookable'}</span>
                  <span>{service.service_detail?.visible_in_storefront === false ? 'IMS/POS only' : 'Storefront visible'}</span>
                  <span>{Array.isArray(service.service_detail?.intake_form_schema?.fields) && service.service_detail.intake_form_schema.fields.length > 0 ? 'Intake form' : 'No intake form'}</span>
                </div>
                <div className="mt-3 flex items-center justify-between gap-3 rounded-lg border border-slate-200 px-3 py-2 text-xs font-semibold text-slate-700">
                  <span>Allow Add-ons</span>
                  <button
                    type="button"
                    role="switch"
                    aria-label={`Allow add-ons for ${service.name}`}
                    aria-checked={service.service_detail?.addons_enabled === true}
                    disabled={saving === `addons-${service.item_id}`}
                    onClick={() => handleAddonsToggle(service, service.service_detail?.addons_enabled !== true)}
                    className={`relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none focus:ring-2 focus:ring-blue-500/20 disabled:cursor-not-allowed disabled:opacity-60 ${
                      service.service_detail?.addons_enabled === true ? 'bg-blue-600' : 'bg-slate-200'
                    }`}
                  >
                    <span
                      className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow ring-0 transition duration-200 ease-in-out ${
                        service.service_detail?.addons_enabled === true ? 'translate-x-5' : 'translate-x-0'
                      }`}
                    />
                  </button>
                </div>
              </article>
            ))}
            {!loading && catalog.length === 0 && <p className="text-sm text-slate-500">No service catalog entries yet.</p>}
          </div>
        </section>
      )}

      {activeTab === 'options' && (
        <section className="rounded-lg border border-slate-200 bg-white p-4">
          <ServiceOptionGroupManager />
        </section>
      )}

      {activeTab === 'team' && (
        <section className="grid gap-4 xl:grid-cols-[380px_minmax(0,1fr)]">
          <div className="space-y-4">
            <form onSubmit={handleResourceSubmit} className="rounded-lg border border-slate-200 bg-white p-4">
              <h2 className="text-lg font-semibold text-slate-950">Resource</h2>
              <div className="mt-3 grid gap-3">
                <Field label="Name"><input required value={resourceForm.name} onChange={(event) => setResourceForm((prev) => ({ ...prev, name: event.target.value }))} className={inputClass} /></Field>
                <div className="grid grid-cols-2 gap-3">
                  <Field label="Type">
                    <select value={resourceForm.resource_type} onChange={(event) => setResourceForm((prev) => ({ ...prev, resource_type: event.target.value }))} className={inputClass}>
                      <option value="provider">Provider</option>
                      <option value="room">Room</option>
                      <option value="equipment">Equipment</option>
                      <option value="vehicle">Vehicle</option>
                      <option value="station">Station</option>
                    </select>
                  </Field>
                  <Field label="Capacity"><input type="number" min="1" value={resourceForm.capacity} onChange={(event) => setResourceForm((prev) => ({ ...prev, capacity: event.target.value }))} className={inputClass} /></Field>
                </div>
                <button type="submit" disabled={saving === 'resource'} className={buttonClass}>{saving === 'resource' ? 'Saving...' : 'Create Resource'}</button>
              </div>
            </form>

            <form onSubmit={handleAssignmentSubmit} className="rounded-lg border border-slate-200 bg-white p-4">
              <h2 className="text-lg font-semibold text-slate-950">Assign Service</h2>
              <div className="mt-3 grid gap-3">
                <Field label="Service">
                  <select required value={assignmentForm.item_id} onChange={(event) => setAssignmentForm((prev) => ({ ...prev, item_id: event.target.value }))} className={inputClass}>
                    <option value="">Select service</option>
                    {serviceOptions.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
                  </select>
                </Field>
                <Field label="Resource">
                  <select value={assignmentForm.resource_id} onChange={(event) => setAssignmentForm((prev) => ({ ...prev, resource_id: event.target.value }))} className={inputClass}>
                    <option value="">Any resource</option>
                    {resources.map((resource) => <option key={resource.resource_id} value={resource.resource_id}>{resource.name}</option>)}
                  </select>
                </Field>
                <div className="grid grid-cols-2 gap-3">
                  <Field label="Provider">
                    <select value={assignmentForm.user_id} onChange={(event) => setAssignmentForm((prev) => ({ ...prev, user_id: event.target.value }))} className={inputClass}>
                      <option value="">Any provider</option>
                      {users.map((user) => (
                        <option key={user.user_id} value={user.user_id}>{user.username || user.email || `User #${user.user_id}`}</option>
                      ))}
                    </select>
                  </Field>
                  <Field label="Location ID"><input value={assignmentForm.location_id} onChange={(event) => setAssignmentForm((prev) => ({ ...prev, location_id: event.target.value }))} className={inputClass} /></Field>
                </div>
                <button type="submit" disabled={saving === 'assignment'} className={primaryButtonClass}>{saving === 'assignment' ? 'Saving...' : 'Create Assignment'}</button>
              </div>
            </form>
          </div>

          <div className="space-y-4">
            <section className="rounded-lg border border-slate-200 bg-white p-4">
              <h2 className="text-lg font-semibold text-slate-950">Resources</h2>
              <div className="mt-3 flex flex-wrap gap-2">
                {resources.map((resource) => (
                  <span key={resource.resource_id} className="rounded-full border border-slate-200 bg-slate-50 px-3 py-1 text-sm text-slate-700">
                    {resource.name} &middot; {resource.resource_type} &middot; cap {resource.capacity}
                  </span>
                ))}
                {!loading && resources.length === 0 && <p className="text-sm text-slate-500">No rooms, chairs, equipment, vehicles, or providers yet.</p>}
              </div>
            </section>

            <section className="rounded-lg border border-slate-200 bg-white p-4">
              <h2 className="text-lg font-semibold text-slate-950">Assignments</h2>
              <div className="mt-3 divide-y divide-slate-100">
                {assignments.map((assignment) => (
                  <div key={assignment.assignment_id} className="flex flex-wrap items-center justify-between gap-3 py-3">
                    <div>
                      <p className="font-semibold text-slate-900">{assignment.service?.name || `Service #${assignment.item_id}`}</p>
                      <p className="text-sm text-slate-500">{assignment.resource?.name || assignment.provider?.username || 'Any assigned staff/resource'}</p>
                    </div>
                    <button type="button" disabled={saving === `assignment-${assignment.assignment_id}`} onClick={() => deactivateAssignment(assignment.assignment_id)} className={buttonClass}>Remove</button>
                  </div>
                ))}
                {!loading && assignments.length === 0 && <p className="py-4 text-sm text-slate-500">No service assignments yet.</p>}
              </div>
            </section>
          </div>
        </section>
      )}

      {activeTab === 'waitlist' && (
        <section className="grid gap-4 xl:grid-cols-[380px_minmax(0,1fr)]">
          <form onSubmit={handleWaitlistSubmit} className="rounded-lg border border-slate-200 bg-white p-4">
            <h2 className="text-lg font-semibold text-slate-950">Add Waitlist Entry</h2>
            <div className="mt-3 grid gap-3">
              <Field label="Service">
                <select required value={waitlistForm.service_item_id} onChange={(event) => setWaitlistForm((prev) => ({ ...prev, service_item_id: event.target.value }))} className={inputClass}>
                  <option value="">Select service</option>
                  {serviceOptions.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
                </select>
              </Field>
              <Field label="Client Name"><input required value={waitlistForm.customer_name} onChange={(event) => setWaitlistForm((prev) => ({ ...prev, customer_name: event.target.value }))} className={inputClass} /></Field>
              <div className="grid grid-cols-2 gap-3">
                <Field label="Email"><input type="email" value={waitlistForm.customer_email} onChange={(event) => setWaitlistForm((prev) => ({ ...prev, customer_email: event.target.value }))} className={inputClass} /></Field>
                <Field label="Phone"><input value={waitlistForm.customer_phone} onChange={(event) => setWaitlistForm((prev) => ({ ...prev, customer_phone: event.target.value }))} className={inputClass} /></Field>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <Field label="Preferred From"><input type="datetime-local" value={waitlistForm.preferred_start_at} onChange={(event) => setWaitlistForm((prev) => ({ ...prev, preferred_start_at: event.target.value }))} className={inputClass} /></Field>
                <Field label="Preferred Until"><input type="datetime-local" value={waitlistForm.preferred_end_at} onChange={(event) => setWaitlistForm((prev) => ({ ...prev, preferred_end_at: event.target.value }))} className={inputClass} /></Field>
              </div>
              <Field label="Notes"><textarea value={waitlistForm.notes} onChange={(event) => setWaitlistForm((prev) => ({ ...prev, notes: event.target.value }))} className={`${inputClass} min-h-[80px]`} /></Field>
              <button type="submit" disabled={saving === 'waitlist'} className={primaryButtonClass}>{saving === 'waitlist' ? 'Saving...' : 'Add to Waitlist'}</button>
            </div>
          </form>

          <div className="rounded-lg border border-slate-200 bg-white">
            <div className="border-b border-slate-200 p-4">
              <h2 className="text-lg font-semibold text-slate-950">Waitlist</h2>
            </div>
            <div className="divide-y divide-slate-100">
              {waitlist.map((entry) => (
                <div key={entry.waitlist_entry_id} className="flex flex-wrap items-center justify-between gap-3 p-4">
                  <div>
                    <p className="font-semibold text-slate-900">{entry.customer_name}</p>
                    <p className="text-sm text-slate-500">{entry.service?.name || 'Service'} &middot; {entry.customer_email || entry.customer_phone}</p>
                    <p className="mt-1 text-xs text-slate-500">Preferred: {formatDate(entry.preferred_start_at)} to {formatDate(entry.preferred_end_at)}</p>
                    {entry.notes && <p className="mt-1 text-xs text-slate-500">{entry.notes}</p>}
                  </div>
                  <select value={entry.status} disabled={updatingWaitlistId === entry.waitlist_entry_id} onChange={(event) => handleWaitlistStatus(entry.waitlist_entry_id, event.target.value)} className={inputClass}>
                    <option value="waiting">Waiting</option>
                    <option value="notified">Notified</option>
                    <option value="booked">Booked</option>
                    <option value="expired">Expired</option>
                    <option value="cancelled">Cancelled</option>
                  </select>
                </div>
              ))}
              {!loading && waitlist.length === 0 && <p className="p-6 text-sm text-slate-500">No waitlist entries yet.</p>}
            </div>
          </div>
        </section>
      )}

      {activeTab === 'reminders' && (
        <section className="space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <h2 className="text-lg font-semibold text-slate-950">Reminders</h2>
              <p className="text-sm text-slate-500">Queue reminders for upcoming appointments and process due email reminders through the configured SMTP service.</p>
            </div>
            <div className="flex flex-wrap gap-2">
              <button type="button" disabled={saving === 'queue-reminders'} onClick={handleQueueReminders} className={buttonClass}>
                <MailCheck className="h-4 w-4" />
                {saving === 'queue-reminders' ? 'Queueing...' : 'Queue Due'}
              </button>
              <button type="button" disabled={saving === 'send-reminders'} onClick={handleSendReminders} className={primaryButtonClass}>
                <Send className="h-4 w-4" />
                {saving === 'send-reminders' ? 'Processing...' : 'Send Due'}
              </button>
            </div>
          </div>
          <div className="overflow-x-auto rounded-lg border border-slate-200 bg-white">
            <table className="min-w-full divide-y divide-slate-200 text-sm">
              <thead className="bg-slate-50 text-left text-xs font-semibold uppercase tracking-normal text-slate-500">
                <tr>
                  <th className="px-3 py-2">Recipient</th>
                  <th className="px-3 py-2">Appointment</th>
                  <th className="px-3 py-2">Scheduled</th>
                  <th className="px-3 py-2">Status</th>
                  <th className="px-3 py-2">Result</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {reminders.map((reminder) => (
                  <tr key={reminder.reminder_id}>
                    <td className="px-3 py-3">
                      <div className="font-semibold text-slate-900">{reminder.recipient}</div>
                      <div className="text-xs text-slate-500">{reminder.channel} &middot; {reminder.reminder_type?.replace(/_/g, ' ')}</div>
                    </td>
                    <td className="px-3 py-3 text-slate-600">
                      <div>{reminder.booking?.service_name || reminder.payload?.service_name || 'Service'}</div>
                      <div className="text-xs text-slate-500">{reminder.booking?.public_reference || reminder.payload?.public_reference || 'No reference'}</div>
                    </td>
                    <td className="px-3 py-3 text-slate-600">{formatDateTime(reminder.scheduled_for)}</td>
                    <td className="px-3 py-3">
                      <span className={`rounded-full px-2 py-1 text-xs font-semibold ${reminder.status === 'sent' ? 'bg-teal-50 text-teal-800' : reminder.status === 'failed' ? 'bg-rose-50 text-rose-800' : 'bg-slate-100 text-slate-700'}`}>
                        {reminder.status}
                      </span>
                    </td>
                    <td className="px-3 py-3 text-xs text-slate-500">{reminder.provider_message_id || reminder.failure_reason || 'Pending'}</td>
                  </tr>
                ))}
                {!loading && reminders.length === 0 && <tr><td colSpan={5} className="px-3 py-8 text-center text-sm text-slate-500">No reminders queued yet.</td></tr>}
              </tbody>
            </table>
          </div>
        </section>
      )}

      {activeTab === 'clients' && (
        <section className="rounded-lg border border-slate-200 bg-white">
          <div className="border-b border-slate-200 p-4">
            <h2 className="text-lg font-semibold text-slate-950">Clients</h2>
            <p className="text-sm text-slate-500">Repeat bookings, no-shows, last service, and simple service history signals.</p>
          </div>
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-slate-200 text-sm">
              <thead className="bg-slate-50 text-left text-xs font-semibold uppercase tracking-normal text-slate-500">
                <tr>
                  <th className="px-3 py-2">Client</th>
                  <th className="px-3 py-2">Contact</th>
                  <th className="px-3 py-2">Bookings</th>
                  <th className="px-3 py-2">Retention</th>
                  <th className="px-3 py-2">Last Service</th>
                  <th className="px-3 py-2">Spend</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {clients.map((client) => (
                  <tr key={client.client_key || client.customer_email || client.customer_phone}>
                    <td className="px-3 py-3 font-semibold text-slate-900">{client.customer_name || 'Client'}</td>
                    <td className="px-3 py-3 text-slate-600">{client.customer_email || client.customer_phone || 'No contact'}</td>
                    <td className="px-3 py-3 text-slate-600">{client.booking_count} total &middot; {client.completed_count} completed &middot; {client.no_show_count} no-show</td>
                    <td className="px-3 py-3 text-slate-600">
                      <span className={`rounded-full px-2 py-1 text-xs font-semibold ${client.repeat_client ? 'bg-teal-50 text-teal-800' : 'bg-slate-100 text-slate-600'}`}>
                        {client.repeat_client ? 'Repeat' : 'New'}
                      </span>
                      <div className="mt-1 text-xs text-slate-500">{Math.round(Number(client.no_show_rate || 0) * 100)}% no-show rate</div>
                    </td>
                    <td className="px-3 py-3 text-slate-600">{client.last_service_name || 'Service'} &middot; {formatDateTime(client.last_booking_at)}</td>
                    <td className="px-3 py-3 font-semibold text-slate-900">{money(client.total_spend)}</td>
                  </tr>
                ))}
                {!loading && clients.length === 0 && <tr><td colSpan={6} className="px-3 py-8 text-center text-sm text-slate-500">No service clients yet.</td></tr>}
              </tbody>
            </table>
          </div>
        </section>
      )}
    </div>
  );
}
