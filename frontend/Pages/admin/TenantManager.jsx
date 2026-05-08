import React, { useState, useEffect, useMemo } from 'react';
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
import { WORKFLOW_MODE_LABELS, WORKFLOW_MODE_VALUES } from '@/src/features/settings/workflowMode.js';

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
const FORCE_NON_COMPLIANT_ALLOWED_STATES = new Set(['compliant_pending', 'compliant_active']);
const FORCE_NON_COMPLIANT_HELPER_TEXT = 'Platform force non-compliant override is only allowed from compliant_pending or compliant_active';

const deriveForceNonCompliantEligibility = (tenant) => {
    if (Object.prototype.hasOwnProperty.call(tenant || {}, 'can_force_non_compliant')) {
        return {
            allowed: tenant?.can_force_non_compliant === true,
            reason: String(tenant?.force_non_compliant_block_reason || FORCE_NON_COMPLIANT_HELPER_TEXT).trim()
        };
    }

    const modeState = String(tenant?.compliance_mode_state || '').trim();
    if (FORCE_NON_COMPLIANT_ALLOWED_STATES.has(modeState)) {
        return { allowed: true, reason: '' };
    }
    if (modeState === 'non_compliant_active') {
        return { allowed: false, reason: 'Tenant is already in non_compliant_active mode.' };
    }
    if (!modeState) {
        return { allowed: false, reason: 'Compliance mode has not been selected yet.' };
    }

    return { allowed: false, reason: FORCE_NON_COMPLIANT_HELPER_TEXT };
};

const getTenantEffectivePlan = (tenant = {}) => {
    if (tenant.effective_plan) return tenant.effective_plan;
    if (tenant.status === 'pending' || tenant.status === 'active') return 'premium';
    return tenant.plan || 'premium';
};

const formatTenantPlanLabel = (plan) => {
    const normalized = String(plan || '').trim().toLowerCase();
    if (normalized === 'premium') return 'Premium-capable';
    if (normalized === 'standard') return 'Standard';
    return normalized || 'Premium-capable';
};

const COMPLIANCE_REVIEW_FILTERS = [
    { value: 'needs_review', label: 'Needs review' },
    { value: 'verified', label: 'Verified' },
    { value: 'rejected', label: 'Rejected' },
    { value: 'revoked', label: 'Revoked' },
    { value: 'all', label: 'All' }
];

const COMPLIANCE_AUDIT_FILTERS = [
    { value: 'all', label: 'All events' },
    { value: 'verification', label: 'Verification' },
    { value: 'security', label: 'Security' },
    { value: 'blocked', label: 'Blocked ops' },
    { value: 'lifecycle', label: 'Lifecycle' }
];

const COMPLIANCE_SECTION_LABELS = {
    profile: 'Profile',
    settings: 'Settings',
    artifacts: 'Artifacts',
    peripherals: 'Peripherals',
    final_review: 'Final review'
};

const normalizeVerificationStatus = (value) => {
    const normalized = String(value || '').trim().toLowerCase();
    if (!normalized) return 'needs_review';
    if (['pending', 'pending_review', 'needs_review', 'for_review'].includes(normalized)) {
        return 'needs_review';
    }
    if (normalized === 'verified') return 'verified';
    if (normalized === 'rejected') return 'rejected';
    if (normalized === 'revoked') return 'revoked';
    return normalized;
};

const verificationStatusBadgeClass = (status) => {
    if (status === 'verified') return 'bg-emerald-100 text-emerald-700 border-emerald-200';
    if (status === 'rejected') return 'bg-rose-100 text-rose-700 border-rose-200';
    if (status === 'revoked') return 'bg-slate-100 text-slate-700 border-slate-200';
    return 'bg-amber-100 text-amber-700 border-amber-200';
};

