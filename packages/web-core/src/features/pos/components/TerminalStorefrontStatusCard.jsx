import React, { useEffect, useMemo, useState } from 'react';
import {
  AlertCircle,
  CalendarDays,
  CheckCircle2,
  Clock,
  ExternalLink,
  MapPin,
  Store,
  Truck
} from 'lucide-react';
import {
  formatStorefrontBusinessHoursDisplay,
  normalizeStorefrontBusinessHours,
  STOREFRONT_BUSINESS_DAY_OPTIONS
} from '@/src/features/settings/storefrontBusinessHours.js';

const DAY_KEYS = STOREFRONT_BUSINESS_DAY_OPTIONS.map((day) => day.key);

const toMinutes = (value) => {
  const [hour, minute] = String(value || '').split(':').map(Number);
  if (!Number.isInteger(hour) || !Number.isInteger(minute)) return null;
  return (hour * 60) + minute;
};

const formatTime = (value) => {
  const minutes = toMinutes(value);
  if (minutes == null) return '';
  const hour24 = Math.floor(minutes / 60);
  const meridiem = hour24 >= 12 ? 'PM' : 'AM';
  const hour12 = hour24 % 12 || 12;
  return `${hour12}:${String(minutes % 60).padStart(2, '0')} ${meridiem}`;
};

const formatInterval = (interval = {}) => (
  interval.open === interval.close
    ? '24 hours'
    : `${formatTime(interval.open)} – ${formatTime(interval.close)}`
);

const getZonedTimeParts = (date, timezone) => {
  try {
    const parts = new Intl.DateTimeFormat('en-US', {
      timeZone: timezone,
      weekday: 'short',
      hour: '2-digit',
      minute: '2-digit',
      hourCycle: 'h23'
    }).formatToParts(date).reduce((result, part) => {
      if (part.type !== 'literal') result[part.type] = part.value;
      return result;
    }, {});
    return {
      dayKey: String(parts.weekday || '').slice(0, 3).toLowerCase(),
      minutes: (Number(parts.hour) * 60) + Number(parts.minute)
    };
  } catch {
    const dayKey = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'][date.getDay()];
    return {
      dayKey,
      minutes: (date.getHours() * 60) + date.getMinutes()
    };
  }
};

const isWithinInterval = (minutes, interval = {}) => {
  const open = toMinutes(interval.open);
  const close = toMinutes(interval.close);
  if (open == null || close == null) return false;
  if (open === close) return true;
  if (close > open) return minutes >= open && minutes < close;
  return minutes >= open || minutes < close;
};

const isOpenFromPreviousDay = (schedule, dayKey, minutes) => {
  const dayIndex = DAY_KEYS.indexOf(dayKey);
  if (dayIndex < 0) return false;
  const previousDay = schedule.weekly?.[DAY_KEYS[(dayIndex + DAY_KEYS.length - 1) % DAY_KEYS.length]];
  if (!previousDay?.enabled) return false;
  return (previousDay.intervals || []).some((interval) => {
    const open = toMinutes(interval.open);
    const close = toMinutes(interval.close);
    return open != null && close != null && close < open && minutes < close;
  });
};

export const getStorefrontHoursStatus = (hours, now = new Date()) => {
  const schedule = normalizeStorefrontBusinessHours(hours);
  const { dayKey, minutes } = getZonedTimeParts(now, schedule.timezone);
  const today = schedule.weekly?.[dayKey];
  const isOpen = Boolean(
    (today?.enabled && (today.intervals || []).some((interval) => isWithinInterval(minutes, interval)))
    || isOpenFromPreviousDay(schedule, dayKey, minutes)
  );
  const dayLabel = STOREFRONT_BUSINESS_DAY_OPTIONS.find((day) => day.key === dayKey)?.label || dayKey;

  return {
    schedule,
    dayKey,
    dayLabel,
    today,
    isOpen,
    todayDisplay: today?.enabled
      ? (today.intervals || []).map(formatInterval).join(' · ')
      : 'Closed',
    display: formatStorefrontBusinessHoursDisplay(schedule)
  };
};

const resolveLocation = (locations, locationId) => {
  const normalizedId = Number(locationId);
  if (!Number.isInteger(normalizedId) || normalizedId <= 0) return null;
  return (Array.isArray(locations) ? locations : []).find((location) => (
    Number(location?.location_id || location?.id) === normalizedId
  )) || null;
};

const resolveStatus = ({ storeIsVisible, location, hoursStatus }) => {
  if (!storeIsVisible) {
    return {
      key: 'unpublished',
      label: 'Not published',
      description: 'Customers cannot see this Storefront.'
    };
  }
  if (!location) {
    return {
      key: 'unassigned',
      label: 'No branch assigned',
      description: 'Assign a Storefront location in Back Office.'
    };
  }
  if (location.is_active === false) {
    return {
      key: 'inactive',
      label: 'Branch inactive',
      description: 'This branch is not available to customers.'
    };
  }
  if (location.is_open === false) {
    return {
      key: 'branch_closed',
      label: 'Branch closed',
      description: 'The branch is manually marked closed.'
    };
  }
  return hoursStatus.isOpen
    ? { key: 'open', label: 'Open now', description: 'Storefront orders can be received during this window.' }
    : { key: 'closed', label: 'Closed now', description: 'Storefront orders are outside the current service window.' };
};

