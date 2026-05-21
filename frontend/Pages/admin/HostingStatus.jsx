import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
    Activity,
    AlertTriangle,
    CheckCircle2,
    Clock3,
    Copy,
    Database,
    FileText,
    HardDrive,
    History,
    LockKeyhole,
    PauseCircle,
    PlayCircle,
    RefreshCw,
    Server,
    ShieldAlert,
    ShieldCheck,
    WifiOff
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { getHostingStatus } from '@/services/hostingStatusService.js';
import { toast } from 'sonner';

const AUTO_REFRESH_MS = 30000;
const STALE_MS = 90000;
const HISTORY_LIMIT = 6;

const statusStyles = {
    healthy: 'border-emerald-200 bg-emerald-50 text-emerald-800',
    connected: 'border-emerald-200 bg-emerald-50 text-emerald-800',
    available: 'border-emerald-200 bg-emerald-50 text-emerald-800',
    distributed: 'border-emerald-200 bg-emerald-50 text-emerald-800',
    redis: 'border-emerald-200 bg-emerald-50 text-emerald-800',
    local: 'border-sky-200 bg-sky-50 text-sky-800',
    memory: 'border-amber-200 bg-amber-50 text-amber-800',
    optional_unavailable: 'border-amber-200 bg-amber-50 text-amber-800',
    single_instance: 'border-amber-200 bg-amber-50 text-amber-800',
    memory_fallback: 'border-rose-200 bg-rose-50 text-rose-800',
    single_instance_fallback: 'border-rose-200 bg-rose-50 text-rose-800',
    disconnected: 'border-amber-200 bg-amber-50 text-amber-800',
    degraded: 'border-rose-200 bg-rose-50 text-rose-800',
    error: 'border-rose-200 bg-rose-50 text-rose-800',
    fail_closed: 'border-emerald-200 bg-emerald-50 text-emerald-800',
    fail_open: 'border-amber-200 bg-amber-50 text-amber-800'
};

const formatLabel = (value) => String(value || 'unknown')
    .replace(/_/g, ' ')
    .replace(/\b\w/g, (char) => char.toUpperCase());

const CapabilityBadge = ({ value }) => (
    <span className={cn(
        'inline-flex items-center rounded-md border px-2 py-1 text-xs font-semibold',
        statusStyles[String(value || '').toLowerCase()] || 'border-slate-200 bg-slate-50 text-slate-700'
    )}>
        {formatLabel(value)}
    </span>
);

const CapabilityRow = ({ icon: Icon, label, value, detail }) => (
    <div className="flex items-start gap-3 rounded-lg border border-slate-200 bg-white px-4 py-3">
        <div className="mt-0.5 rounded-md bg-slate-100 p-2 text-slate-700">
            <Icon className="h-4 w-4" />
        </div>
        <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center justify-between gap-2">
                <p className="text-sm font-semibold text-slate-900">{label}</p>
                <CapabilityBadge value={value} />
            </div>
            {detail && <p className="mt-1 text-xs leading-5 text-slate-500">{detail}</p>}
        </div>
    </div>
);

const deriveOverallStatus = (health, statusCode) => {
    if (!health) return { label: 'Unavailable', tone: 'degraded', icon: WifiOff };
    if (health.success === true && statusCode < 500) return { label: 'Operational', tone: 'healthy', icon: ShieldCheck };
    return { label: 'Action Required', tone: 'degraded', icon: ShieldAlert };
};

