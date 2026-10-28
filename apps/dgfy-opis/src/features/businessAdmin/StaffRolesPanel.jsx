import React, { useEffect, useMemo, useState } from 'react';
import {
    AlertCircle,
    ArrowLeft,
    Check,
    Edit3,
    Plus,
    Search,
    ShieldCheck,
    UserRound,
    X
} from 'lucide-react';
import { FULFILLMENT_STAFF_ROLE_TEMPLATES } from '@sieitzz/shared-constants/fulfillmentStaffRoleTemplates';
import {
    getPermissionPrerequisites,
    normalizePermissionSelections
} from '@sieitzz/shared-constants/permissionDependencies';
import { businessAdminApi, getBusinessAdminErrorMessage } from './businessAdminService.js';
import './staffRolesWapi.css';

const emptyDraft = () => ({ name: '', capabilities: [], is_active: true });

const copyDraft = (source, includeActive = false) => ({
    name: String(source?.name || ''),
    capabilities: normalizePermissionSelections(source?.capabilities),
    ...(includeActive ? { is_active: source?.is_active !== false } : {})
});

const PERMISSION_LABELS = Object.freeze({
    'business_admin:access': 'Access Business Admin',
    'business_admin:branches:view_all': 'View All Branches',
    'business_admin:costs:view': 'View Costs',
    'business_admin:high_risk:approve': 'Approve High-Risk Actions',
    'items:view': 'View Items',
    'items:create': 'Add Items',
    'items:edit': 'Edit Items',
    'items:delete': 'Delete Items',
    'items:export': 'Export Items',
    'items:import': 'Import Items',
    'suppliers:view': 'View Suppliers',
    'suppliers:create': 'Add Suppliers',
    'suppliers:edit': 'Edit Suppliers',
    'suppliers:delete': 'Delete Suppliers',
    'suppliers:export': 'Export Suppliers',
    'suppliers:import': 'Import Suppliers',
    'po:view': 'View Purchase Orders',
    'po:create': 'Create Purchase Orders',
    'po:edit': 'Edit Purchase Orders',
    'po:approve': 'Approve Purchase Orders',
    'po:receive': 'Receive Purchase Orders',
    'po:delete': 'Delete Purchase Orders',
    'jo:view': 'View Job Orders',
    'jo:create': 'Create Job Orders',
    'jo:edit': 'Edit Job Orders',
    'jo:approve': 'Approve Job Orders',
    'jo:complete': 'Complete Job Orders',
    'jo:delete': 'Delete Job Orders',
    'do:view': 'View Dispatch Orders',
    'do:create': 'Create Dispatch Orders',
    'do:dispatch': 'Dispatch Orders',
    'do:delete': 'Delete Dispatch Orders',
    'orders:pack': 'Pack Assigned Orders',
    'orders:view_assigned': 'View Assigned Orders',
    'delivery_runs:view_assigned': 'View Assigned Delivery Runs',
    'delivery_runs:act': 'Operate Assigned Delivery Runs',
    'delivery_runs:load': 'Load Delivery Runs',
    'delivery_jobs:act_assigned': 'Operate Assigned Delivery Jobs',
    'orders:collect_assigned_balance': 'Collect Assigned Balance',
    'pos:view': 'View POS',
    'pos:transact': 'Process Sales',
    'pos:discount_authorize': 'Authorize Discounts',
    'pos:price_override': 'Override Item Price',
    'pos:delivery_fee_override': 'Override Delivery Fee',
    'pos:cash_drawer_adjust': 'Adjust Cash Drawer',
    'pos:delivery_run_variance_resolve': 'Resolve Delivery Variance',
    'pos:shift_access': 'Access Shift & Operations',
    'pos:shift_close': 'Close Shift',
    'pos:close_day': 'Close Day',
    'pos:reprint': 'Reprint Receipt',
    'pos:void': 'Void Sale',
    'pos:refund': 'Process Refunds',
    'pos:shift_force_close': 'Force Close Shift',
    'pos:fiscal_terminals:manage': 'Manage Fiscal Terminals',
    'pos:esales:manage': 'Manage E-Sales Reports',
    'pos:switch_location': 'Switch Location',
    'pos:branch_view': 'View Branches',
    'pos:employees:manage': 'Manage Employees',
    'pos:attendance:view': 'View Attendance',
    'pos:attendance:operate': 'Operate Attendance',
    'pos:attendance:manage': 'Manage Attendance',
    'pos:employee_credit:use': 'Use Employee Credit',
    'pos:employee_credit:manage': 'Manage Employee Credit',
    'pos:employee_credit:report': 'View Credit Reports',
    'vouchers:view': 'View Vouchers',
    'vouchers:manage': 'Manage Vouchers',
    'reports:view': 'View Reports',
    'reports:export': 'Export Reports',
    'settings:view': 'View Settings',
    'settings:edit': 'Edit Settings',
    'settings:storefront_branding_edit': 'Edit Storefront Branding',
    'categories:manage': 'Manage Categories',
    'users:view': 'View Users',
    'users:manage': 'Manage Users',
    'users:delete': 'Remove Users',
    'audit:view': 'View Audit History',
    'stock:view': 'View Stock',
    'stock:adjust': 'Adjust Stock',
    'batches:view': 'View Batches',
    'batches:edit': 'Edit Batches',
    'ai:chat': 'Use AI Assistant',
    'ai:action': 'Run AI Actions'
});

