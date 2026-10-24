import React, { useEffect, useMemo, useState } from 'react';
import {
    BarChart3,
    Briefcase,
    Check,
    CalendarCheck,
    ClipboardCheck,
    ClipboardList,
    Clock3,
    ListChecks,
    Package,
    Search,
    Settings2,
    Shield,
    ShieldCheck,
    ShieldX,
    ShoppingCart,
    Ticket,
    Utensils,
    Wrench
} from 'lucide-react';
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { PERMISSION_GROUPS } from '../../src/config/permissions_frontend';
import {
    getPermissionPrerequisites,
    isPermissionEffective,
    normalizePermissionSelections
} from '@sieitzz/shared-constants/permissionDependencies';
import {
    POS_PERMISSION_EDITOR_DEFINITIONS
} from '../../src/features/pos/config/posNavigationDefinitions.js';

const PERMISSION_LABELS = {
    'items:view': 'View Items',
    'items:create': 'Add Items',
    'items:edit': 'Edit Items',
    'items:delete': 'Delete Items',
    'items:export': 'Export Items',
    'items:import': 'Import Items',
    'pos:view': 'View POS',
    'pos:transact': 'Process Sales',
    'pos:discount_authorize': 'Authorize Discounts',
    'pos:price_override': 'Override Item Price',
    'pos:delivery_fee_override': 'Override Delivery Fee',
    'pos:shift_access': 'Access Shift & Operations',
    'pos:cash_drawer_adjust': 'Adjust Cash Drawer',
    'pos:delivery_run_variance_resolve': 'Resolve Delivery Variance',
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
    'users:manage': 'Manage Users',
    'users:view': 'View Users',
    'users:delete': 'Delete Users',
    'audit:view': 'View Audit History',
    'stock:view': 'View Stock',
    'stock:adjust': 'Adjust Stock',
    'batches:view': 'View Batches',
    'batches:edit': 'Edit Batches',
    'ai:chat': 'Use AI Assistant',
    'ai:action': 'Run AI Actions'
};

const POS_ICON_BY_KEY = {
    BarChart3,
    Briefcase,
    CalendarCheck,
    ClipboardCheck,
    ClipboardList,
    Clock3,
    ListChecks,
    Package,
    Settings: Settings2,
    Settings2,
    ShoppingCart,
    ShieldCheck,
    Ticket,
    Utensils,
    Wrench
};

const titleCase = (value) => String(value || '')
    .replace(/[:_]+/g, ' ')
    .replace(/\b\w/g, (character) => character.toUpperCase());

const permissionLabel = (permission) => PERMISSION_LABELS[permission] || titleCase(String(permission).split(':').slice(-1)[0]);

const groupPermissions = (group) => (
    Array.isArray(group?.permissions)
        ? group.permissions
        : Object.values(group?.permissions || {})
);

const normalizePermissionGroups = (permissionGroups) => {
    const source = Array.isArray(permissionGroups)
        ? permissionGroups
        : Object.entries(permissionGroups || {}).map(([key, group]) => ({ key, ...group }));

    return source.map((group) => ({
        key: group.key,
        label: group.label || titleCase(group.key),
        permissions: groupPermissions(group)
    }));
};

const addPermissionWithPrerequisites = (permissions, permission) => {
    const next = new Set(permissions);
    const visit = (candidate) => {
        if (!candidate || next.has(candidate)) return;
        getPermissionPrerequisites(candidate).forEach(visit);
        next.add(candidate);
    };
    visit(permission);
    return Array.from(next);
};

const confirmAction = (message) => (
    typeof window === 'undefined'
    || typeof window.confirm !== 'function'
    || window.confirm(message)
);

