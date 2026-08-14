import React from 'react';
import { MailCheck, Send } from 'lucide-react';

const STATUS_TRANSITIONS = {
  requested: ['confirmed', 'cancelled', 'no_show'],
  confirmed: ['checked_in', 'cancelled', 'no_show'],
  checked_in: ['in_service', 'cancelled', 'no_show'],
  in_service: ['completed', 'cancelled'],
  completed: [],
  cancelled: [],
  no_show: ['confirmed']
};

const inputClass = 'w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 outline-none focus:border-teal-600 focus:ring-2 focus:ring-teal-100';
const buttonClass = 'inline-flex items-center justify-center gap-2 rounded-md border border-slate-300 bg-white px-3 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-60';
const primaryButtonClass = 'inline-flex items-center justify-center gap-2 rounded-md bg-teal-700 px-3 py-2 text-sm font-semibold text-white hover:bg-teal-800 disabled:opacity-60';

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

const Field = ({ label, children }) => (
  <label className="block text-xs font-semibold text-slate-600">
    {label}
    <div className="mt-1">{children}</div>
  </label>
);

export const ServiceBookingTable = ({ bookings, updatingBookingId, onStatusChange, emptyText, canManage = true, canSettle = false, settlingBookingId = null, onSettle = null }) => (
  <div className="overflow-x-auto rounded-lg border border-slate-200 bg-white">
    <table className="min-w-full divide-y divide-slate-200 text-sm">
      <thead className="bg-slate-50 text-left text-xs font-semibold uppercase tracking-normal text-slate-500">
        <tr><th className="px-3 py-2">Ticket</th><th className="px-3 py-2">Service</th><th className="px-3 py-2">Client</th><th className="px-3 py-2">Schedule</th><th className="px-3 py-2">Payment</th><th className="px-3 py-2">Status</th></tr>
      </thead>
      <tbody className="divide-y divide-slate-100">
        {bookings.map((booking) => {
          const statuses = Array.from(new Set([booking.status, ...(STATUS_TRANSITIONS[booking.status] || [])].filter(Boolean)));
          return (
            <tr key={booking.booking_id} className="align-top">
              <td className="px-3 py-3 font-semibold text-slate-900">{booking.public_reference}</td>
              <td className="px-3 py-3"><div className="font-medium text-slate-900">{booking.service_name || booking.service?.name || 'Service'}</div><div className="text-xs text-slate-500">{Number(booking.duration_minutes || booking.service?.duration_minutes || 0)} min</div></td>
              <td className="px-3 py-3"><div className="font-medium text-slate-900">{booking.customer_name || 'Guest'}</div><div className="text-xs text-slate-500">{booking.customer_email || booking.customer_phone || 'No contact saved'}</div></td>
              <td className="px-3 py-3 text-slate-700">{formatDateTime(booking.start_at)}</td>
              <td className="px-3 py-3"><span className="rounded-full bg-slate-100 px-2 py-1 text-xs font-semibold text-slate-700">{booking.payment_status || 'unpaid'}</span><div className="mt-1 text-xs text-slate-500">{booking.payment_timing || 'postpaid'} &middot; {money(booking.total_amount)}</div>{onSettle && booking.payment_status !== 'paid' && ['confirmed', 'checked_in', 'in_service', 'completed'].includes(booking.status) && <button type="button" disabled={!canSettle || settlingBookingId !== null} onClick={() => onSettle(booking)} className="mt-2 rounded-md border border-teal-300 bg-teal-50 px-2 py-1 text-xs font-bold text-teal-800 disabled:cursor-not-allowed disabled:opacity-50">{settlingBookingId === booking.booking_id ? 'Settling...' : 'Collect Payment'}</button>}</td>
              <td className="px-3 py-3"><select aria-label={`Status for ${booking.public_reference || `booking ${booking.booking_id}`}`} value={booking.status} disabled={!canManage || updatingBookingId === booking.booking_id} onChange={(event) => onStatusChange(booking.booking_id, event.target.value)} className="rounded-md border border-slate-300 bg-white px-2 py-1 text-xs font-semibold text-slate-700 disabled:cursor-not-allowed disabled:bg-slate-100">{statuses.map((status) => <option key={status} value={status}>{status.replace(/_/g, ' ')}</option>)}</select></td>
            </tr>
          );
        })}
        {bookings.length === 0 && <tr><td colSpan={6} className="px-3 py-8 text-center text-sm text-slate-500">{emptyText}</td></tr>}
      </tbody>
    </table>
  </div>
);

