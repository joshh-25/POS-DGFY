import React, { useEffect, useMemo, useState } from 'react';
import {
    AlertCircle,
    Ban,
    CheckCircle,
    Edit2,
    Eye,
    Filter,
    MailCheck,
    RefreshCw,
    RotateCcw,
    Search,
    ShieldAlert,
    UserRound,
    X
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import * as adminService from '@/services/adminService';
import { normalizeApiError } from '@/src/utils/errorHandler.js';
import { toast } from 'sonner';

const STATUS_FILTERS = [
    { value: 'all', label: 'All statuses' },
    { value: 'active', label: 'Active' },
    { value: 'suspended', label: 'Suspended' }
];

const VERIFICATION_FILTERS = [
    { value: 'all', label: 'All verification' },
    { value: 'verified', label: 'Email verified' },
    { value: 'unverified', label: 'Email unverified' }
];

const MEMBERSHIP_FILTERS = [
    { value: 'all', label: 'All memberships' },
    { value: 'has_membership', label: 'Has company link' },
    { value: 'no_membership', label: 'No company link' }
];

const EMPTY_SUMMARY = {
    total: 0,
    active: 0,
    suspended: 0,
    verified_email: 0,
    unverified_email: 0
};

const formatDate = (value) => {
    if (!value) return 'Never';
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return 'Unknown';
    return date.toLocaleString();
};

const getDisplayName = (account = {}) => (
    [account.first_name, account.middle_name, account.last_name]
        .filter(Boolean)
        .join(' ')
        .trim()
    || account.username
    || account.email
    || 'DGFY Account'
);

const statusBadgeClass = (account) => (
    account?.is_active
        ? 'border-emerald-200 bg-emerald-50 text-emerald-700'
        : 'border-rose-200 bg-rose-50 text-rose-700'
);

const verificationBadgeClass = (account) => (
    account?.is_email_verified
        ? 'border-sky-200 bg-sky-50 text-sky-700'
        : 'border-amber-200 bg-amber-50 text-amber-700'
);

const StatTile = ({ label, value, icon: Icon }) => (
    <div className="rounded-lg border border-slate-200 bg-white p-4">
        <div className="flex items-center justify-between">
            <p className="text-sm font-medium text-slate-500">{label}</p>
            <Icon className="h-4 w-4 text-slate-400" />
        </div>
        <p className="mt-2 text-2xl font-semibold text-slate-900">{value}</p>
    </div>
);

const ModalShell = ({ title, tone = 'slate', children, onClose }) => (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
        <div className={cn(
            'w-full max-w-lg overflow-hidden rounded-xl bg-white shadow-xl',
            tone === 'danger' && 'border-2 border-rose-100'
        )}>
            <div className={cn(
                'flex items-center justify-between border-b px-6 py-4',
                tone === 'danger' ? 'border-rose-100 bg-rose-50' : 'border-slate-100 bg-slate-50'
            )}>
                <h3 className={cn('text-lg font-semibold', tone === 'danger' ? 'text-rose-900' : 'text-slate-900')}>
                    {title}
                </h3>
                <Button variant="ghost" size="icon" onClick={onClose} aria-label={`Close ${title}`} title={`Close ${title}`}>
                    <X className="h-5 w-5 text-slate-500" />
                </Button>
            </div>
            {children}
        </div>
    </div>
);

export default function DgfyAccountManager() {
    const [accounts, setAccounts] = useState([]);
    const [summary, setSummary] = useState(EMPTY_SUMMARY);
    const [pagination, setPagination] = useState({ page: 1, limit: 25, total: 0, total_pages: 1 });
    const [filters, setFilters] = useState({
        status: 'all',
        verification: 'all',
        membership: 'all',
        search: ''
    });
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState('');
    const [detailLoading, setDetailLoading] = useState(false);
    const [selectedDetail, setSelectedDetail] = useState(null);
    const [showDetail, setShowDetail] = useState(false);
    const [editAccount, setEditAccount] = useState(null);
    const [editForm, setEditForm] = useState({ first_name: '', middle_name: '', last_name: '', phone: '' });
    const [editLoading, setEditLoading] = useState(false);
    const [lifecycleAccount, setLifecycleAccount] = useState(null);
    const [lifecycleAction, setLifecycleAction] = useState('');
    const [lifecycleReason, setLifecycleReason] = useState('');
    const [lifecycleLoading, setLifecycleLoading] = useState(false);

    const query = useMemo(() => ({
        ...filters,
        page: pagination.page,
        limit: pagination.limit
    }), [filters, pagination.page, pagination.limit]);

    const loadAccounts = async () => {
        setLoading(true);
        setError('');
        try {
            const response = await adminService.listDgfyAccounts(query);
            setAccounts(response.data?.accounts || []);
            setSummary(response.data?.summary || EMPTY_SUMMARY);
            setPagination((current) => ({
                ...current,
                ...(response.data?.pagination || {})
            }));
        } catch (err) {
            const normalized = normalizeApiError(err);
            setError(normalized.message || 'Failed to load DGFY accounts');
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        loadAccounts();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [query.status, query.verification, query.membership, query.search, query.page, query.limit]);

    const updateFilter = (key, value) => {
        setFilters((current) => ({ ...current, [key]: value }));
        setPagination((current) => ({ ...current, page: 1 }));
    };

    const openDetail = async (account) => {
        setShowDetail(true);
        setSelectedDetail({ account, audit_logs: [] });
        setDetailLoading(true);
        try {
            const response = await adminService.getDgfyAccount(account.id);
            setSelectedDetail(response.data || { account, audit_logs: [] });
        } catch (err) {
            const normalized = normalizeApiError(err);
            toast.error(`Failed to load account detail: ${normalized.message}`);
        } finally {
            setDetailLoading(false);
        }
    };

    const openEdit = (account) => {
        setEditAccount(account);
        setEditForm({
            first_name: account.first_name || '',
            middle_name: account.middle_name || '',
            last_name: account.last_name || '',
            phone: account.phone || ''
        });
    };

    const submitEdit = async (event) => {
        event.preventDefault();
        if (!editAccount?.id) return;
        setEditLoading(true);
        try {
            const response = await adminService.updateDgfyAccountProfile(editAccount.id, editForm);
            const updatedAccount = response.data?.account;
            setEditAccount(null);
            await loadAccounts();
            if (showDetail && updatedAccount?.id) {
                await openDetail(updatedAccount);
            }
            toast.success('DGFY account profile updated');
        } catch (err) {
            const normalized = normalizeApiError(err);
            toast.error(`Failed to update profile: ${normalized.message}`);
        } finally {
            setEditLoading(false);
        }
    };

    const openLifecycleModal = (account, action) => {
        setLifecycleAccount(account);
        setLifecycleAction(action);
        setLifecycleReason('');
    };

    const submitLifecycle = async (event) => {
        event.preventDefault();
        if (!lifecycleAccount?.id || !lifecycleAction) return;
        setLifecycleLoading(true);
        try {
            const payload = { reason: lifecycleReason.trim() };
            const response = lifecycleAction === 'suspend'
                ? await adminService.suspendDgfyAccount(lifecycleAccount.id, payload)
                : await adminService.reactivateDgfyAccount(lifecycleAccount.id, payload);
            const updatedAccount = response.data?.account;
            setLifecycleAccount(null);
            setLifecycleAction('');
            await loadAccounts();
            if (showDetail && updatedAccount?.id) {
                await openDetail(updatedAccount);
            }
            toast.success(lifecycleAction === 'suspend' ? 'DGFY account suspended' : 'DGFY account reactivated');
        } catch (err) {
            const normalized = normalizeApiError(err);
            toast.error(`Failed to ${lifecycleAction}: ${normalized.message}`);
        } finally {
            setLifecycleLoading(false);
        }
    };

    const activeDetailAccount = selectedDetail?.account;
    const lifecycleTitle = lifecycleAction === 'suspend' ? 'Suspend DGFY Account' : 'Reactivate DGFY Account';

    return (
        <div className="space-y-6">
            <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
                <div>
                    <h1 className="text-2xl font-bold text-slate-900">DGFY Accounts</h1>
                    <p className="mt-1 text-sm text-slate-500">Platform-level account lifecycle and contact review.</p>
                </div>
                <Button variant="outline" onClick={loadAccounts} disabled={loading}>
                    <RefreshCw className={cn('mr-2 h-4 w-4', loading && 'animate-spin')} />
                    Refresh
                </Button>
            </div>

            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-5">
                <StatTile label="Total" value={summary.total || 0} icon={UserRound} />
                <StatTile label="Active" value={summary.active || 0} icon={CheckCircle} />
                <StatTile label="Suspended" value={summary.suspended || 0} icon={Ban} />
                <StatTile label="Verified Email" value={summary.verified_email || 0} icon={MailCheck} />
                <StatTile label="Unverified Email" value={summary.unverified_email || 0} icon={ShieldAlert} />
            </div>

            <div className="rounded-lg border border-slate-200 bg-white">
                <div className="border-b border-slate-100 p-4">
                    <div className="grid grid-cols-1 gap-3 lg:grid-cols-[1.4fr_1fr_1fr_1fr]">
                        <label className="relative">
                            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                            <input
                                type="search"
                                value={filters.search}
                                onChange={(event) => updateFilter('search', event.target.value)}
                                className="w-full rounded-lg border border-slate-300 py-2 pl-9 pr-3 text-sm focus:outline-none focus:ring-2 focus:ring-slate-500"
                                placeholder="Search name, email, or phone"
                            />
                        </label>
                        <label className="flex items-center gap-2">
                            <Filter className="h-4 w-4 text-slate-400" />
                            <select
                                value={filters.status}
                                onChange={(event) => updateFilter('status', event.target.value)}
                                className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-slate-500"
                            >
                                {STATUS_FILTERS.map((filter) => (
                                    <option key={filter.value} value={filter.value}>{filter.label}</option>
                                ))}
                            </select>
                        </label>
                        <select
                            value={filters.verification}
                            onChange={(event) => updateFilter('verification', event.target.value)}
                            className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-slate-500"
                        >
                            {VERIFICATION_FILTERS.map((filter) => (
                                <option key={filter.value} value={filter.value}>{filter.label}</option>
                            ))}
                        </select>
                        <select
                            value={filters.membership}
                            onChange={(event) => updateFilter('membership', event.target.value)}
                            className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-slate-500"
                        >
                            {MEMBERSHIP_FILTERS.map((filter) => (
                                <option key={filter.value} value={filter.value}>{filter.label}</option>
                            ))}
                        </select>
                    </div>
                </div>

                {error && (
                    <div className="m-4 rounded-lg border border-rose-200 bg-rose-50 p-3 text-sm text-rose-800">
                        <AlertCircle className="mr-2 inline h-4 w-4" />
                        {error}
                    </div>
                )}

                <div className="overflow-x-auto">
                    <table className="min-w-full divide-y divide-slate-100 text-sm">
                        <thead className="bg-slate-50 text-left text-xs font-semibold uppercase tracking-wide text-slate-500">
                            <tr>
                                <th className="px-4 py-3">Account</th>
                                <th className="px-4 py-3">Phone</th>
                                <th className="px-4 py-3">Status</th>
                                <th className="px-4 py-3">Email</th>
                                <th className="px-4 py-3">Companies</th>
                                <th className="px-4 py-3">Last Login</th>
                                <th className="px-4 py-3 text-right">Actions</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100 bg-white">
                            {loading ? (
                                <tr>
                                    <td colSpan={7} className="px-4 py-10 text-center text-slate-500">
                                        <RefreshCw className="mx-auto mb-2 h-5 w-5 animate-spin" />
                                        Loading DGFY accounts...
                                    </td>
                                </tr>
                            ) : accounts.length === 0 ? (
                                <tr>
                                    <td colSpan={7} className="px-4 py-10 text-center text-slate-500">
                                        No DGFY accounts match the current filters.
                                    </td>
                                </tr>
                            ) : accounts.map((account) => (
                                <tr key={account.id} className="hover:bg-slate-50">
                                    <td className="px-4 py-3">
                                        <div className="font-medium text-slate-900">{getDisplayName(account)}</div>
                                        <div className="text-xs text-slate-500">{account.email}</div>
                                    </td>
                                    <td className="px-4 py-3 text-slate-700">{account.phone || 'Missing'}</td>
                                    <td className="px-4 py-3">
                                        <span className={cn('inline-flex rounded-full border px-2 py-1 text-xs font-semibold', statusBadgeClass(account))}>
                                            {account.is_active ? 'Active' : 'Suspended'}
                                        </span>
                                    </td>
                                    <td className="px-4 py-3">
                                        <span className={cn('inline-flex rounded-full border px-2 py-1 text-xs font-semibold', verificationBadgeClass(account))}>
                                            {account.is_email_verified ? 'Verified' : 'Unverified'}
                                        </span>
                                    </td>
                                    <td className="px-4 py-3 text-slate-700">{account.membership_count || 0}</td>
                                    <td className="px-4 py-3 text-slate-700">{formatDate(account.last_login_at)}</td>
                                    <td className="px-4 py-3">
                                        <div className="flex justify-end gap-2">
                                            <Button size="sm" variant="outline" onClick={() => openDetail(account)} aria-label={`View ${getDisplayName(account)}`} title="View account">
                                                <Eye className="h-4 w-4" />
                                            </Button>
                                            <Button size="sm" variant="outline" onClick={() => openEdit(account)} aria-label={`Edit ${getDisplayName(account)}`} title="Edit profile">
                                                <Edit2 className="h-4 w-4" />
                                            </Button>
                                            {account.is_active ? (
                                                <Button size="sm" variant="outline" className="text-rose-700" onClick={() => openLifecycleModal(account, 'suspend')} aria-label={`Suspend ${getDisplayName(account)}`} title="Suspend account">
                                                    <Ban className="h-4 w-4" />
                                                </Button>
                                            ) : (
                                                <Button size="sm" variant="outline" className="text-emerald-700" onClick={() => openLifecycleModal(account, 'reactivate')} aria-label={`Reactivate ${getDisplayName(account)}`} title="Reactivate account">
                                                    <RotateCcw className="h-4 w-4" />
                                                </Button>
                                            )}
                                        </div>
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            </div>

            {showDetail && (
                <div className="fixed inset-y-0 right-0 z-40 flex w-full max-w-2xl flex-col border-l border-slate-200 bg-white shadow-xl">
                    <div className="flex items-center justify-between border-b border-slate-100 px-6 py-4">
                        <div>
                            <h2 className="text-lg font-semibold text-slate-900">{getDisplayName(activeDetailAccount)}</h2>
                            <p className="text-sm text-slate-500">{activeDetailAccount?.email}</p>
                        </div>
                        <Button variant="ghost" size="icon" onClick={() => setShowDetail(false)} aria-label="Close account details" title="Close details">
                            <X className="h-5 w-5" />
                        </Button>
                    </div>
                    <div className="flex-1 space-y-6 overflow-y-auto p-6">
                        {detailLoading && <p className="text-sm text-slate-500">Loading account detail...</p>}
                        {activeDetailAccount && (
                            <>
                                <section>
                                    <h3 className="mb-3 text-sm font-semibold uppercase tracking-wide text-slate-500">Profile</h3>
                                    <dl className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                                        <div><dt className="text-xs text-slate-500">Status</dt><dd className="font-medium text-slate-900">{activeDetailAccount.is_active ? 'Active' : 'Suspended'}</dd></div>
                                        <div><dt className="text-xs text-slate-500">Phone</dt><dd className="font-medium text-slate-900">{activeDetailAccount.phone || 'Missing'}</dd></div>
                                        <div><dt className="text-xs text-slate-500">Email verification</dt><dd className="font-medium text-slate-900">{activeDetailAccount.is_email_verified ? 'Verified' : 'Unverified'}</dd></div>
                                        <div><dt className="text-xs text-slate-500">Phone verification</dt><dd className="font-medium text-slate-900">{activeDetailAccount.is_phone_verified ? 'Verified' : 'Deferred'}</dd></div>
                                        <div><dt className="text-xs text-slate-500">Created</dt><dd className="font-medium text-slate-900">{formatDate(activeDetailAccount.created_at)}</dd></div>
                                        <div><dt className="text-xs text-slate-500">Updated</dt><dd className="font-medium text-slate-900">{formatDate(activeDetailAccount.updated_at)}</dd></div>
                                    </dl>
                                </section>

                                <section>
                                    <h3 className="mb-3 text-sm font-semibold uppercase tracking-wide text-slate-500">Company Memberships</h3>
                                    {(activeDetailAccount.memberships || []).length === 0 ? (
                                        <p className="text-sm text-slate-500">No company memberships.</p>
                                    ) : (
                                        <div className="space-y-2">
                                            {activeDetailAccount.memberships.map((membership) => (
                                                <div key={membership.id} className="rounded-lg border border-slate-200 p-3">
                                                    <div className="font-medium text-slate-900">{membership.company?.name || membership.tenant_id}</div>
                                                    <div className="text-xs text-slate-500">
                                                        {membership.role} | {membership.status} | {membership.source}
                                                    </div>
                                                </div>
                                            ))}
                                        </div>
                                    )}
                                </section>

                                <section>
                                    <h3 className="mb-3 text-sm font-semibold uppercase tracking-wide text-slate-500">Admin Audit</h3>
                                    {(selectedDetail?.audit_logs || []).length === 0 ? (
                                        <p className="text-sm text-slate-500">No admin audit events yet.</p>
                                    ) : (
                                        <div className="space-y-2">
                                            {selectedDetail.audit_logs.map((log) => (
                                                <div key={log.audit_log_id} className="rounded-lg border border-slate-200 p-3">
                                                    <div className="flex items-center justify-between gap-3">
                                                        <span className="font-medium text-slate-900">{log.action}</span>
                                                        <span className="text-xs text-slate-500">{formatDate(log.created_at)}</span>
                                                    </div>
                                                    <div className="mt-1 text-xs text-slate-500">By {log.actor_username}</div>
                                                    {log.reason && <div className="mt-1 text-sm text-slate-700">{log.reason}</div>}
                                                </div>
                                            ))}
                                        </div>
                                    )}
                                </section>
                            </>
                        )}
                    </div>
                </div>
            )}

            {editAccount && (
                <ModalShell title="Edit DGFY Account" onClose={() => setEditAccount(null)}>
                    <form onSubmit={submitEdit} className="space-y-4 p-6">
                        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                            <label className="space-y-1">
                                <span className="text-sm font-medium text-slate-700">First name</span>
                                <input className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm" value={editForm.first_name} onChange={(event) => setEditForm({ ...editForm, first_name: event.target.value })} required />
                            </label>
                            <label className="space-y-1">
                                <span className="text-sm font-medium text-slate-700">Middle name</span>
                                <input className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm" value={editForm.middle_name} onChange={(event) => setEditForm({ ...editForm, middle_name: event.target.value })} />
                            </label>
                            <label className="space-y-1">
                                <span className="text-sm font-medium text-slate-700">Last name</span>
                                <input className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm" value={editForm.last_name} onChange={(event) => setEditForm({ ...editForm, last_name: event.target.value })} required />
                            </label>
                            <label className="space-y-1">
                                <span className="text-sm font-medium text-slate-700">Phone</span>
                                <input className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm" value={editForm.phone} onChange={(event) => setEditForm({ ...editForm, phone: event.target.value })} required />
                            </label>
                        </div>
                        <div className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">
                            Email changes remain unavailable until the verified DGFY email-change flow exists.
                        </div>
                        <div className="flex justify-end gap-3 pt-2">
                            <Button type="button" variant="outline" onClick={() => setEditAccount(null)}>Cancel</Button>
                            <Button type="submit" disabled={editLoading} className="bg-slate-900 text-white hover:bg-slate-800">
                                {editLoading ? <RefreshCw className="h-4 w-4 animate-spin" /> : 'Save Changes'}
                            </Button>
                        </div>
                    </form>
                </ModalShell>
            )}

            {lifecycleAccount && (
                <ModalShell title={lifecycleTitle} tone={lifecycleAction === 'suspend' ? 'danger' : 'slate'} onClose={() => setLifecycleAccount(null)}>
                    <form onSubmit={submitLifecycle} className="space-y-4 p-6">
                        <div className="rounded-lg border border-slate-200 bg-slate-50 p-3">
                            <div className="text-sm font-medium text-slate-900">{getDisplayName(lifecycleAccount)}</div>
                            <div className="text-xs text-slate-500">{lifecycleAccount.email}</div>
                        </div>
                        <label className="space-y-1">
                            <span className="text-sm font-medium text-slate-700">Reason</span>
                            <textarea
                                className="min-h-24 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
                                value={lifecycleReason}
                                onChange={(event) => setLifecycleReason(event.target.value)}
                                required
                                minLength={3}
                            />
                        </label>
                        <div className="flex justify-end gap-3 pt-2">
                            <Button type="button" variant="outline" onClick={() => setLifecycleAccount(null)}>Cancel</Button>
                            <Button
                                type="submit"
                                disabled={lifecycleLoading || lifecycleReason.trim().length < 3}
                                className={lifecycleAction === 'suspend' ? 'bg-rose-600 text-white hover:bg-rose-700' : 'bg-emerald-700 text-white hover:bg-emerald-800'}
                            >
                                {lifecycleLoading ? <RefreshCw className="h-4 w-4 animate-spin" /> : lifecycleAction === 'suspend' ? 'Suspend Account' : 'Reactivate Account'}
                            </Button>
                        </div>
                    </form>
                </ModalShell>
            )}
        </div>
    );
}
