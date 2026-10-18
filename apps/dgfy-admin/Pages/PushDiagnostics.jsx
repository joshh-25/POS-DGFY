import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { AlertTriangle, BellRing, CheckCircle2, Clock3, RefreshCw, ShieldCheck, ShieldX } from 'lucide-react';
import { Button } from '@/components/ui/button';
import ConfirmActionDialog from '@/components/ui/ConfirmActionDialog';
import { toast } from 'sonner';
import * as adminService from '@/services/adminService';

const STALE_AFTER_MS = 5 * 60 * 1000;

const EMPTY_OVERVIEW = {
    environment: { label: 'unknown', source: 'unset' },
    readiness: {},
    registrations: [],
    outcomes: {
        last_24h: { deliveries: [], dispatch_events: [] },
        last_7d: { deliveries: [], dispatch_events: [] }
    }
};

const DELIVERY_STATE_LABELS = Object.freeze({
    no_provider: 'No provider configured',
    pending_dispatch: 'Pending dispatch',
    send_failed: 'Send failed',
    rejected_by_expo: 'Rejected by Expo',
    accepted_receipt_pending: 'Accepted by Expo · Receipt pending',
    receipt_ok: 'Receipt OK',
    receipt_error: 'Receipt error',
    receipt_other: 'Receipt status unknown'
});

const STATE_STYLES = {
    no_provider: 'border-amber-200 bg-amber-50 text-amber-800',
    pending_dispatch: 'border-sky-200 bg-sky-50 text-sky-800',
    send_failed: 'border-rose-200 bg-rose-50 text-rose-800',
    rejected_by_expo: 'border-rose-200 bg-rose-50 text-rose-800',
    accepted_receipt_pending: 'border-amber-200 bg-amber-50 text-amber-800',
    receipt_ok: 'border-emerald-200 bg-emerald-50 text-emerald-800',
    receipt_error: 'border-rose-200 bg-rose-50 text-rose-800',
    receipt_other: 'border-slate-200 bg-slate-50 text-slate-700',
    active: 'border-emerald-200 bg-emerald-50 text-emerald-800',
    revoked: 'border-slate-200 bg-slate-50 text-slate-700',
    dispatched: 'border-emerald-200 bg-emerald-50 text-emerald-800',
    skipped: 'border-amber-200 bg-amber-50 text-amber-800',
    suppressed: 'border-amber-200 bg-amber-50 text-amber-800',
    failed: 'border-rose-200 bg-rose-50 text-rose-800'
};

const environmentTone = (label) => {
    const normalized = String(label || 'unknown').toLowerCase();
    if (normalized === 'production' || normalized === 'prod') return 'border-rose-300 bg-rose-50 text-rose-950';
    if (normalized === 'staging' || normalized === 'stage') return 'border-amber-300 bg-amber-50 text-amber-950';
    if (normalized === 'unknown' || !normalized) return 'border-amber-300 bg-amber-50 text-amber-950';
    return 'border-sky-200 bg-sky-50 text-sky-950';
};

const formatLabel = (value) => String(value || 'unknown')
    .replace(/_/g, ' ')
    .replace(/\b\w/g, (character) => character.toUpperCase());

const formatDate = (value) => {
    if (!value) return '—';
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return 'Unknown';
    return date.toLocaleString();
};

const formatError = (error) => {
    const response = error?.response;
    const message = response?.data?.message || response?.data?.error || error?.message;
    if (response?.status === 429 && !message) return 'Rate limit reached. Wait before trying again.';
    return message || 'The request could not be completed. Refresh the page and try again.';
};

const statusLabel = (state) => DELIVERY_STATE_LABELS[state] || formatLabel(state);

const StatusBadge = ({ value, label }) => (
    <span className={'inline-flex max-w-full items-center rounded-md border px-2 py-1 text-xs font-semibold ' + (STATE_STYLES[value] || 'border-slate-200 bg-slate-50 text-slate-700')}>
        {label || formatLabel(value)}
    </span>
);