const STATUS_STYLES = {
  open: {
    badge: 'border-emerald-200 bg-emerald-50 text-emerald-800',
    panel: 'border-emerald-200 bg-emerald-50/70',
    icon: 'bg-emerald-100 text-emerald-700',
    dot: 'bg-emerald-500'
  },
  closed: {
    badge: 'border-amber-200 bg-amber-50 text-amber-800',
    panel: 'border-amber-200 bg-amber-50/70',
    icon: 'bg-amber-100 text-amber-700',
    dot: 'bg-amber-500'
  },
  branch_closed: {
    badge: 'border-amber-200 bg-amber-50 text-amber-800',
    panel: 'border-amber-200 bg-amber-50/70',
    icon: 'bg-amber-100 text-amber-700',
    dot: 'bg-amber-500'
  },
  unpublished: {
    badge: 'border-slate-200 bg-slate-100 text-slate-700',
    panel: 'border-slate-200 bg-slate-50',
    icon: 'bg-slate-200 text-slate-600',
    dot: 'bg-slate-400'
  },
  inactive: {
    badge: 'border-slate-200 bg-slate-100 text-slate-700',
    panel: 'border-slate-200 bg-slate-50',
    icon: 'bg-slate-200 text-slate-600',
    dot: 'bg-slate-400'
  },
  unassigned: {
    badge: 'border-blue-200 bg-blue-50 text-blue-800',
    panel: 'border-blue-200 bg-blue-50/70',
    icon: 'bg-blue-100 text-blue-700',
    dot: 'bg-blue-500'
  }
};

const accessLabel = (value) => {
  const normalized = String(value || '').trim().toLowerCase();
  if (normalized === 'transaction') return 'Orders enabled';
  if (normalized === 'catalog') return 'Catalog visible';
  return 'Customer access configured';
};

