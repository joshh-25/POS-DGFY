import React, { useState } from 'react';
import {
    Dialog,
    DialogContent,
    DialogHeader,
    DialogTitle,
    DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
    Download,
    FileDown,
    Filter,
    Loader2,
    CheckSquare,
    Search
} from 'lucide-react';
import { useSuppliers } from '../../src/hooks/useSuppliers.js';
import { useSupplierCSV } from '../../src/hooks/useSupplierCSV.js';
import { toast } from 'sonner';
import { cn } from "../../src/lib/utils.js";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ScrollArea } from "@/components/ui/scroll-area";

const EXPORT_MODES = {
    ALL: 'all',
    FILTERED: 'filtered',
    MANUAL: 'manual'
};

export default function SupplierExportModal({
    open,
    onClose,
    filters = {},
    filteredCount = 0,
    totalCount = 0 // Optional, if passed from parent
}) {
    const { loading, exportSuppliers } = useSupplierCSV();
    const { suppliers, loading: loadingSuppliers } = useSuppliers({ limit: 1000 }); // Fetch all for manual selection
    const [exportMode, setExportMode] = useState(EXPORT_MODES.ALL);
    const [searchQuery, setSearchQuery] = useState('');
    const [selectedIds, setSelectedIds] = useState([]);

    const handleExport = async () => {
        let result;
        try {
            if (exportMode === EXPORT_MODES.ALL) {
                result = await exportSuppliers({});
            } else if (exportMode === EXPORT_MODES.MANUAL) {
                if (selectedIds.length === 0) {
                    toast.error('Please select at least one supplier');
                    return;
                }
                result = await exportSuppliers({ ids: selectedIds });
            } else {
                result = await exportSuppliers(filters);
            }

            if (result.success) {
                toast.success('Suppliers exported successfully');
                onClose();
            } else {
                toast.error(result.error || 'Export failed');
            }
        } catch (error) {
            toast.error('Failed to export suppliers');
        }
    };

    const getFilterSummary = () => {
        const parts = [];
        if (filters.search) {
            parts.push(`Search: "${filters.search}"`);
        }
        if (filters.status && filters.status !== 'all') {
            parts.push(`Status: ${filters.status}`);
        }
        return parts.length > 0 ? parts : ['No filters applied'];
    };

    const filteredSelectionSuppliers = suppliers?.filter(s =>
        s.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
        s.contact_person?.toLowerCase().includes(searchQuery.toLowerCase())
    ) || [];

    const toggleSelection = (id) => {
        setSelectedIds(prev =>
            prev.includes(id)
                ? prev.filter(item => item !== id)
                : [...prev, id]
        );
    };

    const toggleAll = () => {
        if (selectedIds.length === filteredSelectionSuppliers.length) {
            setSelectedIds([]);
        } else {
            setSelectedIds(filteredSelectionSuppliers.map(s => s.supplier_id || s.id));
        }
    };

    return (
        <Dialog open={open} onOpenChange={onClose}>
            <DialogContent className="sm:max-w-xl">
                <DialogHeader>
                    <DialogTitle className="flex items-center gap-2">
                        <FileDown className="w-5 h-5 text-teal-600" />
                        Export Suppliers to CSV
                    </DialogTitle>
                </DialogHeader>

                <div className="py-4 space-y-4">
                    <div className="grid grid-cols-3 gap-3">
                        <button
                            className={cn(
                                "p-4 rounded-lg border-2 text-left transition-all",
                                exportMode === EXPORT_MODES.ALL
                                    ? "border-teal-500 bg-teal-50"
                                    : "border-slate-200 hover:border-slate-300"
                            )}
                            onClick={() => setExportMode(EXPORT_MODES.ALL)}
                        >
                            <Download className={cn(
                                "w-5 h-5 mb-2",
                                exportMode === EXPORT_MODES.ALL ? "text-teal-600" : "text-slate-400"
                            )} />
                            <p className="font-medium text-sm">All Suppliers</p>
                            {totalCount > 0 && <p className="text-xs text-slate-500">{totalCount} total</p>}
                        </button>

                        <button
                            className={cn(
                                "p-4 rounded-lg border-2 text-left transition-all",
                                exportMode === EXPORT_MODES.FILTERED
                                    ? "border-teal-500 bg-teal-50"
                                    : "border-slate-200 hover:border-slate-300"
                            )}
                            onClick={() => setExportMode(EXPORT_MODES.FILTERED)}
                        >
                            <Filter className={cn(
                                "w-5 h-5 mb-2",
                                exportMode === EXPORT_MODES.FILTERED ? "text-teal-600" : "text-slate-400"
                            )} />
                            <p className="font-medium text-sm">Filtered View</p>
                            {filteredCount > 0 && <p className="text-xs text-slate-500">{filteredCount} matches</p>}
                        </button>

                        <button
                            className={cn(
                                "p-4 rounded-lg border-2 text-left transition-all",
                                exportMode === EXPORT_MODES.MANUAL
                                    ? "border-teal-500 bg-teal-50"
                                    : "border-slate-200 hover:border-slate-300"
                            )}
                            onClick={() => setExportMode(EXPORT_MODES.MANUAL)}
                        >
                            <CheckSquare className={cn(
                                "w-5 h-5 mb-2",
                                exportMode === EXPORT_MODES.MANUAL ? "text-teal-600" : "text-slate-400"
                            )} />
                            <p className="font-medium text-sm">Manual Select</p>
                            <p className="text-xs text-slate-500">{selectedIds.length} selected</p>
                        </button>
                    </div>

                    {exportMode === EXPORT_MODES.FILTERED && (
                        <div className="bg-slate-50 rounded-lg p-3">
                            <p className="text-xs font-medium text-slate-500 mb-2 uppercase">Current Filters</p>
                            <div className="flex flex-wrap gap-2">
                                {getFilterSummary().map((filter, idx) => (
                                    <Badge key={idx} variant="secondary" className="text-xs font-normal">
                                        {filter}
                                    </Badge>
                                ))}
                            </div>
                        </div>
                    )}

                    {exportMode === EXPORT_MODES.MANUAL && (
                        <div className="border border-slate-200 rounded-lg overflow-hidden flex flex-col h-[300px]">
                            <div className="p-3 border-b border-slate-100 bg-slate-50 flex gap-2 items-center">
                                <Search className="w-4 h-4 text-slate-400" />
                                <Input
                                    placeholder="Search suppliers..."
                                    value={searchQuery}
                                    onChange={(e) => setSearchQuery(e.target.value)}
                                    className="h-8 text-sm bg-white border-slate-200"
                                />
                            </div>
                            <div className="p-2 border-b border-slate-100 bg-white flex justify-between items-center">
                                <span className="text-xs text-slate-500 font-medium ml-2">
                                    {filteredSelectionSuppliers.length} suppliers found
                                </span>
                                <Button variant="ghost" size="sm" onClick={toggleAll} className="h-6 text-xs text-teal-600">
                                    {selectedIds.length === filteredSelectionSuppliers.length ? 'Deselect All' : 'Select All'}
                                </Button>
                            </div>
                            <ScrollArea className="flex-1 p-2">
                                {loadingSuppliers ? (
                                    <div className="flex items-center justify-center h-full">
                                        <Loader2 className="w-6 h-6 animate-spin text-teal-600" />
                                    </div>
                                ) : (
                                    <div className="space-y-1">
                                        {filteredSelectionSuppliers.map(supplier => {
                                            const sId = supplier.supplier_id || supplier.id;
                                            return (
                                                <div
                                                    key={sId}
                                                    className={cn(
                                                        "flex items-center gap-3 p-2 rounded-md transition-colors cursor-pointer",
                                                        selectedIds.includes(sId) ? "bg-teal-50" : "hover:bg-slate-50"
                                                    )}
                                                    onClick={() => toggleSelection(sId)}
                                                >
                                                    <Checkbox
                                                        checked={selectedIds.includes(sId)}
                                                        onCheckedChange={() => toggleSelection(sId)}
                                                    />
                                                    <div className="flex-1 overflow-hidden">
                                                        <p className="text-sm font-medium truncate text-slate-700">{supplier.name}</p>
                                                        <p className="text-xs text-slate-500 truncate">{supplier.contact_person} • {supplier.email}</p>
                                                    </div>
                                                    {supplier.status === 'active' ? (
                                                        <Badge variant="outline" className="text-[10px] bg-emerald-50 text-emerald-700 border-emerald-200 h-5 px-1.5">
                                                            Active
                                                        </Badge>
                                                    ) : (
                                                        <Badge variant="outline" className="text-[10px] bg-slate-50 text-slate-500 border-slate-200 h-5 px-1.5">
                                                            {supplier.status}
                                                        </Badge>
                                                    )}
                                                </div>
                                            );
                                        })}
                                        {filteredSelectionSuppliers.length === 0 && (
                                            <p className="text-center text-sm text-slate-400 py-8">No suppliers found</p>
                                        )}
                                    </div>
                                )}
                            </ScrollArea>
                        </div>
                    )}
                </div>

                <DialogFooter>
                    <Button variant="outline" onClick={onClose}>
                        Cancel
                    </Button>
                    <Button
                        onClick={handleExport}
                        disabled={loading || (exportMode === EXPORT_MODES.MANUAL && selectedIds.length === 0)}
                        className="bg-teal-600 hover:bg-teal-700"
                    >
                        {loading ? (
                            <>
                                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                                Exporting...
                            </>
                        ) : (
                            <>
                                <Download className="w-4 h-4 mr-2" />
                                Export {exportMode === EXPORT_MODES.MANUAL ? `(${selectedIds.length})` : ''}
                            </>
                        )}
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
}