const EmptyRow = ({ columns, children }) => (
    <tr>
        <td colSpan={columns} className="px-4 py-8 text-center text-sm text-slate-500">{children}</td>
    </tr>
);

const countTotal = (rows) => (rows || []).reduce((total, row) => total + Number(row.count || 0), 0);

const deliveryCountLabel = (row) => {
    if (row.simulated) return 'Simulated';
    const labels = {
        unconfigured: 'No provider configured',
        pending: 'Pending',
        accepted: 'Accepted by Expo',
        rejected: 'Rejected by Expo',
        failed: 'Send failed'
    };
    return labels[row.status] || formatLabel(row.status);
};

const ReadinessIndicator = ({ label, ready, detail }) => (
    <div className="flex min-w-0 items-start gap-3 rounded-lg border border-slate-200 bg-white px-3 py-3">
        {ready
            ? <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-emerald-600" aria-hidden="true" />
            : <ShieldX className="mt-0.5 h-4 w-4 shrink-0 text-amber-600" aria-hidden="true" />}
        <div className="min-w-0 flex-1">
            <p className="text-sm font-semibold text-slate-900">{label}</p>
            <p className={'mt-1 text-xs font-medium ' + (ready ? 'text-emerald-700' : 'text-amber-800')}>
                {ready ? 'Present / enabled' : 'Missing / disabled'}
            </p>
            {detail ? <p className="mt-1 break-words text-xs leading-5 text-slate-500">{detail}</p> : null}
        </div>
    </div>
);

const CountGroup = ({ title, deliveries, dispatchEvents }) => {
    const deliveryRows = deliveries || [];
    const eventRows = dispatchEvents || [];
    return (
        <section className="rounded-lg border border-slate-200 bg-white p-4 sm:p-5">
            <div className="flex items-start justify-between gap-3">
                <div>
                    <h3 className="text-sm font-semibold text-slate-900">{title}</h3>
                    <p className="mt-1 text-xs text-slate-500">Provider attempts and dispatch decisions</p>
                </div>
                <div className="text-right">
                    <p className="text-2xl font-bold tabular-nums text-slate-950">{countTotal(deliveryRows) + countTotal(eventRows)}</p>
                    <p className="text-xs text-slate-500">records</p>
                </div>
            </div>
            <div className="mt-4 grid gap-4 sm:grid-cols-2">
                <div>
                    <h4 className="text-xs font-semibold uppercase tracking-wide text-slate-500">Delivery attempts</h4>
                    {deliveryRows.length ? (
                        <ul className="mt-2 space-y-2">
                            {deliveryRows.map((row, index) => (
                                <li key={row.status + '-' + row.purpose + '-' + String(row.simulated) + '-' + index} className="flex items-start justify-between gap-3 text-sm">
                                    <span className="min-w-0 break-words text-slate-700">{deliveryCountLabel(row)} <span className="text-slate-500">· {formatLabel(row.purpose)}</span></span>
                                    <span className="shrink-0 font-semibold tabular-nums text-slate-900">{Number(row.count || 0)}</span>
                                </li>
                            ))}
                        </ul>
                    ) : <p className="mt-2 text-sm text-slate-500">No delivery attempts.</p>}
                </div>
                <div>
                    <h4 className="text-xs font-semibold uppercase tracking-wide text-slate-500">Dispatch decisions</h4>
                    {eventRows.length ? (
                        <ul className="mt-2 space-y-2">
                            {eventRows.map((row, index) => (
                                <li key={row.outcome + '-' + row.reason_code + '-' + row.purpose + '-' + index} className="flex items-start justify-between gap-3 text-sm">
                                    <span className="min-w-0 break-words text-slate-700">{formatLabel(row.reason_code || row.outcome)} <span className="text-slate-500">· {formatLabel(row.purpose)}</span></span>
                                    <span className="shrink-0 font-semibold tabular-nums text-slate-900">{Number(row.count || 0)}</span>
                                </li>
                            ))}
                        </ul>
                    ) : <p className="mt-2 text-sm text-slate-500">No dispatch decisions.</p>}
                </div>
            </div>
        </section>
    );
};