export default function TerminalStorefrontStatusCard({
  storefrontHours,
  storefrontLocations = [],
  locationId = null,
  storeIsVisible = false,
  customerAccessMode = 'catalog',
  loading = false,
  loadError = '',
  isOnline = true,
  canOpenBackOffice = false,
  onOpenBackOffice = () => {},
  description = 'Read-only view of the Storefront schedule and branch availability for this terminal.',
  managementMessage = 'Managed by your account admin',
  now = null
}) {
  const [clock, setClock] = useState(() => new Date());
  useEffect(() => {
    if (now) return undefined;
    const timer = window.setInterval(() => setClock(new Date()), 60_000);
    return () => window.clearInterval(timer);
  }, [now]);
  const hoursStatus = useMemo(
    () => getStorefrontHoursStatus(storefrontHours, now || clock),
    [clock, now, storefrontHours]
  );
  const location = useMemo(
    () => resolveLocation(storefrontLocations, locationId),
    [locationId, storefrontLocations]
  );
  const status = resolveStatus({ storeIsVisible, location, hoursStatus });
  const statusStyles = STATUS_STYLES[status.key] || STATUS_STYLES.unpublished;
  const branchName = String(location?.name || location?.location_name || '').trim() || 'Assigned Storefront branch';
  const channels = [
    location?.supports_pickup === true ? 'Pickup' : null,
    location?.supports_delivery === true ? 'Delivery' : null,
    location?.supports_dine_in === true ? 'Dine-in' : null
  ].filter(Boolean);

  if (loading) {
    return (
      <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm shadow-slate-200/40" data-testid="pos-terminal-storefront-status-loading" aria-busy="true">
        <div className="flex items-center gap-3">
          <div className="h-11 w-11 animate-pulse rounded-xl bg-slate-100" />
          <div className="min-w-0 flex-1 space-y-2">
            <div className="h-4 w-48 animate-pulse rounded bg-slate-100" />
            <div className="h-3 w-72 max-w-full animate-pulse rounded bg-slate-100" />
          </div>
        </div>
        <div className="mt-5 h-24 animate-pulse rounded-xl bg-slate-50" />
      </section>
    );
  }

  return (
    <section
      className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm shadow-slate-200/40"
      data-testid="pos-terminal-storefront-status"
      aria-labelledby="pos-terminal-storefront-status-title"
    >
      <div className="flex flex-col gap-4 border-b border-slate-100 pb-4 sm:flex-row sm:items-start sm:justify-between">
        <div className="flex min-w-0 items-start gap-3">
          <div className="grid h-11 w-11 shrink-0 place-items-center rounded-xl bg-teal-50 text-teal-700">
            <Store className="h-5 w-5" aria-hidden="true" />
          </div>
          <div className="min-w-0">
            <h3 id="pos-terminal-storefront-status-title" className="text-[15px] font-bold text-slate-800">Storefront service status</h3>
            {description ? <p className="mt-1 max-w-2xl text-[12px] leading-5 text-slate-500">{description}</p> : null}
          </div>
        </div>
        <span className={`inline-flex w-fit shrink-0 items-center gap-2 rounded-full border px-3 py-1.5 text-[11px] font-extrabold ${statusStyles.badge}`} data-testid="pos-terminal-storefront-status-badge">
          <span className={`h-2 w-2 rounded-full ${statusStyles.dot}`} aria-hidden="true" />
          {status.label}
        </span>
      </div>

      <div className="mt-4 grid gap-4 lg:grid-cols-[minmax(0,0.85fr)_minmax(0,1.15fr)]">
        <div className={`rounded-xl border p-4 ${statusStyles.panel}`}>
          <div className="flex items-start gap-3">
            <div className={`grid h-9 w-9 shrink-0 place-items-center rounded-lg ${statusStyles.icon}`}>
              {status.key === 'open' ? <CheckCircle2 className="h-5 w-5" aria-hidden="true" /> : <AlertCircle className="h-5 w-5" aria-hidden="true" />}
            </div>
            <div className="min-w-0">
              <p className="text-[11px] font-extrabold uppercase tracking-wide text-slate-500">Storefront now</p>
              <p className="mt-1 text-sm font-black text-slate-900">{status.description}</p>
              <div className="mt-3 flex items-center gap-2 text-xs font-semibold text-slate-700">
                <MapPin className="h-4 w-4 shrink-0 text-slate-500" aria-hidden="true" />
                <span className="truncate" title={branchName}>{branchName}</span>
              </div>
              <div className="mt-2 flex items-center gap-2 text-xs font-semibold text-slate-700">
                <Clock className="h-4 w-4 shrink-0 text-slate-500" aria-hidden="true" />
                <span>{hoursStatus.dayLabel}: {hoursStatus.todayDisplay}</span>
              </div>
            </div>
          </div>
        </div>

        <div className="grid gap-3 rounded-xl border border-slate-200 bg-slate-50/70 p-4">
          <div className="flex items-start gap-3">
            <CalendarDays className="mt-0.5 h-4 w-4 shrink-0 text-[#1A4E8D]" aria-hidden="true" />
            <div className="min-w-0">
              <p className="text-[11px] font-extrabold uppercase tracking-wide text-slate-500">Weekly schedule</p>
              <p className="mt-1 text-sm font-bold leading-5 text-slate-800" data-testid="pos-terminal-storefront-hours">
                {hoursStatus.display}
              </p>
              <p className="mt-1 text-[11px] font-medium text-slate-500">Timezone: {hoursStatus.schedule.timezone}</p>
            </div>
          </div>
          <div className="flex flex-wrap gap-2" aria-label="Storefront availability">
            <span className="inline-flex items-center gap-1.5 rounded-full border border-slate-200 bg-white px-2.5 py-1 text-[11px] font-bold text-slate-700">
              <Store className="h-3.5 w-3.5 text-teal-700" aria-hidden="true" />
              {accessLabel(customerAccessMode)}
            </span>
            {channels.length > 0 ? channels.map((channel) => (
              <span key={channel} className="inline-flex items-center gap-1.5 rounded-full border border-slate-200 bg-white px-2.5 py-1 text-[11px] font-bold text-slate-700">
                {channel === 'Delivery' ? <Truck className="h-3.5 w-3.5 text-[#1A4E8D]" aria-hidden="true" /> : <Store className="h-3.5 w-3.5 text-[#1A4E8D]" aria-hidden="true" />}
                {channel}
              </span>
            )) : (
              <span className="text-[11px] font-medium text-slate-500">No branch channels configured.</span>
            )}
          </div>
        </div>
      </div>

      <div className="mt-4 flex flex-col gap-3 rounded-xl border border-blue-100 bg-blue-50/60 p-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="min-w-0">
          <p className="text-[12px] font-bold text-blue-950">One source of truth</p>
          <p className="mt-1 text-[11px] leading-5 text-blue-900/75">
            {isOnline ? 'This snapshot is synced from Storefront settings.' : 'You are offline. Showing the last loaded Storefront settings.'}
          </p>
          {loadError ? <p className="mt-1 text-[11px] font-semibold text-amber-800">{loadError}</p> : null}
        </div>
        {canOpenBackOffice ? (
          <button
            type="button"
            className="inline-flex h-10 shrink-0 items-center justify-center gap-2 rounded-xl bg-[#1A4E8D] px-4 text-xs font-extrabold text-white shadow-sm transition hover:bg-[#143F73] focus:outline-none focus:ring-2 focus:ring-blue-500/30"
            onClick={() => onOpenBackOffice({ path: '/backoffice/settings/storefront' })}
            data-testid="pos-terminal-storefront-manage"
          >
            Manage in Back Office
            <ExternalLink className="h-4 w-4" aria-hidden="true" />
          </button>
        ) : (
          managementMessage ? (
            <span className="inline-flex items-center gap-2 text-[11px] font-bold text-blue-900">
              <span className="h-2 w-2 rounded-full bg-blue-500" aria-hidden="true" />
              {managementMessage}
            </span>
          ) : null
        )}
      </div>
    </section>
  );
}