const deriveOperatorActions = ({ health, capabilities, services }) => {
    if (!health) {
        return [
            'Confirm the backend process is running and reachable through the configured API origin.',
            'Check reverse proxy routing for /api/v1/health.',
            'Review backend logs before retrying deploy verification.'
        ];
    }

    const actions = [];
    const profile = capabilities.hostingProfile;
    const redis = capabilities.redis || {};

    if (profile === 'vps' && redis.connected !== true) {
        actions.push('Start or repair Redis, verify REDIS_URL, then run npm run preflight:vps.');
    }
    if (profile === 'vps' && capabilities.tokenBlacklist?.mode !== 'fail_closed') {
        actions.push('Set AUTH_BLACKLIST_FAILURE_MODE=fail_closed before treating VPS mode as production-ready.');
    }
    if (profile === 'shared' && redis.configured === true) {
        actions.push('Remove REDIS_URL or switch HOSTING_PROFILE to vps; shared mode must not configure Redis.');
    }
    if (profile === 'shared' && capabilities.tempFileStorage?.mode !== 'local') {
        actions.push('Set TEMP_FILE_STORAGE=local so shared exports remain usable without Redis.');
    }
    if (profile === 'vps' && capabilities.schedulerLock?.mode !== 'distributed') {
        actions.push('Do not run billing or scheduled jobs at scale until Redis-backed scheduler locks are restored.');
    }
    if (String(capabilities.rateLimitStore?.mode || '').includes('fallback')) {
        actions.push('Redis is configured but rate limiting is memory-backed; verify Redis connectivity and restart the backend if needed.');
    }
    if (services.database?.status !== 'connected') {
        actions.push('Restore database connectivity before user traffic or deploy completion.');
    }

    return actions.length > 0
        ? actions
        : ['No required outage detected. Recheck this page after deploy, Redis changes, or hosting profile changes.'];
};

const deriveReadinessChecks = ({ capabilities }) => {
    const profile = capabilities.hostingProfile;
    const redis = capabilities.redis || {};

    if (profile === 'vps') {
        return [
            { label: 'Redis is configured', passed: redis.configured === true },
            { label: 'Redis is connected', passed: redis.connected === true },
            { label: 'Token blacklist is fail-closed', passed: capabilities.tokenBlacklist?.mode === 'fail_closed' },
            { label: 'Scheduler lock is distributed', passed: capabilities.schedulerLock?.mode === 'distributed' },
            { label: 'Rate limiter uses Redis', passed: capabilities.rateLimitStore?.mode === 'redis' }
        ];
    }

    return [
        { label: 'Shared profile selected', passed: profile === 'shared' },
        { label: 'Redis is not configured', passed: redis.configured !== true },
        { label: 'Token blacklist is fail-open', passed: capabilities.tokenBlacklist?.mode === 'fail_open' },
        { label: 'AI temp exports use local storage', passed: capabilities.tempFileStorage?.mode === 'local' },
        { label: 'Scheduler is single-instance', passed: capabilities.schedulerLock?.mode === 'single_instance' }
    ];
};

const formatCheckedAt = (timestamp) => {
    if (!timestamp) return '-';
    try {
        return new Date(timestamp).toLocaleTimeString();
    } catch {
        return '-';
    }
};