export const ServiceTeamResourcesPanel = ({ resourceForm, setResourceForm, assignmentForm, setAssignmentForm, serviceOptions, resources, users, assignments, saving, loading, onResourceSubmit, onAssignmentSubmit, onDeactivateAssignment, canManage = true }) => (
  <section className="grid gap-4 xl:grid-cols-[380px_minmax(0,1fr)]">
    <div className="space-y-4">
      {!canManage && <p className="rounded-lg border border-sky-200 bg-sky-50 p-3 text-sm font-semibold text-sky-900">View-only access: resource and assignment changes are disabled.</p>}
      <form onSubmit={onResourceSubmit} className="rounded-lg border border-slate-200 bg-white p-4">
        <h2 className="text-lg font-semibold text-slate-950">Resource</h2>
        <p className="mt-1 text-sm text-slate-500">Create a provider, room, equipment item, vehicle, or service station with its bookable capacity.</p>
        <fieldset disabled={!canManage} className="mt-3 grid gap-3 disabled:opacity-60">
          <Field label="Name"><input required value={resourceForm.name} onChange={(event) => setResourceForm((prev) => ({ ...prev, name: event.target.value }))} className={inputClass} /></Field>
          <div className="grid grid-cols-2 gap-3"><Field label="Type"><select value={resourceForm.resource_type} onChange={(event) => setResourceForm((prev) => ({ ...prev, resource_type: event.target.value }))} className={inputClass}><option value="provider">Provider</option><option value="room">Room</option><option value="equipment">Equipment</option><option value="vehicle">Vehicle</option><option value="station">Station</option></select></Field><Field label="Capacity"><input type="number" min="1" value={resourceForm.capacity} onChange={(event) => setResourceForm((prev) => ({ ...prev, capacity: event.target.value }))} className={inputClass} /></Field></div>
          <Field label="Resource Location ID"><input type="number" min="1" value={resourceForm.location_id || ''} onChange={(event) => setResourceForm((prev) => ({ ...prev, location_id: event.target.value }))} placeholder="Optional" className={inputClass} /></Field>
          <button type="submit" disabled={Boolean(saving)} className={buttonClass}>{saving === 'resource' ? 'Saving...' : 'Create Resource'}</button>
        </fieldset>
      </form>
      <form onSubmit={onAssignmentSubmit} className="rounded-lg border border-slate-200 bg-white p-4">
        <h2 className="text-lg font-semibold text-slate-950">Assign Service</h2>
        <p className="mt-1 text-sm text-slate-500">Connect a service to at least one resource, provider, or location capacity anchor.</p>
        <fieldset disabled={!canManage} className="mt-3 grid gap-3 disabled:opacity-60">
          <Field label="Service"><select required value={assignmentForm.item_id} onChange={(event) => setAssignmentForm((prev) => ({ ...prev, item_id: event.target.value }))} className={inputClass}><option value="">Select service</option>{serviceOptions.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}</select></Field>
          <Field label="Resource"><select value={assignmentForm.resource_id} onChange={(event) => setAssignmentForm((prev) => ({ ...prev, resource_id: event.target.value }))} className={inputClass}><option value="">Any resource</option>{resources.map((resource) => <option key={resource.resource_id} value={resource.resource_id}>{resource.name}</option>)}</select></Field>
          <div className="grid grid-cols-2 gap-3"><Field label="Provider"><select value={assignmentForm.user_id} onChange={(event) => setAssignmentForm((prev) => ({ ...prev, user_id: event.target.value }))} className={inputClass}><option value="">Any provider</option>{users.map((user) => <option key={user.user_id} value={user.user_id}>{user.username || user.email || `User #${user.user_id}`}</option>)}</select></Field><Field label="Location ID"><input value={assignmentForm.location_id} onChange={(event) => setAssignmentForm((prev) => ({ ...prev, location_id: event.target.value }))} className={inputClass} /></Field></div>
          <button type="submit" disabled={Boolean(saving) || !(assignmentForm.resource_id || assignmentForm.user_id || assignmentForm.location_id)} className={primaryButtonClass}>{saving === 'assignment' ? 'Saving...' : 'Create Assignment'}</button>
        </fieldset>
      </form>
    </div>
    <div className="space-y-4">
      <section className="rounded-lg border border-slate-200 bg-white p-4"><div className="flex items-center justify-between gap-3"><h2 className="text-lg font-semibold text-slate-950">Resources</h2><span className="rounded-full bg-slate-100 px-2 py-1 text-xs font-bold text-slate-600">{resources.length} active</span></div><div className="mt-3 grid gap-3 sm:grid-cols-2">{resources.map((resource) => <article key={resource.resource_id} className="rounded-lg border border-slate-200 bg-slate-50 p-3"><div className="flex items-start justify-between gap-2"><p className="font-semibold text-slate-900">{resource.name}</p><span className="rounded-full bg-teal-50 px-2 py-0.5 text-xs font-bold text-teal-800">{resource.resource_type}</span></div><p className="mt-2 text-sm text-slate-600">Capacity: {resource.capacity}</p><p className="text-xs text-slate-500">{resource.location_id ? `Location #${resource.location_id}` : 'All eligible locations'}</p></article>)}{!loading && resources.length === 0 && <p className="text-sm text-slate-500">No rooms, equipment, vehicles, stations, or provider resources yet.</p>}</div></section>
      <section className="rounded-lg border border-slate-200 bg-white p-4"><div className="flex items-center justify-between gap-3"><h2 className="text-lg font-semibold text-slate-950">Assignments</h2><span className="rounded-full bg-slate-100 px-2 py-1 text-xs font-bold text-slate-600">{assignments.length} active</span></div><div className="mt-3 divide-y divide-slate-100">{assignments.map((assignment) => { const anchors = [assignment.resource?.name, assignment.provider?.username || assignment.provider?.email, assignment.location_id ? `Location #${assignment.location_id}` : ''].filter(Boolean); return <div key={assignment.assignment_id} className="flex flex-wrap items-center justify-between gap-3 py-3"><div><p className="font-semibold text-slate-900">{assignment.service?.name || `Service #${assignment.item_id}`}</p><p className="text-sm text-slate-500">{anchors.join(' · ') || 'Unresolved assignment anchor'}</p></div><button type="button" aria-label={`Remove assignment for ${assignment.service?.name || `service ${assignment.item_id}`}`} disabled={!canManage || Boolean(saving)} onClick={() => onDeactivateAssignment(assignment.assignment_id)} className={buttonClass}>{saving === `assignment-${assignment.assignment_id}` ? 'Removing...' : 'Remove'}</button></div>; })}{!loading && assignments.length === 0 && <p className="py-4 text-sm text-slate-500">No service assignments yet.</p>}</div></section>
    </div>
  </section>
);