export default function PushDiagnostics() {
    const [overview, setOverview] = useState(null);
    const [registrations, setRegistrations] = useState([]);
    const [attempts, setAttempts] = useState([]);
    const [dispatchEvents, setDispatchEvents] = useState([]);
    const [diagnosticDevices, setDiagnosticDevices] = useState([]);
    const [loading, setLoading] = useState(true);
    const [loadedAt, setLoadedAt] = useState(null);
    const [clockTick, setClockTick] = useState(Date.now());
    const [loadError, setLoadError] = useState('');
    const [actionError, setActionError] = useState('');
    const [registrationFilter, setRegistrationFilter] = useState('all');
    const [windowHours, setWindowHours] = useState('24');
    const [selectedDeviceId, setSelectedDeviceId] = useState('');
    const [generatedCode, setGeneratedCode] = useState(null);
    const [confirmation, setConfirmation] = useState(null);
    const [busyAction, setBusyAction] = useState('');

    const loadData = useCallback(async () => {
        setLoading(true);
        setLoadError('');
        try {
            const [nextOverview, registrationResponse, attemptResponse, deviceResponse] = await Promise.all([
                adminService.getPushDiagnosticsOverview(),
                adminService.listPushDiagnosticsRegistrations({ state: registrationFilter }),
                adminService.listPushDiagnosticsAttempts({ window_hours: Number(windowHours) }),
                adminService.listPushDiagnosticDevices()
            ]);
            setOverview(nextOverview || EMPTY_OVERVIEW);
            setRegistrations(registrationResponse?.items || []);
            setAttempts(attemptResponse?.deliveries || []);
            setDispatchEvents(attemptResponse?.dispatch_events || []);
            setDiagnosticDevices(deviceResponse?.items || []);
            setLoadedAt(Date.now());
        } catch (error) {
            setLoadError(formatError(error));
        } finally {
            setLoading(false);
        }
    }, [registrationFilter, windowHours]);

    useEffect(() => {
        loadData();
    }, [loadData]);

    useEffect(() => {
        const timer = setInterval(() => setClockTick(Date.now()), 30000);
        return () => clearInterval(timer);
    }, []);

    const environment = overview?.environment || EMPTY_OVERVIEW.environment;
    const readiness = overview?.readiness || {};
    const outcomes = overview?.outcomes || EMPTY_OVERVIEW.outcomes;
    const activeDevices = useMemo(
        () => diagnosticDevices.filter((device) => device.state === 'active'),
        [diagnosticDevices]
    );
    const selectedTestDevice = activeDevices.find((device) => String(device.id) === String(selectedDeviceId)) || null;
    useEffect(() => {
        if (!activeDevices.some((device) => String(device.id) === String(selectedDeviceId))) {
            setSelectedDeviceId(activeDevices[0]?.id || '');
        }
    }, [activeDevices, selectedDeviceId]);
    const hasSnapshot = Boolean(overview);
    const stale = loadedAt ? clockTick - loadedAt > STALE_AFTER_MS : false;
    const busy = Boolean(busyAction) || loading;

    const updateRegistrationFilter = (event) => setRegistrationFilter(event.target.value);
    const updateWindowHours = (event) => setWindowHours(event.target.value);

    const generateEnrollmentCode = async () => {
        setActionError('');
        setBusyAction('enrollment-code');
        try {
            const result = await adminService.createPushDiagnosticEnrollmentCode();
            setGeneratedCode(result);
            toast.success('Enrollment code created. It will not be shown again after you dismiss it or leave this page.');
        } catch (error) {
            const message = formatError(error);
            setActionError(message);
            toast.error(message);
        } finally {
            setBusyAction('');
        }
    };

    const confirmDeviceAction = async () => {
        if (!confirmation) return false;
        const current = confirmation;
        const actionKey = current.type + ':' + current.device.id;
        setActionError('');
        setBusyAction(actionKey);
        try {
            if (current.type === 'send') {
                const result = await adminService.sendPushDiagnosticTest(current.device.id);
                const receiptText = result?.state ? statusLabel(result.state) : 'Request accepted for processing';
                const modeText = result?.simulated ? ' (simulated; no provider send)' : '';
                toast.success(receiptText + modeText + '.');
            } else {
                await adminService.revokePushDiagnosticDevice(current.device.id);
                toast.success('Diagnostic device revoked.');
            }
            setConfirmation(null);
            await loadData();
            return true;
        } catch (error) {
            const message = formatError(error);
            setActionError(message);
            toast.error(message);
            return { success: false, message };
        } finally {
            setBusyAction('');
        }
    };

    const requestDialogOpenChange = (open) => {
        if (!open) setConfirmation(null);
    };

    const confirmedLabel = confirmation?.type === 'send' ? 'Send test notification' : 'Revoke device';
    const confirmationTitle = confirmation?.type === 'send' ? 'Send a diagnostic test notification?' : 'Revoke this diagnostic device?';
    const confirmationDescription = confirmation?.type === 'send'
        ? 'This sends fixed generic copy to the enrolled diagnostic device only. The API request contains no token or message body.'
        : 'This device will no longer be eligible for diagnostic test notifications.';

    return (
        <main className="mx-auto w-full max-w-7xl space-y-6 p-4 sm:p-6 lg:p-8">
            <header className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
                <div className="flex items-start gap-3">
                    <div className="rounded-xl bg-slate-900 p-3 text-white"><BellRing className="h-5 w-5" aria-hidden="true" /></div>
                    <div>
                        <h1 className="text-2xl font-bold text-slate-950">Push Diagnostics</h1>
                        <p className="mt-1 max-w-2xl text-sm leading-6 text-slate-600">Trace registration, dispatch, Expo acceptance, and receipt processing for this Platform Admin environment.</p>
                    </div>
                </div>
                <Button type="button" variant="outline" onClick={loadData} disabled={loading}>
                    <RefreshCw className={'mr-2 h-4 w-4 ' + (loading ? 'animate-spin' : '')} aria-hidden="true" />
                    {loading ? 'Refreshing…' : 'Refresh'}
                </Button>
            </header>

            <section className={'rounded-xl border px-4 py-4 sm:px-5 ' + environmentTone(environment.label)} aria-label="Connected environment">
                <div className="flex items-start gap-3">
                    {environment.label === 'production' || environment.label === 'prod'
                        ? <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0" aria-hidden="true" />
                        : environment.label === 'unknown'
                            ? <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0" aria-hidden="true" />
                            : <ShieldCheck className="mt-0.5 h-5 w-5 shrink-0" aria-hidden="true" />}
                    <div className="min-w-0">
                        <p className="text-sm font-bold uppercase tracking-wide">{String(environment.label || 'unknown')} environment</p>
                        <p className="mt-1 text-sm leading-5">This page reads only the connected API environment.</p>
                        {environment.label === 'unknown' ? <p className="mt-1 text-sm font-medium">Set DEPLOY_ENV_LABEL in the API environment file to identify this deployment.</p> : null}
                    </div>
                </div>
            </section>

            {loadError ? (
                <div role="alert" className="rounded-lg border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-800">
                    <p className="font-semibold">Could not refresh push diagnostics.</p>
                    <p className="mt-1">{loadError}</p>
                    {hasSnapshot ? <p className="mt-1">Showing the last successful snapshot from {formatDate(overview?.generated_at || loadedAt)}.</p> : null}
                </div>
            ) : null}
            {stale && !loadError ? (
                <div role="status" className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
                    This snapshot is more than five minutes old. Refresh before using it to diagnose a live issue.
                </div>
            ) : null}

            {!hasSnapshot && loading ? <p className="rounded-lg border border-slate-200 bg-white p-5 text-sm text-slate-500">Loading push diagnostics…</p> : null}

            {hasSnapshot ? (
                <>
                    <section className="space-y-3" aria-labelledby="readiness-heading">
                        <div className="flex flex-col gap-1 sm:flex-row sm:items-end sm:justify-between">
                            <div>
                                <h2 id="readiness-heading" className="text-lg font-bold text-slate-950">Provider readiness</h2>
                                <p className="text-sm text-slate-500">Presence indicators only. Secret values are never displayed.</p>
                            </div>
                            <div className="text-sm text-slate-600">Effective mode: <span className="font-semibold text-slate-900">{formatLabel(readiness.provider?.effective_mode)}</span></div>
                        </div>
                        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
                            <ReadinessIndicator label="Expo access token" ready={readiness.expo_access_token_present === true} />
                            <ReadinessIndicator label="Push token hash secret" ready={readiness.token_hash_secret_present === true && readiness.token_hash_ready === true} />
                            <ReadinessIndicator label="Guest push proof secret" ready={readiness.guest_proof_secret_present === true} />
                            <ReadinessIndicator label="Delivery log" ready={readiness.delivery_log_enabled === true} />
                            <ReadinessIndicator label="Retention cleanup" ready={readiness.retention_enabled === true} />
                            <ReadinessIndicator label="Receipt scheduler" ready={readiness.receipt_scheduler?.scheduled === true} detail={readiness.receipt_scheduler?.last_cycle_completed_at ? 'Last cycle: ' + formatDate(readiness.receipt_scheduler.last_cycle_completed_at) : ''} />
                        </div>
                        {readiness.provider?.fake_blocked_in_production ? <p className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-900">Fake provider mode is blocked in production. No test send is made through the fake adapter.</p> : null}
                    </section>

                    <section className="grid gap-4 lg:grid-cols-2" aria-label="Recent outcome counts">
                        <CountGroup title="Last 24 hours" deliveries={outcomes.last_24h?.deliveries} dispatchEvents={outcomes.last_24h?.dispatch_events} />
                        <CountGroup title="Last 7 days" deliveries={outcomes.last_7d?.deliveries} dispatchEvents={outcomes.last_7d?.dispatch_events} />
                    </section>

                    <section className="rounded-xl border border-slate-200 bg-white p-4 sm:p-5" aria-labelledby="registrations-heading">
                        <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
                            <div>
                                <h2 id="registrations-heading" className="text-lg font-bold text-slate-950">Push registrations</h2>
                                <p className="mt-1 text-sm text-slate-500">Pseudonymous references only; no device tokens or customer details.</p>
                            </div>
                            <label className="grid gap-1 text-xs font-semibold text-slate-600">
                                Registration state
                                <select className="h-10 min-w-40 rounded-lg border border-slate-300 bg-white px-3 text-sm text-slate-900" value={registrationFilter} onChange={updateRegistrationFilter}>
                                    <option value="all">All states</option>
                                    <option value="active">Active</option>
                                    <option value="revoked">Revoked</option>
                                </select>
                            </label>
                        </div>
                        <div className="mt-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
                            {(overview.registrations || []).map((summary, index) => (
                                <div key={summary.app + '-' + summary.brand + '-' + summary.platform + '-' + index} className="rounded-lg border border-slate-200 bg-slate-50 p-3">
                                    <p className="text-sm font-semibold text-slate-900">{summary.app} · {summary.brand} · {formatLabel(summary.platform)}</p>
                                    <p className="mt-1 text-sm text-slate-600">{Number(summary.active || 0)} active · {Number(summary.revoked || 0)} revoked · {Number(summary.total || 0)} total</p>
                                    <p className="mt-1 text-xs text-slate-500">Last seen: {formatDate(summary.last_seen_at)}</p>
                                </div>
                            ))}
                            {(!overview.registrations || overview.registrations.length === 0) ? <p className="rounded-lg border border-dashed border-slate-300 px-4 py-5 text-sm text-slate-500 sm:col-span-2 xl:col-span-3">No push registration summary is available.</p> : null}
                        </div>
                        <div className="mt-4 overflow-x-auto rounded-lg border border-slate-200">
                            <table className="min-w-[760px] w-full text-left text-sm">
                                <thead className="bg-slate-50 text-xs uppercase tracking-wide text-slate-500"><tr><th className="px-3 py-3">Reference</th><th className="px-3 py-3">App / brand</th><th className="px-3 py-3">Platform</th><th className="px-3 py-3">Owner type</th><th className="px-3 py-3">State</th><th className="px-3 py-3">Last seen</th></tr></thead>
                                <tbody className="divide-y divide-slate-100">
                                    {registrations.map((row, index) => (
                                        <tr key={row.ref + '-' + index}>
                                            <td className="whitespace-nowrap px-3 py-3 font-mono text-xs text-slate-700">{row.ref || '—'}</td>
                                            <td className="px-3 py-3">{row.app || '—'} / {row.brand || '—'}</td>
                                            <td className="px-3 py-3">{formatLabel(row.platform)}</td>
                                            <td className="px-3 py-3">{formatLabel(row.owner_type)}</td>
                                            <td className="px-3 py-3"><StatusBadge value={row.state} /></td>
                                            <td className="whitespace-nowrap px-3 py-3 text-slate-600">{formatDate(row.last_seen_at)}</td>
                                        </tr>
                                    ))}
                                    {registrations.length === 0 ? <EmptyRow columns={6}>{loading ? 'Loading registrations…' : 'No registrations match this filter.'}</EmptyRow> : null}
                                </tbody>
                            </table>
                        </div>
                    </section>

                    <section className="rounded-xl border border-slate-200 bg-white p-4 sm:p-5" aria-labelledby="attempts-heading">
                        <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
                            <div>
                                <h2 id="attempts-heading" className="text-lg font-bold text-slate-950">Delivery attempts and dispatch decisions</h2>
                                <p className="mt-1 text-sm text-slate-500">Provider acceptance and receipt states do not confirm app display.</p>
                            </div>
                            <label className="grid gap-1 text-xs font-semibold text-slate-600">
                                Time window
                                <select className="h-10 min-w-40 rounded-lg border border-slate-300 bg-white px-3 text-sm text-slate-900" value={windowHours} onChange={updateWindowHours}>
                                    <option value="24">Last 24 hours</option>
                                    <option value="168">Last 7 days</option>
                                </select>
                            </label>
                        </div>
                        <div className="mt-4 flex flex-wrap gap-2" aria-label="Delivery state legend">
                            {Object.keys(DELIVERY_STATE_LABELS).map((state) => <StatusBadge key={state} value={state} label={statusLabel(state)} />)}
                        </div>
                        <div className="mt-4 overflow-x-auto rounded-lg border border-slate-200">
                            <table className="min-w-[900px] w-full text-left text-sm">
                                <thead className="bg-slate-50 text-xs uppercase tracking-wide text-slate-500"><tr><th className="px-3 py-3">Time</th><th className="px-3 py-3">Purpose</th><th className="px-3 py-3">State</th><th className="px-3 py-3">Provider error</th><th className="px-3 py-3">Registration ref</th><th className="px-3 py-3">Correlation ref</th></tr></thead>
                                <tbody className="divide-y divide-slate-100">
                                    {attempts.map((row, index) => (
                                        <tr key={row.registration_ref + '-' + row.sent_at + '-' + index}>
                                            <td className="whitespace-nowrap px-3 py-3 text-slate-600">{formatDate(row.sent_at)}</td>
                                            <td className="px-3 py-3">{formatLabel(row.purpose)}</td>
                                            <td className="px-3 py-3"><StatusBadge value={row.state} label={statusLabel(row.state)} /></td>
                                            <td className="px-3 py-3 font-mono text-xs text-slate-600">{row.error_code || '—'}</td>
                                            <td className="px-3 py-3 font-mono text-xs text-slate-600">{row.registration_ref || '—'}</td>
                                            <td className="px-3 py-3 font-mono text-xs text-slate-600">{row.correlation_ref || '—'}</td>
                                        </tr>
                                    ))}
                                    {attempts.length === 0 ? <EmptyRow columns={6}>{loading ? 'Loading delivery attempts…' : 'No delivery attempts in this window.'}</EmptyRow> : null}
                                </tbody>
                            </table>
                        </div>
                        <div className="mt-4 overflow-x-auto rounded-lg border border-slate-200">
                            <table className="min-w-[760px] w-full text-left text-sm">
                                <thead className="bg-slate-50 text-xs uppercase tracking-wide text-slate-500"><tr><th className="px-3 py-3">Time</th><th className="px-3 py-3">Outcome</th><th className="px-3 py-3">Reason code</th><th className="px-3 py-3">Eligible devices</th><th className="px-3 py-3">Correlation ref</th></tr></thead>
                                <tbody className="divide-y divide-slate-100">
                                    {dispatchEvents.map((row, index) => (
                                        <tr key={row.created_at + '-' + row.reason_code + '-' + index}>
                                            <td className="whitespace-nowrap px-3 py-3 text-slate-600">{formatDate(row.created_at)}</td>
                                            <td className="px-3 py-3"><StatusBadge value={row.outcome} /></td>
                                            <td className="px-3 py-3 font-mono text-xs text-slate-700">{row.reason_code || '—'}</td>
                                            <td className="px-3 py-3 tabular-nums">{Number(row.eligible_token_count || 0)}</td>
                                            <td className="px-3 py-3 font-mono text-xs text-slate-600">{row.correlation_ref || '—'}</td>
                                        </tr>
                                    ))}
                                    {dispatchEvents.length === 0 ? <EmptyRow columns={5}>{loading ? 'Loading dispatch decisions…' : 'No dispatch decisions in this window.'}</EmptyRow> : null}
                                </tbody>
                            </table>
                        </div>
                    </section>

                    <section className="rounded-xl border border-slate-200 bg-white p-4 sm:p-5" aria-labelledby="diagnostic-devices-heading">
                        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                            <div>
                                <h2 id="diagnostic-devices-heading" className="text-lg font-bold text-slate-950">Diagnostic devices</h2>
                                <p className="mt-1 max-w-3xl text-sm leading-6 text-slate-500">Only devices enrolled with a single-use code can receive a test notification. The device client must call <code className="rounded bg-slate-100 px-1 py-0.5 text-xs">POST /api/v1/push-diagnostics/enroll</code> with the code and its Expo token.</p>
                            </div>
                            <Button type="button" onClick={generateEnrollmentCode} disabled={busy}>
                                <Clock3 className="mr-2 h-4 w-4" aria-hidden="true" />
                                {busyAction === 'enrollment-code' ? 'Creating code…' : 'Generate enrollment code'}
                            </Button>
                        </div>

                        {generatedCode ? (
                            <div role="status" className="mt-4 rounded-lg border border-sky-200 bg-sky-50 p-4 text-sky-950">
                                <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                                    <div className="min-w-0">
                                        <p className="text-sm font-semibold">One-time enrollment code</p>
                                        <code className="mt-2 block break-all rounded-md border border-sky-200 bg-white px-3 py-2 font-mono text-lg font-bold tracking-wide">{generatedCode.code}</code>
                                        <p className="mt-2 text-sm">Expires: {formatDate(generatedCode.expires_at)}. This code is returned only once.</p>
                                    </div>
                                    <Button type="button" variant="outline" onClick={() => setGeneratedCode(null)}>Dismiss</Button>
                                </div>
                            </div>
                        ) : null}

                        {actionError ? <p role="alert" className="mt-4 rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-800">{actionError}</p> : null}
                        {!activeDevices.length ? <p className="mt-4 rounded-lg border border-amber-200 bg-amber-50 px-3 py-3 text-sm text-amber-900">No enrolled diagnostic device is available. Test notifications stay disabled until a mobile or POS client completes enrollment with a valid code.</p> : null}
                        <div className="mt-4 flex flex-col gap-2 sm:flex-row sm:items-end">
                            <label className="grid flex-1 gap-1 text-xs font-semibold text-slate-600">
                                Enrolled test device
                                <select
                                    aria-label="Enrolled test device"
                                    className="h-10 w-full rounded-lg border border-slate-300 bg-white px-3 text-sm text-slate-900"
                                    value={selectedTestDevice?.id || ''}
                                    onChange={(event) => setSelectedDeviceId(event.target.value)}
                                    disabled={!activeDevices.length || busy}
                                >
                                    {!activeDevices.length ? <option value="">No active diagnostic devices</option> : null}
                                    {activeDevices.map((device) => <option key={device.id} value={device.id}>{device.app} · {device.brand} · {formatLabel(device.platform)} · {device.ref}</option>)}
                                </select>
                            </label>
                            <Button
                                type="button"
                                disabled={!selectedTestDevice || busy}
                                onClick={() => { setActionError(''); setConfirmation({ type: 'send', device: selectedTestDevice }); }}
                            >
                                Send test notification
                            </Button>
                        </div>
                        <p className="mt-3 text-xs leading-5 text-slate-500">Test notifications use fixed generic copy and are rate limited per admin and per device. The API call targets the enrolled device id and sends no request body. Expo acceptance or a receipt result does not confirm app display.</p>

                        <div className="mt-4 overflow-x-auto rounded-lg border border-slate-200">
                            <table className="min-w-[900px] w-full text-left text-sm">
                                <thead className="bg-slate-50 text-xs uppercase tracking-wide text-slate-500"><tr><th className="px-3 py-3">Reference</th><th className="px-3 py-3">App / brand</th><th className="px-3 py-3">Platform</th><th className="px-3 py-3">State</th><th className="px-3 py-3">Last seen</th><th className="px-3 py-3">Actions</th></tr></thead>
                                <tbody className="divide-y divide-slate-100">
                                    {diagnosticDevices.map((device) => (
                                        <tr key={device.id}>
                                            <td className="whitespace-nowrap px-3 py-3 font-mono text-xs text-slate-700">{device.ref || '—'}</td>
                                            <td className="px-3 py-3">{device.app || '—'} / {device.brand || '—'}</td>
                                            <td className="px-3 py-3">{formatLabel(device.platform)}</td>
                                            <td className="px-3 py-3"><StatusBadge value={device.state} /></td>
                                            <td className="whitespace-nowrap px-3 py-3 text-slate-600">{formatDate(device.last_seen_at)}</td>
                                            <td className="px-3 py-3">
                                                <div className="flex flex-wrap gap-2">
                                                    <Button type="button" size="sm" variant="outline" disabled={device.state !== 'active' || busy} onClick={() => { setActionError(''); setConfirmation({ type: 'revoke', device }); }}>Revoke</Button>
                                                </div>
                                            </td>
                                        </tr>
                                    ))}
                                    {diagnosticDevices.length === 0 ? <EmptyRow columns={6}>{loading ? 'Loading diagnostic devices…' : 'No diagnostic devices have been enrolled.'}</EmptyRow> : null}
                                </tbody>
                            </table>
                        </div>
                        {diagnosticDevices.length > 0 && activeDevices.length === 0 ? <p className="mt-3 text-sm text-slate-500">All listed devices are revoked. Enroll a new diagnostic device to enable test notifications.</p> : null}
                    </section>
                </>
            ) : null}

            {confirmation ? (
                <ConfirmActionDialog
                    open={Boolean(confirmation)}
                    onOpenChange={requestDialogOpenChange}
                    title={confirmationTitle}
                    description={confirmationDescription}
                    confirmLabel={busyAction ? 'Working…' : confirmedLabel}
                    variant={confirmation.type === 'revoke' ? 'destructive' : 'default'}
                    onConfirm={confirmDeviceAction}
                />
            ) : null}
        </main>
    );
}