const POS_PERMISSION_SECTIONS = Object.freeze([
    {
        key: 'sales-refunds',
        label: 'Sales & refunds',
        description: 'Control selling, receipt, void, and refund actions.',
        permissions: ['pos:view', 'pos:transact', 'pos:void', 'pos:refund', 'pos:reprint']
    },
    {
        key: 'discounts-overrides',
        label: 'Discounts & overrides',
        description: 'Control price, discount, and delivery-fee overrides.',
        permissions: ['pos:discount_authorize', 'pos:price_override', 'pos:delivery_fee_override']
    },
    {
        key: 'shifts-cash',
        label: 'Shifts & cash',
        description: 'Control shift, day-close, location, and cash-drawer actions.',
        permissions: [
            'pos:shift_access',
            'pos:cash_drawer_adjust',
            'pos:shift_close',
            'pos:close_day',
            'pos:shift_force_close',
            'pos:switch_location'
        ]
    },
    {
        key: 'pos-operations',
        label: 'POS operations',
        description: 'Control terminal, branch, attendance, employee, and reporting tools.',
        permissions: [
            'pos:delivery_run_variance_resolve',
            'pos:fiscal_terminals:manage',
            'pos:esales:manage',
            'pos:branch_view',
            'pos:employees:manage',
            'pos:attendance:view',
            'pos:attendance:operate',
            'pos:attendance:manage',
            'pos:employee_credit:use',
            'pos:employee_credit:manage',
            'pos:employee_credit:report'
        ]
    }
]);

const groupPermissions = (group) => (
    Array.isArray(group?.permissions)
        ? group.permissions
        : Object.values(group?.permissions || {})
);

const normalizeCatalogGroups = (catalog) => (
    (Array.isArray(catalog?.permission_groups) ? catalog.permission_groups : [])
        .map((group) => ({
            key: String(group?.key || '').trim(),
            label: String(group?.label || group?.key || 'Permissions').trim(),
            permissions: Array.from(new Set(groupPermissions(group).map((permission) => String(permission).trim()).filter(Boolean)))
        }))
        .filter((group) => group.key && group.permissions.length > 0)
);

const permissionLabel = (permission) => {
    if (PERMISSION_LABELS[permission]) return PERMISSION_LABELS[permission];
    return String(permission || '')
        .split(':')
        .join(' · ')
        .replace(/[_-]+/g, ' ')
        .replace(/\b\w/g, (character) => character.toUpperCase());
};

const permissionMatches = (permission, query) => (
    !query
    || `${permission} ${permissionLabel(permission)}`.toLowerCase().includes(query)
);