const sectionProgressBadgeClass = (status) => {
    if (status === 'complete') return 'bg-emerald-100 text-emerald-700 border-emerald-200';
    if (status === 'in_progress') return 'bg-sky-100 text-sky-700 border-sky-200';
    if (status === 'blocked') return 'bg-rose-100 text-rose-700 border-rose-200';
    return 'bg-amber-100 text-amber-700 border-amber-200';
};

const securityIncidentStatusBadgeClass = (status) => {
    if (status === 'resolved') return 'bg-emerald-100 text-emerald-700 border-emerald-200';
    if (status === 'acknowledged') return 'bg-sky-100 text-sky-700 border-sky-200';
    return 'bg-rose-100 text-rose-700 border-rose-200';
};

const categorizeAuditEvent = (eventType) => {
    const normalized = String(eventType || '').trim().toLowerCase();
    if (['artifact_verification', 'peripheral_verification'].includes(normalized)) return 'verification';
    if (
        ['security_login', 'security_logout', 'security_sensitive_action', 'security_signal'].includes(normalized)
        || normalized.startsWith('security_')
    ) {
        return 'security';
    }
    if (normalized === 'blocked_operation') return 'blocked';
    if (['mode_selection', 'mode_upgrade', 'mode_activation', 'mode_force_non_compliant', 'mode_revert_non_compliant'].includes(normalized)) return 'lifecycle';
    return 'all';
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
        plan: 'premium',
        complianceMode: 'non_compliant',
        workflowMode: 'food_manufacturing'
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
    const [complianceChecklist, setComplianceChecklist] = useState(null);
    const [complianceAuditLogs, setComplianceAuditLogs] = useState([]);
    const [complianceSecurityIncidents, setComplianceSecurityIncidents] = useState([]);
    const [complianceFilter, setComplianceFilter] = useState('needs_review');
    const [complianceAuditFilter, setComplianceAuditFilter] = useState('all');
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
                plan: 'premium',
                complianceMode: 'non_compliant',
                workflowMode: 'food_manufacturing'
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
            plan: getTenantEffectivePlan(tenant)
        });
        setShowEditModal(true);
    };

    const handleEditTenant = async (e) => {
        e.preventDefault();
        setEditLoading(true);
        try {
            const payload = { status: editForm.status };
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

    const handleForceNonCompliant = async (tenant) => {
        if (!tenant?.id) return;
        const eligibility = deriveForceNonCompliantEligibility(tenant);
        if (!eligibility.allowed) {
            toast.error(eligibility.reason || FORCE_NON_COMPLIANT_HELPER_TEXT);
            return;
        }
        const reason = prompt(`Force "${tenant.name}" back to non-compliant mode.\n\nReason (required):`);
        if (reason === null) return;
        if (!String(reason || '').trim() || String(reason || '').trim().length < 3) {
            toast.error('Reason is required and must be at least 3 characters.');
            return;
        }
        setActionLoading(tenant.id);
        try {
            await adminService.forceTenantNonCompliant(tenant.id, { reason: String(reason).trim() });
            await loadTenants();
            toast.success(`${tenant.name} forced to non-compliant mode`);
        } catch (err) {
            const normalized = normalizeApiError(err);
            if (!normalized.isGlobalCandidate) {
                toast.error(`Failed to force non-compliant mode: ${normalized.message}`);
            }
        } finally {
            setActionLoading(null);
        }
    };

    const loadTenantComplianceData = async (tenantId) => {
        setComplianceLoading(true);
        try {
            const [artifactsResult, peripheralsResult, checklistResult, auditLogsResult, incidentsResult] = await Promise.allSettled([
                adminService.listTenantComplianceArtifacts(tenantId),
                adminService.listTenantCompliancePeripherals(tenantId),
                adminService.getTenantComplianceChecklist(tenantId),
                adminService.listTenantComplianceAuditLogs(tenantId, { limit: 120 }),
                adminService.listTenantComplianceSecurityIncidents(tenantId, { limit: 200 })
            ]);

            setComplianceArtifacts(
                artifactsResult.status === 'fulfilled'
                    ? (artifactsResult.value?.data?.artifacts || [])
                    : []
            );
            setCompliancePeripherals(
                peripheralsResult.status === 'fulfilled'
                    ? (peripheralsResult.value?.data?.peripherals || [])
                    : []
            );
            setComplianceChecklist(
                checklistResult.status === 'fulfilled'
                    ? (checklistResult.value?.data || null)
                    : null
            );
            setComplianceAuditLogs(
                auditLogsResult.status === 'fulfilled'
                    ? (auditLogsResult.value?.data?.logs || [])
                    : []
            );
            setComplianceSecurityIncidents(
                incidentsResult.status === 'fulfilled'
                    ? (incidentsResult.value?.data?.incidents || [])
                    : []
            );

            const failedSections = [
                artifactsResult.status === 'rejected' ? 'artifacts' : null,
                peripheralsResult.status === 'rejected' ? 'peripherals' : null,
                checklistResult.status === 'rejected' ? 'checklist' : null,
                auditLogsResult.status === 'rejected' ? 'audit history' : null,
                incidentsResult.status === 'rejected' ? 'security incidents' : null
            ].filter(Boolean);

            if (failedSections.length > 0) {
                toast.error(`Some compliance sections failed to load: ${failedSections.join(', ')}`);
            }
        } catch (err) {
            const normalized = normalizeApiError(err);
            if (!normalized.isGlobalCandidate) {
                toast.error(`Failed to load compliance records: ${normalized.message}`);
            }
            setComplianceArtifacts([]);
            setCompliancePeripherals([]);
            setComplianceChecklist(null);
            setComplianceAuditLogs([]);
            setComplianceSecurityIncidents([]);
        } finally {
            setComplianceLoading(false);
        }
    };

    const openComplianceModal = async (tenant) => {
        setSelectedComplianceTenant(tenant);
        setShowComplianceModal(true);
        setVerificationNote('');
        setVerificationEvidenceRef('');
        setComplianceFilter('needs_review');
        setComplianceAuditFilter('all');
        await loadTenantComplianceData(tenant.id);
    };

    const closeComplianceModal = () => {
        setShowComplianceModal(false);
        setSelectedComplianceTenant(null);
        setComplianceArtifacts([]);
        setCompliancePeripherals([]);
        setComplianceChecklist(null);
        setComplianceAuditLogs([]);
        setComplianceSecurityIncidents([]);
        setVerificationNote('');
        setVerificationEvidenceRef('');
        setComplianceActionLoading('');
        setComplianceAuditFilter('all');
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

    const handleSecurityIncidentStatus = async (incidentId, action) => {
        if (!selectedComplianceTenant?.id) return;
        const actionKey = `incident:${incidentId}:${action}`;
        setComplianceActionLoading(actionKey);
        try {
            if (action === 'acknowledge') {
                await adminService.acknowledgeTenantComplianceSecurityIncident(
                    selectedComplianceTenant.id,
                    incidentId,
                    {
                        note: verificationNote.trim() || null,
                        evidence_ref: verificationEvidenceRef.trim() || null
                    }
                );
            } else {
                await adminService.resolveTenantComplianceSecurityIncident(
                    selectedComplianceTenant.id,
                    incidentId,
                    {
                        note: verificationNote.trim() || null,
                        evidence_ref: verificationEvidenceRef.trim() || null
                    }
                );
            }

            toast.success(`Incident ${action}d successfully`);
            await loadTenantComplianceData(selectedComplianceTenant.id);
        } catch (err) {
            const normalized = normalizeApiError(err);
            if (!normalized.isGlobalCandidate) {
                toast.error(`Failed incident ${action}: ${normalized.message}`);
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
    const filterByComplianceStatus = (records = []) => {
        if (complianceFilter === 'all') return records;
        if (complianceFilter === 'needs_review') {
            return records.filter((entry) => normalizeVerificationStatus(entry.verification_status) === 'needs_review');
        }
        return records.filter((entry) => normalizeVerificationStatus(entry.verification_status) === complianceFilter);
    };
    const complianceFilterCounts = useMemo(() => {
        const allRecords = [...complianceArtifacts, ...compliancePeripherals];
        const counts = {
            needs_review: 0,
            verified: 0,
            rejected: 0,
            revoked: 0,
            all: allRecords.length
        };

        allRecords.forEach((entry) => {
            const normalizedStatus = normalizeVerificationStatus(entry?.verification_status);
            if (Object.prototype.hasOwnProperty.call(counts, normalizedStatus)) {
                counts[normalizedStatus] += 1;
            }
        });

        return counts;
    }, [complianceArtifacts, compliancePeripherals]);

    const complianceSectionProgressEntries = useMemo(() => {
        const sectionProgress = complianceChecklist?.section_progress;
        if (!sectionProgress || typeof sectionProgress !== 'object') return [];
        return Object.entries(sectionProgress)
            .filter(([key]) => Object.prototype.hasOwnProperty.call(COMPLIANCE_SECTION_LABELS, key))
            .map(([key, value]) => ({
                key,
                label: COMPLIANCE_SECTION_LABELS[key] || key,
                status: String(value?.status || 'not_started'),
                complete: Number(value?.complete || 0),
                total: Number(value?.total || 0)
            }));
    }, [complianceChecklist]);

    const complianceAuditFilterCounts = useMemo(() => {
        const counts = {
            all: complianceAuditLogs.length,
            verification: 0,
            security: 0,
            blocked: 0,
            lifecycle: 0
        };

        complianceAuditLogs.forEach((entry) => {
            const category = categorizeAuditEvent(entry?.event_type);
            if (Object.prototype.hasOwnProperty.call(counts, category)) {
                counts[category] += 1;
            }
        });

        return counts;
    }, [complianceAuditLogs]);

    const visibleComplianceAuditLogs = useMemo(() => {
        if (complianceAuditFilter === 'all') return complianceAuditLogs;
        return complianceAuditLogs.filter((entry) => categorizeAuditEvent(entry?.event_type) === complianceAuditFilter);
    }, [complianceAuditFilter, complianceAuditLogs]);

    const securityIncidentSummary = useMemo(() => {
        const summary = {
            total: complianceSecurityIncidents.length,
            open: 0,
            acknowledged: 0,
            resolved: 0
        };

        complianceSecurityIncidents.forEach((entry) => {
            const status = String(entry?.status || '').trim().toLowerCase();
            if (status === 'resolved') {
                summary.resolved += 1;
            } else if (status === 'acknowledged') {
                summary.acknowledged += 1;
                summary.open += 1;
            } else {
                summary.open += 1;
            }
        });

        return summary;
    }, [complianceSecurityIncidents]);

    const visibleArtifacts = filterByComplianceStatus(complianceArtifacts);
    const visiblePeripherals = filterByComplianceStatus(compliancePeripherals);

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
                                <div className="flex flex-col gap-4 xl:flex-row xl:items-start xl:justify-between">
                                    <div className="flex-1 min-w-0">
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

                                        <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4 text-sm mt-4">
                                            <div className="flex items-center gap-2 text-slate-600">
                                                <Mail className="w-4 h-4 text-slate-400" />
                                                <span className="truncate" title={tenant.admin_email || 'N/A'}>
                                                    {tenant.admin_email || 'N/A'}
                                                </span>
                                            </div>
                                            <div className="flex items-center gap-2 text-slate-600">
                                                <Key className="w-4 h-4 text-slate-400" />
                                                <code className="bg-slate-100 px-2 py-0.5 rounded text-xs break-all">
                                                    {tenant.company_token}
                                                </code>
                                            </div>
                                            <div className="flex items-center gap-2 text-slate-600">
                                                <Calendar className="w-4 h-4 text-slate-400" />
                                                <span>{formatDate(tenant.createdAt)}</span>
                                            </div>
                                            <div className="flex items-center gap-2 text-slate-600">
                                                <span className="text-slate-400">Plan:</span>
                                                <span>{formatTenantPlanLabel(getTenantEffectivePlan(tenant))}</span>
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
                                    <div className="w-full xl:w-auto xl:min-w-[320px] xl:max-w-[380px]">
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
                                            <div className="space-y-2">
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
                                                    {(() => {
                                                        const forceEligibility = deriveForceNonCompliantEligibility(tenant);
                                                        return (
                                                            <Button
                                                                onClick={() => handleForceNonCompliant(tenant)}
                                                                variant="outline"
                                                                size="sm"
                                                                disabled={isProcessing || !forceEligibility.allowed}
                                                                className="border-amber-300 text-amber-700 hover:bg-amber-50"
                                                                title={forceEligibility.allowed ? 'Force non-compliant' : forceEligibility.reason}
                                                            >
                                                                Force non-compliant
                                                            </Button>
                                                        );
                                                    })()}
                                                </div>
                                                {(() => {
                                                    const forceEligibility = deriveForceNonCompliantEligibility(tenant);
                                                    return !forceEligibility.allowed ? (
                                                        <p className="text-[10px] text-slate-500">
                                                            {forceEligibility.reason}
                                                        </p>
                                                    ) : null;
                                                })()}
                                                <div className="flex flex-wrap items-center gap-2">
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
                            <div className="grid md:grid-cols-5 gap-3">
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
                                        {complianceFilterCounts.verified}
                                    </div>
                                </div>
                                <div className="rounded-lg border border-slate-200 bg-slate-50 p-3">
                                    <div className="text-xs text-slate-500">Audit Events</div>
                                    <div className="text-lg font-semibold text-slate-900">{complianceAuditLogs.length}</div>
                                </div>
                                <div className="rounded-lg border border-slate-200 bg-slate-50 p-3">
                                    <div className="text-xs text-slate-500">Open Incidents</div>
                                    <div className="text-lg font-semibold text-slate-900">{securityIncidentSummary.open}</div>
                                </div>
                            </div>

                            {complianceChecklist && (
                                <div className="rounded-lg border border-slate-200 bg-slate-50 p-3 space-y-2">
                                    <p className="text-sm font-semibold text-slate-900">
                                        Activation readiness: {complianceChecklist.ready_for_compliant_activation ? 'Ready' : 'Blocked'}
                                    </p>
                                    {complianceSectionProgressEntries.length > 0 && (
                                        <div className="grid md:grid-cols-5 gap-2">
                                            {complianceSectionProgressEntries.map((entry) => (
                                                <div key={entry.key} className="rounded-md border border-slate-200 bg-white px-2.5 py-2">
                                                    <p className="text-xs font-semibold text-slate-900">{entry.label}</p>
                                                    <div className="mt-1 flex items-center justify-between gap-2">
                                                        <span className={`inline-flex items-center rounded-full border px-2 py-0.5 text-[10px] font-semibold ${sectionProgressBadgeClass(entry.status)}`}>
                                                            {entry.status}
                                                        </span>
                                                        <span className="text-[11px] text-slate-600">{entry.complete}/{entry.total}</span>
                                                    </div>
                                                </div>
                                            ))}
                                        </div>
                                    )}
                                    {Array.isArray(complianceChecklist.activation_blockers) && complianceChecklist.activation_blockers.length > 0 ? (
                                        <ul className="list-disc pl-5 text-xs text-slate-700 space-y-1">
                                            {complianceChecklist.activation_blockers.map((blocker) => (
                                                <li key={`${blocker.code}-${blocker.section}`}>
                                                    {blocker.message}
                                                </li>
                                            ))}
                                        </ul>
                                    ) : (
                                        <p className="text-xs text-emerald-700">No checklist blockers found.</p>
                                    )}
                                </div>
                            )}

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

                            <div className="flex flex-wrap items-center gap-2">
                                <label className="text-sm font-medium text-slate-700">Review Filter</label>
                                <select
                                    className="rounded-md border border-slate-300 px-2 py-1.5 text-sm"
                                    value={complianceFilter}
                                    onChange={(event) => setComplianceFilter(event.target.value)}
                                >
                                    {COMPLIANCE_REVIEW_FILTERS.map((entry) => (
                                        <option key={entry.value} value={entry.value}>
                                            {entry.label} ({complianceFilterCounts[entry.value] || 0})
                                        </option>
                                    ))}
                                </select>
                                <span className="text-xs text-slate-500">
                                    Review queue: {complianceFilterCounts.needs_review} pending decision
                                </span>
                            </div>

                            <div className="rounded-lg border border-slate-200 bg-slate-50 p-3 space-y-2">
                                <div className="flex flex-wrap items-center justify-between gap-2">
                                    <p className="text-sm font-semibold text-slate-900">Security Incident Workflow</p>
                                    <span className="text-xs text-slate-600">
                                        Open: {securityIncidentSummary.open} | Acknowledged: {securityIncidentSummary.acknowledged} | Resolved: {securityIncidentSummary.resolved}
                                    </span>
                                </div>
                                {complianceSecurityIncidents.length === 0 ? (
                                    <p className="text-xs text-slate-600">No security incidents recorded for this tenant.</p>
                                ) : (
                                    <div className="max-h-56 overflow-y-auto space-y-2">
                                        {complianceSecurityIncidents.map((incident) => {
                                            const incidentId = String(incident?.incident_id || '').trim();
                                            const status = String(incident?.status || 'new').trim().toLowerCase();
                                            const canAcknowledge = status === 'new';
                                            const canResolve = status !== 'resolved';
                                            const acknowledgeLoading = complianceActionLoading === `incident:${incidentId}:acknowledge`;
                                            const resolveLoading = complianceActionLoading === `incident:${incidentId}:resolve`;

                                            return (
                                                <div
                                                    key={incidentId || `${incident?.signal_code}-${incident?.updated_at}`}
                                                    className="rounded-md border border-slate-200 bg-white px-3 py-2"
                                                >
                                                    <div className="flex flex-wrap items-center justify-between gap-2">
                                                        <p className="text-xs font-semibold uppercase tracking-wide text-slate-700">
                                                            {incident?.signal_code || 'security_signal'}
                                                        </p>
                                                        <span className={`inline-flex items-center rounded-full border px-2 py-0.5 text-[10px] font-semibold ${securityIncidentStatusBadgeClass(status)}`}>
                                                            {status}
                                                        </span>
                                                    </div>
                                                    <p className="text-[11px] text-slate-600">
                                                        Severity: {incident?.severity || 'warning'} | Updated: {incident?.updated_at ? formatDate(incident.updated_at) : 'N/A'}
                                                    </p>
                                                    {incident?.dispatch ? (
                                                        <p className="text-[11px] text-slate-600">
                                                            Dispatch: {incident.dispatch.delivery_status || 'recorded'}
                                                            {incident.dispatch.channel ? ` via ${incident.dispatch.channel}` : ''}
                                                            {incident.dispatch.attempted_at ? ` at ${formatDate(incident.dispatch.attempted_at)}` : ''}
                                                        </p>
                                                    ) : null}
                                                    {incident?.dispatch?.target_configured === false ? (
                                                        <p className="text-[11px] text-amber-700">Dispatch target is not configured for this channel.</p>
                                                    ) : null}
                                                    {incident?.dispatch?.dispatch_reference ? (
                                                        <p className="text-[11px] text-slate-500">Dispatch reference: {incident.dispatch.dispatch_reference}</p>
                                                    ) : null}
                                                    {incident?.dispatch?.error ? (
                                                        <p className="text-[11px] text-rose-600">Dispatch error: {incident.dispatch.error}</p>
                                                    ) : null}
                                                    {incident?.latest_note ? (
                                                        <p className="text-[11px] text-slate-500">Note: {incident.latest_note}</p>
                                                    ) : null}
                                                    <div className="mt-2 flex flex-wrap items-center gap-2">
                                                        <Button
                                                            size="sm"
                                                            variant="outline"
                                                            className="h-7 text-[11px]"
                                                            disabled={!canAcknowledge || acknowledgeLoading || !incidentId}
                                                            onClick={() => handleSecurityIncidentStatus(incidentId, 'acknowledge')}
                                                        >
                                                            {acknowledgeLoading ? 'Acknowledging...' : 'Acknowledge'}
                                                        </Button>
                                                        <Button
                                                            size="sm"
                                                            className="h-7 text-[11px] bg-emerald-600 hover:bg-emerald-700"
                                                            disabled={!canResolve || resolveLoading || !incidentId}
                                                            onClick={() => handleSecurityIncidentStatus(incidentId, 'resolve')}
                                                        >
                                                            {resolveLoading ? 'Resolving...' : 'Resolve'}
                                                        </Button>
                                                    </div>
                                                </div>
                                            );
                                        })}
                                    </div>
                                )}
                            </div>

                            <div className="rounded-lg border border-slate-200 bg-slate-50 p-3 space-y-2">
                                <div className="flex flex-wrap items-center justify-between gap-2">
                                    <p className="text-sm font-semibold text-slate-900">Audit Trail Evidence</p>
                                    <div className="flex items-center gap-2">
                                        <label className="text-xs font-medium text-slate-700">Event Filter</label>
                                        <select
                                            className="rounded-md border border-slate-300 bg-white px-2 py-1.5 text-xs"
                                            value={complianceAuditFilter}
                                            onChange={(event) => setComplianceAuditFilter(event.target.value)}
                                        >
                                            {COMPLIANCE_AUDIT_FILTERS.map((entry) => (
                                                <option key={entry.value} value={entry.value}>
                                                    {entry.label} ({complianceAuditFilterCounts[entry.value] || 0})
                                                </option>
                                            ))}
                                        </select>
                                    </div>
                                </div>
                                {visibleComplianceAuditLogs.length === 0 ? (
                                    <p className="text-xs text-slate-600">
                                        No audit events available for this filter.
                                    </p>
                                ) : (
                                    <div className="max-h-52 overflow-y-auto space-y-2">
                                        {visibleComplianceAuditLogs.map((entry) => {
                                            const normalizedEventType = String(entry?.event_type || 'unknown').replaceAll('_', ' ');
                                            const metadata = entry?.metadata && typeof entry.metadata === 'object' ? entry.metadata : null;
                                            const metadataSummary = metadata
                                                ? Object.entries(metadata)
                                                    .slice(0, 3)
                                                    .map(([key, value]) => `${key}: ${String(value)}`)
                                                    .join(' | ')
                                                : null;

                                            return (
                                                <div
                                                    key={entry?.tenant_compliance_audit_log_id || `${entry?.event_type}-${entry?.created_at}`}
                                                    className="rounded-md border border-slate-200 bg-white px-3 py-2"
                                                >
                                                    <div className="flex flex-wrap items-center justify-between gap-2">
                                                        <p className="text-xs font-semibold uppercase tracking-wide text-slate-700">{normalizedEventType}</p>
                                                        <span className="text-[11px] text-slate-500">
                                                            {entry?.created_at ? formatDate(entry.created_at) : 'N/A'}
                                                        </span>
                                                    </div>
                                                    <p className="text-xs text-slate-600">
                                                        Decision: {entry?.decision || 'N/A'} | Reason: {entry?.reason_code || 'N/A'}
                                                    </p>
                                                    {metadataSummary ? (
                                                        <p className="text-[11px] text-slate-500">{metadataSummary}</p>
                                                    ) : null}
                                                </div>
                                            );
                                        })}
                                    </div>
                                )}
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
                                            {complianceArtifacts.length === 0 && compliancePeripherals.length === 0 && (
                                                <p className="text-sm text-slate-500">No compliance records submitted yet for this tenant.</p>
                                            )}
                                            {visibleArtifacts.length === 0 ? (
                                                <p className="text-sm text-slate-500">No artifacts match this filter.</p>
                                            ) : visibleArtifacts.map((artifact) => {
                                                const artifactId = artifact.tenant_compliance_artifact_id;
                                                const normalizedStatus = normalizeVerificationStatus(artifact.verification_status);
                                                return (
                                                    <div key={artifactId} className="rounded-lg border border-slate-200 p-3">
                                                        <p className="text-sm font-semibold text-slate-900">{artifact.artifact_name}</p>
                                                        <p className="text-xs text-slate-500">Type: {artifact.artifact_type}</p>
                                                        <div className="mt-1 flex items-center gap-2">
                                                            <span className="text-xs text-slate-500">Status: {artifact.status}</span>
                                                            <span className={`inline-flex items-center rounded-full border px-2 py-0.5 text-[10px] font-semibold ${verificationStatusBadgeClass(normalizedStatus)}`}>
                                                                {normalizedStatus}
                                                            </span>
                                                        </div>
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
                                            {visiblePeripherals.length === 0 ? (
                                                <p className="text-sm text-slate-500">No peripherals match this filter.</p>
                                            ) : visiblePeripherals.map((peripheral) => {
                                                const peripheralId = peripheral.tenant_compliance_peripheral_id;
                                                const normalizedStatus = normalizeVerificationStatus(peripheral.verification_status);
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
                                                        <div className="mt-1 flex items-center gap-2">
                                                            <span className="text-xs text-slate-500">Status: {peripheral.status}</span>
                                                            <span className={`inline-flex items-center rounded-full border px-2 py-0.5 text-[10px] font-semibold ${verificationStatusBadgeClass(normalizedStatus)}`}>
                                                                {normalizedStatus}
                                                            </span>
                                                        </div>
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

                            <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
                                <div className="space-y-2">
                                    <label className="text-sm font-medium text-slate-700">Plan</label>
                                    <input
                                        type="text"
                                        className="w-full px-3 py-2 border border-slate-300 rounded-lg bg-slate-100 text-slate-600"
                                        value="Premium-capable"
                                        readOnly
                                    />
                                    <p className="text-xs text-slate-500">
                                        Registered tenants are premium-capable while subscription billing is paused.
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
                                        Compliant mode supports governed downgrade exceptions for platform admins and one-per-cycle tenant master-admin revert.
                                    </p>
                                </div>
                                <div className="space-y-2">
                                    <label className="text-sm font-medium text-slate-700">Business Mode</label>
                                    <select
                                        className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-slate-500"
                                        value={addForm.workflowMode}
                                        onChange={e => setAddForm({ ...addForm, workflowMode: e.target.value })}
                                    >
                                        {WORKFLOW_MODE_VALUES.map((mode) => (
                                            <option key={mode} value={mode}>{WORKFLOW_MODE_LABELS[mode] || mode}</option>
                                        ))}
                                    </select>
                                    <p className="text-xs text-slate-500">
                                        Controls initial IMS/POS workflow simplification for this tenant.
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
                                    className="w-full px-3 py-2 border border-slate-300 rounded-lg bg-slate-100 text-slate-600 capitalize"
                                    value={editForm.plan || 'premium'}
                                    readOnly
                                />
                                <p className="text-xs text-slate-500">
                                    Registered tenants stay premium-capable. Use billing flows when subscription automation returns.
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