export const ServiceWaitlistPanel = ({ waitlistForm, setWaitlistForm, serviceOptions, waitlist, saving, loading, updatingWaitlistId, onSubmit, onStatusChange, canManage = true }) => {
  const [search, setSearch] = React.useState('');
  const [statusFilter, setStatusFilter] = React.useState('all');
  const hasContact = Boolean(String(waitlistForm.customer_email || '').trim() || String(waitlistForm.customer_phone || '').trim());
  const preferredStart = waitlistForm.preferred_start_at ? new Date(waitlistForm.preferred_start_at).getTime() : null;
  const preferredEnd = waitlistForm.preferred_end_at ? new Date(waitlistForm.preferred_end_at).getTime() : null;
  const invalidRange = Number.isFinite(preferredStart) && Number.isFinite(preferredEnd) && preferredEnd <= preferredStart;
  const canSubmit = canManage && !saving && waitlistForm.service_item_id && String(waitlistForm.customer_name || '').trim() && hasContact && !invalidRange;
  const statusCounts = waitlist.reduce((counts, entry) => ({ ...counts, [entry.status]: Number(counts[entry.status] || 0) + 1 }), {});
  const filteredWaitlist = [...waitlist]
    .filter((entry) => statusFilter === 'all' || entry.status === statusFilter)
    .filter((entry) => {
      const query = search.trim().toLowerCase();
      if (!query) return true;
      return [entry.customer_name, entry.customer_email, entry.customer_phone, entry.service?.name, entry.notes]
        .some((value) => String(value || '').toLowerCase().includes(query));
    })
    .sort((left, right) => {
      const leftTime = left.preferred_start_at ? new Date(left.preferred_start_at).getTime() : Number.MAX_SAFE_INTEGER;
      const rightTime = right.preferred_start_at ? new Date(right.preferred_start_at).getTime() : Number.MAX_SAFE_INTEGER;
      return leftTime - rightTime || Number(left.waitlist_entry_id || 0) - Number(right.waitlist_entry_id || 0);
    });

  return (
    <section className="grid gap-4 xl:grid-cols-[380px_minmax(0,1fr)]">
      <div className="space-y-3">
        {!canManage && <p className="rounded-lg border border-sky-200 bg-sky-50 p-3 text-sm font-semibold text-sky-900">View-only access: waitlist changes are disabled.</p>}
        <form onSubmit={onSubmit} className="rounded-lg border border-slate-200 bg-white p-4">
          <h2 className="text-lg font-semibold text-slate-950">Add Waitlist Entry</h2>
          <p className="mt-1 text-sm text-slate-500">Capture the requested service, client contact, preferred schedule window, and follow-up notes.</p>
          <fieldset disabled={!canManage} className="mt-3 grid gap-3 disabled:opacity-60">
            <Field label="Service"><select required value={waitlistForm.service_item_id} onChange={(event) => setWaitlistForm((prev) => ({ ...prev, service_item_id: event.target.value }))} className={inputClass}><option value="">Select service</option>{serviceOptions.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}</select></Field>
            <Field label="Client Name"><input required value={waitlistForm.customer_name} onChange={(event) => setWaitlistForm((prev) => ({ ...prev, customer_name: event.target.value }))} className={inputClass} /></Field>
            <div className="grid gap-3 sm:grid-cols-2"><Field label="Email"><input type="email" value={waitlistForm.customer_email} onChange={(event) => setWaitlistForm((prev) => ({ ...prev, customer_email: event.target.value }))} className={inputClass} /></Field><Field label="Phone"><input value={waitlistForm.customer_phone} onChange={(event) => setWaitlistForm((prev) => ({ ...prev, customer_phone: event.target.value }))} className={inputClass} /></Field></div>
            {!hasContact && <p className="text-xs font-semibold text-amber-700">Enter at least one client contact: email or phone.</p>}
            <div className="grid gap-3 sm:grid-cols-2"><Field label="Preferred From"><input type="datetime-local" value={waitlistForm.preferred_start_at} onChange={(event) => setWaitlistForm((prev) => ({ ...prev, preferred_start_at: event.target.value }))} className={inputClass} /></Field><Field label="Preferred Until"><input type="datetime-local" value={waitlistForm.preferred_end_at} onChange={(event) => setWaitlistForm((prev) => ({ ...prev, preferred_end_at: event.target.value }))} className={inputClass} /></Field></div>
            {invalidRange && <p role="alert" className="text-xs font-semibold text-rose-700">Preferred Until must be later than Preferred From.</p>}
            <Field label="Notes"><textarea value={waitlistForm.notes} onChange={(event) => setWaitlistForm((prev) => ({ ...prev, notes: event.target.value }))} className={`${inputClass} min-h-[80px]`} /></Field>
            <button type="submit" disabled={!canSubmit} className={primaryButtonClass}>{saving === 'waitlist' ? 'Saving...' : 'Add to Waitlist'}</button>
          </fieldset>
        </form>
      </div>
      <div className="rounded-lg border border-slate-200 bg-white">
        <div className="space-y-3 border-b border-slate-200 p-4">
          <div className="flex flex-wrap items-center justify-between gap-2"><h2 className="text-lg font-semibold text-slate-950">Waitlist</h2><span className="rounded-full bg-slate-100 px-2 py-1 text-xs font-bold text-slate-600">{waitlist.length} entries</span></div>
          <div className="grid gap-2 sm:grid-cols-2"><input aria-label="Search waitlist" value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search client, contact, service, or notes" className={inputClass} /><select aria-label="Filter waitlist by status" value={statusFilter} onChange={(event) => setStatusFilter(event.target.value)} className={inputClass}><option value="all">All statuses</option><option value="waiting">Waiting ({statusCounts.waiting || 0})</option><option value="notified">Notified ({statusCounts.notified || 0})</option><option value="booked">Booked ({statusCounts.booked || 0})</option><option value="expired">Expired ({statusCounts.expired || 0})</option><option value="cancelled">Cancelled ({statusCounts.cancelled || 0})</option></select></div>
        </div>
        <div className="divide-y divide-slate-100">{filteredWaitlist.map((entry) => <div key={entry.waitlist_entry_id} className="flex flex-wrap items-center justify-between gap-3 p-4"><div><p className="font-semibold text-slate-900">{entry.customer_name}</p><p className="text-sm text-slate-500">{entry.service?.name || 'Service'} &middot; {entry.customer_email || entry.customer_phone}</p><p className="mt-1 text-xs text-slate-500">Preferred: {formatDate(entry.preferred_start_at)} to {formatDate(entry.preferred_end_at)}</p>{entry.notes && <p className="mt-1 text-xs text-slate-500">{entry.notes}</p>}</div><select aria-label={`Waitlist status for ${entry.customer_name}`} value={entry.status} disabled={!canManage || updatingWaitlistId !== null} onChange={(event) => onStatusChange(entry.waitlist_entry_id, event.target.value)} className={`${inputClass} max-w-[170px]`}><option value="waiting">Waiting</option><option value="notified">Notified</option><option value="booked">Booked</option><option value="expired">Expired</option><option value="cancelled">Cancelled</option></select></div>)}{!loading && filteredWaitlist.length === 0 && <p className="p-6 text-sm text-slate-500">{search || statusFilter !== 'all' ? 'No waitlist entries match the current filters.' : 'No waitlist entries yet.'}</p>}</div>
      </div>
    </section>
  );
};

