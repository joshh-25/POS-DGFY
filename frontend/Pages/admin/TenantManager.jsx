import React, { useState, useEffect } from 'react';
import {
    Building2,
    RefreshCw,
    Check,
    X,
    Clock,
    AlertCircle,
    CheckCircle,
    XCircle,
    Filter,
    Mail,
    Calendar,
    Key
} from 'lucide-react';
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import * as adminService from '@/services/adminService';

const STATUS_CONFIG = {
    pending: { label: 'Pending', color: 'text-amber-600 bg-amber-50 border-amber-200', icon: Clock },
    active: { label: 'Active', color: 'text-green-600 bg-green-50 border-green-200', icon: CheckCircle },
    rejected: { label: 'Rejected', color: 'text-red-600 bg-red-50 border-red-200', icon: XCircle },
    inactive: { label: 'Inactive', color: 'text-slate-600 bg-slate-50 border-slate-200', icon: AlertCircle },
    failed: { label: 'Failed', color: 'text-red-600 bg-red-50 border-red-200', icon: XCircle },
};

export default function TenantManager() {
    const [tenants, setTenants] = useState([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState('');
    const [statusFilter, setStatusFilter] = useState('all');
    const [actionLoading, setActionLoading] = useState(null); // tenant id being processed

    // Add Tenant Modal State
    const [showAddModal, setShowAddModal] = useState(false);
    const [addLoading, setAddLoading] = useState(false);
    const [addForm, setAddForm] = useState({
        name: '',
        adminEmail: '',
        adminPassword: '',
        plan: 'standard',
        subscriptionId: ''
    });

    useEffect(() => {
        loadTenants();
    }, [statusFilter]);

    const loadTenants = async () => {
        setLoading(true);
        setError('');
        try {
            const response = await adminService.getTenants(statusFilter);
            setTenants(response.data || []);
        } catch (err) {
            setError('Failed to load tenants');
            console.error(err);
        } finally {
            setLoading(false);
        }
    };

    const handleApprove = async (tenantId) => {
        if (!confirm('Approve this company? This will create their database and send them login credentials.')) {
            return;
        }
        setActionLoading(tenantId);
        try {
            await adminService.approveTenant(tenantId);
            loadTenants();
        } catch (err) {
            alert('Failed to approve: ' + (err.response?.data?.message || err.message));
        } finally {
            setActionLoading(null);
        }
    };

    const handleReject = async (tenantId) => {
        const reason = prompt('Rejection reason (optional):');
        if (reason === null) return; // cancelled

        setActionLoading(tenantId);
        try {
            await adminService.rejectTenant(tenantId, reason);
            loadTenants();
        } catch (err) {
            alert('Failed to reject: ' + (err.response?.data?.message || err.message));
        } finally {
            setActionLoading(null);
        }
    };

    const handleAddTenant = async (e) => {
        e.preventDefault();
        setAddLoading(true);
        try {
            await adminService.createTenant(addForm);
            setShowAddModal(false);
            setAddForm({
                name: '',
                adminEmail: '',
                adminPassword: '',
                plan: 'standard',
                subscriptionId: ''
            });
            loadTenants();
            alert('Tenant created successfully!');
        } catch (err) {
            alert('Failed to create tenant: ' + (err.response?.data?.message || err.message));
        } finally {
            setAddLoading(false);
        }
    };

    const formatDate = (timestamp) => {
        return new Date(timestamp).toLocaleDateString('en-US', {
            year: 'numeric',
            month: 'short',
            day: 'numeric',
            hour: '2-digit',
            minute: '2-digit'
        });
    };

    const pendingCount = tenants.filter(t => t.status === 'pending').length;

    return (
        <div className="max-w-6xl mx-auto">
            {/* Header */}
            <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-6 mb-6">
                <div className="flex items-center justify-between">
                    <div>
                        <h1 className="text-3xl font-bold text-slate-900 flex items-center gap-3">
                            <Building2 className="w-8 h-8" />
                            Tenant Management
                        </h1>
                        <p className="text-slate-500 text-sm mt-1">
                            Manage company registrations and tenant databases
                        </p>
                    </div>
                    <div className="flex gap-2">
                        <Button onClick={() => setShowAddModal(true)} className="bg-slate-900 text-white hover:bg-slate-800">
                            + Add Tenant
                        </Button>
                        <Button onClick={loadTenants} variant="outline" disabled={loading}>
                            <RefreshCw className={cn("w-4 h-4 mr-2", loading && "animate-spin")} />
                            Refresh
                        </Button>
                    </div>
                </div>

                {/* Stats */}
                <div className="grid grid-cols-4 gap-4 mt-6">
                    <div className="bg-slate-50 rounded-lg p-4 text-center">
                        <div className="text-2xl font-bold text-slate-900">{tenants.length}</div>
                        <div className="text-sm text-slate-600">Total</div>
                    </div>
                    <div className="bg-amber-50 rounded-lg p-4 text-center">
                        <div className="text-2xl font-bold text-amber-600">{pendingCount}</div>
                        <div className="text-sm text-amber-700">Pending</div>
                    </div>
                    <div className="bg-green-50 rounded-lg p-4 text-center">
                        <div className="text-2xl font-bold text-green-600">
                            {tenants.filter(t => t.status === 'active').length}
                        </div>
                        <div className="text-sm text-green-700">Active</div>
                    </div>
                    <div className="bg-red-50 rounded-lg p-4 text-center">
                        <div className="text-2xl font-bold text-red-600">
                            {tenants.filter(t => t.status === 'rejected').length}
                        </div>
                        <div className="text-sm text-red-700">Rejected</div>
                    </div>
                </div>
            </div>

            {/* Filters */}
            <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-4 mb-6">
                <div className="flex items-center gap-3">
                    <Filter className="w-4 h-4 text-slate-400" />
                    <span className="text-sm text-slate-600">Filter:</span>
                    {['all', 'pending', 'active', 'rejected'].map(status => (
                        <Button
                            key={status}
                            variant={statusFilter === status ? 'default' : 'outline'}
                            size="sm"
                            onClick={() => setStatusFilter(status)}
                        >
                            {status.charAt(0).toUpperCase() + status.slice(1)}
                        </Button>
                    ))}
                </div>
            </div>

            {/* Error */}
            {error && (
                <div className="bg-red-50 border border-red-200 rounded-lg p-4 mb-6 flex items-center gap-2 text-red-800">
                    <AlertCircle className="w-5 h-5 shrink-0" />
                    {error}
                </div>
            )}

            {/* Tenant List */}
            <div className="space-y-4">
                {loading ? (
                    <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-12 text-center">
                        <RefreshCw className="w-8 h-8 text-slate-400 animate-spin mx-auto mb-3" />
                        <p className="text-slate-600">Loading tenants...</p>
                    </div>
                ) : tenants.length === 0 ? (
                    <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-12 text-center">
                        <Building2 className="w-12 h-12 text-slate-300 mx-auto mb-3" />
                        <p className="text-slate-600 text-lg font-medium">No tenants found</p>
                        <p className="text-slate-500 text-sm">
                            {statusFilter !== 'all' ? `No ${statusFilter} tenants` : 'No company registrations yet'}
                        </p>
                    </div>
                ) : (
                    tenants.map(tenant => {
                        const statusConfig = STATUS_CONFIG[tenant.status] || STATUS_CONFIG.inactive;
                        const StatusIcon = statusConfig.icon;
                        const isProcessing = actionLoading === tenant.id;

                        return (
                            <div
                                key={tenant.id}
                                className="bg-white rounded-xl shadow-sm border border-slate-200 p-6 hover:shadow-md transition-shadow"
                            >
                                <div className="flex items-start justify-between">
                                    <div className="flex-1">
                                        <div className="flex items-center gap-3 mb-2">
                                            <h3 className="text-xl font-semibold text-slate-900">
                                                {tenant.name}
                                            </h3>
                                            <span className={cn(
                                                "inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium border",
                                                statusConfig.color
                                            )}>
                                                <StatusIcon className="w-3.5 h-3.5" />
                                                {statusConfig.label}
                                            </span>
                                        </div>

                                        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm mt-4">
                                            <div className="flex items-center gap-2 text-slate-600">
                                                <Mail className="w-4 h-4 text-slate-400" />
                                                <span>{tenant.admin_email || 'N/A'}</span>
                                            </div>
                                            <div className="flex items-center gap-2 text-slate-600">
                                                <Key className="w-4 h-4 text-slate-400" />
                                                <code className="bg-slate-100 px-2 py-0.5 rounded text-xs">
                                                    {tenant.company_token}
                                                </code>
                                            </div>
                                            <div className="flex items-center gap-2 text-slate-600">
                                                <Calendar className="w-4 h-4 text-slate-400" />
                                                <span>{formatDate(tenant.createdAt)}</span>
                                            </div>
                                            <div className="flex items-center gap-2 text-slate-600">
                                                <span className="text-slate-400">Plan:</span>
                                                <span className="capitalize">{tenant.plan || 'free'}</span>
                                            </div>
                                        </div>
                                    </div>

                                    {/* Actions */}
                                    {tenant.status === 'pending' && (
                                        <div className="flex items-center gap-2 ml-4">
                                            <Button
                                                onClick={() => handleApprove(tenant.id)}
                                                disabled={isProcessing}
                                                className="bg-green-600 hover:bg-green-700"
                                                size="sm"
                                            >
                                                {isProcessing ? (
                                                    <RefreshCw className="w-4 h-4 animate-spin" />
                                                ) : (
                                                    <>
                                                        <Check className="w-4 h-4 mr-1" />
                                                        Approve
                                                    </>
                                                )}
                                            </Button>
                                            <Button
                                                onClick={() => handleReject(tenant.id)}
                                                disabled={isProcessing}
                                                variant="outline"
                                                className="border-red-300 text-red-600 hover:bg-red-50"
                                                size="sm"
                                            >
                                                <X className="w-4 h-4 mr-1" />
                                                Reject
                                            </Button>
                                        </div>
                                    )}
                                </div>
                            </div>
                        );
                    })
                )}
            </div>

            {/* Add Tenant Modal */}
            {showAddModal && (
                <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50">
                    <div className="bg-white rounded-xl shadow-xl w-full max-w-md overflow-hidden">
                        <div className="px-6 py-4 border-b border-slate-100 flex items-center justify-between bg-slate-50">
                            <h3 className="font-semibold text-lg text-slate-900">Add New Tenant</h3>
                            <Button variant="ghost" size="icon" onClick={() => setShowAddModal(false)}>
                                <X className="w-5 h-5 text-slate-400" />
                            </Button>
                        </div>

                        <form onSubmit={handleAddTenant} className="p-6 space-y-4">
                            <div className="space-y-2">
                                <label className="text-sm font-medium text-slate-700">Company Name</label>
                                <input
                                    type="text"
                                    required
                                    className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-slate-500"
                                    value={addForm.name}
                                    onChange={e => setAddForm({ ...addForm, name: e.target.value })}
                                />
                            </div>

                            <div className="space-y-2">
                                <label className="text-sm font-medium text-slate-700">Admin Email</label>
                                <input
                                    type="email"
                                    required
                                    className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-slate-500"
                                    value={addForm.adminEmail}
                                    onChange={e => setAddForm({ ...addForm, adminEmail: e.target.value })}
                                />
                            </div>

                            <div className="space-y-2">
                                <label className="text-sm font-medium text-slate-700">Admin Password</label>
                                <input
                                    type="text"
                                    required
                                    className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-slate-500"
                                    value={addForm.adminPassword}
                                    onChange={e => setAddForm({ ...addForm, adminPassword: e.target.value })}
                                    placeholder="Temporary password"
                                />
                            </div>

                            <div className="grid grid-cols-2 gap-4">
                                <div className="space-y-2">
                                    <label className="text-sm font-medium text-slate-700">Plan</label>
                                    <select
                                        className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-slate-500"
                                        value={addForm.plan}
                                        onChange={e => setAddForm({ ...addForm, plan: e.target.value })}
                                    >
                                        <option value="standard">Standard</option>
                                        <option value="premium">Premium</option>
                                    </select>
                                </div>
                            </div>

                            {addForm.plan === 'premium' && (
                                <div className="space-y-2">
                                    <label className="text-sm font-medium text-slate-700">PayPal Subscription ID</label>
                                    <input
                                        type="text"
                                        className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-slate-500"
                                        value={addForm.subscriptionId}
                                        onChange={e => setAddForm({ ...addForm, subscriptionId: e.target.value })}
                                        placeholder="Optional (if paid)"
                                    />
                                    <p className="text-xs text-slate-500">Leave empty if not yet paid/linked.</p>
                                </div>
                            )}

                            <div className="flex gap-3 pt-4">
                                <Button
                                    type="button"
                                    variant="outline"
                                    className="flex-1"
                                    onClick={() => setShowAddModal(false)}
                                >
                                    Cancel
                                </Button>
                                <Button
                                    type="submit"
                                    className="flex-1 bg-slate-900 hover:bg-slate-800 text-white"
                                    disabled={addLoading}
                                >
                                    {addLoading ? <RefreshCw className="w-4 h-4 animate-spin" /> : 'Create Tenant'}
                                </Button>
                            </div>
                        </form>
                    </div>
                </div>
            )}
        </div>
    );
}