const createPermissionButtons = (groups) => {
    const availablePermissions = new Set(groups.flatMap((group) => group.permissions));
    const explicitPermissionKeys = new Set();
    const buttons = POS_PERMISSION_EDITOR_DEFINITIONS.map((definition) => {
        const availableGroups = definition.permissionGroups
            .map((group) => ({
                ...group,
                permissions: group.permissions.filter((permission) => availablePermissions.has(permission))
            }))
            .filter((group) => group.permissions.length > 0);
        const hasAccess = availablePermissions.has(definition.accessPermission);
        const isPermissionlessDestination = ['navigation_only', 'role_gate', 'capability_gate'].includes(definition.accessModel);
        if (!hasAccess && availableGroups.length === 0 && !isPermissionlessDestination) return null;
        if (definition.accessPermission && hasAccess) explicitPermissionKeys.add(definition.accessPermission);
        availableGroups.forEach((group) => group.permissions.forEach((permission) => explicitPermissionKeys.add(permission)));
        return {
            ...definition,
            icon: POS_ICON_BY_KEY[definition.iconKey] || Settings2,
            groups: availableGroups
        };
    }).filter(Boolean);

    groups.forEach((group) => {
        const remainingPermissions = group.permissions.filter((permission) => !explicitPermissionKeys.has(permission));
        if (remainingPermissions.length === 0) return;
        buttons.push({
            id: `legacy-${group.key}`,
            label: `Other / Legacy — ${group.label}`,
            description: 'Permissions not mapped to an active POS destination remain available here and are preserved.',
            icon: Settings2,
            accessModel: 'legacy',
            accessDescription: 'Legacy or cross-surface permission. No POS navigation button is inferred from this grant.',
            groups: [{
                id: `legacy-${group.key}-permissions`,
                label: `${group.label} permissions`,
                description: 'Preserved because these grants do not map to a canonical POS button.',
                permissions: remainingPermissions
            }]
        });
    });

    return buttons;
};