export const ServiceRemindersPanel = ({ reminders, loading, saving, outcome, onQueue, onSend, canManage = true }) => {
  const [search, setSearch] = React.useState('');
  const [statusFilter, setStatusFilter] = React.useState('all');
  const [lookaheadHours, setLookaheadHours] = React.useState('24');
  const statusCounts = reminders.reduce((counts, reminder) => ({ ...counts, [reminder.status]: Number(counts[reminder.status] || 0) + 1 }), {});
  const filteredReminders = reminders.filter((reminder) => {
    if (statusFilter !== 'all' && reminder.status !== statusFilter) return false;
    const query = search.trim().toLowerCase();
    if (!query) return true;
    return [reminder.recipient, reminder.channel, reminder.reminder_type, reminder.booking?.service_name, reminder.booking?.public_reference, reminder.payload?.service_name, reminder.payload?.public_reference, reminder.failure_reason, reminder.provider_message_id]
      .some((value) => String(value || '').toLowerCase().includes(query));
  });
  const busy = Boolean(saving);
  const outcomeText = outcome?.action === 'queue-reminders'
    ? `${Number(outcome.queued_count || 0)} queued · ${Number(outcome.skipped_count || 0)} skipped`
    : outcome?.action === 'send-reminders'
      ? `${Number(outcome.sent_count || 0)} sent · ${Number(outcome.failed_count || 0)} failed · ${Number(outcome.skipped_count || 0)} skipped`
      : '';

  return (
    <section className="space-y-4">
      <div className="space-y-3 rounded-lg border border-slate-200 bg-white p-4">
        <div className="flex flex-wrap items-start justify-between gap-3"><div><h2 className="text-lg font-semibold text-slate-950">Reminders</h2><p className="text-sm text-slate-500">Queue upcoming appointment emails and process due reminders through the configured SMTP service.</p></div><div className="flex flex-wrap gap-2">{['pending', 'sent', 'failed', 'skipped'].map((status) => <span key={status} className="rounded-full bg-slate-100 px-2 py-1 text-xs font-bold text-slate-600">{statusCounts[status] || 0} {status}</span>)}</div></div>
        {!canManage && <p className="rounded-lg border border-sky-200 bg-sky-50 p-3 text-sm font-semibold text-sky-900">View-only access: reminder queueing and delivery processing are disabled.</p>}
        <div className="grid gap-2 lg:grid-cols-[minmax(0,1fr)_190px_150px_auto_auto]"><input aria-label="Search reminders" value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search recipient, service, reference, or result" className={inputClass} /><select aria-label="Filter reminders by status" value={statusFilter} onChange={(event) => setStatusFilter(event.target.value)} className={inputClass}><option value="all">All statuses</option><option value="pending">Pending</option><option value="sent">Sent</option><option value="failed">Failed</option><option value="skipped">Skipped</option></select><label className="text-xs font-semibold text-slate-600">Queue window<select aria-label="Reminder queue window" value={lookaheadHours} onChange={(event) => setLookaheadHours(event.target.value)} disabled={!canManage || busy} className={`${inputClass} mt-1`}><option value="24">Next 24 hours</option><option value="48">Next 48 hours</option><option value="72">Next 72 hours</option><option value="168">Next 7 days</option></select></label><button type="button" disabled={!canManage || busy} onClick={() => onQueue(Number(lookaheadHours))} className={buttonClass}><MailCheck className="h-4 w-4" />{saving === 'queue-reminders' ? 'Queueing...' : 'Queue Due'}</button><button type="button" disabled={!canManage || busy} onClick={onSend} className={primaryButtonClass}><Send className="h-4 w-4" />{saving === 'send-reminders' ? 'Processing...' : 'Send Due'}</button></div>
        {outcomeText && <p role="status" className="rounded-lg border border-teal-200 bg-teal-50 p-3 text-sm font-semibold text-teal-900">Last reminder run: {outcomeText}. The table reflects authoritative server outcomes.</p>}
      </div>
      <div className="overflow-x-auto rounded-lg border border-slate-200 bg-white"><table className="min-w-full divide-y divide-slate-200 text-sm"><thead className="bg-slate-50 text-left text-xs font-semibold uppercase tracking-normal text-slate-500"><tr><th className="px-3 py-2">Recipient</th><th className="px-3 py-2">Appointment</th><th className="px-3 py-2">Scheduled</th><th className="px-3 py-2">Status</th><th className="px-3 py-2">Result</th></tr></thead><tbody className="divide-y divide-slate-100">{filteredReminders.map((reminder) => <tr key={reminder.reminder_id}><td className="px-3 py-3"><div className="font-semibold text-slate-900">{reminder.recipient}</div><div className="text-xs text-slate-500">{reminder.channel} &middot; {reminder.reminder_type?.replace(/_/g, ' ')}</div></td><td className="px-3 py-3 text-slate-600"><div>{reminder.booking?.service_name || reminder.payload?.service_name || 'Service'}</div><div className="text-xs text-slate-500">{reminder.booking?.public_reference || reminder.payload?.public_reference || 'No reference'}</div></td><td className="px-3 py-3 text-slate-600">{formatDateTime(reminder.scheduled_for)}</td><td className="px-3 py-3"><span className={`rounded-full px-2 py-1 text-xs font-semibold ${reminder.status === 'sent' ? 'bg-teal-50 text-teal-800' : reminder.status === 'failed' ? 'bg-rose-50 text-rose-800' : reminder.status === 'skipped' ? 'bg-amber-50 text-amber-800' : 'bg-slate-100 text-slate-700'}`}>{reminder.status}</span></td><td className="px-3 py-3 text-xs text-slate-500">{reminder.provider_message_id || reminder.failure_reason || 'Pending delivery'}</td></tr>)}{!loading && filteredReminders.length === 0 && <tr><td colSpan={5} className="px-3 py-8 text-center text-sm text-slate-500">{search || statusFilter !== 'all' ? 'No reminders match the current filters.' : 'No reminders queued yet.'}</td></tr>}</tbody></table></div>
    </section>
  );
};

