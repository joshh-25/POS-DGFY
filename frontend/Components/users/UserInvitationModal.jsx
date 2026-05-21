import React, { useEffect, useMemo, useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Mail, UserPlus } from 'lucide-react';
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

export default function UserInvitationModal({ open, onOpenChange, onSuccess, roleCatalog = null }) {
    const [email, setEmail] = useState('');
    const [role, setRole] = useState('staff');
    const [loading, setLoading] = useState(false);
    const [locations, setLocations] = useState([]);
    const [selectedLocationIds, setSelectedLocationIds] = useState([]);
    const [manualLink, setManualLink] = useState('');
    const [deliveryMode, setDeliveryMode] = useState('email');

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
        setManualLink('');
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

    const copyManualLink = async () => {
        try {
            if (!navigator.clipboard?.writeText) {
                throw new Error('Clipboard is not available in this browser');
            }
            await navigator.clipboard.writeText(manualLink);
            toast.success('Invitation link copied');
        } catch (error) {
            toast.error(error.message || 'Failed to copy invitation link');
        }
    };

    const handleSubmit = async (e) => {
        e.preventDefault();

        if (!email) {
            toast.error('Please enter an email address');
            return;
        }

        if (requiresAssignedLocation && activeLocations.length > 1 && selectedLocationIds.length === 0) {
            toast.error('Select at least one location for this role');
            return;
        }

        setLoading(true);
        try {
            const result = await userService.inviteUser(email, selectedRoleOption.role, {
                rolePresetKey: selectedRoleOption.rolePresetKey || null,
                locationIds: selectedLocationIds,
                deliveryMode
            });

            if (result.email_sent) {
                toast.success(`Invitation sent to ${email}`);
            } else {
                setManualLink(result.invitation_url || '');
                toast.success(
                    result.delivery_status === 'failed'
                        ? `Invitation created, but email delivery failed`
                        : `Invitation link ready for ${email}`
                );
            }

            // Reset form
            setEmail('');
            setRole((roleOptions.find((option) => option.role !== 'admin') || roleOptions[0] || LEGACY_ROLE_OPTIONS[0]).key);
            setSelectedLocationIds(activeLocations.length === 1 ? [Number(activeLocations[0].location_id)] : []);

            // Refresh parent list
            if (onSuccess) onSuccess();
            if (result.email_sent) {
                onOpenChange(false);
            }

        } catch (error) {
            toast.error(error.response?.data?.message || 'Failed to send invitation');
        } finally {
            setLoading(false);
        }
    };

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent className="sm:max-w-[425px]">
                <DialogHeader>
                    <DialogTitle className="flex items-center gap-2">
                        <UserPlus className="w-5 h-5 text-teal-600" />
                        Invite New User
                    </DialogTitle>
                </DialogHeader>

                <form onSubmit={handleSubmit} className="grid gap-4 py-4">
                    {manualLink && (
                        <div className="rounded-lg border border-amber-200 bg-amber-50 p-3">
                            <p className="text-sm font-medium text-amber-900">Manual invitation link</p>
                            <p className="mt-1 break-all text-xs text-amber-800">{manualLink}</p>
                            <Button
                                type="button"
                                variant="outline"
                                size="sm"
                                className="mt-2"
                                onClick={copyManualLink}
                            >
                                Copy Link
                            </Button>
                        </div>
                    )}
                    <div className="grid gap-2">
                        <Label htmlFor="email">Email Address</Label>
                        <div className="relative">
                            <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                            <Input
                                id="email"
                                type="email"
                                placeholder="colleague@company.com"
                                className="pl-9"
                                value={email}
                                onChange={(e) => setEmail(e.target.value)}
                                autoFocus
                            />
                        </div>
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

                    <div className="grid gap-2">
                        <Label htmlFor="deliveryMode">Delivery</Label>
                        <Select value={deliveryMode} onValueChange={setDeliveryMode}>
                            <SelectTrigger>
                                <SelectValue placeholder="Delivery mode" />
                            </SelectTrigger>
                            <SelectContent>
                                <SelectItem value="email">Send email</SelectItem>
                                <SelectItem value="manual">Create manual link</SelectItem>
                            </SelectContent>
                        </Select>
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
                        <Button type="submit" className="bg-teal-600 hover:bg-teal-700" disabled={loading}>
                            {loading ? 'Creating...' : (deliveryMode === 'manual' ? 'Create Link' : 'Send Invitation')}
                        </Button>
                    </DialogFooter>
                </form>
            </DialogContent>
        </Dialog>
    );
}
