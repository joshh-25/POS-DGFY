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
    Key,
    Edit2,
    Trash2,
    AlertTriangle,
    RotateCcw,
    ShieldCheck,
    FileCheck2,
    HardDrive
} from 'lucide-react';
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import * as adminService from '@/services/adminService';
import { toast } from 'sonner';
import { normalizeApiError } from '@/src/utils/errorHandler.js';

const STATUS_CONFIG = {
    pending: { label: 'Pending', color: 'text-amber-600 bg-amber-50 border-amber-200', icon: Clock },
    active: { label: 'Active', color: 'text-green-600 bg-green-50 border-green-200', icon: CheckCircle },
    rejected: { label: 'Rejected', color: 'text-red-600 bg-red-50 border-red-200', icon: XCircle },
    inactive: { label: 'Inactive', color: 'text-slate-600 bg-slate-50 border-slate-200', icon: AlertCircle },
    failed: { label: 'Failed', color: 'text-red-600 bg-red-50 border-red-200', icon: XCircle },
};

const COMPLIANCE_MODE_LABELS = {
    non_compliant_active: 'Non-compliant',
    compliant_pending: 'Compliant (Pending)',
    compliant_active: 'Compliant (Active)'
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
    const billingControlsDisabled = true;
    const [addForm, setAddForm] = useState({
        name: '',
        adminEmail: '',
        adminPassword: '',
        plan: 'standard',
        complianceMode: 'non_compliant'
    });

    // Edit Tenant Modal State
    const [showEditModal, setShowEditModal] = useState(false);
    const [editForm, setEditForm] = useState({
        id: null,
        name: '', // Display only
        status: '',
        plan: ''
    });
    const [editLoading, setEditLoading] = useState(false);

    // Delete Tenant Modal State
    const [showDeleteModal, setShowDeleteModal] = useState(false);
    const [deleteForm, setDeleteForm] = useState({
        id: null,
        name: '',
        confirmName: ''
    });
    const [deleteLoading, setDeleteLoading] = useState(false);
    const [showComplianceModal, setShowComplianceModal] = useState(false);
    const [selectedComplianceTenant, setSelectedComplianceTenant] = useState(null);
    const [complianceLoading, setComplianceLoading] = useState(false);
    const [complianceActionLoading, setComplianceActionLoading] = useState('');
    const [complianceArtifacts, setComplianceArtifacts] = useState([]);
    const [compliancePeripherals, setCompliancePeripherals] = useState([]);
    const [verificationNote, setVerificationNote] = useState('');
    const [verificationEvidenceRef, setVerificationEvidenceRef] = useState('');

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
            toast.success('Tenant approved successfully');
        } catch (err) {
            const normalized = normalizeApiError(err);
            if (!normalized.isGlobalCandidate) {
                toast.error(`Failed to approve: ${normalized.message}`);
            }
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
            toast.success('Tenant rejected successfully');
        } catch (err) {
            const normalized = normalizeApiError(err);
            if (!normalized.isGlobalCandidate) {
                toast.error(`Failed to reject: ${normalized.message}`);
            }
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
                complianceMode: 'non_compliant'
            });
            loadTenants();
            toast.success('Tenant created successfully');
        } catch (err) {
            const normalized = normalizeApiError(err);
            if (!normalized.isGlobalCandidate) {
                toast.error(`Failed to create tenant: ${normalized.message}`);
            }
        } finally {
            setAddLoading(false);
        }
    };

    const openEditModal = (tenant) => {
        setEditForm({
            id: tenant.id,
            name: tenant.name,
            status: tenant.status,
            plan: tenant.plan
        });
        setShowEditModal(true);
    };

    const handleEditTenant = async (e) => {
        e.preventDefault();
        setEditLoading(true);
        try {
            const payload = { status: editForm.status };
            if (!billingControlsDisabled) {
                payload.plan = editForm.plan;
            }
            await adminService.updateTenant(editForm.id, payload);
            setShowEditModal(false);
            loadTenants();
            toast.success('Tenant updated successfully');
        } catch (err) {
            const normalized = normalizeApiError(err);
            if (!normalized.isGlobalCandidate) {
                toast.error(`Failed to update tenant: ${normalized.message}`);
            }
        } finally {
            setEditLoading(false);
        }
    };

    const openDeleteModal = (tenant) => {
        setDeleteForm({
            id: tenant.id,
            name: tenant.name,
            confirmName: ''
        });
        setShowDeleteModal(true);
    };

    const handleDeleteTenant = async (e) => {
        e.preventDefault();
        if (deleteForm.name !== deleteForm.confirmName) {
            return;
        }

        setDeleteLoading(true);
        try {
            await adminService.deleteTenant(deleteForm.id);
            setShowDeleteModal(false);
            loadTenants();
            toast.success('Tenant permanently deleted');
        } catch (err) {
            const normalized = normalizeApiError(err);
            if (!normalized.isGlobalCandidate) {
                toast.error(`Failed to delete tenant: ${normalized.message}`);
            }
        } finally {
            setDeleteLoading(false);
        }
    };

    // DISABLED - switching to PayMongo
    /*
    const handleSetupPayPal = async (tenantId) => {
        setActionLoading(tenantId);
        try {
            const response = await adminService.setupPayPalRecurring(tenantId);
            const approvalUrl = response.data?.approvalUrl;
            if (approvalUrl) {
                toast.success(`PayPal setup initiated. Share this approval link with the tenant:\n${approvalUrl}`, { duration: 10000 });
            } else {
                toast.success('PayPal setup initiated. The tenant will receive an email with the approval link.');
            }
            loadTenants();
        } catch (err) {
            const normalized = normalizeApiError(err);
            if (!normalized.isGlobalCandidate) {
                toast.error(`Failed to setup PayPal: ${normalized.message}`);
            }
        } finally {
            setActionLoading(null);
        }
    };
    */

    const handleReactivate = async (tenantId, tenantName) => {
        if (!confirm(`Reactivate "${tenantName}"? This will restore their access for 30 days.`)) return;
        setActionLoading(tenantId);
        try {
            await adminService.adminReactivateTenant(tenantId);
            loadTenants();
            toast.success(`${tenantName} reactivated successfully`);
        } catch (err) {
            const normalized = normalizeApiError(err);
            if (!normalized.isGlobalCandidate) {
                toast.error(`Failed to reactivate: ${normalized.message}`);
            }
        } finally {
            setActionLoading(null);
        }
    };

    const loadTenantComplianceData = async (tenantId) => {
        setComplianceLoading(true);
        try {
            const [artifactsResponse, peripheralsResponse] = await Promise.all([
                adminService.listTenantComplianceArtifacts(tenantId),
                adminService.listTenantCompliancePeripherals(tenantId)
            ]);

            setComplianceArtifacts(artifactsResponse?.data?.artifacts || []);
            setCompliancePeripherals(peripheralsResponse?.data?.peripherals || []);
        } catch (err) {
            const normalized = normalizeApiError(err);
            if (!normalized.isGlobalCandidate) {
                toast.error(`Failed to load compliance records: ${normalized.message}`);
            }
            setComplianceArtifacts([]);
            setCompliancePeripherals([]);
        } finally {
            setComplianceLoading(false);
        }
    };

    const openComplianceModal = async (tenant) => {
        setSelectedComplianceTenant(tenant);
        setShowComplianceModal(true);
        setVerificationNote('');
        setVerificationEvidenceRef('');
        await loadTenantComplianceData(tenant.id);
    };

    const closeComplianceModal = () => {
        setShowComplianceModal(false);
        setSelectedComplianceTenant(null);
        setComplianceArtifacts([]);
        setCompliancePeripherals([]);
        setVerificationNote('');
        setVerificationEvidenceRef('');
        setComplianceActionLoading('');
    };

    const getVerificationPayload = (action) => ({
        action,
        verification_note: verificationNote.trim() || null,
        verification_evidence_ref: verificationEvidenceRef.trim() || null
    });

    const handleArtifactVerification = async (artifactId, action) => {
        if (!selectedComplianceTenant?.id) return;
        const actionKey = `artifact:${artifactId}:${action}`;
        setComplianceActionLoading(actionKey);
        try {
            await adminService.updateTenantComplianceArtifactVerification(
                selectedComplianceTenant.id,
                artifactId,
                getVerificationPayload(action)
            );
            toast.success(`Artifact ${action} successful`);
            await loadTenantComplianceData(selectedComplianceTenant.id);
        } catch (err) {
            const normalized = normalizeApiError(err);
            if (!normalized.isGlobalCandidate) {
                toast.error(`Failed artifact ${action}: ${normalized.message}`);
            }
        } finally {
            setComplianceActionLoading('');
        }
    };

    const handlePeripheralVerification = async (peripheralId, action) => {
        if (!selectedComplianceTenant?.id) return;
        const actionKey = `peripheral:${peripheralId}:${action}`;
        setComplianceActionLoading(actionKey);
        try {
            await adminService.updateTenantCompliancePeripheralVerification(
                selectedComplianceTenant.id,
                peripheralId,
                getVerificationPayload(action)
            );
            toast.success(`Peripheral ${action} successful`);
            await loadTenantComplianceData(selectedComplianceTenant.id);
        } catch (err) {
            const normalized = normalizeApiError(err);
            if (!normalized.isGlobalCandidate) {
                toast.error(`Failed peripheral ${action}: ${normalized.message}`);
            }
        } finally {
            setComplianceActionLoading('');
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
                <div className="mt-4 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
                    Subscription plan-change and billing setup actions are disabled in the admin portal.
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
                                                {tenant.payment_method && (
                                                    <span className={cn(
                                                        "text-[10px] px-1.5 py-0.5 rounded font-medium",
                                                        tenant.payment_method === 'paypal'
                                                            ? "bg-blue-100 text-blue-700"
                                                            : "bg-slate-100 text-slate-500"
                                                    )}>
                                                        {tenant.payment_method}
                                                    </span>
                                                )}
                                                {tenant.pending_plan && (
                                                    <span className="text-[10px] px-1.5 py-0.5 rounded bg-indigo-100 text-indigo-700 font-medium">
                                                        {'->'} {tenant.pending_plan}
                                                    </span>
                                                )}
                                                {tenant.compliance_mode_choice_required ? (
                                                    <span className="text-[10px] px-1.5 py-0.5 rounded bg-amber-100 text-amber-800 font-medium">
                                                        Mode Selection Required
                                                    </span>
                                                ) : tenant.compliance_mode_state ? (
                                                    <span className="text-[10px] px-1.5 py-0.5 rounded bg-slate-100 text-slate-700 font-medium">
                                                        {COMPLIANCE_MODE_LABELS[tenant.compliance_mode_state] || tenant.compliance_mode_state}
                                                    </span>
                                                ) : null}
                                            </div>
                                        </div>
                                    </div>

                                    {/* Actions */}
                                    <div className="flex flex-col gap-2 ml-4">
                                        {tenant.status === 'pending' ? (
                                            <div className="flex items-center gap-2">
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
                                                <Button
                                                    onClick={() => openComplianceModal(tenant)}
                                                    disabled={isProcessing}
                                                    variant="outline"
                                                    className="border-indigo-300 text-indigo-700 hover:bg-indigo-50"
                                                    size="sm"
                                                >
                                                    <ShieldCheck className="w-4 h-4 mr-1" />
                                                    Compliance
                                                </Button>
                                            </div>
                                        ) : (
                                            <div className="flex flex-wrap items-center gap-2">
                                                {tenant.status === 'inactive' && (
                                                    <Button
                                                        onClick={() => handleReactivate(tenant.id, tenant.name)}
                                                        disabled={isProcessing}
                                                        className="bg-emerald-600 hover:bg-emerald-700 text-white"
                                                        size="sm"
                                                    >
                                                        {isProcessing ? (
                                                            <RefreshCw className="w-4 h-4 animate-spin" />
                                                        ) : (
                                                            <>
                                                                <RotateCcw className="w-4 h-4 mr-1" />
                                                                Reactivate
                                                            </>
                                                        )}
                                                    </Button>
                                                )}
                                                {/* DISABLED - switching to PayMongo */}
                                                {/* {tenant.status === 'active' && tenant.payment_method !== 'paypal' && (
                                                    <Button
                                                        onClick={() => handleSetupPayPal(tenant.id)}
                                                        disabled={isProcessing}
                                                        variant="outline"
                                                        size="sm"
                                                        className="border-blue-300 text-blue-700 hover:bg-blue-50"
                                                    >
                                                        {isProcessing ? (
                                                            <RefreshCw className="w-4 h-4 animate-spin" />
                                                        ) : (
                                                            <>
                                                                <CreditCard className="w-4 h-4 mr-1" />
                                                                Setup PayPal
                                                            </>
                                                        )}
                                                    </Button>
                                                )} */}
                                                <Button
                                                    onClick={() => openComplianceModal(tenant)}
                                                    variant="outline"
                                                    size="sm"
                                                    className="border-indigo-300 text-indigo-700 hover:bg-indigo-50"
                                                >
                                                    <ShieldCheck className="w-4 h-4 mr-1" />
                                                    Compliance
                                                </Button>
                                                <Button
                                                    onClick={() => openEditModal(tenant)}
                                                    variant="outline"
                                                    size="sm"
                                                    className="text-slate-600"
                                                >
                                                    <Edit2 className="w-4 h-4 mr-1" />
                                                    Edit
                                                </Button>
                                                <Button
                                                    onClick={() => openDeleteModal(tenant)}
                                                    variant="ghost"
                                                    size="sm"
                                                    className="text-red-600 hover:bg-red-50 hover:text-red-700"
                                                >
                                                    <Trash2 className="w-4 h-4" />
                                                </Button>
                                            </div>
                                        )}
                                    </div>
                                </div>
                            </div>
                        );
                    })
                )}
            </div>

            {/* Compliance Review Modal */}
            {showComplianceModal && selectedComplianceTenant && (
                <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50">
                    <div className="bg-white rounded-xl shadow-xl w-full max-w-6xl max-h-[90vh] overflow-y-auto">
                        <div className="px-6 py-4 border-b border-slate-100 flex items-start justify-between bg-slate-50">
                            <div>
                                <h3 className="font-semibold text-lg text-slate-900 flex items-center gap-2">
                                    <ShieldCheck className="w-5 h-5 text-indigo-700" />
                                    Compliance Verification Review
                                </h3>
                                <p className="text-sm text-slate-600 mt-1">
                                    Tenant: <strong>{selectedComplianceTenant.name}</strong>
                                </p>
                                <p className="text-xs text-slate-500">
                                    Mode: {COMPLIANCE_MODE_LABELS[selectedComplianceTenant.compliance_mode_state] || selectedComplianceTenant.compliance_mode_state || 'Not selected'}
                                </p>
                            </div>
                            <Button variant="ghost" size="icon" onClick={closeComplianceModal}>
                                <X className="w-5 h-5 text-slate-400" />
                            </Button>
                        </div>

                        <div className="p-6 space-y-4">
                            <div className="grid md:grid-cols-3 gap-3">
                                <div className="rounded-lg border border-slate-200 bg-slate-50 p-3">
                                    <div className="text-xs text-slate-500">Artifacts</div>
                                    <div className="text-lg font-semibold text-slate-900">{complianceArtifacts.length}</div>
                                </div>
                                <div className="rounded-lg border border-slate-200 bg-slate-50 p-3">
                                    <div className="text-xs text-slate-500">Peripherals</div>
                                    <div className="text-lg font-semibold text-slate-900">{compliancePeripherals.length}</div>
                                </div>
                                <div className="rounded-lg border border-slate-200 bg-slate-50 p-3">
                                    <div className="text-xs text-slate-500">Verified Records</div>
                                    <div className="text-lg font-semibold text-slate-900">
                                        {complianceArtifacts.filter((entry) => entry.verification_status === 'verified').length
                                            + compliancePeripherals.filter((entry) => entry.verification_status === 'verified').length}
                                    </div>
                                </div>
                            </div>

                            <div className="grid md:grid-cols-2 gap-3">
                                <div className="space-y-2">
                                    <label className="text-sm font-medium text-slate-700">Verification Note (optional)</label>
                                    <textarea
                                        className="w-full min-h-[82px] px-3 py-2 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-slate-500"
                                        value={verificationNote}
                                        onChange={(event) => setVerificationNote(event.target.value)}
                                        placeholder="Reason or reviewer context"
                                    />
                                </div>
                                <div className="space-y-2">
                                    <label className="text-sm font-medium text-slate-700">Evidence Reference (optional)</label>
                                    <input
                                        type="text"
                                        className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-slate-500"
                                        value={verificationEvidenceRef}
                                        onChange={(event) => setVerificationEvidenceRef(event.target.value)}
                                        placeholder="Ticket ID, file URL, or memo reference"
                                    />
                                    <p className="text-xs text-slate-500">
                                        This payload is sent with every verify, reject, or revoke action.
                                    </p>
                                </div>
                            </div>

                            {complianceLoading ? (
                                <div className="rounded-lg border border-slate-200 p-6 text-center">
                                    <RefreshCw className="w-6 h-6 text-slate-400 animate-spin mx-auto mb-2" />
                                    <p className="text-sm text-slate-600">Loading tenant compliance records...</p>
                                </div>
                            ) : (
                                <div className="grid lg:grid-cols-2 gap-4">
                                    <div className="rounded-lg border border-slate-200">
                                        <div className="px-4 py-3 border-b border-slate-100 bg-slate-50 flex items-center gap-2">
                                            <FileCheck2 className="w-4 h-4 text-slate-600" />
                                            <h4 className="text-sm font-semibold text-slate-900">Artifacts</h4>
                                        </div>
                                        <div className="p-4 space-y-3">
                                            {complianceArtifacts.length === 0 ? (
                                                <p className="text-sm text-slate-500">No artifacts submitted.</p>
                                            ) : complianceArtifacts.map((artifact) => {
                                                const artifactId = artifact.tenant_compliance_artifact_id;
                                                return (
                                                    <div key={artifactId} className="rounded-lg border border-slate-200 p-3">
                                                        <p className="text-sm font-semibold text-slate-900">{artifact.artifact_name}</p>
                                                        <p className="text-xs text-slate-500">Type: {artifact.artifact_type}</p>
                                                        <p className="text-xs text-slate-500">Status: {artifact.status} | Verification: {artifact.verification_status}</p>
                                                        <p className="text-xs text-slate-500">Verified at: {artifact.verified_at ? formatDate(artifact.verified_at) : 'N/A'}</p>
                                                        <div className="mt-2 flex flex-wrap gap-2">
                                                            {['verify', 'reject', 'revoke'].map((action) => (
                                                                <Button
                                                                    key={`${artifactId}-${action}`}
                                                                    size="sm"
                                                                    variant="outline"
                                                                    disabled={complianceActionLoading === `artifact:${artifactId}:${action}`}
                                                                    onClick={() => handleArtifactVerification(artifactId, action)}
                                                                >
                                                                    {complianceActionLoading === `artifact:${artifactId}:${action}` ? (
                                                                        <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                                                                    ) : action}
                                                                </Button>
                                                            ))}
                                                        </div>
                                                    </div>
                                                );
                                            })}
                                        </div>
                                    </div>

                                    <div className="rounded-lg border border-slate-200">
                                        <div className="px-4 py-3 border-b border-slate-100 bg-slate-50 flex items-center gap-2">
                                            <HardDrive className="w-4 h-4 text-slate-600" />
                                            <h4 className="text-sm font-semibold text-slate-900">Peripherals</h4>
                                        </div>
                                        <div className="p-4 space-y-3">
                                            {compliancePeripherals.length === 0 ? (
                                                <p className="text-sm text-slate-500">No peripherals submitted.</p>
                                            ) : compliancePeripherals.map((peripheral) => {
                                                const peripheralId = peripheral.tenant_compliance_peripheral_id;
                                                return (
                                                    <div key={peripheralId} className="rounded-lg border border-slate-200 p-3">
                                                        <p className="text-sm font-semibold text-slate-900">
                                                            {peripheral.brand} {peripheral.model}
                                                        </p>
                                                        <p className="text-xs text-slate-500">Class: {peripheral.device_class}</p>
                                                        <p className="text-xs text-slate-500">Serial: {peripheral.serial_number}</p>
                                                        <p className="text-xs text-slate-500">
                                                            Terminal: {peripheral.terminal_id || 'shared/unbound'} | Shared: {peripheral.is_shared ? 'yes' : 'no'}
                                                        </p>
                                                        <p className="text-xs text-slate-500">Status: {peripheral.status} | Verification: {peripheral.verification_status}</p>
                                                        <div className="mt-2 flex flex-wrap gap-2">
                                                            {['verify', 'reject', 'revoke'].map((action) => (
                                                                <Button
                                                                    key={`${peripheralId}-${action}`}
                                                                    size="sm"
                                                                    variant="outline"
                                                                    disabled={complianceActionLoading === `peripheral:${peripheralId}:${action}`}
                                                                    onClick={() => handlePeripheralVerification(peripheralId, action)}
                                                                >
                                                                    {complianceActionLoading === `peripheral:${peripheralId}:${action}` ? (
                                                                        <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                                                                    ) : action}
                                                                </Button>
                                                            ))}
                                                        </div>
                                                    </div>
                                                );
                                            })}
                                        </div>
                                    </div>
                                </div>
                            )}
                        </div>
                    </div>
                </div>
            )}

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
                                    <input
                                        type="text"
                                        className="w-full px-3 py-2 border border-slate-300 rounded-lg bg-slate-100 text-slate-600"
                                        value="Standard"
                                        readOnly
                                    />
                                    <p className="text-xs text-slate-500">
                                        Premium plan assignment is disabled while subscription billing is paused.
                                    </p>
                                </div>
                                <div className="space-y-2">
                                    <label className="text-sm font-medium text-slate-700">Compliance Mode</label>
                                    <select
                                        className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-slate-500"
                                        value={addForm.complianceMode}
                                        onChange={e => setAddForm({ ...addForm, complianceMode: e.target.value })}
                                    >
                                        <option value="non_compliant">Non-compliant POS</option>
                                        <option value="compliant">Compliant POS (Pending Activation)</option>
                                    </select>
                                    <p className="text-xs text-slate-500">
                                        Compliant mode is irreversible after activation.
                                    </p>
                                </div>
                            </div>

                            {/* DISABLED - switching to PayMongo */}
                            {/* {addForm.plan === 'premium' && (
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
                            )} */}

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
            {/* Edit Tenant Modal */}
            {showEditModal && (
                <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50">
                    <div className="bg-white rounded-xl shadow-xl w-full max-w-md overflow-hidden">
                        <div className="px-6 py-4 border-b border-slate-100 flex items-center justify-between bg-slate-50">
                            <h3 className="font-semibold text-lg text-slate-900">Edit Tenant</h3>
                            <Button variant="ghost" size="icon" onClick={() => setShowEditModal(false)}>
                                <X className="w-5 h-5 text-slate-400" />
                            </Button>
                        </div>

                        <form onSubmit={handleEditTenant} className="p-6 space-y-4">
                            <div className="bg-slate-50 p-3 rounded-lg border border-slate-100 mb-4">
                                <span className="text-xs text-slate-500 block">Company</span>
                                <span className="font-medium text-slate-900">{editForm.name}</span>
                            </div>

                            <div className="space-y-2">
                                <label className="text-sm font-medium text-slate-700">Status</label>
                                <select
                                    className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-slate-500"
                                    value={editForm.status}
                                    onChange={e => setEditForm({ ...editForm, status: e.target.value })}
                                >
                                    <option value="pending">Pending</option>
                                    <option value="active">Active</option>
                                    <option value="inactive">Inactive (Soft Delete)</option>
                                    <option value="rejected">Rejected</option>
                                </select>
                                <p className="text-xs text-slate-500">
                                    "Inactive" prevents users from logging in but keeps data.
                                </p>
                            </div>

                            <div className="space-y-2">
                                <label className="text-sm font-medium text-slate-700">Plan</label>
                                <input
                                    type="text"
                                    className="w-full px-3 py-2 border border-slate-300 rounded-lg bg-slate-100 text-slate-600"
                                    value={editForm.plan || 'standard'}
                                    readOnly
                                />
                                <p className="text-xs text-slate-500">
                                    Plan edits are disabled while subscription billing is paused.
                                </p>
                            </div>

                            <div className="flex gap-3 pt-4">
                                <Button
                                    type="button"
                                    variant="outline"
                                    className="flex-1"
                                    onClick={() => setShowEditModal(false)}
                                >
                                    Cancel
                                </Button>
                                <Button
                                    type="submit"
                                    className="flex-1 bg-slate-900 hover:bg-slate-800 text-white"
                                    disabled={editLoading}
                                >
                                    {editLoading ? <RefreshCw className="w-4 h-4 animate-spin" /> : 'Save Changes'}
                                </Button>
                            </div>
                        </form>
                    </div>
                </div>
            )}

            {/* Delete Tenant Modal */}
            {showDeleteModal && (
                <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50">
                    <div className="bg-white rounded-xl shadow-xl w-full max-w-md overflow-hidden border-2 border-red-100">
                        <div className="px-6 py-4 border-b border-red-50 flex items-center justify-between bg-red-50">
                            <h3 className="font-semibold text-lg text-red-900 flex items-center gap-2">
                                <AlertTriangle className="w-5 h-5" />
                                Permanent Delete
                            </h3>
                            <Button variant="ghost" size="icon" onClick={() => setShowDeleteModal(false)} className="text-red-900 hover:bg-red-100">
                                <X className="w-5 h-5" />
                            </Button>
                        </div>

                        <form onSubmit={handleDeleteTenant} className="p-6 space-y-4">
                            <div className="bg-red-50 p-4 rounded-lg text-sm text-red-800 border border-red-100">
                                <p className="font-bold mb-1">Warning: This action is irreversible.</p>
                                <p>This will permanently delete the tenant record and <strong>DROP the database</strong>. All data will be lost forever.</p>
                            </div>

                            <div className="space-y-2">
                                <label className="text-sm font-medium text-slate-700">
                                    Type <span className="font-bold select-all">"{deleteForm.name}"</span> to confirm:
                                </label>
                                <input
                                    type="text"
                                    required
                                    className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-red-500"
                                    value={deleteForm.confirmName}
                                    onChange={e => setDeleteForm({ ...deleteForm, confirmName: e.target.value })}
                                    placeholder="Type company name here"
                                    autoComplete="off"
                                    onPaste={(e) => e.preventDefault()}
                                />
                            </div>

                            <div className="flex gap-3 pt-4">
                                <Button
                                    type="button"
                                    variant="outline"
                                    className="flex-1"
                                    onClick={() => setShowDeleteModal(false)}
                                >
                                    Cancel
                                </Button>
                                <Button
                                    type="submit"
                                    className="flex-1 bg-red-600 hover:bg-red-700 text-white"
                                    disabled={deleteLoading || deleteForm.name !== deleteForm.confirmName}
                                >
                                    {deleteLoading ? <RefreshCw className="w-4 h-4 animate-spin" /> : 'Permanently Delete'}
                                </Button>
                            </div>
                        </form>
                    </div>
                </div>
            )}
        </div>
    );
}