export const ServiceClientsPanel = ({ clients, loading }) => {
  const [search, setSearch] = React.useState('');
  const [segment, setSegment] = React.useState('all');
  const filteredClients = [...clients]
    .filter((client) => segment === 'all' || (segment === 'repeat' ? client.repeat_client : !client.repeat_client))
    .filter((client) => {
      const query = search.trim().toLowerCase();
      if (!query) return true;
      return [client.customer_name, client.customer_email, client.customer_phone, client.last_service_name]
        .some((value) => String(value || '').toLowerCase().includes(query));
    })
    .sort((left, right) => Number(right.total_spend || 0) - Number(left.total_spend || 0));
  const repeatCount = clients.filter((client) => client.repeat_client).length;

  return <section className="rounded-lg border border-slate-200 bg-white"><div className="space-y-3 border-b border-slate-200 p-4"><div className="flex flex-wrap items-start justify-between gap-2"><div><h2 className="text-lg font-semibold text-slate-950">Clients</h2><p className="text-sm text-slate-500">Repeat bookings, no-shows, last service, and service-history signals.</p></div><div className="flex gap-2"><span className="rounded-full bg-slate-100 px-2 py-1 text-xs font-bold text-slate-600">{clients.length} clients</span><span className="rounded-full bg-teal-50 px-2 py-1 text-xs font-bold text-teal-800">{repeatCount} repeat</span></div></div><div className="grid gap-2 sm:grid-cols-[minmax(0,1fr)_200px]"><input aria-label="Search service clients" value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search client, contact, or last service" className={inputClass} /><select aria-label="Filter client segment" value={segment} onChange={(event) => setSegment(event.target.value)} className={inputClass}><option value="all">All clients</option><option value="repeat">Repeat clients</option><option value="new">New clients</option></select></div></div><div className="overflow-x-auto"><table className="min-w-full divide-y divide-slate-200 text-sm"><thead className="bg-slate-50 text-left text-xs font-semibold uppercase tracking-normal text-slate-500"><tr><th className="px-3 py-2">Client</th><th className="px-3 py-2">Contact</th><th className="px-3 py-2">Bookings</th><th className="px-3 py-2">Retention</th><th className="px-3 py-2">Last Service</th><th className="px-3 py-2">Spend</th></tr></thead><tbody className="divide-y divide-slate-100">{filteredClients.map((client) => <tr key={client.client_key || client.customer_email || client.customer_phone}><td className="px-3 py-3 font-semibold text-slate-900">{client.customer_name || 'Client'}</td><td className="px-3 py-3 text-slate-600">{client.customer_email || client.customer_phone || 'No contact'}</td><td className="px-3 py-3 text-slate-600">{client.booking_count} total &middot; {client.completed_count} completed &middot; {client.no_show_count} no-show</td><td className="px-3 py-3 text-slate-600"><span className={`rounded-full px-2 py-1 text-xs font-semibold ${client.repeat_client ? 'bg-teal-50 text-teal-800' : 'bg-slate-100 text-slate-600'}`}>{client.repeat_client ? 'Repeat' : 'New'}</span><div className="mt-1 text-xs text-slate-500">{Math.round(Number(client.no_show_rate || 0) * 100)}% no-show rate</div></td><td className="px-3 py-3 text-slate-600">{client.last_service_name || 'Service'} &middot; {formatDateTime(client.last_booking_at)}</td><td className="px-3 py-3 font-semibold text-slate-900">{money(client.total_spend)}</td></tr>)}{!loading && filteredClients.length === 0 && <tr><td colSpan={6} className="px-3 py-8 text-center text-sm text-slate-500">{search || segment !== 'all' ? 'No clients match the current filters.' : 'No service clients yet.'}</td></tr>}</tbody></table></div></section>;
};
