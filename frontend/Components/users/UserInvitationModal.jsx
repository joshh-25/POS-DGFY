import React, { useEffect, useMemo, useRef, useState } from 'react';
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
    { key: 'staff', label: 'Staff', role: 'staff', location_scope: 'assigned', description: LEGACY_ROLE_DESCRIPTIONS.staff },
    { key: 'cashier', label: 'Cashier', role: 'cashier', location_scope: 'assigned', description: LEGACY_ROLE_DESCRIPTIONS.cashier },
    { key: 'po', label: 'PO Officer', role: 'po', location_scope: 'assigned', description: LEGACY_ROLE_DESCRIPTIONS.po },
    { key: 'do', label: 'DO Officer', role: 'do', location_scope: 'assigned', description: LEGACY_ROLE_DESCRIPTIONS.do },
    { key: 'jo', label: 'JO Officer', role: 'jo', location_scope: 'assigned', description: LEGACY_ROLE_DESCRIPTIONS.jo },
    { key: 'manager', label: 'Manager', role: 'manager', location_scope: 'tenant', description: LEGACY_ROLE_DESCRIPTIONS.manager },
    { key: 'admin', label: 'Admin', role: 'admin', location_scope: 'tenant', description: LEGACY_ROLE_DESCRIPTIONS.admin }
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

export default function UserInvitationModal({ open, onOpenChange, onSuccess, roleCatalog = null }) {
    const [accountQuery, setAccountQuery] = useState('');
    const [accountResults, setAccountResults] = useState([]);
    const [accountSearchLoading, setAccountSearchLoading] = useState(false);
    const [accountSearchError, setAccountSearchError] = useState('');
    const [selectedDgfyAccount, setSelectedDgfyAccount] = useState(null);
    const [role, setRole] = useState('staff');
    const [loading, setLoading] = useState(false);
    const [locations, setLocations] = useState([]);
    const [selectedLocationIds, setSelectedLocationIds] = useState([]);
    const lastSearchQueryRef = useRef('');

    const roleOptions = useMemo(() => {
        const presets = Array.isArray(roleCatalog?.presets) ? roleCatalog.presets : [];
        if (presets.length === 0) return LEGACY_ROLE_OPTIONS;
        return presets.map((preset) => ({
            key: preset.key,
            label: preset.label,
            role: preset.role,
            location_scope: preset.location_scope,
            description: `${preset.label} uses ${preset.role} compatibility and grants ${preset.permissions?.length || 0} default permissions.`,
            rolePresetKey: preset.key
        }));
    }, [roleCatalog]);
    const selectedRoleOption = roleOptions.find((option) => option.key === role) || roleOptions[0] || LEGACY_ROLE_OPTIONS[0];
    const requiresAssignedLocation = selectedRoleOption?.location_scope === 'assigned';
    const activeLocations = useMemo(() => locations.filter((location) => location.is_active !== false), [locations]);

    useEffect(() => {
        if (!open) return;
        setAccountQuery('');
        setAccountResults([]);
        setAccountSearchError('');
        setSelectedDgfyAccount(null);
        const firstAssignableRole = roleOptions.find((option) => option.role !== 'admin') || roleOptions[0];
        if (firstAssignableRole && !roleOptions.some((option) => option.key === role)) {
            setRole(firstAssignableRole.key);
        }
        listTenantLocations({ include_inactive: false })
            .then((rows) => {
                const normalized = Array.isArray(rows) ? rows : [];
                setLocations(normalized);
                if (normalized.length === 1) {
                    setSelectedLocationIds([Number(normalized[0].location_id)]);
                }
            })
            .catch(() => setLocations([]));
    }, [open, roleOptions, role]);

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

    useEffect(() => {
        if (activeLocations.length === 1) {
            setSelectedLocationIds([Number(activeLocations[0].location_id)]);
        } else if (selectedRoleOption?.location_scope === 'tenant') {
            setSelectedLocationIds(activeLocations.map((location) => Number(location.location_id)));
        } else {
            setSelectedLocationIds([]);
        }
    }, [selectedRoleOption, activeLocations]);

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

        if (requiresAssignedLocation && activeLocations.length > 1 && selectedLocationIds.length === 0) {
            toast.error('Select at least one location for this role');
            return;
        }

        setLoading(true);
        try {
            const result = await userService.inviteDgfyAccountToCompany({
                dgfyAccountId: selectedDgfyAccount.dgfy_account_id,
                role: selectedRoleOption.role,
                rolePresetKey: selectedRoleOption.rolePresetKey || null,
                locationIds: selectedLocationIds
            });

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
            setRole((roleOptions.find((option) => option.role !== 'admin') || roleOptions[0] || LEGACY_ROLE_OPTIONS[0]).key);
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
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent className="sm:max-w-[520px]">
                <DialogHeader>
                    <DialogTitle className="flex items-center gap-2">
                        <UserPlus className="w-5 h-5 text-teal-600" />
                        Invite DGFY Account
                    </DialogTitle>
                </DialogHeader>

                <form onSubmit={handleSubmit} className="grid gap-4 py-4">
                    <div className="grid gap-2">
                        <Label htmlFor="dgfy-account-search">Search registered DGFY account</Label>
                        <div className="relative">
                            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                            <Input
                                id="dgfy-account-search"
                                type="search"
                                placeholder="Search by email or phone"
                                className="pl-9"
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
                            <div className="rounded-lg border border-teal-200 bg-teal-50 p-3 text-sm">
                                <div className="flex items-center gap-2 font-semibold text-teal-900">
                                    <CheckCircle2 className="h-4 w-4" />
                                    {selectedDgfyAccount.display_name || selectedDgfyAccount.email}
                                </div>
                                <p className="mt-1 text-xs text-teal-800">
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
                                            className={`flex w-full items-center justify-between gap-3 border-b border-slate-100 px-3 py-2 text-left text-sm last:border-b-0 ${disabled ? 'cursor-not-allowed bg-slate-50 text-slate-400' : 'hover:bg-teal-50'}`}
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
                        <Label htmlFor="role">Role</Label>
                        <Select value={role} onValueChange={setRole}>
                            <SelectTrigger>
                                <SelectValue placeholder="Select a role" />
                            </SelectTrigger>
                            <SelectContent>
                                {roleOptions.map((option) => (
                                    <SelectItem key={option.key} value={option.key}>
                                        {option.label}
                                    </SelectItem>
                                ))}
                            </SelectContent>
                        </Select>
                        <p className="text-xs text-slate-500">
                            {selectedRoleOption?.description}
                        </p>
                    </div>

                    {activeLocations.length > 0 && (
                        <div className="grid gap-2">
                            <Label>Location Scope</Label>
                            <div className="max-h-32 space-y-2 overflow-y-auto rounded-md border border-slate-200 p-2">
                                {activeLocations.map((location) => {
                                    const locationId = Number(location.location_id);
                                    return (
                                        <label key={locationId} className="flex items-center justify-between gap-2 text-sm">
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

                    <DialogFooter>
                        <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
                            Cancel
                        </Button>
                        <Button type="submit" className="bg-teal-600 hover:bg-teal-700" disabled={loading || accountSearchLoading}>
                            {loading ? 'Sending...' : 'Send DGFY Invitation'}
                        </Button>
                    </DialogFooter>
                </form>
            </DialogContent>
        </Dialog>
    );
}
