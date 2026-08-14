import React, { useState } from 'react';
import { ChevronDown, ChevronRight, Shield, ShieldCheck, ShieldX } from 'lucide-react';
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { PERMISSION_GROUPS } from '../../src/config/permissions_frontend';

/**
 * PermissionMatrix - Accordion-based permission editor
 * Double-column layout with collapsible categories
 */
export default function PermissionMatrix({
    permissions = [],
    isMasterAdmin = false,
    onChange,
    onMasterAdminChange,
    permissionGroups = PERMISSION_GROUPS
}) {
    // Track which accordions are open (all collapsed by default)
    const [openCategories, setOpenCategories] = useState({});

    const toggleCategory = (key) => {
        setOpenCategories(prev => ({
            ...prev,
            [key]: !prev[key]
        }));
    };

    const hasPermission = (perm) => permissions.includes(perm);
    const normalizedPermissionGroups = Array.isArray(permissionGroups)
        ? permissionGroups.reduce((acc, group) => ({
            ...acc,
            [group.key]: {
                label: group.label,
                permissions: group.permissions || {}
            }
        }), {})
        : permissionGroups;

    const visiblePermissions = new Set(
        Object.values(normalizedPermissionGroups).flatMap(group =>
            Object.values(group.permissions || {})
        )
    );

    const hiddenPermissionCount = permissions.filter((perm) => !visiblePermissions.has(perm)).length;

    const togglePermission = (perm) => {
        if (hasPermission(perm)) {
            onChange(permissions.filter(p => p !== perm));
        } else {
            onChange([...permissions, perm]);
        }
    };

    const selectAllInCategory = (groupKey) => {
        const group = normalizedPermissionGroups[groupKey];
        const groupPerms = Object.values(group.permissions);
        const allSelected = groupPerms.every(p => permissions.includes(p));

        if (allSelected) {
            // Deselect all in group
            onChange(permissions.filter(p => !groupPerms.includes(p)));
        } else {
            // Select all in group
            const newPerms = [...new Set([...permissions, ...groupPerms])];
            onChange(newPerms);
        }
    };

    const grantAllPermissions = () => {
        const allPerms = Object.values(normalizedPermissionGroups).flatMap(group =>
            Object.values(group.permissions)
        );
        onChange([...new Set([...permissions.filter((perm) => !visiblePermissions.has(perm)), ...allPerms])]);
    };

    const revokeAllPermissions = () => {
        onChange(permissions.filter((perm) => !visiblePermissions.has(perm)));
    };

    const groupKeys = Object.keys(normalizedPermissionGroups);
    // Pair groups into rows of 2
    const rows = [];
    for (let i = 0; i < groupKeys.length; i += 2) {
        rows.push(groupKeys.slice(i, i + 2));
    }

    return (
        <div className="space-y-4">
            {/* Master Admin Toggle */}
            <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 flex items-center justify-between">
                <div className="flex items-center gap-3">
                    <Shield className="w-5 h-5 text-amber-600" />
                    <div>
                        <p className="font-semibold text-amber-800">Master Administrator</p>
                        <p className="text-sm text-amber-600">Complete access to all features. Grant with caution.</p>
                    </div>
                </div>
                <Switch
                    checked={isMasterAdmin}
                    onCheckedChange={onMasterAdminChange}
                />
            </div>

            {/* Quick Actions */}
            <div className="flex gap-2">
                <Button
                    variant="outline"
                    size="sm"
                    onClick={grantAllPermissions}
                    disabled={isMasterAdmin}
                    className="text-teal-600 border-teal-200 hover:bg-teal-50"
                >
                    <ShieldCheck className="w-4 h-4 mr-1" />
                    Grant All
                </Button>
                <Button
                    variant="outline"
                    size="sm"
                    onClick={revokeAllPermissions}
                    disabled={isMasterAdmin}
                    className="text-red-600 border-red-200 hover:bg-red-50"
                >
                    <ShieldX className="w-4 h-4 mr-1" />
                    Revoke All
                </Button>
            </div>
            {hiddenPermissionCount > 0 && (
                <div className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-xs text-slate-600">
                    {hiddenPermissionCount} legacy or hidden permission{hiddenPermissionCount !== 1 ? 's are' : ' is'} preserved outside the active mode view.
                </div>
            )}

            {/* Accordion Grid */}
            <div className={`space-y-3 ${isMasterAdmin ? 'opacity-50 pointer-events-none' : ''}`}>
                {rows.map((rowKeys, rowIndex) => (
                    <div key={rowIndex} className="grid grid-cols-1 md:grid-cols-2 gap-3">
                        {rowKeys.map((groupKey) => {
                            const group = normalizedPermissionGroups[groupKey];
                            const groupPerms = Object.values(group.permissions);
                            const selectedCount = groupPerms.filter(p => permissions.includes(p)).length;
                            const isOpen = openCategories[groupKey];
                            const allSelected = selectedCount === groupPerms.length;

                            return (
                                <div
                                    key={groupKey}
                                    className="border border-slate-200 rounded-xl overflow-hidden bg-white"
                                >
                                    {/* Accordion Header */}
                                    <div
                                        onClick={() => toggleCategory(groupKey)}
                                        className="w-full flex items-center justify-between p-4 hover:bg-slate-50 transition-colors cursor-pointer"
                                    >
                                        <div className="flex items-center gap-2">
                                            {isOpen ? (
                                                <ChevronDown className="w-4 h-4 text-slate-500" />
                                            ) : (
                                                <ChevronRight className="w-4 h-4 text-slate-500" />
                                            )}
                                            <span className="font-medium text-slate-800">{group.label}</span>
                                            <span className="text-xs text-slate-500 bg-slate-100 px-2 py-0.5 rounded-full">
                                                {selectedCount}/{groupPerms.length}
                                            </span>
                                        </div>
                                        <button
                                            type="button"
                                            onClick={(e) => {
                                                e.stopPropagation();
                                                selectAllInCategory(groupKey);
                                            }}
                                            className={`text-xs font-medium px-2 py-1 rounded transition-colors ${allSelected
                                                    ? 'text-red-600 hover:bg-red-50'
                                                    : 'text-teal-600 hover:bg-teal-50'
                                                }`}
                                        >
                                            {allSelected ? 'Deselect All' : 'Select All'}
                                        </button>
                                    </div>

                                    {/* Accordion Content */}
                                    <div
                                        className={`overflow-hidden transition-all duration-200 ease-in-out ${isOpen ? 'max-h-96' : 'max-h-0'
                                            }`}
                                    >
                                        <div className="p-4 pt-0 space-y-2 border-t border-slate-100">
                                            {Object.entries(group.permissions).map(([permKey, permValue]) => (
                                                <label
                                                    key={permValue}
                                                    className="flex items-center gap-3 py-2 px-3 rounded-lg hover:bg-slate-50 cursor-pointer transition-colors"
                                                >
                                                    <input
                                                        type="checkbox"
                                                        checked={hasPermission(permValue)}
                                                        onChange={() => togglePermission(permValue)}
                                                        className="w-4 h-4 rounded border-slate-300 text-teal-600 focus:ring-teal-500"
                                                    />
                                                    <span className="text-sm text-slate-700">
                                                        {permKey.replace(/_/g, ' ')}
                                                    </span>
                                                </label>
                                            ))}
                                        </div>
                                    </div>
                                </div>
                            );
                        })}
                    </div>
                ))}
            </div>
        </div>
    );
}