const isPosGroup = (group) => (
    group.key.toUpperCase() === 'POS'
    || group.label.toLowerCase().includes('point of sale')
);

const buildPermissionCards = (groups) => groups.flatMap((group) => {
    if (!isPosGroup(group)) {
        return [{
            id: `group-${group.key}`,
            key: group.key,
            label: group.label,
            description: `Manage ${group.label.toLowerCase()} capabilities.`,
            permissions: group.permissions
        }];
    }

    const available = new Set(group.permissions);
    const cards = POS_PERMISSION_SECTIONS.flatMap((section) => {
        const permissions = section.permissions.filter((permission) => available.has(permission));
        permissions.forEach((permission) => available.delete(permission));
        return permissions.length > 0 ? [{ ...section, id: `pos-${section.key}` }] : [];
    });

    if (available.size > 0) {
        cards.push({
            id: 'pos-other',
            key: 'POS_OTHER',
            label: 'POS operations',
            description: 'Other server-defined POS capabilities are preserved here.',
            permissions: Array.from(available)
        });
    }
    return cards;
});

const collectRequiredPermissions = (permission) => {
    const required = [];
    const visit = (candidate) => {
        getPermissionPrerequisites(candidate).forEach((prerequisite) => {
            if (!required.includes(prerequisite)) required.push(prerequisite);
            visit(prerequisite);
        });
    };
    visit(permission);
    return required;
};

const getMissingPrerequisites = (permission, selectedPermissions) => (
    collectRequiredPermissions(permission).filter((prerequisite) => !selectedPermissions.has(prerequisite))
);

const confirmAction = (message) => (
    typeof window === 'undefined'
    || typeof window.confirm !== 'function'
    || window.confirm(message)
);

function PermissionCard({ card, capabilities, onToggle, onToggleAll }) {
    const selected = new Set(capabilities);
    const selectedCount = card.permissions.filter((permission) => selected.has(permission)).length;
    const allSelected = selectedCount === card.permissions.length;

    return (
        <section className="staff-roles-wapi__permission-card" aria-label={`${card.label} permissions`}>
            <div className="staff-roles-wapi__permission-card-header">
                <div className="staff-roles-wapi__permission-card-title">
                    <h4>{card.label}</h4>
                    <p>{card.description}</p>
                </div>
                <label className="staff-roles-wapi__select-all">
                    <input
                        type="checkbox"
                        checked={allSelected}
                        onChange={() => onToggleAll(card)}
                        aria-label={`Select all ${card.label}`}
                    />
                    <span>Select all</span>
                    <strong>{selectedCount}/{card.permissions.length}</strong>
                </label>
            </div>
            <div className="staff-roles-wapi__permission-list">
                {card.permissions.map((permission) => {
                    const checked = selected.has(permission);
                    return (
                        <label key={permission} className="staff-roles-wapi__permission-option">
                            <input
                                className="staff-roles-wapi__permission-input"
                                type="checkbox"
                                checked={checked}
                                onChange={() => onToggle(permission)}
                                aria-label={permissionLabel(permission)}
                            />
                            <span className="staff-roles-wapi__circle-check" aria-hidden="true">
                                {checked ? <Check size={13} strokeWidth={3} /> : null}
                            </span>
                            <span className="staff-roles-wapi__permission-copy">
                                <span>{permissionLabel(permission)}</span>
                                <small>{permission}</small>
                            </span>
                        </label>
                    );
                })}
            </div>
        </section>
    );
}

