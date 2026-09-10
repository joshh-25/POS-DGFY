import React, { useState, useEffect, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import {
    Building2,
    Building,
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
    Edit2,
    Trash2,
    AlertTriangle,
    RotateCcw,
    ShieldCheck,
    FileCheck2,
    HardDrive,
    Search,
    Monitor,
    ShoppingCart,
    MapPin,
    Store,
    LayoutTemplate
} from 'lucide-react';
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import * as adminService from '@/services/adminService';
import { toast } from 'sonner';
import { normalizeApiError } from '../../../../packages/web-core/src/utils/errorHandler.js';
import {
    CAPABILITY_BLOCK_TITLE,
    TENANT_CAPABILITY_MESSAGES,
    getStorefrontAccessModeMessage
} from '../../../../packages/web-core/src/utils/tenantCapabilityMessages.js';
import { WORKFLOW_MODE_LABELS } from '../../../../packages/web-core/src/features/settings/workflowMode.js';
import IndustryPicker from '../../../../packages/web-core/src/features/registration/IndustryPicker.jsx';
import StorefrontCustomDomainsModal from '../../../../packages/web-core/src/features/admin/components/StorefrontCustomDomainsModal.jsx';
import TenantRevenueSettlementPanel from '../../../../packages/web-core/src/features/admin/tenantRevenue/TenantRevenueSettlementPanel.jsx';

const STATUS_CONFIG = {
    pending: { label: 'Pending', color: 'text-amber-600 bg-amber-50 border-amber-200', icon: Clock },
    active: { label: 'Active', color: 'text-green-600 bg-green-50 border-green-200', icon: CheckCircle },
    rejected: { label: 'Rejected', color: 'text-red-600 bg-red-50 border-red-200', icon: XCircle },
    inactive: { label: 'Inactive', color: 'text-slate-600 bg-slate-50 border-slate-200', icon: AlertCircle },
    failed: { label: 'Failed', color: 'text-red-600 bg-red-50 border-red-200', icon: XCircle },
};

const getTenantRegistrationAction = (tenant) => {
    if (tenant?.registration_action && typeof tenant.registration_action === 'object') {
        return {
            action: tenant.registration_action.allowed === true
                ? (tenant.registration_action.action || 'reconcile')
                : (tenant.registration_action.action === 'setting_up' ? 'setting_up' : 'reconcile'),
            helperText: tenant.registration_action.helper_text || 'Registration state does not allow this action.'
        };
    }

    // Keep the UI safe during a rolling deploy where the older API does not
    // return registration_action yet. Unknown or missing application state is
    // never treated as approval-eligible.
    if (tenant?.status !== 'pending') return null;
    const application = tenant.registrationApplication;
    if (application?.review_status === 'pending' && application?.provisioning_status === 'not_started') {
        return { action: 'approve', helperText: 'Approve the pending public registration.' };
    }
    if (application?.review_status === 'approved' && application?.provisioning_status === 'failed') {
        return { action: 'retry', helperText: 'Retry the failed tenant setup.' };
    }
    if (application?.review_status === 'approved' && application?.provisioning_status === 'in_progress') {
        return { action: 'setting_up', helperText: 'Company setup is already in progress.' };
    }
    return { action: 'reconcile', helperText: 'No pending public registration is available for approval.' };
};

const COMPLIANCE_MODE_LABELS = {
    non_compliant_active: 'Non-compliant',
    compliant_pending: 'Compliant (Pending)',
    compliant_active: 'Compliant (Active)'
};
const CUSTOMER_ACCESS_MODE_OPTIONS = [
    { value: 'ghost', label: 'Map listing only' },
    { value: 'catalog', label: 'Catalog only' },
    { value: 'inquiry', label: 'Inquiry mode' },
    { value: 'transaction', label: 'Online ordering mode' }
];
const CUSTOMER_ACCESS_MODE_DETAILS = {
    ghost: 'Map, location, and contact only',
    catalog: 'Browse catalog without customer actions',
    inquiry: 'Catalog plus inquiry/contact CTAs',
    transaction: 'Ordering and booking when ready'
};
const CUSTOMER_ACCESS_REGISTRATION_STAGE_OPTIONS = [
    { value: 'informal', label: 'Informal', detail: 'Catalog maximum; checkout remains capped.' },
    { value: 'partial', label: 'Partial', detail: 'Inquiry maximum while registration evidence is incomplete.' },
    { value: 'registered', label: 'Registered', detail: 'Transaction-capable when platform max and company request also allow it.' }
];
const CUSTOMER_ACCESS_MODE_RANK = {
    ghost: 0,
    catalog: 1,
    inquiry: 2,
    transaction: 3
};
const DEFAULT_TENANT_CAPABILITIES = {
    ims_enabled: true,
    pos_enabled: true,
    storefront_visible: false,
    customer_access_mode: 'catalog',
    requested_customer_access_mode: 'catalog',
    effective_customer_access_mode: 'catalog',
    max_customer_access_mode: 'catalog',
    platform_max_customer_access_mode: 'transaction',
    registration_stage_max_customer_access_mode: 'catalog',
    registration_stage: 'informal',
    customer_access_limitation_reason: null,
    customer_access_modes_enabled: true,
    access_capabilities: null
};
const FORCE_NON_COMPLIANT_ALLOWED_STATES = new Set(['compliant_pending', 'compliant_active']);
const FORCE_NON_COMPLIANT_HELPER_TEXT = 'Platform force non-compliant override is only allowed from compliant_pending or compliant_active';
const COMPLIANCE_ADMIN_ACTIONS = {
    SELECT_MODE: 'select_mode',
    UPGRADE_TO_COMPLIANT_PENDING: 'upgrade_to_compliant_pending',
    FORCE_NON_COMPLIANT: 'force_non_compliant',
    NONE: 'none'
};
const COMPLIANCE_ACTION_COPY = {
    select_non_compliant: {
        title: 'Set non-compliant POS mode',
        confirmLabel: 'Set non-compliant',
        effect: 'POS access uses non-fiscal slips. Fiscal invoice output stays disabled.'
    },
    select_compliant: {
        title: 'Set compliant pending mode',
        confirmLabel: 'Set compliant pending',
        effect: 'POS remains available, but fiscal issuance waits for checklist activation.'
    },
    upgrade_to_compliant_pending: {
        title: 'Move to compliant pending',
        confirmLabel: 'Move to compliant pending',
        effect: 'The tenant enters the compliant path. Fiscal issuance still waits for checklist activation.'
    },
    force_non_compliant: {
        title: 'Force non-compliant mode',
        confirmLabel: 'Force non-compliant',
        effect: 'Fiscal output is disabled and the tenant returns to non-fiscal POS access.'
    }
};
const POS_SOFTWARE_FIELDS = [
    { key: 'pos_software_name', label: 'Software Name', placeholder: 'DGFY POS' },
    { key: 'pos_software_version', label: 'Software Version', placeholder: 'Installed version' },
    { key: 'pos_software_serial_number', label: 'Software Serial Number', placeholder: 'Software/license serial' }
];
const POS_RECEIPT_METADATA_LABELS = {
    pos_registered_name: 'Registered Name',
    pos_business_name: 'Business Name',
    pos_business_style: 'Business Style',
    pos_taxpayer_type: 'Taxpayer Type',
    pos_tin_branch: 'TIN / Branch',
    pos_address: 'Business Address',
    pos_ptu_number: 'PTU Number',
    pos_min_number: 'MIN Number',
    pos_accreditation_number: 'Accreditation Number',
    pos_fiscal_buyer_details_required: 'Fiscal Buyer Details Required',
    pos_receipt_footer_message: 'Receipt Footer Message'
};
const formatPosMetadataValue = (value) => {
    if (typeof value === 'boolean') return value ? 'Yes' : 'No';
    return String(value ?? '').trim() || '-';
};

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

const deriveAdminComplianceModeAction = (tenant) => {
    const serverAction = tenant?.admin_compliance_mode_action;
    if (serverAction && typeof serverAction === 'object') {
        return {
            action: serverAction.action || COMPLIANCE_ADMIN_ACTIONS.NONE,
            allowed: serverAction.allowed === true,
            label: serverAction.label || 'Compliance mode',
            helperText: serverAction.helper_text || '',
            options: Array.isArray(serverAction.options) ? serverAction.options : []
        };
    }

    const modeState = String(tenant?.compliance_mode_state || '').trim();
    if (tenant?.compliance_mode_choice_required === true || !modeState) {
        return {
            action: COMPLIANCE_ADMIN_ACTIONS.SELECT_MODE,
            allowed: true,
            label: 'Set compliance mode',
            helperText: 'Select non-compliant POS access or move the tenant into compliant pending mode.',
            options: ['non_compliant', 'compliant']
        };
    }
    if (modeState === 'non_compliant_active') {
        return {
            action: COMPLIANCE_ADMIN_ACTIONS.UPGRADE_TO_COMPLIANT_PENDING,
            allowed: true,
            label: 'Move to compliant pending',
            helperText: 'Moves the tenant into the compliant path. Fiscal activation still requires the checklist.',
            options: []
        };
    }
    if (FORCE_NON_COMPLIANT_ALLOWED_STATES.has(modeState)) {
        const forceEligibility = deriveForceNonCompliantEligibility(tenant);
        return {
            action: COMPLIANCE_ADMIN_ACTIONS.FORCE_NON_COMPLIANT,
            allowed: forceEligibility.allowed,
            label: 'Force non-compliant',
            helperText: forceEligibility.reason || 'Returns the tenant to non-fiscal POS access.',
            options: []
        };
    }
    return {
        action: COMPLIANCE_ADMIN_ACTIONS.NONE,
        allowed: false,
        label: 'Compliance mode unavailable',
        helperText: 'Compliance lifecycle state is not supported for a platform-admin action.',
        options: []
    };
};

const getTenantEffectivePlan = (tenant = {}) => {
    if (tenant.effective_plan) return tenant.effective_plan;
    if (tenant.status === 'pending' || tenant.status === 'active') return 'premium';
    return tenant.plan || 'premium';
};

const getTenantCapabilities = (tenant = {}) => ({
    ...DEFAULT_TENANT_CAPABILITIES,
    ...(tenant.capabilities && typeof tenant.capabilities === 'object' ? tenant.capabilities : {})
});

const getCustomerAccessModeLabel = (mode) => (
    CUSTOMER_ACCESS_MODE_OPTIONS.find((option) => option.value === String(mode || '').trim().toLowerCase())?.label
    || mode
    || 'N/A'
);

const isCustomerAccessCapped = (capabilities = {}) => {
    const requested = String(capabilities.requested_customer_access_mode || capabilities.customer_access_mode || '').trim().toLowerCase();
    const effective = String(capabilities.effective_customer_access_mode || requested || '').trim().toLowerCase();
    return Boolean(requested && effective && requested !== effective);
};

const getCapabilityImpactPreview = (change = {}) => {
    const patch = change?.patch || {};
    const currentCapabilities = getTenantCapabilities(change?.tenant || {});
    if (patch.ims_enabled === false) {
        return {
            title: CAPABILITY_BLOCK_TITLE,
            message: TENANT_CAPABILITY_MESSAGES.tenant_ims_enabled
        };
    }
    if (patch.pos_enabled === false) {
        return {
            title: CAPABILITY_BLOCK_TITLE,
            message: TENANT_CAPABILITY_MESSAGES.tenant_pos_enabled
        };
    }
    if (patch.storefront_visible === false) {
        return {
            title: CAPABILITY_BLOCK_TITLE,
            message: TENANT_CAPABILITY_MESSAGES.store_is_visible
        };
    }
    if (patch.customer_access_mode) {
        const mode = String(patch.customer_access_mode || '').trim().toLowerCase();
        if (mode !== 'transaction') {
            return {
                title: CAPABILITY_BLOCK_TITLE,
                message: getStorefrontAccessModeMessage(mode)
            };
        }
        return {
            title: 'Tenant impact preview',
            message: CUSTOMER_ACCESS_MODE_RANK.transaction > CUSTOMER_ACCESS_MODE_RANK[currentCapabilities.max_customer_access_mode || 'catalog']
                ? `Online ordering is requested, but checkout will remain capped at ${getCustomerAccessModeLabel(currentCapabilities.max_customer_access_mode)} until registration readiness is updated.`
                : 'Online ordering mode restores cart, quote, booking, checkout, and payment actions when the tenant also passes compliance, payment, stock, and readiness checks.'
        };
    }
    if (patch.platform_max_customer_access_mode) {
        const mode = String(patch.platform_max_customer_access_mode || '').trim().toLowerCase();
        return {
            title: 'Platform access ceiling',
            message: mode === 'transaction'
                ? 'Platform will allow this tenant to become transaction-capable when company requested mode, registration readiness, compliance, payment, stock, and location gates also pass.'
                : `Platform will cap this tenant at ${getCustomerAccessModeLabel(mode)} even if the company requests a higher customer access mode.`
        };
    }
    if (patch.customer_access_registration_stage) {
        const stage = String(patch.customer_access_registration_stage || '').trim().toLowerCase();
        return {
            title: 'Registration readiness',
            message: stage === 'registered'
                ? 'Platform will mark registration readiness as registered. Checkout can become available when company requested mode and platform max are also Online ordering mode.'
                : `Platform will cap checkout to the ${stage} registration readiness level until reviewed evidence supports registered readiness.`
        };
    }
    if (patch.ims_enabled === true) {
        return {
            title: 'Tenant impact preview',
            message: 'IMS access will be restored for this company after the audit reason is saved.'
        };
    }
    if (patch.pos_enabled === true) {
        return {
            title: 'Tenant impact preview',
            message: 'POS access will be restored for this company after the audit reason is saved.'
        };
    }
    if (patch.storefront_visible === true) {
        return {
            title: 'Tenant impact preview',
            message: 'Storefront / Maps visibility will be restored after the audit reason is saved, but public discovery still requires a valid active primary map pin.'
        };
    }
    return null;
};

const formatTenantPlanLabel = (plan) => {
    const normalized = String(plan || '').trim().toLowerCase();
    if (normalized === 'premium') return 'Premium-capable';
    if (normalized === 'standard') return 'Standard';
    return normalized || 'Premium-capable';
};

const CapabilityToggle = ({
    icon: Icon,
    label,
    description,
    value,
    disabled,
    onClick
}) => (
    <button
        type="button"
        aria-label={`${label} ${value ? 'On' : 'Off'}`}
        disabled={disabled}
        onClick={onClick}
        className={cn(
            'flex min-h-[72px] w-full items-center gap-3 rounded-lg border px-3 py-3 text-left transition',
            value
                ? 'border-emerald-200 bg-emerald-50 text-emerald-900'
                : 'border-slate-200 bg-slate-50 text-slate-700',
            'disabled:cursor-not-allowed disabled:opacity-60'
        )}
    >
        <span className={cn(
            'flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border',
            value ? 'border-emerald-200 bg-white text-emerald-700' : 'border-slate-200 bg-white text-slate-500'
        )}>
            <Icon className="h-4 w-4" />
        </span>
        <span className="min-w-0 flex-1">
            <span className="block text-sm font-semibold leading-tight">{label}</span>
            <span className="mt-1 block text-xs leading-snug text-slate-500">{description}</span>
        </span>
        <span className={cn(
            'shrink-0 rounded-full px-2.5 py-1 text-xs font-semibold',
            value ? 'bg-white text-emerald-700' : 'bg-white text-slate-500'
        )}>
            {value ? 'On' : 'Off'}
        </span>
    </button>
);

const StorefrontModeButton = ({ option, selected, disabled, onClick }) => (
    <button
        type="button"
        aria-pressed={selected}
        disabled={disabled}
        onClick={onClick}
        className={cn(
            'min-h-[78px] rounded-lg border px-3 py-3 text-left transition disabled:cursor-not-allowed disabled:opacity-60',
            selected
                ? 'border-indigo-300 bg-indigo-50 text-indigo-800 shadow-sm'
                : 'border-slate-200 bg-white text-slate-700 hover:bg-slate-50'
        )}
    >
        <span className="block text-sm font-semibold leading-tight">{option.label}</span>
        <span className="mt-1 block text-xs leading-snug text-slate-500">
            {CUSTOMER_ACCESS_MODE_DETAILS[option.value]}
        </span>
    </button>
);

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
    const navigate = useNavigate();
    const [tenants, setTenants] = useState([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState('');
    const [statusFilter, setStatusFilter] = useState('all');
    const [searchQuery, setSearchQuery] = useState('');
    const [actionLoading, setActionLoading] = useState(null); // tenant id being processed
    const [capabilityLoading, setCapabilityLoading] = useState('');
    const [pendingCapabilityChange, setPendingCapabilityChange] = useState(null);
    const [capabilityReason, setCapabilityReason] = useState('');
    const [capabilityAuditTenant, setCapabilityAuditTenant] = useState(null);
    const [capabilityAuditLogs, setCapabilityAuditLogs] = useState([]);
    const [capabilityAuditLoading, setCapabilityAuditLoading] = useState(false);
    // Store Template application (issue #178 Phase 17) - mirrors the
    // capability-change confirmation flow above (open/reason/loading state,
    // same audited-write shape), separate state since the payload is a
    // templateKey rather than a capability patch.
    const [templates, setTemplates] = useState([]);
    const [selectedTemplateKeyByTenant, setSelectedTemplateKeyByTenant] = useState({});
    const [pendingTemplateApply, setPendingTemplateApply] = useState(null);
    const [templateApplyReason, setTemplateApplyReason] = useState('');
    const [templateApplyLoading, setTemplateApplyLoading] = useState(false);
    const [posMetadataTenant, setPosMetadataTenant] = useState(null);
    const [posMetadata, setPosMetadata] = useState(null);
    const [posMetadataForm, setPosMetadataForm] = useState({
        pos_software_name: '',
        pos_software_version: '',
        pos_software_serial_number: ''
    });
    const [posMetadataReason, setPosMetadataReason] = useState('');
    const [posMetadataLoading, setPosMetadataLoading] = useState(false);
    const [posMetadataSaving, setPosMetadataSaving] = useState('');
    const [posMetadataAuditLogs, setPosMetadataAuditLogs] = useState([]);
    const [posMetadataAuditLoading, setPosMetadataAuditLoading] = useState(false);

    const [assistMode, setAssistMode] = useState('company');
    const [assistLoading, setAssistLoading] = useState(false);
    const [assistTemporaryPassword, setAssistTemporaryPassword] = useState('');
    const [assistForm, setAssistForm] = useState({
        name: '',
        industryKey: '',
        workflowMode: 'food_manufacturing',
        templateKey: '',
        adminEmail: '',
        adminPhone: '',
        adminPassword: '',
        first_name: '',
        middle_name: '',
        last_name: '',
        email: '',
        phone: '',
        temporary_password: '',
        reason: ''
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
    const [showCustomDomainsModal, setShowCustomDomainsModal] = useState(false);
    const [selectedCustomDomainsTenant, setSelectedCustomDomainsTenant] = useState(null);

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
    const [pendingComplianceModeAction, setPendingComplianceModeAction] = useState(null);
    const [complianceModeReason, setComplianceModeReason] = useState('');
    const [complianceModeChoice, setComplianceModeChoice] = useState('non_compliant');
    const [complianceModeActionLoading, setComplianceModeActionLoading] = useState(false);

    const openCustomDomainsModal = (tenant) => {
        setSelectedCustomDomainsTenant(tenant);
        setShowCustomDomainsModal(true);
    };

    const closeCustomDomainsModal = () => {
        setShowCustomDomainsModal(false);
        setSelectedCustomDomainsTenant(null);
    };

    useEffect(() => {
        loadTenants();
    }, [statusFilter]);

    // Store Template application (issue #178 Phase 17): loaded once, not
    // per-status-filter change - the published template catalog doesn't
    // depend on which tenants are currently shown. Failure here is
    // non-fatal: the picker just stays empty, tenant management still works.
    useEffect(() => {
        let cancelled = false;
        (async () => {
            try {
                const response = await adminService.listStoreTemplates({ status: 'published' });
                // listStoreTemplates() returns { success, data: { templates } } -
                // response.data is the wrapper object, not the array itself (this
                // dropped the apply-template picker silently until fixed - issue
                // #178 final-touch hardening; matches StoreTemplateManager.jsx).
                if (!cancelled) setTemplates(response.data?.templates || []);
            } catch (err) {
                console.error('Failed to load Store Templates', err);
            }
        })();
        return () => { cancelled = true; };
    }, []);

    async function loadTenants() {
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
    }

    const updateAssistForm = (key, value) => {
        setAssistForm((current) => ({ ...current, [key]: value }));
    };

    const submitAssistedProvisioning = async (event) => {
        event.preventDefault();
        setAssistLoading(true);
        setAssistTemporaryPassword('');
        try {
            const response = assistMode === 'account_company'
                ? await adminService.createAdminProvisionedAccountAndTenant({
                    reason: assistForm.reason,
                    dgfy_account: {
                        first_name: assistForm.first_name,
                        middle_name: assistForm.middle_name,
                        last_name: assistForm.last_name,
                        email: assistForm.email,
                        phone: assistForm.phone,
                        temporary_password: assistForm.temporary_password
                    },
                    company: {
                        name: assistForm.name,
                        workflowMode: assistForm.workflowMode,
                        templateKey: assistForm.templateKey || null
                    }
                })
                : await adminService.createAdminProvisionedTenant({
                    name: assistForm.name,
                    workflowMode: assistForm.workflowMode,
                    templateKey: assistForm.templateKey || null,
                    adminEmail: assistForm.adminEmail,
                    adminPhone: assistForm.adminPhone,
                    adminPassword: assistForm.adminPassword,
                    reason: assistForm.reason
                });
            setAssistTemporaryPassword(response.data?.temporary_password || '');
            setAssistForm({
                name: '',
                industryKey: '',
                workflowMode: 'food_manufacturing',
                templateKey: '',
                adminEmail: '',
                adminPhone: '',
                adminPassword: '',
                first_name: '',
                middle_name: '',
                last_name: '',
                email: '',
                phone: '',
                temporary_password: '',
                reason: ''
            });
            await loadTenants();
            toast.success('Assisted provisioning completed');
        } catch (err) {
            const normalized = normalizeApiError(err);
            toast.error(`Assisted provisioning failed: ${normalized.message}`);
        } finally {
            setAssistLoading(false);
        }
    };

    const openCapabilityChange = (tenant, patch, label) => {
        if (!tenant?.id) return;
        setPendingCapabilityChange({ tenant, patch, label });
        setCapabilityReason('');
    };

    const closeCapabilityChange = () => {
        if (capabilityLoading) return;
        setPendingCapabilityChange(null);
        setCapabilityReason('');
    };

    const handleUpdateCapabilities = async (event) => {
        event?.preventDefault?.();
        const tenant = pendingCapabilityChange?.tenant;
        const patch = pendingCapabilityChange?.patch || {};
        const reason = capabilityReason.trim();
        if (!tenant?.id) return;
        if (reason.length < 3) {
            toast.error('Reason is required and must be at least 3 characters.');
            return;
        }
        const loadingKey = `${tenant.id}:${Object.keys(patch).join(',')}`;
        setCapabilityLoading(loadingKey);
        try {
            await adminService.updateTenantCapabilities(tenant.id, { ...patch, reason });
            await loadTenants();
            setPendingCapabilityChange(null);
            setCapabilityReason('');
            toast.success('Tenant capabilities updated');
        } catch (err) {
            const normalized = normalizeApiError(err);
            if (!normalized.isGlobalCandidate) {
                toast.error(`Failed to update tenant capabilities: ${normalized.message}`);
            }
        } finally {
            setCapabilityLoading('');
        }
    };

    // Store Template application (issue #178 Phase 17) - mirrors
    // openCapabilityChange/closeCapabilityChange/handleUpdateCapabilities
    // above exactly, for the same audited-write shape.
    const openTemplateApply = (tenant, templateKey, label) => {
        if (!tenant?.id || !templateKey) return;
        setPendingTemplateApply({ tenant, templateKey, label });
        setTemplateApplyReason('');
    };

    const closeTemplateApply = () => {
        if (templateApplyLoading) return;
        setPendingTemplateApply(null);
        setTemplateApplyReason('');
    };

    const handleApplyTemplate = async (event) => {
        event?.preventDefault?.();
        const tenant = pendingTemplateApply?.tenant;
        const templateKey = pendingTemplateApply?.templateKey;
        const reason = templateApplyReason.trim();
        if (!tenant?.id || !templateKey) return;
        if (reason.length < 3) {
            toast.error('Reason is required and must be at least 3 characters.');
            return;
        }
        setTemplateApplyLoading(true);
        try {
            await adminService.applyTenantTemplate(tenant.id, { templateKey, reason });
            await loadTenants();
            setPendingTemplateApply(null);
            setTemplateApplyReason('');
            toast.success('Store Template applied');
        } catch (err) {
            const normalized = normalizeApiError(err);
            if (!normalized.isGlobalCandidate) {
                toast.error(`Failed to apply Store Template: ${normalized.message}`);
            }
        } finally {
            setTemplateApplyLoading(false);
        }
    };

    const openCapabilityAuditLogs = async (tenant) => {
        if (!tenant?.id) return;
        setCapabilityAuditTenant(tenant);
        setCapabilityAuditLogs([]);
        setCapabilityAuditLoading(true);
        try {
            const response = await adminService.listTenantCapabilityAuditLogs(tenant.id, { limit: 20 });
            setCapabilityAuditLogs(response.data?.logs || []);
        } catch (err) {
            const normalized = normalizeApiError(err);
            if (!normalized.isGlobalCandidate) {
                toast.error(`Failed to load capability audit logs: ${normalized.message}`);
            }
        } finally {
            setCapabilityAuditLoading(false);
        }
    };

    const closeCapabilityAuditLogs = () => {
        setCapabilityAuditTenant(null);
        setCapabilityAuditLogs([]);
        setCapabilityAuditLoading(false);
    };

    const openPosMetadata = async (tenant) => {
        if (!tenant?.id) return;
        setPosMetadataTenant(tenant);
        setPosMetadata(null);
        setPosMetadataAuditLogs([]);
        setPosMetadataReason('');
        setPosMetadataLoading(true);
        setPosMetadataAuditLoading(true);
        try {
            const [response, auditResponse] = await Promise.all([
                adminService.getTenantPosMetadata(tenant.id),
                adminService.listTenantPosMetadataAuditLogs(tenant.id, { limit: 10 })
            ]);
            const data = response.data || {};
            setPosMetadata(data);
            setPosMetadataAuditLogs(auditResponse.data?.logs || []);
            setPosMetadataForm({
                pos_software_name: data.current?.pos_software_name || '',
                pos_software_version: data.current?.pos_software_version || '',
                pos_software_serial_number: data.current?.pos_software_serial_number || ''
            });
        } catch (err) {
            const normalized = normalizeApiError(err);
            if (!normalized.isGlobalCandidate) {
                toast.error(`Failed to load POS metadata: ${normalized.message}`);
            }
        } finally {
            setPosMetadataLoading(false);
            setPosMetadataAuditLoading(false);
        }
    };

    const closePosMetadata = () => {
        if (posMetadataSaving) return;
        setPosMetadataTenant(null);
        setPosMetadata(null);
        setPosMetadataAuditLogs([]);
        setPosMetadataReason('');
        setPosMetadataSaving('');
        setPosMetadataAuditLoading(false);
    };

    const refreshPosMetadata = async () => {
        if (!posMetadataTenant?.id) return;
        const [response, auditResponse] = await Promise.all([
            adminService.getTenantPosMetadata(posMetadataTenant.id),
            adminService.listTenantPosMetadataAuditLogs(posMetadataTenant.id, { limit: 10 })
        ]);
        const data = response.data || {};
        setPosMetadata(data);
        setPosMetadataAuditLogs(auditResponse.data?.logs || []);
        setPosMetadataForm({
            pos_software_name: data.current?.pos_software_name || '',
            pos_software_version: data.current?.pos_software_version || '',
            pos_software_serial_number: data.current?.pos_software_serial_number || ''
        });
    };

    const savePosSoftwareIdentity = async () => {
        if (!posMetadataTenant?.id) return;
        const reason = posMetadataReason.trim();
        if (reason.length < 3) {
            toast.error('Reason is required and must be at least 3 characters.');
            return;
        }
        setPosMetadataSaving('software');
        try {
            await adminService.updateTenantPosMetadata(posMetadataTenant.id, {
                software_settings: posMetadataForm,
                reason
            });
            await refreshPosMetadata();
            toast.success('DGFY POS software identity updated.');
        } catch (err) {
            const normalized = normalizeApiError(err);
            if (!normalized.isGlobalCandidate) {
                toast.error(`Failed to update POS software identity: ${normalized.message}`);
            }
        } finally {
            setPosMetadataSaving('');
        }
    };

    const reviewPendingPosMetadata = async (action) => {
        if (!posMetadataTenant?.id) return;
        const reason = posMetadataReason.trim();
        if (reason.length < 3) {
            toast.error('Reason is required and must be at least 3 characters.');
            return;
        }
        setPosMetadataSaving(action);
        try {
            await adminService.updateTenantPosMetadata(posMetadataTenant.id, {
                pending_action: action,
                reason
            });
            await refreshPosMetadata();
            toast.success(action === 'approve' ? 'Receipt metadata changes approved.' : 'Receipt metadata changes rejected.');
        } catch (err) {
            const normalized = normalizeApiError(err);
            if (!normalized.isGlobalCandidate) {
                toast.error(`Failed to ${action} POS metadata: ${normalized.message}`);
            }
        } finally {
            setPosMetadataSaving('');
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
            if (confirm('Company approved. Create its QA landlord invoice now? Choosing No keeps invoice creation available later.')) {
                navigate('/admin/invoices');
            }
            toast.success('Tenant approved successfully');
        } catch (err) {
            const normalized = normalizeApiError(err);
            if (!normalized.isGlobalCandidate) {
                toast.error(`Failed to approve: ${normalized.message}`);
            }
            loadTenants();
        } finally {
            setActionLoading(null);
        }
    };

    const handleRetryProvisioning = async (tenantId) => {
        if (!confirm('Retry this approved company setup? The system will reuse the existing registration and avoid duplicate memberships.')) return;
        setActionLoading(tenantId);
        try {
            await adminService.retryTenantProvisioning(tenantId);
            loadTenants();
            toast.success('Company setup retry completed.');
        } catch (err) {
            const normalized = normalizeApiError(err);
            if (!normalized.isGlobalCandidate) toast.error(`Failed to retry setup: ${normalized.message}`);
            loadTenants();
        } finally { setActionLoading(null); }
    };

    const handleReject = async (tenantId) => {
        const reason = prompt('Rejection reason (required, visible to the applicant):');
        if (reason === null) return; // cancelled
        if (reason.trim().length < 3) {
            toast.error('Enter a short applicant-visible rejection reason.');
            return;
        }

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
            loadTenants();
        } finally {
            setActionLoading(null);
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

    const openComplianceModeAction = (tenant) => {
        if (!tenant?.id) return;
        const action = deriveAdminComplianceModeAction(tenant);
        if (!action.allowed) {
            toast.error(action.helperText || 'Compliance mode action is not available.');
            return;
        }
        setPendingComplianceModeAction({ tenant, action });
        setComplianceModeChoice(action.options?.includes('non_compliant') ? 'non_compliant' : 'compliant');
        setComplianceModeReason('');
    };

    const closeComplianceModeAction = () => {
        if (complianceModeActionLoading) return;
        setPendingComplianceModeAction(null);
        setComplianceModeReason('');
        setComplianceModeChoice('non_compliant');
    };

    const getPendingComplianceActionKey = () => {
        const actionType = pendingComplianceModeAction?.action?.action;
        if (actionType === COMPLIANCE_ADMIN_ACTIONS.SELECT_MODE) {
            return complianceModeChoice === 'compliant' ? 'select_compliant' : 'select_non_compliant';
        }
        if (actionType === COMPLIANCE_ADMIN_ACTIONS.UPGRADE_TO_COMPLIANT_PENDING) {
            return 'upgrade_to_compliant_pending';
        }
        if (actionType === COMPLIANCE_ADMIN_ACTIONS.FORCE_NON_COMPLIANT) {
            return 'force_non_compliant';
        }
        return '';
    };

    const submitComplianceModeAction = async () => {
        const tenant = pendingComplianceModeAction?.tenant;
        const actionType = pendingComplianceModeAction?.action?.action;
        const reason = String(complianceModeReason || '').trim();
        if (!tenant?.id || !actionType) return;
        if (reason.length < 3) {
            toast.error('Reason is required and must be at least 3 characters.');
            return;
        }
        setComplianceModeActionLoading(true);
        try {
            const payload = {
                reason,
                context: { source: 'tenant_manager_modal' }
            };
            const copy = COMPLIANCE_ACTION_COPY[getPendingComplianceActionKey()];
            if (actionType === COMPLIANCE_ADMIN_ACTIONS.SELECT_MODE) {
                await adminService.selectTenantComplianceMode(tenant.id, {
                    ...payload,
                    mode_choice: complianceModeChoice
                });
            } else if (actionType === COMPLIANCE_ADMIN_ACTIONS.UPGRADE_TO_COMPLIANT_PENDING) {
                await adminService.upgradeTenantComplianceMode(tenant.id, payload);
            } else if (actionType === COMPLIANCE_ADMIN_ACTIONS.FORCE_NON_COMPLIANT) {
                await adminService.forceTenantNonCompliant(tenant.id, payload);
            }
            await loadTenants();
            setPendingComplianceModeAction(null);
            setComplianceModeReason('');
            setComplianceModeChoice('non_compliant');
            toast.success(`${tenant.name}: ${copy?.confirmLabel || 'Compliance mode updated'}`);
        } catch (err) {
            const normalized = normalizeApiError(err);
            if (!normalized.isGlobalCandidate) {
                toast.error(`Failed to update compliance mode: ${normalized.message}`);
            }
        } finally {
            setComplianceModeActionLoading(false);
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

    const formatCapabilitySnapshot = (snapshot = {}) => {
        const modeLabel = getCustomerAccessModeLabel(snapshot?.customer_access_mode);
        return [
            `IMS ${snapshot?.ims_enabled ? 'On' : 'Off'}`,
            `POS ${snapshot?.pos_enabled ? 'On' : 'Off'}`,
            `Storefront ${snapshot?.storefront_visible ? 'On' : 'Off'}`,
            modeLabel
        ].join(' / ');
    };

    const pendingCount = tenants.filter(t => t.status === 'pending').length;
    const visibleTenants = useMemo(() => {
        const query = searchQuery.trim().toLowerCase();
        if (!query) return tenants;
        return tenants.filter((tenant) => {
            const capabilities = getTenantCapabilities(tenant);
            const modeLabel = getCustomerAccessModeLabel(capabilities.customer_access_mode);
            const effectiveModeLabel = getCustomerAccessModeLabel(capabilities.effective_customer_access_mode);
            return [
                tenant.name,
                tenant.admin_email,
                tenant.status,
                getTenantEffectivePlan(tenant),
                modeLabel,
                effectiveModeLabel,
                capabilities.registration_stage,
                capabilities.customer_access_limitation_reason,
                capabilities.ims_enabled ? 'ims enabled' : 'ims disabled',
                capabilities.pos_enabled ? 'pos enabled' : 'pos disabled',
                capabilities.storefront_visible ? 'storefront visible maps' : 'storefront hidden'
            ]
                .join(' ')
                .toLowerCase()
                .includes(query);
        });
    }, [searchQuery, tenants]);
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
    const pendingCapabilityImpact = getCapabilityImpactPreview(pendingCapabilityChange);

    return (
        <div className="mx-auto max-w-7xl">
            {/* Header */}
            <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-6 mb-6">
                <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
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
                        <Button onClick={loadTenants} variant="outline" disabled={loading}>
                            <RefreshCw className={cn("w-4 h-4 mr-2", loading && "animate-spin")} />
                            Refresh
                        </Button>
                    </div>
                </div>

                {/* Stats */}
                <div className="mt-6 grid grid-cols-2 gap-3 sm:grid-cols-4 sm:gap-4">
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

            <TenantRevenueSettlementPanel tenants={tenants} />

            <form onSubmit={submitAssistedProvisioning} className="mb-6 rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
                <div className="mb-4 flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
                    <div className="flex items-center gap-2">
                        <Building className="h-5 w-5 text-slate-500" />
                        <div>
                            <h2 className="text-sm font-semibold text-slate-900">Assisted provisioning</h2>
                            <p className="text-xs text-slate-500">Create merchant companies for platform-led DGFY, IMS, and point-of-sale setup.</p>
                        </div>
                    </div>
                    <div className="flex rounded-lg border border-slate-200 p-1">
                        <button type="button" onClick={() => setAssistMode('company')} className={cn('rounded-md px-3 py-1.5 text-sm', assistMode === 'company' ? 'bg-slate-900 text-white' : 'text-slate-600')}>Company only</button>
                        <button type="button" onClick={() => setAssistMode('account_company')} className={cn('rounded-md px-3 py-1.5 text-sm', assistMode === 'account_company' ? 'bg-slate-900 text-white' : 'text-slate-600')}>DGFY + Company</button>
                    </div>
                </div>
                <div className="mb-3 rounded-lg border border-slate-200 p-3">
                    <IndustryPicker
                        idPrefix="assisted-provisioning-industry"
                        value={assistForm.industryKey}
                        onSelect={(entry) => setAssistForm((current) => ({ ...current, industryKey: entry.key, workflowMode: entry.workflow_mode, templateKey: entry.template_key || '' }))}
                    />
                </div>
                <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
                    <input required className="rounded-lg border border-slate-300 px-3 py-2 text-sm" placeholder="Company name" value={assistForm.name} onChange={(event) => updateAssistForm('name', event.target.value)} />
                    <input required minLength={3} className="rounded-lg border border-slate-300 px-3 py-2 text-sm" placeholder="Audit reason" value={assistForm.reason} onChange={(event) => updateAssistForm('reason', event.target.value)} />
                    {assistMode === 'company' ? (
                        <>
                            <input required type="email" className="rounded-lg border border-slate-300 px-3 py-2 text-sm" placeholder="Admin email" value={assistForm.adminEmail} onChange={(event) => updateAssistForm('adminEmail', event.target.value)} />
                            <input required className="rounded-lg border border-slate-300 px-3 py-2 text-sm" placeholder="Admin phone" value={assistForm.adminPhone} onChange={(event) => updateAssistForm('adminPhone', event.target.value)} />
                            <input required minLength={8} className="rounded-lg border border-slate-300 px-3 py-2 text-sm" placeholder="Temporary password" value={assistForm.adminPassword} onChange={(event) => updateAssistForm('adminPassword', event.target.value)} />
                        </>
                    ) : (
                        <>
                            <input required className="rounded-lg border border-slate-300 px-3 py-2 text-sm" placeholder="DGFY first name" value={assistForm.first_name} onChange={(event) => updateAssistForm('first_name', event.target.value)} />
                            <input className="rounded-lg border border-slate-300 px-3 py-2 text-sm" placeholder="DGFY middle name" value={assistForm.middle_name} onChange={(event) => updateAssistForm('middle_name', event.target.value)} />
                            <input required className="rounded-lg border border-slate-300 px-3 py-2 text-sm" placeholder="DGFY last name" value={assistForm.last_name} onChange={(event) => updateAssistForm('last_name', event.target.value)} />
                            <input required type="email" className="rounded-lg border border-slate-300 px-3 py-2 text-sm" placeholder="DGFY email" value={assistForm.email} onChange={(event) => updateAssistForm('email', event.target.value)} />
                            <input required className="rounded-lg border border-slate-300 px-3 py-2 text-sm" placeholder="DGFY phone" value={assistForm.phone} onChange={(event) => updateAssistForm('phone', event.target.value)} />
                            <input minLength={8} className="rounded-lg border border-slate-300 px-3 py-2 text-sm" placeholder="Temporary password (optional)" value={assistForm.temporary_password} onChange={(event) => updateAssistForm('temporary_password', event.target.value)} />
                        </>
                    )}
                    <Button type="submit" disabled={assistLoading}>
                        <Building2 className="mr-2 h-4 w-4" />
                        {assistLoading ? 'Provisioning...' : 'Provision'}
                    </Button>
                </div>
                {assistMode === 'company' ? (
                    <p className="mt-3 text-xs text-amber-800">
                        Company only creates an operational tenant without a DGFY owner. DGFY login, company switching, owner actions, and POS access require owner assignment and an accepted membership.
                    </p>
                ) : null}
                {assistTemporaryPassword ? (
                    <div className="mt-3 rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-900">
                        Temporary password: <span className="font-mono font-semibold">{assistTemporaryPassword}</span>
                    </div>
                ) : null}
            </form>

            {/* Filters */}
            <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-4 mb-6">
                <div className="flex flex-col gap-4 xl:flex-row xl:items-end xl:justify-between">
                    <div className="min-w-0 flex-1">
                        <div className="mb-2 flex items-center justify-between gap-3">
                            <div>
                                <div className="text-sm font-semibold text-slate-900">Tenant search</div>
                                <div className="text-xs text-slate-500">
                                    Search by company, admin email, token, status, plan, or capability state.
                                </div>
                            </div>
                            <span className="shrink-0 rounded-full bg-slate-100 px-2.5 py-1 text-xs font-semibold text-slate-600">
                                {visibleTenants.length} of {tenants.length}
                            </span>
                        </div>
                        <label className="relative block w-full">
                            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                            <input
                                type="search"
                                value={searchQuery}
                                onChange={(event) => setSearchQuery(event.target.value)}
                                placeholder="Search tenants, tokens, plans, or capabilities"
                                className="w-full rounded-lg border border-slate-200 bg-slate-50 py-3 pl-10 pr-24 text-sm text-slate-900 outline-none transition placeholder:text-slate-400 focus:border-slate-400 focus:bg-white focus:ring-2 focus:ring-slate-100"
                            />
                            {searchQuery.trim() ? (
                                <button
                                    type="button"
                                    onClick={() => setSearchQuery('')}
                                    className="absolute right-2 top-1/2 -translate-y-1/2 rounded-md px-2 py-1 text-xs font-medium text-slate-500 hover:bg-slate-100 hover:text-slate-700"
                                >
                                    Clear
                                </button>
                            ) : null}
                        </label>
                    </div>
                    <div className="flex flex-wrap items-center gap-2 xl:justify-end">
                        <div className="mr-1 flex items-center gap-2 text-sm text-slate-600">
                            <Filter className="w-4 h-4 text-slate-400" />
                            Status
                        </div>
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
                ) : visibleTenants.length === 0 ? (
                    <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-12 text-center">
                        <Building2 className="w-12 h-12 text-slate-300 mx-auto mb-3" />
                        <p className="text-slate-600 text-lg font-medium">No tenants found</p>
                        <p className="text-slate-500 text-sm">
                            {searchQuery.trim() ? 'No tenants match your search' : (statusFilter !== 'all' ? `No ${statusFilter} tenants` : 'No company registrations yet')}
                        </p>
                    </div>
                ) : (
                    visibleTenants.map(tenant => {
                        const statusConfig = STATUS_CONFIG[tenant.status] || STATUS_CONFIG.inactive;
                        const StatusIcon = statusConfig.icon;
                        const isProcessing = actionLoading === tenant.id;
                        const registrationAction = getTenantRegistrationAction(tenant);
                        const capabilities = getTenantCapabilities(tenant);
                        const storefrontReadiness = capabilities.storefront_readiness || {};
                        const storefrontPublishable = storefrontReadiness.publishable === true;
                        const selectedAccessMode = CUSTOMER_ACCESS_MODE_OPTIONS.find(
                            (option) => option.value === capabilities.customer_access_mode
                        ) || CUSTOMER_ACCESS_MODE_OPTIONS[1];
                        const selectedPlatformMaxAccessMode = CUSTOMER_ACCESS_MODE_OPTIONS.find(
                            (option) => option.value === capabilities.platform_max_customer_access_mode
                        ) || CUSTOMER_ACCESS_MODE_OPTIONS[3];
                        const selectedRegistrationStage = CUSTOMER_ACCESS_REGISTRATION_STAGE_OPTIONS.find(
                            (option) => option.value === capabilities.registration_stage
                        ) || CUSTOMER_ACCESS_REGISTRATION_STAGE_OPTIONS[0];
                        const effectiveAccessModeLabel = getCustomerAccessModeLabel(capabilities.effective_customer_access_mode || selectedAccessMode.value);
                        const maxAccessModeLabel = getCustomerAccessModeLabel(capabilities.max_customer_access_mode);
                        const platformMaxAccessModeLabel = getCustomerAccessModeLabel(capabilities.platform_max_customer_access_mode);
                        const registrationMaxAccessModeLabel = getCustomerAccessModeLabel(capabilities.registration_stage_max_customer_access_mode);
                        const accessModeCapped = isCustomerAccessCapped(capabilities);
                        const capabilityDisabled = tenant.status !== 'active' || capabilityLoading.startsWith(`${tenant.id}:`) || capabilities.unavailable;
                        const capabilityControls = [
                            {
                                key: 'ims_enabled',
                                icon: Monitor,
                                label: 'IMS',
                                description: 'Authenticated inventory workspace access',
                                value: capabilities.ims_enabled,
                                patch: { ims_enabled: !capabilities.ims_enabled }
                            },
                            {
                                key: 'pos_enabled',
                                icon: ShoppingCart,
                                label: 'POS',
                                description: 'Point-of-sale route access and POS fallbacks',
                                value: capabilities.pos_enabled,
                                patch: { pos_enabled: !capabilities.pos_enabled }
                            }
                        ];

                        return (
                            <div
                                key={tenant.id}
                                className="bg-white rounded-xl shadow-sm border border-slate-200 p-6 hover:shadow-md transition-shadow"
                            >
                                <div className="flex flex-col gap-4 xl:flex-row xl:items-start xl:justify-between">
                                    <div className="flex-1 min-w-0">
                                        <div className="flex min-w-0 flex-wrap items-center gap-3 mb-2">
                                            <h3 className="min-w-0 max-w-full truncate text-xl font-semibold text-slate-900" title={tenant.name}>
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

                                        <div className="grid grid-cols-1 gap-3 text-sm mt-4 md:grid-cols-2 2xl:grid-cols-4">
                                            <div className="min-w-0 rounded-lg border border-slate-100 bg-slate-50 px-3 py-2">
                                                <div className="mb-1 text-[11px] font-medium uppercase tracking-wide text-slate-400">Admin email</div>
                                                <div className="flex min-w-0 items-center gap-2 text-slate-700">
                                                <Mail className="w-4 h-4 text-slate-400" />
                                                <span className="truncate" title={tenant.admin_email || 'N/A'}>
                                                    {tenant.admin_email || 'N/A'}
                                                </span>
                                                </div>
                                            </div>
                                            <div className="min-w-0 rounded-lg border border-slate-100 bg-slate-50 px-3 py-2">
                                                <div className="mb-1 text-[11px] font-medium uppercase tracking-wide text-slate-400">Created</div>
                                                <div className="flex min-w-0 items-center gap-2 text-slate-700">
                                                <Calendar className="w-4 h-4 text-slate-400" />
                                                <span className="truncate">{formatDate(tenant.createdAt || tenant.created_at)}</span>
                                                </div>
                                            </div>
                                            <div className="min-w-0 rounded-lg border border-slate-100 bg-slate-50 px-3 py-2">
                                                <div className="mb-1 text-[11px] font-medium uppercase tracking-wide text-slate-400">Plan & compliance</div>
                                                <div className="flex min-w-0 flex-wrap items-center gap-1.5 text-slate-700">
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

                                        <div className="mt-4 rounded-lg border border-slate-200 bg-white p-4">
                                            <div className="mb-4 flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
                                                <div>
                                                    <div className="text-sm font-semibold text-slate-900">Tenant capabilities</div>
                                                    <div className="text-xs text-slate-500">Platform-admin controls. Every change requires an audit reason.</div>
                                                </div>
                                                <div className="flex flex-wrap items-center gap-2 lg:justify-end">
                                                    {capabilities.unavailable ? (
                                                        <span className="rounded-full bg-amber-50 px-2 py-1 text-xs font-medium text-amber-700">Settings unavailable</span>
                                                    ) : null}
                                                    {tenant.status !== 'active' ? (
                                                        <span className="rounded-full bg-slate-100 px-2 py-1 text-xs font-medium text-slate-600">Active tenants only</span>
                                                    ) : null}
                                                    <Button
                                                        type="button"
                                                        variant="outline"
                                                        size="sm"
                                                        onClick={() => openPosMetadata(tenant)}
                                                        className="h-8 px-2 text-xs"
                                                    >
                                                        <Building2 className="mr-1 h-3.5 w-3.5" />
                                                        POS Metadata
                                                    </Button>
                                                    <Button
                                                        type="button"
                                                        variant="outline"
                                                        size="sm"
                                                        onClick={() => openCapabilityAuditLogs(tenant)}
                                                        className="h-8 px-2 text-xs"
                                                    >
                                                        <FileCheck2 className="mr-1 h-3.5 w-3.5" />
                                                        Audit
                                                    </Button>
                                                </div>
                                            </div>
                                            <div className="grid grid-cols-1 gap-4 2xl:grid-cols-[minmax(0,0.95fr)_minmax(0,1.55fr)]">
                                                <section className="rounded-lg border border-slate-100 bg-slate-50/70 p-3" aria-label="Core workspace access">
                                                    <div className="mb-3 flex items-center gap-2">
                                                        <HardDrive className="h-4 w-4 text-slate-400" />
                                                        <div>
                                                            <div className="text-xs font-semibold uppercase tracking-wide text-slate-500">Core access</div>
                                                            <div className="text-xs text-slate-500">IMS and POS gates</div>
                                                        </div>
                                                    </div>
                                                    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 2xl:grid-cols-1">
                                                        {capabilityControls.map((control) => {
                                                            const nextState = control.value ? 'Off' : 'On';
                                                            return (
                                                                <CapabilityToggle
                                                                    key={control.key}
                                                                    icon={control.icon}
                                                                    label={control.label}
                                                                    description={control.description}
                                                                    value={control.value}
                                                                    disabled={capabilityDisabled}
                                                                    onClick={() => openCapabilityChange(tenant, control.patch, `${control.label} ${nextState}`)}
                                                                />
                                                            );
                                                        })}
                                                    </div>
                                                </section>

                                                <section className="rounded-lg border border-slate-100 bg-slate-50/70 p-3" aria-label="Public storefront controls">
                                                    <div className="mb-3 flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
                                                        <div className="flex items-start gap-2">
                                                            <Store className="mt-0.5 h-4 w-4 text-slate-400" />
                                                            <div>
                                                                <div className="text-xs font-semibold uppercase tracking-wide text-slate-500">Public Storefront</div>
                                                                <div className="text-xs text-slate-500">Maps visibility and customer access mode</div>
                                                            </div>
                                                        </div>
                                                        <span className={cn(
                                                            'inline-flex w-fit items-center gap-1 rounded-full px-2.5 py-1 text-xs font-semibold',
                                                            capabilities.storefront_visible
                                                                ? (storefrontPublishable ? 'bg-emerald-50 text-emerald-700' : 'bg-amber-50 text-amber-700')
                                                                : 'bg-slate-100 text-slate-600'
                                                        )}>
                                                            {capabilities.storefront_visible
                                                                ? (storefrontPublishable ? 'Ready to publish' : 'Needs primary map pin')
                                                                : 'Hidden from maps'}
                                                        </span>
                                                    </div>
                                                    <CapabilityToggle
                                                        icon={MapPin}
                                                        label="Storefront / Maps"
                                                        description="Public discovery, map feeds, and root storefront profile"
                                                        value={capabilities.storefront_visible}
                                                        disabled={capabilityDisabled}
                                                        onClick={() => openCapabilityChange(
                                                            tenant,
                                                            { storefront_visible: !capabilities.storefront_visible },
                                                            `Storefront / Maps ${capabilities.storefront_visible ? 'Off' : 'On'}`
                                                        )}
                                                    />
                                                    <div className="mt-3 border-t border-slate-200 pt-3">
                                                        <div className="mb-2 flex items-center justify-between gap-2">
                                                            <div className="text-xs font-semibold uppercase tracking-wide text-slate-500">Storefront sub-modes</div>
                                                            <div className="text-xs text-slate-500">Requested: {selectedAccessMode.label}</div>
                                                        </div>
                                                        <div className={cn(
                                                            'mb-3 rounded-lg border px-3 py-2 text-xs',
                                                            accessModeCapped
                                                                ? 'border-amber-200 bg-amber-50 text-amber-800'
                                                                : 'border-emerald-100 bg-emerald-50 text-emerald-700'
                                                        )}>
                                                            <div className="font-semibold">
                                                                Effective: {effectiveAccessModeLabel}
                                                                {capabilities.max_customer_access_mode ? ` / Max: ${maxAccessModeLabel}` : ''}
                                                            </div>
                                                            <div className="mt-1">
                                                                Platform max: {platformMaxAccessModeLabel} / Registration max: {registrationMaxAccessModeLabel}
                                                            </div>
                                                            <div className="mt-1">
                                                                {accessModeCapped
                                                                    ? (capabilities.customer_access_limitation_reason || 'Requested mode is capped by platform or registration readiness.')
                                                                    : 'No platform or registration-stage cap is reducing the requested mode.'}
                                                            </div>
                                                        </div>
                                                        <div className="mb-3 rounded-lg border border-blue-100 bg-blue-50/60 p-3">
                                                            <div className="grid gap-3 lg:grid-cols-[minmax(0,1fr)_minmax(180px,220px)] lg:items-center">
                                                                <div>
                                                                    <div className="text-xs font-semibold uppercase tracking-wide text-blue-700">Platform max allowed</div>
                                                                    <div className="text-xs text-blue-700/80">
                                                                        Company admins can request or downgrade up to this ceiling. Registration readiness can still cap checkout.
                                                                    </div>
                                                                </div>
                                                                <select
                                                                    aria-label={`Platform max allowed for ${tenant.name}`}
                                                                    className="h-10 rounded-lg border border-blue-200 bg-white px-3 text-sm font-semibold text-blue-900 disabled:cursor-not-allowed disabled:opacity-60"
                                                                    value={selectedPlatformMaxAccessMode.value}
                                                                    disabled={capabilityDisabled}
                                                                    onChange={(event) => {
                                                                        const option = CUSTOMER_ACCESS_MODE_OPTIONS.find((modeOption) => modeOption.value === event.target.value) || CUSTOMER_ACCESS_MODE_OPTIONS[1];
                                                                        openCapabilityChange(
                                                                            tenant,
                                                                            { platform_max_customer_access_mode: option.value },
                                                                            `Platform max storefront mode: ${option.label}`
                                                                        );
                                                                    }}
                                                                >
                                                                    {CUSTOMER_ACCESS_MODE_OPTIONS.map((option) => (
                                                                        <option key={option.value} value={option.value}>{option.label}</option>
                                                                    ))}
                                                                </select>
                                                            </div>
                                                        </div>
                                                        <div className="mb-3 rounded-lg border border-amber-100 bg-amber-50/70 p-3">
                                                            <div className="grid gap-3 lg:grid-cols-[minmax(0,1fr)_minmax(180px,220px)] lg:items-center">
                                                                <div>
                                                                    <div className="text-xs font-semibold uppercase tracking-wide text-amber-800">Registration readiness</div>
                                                                    <div className="text-xs text-amber-800/80">
                                                                        Platform-admin evidence review. Registered readiness is required for transaction checkout.
                                                                    </div>
                                                                </div>
                                                                <select
                                                                    aria-label={`Registration readiness for ${tenant.name}`}
                                                                    className="h-10 rounded-lg border border-amber-200 bg-white px-3 text-sm font-semibold text-amber-950 disabled:cursor-not-allowed disabled:opacity-60"
                                                                    value={selectedRegistrationStage.value}
                                                                    disabled={capabilityDisabled}
                                                                    onChange={(event) => {
                                                                        const option = CUSTOMER_ACCESS_REGISTRATION_STAGE_OPTIONS.find((stageOption) => stageOption.value === event.target.value) || CUSTOMER_ACCESS_REGISTRATION_STAGE_OPTIONS[0];
                                                                        openCapabilityChange(
                                                                            tenant,
                                                                            { customer_access_registration_stage: option.value },
                                                                            `Registration readiness: ${option.label}`
                                                                        );
                                                                    }}
                                                                >
                                                                    {CUSTOMER_ACCESS_REGISTRATION_STAGE_OPTIONS.map((option) => (
                                                                        <option key={option.value} value={option.value}>{option.label}</option>
                                                                    ))}
                                                                </select>
                                                            </div>
                                                            <p className="mt-2 text-xs text-amber-800/80">{selectedRegistrationStage.detail}</p>
                                                        </div>
                                                        <div className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-500">Company requested mode</div>
                                                        <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                                                            {CUSTOMER_ACCESS_MODE_OPTIONS.map((option) => (
                                                                <StorefrontModeButton
                                                                    key={option.value}
                                                                    option={option}
                                                                    selected={selectedAccessMode.value === option.value}
                                                                    disabled={capabilityDisabled || !capabilities.storefront_visible}
                                                                    onClick={() => openCapabilityChange(tenant, { customer_access_mode: option.value }, `Storefront mode: ${option.label}`)}
                                                                />
                                                            ))}
                                                        </div>
                                                        {!capabilities.storefront_visible ? (
                                                            <p className="mt-2 text-xs text-slate-500">
                                                                Turn on Storefront / Maps before changing the customer-facing sub-mode.
                                                            </p>
                                                        ) : null}
                                                    </div>
                                                </section>
                                            </div>
                                        </div>
                                    </div>

                                    {/* Actions */}
                                    <div className="w-full xl:w-auto xl:min-w-[320px] xl:max-w-[380px]">
                                        {tenant.status === 'pending' ? (
                                            <div className="flex items-center gap-2">
                                                {registrationAction?.action === 'approve' ? <>
                                                <Button
                                                    onClick={() => handleApprove(tenant.id)}
                                                    disabled={isProcessing}
                                                    className="bg-green-600 hover:bg-green-700"
                                                    size="sm"
                                                >
                                                    {isProcessing ? <RefreshCw className="w-4 h-4 animate-spin" /> : <><Check className="w-4 h-4 mr-1" />Approve</>}
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
                                                </> : registrationAction?.action === 'retry' ? <Button
                                                    onClick={() => handleRetryProvisioning(tenant.id)}
                                                    disabled={isProcessing}
                                                    className="bg-green-600 hover:bg-green-700"
                                                    size="sm"
                                                >
                                                    {isProcessing ? (
                                                        <RefreshCw className="w-4 h-4 animate-spin" />
                                                    ) : (
                                                        <>
                                                            <Check className="w-4 h-4 mr-1" />
                                                            Retry setup
                                                        </>
                                                    )}
                                                </Button> : (
                                                    <div className="flex items-center gap-2 text-sm text-slate-500" role="status">
                                                        <AlertCircle className="h-4 w-4 shrink-0" aria-hidden="true" />
                                                        <span>{registrationAction?.helperText || 'Registration state does not allow approval.'}</span>
                                                    </div>
                                                )}
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
                                                        const complianceModeAction = deriveAdminComplianceModeAction(tenant);
                                                        return (
                                                            <Button
                                                                onClick={() => openComplianceModeAction(tenant)}
                                                                variant="outline"
                                                                size="sm"
                                                                disabled={isProcessing || complianceModeActionLoading || !complianceModeAction.allowed}
                                                                className="border-amber-300 text-amber-700 hover:bg-amber-50"
                                                                title={complianceModeAction.allowed ? complianceModeAction.label : complianceModeAction.helperText}
                                                            >
                                                                {complianceModeAction.label}
                                                            </Button>
                                                        );
                                                    })()}
                                                </div>
                                                {(() => {
                                                    const complianceModeAction = deriveAdminComplianceModeAction(tenant);
                                                    return !complianceModeAction.allowed && complianceModeAction.helperText ? (
                                                        <p className="text-[10px] text-slate-500">
                                                            {complianceModeAction.helperText}
                                                        </p>
                                                    ) : null;
                                                })()}
                                                {tenant.status === 'active' && templates.length > 0 && (
                                                    <div className="flex flex-wrap items-center gap-2">
                                                        <select
                                                            aria-label={`Apply Store Template to ${tenant.name}`}
                                                            className="h-9 rounded-lg border border-slate-200 px-2 text-xs text-slate-700"
                                                            value={selectedTemplateKeyByTenant[tenant.id] || ''}
                                                            onChange={(event) => setSelectedTemplateKeyByTenant((current) => ({
                                                                ...current,
                                                                [tenant.id]: event.target.value
                                                            }))}
                                                        >
                                                            <option value="">Apply Store Template…</option>
                                                            {templates.map((template) => (
                                                                <option key={template.template_key} value={template.template_key}>
                                                                    {template.label} ({WORKFLOW_MODE_LABELS[template.base_mode] || template.base_mode})
                                                                </option>
                                                            ))}
                                                        </select>
                                                        <Button
                                                            onClick={() => {
                                                                const templateKey = selectedTemplateKeyByTenant[tenant.id];
                                                                const template = templates.find((entry) => entry.template_key === templateKey);
                                                                if (!template) return;
                                                                openTemplateApply(tenant, templateKey, `Apply template: ${template.label}`);
                                                            }}
                                                            variant="outline"
                                                            size="sm"
                                                            disabled={!selectedTemplateKeyByTenant[tenant.id]}
                                                            className="border-slate-300 text-slate-700 hover:bg-slate-50"
                                                            title="Apply a published Store Template to this tenant"
                                                        >
                                                            <LayoutTemplate className="w-4 h-4 mr-1" />
                                                            Apply
                                                        </Button>
                                                    </div>
                                                )}
                                                <div className="flex flex-wrap items-center gap-2">
                                                    <Button
                                                        onClick={() => openCustomDomainsModal(tenant)}
                                                        variant="outline"
                                                        size="sm"
                                                        disabled={tenant.status !== 'active' || getTenantEffectivePlan(tenant) !== 'premium'}
                                                        className="border-emerald-300 text-emerald-700 hover:bg-emerald-50"
                                                        title="Manage verified Storefront domains"
                                                    >
                                                        <Store className="w-4 h-4 mr-1" />
                                                        Domains
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
                                            </div>
                                        )}
                                    </div>
                                </div>
                            </div>
                        );
                    })
                )}
            </div>

            {/* Compliance Mode Action Modal */}
            {pendingComplianceModeAction && (
                <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50">
                    <div
                        className="w-full max-w-lg overflow-hidden rounded-xl bg-white shadow-xl"
                        role="dialog"
                        aria-modal="true"
                        aria-labelledby="compliance-mode-action-title"
                    >
                        {(() => {
                            const actionKey = getPendingComplianceActionKey();
                            const copy = COMPLIANCE_ACTION_COPY[actionKey] || {
                                title: 'Update compliance mode',
                                confirmLabel: 'Update mode',
                                effect: 'Compliance mode will be updated for this tenant.'
                            };
                            const action = pendingComplianceModeAction.action;
                            const tenant = pendingComplianceModeAction.tenant;
                            const isSelectMode = action.action === COMPLIANCE_ADMIN_ACTIONS.SELECT_MODE;
                            return (
                                <>
                                    <div className="flex items-start justify-between gap-4 border-b border-slate-100 bg-slate-50 px-6 py-4">
                                        <div>
                                            <h3 id="compliance-mode-action-title" className="flex items-center gap-2 text-lg font-semibold text-slate-900">
                                                <ShieldCheck className="h-5 w-5 text-amber-700" />
                                                {copy.title}
                                            </h3>
                                            <p className="mt-1 text-sm text-slate-600">
                                                Tenant: <strong>{tenant.name}</strong>
                                            </p>
                                            <p className="text-xs text-slate-500">
                                                Current mode: {COMPLIANCE_MODE_LABELS[tenant.compliance_mode_state] || tenant.compliance_mode_state || 'Not selected'}
                                            </p>
                                        </div>
                                        <Button variant="ghost" size="icon" onClick={closeComplianceModeAction} disabled={complianceModeActionLoading}>
                                            <X className="h-5 w-5 text-slate-400" />
                                        </Button>
                                    </div>
                                    <div className="space-y-4 px-6 py-5">
                                        {isSelectMode && (
                                            <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                                                <Button
                                                    type="button"
                                                    variant={complianceModeChoice === 'non_compliant' ? 'default' : 'outline'}
                                                    className={complianceModeChoice === 'non_compliant' ? 'bg-slate-900 hover:bg-slate-800' : ''}
                                                    onClick={() => setComplianceModeChoice('non_compliant')}
                                                >
                                                    Non-compliant
                                                </Button>
                                                <Button
                                                    type="button"
                                                    variant={complianceModeChoice === 'compliant' ? 'default' : 'outline'}
                                                    className={complianceModeChoice === 'compliant' ? 'bg-emerald-700 hover:bg-emerald-800' : ''}
                                                    onClick={() => setComplianceModeChoice('compliant')}
                                                >
                                                    Compliant pending
                                                </Button>
                                            </div>
                                        )}
                                        <div className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
                                            {copy.effect}
                                        </div>
                                        <div className="space-y-2">
                                            <label className="text-sm font-medium text-slate-700" htmlFor="compliance-mode-reason">
                                                Reason
                                            </label>
                                            <textarea
                                                id="compliance-mode-reason"
                                                className="min-h-24 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-slate-500"
                                                value={complianceModeReason}
                                                onChange={(event) => setComplianceModeReason(event.target.value)}
                                                placeholder="Required audit reason"
                                                maxLength={255}
                                            />
                                            <p className="text-xs text-slate-500">
                                                Required for immutable compliance audit evidence.
                                            </p>
                                        </div>
                                    </div>
                                    <div className="flex flex-col-reverse gap-2 border-t border-slate-100 bg-slate-50 px-6 py-4 sm:flex-row sm:justify-end">
                                        <Button
                                            type="button"
                                            variant="outline"
                                            onClick={closeComplianceModeAction}
                                            disabled={complianceModeActionLoading}
                                        >
                                            Cancel
                                        </Button>
                                        <Button
                                            type="button"
                                            onClick={submitComplianceModeAction}
                                            disabled={complianceModeActionLoading || complianceModeReason.trim().length < 3}
                                            className="bg-amber-700 hover:bg-amber-800"
                                        >
                                            {complianceModeActionLoading ? (
                                                <RefreshCw className="mr-2 h-4 w-4 animate-spin" />
                                            ) : null}
                                            {copy.confirmLabel}
                                        </Button>
                                    </div>
                                </>
                            );
                        })()}
                    </div>
                </div>
            )}

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
                                            const normalizedEventType = String(entry?.event_type || 'unknown').replace(/_/g, ' ');
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

            {/* POS Metadata Modal */}
            {posMetadataTenant && (
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
                    <div className="max-h-[90vh] w-full max-w-3xl overflow-hidden rounded-lg bg-white shadow-xl">
                        <div className="flex items-start justify-between gap-4 border-b border-slate-200 p-6">
                            <div>
                                <h2 className="text-xl font-bold text-slate-900">POS Metadata</h2>
                                <p className="mt-1 text-sm text-slate-600">{posMetadataTenant.name}</p>
                            </div>
                            <button
                                type="button"
                                onClick={closePosMetadata}
                                className="rounded-md p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-700"
                                aria-label="Close POS metadata"
                            >
                                <X className="h-5 w-5" />
                            </button>
                        </div>
                        <div className="max-h-[68vh] space-y-5 overflow-y-auto p-6">
                            {posMetadataLoading ? (
                                <div className="flex items-center justify-center gap-2 rounded-lg border border-slate-200 bg-slate-50 p-8 text-sm text-slate-600">
                                    <RefreshCw className="h-4 w-4 animate-spin" />
                                    Loading POS metadata...
                                </div>
                            ) : (
                                <>
                                    <section className="rounded-lg border border-slate-200 bg-slate-50 p-4">
                                        <div className="mb-3">
                                            <h3 className="text-sm font-semibold text-slate-900">DGFY POS software identity</h3>
                                            <p className="text-xs text-slate-500">Configured only by platform admin and used by the POS itself.</p>
                                        </div>
                                        <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
                                            {POS_SOFTWARE_FIELDS.map((field) => (
                                                <label key={field.key} className="space-y-1 text-sm">
                                                    <span className="font-medium text-slate-700">{field.label}</span>
                                                    <input
                                                        value={posMetadataForm[field.key] || ''}
                                                        onChange={(event) => setPosMetadataForm((current) => ({
                                                            ...current,
                                                            [field.key]: event.target.value
                                                        }))}
                                                        placeholder={field.placeholder}
                                                        className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-slate-500"
                                                    />
                                                </label>
                                            ))}
                                        </div>
                                        <div className="mt-4 flex justify-end">
                                            <Button
                                                type="button"
                                                onClick={savePosSoftwareIdentity}
                                                disabled={Boolean(posMetadataSaving) || posMetadataReason.trim().length < 3}
                                                className="bg-slate-900 text-white hover:bg-slate-800"
                                            >
                                                {posMetadataSaving === 'software' ? <RefreshCw className="mr-2 h-4 w-4 animate-spin" /> : null}
                                                Save Software Identity
                                            </Button>
                                        </div>
                                    </section>

                                    <section className="rounded-lg border border-slate-200 bg-white p-4">
                                        <div className="mb-3">
                                            <h3 className="text-sm font-semibold text-slate-900">Tenant receipt metadata review</h3>
                                            <p className="text-xs text-slate-500">Tenant admins can edit these fields, but changes apply only after platform approval.</p>
                                        </div>
                                        {posMetadata?.pending_review ? (
                                            <div className="space-y-3">
                                                <div className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800">
                                                    Requested {posMetadata.pending_review.requested_at
                                                        ? formatDate(posMetadata.pending_review.requested_at)
                                                        : 'recently'} by {posMetadata.pending_review.requested_by || 'tenant admin'}.
                                                </div>
                                                <div className="grid grid-cols-1 gap-2 md:grid-cols-2">
                                                    {Object.entries(posMetadata.pending_review.changes || {}).map(([key, value]) => (
                                                        <div key={key} className="rounded-md border border-slate-100 bg-slate-50 p-3 text-sm">
                                                            <div className="text-xs font-semibold uppercase tracking-wide text-slate-400">
                                                                {POS_RECEIPT_METADATA_LABELS[key] || key}
                                                            </div>
                                                            <div className="mt-2 grid grid-cols-1 gap-2 sm:grid-cols-2">
                                                                <div>
                                                                    <div className="text-[11px] font-medium uppercase text-slate-400">Current</div>
                                                                    <div className="mt-1 break-words text-slate-700">
                                                                        {formatPosMetadataValue(posMetadata.current?.[key])}
                                                                    </div>
                                                                </div>
                                                                <div>
                                                                    <div className="text-[11px] font-medium uppercase text-amber-600">Requested</div>
                                                                    <div className="mt-1 break-words font-medium text-slate-900">
                                                                        {formatPosMetadataValue(value)}
                                                                    </div>
                                                                </div>
                                                            </div>
                                                        </div>
                                                    ))}
                                                </div>
                                            </div>
                                        ) : (
                                            <div className="rounded-lg border border-slate-200 bg-slate-50 p-4 text-sm text-slate-600">
                                                No pending tenant receipt metadata changes.
                                            </div>
                                        )}
                                    </section>

                                    <label className="block text-sm font-medium text-slate-700" htmlFor="pos-metadata-reason">
                                        Reason
                                    </label>
                                    <textarea
                                        id="pos-metadata-reason"
                                        value={posMetadataReason}
                                        onChange={(event) => setPosMetadataReason(event.target.value)}
                                        rows={3}
                                        maxLength={500}
                                        className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm text-slate-900 outline-none transition focus:border-slate-400 focus:ring-2 focus:ring-slate-100"
                                        placeholder="State the review or software identity update reason."
                                    />
                                    <div className="flex flex-wrap justify-end gap-3">
                                        <Button type="button" variant="outline" onClick={closePosMetadata} disabled={Boolean(posMetadataSaving)}>
                                            Close
                                        </Button>
                                        <Button
                                            type="button"
                                            variant="outline"
                                            onClick={() => reviewPendingPosMetadata('reject')}
                                            disabled={!posMetadata?.pending_review || Boolean(posMetadataSaving) || posMetadataReason.trim().length < 3}
                                            className="border-red-300 text-red-600 hover:bg-red-50"
                                        >
                                            {posMetadataSaving === 'reject' ? <RefreshCw className="mr-2 h-4 w-4 animate-spin" /> : null}
                                            Reject Pending
                                        </Button>
                                        <Button
                                            type="button"
                                            onClick={() => reviewPendingPosMetadata('approve')}
                                            disabled={!posMetadata?.pending_review || Boolean(posMetadataSaving) || posMetadataReason.trim().length < 3}
                                            className="bg-emerald-600 text-white hover:bg-emerald-700"
                                        >
                                            {posMetadataSaving === 'approve' ? <RefreshCw className="mr-2 h-4 w-4 animate-spin" /> : null}
                                            Approve Pending
                                        </Button>
                                    </div>
                                    <section className="rounded-lg border border-slate-200 bg-white p-4">
                                        <div className="mb-3">
                                            <h3 className="text-sm font-semibold text-slate-900">POS metadata history</h3>
                                            <p className="text-xs text-slate-500">Audit records for software identity saves and tenant metadata reviews.</p>
                                        </div>
                                        {posMetadataAuditLoading ? (
                                            <div className="flex items-center gap-2 text-sm text-slate-500">
                                                <RefreshCw className="h-4 w-4 animate-spin" />
                                                Loading history...
                                            </div>
                                        ) : posMetadataAuditLogs.length > 0 ? (
                                            <div className="space-y-2">
                                                {posMetadataAuditLogs.map((log) => (
                                                    <div key={log.id || `${log.created_at}-${log.actor_username}`} className="rounded-md border border-slate-100 bg-slate-50 p-3 text-sm">
                                                        <div className="flex flex-wrap items-center justify-between gap-2">
                                                            <span className="font-medium text-slate-800">{log.actor_username || 'platform_admin'}</span>
                                                            <span className="text-xs text-slate-500">{log.created_at ? formatDate(log.created_at) : 'No timestamp'}</span>
                                                        </div>
                                                        <div className="mt-1 text-xs uppercase tracking-wide text-slate-400">
                                                            {log.metadata?.pending_action || (log.metadata?.software_keys?.length ? 'software identity' : 'metadata update')}
                                                        </div>
                                                        <p className="mt-2 text-sm text-slate-700">{log.reason || 'No reason recorded'}</p>
                                                    </div>
                                                ))}
                                            </div>
                                        ) : (
                                            <div className="rounded-md border border-slate-100 bg-slate-50 p-3 text-sm text-slate-600">
                                                No POS metadata audit records yet.
                                            </div>
                                        )}
                                    </section>
                                </>
                            )}
                        </div>
                    </div>
                </div>
            )}

            {/* Capability Audit Modal */}
            {capabilityAuditTenant && (
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
                    <div className="max-h-[90vh] w-full max-w-3xl overflow-hidden rounded-lg bg-white shadow-xl">
                        <div className="flex items-start justify-between gap-4 border-b border-slate-200 p-6">
                            <div>
                                <h2 className="text-xl font-bold text-slate-900">Capability audit trail</h2>
                                <p className="mt-1 text-sm text-slate-600">{capabilityAuditTenant.name}</p>
                            </div>
                            <button
                                type="button"
                                onClick={closeCapabilityAuditLogs}
                                className="rounded-md p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-700"
                                aria-label="Close capability audit trail"
                            >
                                <X className="h-5 w-5" />
                            </button>
                        </div>
                        <div className="max-h-[68vh] overflow-y-auto p-6">
                            {capabilityAuditLoading ? (
                                <div className="flex items-center justify-center gap-2 rounded-lg border border-slate-200 bg-slate-50 p-8 text-sm text-slate-600">
                                    <RefreshCw className="h-4 w-4 animate-spin" />
                                    Loading audit logs...
                                </div>
                            ) : capabilityAuditLogs.length === 0 ? (
                                <div className="rounded-lg border border-slate-200 bg-slate-50 p-8 text-center text-sm text-slate-600">
                                    No capability audit logs recorded yet.
                                </div>
                            ) : (
                                <div className="space-y-3">
                                    {capabilityAuditLogs.map((log) => (
                                        <div key={log.id || log.created_at} className="rounded-lg border border-slate-200 bg-white p-4">
                                            <div className="flex flex-wrap items-center justify-between gap-2">
                                                <div className="text-sm font-semibold text-slate-900">
                                                    {log.actor_username || 'platform_admin'}
                                                </div>
                                                <div className="text-xs text-slate-500">
                                                    {log.created_at ? formatDate(log.created_at) : 'Unknown time'}
                                                </div>
                                            </div>
                                            <p className="mt-2 text-sm text-slate-700">{log.reason || 'No reason recorded'}</p>
                                            <div className="mt-3 grid grid-cols-1 gap-2 text-xs md:grid-cols-2">
                                                <div className="rounded-md bg-slate-50 p-3">
                                                    <div className="mb-1 font-semibold uppercase tracking-wide text-slate-400">Before</div>
                                                    <div className="text-slate-700">{formatCapabilitySnapshot(log.before_snapshot)}</div>
                                                </div>
                                                <div className="rounded-md bg-emerald-50 p-3">
                                                    <div className="mb-1 font-semibold uppercase tracking-wide text-emerald-600">After</div>
                                                    <div className="text-emerald-800">{formatCapabilitySnapshot(log.after_snapshot)}</div>
                                                </div>
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            )}
                        </div>
                    </div>
                </div>
            )}

            {/* Capability Confirmation Modal */}
            {pendingCapabilityChange && (
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
                    <form
                        onSubmit={handleUpdateCapabilities}
                        className="w-full max-w-lg rounded-lg bg-white p-6 shadow-xl"
                    >
                        <div className="mb-4 flex items-start justify-between gap-4">
                            <div>
                                <h2 className="text-xl font-bold text-slate-900">Confirm capability change</h2>
                                <p className="mt-1 text-sm text-slate-600">
                                    {pendingCapabilityChange.label} for {pendingCapabilityChange.tenant?.name}
                                </p>
                            </div>
                            <button
                                type="button"
                                onClick={closeCapabilityChange}
                                className="rounded-md p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-700"
                                aria-label="Close capability confirmation"
                            >
                                <X className="h-5 w-5" />
                            </button>
                        </div>
                        {pendingCapabilityImpact && (
                            <div className="mb-4 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3">
                                <p className="text-sm font-semibold text-amber-900">{pendingCapabilityImpact.title}</p>
                                <p className="mt-1 text-xs leading-5 text-amber-800">{pendingCapabilityImpact.message}</p>
                            </div>
                        )}
                        <label className="block text-sm font-medium text-slate-700" htmlFor="capability-reason">
                            Reason
                        </label>
                        <textarea
                            id="capability-reason"
                            value={capabilityReason}
                            onChange={(event) => setCapabilityReason(event.target.value)}
                            rows={4}
                            maxLength={500}
                            className="mt-2 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm text-slate-900 outline-none transition focus:border-slate-400 focus:ring-2 focus:ring-slate-100"
                            placeholder="State why this tenant capability is being changed."
                            required
                        />
                        <div className="mt-2 flex items-center justify-between text-xs text-slate-500">
                            <span>This reason is saved in the platform-admin audit trail.</span>
                            <span>{capabilityReason.trim().length}/500</span>
                        </div>
                        <div className="mt-6 flex justify-end gap-3">
                            <Button
                                type="button"
                                variant="outline"
                                onClick={closeCapabilityChange}
                                disabled={Boolean(capabilityLoading)}
                            >
                                Cancel
                            </Button>
                            <Button
                                type="submit"
                                disabled={Boolean(capabilityLoading) || capabilityReason.trim().length < 3}
                                className="bg-slate-900 text-white hover:bg-slate-800"
                            >
                                {capabilityLoading ? (
                                    <RefreshCw className="mr-2 h-4 w-4 animate-spin" />
                                ) : null}
                                Apply change
                            </Button>
                        </div>
                    </form>
                </div>
            )}

            {/* Store Template Apply Confirmation Modal (issue #178 Phase 17) */}
            {pendingTemplateApply && (
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
                    <form
                        onSubmit={handleApplyTemplate}
                        className="w-full max-w-lg rounded-lg bg-white p-6 shadow-xl"
                    >
                        <div className="mb-4 flex items-start justify-between gap-4">
                            <div>
                                <h2 className="text-xl font-bold text-slate-900">Confirm Store Template application</h2>
                                <p className="mt-1 text-sm text-slate-600">
                                    {pendingTemplateApply.label} for {pendingTemplateApply.tenant?.name}
                                </p>
                            </div>
                            <button
                                type="button"
                                onClick={closeTemplateApply}
                                className="rounded-md p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-700"
                                aria-label="Close Store Template confirmation"
                            >
                                <X className="h-5 w-5" />
                            </button>
                        </div>
                        <div className="mb-4 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3">
                            <p className="text-sm font-semibold text-amber-900">This changes what this tenant&apos;s store can do</p>
                            <p className="mt-1 text-xs leading-5 text-amber-800">
                                Non-destructive: hidden-domain data is never deleted, and applying a different
                                template later restores whatever the previous one granted.
                            </p>
                        </div>
                        <label className="block text-sm font-medium text-slate-700" htmlFor="template-apply-reason">
                            Reason
                        </label>
                        <textarea
                            id="template-apply-reason"
                            value={templateApplyReason}
                            onChange={(event) => setTemplateApplyReason(event.target.value)}
                            rows={4}
                            maxLength={500}
                            className="mt-2 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm text-slate-900 outline-none transition focus:border-slate-400 focus:ring-2 focus:ring-slate-100"
                            placeholder="State why this Store Template is being applied."
                            required
                        />
                        <div className="mt-2 flex items-center justify-between text-xs text-slate-500">
                            <span>This reason is saved in the platform-admin audit trail.</span>
                            <span>{templateApplyReason.trim().length}/500</span>
                        </div>
                        <div className="mt-6 flex justify-end gap-3">
                            <Button
                                type="button"
                                variant="outline"
                                onClick={closeTemplateApply}
                                disabled={templateApplyLoading}
                            >
                                Cancel
                            </Button>
                            <Button
                                type="submit"
                                disabled={templateApplyLoading || templateApplyReason.trim().length < 3}
                                className="bg-slate-900 text-white hover:bg-slate-800"
                            >
                                {templateApplyLoading ? (
                                    <RefreshCw className="mr-2 h-4 w-4 animate-spin" />
                                ) : null}
                                Apply template
                            </Button>
                        </div>
                    </form>
                </div>
            )}

            <StorefrontCustomDomainsModal
                open={showCustomDomainsModal}
                tenant={selectedCustomDomainsTenant}
                onClose={closeCustomDomainsModal}
            />

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
                                    &quot;Inactive&quot; prevents users from logging in but keeps data.
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
                                    Type <span className="font-bold select-all">&quot;{deleteForm.name}&quot;</span> to confirm:
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