export default function HostingStatus() {
    const [statusPayload, setStatusPayload] = useState(null);
    const [statusHistory, setStatusHistory] = useState([]);
    const [autoRefresh, setAutoRefresh] = useState(true);
    const [clockTick, setClockTick] = useState(Date.now());
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState('');

    const loadStatus = useCallback(async () => {
        setLoading(true);
        setError('');
        try {
            const result = await getHostingStatus();
            const checkedAt = new Date().toISOString();
            const nextPayload = { ...result, checkedAt };
            setStatusPayload(nextPayload);
            setStatusHistory((current) => {
                const snapshot = {
                    checkedAt,
                    statusCode: result.statusCode,
                    success: result.health?.success === true,
                    profile: result.health?.capabilities?.hostingProfile || 'unknown',
                    redisStatus: result.health?.capabilities?.redis?.status || result.health?.services?.redis?.status || 'unknown'
                };
                return [snapshot, ...current].slice(0, HISTORY_LIMIT);
            });
        } catch (err) {
            setStatusPayload(null);
            setError(err?.message || 'Unable to load hosting status.');
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => {
        loadStatus();
    }, [loadStatus]);

    useEffect(() => {
        if (!autoRefresh) return undefined;
        const interval = setInterval(loadStatus, AUTO_REFRESH_MS);
        return () => clearInterval(interval);
    }, [autoRefresh, loadStatus]);

    useEffect(() => {
        const interval = setInterval(() => setClockTick(Date.now()), 15000);
        return () => clearInterval(interval);
    }, []);

    const health = statusPayload?.health || null;
    const capabilities = health?.capabilities || {};
    const services = health?.services || {};
    const overall = useMemo(
        () => deriveOverallStatus(health, statusPayload?.statusCode || 0),
        [health, statusPayload?.statusCode]
    );
    const OverallIcon = overall.icon;
    const redis = capabilities.redis || {};
    const checkedAt = statusPayload?.checkedAt || health?.timestamp || null;
    const stale = checkedAt ? clockTick - new Date(checkedAt).getTime() > STALE_MS : false;
    const operatorActions = useMemo(
        () => deriveOperatorActions({ health, capabilities, services }),
        [health, capabilities, services]
    );
    const readinessChecks = useMemo(
        () => deriveReadinessChecks({ capabilities }),
        [capabilities]
    );
    const passedReadinessCount = readinessChecks.filter((check) => check.passed).length;

    const copyDiagnostics = useCallback(async () => {
        if (!statusPayload) {
            toast.error('No hosting diagnostics available yet.');
            return;
        }

        const diagnostics = {
            checkedAt,
            statusCode: statusPayload.statusCode,
            success: health?.success === true,
            capabilities: health?.capabilities || {},
            services: {
                database: health?.services?.database || null,
                redis: health?.services?.redis || null,
                tenantPool: health?.services?.tenantPool || null
            }
        };

        try {
            await navigator.clipboard.writeText(JSON.stringify(diagnostics, null, 2));
            toast.success('Hosting diagnostics copied.');
        } catch {
            toast.error('Unable to copy diagnostics from this browser.');
        }
    }, [checkedAt, health, statusPayload]);

    return (
        <div className="space-y-6">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                <div>
                    <h1 className="text-2xl font-bold text-slate-900">Hosting Status</h1>
                    <p className="mt-1 text-sm text-slate-500">
                        Runtime capability view for shared hosting and Redis-capable deployments.
                    </p>
                </div>
                <div className="flex flex-wrap gap-2">
                    <Button type="button" variant="outline" onClick={() => setAutoRefresh((value) => !value)}>
                        {autoRefresh ? <PauseCircle className="mr-2 h-4 w-4" /> : <PlayCircle className="mr-2 h-4 w-4" />}
                        {autoRefresh ? 'Pause Auto' : 'Resume Auto'}
                    </Button>
                    <Button type="button" variant="outline" onClick={copyDiagnostics} disabled={!statusPayload}>
                        <Copy className="mr-2 h-4 w-4" />
                        Copy Diagnostics
                    </Button>
                    <Button type="button" variant="outline" onClick={loadStatus} disabled={loading}>
                        <RefreshCw className={cn('mr-2 h-4 w-4', loading && 'animate-spin')} />
                        Refresh
                    </Button>
                </div>
            </div>

            {error && (
                <div className="rounded-lg border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-800">
                    {error}
                </div>
            )}

            {stale && (
                <div className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
                    This status is older than 90 seconds. Refresh before making a deploy or rollback decision.
                </div>
            )}

            <section className={cn(
                'rounded-lg border p-5',
                statusStyles[overall.tone] || 'border-slate-200 bg-white text-slate-900'
            )}>
                <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
                    <div className="flex items-start gap-3">
                        <div className="rounded-lg bg-white/70 p-3">
                            <OverallIcon className="h-6 w-6" />
                        </div>
                        <div>
                            <p className="text-sm font-semibold uppercase tracking-wide">Overall Runtime</p>
                            <h2 className="mt-1 text-2xl font-bold">{overall.label}</h2>
                            <p className="mt-1 text-sm">
                                Profile: {formatLabel(capabilities.hostingProfile)} - HTTP {statusPayload?.statusCode || 'n/a'} - {health?.environment || 'unknown'} environment
                            </p>
                        </div>
                    </div>
                    <div className="grid grid-cols-2 gap-3 text-sm sm:grid-cols-4">
                        <div>
                            <p className="text-xs uppercase tracking-wide opacity-70">Uptime</p>
                            <p className="font-semibold">{health?.uptime || '-'}</p>
                        </div>
                        <div>
                            <p className="text-xs uppercase tracking-wide opacity-70">Redis</p>
                            <p className="font-semibold">{redis.connected ? 'Connected' : redis.required ? 'Required' : 'Optional'}</p>
                        </div>
                        <div>
                            <p className="text-xs uppercase tracking-wide opacity-70">Storage</p>
                            <p className="font-semibold">{formatLabel(capabilities.tempFileStorage?.mode)}</p>
                        </div>
                        <div>
                            <p className="text-xs uppercase tracking-wide opacity-70">Checked</p>
                            <p className="font-semibold">{formatCheckedAt(checkedAt)}</p>
                        </div>
                    </div>
                </div>
            </section>

            <section className="grid gap-4 xl:grid-cols-[1.15fr_0.85fr]">
                <div className="rounded-lg border border-slate-200 bg-white p-5">
                    <div className="flex items-start gap-3">
                        <FileText className="mt-0.5 h-5 w-5 text-slate-700" />
                        <div>
                            <h2 className="text-sm font-semibold text-slate-900">Operator Runbook</h2>
                            <p className="mt-1 text-sm text-slate-500">Use these checks before deploy completion, Redis migration, or rollback sign-off.</p>
                        </div>
                    </div>
                    <ol className="mt-4 space-y-2">
                        {operatorActions.map((action) => (
                            <li key={action} className="flex gap-2 text-sm text-slate-700">
                                <span className="mt-2 h-1.5 w-1.5 rounded-full bg-slate-400" />
                                <span>{action}</span>
                            </li>
                        ))}
                    </ol>
                </div>

                <div className="rounded-lg border border-slate-200 bg-white p-5">
                    <div className="flex items-center justify-between gap-3">
                        <div>
                            <h2 className="text-sm font-semibold text-slate-900">Profile Readiness</h2>
                            <p className="mt-1 text-sm text-slate-500">{passedReadinessCount}/{readinessChecks.length} checks passing</p>
                        </div>
                        <CapabilityBadge value={passedReadinessCount === readinessChecks.length ? 'healthy' : 'degraded'} />
                    </div>
                    <div className="mt-4 space-y-2">
                        {readinessChecks.map((check) => (
                            <div key={check.label} className="flex items-center justify-between gap-3 rounded-md border border-slate-100 px-3 py-2">
                                <span className="text-sm text-slate-700">{check.label}</span>
                                {check.passed
                                    ? <CheckCircle2 className="h-4 w-4 text-emerald-600" />
                                    : <AlertTriangle className="h-4 w-4 text-rose-600" />}
                            </div>
                        ))}
                    </div>
                </div>
            </section>

            <section className="grid gap-4 xl:grid-cols-2">
                <CapabilityRow
                    icon={Server}
                    label="Hosting Profile"
                    value={capabilities.hostingProfile}
                    detail={capabilities.hostingProfile === 'shared'
                        ? 'Shared mode accepts local temp files, fail-open blacklist policy, and single-process assumptions.'
                        : 'VPS mode expects Redis-backed revocation, distributed rate limits, cache, and scheduler locks.'}
                />
                <CapabilityRow
                    icon={Database}
                    label="Database"
                    value={services.database?.status}
                    detail={services.database?.message}
                />
                <CapabilityRow
                    icon={Activity}
                    label="Redis"
                    value={redis.status || services.redis?.status}
                    detail={`Configured: ${redis.configured ? 'yes' : 'no'} - Required: ${redis.required ? 'yes' : 'no'} - Connected: ${redis.connected ? 'yes' : 'no'}`}
                />
                <CapabilityRow
                    icon={LockKeyhole}
                    label="Token Blacklist"
                    value={capabilities.tokenBlacklist?.mode}
                    detail={capabilities.tokenBlacklist?.mode === 'fail_closed'
                        ? 'Token revocation checks deny access when Redis validation is unavailable.'
                        : 'Token revocation checks allow requests when Redis validation is unavailable.'}
                />
                <CapabilityRow
                    icon={HardDrive}
                    label="AI Export Temp Storage"
                    value={capabilities.tempFileStorage?.mode}
                    detail={capabilities.tempFileStorage?.mode === 'local'
                        ? 'Local export metadata is stored outside public uploads and served only through the authenticated AI export route.'
                        : 'Export metadata is stored through the cache layer when Redis is connected.'}
                />
                <CapabilityRow
                    icon={Clock3}
                    label="Scheduler Lock"
                    value={capabilities.schedulerLock?.mode}
                    detail={capabilities.schedulerLock?.mode === 'distributed'
                        ? 'Background jobs use Redis-backed distributed locking.'
                        : 'Background jobs rely on single-process assumptions while Redis is unavailable.'}
                />
            </section>

            <section className="rounded-lg border border-slate-200 bg-white p-5">
                <div className="flex items-start gap-3">
                    <History className="mt-0.5 h-5 w-5 text-slate-700" />
                    <div>
                        <h2 className="text-sm font-semibold text-slate-900">Recent Samples</h2>
                        <p className="mt-1 text-sm text-slate-500">Auto-refresh keeps a short local history for spotting profile or Redis state changes.</p>
                    </div>
                </div>
                <div className="mt-4 grid gap-2 md:grid-cols-2 xl:grid-cols-3">
                    {statusHistory.length === 0 ? (
                        <p className="text-sm text-slate-500">No samples loaded yet.</p>
                    ) : statusHistory.map((sample) => (
                        <div key={`${sample.checkedAt}-${sample.statusCode}`} className="rounded-md border border-slate-100 px-3 py-2">
                            <div className="flex items-center justify-between gap-2">
                                <p className="text-xs font-semibold text-slate-500">{formatCheckedAt(sample.checkedAt)}</p>
                                <CapabilityBadge value={sample.success ? 'healthy' : 'degraded'} />
                            </div>
                            <p className="mt-2 text-sm font-semibold text-slate-900">{formatLabel(sample.profile)}</p>
                            <p className="mt-1 text-xs text-slate-500">Redis: {formatLabel(sample.redisStatus)} - HTTP {sample.statusCode}</p>
                        </div>
                    ))}
                </div>
            </section>

            {health?.success === false && (
                <section className="rounded-lg border border-rose-200 bg-white p-5">
                    <div className="flex items-start gap-3">
                        <AlertTriangle className="mt-0.5 h-5 w-5 text-rose-600" />
                        <div>
                            <h2 className="text-sm font-semibold text-slate-900">Operator action needed</h2>
                            <p className="mt-1 text-sm text-slate-600">
                                This profile has at least one required capability offline. Check the Redis service, environment profile, and recent deploy configuration before treating the app as production-ready.
                            </p>
                        </div>
                    </div>
                </section>
            )}

            {health?.success === true && (
                <section className="rounded-lg border border-emerald-200 bg-white p-5">
                    <div className="flex items-start gap-3">
                        <CheckCircle2 className="mt-0.5 h-5 w-5 text-emerald-600" />
                        <div>
                            <h2 className="text-sm font-semibold text-slate-900">No required capability outage detected</h2>
                            <p className="mt-1 text-sm text-slate-600">
                                Continue to monitor profile-specific guarantees before deploys and after Redis or hosting changes.
                            </p>
                        </div>
                    </div>
                </section>
            )}
        </div>
    );
}