function RoleEditor({ catalog, draft, setDraft, templates, editingId, busy, onBack, onSave }) {
    const [searchQuery, setSearchQuery] = useState('');
    const groups = useMemo(() => normalizeCatalogGroups(catalog), [catalog]);
    const permissionCards = useMemo(() => buildPermissionCards(groups), [groups]);
    const visiblePermissions = useMemo(
        () => new Set(permissionCards.flatMap((card) => card.permissions)),
        [permissionCards]
    );
    const selectedPermissions = useMemo(() => new Set(draft.capabilities), [draft.capabilities]);
    const dependencyWarnings = useMemo(() => draft.capabilities.flatMap((permission) => {
        const missing = getMissingPrerequisites(permission, selectedPermissions);
        return missing.length > 0 ? [{ permission, missing }] : [];
    }), [draft.capabilities, selectedPermissions]);
    const filteredCards = useMemo(() => {
        const query = searchQuery.trim().toLowerCase();
        if (!query) return permissionCards;
        return permissionCards.flatMap((card) => {
            const cardMatches = `${card.label} ${card.description}`.toLowerCase().includes(query);
            const permissions = cardMatches
                ? card.permissions
                : card.permissions.filter((permission) => permissionMatches(permission, query));
            return permissions.length > 0 ? [{ ...card, permissions }] : [];
        });
    }, [permissionCards, searchQuery]);
    const hiddenCapabilityCount = draft.capabilities.filter((permission) => !visiblePermissions.has(permission)).length;
    const selectedVisibleCount = draft.capabilities.filter((permission) => visiblePermissions.has(permission)).length;

    const updateCapabilities = (nextCapabilities) => setDraft((current) => ({
        ...current,
        capabilities: normalizePermissionSelections(nextCapabilities)
    }));

    const togglePermission = (permission) => {
        if (selectedPermissions.has(permission)) {
            updateCapabilities(draft.capabilities.filter((entry) => entry !== permission));
            return;
        }
        // Do not silently add a parent. The warning below makes the explicit
        // dependency action available while preserving the selected intent.
        updateCapabilities([...draft.capabilities, permission]);
    };

    const toggleCard = (card) => {
        const allSelected = card.permissions.every((permission) => selectedPermissions.has(permission));
        if (allSelected) {
            if (!confirmAction(`Clear all ${card.label} permissions?`)) return;
            updateCapabilities(draft.capabilities.filter((permission) => !card.permissions.includes(permission)));
            return;
        }
        updateCapabilities([...draft.capabilities, ...card.permissions]);
    };

    const addRequiredPermissions = (permission, missing = getMissingPrerequisites(permission, selectedPermissions)) => {
        updateCapabilities([...draft.capabilities, ...missing]);
    };

    const addAllRequiredPermissions = () => {
        const missing = dependencyWarnings.flatMap((warning) => warning.missing);
        updateCapabilities([...draft.capabilities, ...missing]);
    };

    return (
        <div className="staff-roles-wapi__editor" data-testid="staff-roles-editor">
            <div className="staff-roles-wapi__editor-heading">
                <button type="button" className="staff-roles-wapi__back-button" onClick={onBack} disabled={busy}>
                    <ArrowLeft size={16} /> Back to roles
                </button>
                <div>
                    <p className="staff-roles-wapi__eyebrow">Custom staff roles</p>
                    <h3>{editingId ? 'Edit role' : 'Create new role'}</h3>
                    <p>Build the role from the tenant’s server-defined capabilities. A selected child action is not effective until its required parent access is present.</p>
                </div>
            </div>

            <section className="staff-roles-wapi__general-card">
                <div className="staff-roles-wapi__section-heading">
                    <div>
                        <p className="staff-roles-wapi__eyebrow">General information</p>
                        <h4>{editingId ? 'Update role details' : 'Create a role for this tenant'}</h4>
                    </div>
                    <ShieldCheck size={22} aria-hidden="true" />
                </div>
                <div className="staff-roles-wapi__general-grid">
                    <label className="staff-roles-wapi__field">
                        <span>Role name <em>*</em></span>
                        <input
                            type="text"
                            value={draft.name}
                            maxLength={120}
                            placeholder="e.g. Front Counter Lead"
                            aria-label="Role name"
                            onChange={(event) => setDraft((current) => ({ ...current, name: event.target.value }))}
                        />
                        <small>Use a clear operational name. The name is tenant-local and does not grant access by itself.</small>
                    </label>
                    {!editingId ? (
                        <label className="staff-roles-wapi__active-toggle">
                            <input
                                type="checkbox"
                                checked={draft.is_active !== false}
                                onChange={(event) => setDraft((current) => ({ ...current, is_active: event.target.checked }))}
                                aria-label="Role active"
                            />
                            <span className="staff-roles-wapi__toggle-track" aria-hidden="true"><span /></span>
                            <span>
                                <strong>Active role</strong>
                                <small>Allow this role to be assigned immediately after creation.</small>
                            </span>
                        </label>
                    ) : (
                        <div className="staff-roles-wapi__status-note">
                            <strong>Status is managed from the role list</strong>
                            <span>Activation and deactivation remain separate because they can revoke access and cancel pending invitations.</span>
                        </div>
                    )}
                </div>
                {!editingId && templates.length > 0 ? (
                    <div className="staff-roles-wapi__suggestions">
                        <span>Start from a suggestion</span>
                        <div>
                            {templates.map((template) => (
                                <button
                                    type="button"
                                    key={template.key}
                                    className="staff-roles-wapi__suggestion"
                                    onClick={() => setDraft(copyDraft(template, true))}
                                >
                                    {template.name}
                                </button>
                            ))}
                        </div>
                    </div>
                ) : null}
            </section>

            <section className="staff-roles-wapi__permissions-card">
                <div className="staff-roles-wapi__permissions-heading">
                    <div>
                        <p className="staff-roles-wapi__eyebrow">Access permissions</p>
                        <h4>Choose what this role can access</h4>
                        <p>Permissions are grouped by workflow. POS actions are separated into operational areas, while the API remains the authorization boundary.</p>
                    </div>
                    <div className="staff-roles-wapi__permission-summary">
                        <strong>{selectedVisibleCount}/{visiblePermissions.size}</strong>
                        <span>selected</span>
                    </div>
                </div>

                <div className="staff-roles-wapi__permission-toolbar">
                    <label className="staff-roles-wapi__search">
                        <Search size={17} aria-hidden="true" />
                        <input
                            type="search"
                            value={searchQuery}
                            onChange={(event) => setSearchQuery(event.target.value)}
                            placeholder="Search permissions, slugs, or groups..."
                            aria-label="Search permissions"
                        />
                        {searchQuery ? (
                            <button type="button" aria-label="Clear permission search" onClick={() => setSearchQuery('')}>
                                <X size={15} />
                            </button>
                        ) : null}
                    </label>
                    <span className="staff-roles-wapi__permission-count">{permissionCards.length} permission cards</span>
                </div>

                {hiddenCapabilityCount > 0 ? (
                    <div className="staff-roles-wapi__info-note">
                        <AlertCircle size={17} aria-hidden="true" />
                        <span>{hiddenCapabilityCount} legacy or hidden permission{hiddenCapabilityCount === 1 ? '' : 's'} will be preserved when this role is saved.</span>
                    </div>
                ) : null}

                {dependencyWarnings.length > 0 ? (
                    <div className="staff-roles-wapi__warning" role="status">
                        <div className="staff-roles-wapi__warning-heading">
                            <AlertCircle size={18} aria-hidden="true" />
                            <div>
                                <strong>Some selected actions need parent access</strong>
                                <p>The action remains selected, but it is not effective until the required parent permission is added.</p>
                            </div>
                            {dependencyWarnings.length > 1 ? (
                                <button type="button" onClick={addAllRequiredPermissions}>Add all required permissions</button>
                            ) : null}
                        </div>
                        <ul>
                            {dependencyWarnings.map((warning) => (
                                <li key={warning.permission}>
                                    <span><strong>{permissionLabel(warning.permission)}</strong> requires {warning.missing.map(permissionLabel).join(', ')}.</span>
                                    <button type="button" onClick={() => addRequiredPermissions(warning.permission, warning.missing)}>Add required permissions</button>
                                </li>
                            ))}
                        </ul>
                    </div>
                ) : null}

                {groups.length === 0 ? (
                    <div className="staff-roles-wapi__empty">Loading the server permission catalog…</div>
                ) : filteredCards.length === 0 ? (
                    <div className="staff-roles-wapi__empty">No permissions match “{searchQuery}”.</div>
                ) : (
                    <div className="staff-roles-wapi__permission-grid">
                        {filteredCards.map((card) => (
                            <PermissionCard
                                key={card.id}
                                card={card}
                                capabilities={draft.capabilities}
                                onToggle={togglePermission}
                                onToggleAll={toggleCard}
                            />
                        ))}
                    </div>
                )}
            </section>

            <div className="staff-roles-wapi__editor-actions">
                <button type="button" className="staff-roles-wapi__secondary-button" onClick={onBack} disabled={busy}>Cancel</button>
                <button
                    type="button"
                    className="staff-roles-wapi__primary-button"
                    onClick={onSave}
                    disabled={busy || !draft.name.trim() || groups.length === 0}
                >
                    <Check size={16} /> {editingId ? 'Save changes' : 'Create role'}
                </button>
            </div>
        </div>
    );
}

