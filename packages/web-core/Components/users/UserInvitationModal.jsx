import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { CheckCircle2, Search, UserPlus } from 'lucide-react';
import { toast } from "sonner";
import * as userService from '../../src/services/userService.js';
import { listTenantLocations } from '../../src/services/tenantLocationService.js';

const LEGACY_ROLE_DESCRIPTIONS = {
    admin: 'Full tenant administration and user management access.',
    manager: 'Broad operational access across inventory and order workflows.',
    po: 'Purchase-order focused role (PO lifecycle and receiving operations).',
    do: 'Dispatch-order focused role (dispatch execution and fulfillment).',
    jo: 'Job-order focused role (production planning and completion).',
    cashier: 'POS-focused role for checkout, receipts, and daily closeout tasks.',
    staff: 'Limited operational access with minimal write permissions.'
};

const LEGACY_ROLE_OPTIONS = [
    { key: 'legacy:staff', label: 'Staff', role: 'staff', location_scope: 'assigned', description: LEGACY_ROLE_DESCRIPTIONS.staff },
    { key: 'legacy:cashier', label: 'Cashier', role: 'cashier', location_scope: 'assigned', description: LEGACY_ROLE_DESCRIPTIONS.cashier },
    { key: 'legacy:po', label: 'PO Officer', role: 'po', location_scope: 'assigned', description: LEGACY_ROLE_DESCRIPTIONS.po },
    { key: 'legacy:do', label: 'DO Officer', role: 'do', location_scope: 'assigned', description: LEGACY_ROLE_DESCRIPTIONS.do },
    { key: 'legacy:jo', label: 'JO Officer', role: 'jo', location_scope: 'assigned', description: LEGACY_ROLE_DESCRIPTIONS.jo },
    { key: 'legacy:manager', label: 'Manager', role: 'manager', location_scope: 'tenant', description: LEGACY_ROLE_DESCRIPTIONS.manager },
    { key: 'legacy:admin', label: 'Admin', role: 'admin', location_scope: 'tenant', description: LEGACY_ROLE_DESCRIPTIONS.admin }
];

const getSearchErrorMessage = (error) => {
    const message = error?.response?.data?.message || 'Unable to search DGFY accounts.';
    if (error?.response?.status !== 429) return message;
    const retryAfterSeconds = Number.parseInt(
        error?.response?.headers?.['retry-after'] || error?.response?.data?.retryAfterSeconds || '',
        10
    );
    if (!Number.isFinite(retryAfterSeconds) || retryAfterSeconds <= 0) return message;
    const minutes = Math.max(1, Math.ceil(retryAfterSeconds / 60));
    return `${message} Try again in about ${minutes} minute${minutes === 1 ? '' : 's'}.`;
};

