import React, { useState } from 'react';
import { X, Search, ChevronDown, ChevronRight } from 'lucide-react';
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { PERMISSION_GROUPS } from '../../src/config/permissions_frontend';

/**
 * PermissionPickerModal - Modal for selecting multiple permissions
 * Uses accordion layout with checkboxes for multi-select
 */
export default function PermissionPickerModal({
    open,
    onClose,
    onSelect,
    title = "Select Permissions",
    mode = "grant" // "grant" or "revoke"
}) {
    const [search, setSearch] = useState('');
    const [selectedPermissions, setSelectedPermissions] = useState([]);
    const [openCategories, setOpenCategories] = useState({});

    if (!open) return null;

    const toggleCategory = (key) => {
        setOpenCategories(prev => ({
            ...prev,
            [key]: !prev[key]
        }));
    };

    const togglePermission = (permValue) => {
        setSelectedPermissions(prev =>
            prev.includes(permValue)
                ? prev.filter(p => p !== permValue)
                : [...prev, permValue]
        );
    };

    const selectAllInCategory = (groupKey) => {
        const group = PERMISSION_GROUPS[groupKey];
        const groupPerms = Object.values(group.permissions);
        const allSelected = groupPerms.every(p => selectedPermissions.includes(p));

        if (allSelected) {
            setSelectedPermissions(prev => prev.filter(p => !groupPerms.includes(p)));
        } else {
            setSelectedPermissions(prev => [...new Set([...prev, ...groupPerms])]);
        }
    };

    // Filter permissions based on search
    const matchesSearch = (permKey, permValue, groupLabel) => {
        if (!search) return true;
        const searchLower = search.toLowerCase();
        return (
            permKey.replace(/_/g, ' ').toLowerCase().includes(searchLower) ||
            permValue.toLowerCase().includes(searchLower) ||
            groupLabel.toLowerCase().includes(searchLower)
        );
    };

    const handleConfirm = () => {
        if (selectedPermissions.length > 0) {
            onSelect(selectedPermissions);
            setSelectedPermissions([]);
            setSearch('');
            setOpenCategories({});
            onClose();
        }
    };

    const handleClose = () => {
        setSelectedPermissions([]);
        setSearch('');
        setOpenCategories({});
        onClose();
    };

    // Group permissions in rows of 2
    const groupKeys = Object.keys(PERMISSION_GROUPS);
    const rows = [];
    for (let i = 0; i < groupKeys.length; i += 2) {
        rows.push(groupKeys.slice(i, i + 2));
    }

    return (
        <div className="fixed inset-0 bg-black/50 z-[60] flex items-center justify-center p-4">
            <div className="bg-white rounded-xl shadow-2xl w-full max-w-4xl max-h-[85vh] flex flex-col">
                {/* Header */}
                <div className="flex items-center justify-between p-4 border-b">
                    <h3 className="text-lg font-semibold text-slate-900">{title}</h3>
                    <button onClick={handleClose} className="p-1 hover:bg-slate-100 rounded">
                        <X className="w-5 h-5 text-slate-500" />
                    </button>
                </div>

                {/* Search & Selection Info */}
                <div className="p-4 border-b space-y-2">
                    <div className="relative">
                        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                        <Input
                            placeholder="Search permissions..."
                            value={search}
                            onChange={(e) => setSearch(e.target.value)}
                            className="pl-9"
                        />
                    </div>
                    {selectedPermissions.length > 0 && (
                        <div className="flex items-center gap-2 flex-wrap">
                            <span className="text-sm text-slate-500">Selected ({selectedPermissions.length}):</span>
                            {selectedPermissions.slice(0, 5).map(perm => (
                                <span
                                    key={perm}
                                    className="bg-teal-100 text-teal-700 px-2 py-0.5 rounded text-xs font-medium"
                                >
                                    {perm}
                                </span>
                            ))}
                            {selectedPermissions.length > 5 && (
                                <span className="text-xs text-slate-500">
                                    +{selectedPermissions.length - 5} more
                                </span>
                            )}
                            <button
                                onClick={() => setSelectedPermissions([])}
                                className="text-xs text-red-600 hover:underline ml-2"
                            >
                                Clear all
                            </button>
                        </div>
                    )}
                </div>

                {/* Accordion Grid */}
                <div className="flex-1 overflow-y-auto p-4">
                    <div className="space-y-3">
                        {rows.map((rowKeys, rowIndex) => (
                            <div key={rowIndex} className="grid grid-cols-1 md:grid-cols-2 gap-3">
                                {rowKeys.map((groupKey) => {
                                    const group = PERMISSION_GROUPS[groupKey];
                                    const permissions = Object.entries(group.permissions);
                                    const filteredPerms = permissions.filter(([permKey, permValue]) =>
                                        matchesSearch(permKey, permValue, group.label)
                                    );

                                    // Hide category if no permissions match search
                                    if (search && filteredPerms.length === 0) return null;

                                    const isOpen = openCategories[groupKey] || (search && filteredPerms.length > 0);
                                    const groupPerms = Object.values(group.permissions);
                                    const selectedCount = groupPerms.filter(p => selectedPermissions.includes(p)).length;
                                    const allSelected = selectedCount === groupPerms.length;

                                    return (
                                        <div
                                            key={groupKey}
                                            className={`border rounded-xl overflow-hidden bg-white transition-colors ${selectedCount > 0 ? 'border-teal-300' : 'border-slate-200'
                                                }`}
                                        >
                                            {/* Accordion Header */}
                                            <div className="flex items-center justify-between p-3 hover:bg-slate-50 transition-colors">
                                                <button
                                                    onClick={() => toggleCategory(groupKey)}
                                                    className="flex items-center gap-2 flex-1"
                                                >
                                                    {isOpen ? (
                                                        <ChevronDown className="w-4 h-4 text-slate-500" />
                                                    ) : (
                                                        <ChevronRight className="w-4 h-4 text-slate-500" />
                                                    )}
                                                    <span className="font-medium text-slate-800 text-sm">{group.label}</span>
                                                    <span className={`text-xs px-2 py-0.5 rounded-full ${selectedCount > 0
                                                            ? 'bg-teal-100 text-teal-700'
                                                            : 'bg-slate-100 text-slate-500'
                                                        }`}>
                                                        {selectedCount}/{filteredPerms.length}
                                                    </span>
                                                </button>
                                                <button
                                                    onClick={() => selectAllInCategory(groupKey)}
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
                                                <div className="p-3 pt-0 space-y-1 border-t border-slate-100">
                                                    {filteredPerms.map(([permKey, permValue]) => (
                                                        <label
                                                            key={permValue}
                                                            className={`flex items-center gap-3 py-2 px-3 rounded-lg cursor-pointer transition-colors ${selectedPermissions.includes(permValue)
                                                                    ? 'bg-teal-50 text-teal-800'
                                                                    : 'hover:bg-slate-100 text-slate-700'
                                                                }`}
                                                        >
                                                            <input
                                                                type="checkbox"
                                                                checked={selectedPermissions.includes(permValue)}
                                                                onChange={() => togglePermission(permValue)}
                                                                className="w-4 h-4 rounded border-slate-300 text-teal-600 focus:ring-teal-500"
                                                            />
                                                            <span className="text-sm">{permKey.replace(/_/g, ' ')}</span>
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

                {/* Footer */}
                <div className="p-4 border-t flex justify-between items-center">
                    <span className="text-sm text-slate-500">
                        {selectedPermissions.length} permission{selectedPermissions.length !== 1 ? 's' : ''} selected
                    </span>
                    <div className="flex gap-2">
                        <Button variant="outline" onClick={handleClose}>
                            Cancel
                        </Button>
                        <Button
                            onClick={handleConfirm}
                            disabled={selectedPermissions.length === 0}
                            className={mode === 'grant' ? 'bg-teal-600 hover:bg-teal-700' : 'bg-red-600 hover:bg-red-700'}
                        >
                            {mode === 'grant'
                                ? `Grant ${selectedPermissions.length} Permission${selectedPermissions.length !== 1 ? 's' : ''}`
                                : `Revoke ${selectedPermissions.length} Permission${selectedPermissions.length !== 1 ? 's' : ''}`}
                        </Button>
                    </div>
                </div>
            </div>
        </div>
    );
}