export default function StaffRolesPanel({ canManage, onSaved }) {
    const [roles, setRoles] = useState([]);
    const [users, setUsers] = useState([]);
    const [catalog, setCatalog] = useState(null);
    const [draft, setDraft] = useState(emptyDraft);
    const [editorOpen, setEditorOpen] = useState(false);
    const [editingId, setEditingId] = useState(null);
    const [userId, setUserId] = useState('');
    const [roleId, setRoleId] = useState('');
    const [grantRows, setGrantRows] = useState([]);
    const [selectedGrantIds, setSelectedGrantIds] = useState([]);
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState('');
    const [notice, setNotice] = useState('');

    const refresh = async () => {
        const [roleData, userData, catalogData] = await Promise.all([
            businessAdminApi.staffRoles(), businessAdminApi.users(), businessAdminApi.roleCatalog()
        ]);
        setRoles(roleData.roles || []);
        setUsers(Array.isArray(userData) ? userData : []);
        setCatalog(catalogData);
    };

    useEffect(() => {
        let active = true;
        Promise.all([businessAdminApi.staffRoles(), businessAdminApi.users(), businessAdminApi.roleCatalog()])
            .then(([roleData, userData, catalogData]) => {
                if (!active) return;
                setRoles(roleData.roles || []);
                setUsers(Array.isArray(userData) ? userData : []);
                setCatalog(catalogData);
            })
            .catch((failure) => { if (active) setError(getBusinessAdminErrorMessage(failure)); });
        return () => { active = false; };
    }, []);

    const templates = FULFILLMENT_STAFF_ROLE_TEMPLATES.filter((template) => template.modes.includes(catalog?.workflow_mode));
    const selectedUser = useMemo(() => users.find((user) => String(user.user_id) === userId), [users, userId]);

    const chooseUser = async (nextId) => {
        setUserId(nextId);
        setRoleId(String(users.find((user) => String(user.user_id) === nextId)?.staff_role_id || ''));
        setGrantRows([]);
        setSelectedGrantIds([]);
        if (!nextId) return;
        try {
            const grants = await businessAdminApi.userLocationGrants(nextId);
            setGrantRows(grants.locations || []);
            setSelectedGrantIds(grants.granted_location_ids || []);
        } catch (failure) { setError(getBusinessAdminErrorMessage(failure)); }
    };

    const run = async (action, successMessage) => {
        setBusy(true);
        setError('');
        setNotice('');
        try {
            const result = await action();
            await refresh();
            setNotice(typeof successMessage === 'function' ? successMessage(result) : successMessage);
            onSaved?.();
            return result;
        } catch (failure) {
            setError(getBusinessAdminErrorMessage(failure));
            return null;
        } finally {
            setBusy(false);
        }
    };

    const openCreate = () => {
        setEditorOpen(true);
        setEditingId(null);
        setDraft(emptyDraft());
        setError('');
        setNotice('');
    };

    const openEdit = (role) => {
        setEditorOpen(true);
        setEditingId(role.staff_role_id);
        setDraft(copyDraft(role));
        setError('');
        setNotice('');
    };

    const closeEditor = () => {
        if (busy) return;
        setEditorOpen(false);
        setEditingId(null);
        setDraft(emptyDraft());
    };

    const saveRole = () => run(async () => {
        if (editingId !== null) {
            await businessAdminApi.updateStaffRole(editingId, {
                name: draft.name.trim(),
                capabilities: draft.capabilities
            });
        } else {
            await businessAdminApi.createStaffRole({
                name: draft.name.trim(),
                capabilities: draft.capabilities,
                is_active: draft.is_active !== false
            });
        }
        setEditorOpen(false);
        setEditingId(null);
        setDraft(emptyDraft());
    }, editingId !== null ? 'Role updated.' : 'Role created.');

    const saveAssignment = () => {
        if (!selectedUser || selectedUser.role !== 'staff') return;
        if (!window.confirm('Assign this staff role and branch access? This clears all per-user permission overrides for the selected account.')) return;
        return run(async () => {
            // Role first: until branch grants are saved, the narrow role cannot act at new locations.
            await businessAdminApi.assignStaffRole(userId, roleId ? Number(roleId) : null);
            try {
                await businessAdminApi.updateUserLocationGrants(userId, selectedGrantIds);
            } catch (failure) {
                await refresh().catch(() => {});
                throw new Error(`Role assignment was saved, but branch grants were not: ${getBusinessAdminErrorMessage(failure)}. Review and retry.`);
            }
        }, 'Staff role and branch grants saved.');
    };

    const toggleGrant = (id) => setSelectedGrantIds((current) => current.includes(id)
        ? current.filter((value) => value !== id) : [...current, id]);

    return (
        <div className="staff-roles-wapi" data-testid="staff-roles-panel">
            {error ? <p role="alert" className="staff-roles-wapi__alert staff-roles-wapi__alert--error">{error}</p> : null}
            {notice ? <p role="status" className="staff-roles-wapi__alert staff-roles-wapi__alert--success">{notice}</p> : null}

            {editorOpen ? (
                <RoleEditor
                    catalog={catalog}
                    draft={draft}
                    setDraft={setDraft}
                    templates={templates}
                    editingId={editingId}
                    busy={busy}
                    onBack={closeEditor}
                    onSave={saveRole}
                />
            ) : (
                <>
                    <div className="staff-roles-wapi__list-heading">
                        <div>
                            <p className="staff-roles-wapi__eyebrow">Team &amp; access</p>
                            <h3>Custom staff roles</h3>
                            <p>Create tenant-local roles from the server permission catalog. Access is enforced by the API.</p>
                        </div>
                        {canManage ? (
                            <button type="button" className="staff-roles-wapi__primary-button" onClick={openCreate}>
                                <Plus size={17} /> Create new role
                            </button>
                        ) : null}
                    </div>

                    <section className="staff-roles-wapi__role-section" aria-label="Custom staff roles list">
                        <div className="staff-roles-wapi__section-heading">
                            <div>
                                <p className="staff-roles-wapi__eyebrow">Role catalog</p>
                                <h4>Existing roles</h4>
                            </div>
                            <span className="staff-roles-wapi__count-badge">{roles.length} role{roles.length === 1 ? '' : 's'}</span>
                        </div>
                        {roles.length === 0 ? (
                            <div className="staff-roles-wapi__empty">No custom staff roles have been created for this tenant.</div>
                        ) : (
                            <div className="staff-roles-wapi__role-list">
                                {roles.map((role) => (
                                    <article key={role.staff_role_id} className="staff-roles-wapi__role-row">
                                        <div className="staff-roles-wapi__role-copy">
                                            <div className="staff-roles-wapi__role-title">
                                                <h5>{role.name}</h5>
                                                <span className={`staff-roles-wapi__status-pill ${role.is_active ? 'is-active' : 'is-inactive'}`}>
                                                    {role.is_active ? 'Active' : 'Inactive'}
                                                </span>
                                            </div>
                                            <p>{role.capabilities?.length || 0} configured permission{role.capabilities?.length === 1 ? '' : 's'}</p>
                                        </div>
                                        {canManage ? (
                                            <div className="staff-roles-wapi__role-actions">
                                                <button type="button" className="staff-roles-wapi__row-button" onClick={() => openEdit(role)} disabled={busy}>
                                                    <Edit3 size={15} /> Edit
                                                </button>
                                                <button
                                                    type="button"
                                                    className={`staff-roles-wapi__row-button ${role.is_active ? 'is-danger' : 'is-success'}`}
                                                    disabled={busy}
                                                    onClick={() => run(
                                                        () => businessAdminApi.setStaffRoleStatus(role.staff_role_id, !role.is_active),
                                                        (result) => {
                                                            const count = Number(result?.cancelled_invitation_count) || 0;
                                                            if (role.is_active && result?.invitation_sync_status === 'retry_required') {
                                                                return `${result.invitation_sync_message} ${count} pending invitation${count === 1 ? '' : 's'} cancelled.`;
                                                            }
                                                            return role.is_active && count > 0
                                                                ? `Role deactivated. ${count} pending invitation${count === 1 ? '' : 's'} cancelled.`
                                                                : 'Role status updated.';
                                                        }
                                                    )}
                                                >
                                                    {role.is_active ? 'Deactivate' : 'Activate'}
                                                </button>
                                            </div>
                                        ) : null}
                                    </article>
                                ))}
                            </div>
                        )}
                    </section>

                    {canManage ? (
                        <section className="staff-roles-wapi__assignment-section" aria-label="Assign role and branch access">
                            <div className="staff-roles-wapi__section-heading">
                                <div>
                                    <p className="staff-roles-wapi__eyebrow">Assignment</p>
                                    <h4>Assign role &amp; branch access</h4>
                                    <p>Keep assignment separate from role authoring. Assigning or clearing a role clears per-user permission overrides.</p>
                                </div>
                                <UserRound size={22} aria-hidden="true" />
                            </div>
                            <label className="staff-roles-wapi__field">
                                <span>Staff account</span>
                                <select value={userId} onChange={(event) => chooseUser(event.target.value)}>
                                    <option value="">Select account</option>
                                    {users.filter((user) => user.role === 'staff' && user.is_active).map((user) => (
                                        <option key={user.user_id} value={user.user_id}>{user.username || user.email}</option>
                                    ))}
                                </select>
                            </label>
                            {selectedUser ? (
                                <>
                                    <label className="staff-roles-wapi__field">
                                        <span>Custom role</span>
                                        <select value={roleId} onChange={(event) => setRoleId(event.target.value)}>
                                            <option value="">Clear role</option>
                                            {roles.filter((role) => role.is_active).map((role) => (
                                                <option key={role.staff_role_id} value={role.staff_role_id}>{role.name}</option>
                                            ))}
                                        </select>
                                    </label>
                                    <fieldset className="staff-roles-wapi__branch-grants">
                                        <legend>Branch access</legend>
                                        <div>
                                            {grantRows.map((row) => (
                                                <label key={row.location_id}>
                                                    <input
                                                        type="checkbox"
                                                        checked={selectedGrantIds.includes(Number(row.location_id))}
                                                        onChange={() => toggleGrant(Number(row.location_id))}
                                                    />
                                                    <span>{row.name}</span>
                                                </label>
                                            ))}
                                        </div>
                                    </fieldset>
                                    <button type="button" className="staff-roles-wapi__primary-button staff-roles-wapi__assignment-save" disabled={busy} onClick={saveAssignment}>
                                        <Check size={16} /> Save assignment
                                    </button>
                                </>
                            ) : (
                                <p className="staff-roles-wapi__assignment-hint">Choose an active Staff account to load its current role and branch grants.</p>
                            )}
                        </section>
                    ) : null}
                </>
            )}
        </div>
    );
}