export default function UserInvitationModal({
    open,
    onOpenChange,
    onSuccess,
    roleCatalog = null,
    fixedRole = '',
    title = 'Invite DGFY Account',
    submitLabel = 'Send DGFY Invitation',
    locationOptions = null,
    canManageCustomStaffRoles = false,
    overlayClassName
}) {
    const [accountQuery, setAccountQuery] = useState('');
    const [accountResults, setAccountResults] = useState([]);
    const [accountSearchLoading, setAccountSearchLoading] = useState(false);
    const [accountSearchError, setAccountSearchError] = useState('');
    const [selectedDgfyAccount, setSelectedDgfyAccount] = useState(null);
    const [role, setRole] = useState('');
    const [loading, setLoading] = useState(false);
    const [locations, setLocations] = useState([]);
    const [locationsLoaded, setLocationsLoaded] = useState(false);
    const [selectedLocationIds, setSelectedLocationIds] = useState([]);
    const [customRoles, setCustomRoles] = useState([]);
    const [customRolesLoading, setCustomRolesLoading] = useState(false);
    const [customRolesError, setCustomRolesError] = useState('');
    const lastSearchQueryRef = useRef('');
    const locationSelectionInitializedRef = useRef(false);

    const standardRoleOptions = useMemo(() => {
        const presets = Array.isArray(roleCatalog?.presets) ? roleCatalog.presets : [];
        const options = presets.length === 0 ? LEGACY_ROLE_OPTIONS : presets.map((preset) => ({
            key: `preset:${preset.key}`,
            label: preset.label,
            role: preset.role,
            location_scope: preset.location_scope,
            description: `${preset.label} uses ${preset.role} compatibility and grants ${preset.permissions?.length || 0} default permissions.`,
            rolePresetKey: preset.key
        }));
        const normalizedFixedRole = String(fixedRole || '').trim().toLowerCase();
        return normalizedFixedRole
            ? options.filter((option) => option.role === normalizedFixedRole)
            : options;
    }, [fixedRole, roleCatalog]);
    const customRoleOptions = useMemo(() => {
        if (!canManageCustomStaffRoles || fixedRole) return [];
        return customRoles
            .filter((staffRole) => staffRole?.is_active !== false && Number.isInteger(Number(staffRole?.staff_role_id)) && Number(staffRole.staff_role_id) > 0)
            .map((staffRole) => ({
                key: `custom:${staffRole.staff_role_id}`,
                label: staffRole.name,
                role: 'staff',
                location_scope: 'assigned',
                description: `${staffRole.name} uses this store's custom staff-role capabilities.`,
                staffRoleId: Number(staffRole.staff_role_id)
            }));
    }, [canManageCustomStaffRoles, customRoles, fixedRole]);
    const roleOptions = useMemo(() => [...standardRoleOptions, ...customRoleOptions], [standardRoleOptions, customRoleOptions]);
    const selectedRoleOption = roleOptions.find((option) => option.key === role) || null;
    const requiresAssignedLocation = selectedRoleOption?.location_scope === 'assigned';
    const activeLocations = useMemo(() => locations.filter((location) => location.is_active !== false), [locations]);

    const loadCustomRoles = useCallback(async () => {
        if (!canManageCustomStaffRoles || fixedRole) return;
        setCustomRolesLoading(true);
        setCustomRolesError('');
        try {
            const rows = await userService.listActiveStaffRoles();
            setCustomRoles(Array.isArray(rows) ? rows.filter((staffRole) => staffRole?.is_active !== false) : []);
        } catch (error) {
            setCustomRoles([]);
            setCustomRolesError(error?.response?.data?.message || 'Unable to load this store\'s custom staff roles.');
        } finally {
            setCustomRolesLoading(false);
        }
    }, [canManageCustomStaffRoles, fixedRole]);

    useEffect(() => {
        if (!open) return;
        setAccountQuery('');
        setAccountResults([]);
        setAccountSearchError('');
        setSelectedDgfyAccount(null);
        setRole('');
        setSelectedLocationIds([]);
        setCustomRoles([]);
        setCustomRolesError('');
        locationSelectionInitializedRef.current = false;
    }, [open]);

    useEffect(() => {
        if (!open) return;
        if (Array.isArray(locationOptions)) {
            setLocations(locationOptions);
            setLocationsLoaded(true);
            return;
        }
        setLocationsLoaded(false);
        listTenantLocations({ include_inactive: false })
            .then((rows) => {
                const normalized = Array.isArray(rows) ? rows : [];
                setLocations(normalized);
            })
            .catch(() => setLocations([]))
            .finally(() => setLocationsLoaded(true));
    }, [locationOptions, open]);

    useEffect(() => {
        if (!open || !canManageCustomStaffRoles || fixedRole) return;
        loadCustomRoles();
    }, [canManageCustomStaffRoles, fixedRole, loadCustomRoles, open]);

    useEffect(() => {
        if (!open || !roleOptions.length || roleOptions.some((option) => option.key === role)) return;
        if (String(role || '').startsWith('custom:')) return;
        const normalizedFixedRole = String(fixedRole || '').trim().toLowerCase();
        const firstAssignableRole = normalizedFixedRole
            ? standardRoleOptions.find((option) => option.role === normalizedFixedRole)
            : (standardRoleOptions.find((option) => option.role !== 'admin') || standardRoleOptions[0]);
        if (firstAssignableRole) setRole(firstAssignableRole.key);
    }, [fixedRole, open, role, roleOptions, standardRoleOptions]);

    useEffect(() => {
        if (!open || !locationsLoaded || !selectedRoleOption || locationSelectionInitializedRef.current) return;
        const defaults = requiresAssignedLocation
            ? (activeLocations.length === 1 ? [Number(activeLocations[0].location_id)] : [])
            : activeLocations.map((location) => Number(location.location_id));
        setSelectedLocationIds(defaults);
        locationSelectionInitializedRef.current = true;
    }, [activeLocations, locationsLoaded, open, requiresAssignedLocation, selectedRoleOption]);

    useEffect(() => {
        if (!open) return undefined;
        const query = String(accountQuery || '').trim();
        if (query.length < 2) {
            setAccountResults([]);
            setAccountSearchError('');
            setAccountSearchLoading(false);
            lastSearchQueryRef.current = '';
            return undefined;
        }
        if (query === lastSearchQueryRef.current) {
            setAccountSearchLoading(false);
            return undefined;
        }

        let cancelled = false;
        setAccountSearchLoading(true);
        const timeoutId = window.setTimeout(() => {
            lastSearchQueryRef.current = query;
            userService.searchDgfyBusinessAccounts(query)
                .then((payload) => {
                    if (cancelled) return;
                    setAccountResults(Array.isArray(payload?.accounts) ? payload.accounts : []);
                    setAccountSearchError('');
                })
                .catch((error) => {
                    if (cancelled) return;
                    setAccountResults([]);
                    setAccountSearchError(getSearchErrorMessage(error));
                })
                .finally(() => {
                    if (!cancelled) setAccountSearchLoading(false);
                });
        }, 300);

        return () => {
            cancelled = true;
            window.clearTimeout(timeoutId);
        };
    }, [open, accountQuery]);

    const handleRoleChange = (nextRoleKey) => {
        const nextOption = roleOptions.find((option) => option.key === nextRoleKey);
        const previousOption = selectedRoleOption;
        setRole(nextRoleKey);
        if (!nextOption) return;

        if (previousOption?.location_scope === 'assigned' && nextOption.location_scope === 'assigned') {
            locationSelectionInitializedRef.current = true;
            return;
        }
        const nextLocationIds = nextOption.location_scope === 'assigned'
            ? (activeLocations.length === 1 ? [Number(activeLocations[0].location_id)] : [])
            : activeLocations.map((location) => Number(location.location_id));
        setSelectedLocationIds(nextLocationIds);
        locationSelectionInitializedRef.current = true;
    };

    const toggleLocation = (locationId) => {
        setSelectedLocationIds((previous) => (
            previous.includes(locationId)
                ? previous.filter((id) => id !== locationId)
                : [...previous, locationId]
        ));
    };

    const handleSubmit = async (e) => {
        e.preventDefault();

        if (!selectedDgfyAccount?.dgfy_account_id) {
            toast.error(accountSearchLoading ? 'Wait for DGFY account search to finish' : 'Select a registered DGFY account to invite');
            return;
        }

        if (!selectedRoleOption) {
            toast.error('The selected role is no longer available. Choose an active role.');
            return;
        }

        if (requiresAssignedLocation && activeLocations.length === 0) {
            toast.error('At least one active store location is required for this role');
            return;
        }

        if (requiresAssignedLocation && selectedLocationIds.length === 0) {
            toast.error('Select at least one location for this role');
            return;
        }

        setLoading(true);
        try {
            const invitationPayload = {
                dgfyAccountId: selectedDgfyAccount.dgfy_account_id,
                role: selectedRoleOption.role,
                rolePresetKey: selectedRoleOption.rolePresetKey || null,
                locationIds: selectedLocationIds
            };
            if (selectedRoleOption.staffRoleId) invitationPayload.staffRoleId = selectedRoleOption.staffRoleId;
            const result = await userService.inviteDgfyAccountToCompany(invitationPayload);

            if (result.email_sent) {
                toast.success(`Invitation sent by email to ${selectedDgfyAccount.email} and visible in DGFY My Account > Business.`);
            } else {
                const deliveryDetail = result.delivery_error ? ` (${result.delivery_error})` : '';
                toast.success(`Invitation is visible in DGFY My Account > Business; email delivery failed or is not configured${deliveryDetail}.`);
            }

            // Reset form
            setAccountQuery('');
            setAccountResults([]);
            setSelectedDgfyAccount(null);
            setRole((standardRoleOptions.find((option) => option.role !== 'admin') || standardRoleOptions[0] || LEGACY_ROLE_OPTIONS[0]).key);
            setSelectedLocationIds(activeLocations.length === 1 ? [Number(activeLocations[0].location_id)] : []);

            // Refresh parent list
            if (onSuccess) onSuccess();
            onOpenChange(false);

        } catch (error) {
            toast.error(error.response?.data?.message || 'Failed to send invitation');
        } finally {
            setLoading(false);
        }
    };

    return (
        <Dialog open={open} onOpenChange={onOpenChange} overlayClassName={overlayClassName}>
            <DialogContent className="w-[calc(100vw-1.5rem)] max-w-[520px] overflow-y-auto rounded-2xl border border-slate-200 bg-white p-0 shadow-2xl shadow-slate-950/20 sm:w-full">
                <DialogHeader className="border-b border-slate-100 px-5 py-4 text-left sm:px-6">
                    <DialogTitle className="flex items-center gap-2 text-[16px] font-extrabold text-[#0F172A]">
                        <UserPlus className="w-5 h-5 text-[#1A4E8D]" />
                        {title}
                    </DialogTitle>
                </DialogHeader>

                <form onSubmit={handleSubmit} className="grid gap-4 px-5 py-5 sm:px-6">
                    {fixedRole ? (
                        <div className="rounded-md border border-blue-100 bg-blue-50 px-3 py-2 text-xs text-blue-800">
                            This invitation creates a cashier authorization profile after acceptance. The DGFY account password remains the only operator credential.
                        </div>
                    ) : null}

                    <div className="grid gap-2">
                        <Label htmlFor="dgfy-account-search" className="text-[12px] font-bold text-[#334155]">Search registered DGFY account</Label>
                        <div className="relative">
                            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                            <Input
                                id="dgfy-account-search"
                                type="search"
                                placeholder="Search by email or phone"
                                className="pl-9 text-[16px] sm:text-[14px]"
                                value={accountQuery}
                                onChange={(e) => {
                                    const nextValue = e.target.value;
                                    setAccountQuery(nextValue);
                                    if (String(nextValue || '').trim() !== String(accountQuery || '').trim()) {
                                        setSelectedDgfyAccount(null);
                                    }
                                }}
                                autoFocus
                            />
                        </div>
                        <p className="text-xs text-slate-500">
                            Invitations can only be sent to active users who already registered a DGFY account.
                        </p>
                        {accountSearchLoading && (
                            <p className="text-xs text-slate-500">Searching DGFY accounts...</p>
                        )}
                        {accountSearchError && (
                            <p className="text-xs text-rose-600">{accountSearchError}</p>
                        )}
                        {selectedDgfyAccount ? (
                            <div className="rounded-lg border border-blue-200 bg-blue-50 p-3 text-[13px] sm:text-[14px]">
                                <div className="flex items-center gap-2 font-semibold text-[#1A4E8D]">
                                    <CheckCircle2 className="h-4 w-4" />
                                    {selectedDgfyAccount.display_name || selectedDgfyAccount.email}
                                </div>
                                <p className="mt-1 text-[11px] text-[#536B8C]">
                                    {selectedDgfyAccount.email} {selectedDgfyAccount.masked_phone ? `| ${selectedDgfyAccount.masked_phone}` : ''}
                                </p>
                            </div>
                        ) : accountResults.length > 0 ? (
                            <div className="max-h-44 overflow-y-auto rounded-lg border border-slate-200 bg-white">
                                {accountResults.map((account) => {
                                    const disabled = account.already_connected === true;
                                    return (
                                        <button
                                            key={account.dgfy_account_id}
                                            type="button"
                                            className={`flex w-full items-center justify-between gap-3 border-b border-slate-100 px-3 py-2 text-left text-[13px] last:border-b-0 ${disabled ? 'cursor-not-allowed bg-slate-50 text-slate-400' : 'hover:bg-blue-50'}`}
                                            disabled={disabled}
                                            onClick={() => setSelectedDgfyAccount(account)}
                                        >
                                            <span>
                                                <span className="block font-semibold">{account.display_name || account.email}</span>
                                                <span className="block text-xs text-slate-500">
                                                    {account.email} {account.masked_phone ? `| ${account.masked_phone}` : ''}
                                                </span>
                                            </span>
                                            <span className="text-xs font-medium text-slate-500">
                                                {disabled ? 'Connected' : account.account_status || 'active'}
                                            </span>
                                        </button>
                                    );
                                })}
                            </div>
                        ) : accountQuery.trim().length >= 2 && !accountSearchLoading && !accountSearchError ? (
                            <p className="rounded-md border border-slate-200 bg-slate-50 px-3 py-2 text-xs text-slate-600">
                                No registered active DGFY account found for this search.
                            </p>
                        ) : null}
                    </div>

                    <div className="grid gap-2">
                        <Label htmlFor="role" className="text-[12px] font-bold text-[#334155]">Role</Label>
                        <Select value={role} onValueChange={handleRoleChange}>
                            <SelectTrigger id="role" className="text-[16px] sm:text-[14px]">
                                <SelectValue placeholder="Select a role" />
                            </SelectTrigger>
                            <SelectContent>
                                <div className="px-3 pb-1 pt-2 text-[10px] font-bold uppercase tracking-wide text-slate-500">Standard roles</div>
                                {standardRoleOptions.map((option) => (
                                    <SelectItem key={option.key} value={option.key}>
                                        {option.label}
                                    </SelectItem>
                                ))}
                                {customRoleOptions.length > 0 && (
                                    <>
                                        <div className="px-3 pb-1 pt-3 text-[10px] font-bold uppercase tracking-wide text-slate-500">Custom roles</div>
                                        {customRoleOptions.map((option) => (
                                            <SelectItem key={option.key} value={option.key}>
                                                {option.label}
                                            </SelectItem>
                                        ))}
                                    </>
                                )}
                            </SelectContent>
                        </Select>
                        <p className="text-xs text-slate-500">
                            {selectedRoleOption?.description}
                        </p>
                        {role && !selectedRoleOption && (
                            <p role="alert" className="text-xs text-red-700">The selected role is no longer available. Choose an active role before sending the invitation.</p>
                        )}
                        {canManageCustomStaffRoles && !fixedRole && customRolesLoading && (
                            <p role="status" className="text-xs text-slate-500">Loading this store's active custom roles…</p>
                        )}
                        {canManageCustomStaffRoles && !fixedRole && customRolesError && (
                            <div className="flex items-center justify-between gap-3 rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-900" role="alert">
                                <span>{customRolesError}</span>
                                <Button type="button" variant="outline" className="min-h-8 px-2 text-xs" onClick={loadCustomRoles} disabled={customRolesLoading}>Retry</Button>
                            </div>
                        )}
                        {canManageCustomStaffRoles && !fixedRole && !customRolesLoading && !customRolesError && customRoleOptions.length === 0 && (
                            <p className="text-xs text-slate-500">No active custom staff roles are available for this store.</p>
                        )}
                    </div>

                    {requiresAssignedLocation && activeLocations.length === 0 && (
                        <p role="alert" className="text-xs text-red-700">At least one active store location is required for this role.</p>
                    )}
                    {activeLocations.length > 0 && (
                        <div className="grid gap-2">
                            <Label className="text-[12px] font-bold text-[#334155]">Location Scope</Label>
                            <div className="max-h-32 space-y-2 overflow-y-auto rounded-md border border-slate-200 p-2">
                                {activeLocations.map((location) => {
                                    const locationId = Number(location.location_id);
                                    return (
                                        <label key={locationId} className="flex min-h-9 items-center justify-between gap-2 text-[13px]">
                                            <span className="truncate">{location.name}</span>
                                            <input
                                                type="checkbox"
                                                checked={selectedLocationIds.includes(locationId)}
                                                onChange={() => toggleLocation(locationId)}
                                                className="h-4 w-4"
                                            />
                                        </label>
                                    );
                                })}
                            </div>
                        </div>
                    )}

                    <DialogFooter className="flex-row items-center gap-2 border-t border-slate-100 px-0 pb-0 pt-4 sm:justify-end">
                        <Button type="button" variant="outline" className="min-h-9 min-w-0 flex-1 text-[13px] font-bold sm:flex-none sm:text-[14px]" onClick={() => onOpenChange(false)}>
                            Cancel
                        </Button>
                        <Button type="submit" className="min-h-9 min-w-0 flex-1 bg-[#1A4E8D] text-[13px] font-extrabold text-white hover:bg-[#143F73] sm:flex-none sm:text-[14px]" disabled={loading || accountSearchLoading}>
                            {loading ? 'Sending...' : submitLabel}
                        </Button>
                    </DialogFooter>
                </form>
            </DialogContent>
        </Dialog>
    );
}