export default function PermissionMatrix({
    permissions = [],
    isMasterAdmin = false,
    onChange,
    onMasterAdminChange,
    permissionGroups = PERMISSION_GROUPS
}) {
    const normalizedPermissionGroups = useMemo(
        () => normalizePermissionGroups(permissionGroups),
        [permissionGroups]
    );
    const permissionButtons = useMemo(
        () => createPermissionButtons(normalizedPermissionGroups),
        [normalizedPermissionGroups]
    );
    const visiblePermissions = useMemo(
        () => new Set(normalizedPermissionGroups.flatMap((group) => group.permissions)),
        [normalizedPermissionGroups]
    );
    const hiddenPermissionCount = permissions.filter((permission) => !visiblePermissions.has(permission)).length;
    const [activeButtonId, setActiveButtonId] = useState(permissionButtons[0]?.id || '');
    const [searchQuery, setSearchQuery] = useState('');

    useEffect(() => {
        if (!permissionButtons.some((button) => button.id === activeButtonId)) {
            setActiveButtonId(permissionButtons[0]?.id || '');
        }
    }, [activeButtonId, permissionButtons]);

    const activeButton = permissionButtons.find((button) => button.id === activeButtonId) || permissionButtons[0];
    const filteredButtons = permissionButtons.filter((button) => {
        const query = searchQuery.trim().toLowerCase();
        if (!query) return true;
        return `${button.label} ${button.description}`.toLowerCase().includes(query);
    });

    const hasPermission = (permission) => permissions.includes(permission);
    const updatePermissions = (nextPermissions) => onChange?.(normalizePermissionSelections(nextPermissions));
    const getButtonPermissionKeys = (button) => Array.from(new Set(
        button.groups.flatMap((group) => group.permissions).filter(Boolean)
    ));
    const buttonEnabled = (button) => !button.accessPermission
        || isPermissionEffective(permissions, button.accessPermission, isMasterAdmin);
    const configuredCount = (button) => getButtonPermissionKeys(button)
        .filter((permission) => hasPermission(permission)).length;
    const effectiveCount = (button) => getButtonPermissionKeys(button)
        .filter((permission) => isPermissionEffective(permissions, permission, isMasterAdmin)).length;
    const totalCount = (button) => getButtonPermissionKeys(button).length;

    const togglePermission = (permission) => {
        if (hasPermission(permission)) {
            // Preserve child selections when their parent is revoked. The
            // parent controls effectiveness; it should not erase intent.
            updatePermissions(permissions.filter((entry) => entry !== permission));
            return;
        }
        updatePermissions(addPermissionWithPrerequisites(permissions, permission));
    };

    const toggleButton = (button) => {
        if (!button.accessPermission || isMasterAdmin) return;
        if (buttonEnabled(button)) {
            updatePermissions(permissions.filter((permission) => permission !== button.accessPermission));
        } else {
            updatePermissions(addPermissionWithPrerequisites(permissions, button.accessPermission));
        }
    };

    const selectAllInGroup = (group) => {
        if (!activeButton || !buttonEnabled(activeButton) || isMasterAdmin) return;
        const groupPerms = group.permissions;
        const allSelected = groupPerms.length > 0 && groupPerms.every(hasPermission);
        if (allSelected) {
            updatePermissions(permissions.filter((permission) => !groupPerms.includes(permission)));
            return;
        }
        let nextPermissions = permissions;
        groupPerms.forEach((permission) => {
            nextPermissions = addPermissionWithPrerequisites(nextPermissions, permission);
        });
        updatePermissions(nextPermissions);
    };

    const selectAllForButton = () => {
        if (!activeButton || isMasterAdmin || !buttonEnabled(activeButton)) return;
        const childPermissions = activeButton.groups.flatMap((group) => group.permissions);
        const allSelected = childPermissions.length > 0 && childPermissions.every(hasPermission);
        if (allSelected) {
            updatePermissions(permissions.filter((permission) => !childPermissions.includes(permission)));
            return;
        }
        let nextPermissions = activeButton.accessPermission
            ? addPermissionWithPrerequisites(permissions, activeButton.accessPermission)
            : permissions;
        childPermissions.forEach((permission) => {
            nextPermissions = addPermissionWithPrerequisites(nextPermissions, permission);
        });
        updatePermissions(nextPermissions);
    };

    const grantAllPermissions = () => {
        if (isMasterAdmin || !confirmAction('Grant all visible permissions to this user?')) return;
        let nextPermissions = permissions.filter((permission) => !visiblePermissions.has(permission));
        normalizedPermissionGroups.flatMap((group) => group.permissions).forEach((permission) => {
            nextPermissions = addPermissionWithPrerequisites(nextPermissions, permission);
        });
        updatePermissions(nextPermissions);
    };

    const revokeAllPermissions = () => {
        if (isMasterAdmin || !confirmAction('Revoke all visible permissions from this user? Legacy and hidden permissions will be preserved.')) return;
        updatePermissions(permissions.filter((permission) => !visiblePermissions.has(permission)));
    };

    const handleMasterAdminChange = (value) => {
        if (!onMasterAdminChange || value === isMasterAdmin) return;
        const message = value
            ? 'Grant Master Administrator access? This gives complete access to all features.'
            : 'Remove Master Administrator access from this user?';
        if (confirmAction(message)) onMasterAdminChange(value);
    };

    return (
        <div className="flex min-h-0 flex-col gap-4">
            <div className="flex items-center justify-between gap-4 rounded-xl border border-amber-200 bg-amber-50 p-4">
                <div className="flex min-w-0 items-center gap-3">
                    <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-amber-100">
                        <Shield className="h-5 w-5 text-amber-600" />
                    </div>
                    <div className="min-w-0">
                        <p className="font-semibold text-amber-800">Master Administrator</p>
                        <p className="text-sm text-amber-600">Complete access to all POS buttons and functions. Grant with caution.</p>
                    </div>
                </div>
                <Switch
                    checked={isMasterAdmin}
                    onCheckedChange={handleMasterAdminChange}
                    aria-label="Enable Master Administrator"
                />
            </div>

            <div className="flex flex-wrap gap-2">
                <Button
                    variant="outline"
                    size="sm"
                    onClick={grantAllPermissions}
                    disabled={isMasterAdmin}
                    className="border-teal-200 text-teal-600 hover:bg-teal-50"
                >
                    <ShieldCheck className="mr-1 h-4 w-4" />
                    Grant All
                </Button>
                <Button
                    variant="outline"
                    size="sm"
                    onClick={revokeAllPermissions}
                    disabled={isMasterAdmin}
                    className="border-red-200 text-red-600 hover:bg-red-50"
                >
                    <ShieldX className="mr-1 h-4 w-4" />
                    Revoke Visible
                </Button>
            </div>

            {hiddenPermissionCount > 0 && (
                <div className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-xs text-slate-600">
                    {hiddenPermissionCount} legacy or hidden permission{hiddenPermissionCount !== 1 ? 's are' : ' is'} preserved outside the active mode view.
                </div>
            )}

            <div className="grid min-h-0 grid-cols-1 gap-4 lg:grid-cols-[250px_minmax(0,1fr)]">
                <aside className="min-h-0 rounded-xl border border-slate-200 bg-white p-3">
                    <div className="relative mb-3">
                        <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                        <input
                            type="search"
                            value={searchQuery}
                            onChange={(event) => setSearchQuery(event.target.value)}
                            placeholder="Search buttons..."
                            aria-label="Search buttons"
                            className="h-10 w-full rounded-lg border border-slate-200 bg-white pl-9 pr-3 text-sm text-slate-800 outline-none transition focus:border-teal-500 focus:ring-2 focus:ring-teal-100"
                        />
                    </div>
                            <nav className="max-h-[min(58vh,520px)] space-y-1 overflow-y-auto pr-1" aria-label="POS destinations and permission groups">
                        {filteredButtons.map((button) => {
                            const Icon = button.icon;
                            const isActive = activeButton?.id === button.id;
                            return (
                                <button
                                    key={button.id}
                                    type="button"
                                    onClick={() => setActiveButtonId(button.id)}
                                    className={`flex w-full items-center gap-3 rounded-lg border-l-2 px-3 py-2.5 text-left transition-colors ${isActive
                                        ? 'border-teal-500 bg-teal-50 text-slate-900'
                                        : 'border-transparent text-slate-700 hover:bg-slate-50'
                                        }`}
                                >
                                    <Icon className={`h-5 w-5 shrink-0 ${isActive ? 'text-teal-600' : 'text-slate-500'}`} />
                                    <span className="min-w-0 flex-1 truncate text-sm font-medium">{button.label}</span>
                                    <span className="shrink-0 rounded-full bg-slate-100 px-2 py-0.5 text-xs text-slate-600">
                                        {effectiveCount(button)}/{totalCount(button)}
                                    </span>
                                </button>
                            );
                        })}
                        {filteredButtons.length === 0 && (
                            <p className="px-3 py-6 text-center text-sm text-slate-500">No buttons match your search.</p>
                        )}
                    </nav>
                </aside>

                {activeButton ? (
                    <section className="min-h-0 rounded-xl border border-slate-200 bg-slate-50/50 p-4 sm:p-5" aria-label={`${activeButton.label} permissions`}>
                        <div className="mb-4 flex flex-wrap items-start justify-between gap-4 rounded-xl bg-white p-4 shadow-sm ring-1 ring-slate-100">
                            <div className="flex min-w-0 items-center gap-3">
                                <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-xl bg-teal-50">
                                    {React.createElement(activeButton.icon, { className: 'h-7 w-7 text-teal-600' })}
                                </div>
                                <div className="min-w-0">
                                    <h3 className="text-xl font-semibold text-slate-900">{activeButton.label}</h3>
                                    <p className="text-sm text-slate-500">{activeButton.description}</p>
                                </div>
                            </div>
                            <div className="flex items-center gap-4">
                                <button
                                    type="button"
                                    onClick={selectAllForButton}
                                    disabled={isMasterAdmin || !buttonEnabled(activeButton) || activeButton.groups.flatMap((group) => group.permissions).length === 0}
                                    className="text-sm font-medium text-teal-600 hover:text-teal-700 disabled:cursor-not-allowed disabled:opacity-50"
                                >
                                    {activeButton.groups.flatMap((group) => group.permissions).length > 0
                                        && activeButton.groups.flatMap((group) => group.permissions).every(hasPermission)
                                        ? 'Deselect All'
                                        : 'Select All'}
                                </button>
                                {activeButton.accessPermission ? (
                                    <label className="flex items-center gap-3">
                                        <span className="text-right">
                                            <span className="block text-sm font-semibold text-slate-800">Enable {activeButton.label} Button</span>
                                            <span className="block text-xs text-slate-500">Access grant · {configuredCount(activeButton)} configured · {effectiveCount(activeButton)} of {totalCount(activeButton)} child permissions effective</span>
                                        </span>
                                        <Switch
                                            checked={buttonEnabled(activeButton)}
                                            onCheckedChange={() => toggleButton(activeButton)}
                                            disabled={isMasterAdmin}
                                            aria-label={`Enable ${activeButton.label} Button`}
                                        />
                                    </label>
                                ) : (
                                    <div className="text-right">
                                        <span className="block text-sm font-semibold text-slate-800">
                                            {activeButton.accessModel === 'shared'
                                                ? 'Shared access'
                                                : activeButton.accessModel === 'composite'
                                                    ? 'Action-based access'
                                                    : activeButton.accessModel === 'server_capability'
                                                        ? 'Server capability projection'
                                                        : activeButton.accessModel === 'legacy'
                                                            ? 'Preserved legacy permissions'
                                                            : 'Navigation / role gate'}
                                        </span>
                                        <span className="block max-w-[26rem] text-xs text-slate-500">
                                            {activeButton.accessDescription || 'No standalone permission is inferred for this destination.'}
                                        </span>
                                    </div>
                                )}
                            </div>
                        </div>

                        {!buttonEnabled(activeButton) && !isMasterAdmin && (
                            <div className="mb-4 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800">
                                This button is disabled. Existing function selections are preserved and will become effective when the button is enabled.
                            </div>
                        )}

                        <div className="grid min-w-0 grid-cols-1 gap-4 xl:grid-cols-2">
                            {activeButton.groups.map((group) => {
                                const allSelected = group.permissions.length > 0 && group.permissions.every(hasPermission);
                                return (
                                    <div key={group.id} className="rounded-xl border border-slate-200 bg-white">
                                        <div className="flex items-start justify-between gap-3 border-b border-slate-100 bg-slate-50/70 px-4 py-3">
                                            <div>
                                                <h4 className="font-semibold text-slate-800">{group.label}</h4>
                                                <p className="text-xs text-slate-500">{group.description}</p>
                                            </div>
                                            <label className="flex shrink-0 items-center gap-2 text-xs font-medium text-slate-700">
                                                <input
                                                    type="checkbox"
                                                    checked={allSelected}
                                                    onChange={() => selectAllInGroup(group)}
                                                    disabled={isMasterAdmin || !buttonEnabled(activeButton) || group.permissions.length === 0}
                                                    aria-label={`Select all ${group.label}`}
                                                    className="h-4 w-4 rounded border-slate-300 text-teal-600 focus:ring-teal-500"
                                                />
                                                Select All
                                            </label>
                                        </div>
                                        <div className="grid grid-cols-1 gap-x-5 gap-y-2 p-4 sm:grid-cols-2">
                                            {group.permissions.map((permission) => {
                                                const checked = hasPermission(permission);
                                                const prerequisitesSatisfied = getPermissionPrerequisites(permission)
                                                    .every((prerequisite) => isPermissionEffective(permissions, prerequisite, isMasterAdmin));
                                                const selectable = !isMasterAdmin && buttonEnabled(activeButton) && (checked || prerequisitesSatisfied);
                                                const label = permissionLabel(permission);
                                                return (
                                                    <label
                                                        key={permission}
                                                        className={`flex min-w-0 items-center gap-3 rounded-lg px-2 py-2 text-sm transition-colors ${selectable
                                                            ? 'cursor-pointer hover:bg-slate-50'
                                                            : 'cursor-not-allowed opacity-50'
                                                            }`}
                                                    >
                                                        <input
                                                            type="checkbox"
                                                            checked={checked}
                                                            onChange={() => togglePermission(permission)}
                                                            disabled={!selectable}
                                                            aria-label={label}
                                                            className="peer sr-only"
                                                        />
                                                        <span
                                                            aria-hidden="true"
                                                     className={`flex h-5 w-5 shrink-0 items-center justify-center rounded-full border-2 transition-colors peer-focus-visible:ring-2 peer-focus-visible:ring-teal-500 peer-focus-visible:ring-offset-2 ${checked
                                                                ? 'border-teal-600 bg-teal-600 text-white'
                                                                : 'border-slate-300 bg-white text-transparent'
                                                                }`}
                                                        >
                                                            <Check className="h-3 w-3" strokeWidth={3} />
                                                        </span>
                                                        <span className="min-w-0 truncate text-slate-800">{label}</span>
                                                    </label>
                                                );
                                            })}
                                        </div>
                                    </div>
                                );
                            })}
                            {activeButton.groups.length === 0 && (
                                <div className="rounded-xl border border-dashed border-slate-300 bg-white p-6 text-sm text-slate-500">
                                    No additional functions are available for this button in the current workflow mode.
                                </div>
                            )}
                        </div>
                    </section>
                ) : (
                    <div className="flex min-h-64 items-center justify-center rounded-xl border border-dashed border-slate-300 bg-slate-50 text-sm text-slate-500">
                        No permission buttons are available for this workflow mode.
                    </div>
                )}
            </div>
        </div>
    );
}
