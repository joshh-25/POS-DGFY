import React, { useState, useEffect, useMemo } from 'react';
import {
    Dialog,
    DialogContent,
    DialogHeader,
    DialogTitle,
    DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
    Download,
    FileDown,
    Filter,
    ListChecks,
    Loader2,
    Search,
    CheckSquare,
    Square,
    Package
} from 'lucide-react';
import { cn } from "../../src/lib/utils.js";
import { useCSVExport } from '../../src/hooks/useCSVExport.js';
import { toast } from 'sonner';

const EXPORT_MODES = {
    ALL: 'all',
    FILTERED: 'filtered',
    SELECTED: 'selected'
};

export default function CSVExportModal({
    open,
    onClose,
    items = [],
    filters = {},
    filteredCount = 0
}) {
    const { loading, exportAll, exportFiltered, exportByIds, getExportPreview } = useCSVExport();

    const [exportMode, setExportMode] = useState(EXPORT_MODES.ALL);
    const [selectedIds, setSelectedIds] = useState(new Set());
    const [searchQuery, setSearchQuery] = useState('');
    const [allItemsCount, setAllItemsCount] = useState(0);

    // Get all items count on open
    useEffect(() => {
        if (open) {
            getExportPreview({}).then(result => {
                if (result.success) {
                    setAllItemsCount(result.count);
                }
            });
        }
    }, [open]);

    // Reset state on close
    useEffect(() => {
        if (!open) {
            setExportMode(EXPORT_MODES.ALL);
            setSelectedIds(new Set());
            setSearchQuery('');
        }
    }, [open]);

    // Filter items for selection view
    const selectableItems = useMemo(() => {
        if (!searchQuery.trim()) return items;
        const query = searchQuery.toLowerCase();
        return items.filter(item =>
            item.name.toLowerCase().includes(query) ||
            (item.sku_code || '').toLowerCase().includes(query)
        );
    }, [items, searchQuery]);

    const handleSelectAll = () => {
        const allIds = new Set(selectableItems.map(item => item.item_id));
        setSelectedIds(allIds);
    };

    const handleDeselectAll = () => {
        setSelectedIds(new Set());
    };

    const handleToggleItem = (itemId) => {
        const newSet = new Set(selectedIds);
        if (newSet.has(itemId)) {
            newSet.delete(itemId);
        } else {
            newSet.add(itemId);
        }
        setSelectedIds(newSet);
    };

    const handleExport = async () => {
        let result;

        try {
            switch (exportMode) {
                case EXPORT_MODES.ALL:
                    result = await exportAll();
                    break;
                case EXPORT_MODES.FILTERED:
                    result = await exportFiltered(filters);
                    break;
                case EXPORT_MODES.SELECTED:
                    if (selectedIds.size === 0) {
                        toast.error('Please select at least one item to export');
                        return;
                    }
                    result = await exportByIds(Array.from(selectedIds));
                    break;
            }

            if (result.success) {
                toast.success('Items exported successfully');
                onClose();
            } else {
                toast.error(result.error || 'Export failed');
            }
        } catch (error) {
            toast.error('Failed to export items');
        }
    };

    const getExportCount = () => {
        switch (exportMode) {
            case EXPORT_MODES.ALL:
                return allItemsCount;
            case EXPORT_MODES.FILTERED:
                return filteredCount;
            case EXPORT_MODES.SELECTED:
                return selectedIds.size;
            default:
                return 0;
        }
    };

    const getFilterSummary = () => {
        const parts = [];
        if (filters.category && filters.category !== 'all') {
            parts.push(`Category: ${filters.category.replace('_', ' ')}`);
        }
        if (filters.search) {
            parts.push(`Search: "${filters.search}"`);
        }
        if (filters.fifo && filters.fifo !== 'all') {
            parts.push(`FIFO: ${filters.fifo}`);
        }
        if (filters.folder && filters.folder !== 'all') {
            parts.push(`Folder: ${filters.folder}`);
        }
        return parts.length > 0 ? parts : ['No filters applied'];
    };

    const getCategoryColor = (category) => {
        const colors = {
            raw_material: 'bg-amber-100 text-amber-700',
            packaging: 'bg-purple-100 text-purple-700',
            product: 'bg-teal-100 text-teal-700',
            supplies: 'bg-slate-100 text-slate-700'
        };
        return colors[category] || 'bg-slate-100 text-slate-700';
    };

    return (
        <Dialog open={open} onOpenChange={onClose}>
            <DialogContent className="sm:max-w-2xl max-h-[80vh] flex flex-col">
                <DialogHeader>
                    <DialogTitle className="flex items-center gap-2">
                        <FileDown className="w-5 h-5 text-blue-600" />
                        Export Items to CSV
                    </DialogTitle>
                </DialogHeader>

                <div className="flex-1 overflow-hidden">
                    {/* Export Mode Selection */}
                    <div className="grid grid-cols-3 gap-3 mb-4">
                        <button
                            className={cn(
                                "p-4 rounded-lg border-2 text-left transition-all",
                                exportMode === EXPORT_MODES.ALL
                                    ? "border-blue-500 bg-blue-50"
                                    : "border-slate-200 hover:border-slate-300"
                            )}
                            onClick={() => setExportMode(EXPORT_MODES.ALL)}
                        >
                            <Download className={cn(
                                "w-5 h-5 mb-2",
                                exportMode === EXPORT_MODES.ALL ? "text-blue-600" : "text-slate-400"
                            )} />
                            <p className="font-medium text-sm">All Items</p>
                            <p className="text-xs text-slate-500">{allItemsCount} items</p>
                        </button>

                        <button
                            className={cn(
                                "p-4 rounded-lg border-2 text-left transition-all",
                                exportMode === EXPORT_MODES.FILTERED
                                    ? "border-blue-500 bg-blue-50"
                                    : "border-slate-200 hover:border-slate-300"
                            )}
                            onClick={() => setExportMode(EXPORT_MODES.FILTERED)}
                        >
                            <Filter className={cn(
                                "w-5 h-5 mb-2",
                                exportMode === EXPORT_MODES.FILTERED ? "text-blue-600" : "text-slate-400"
                            )} />
                            <p className="font-medium text-sm">Filtered Items</p>
                            <p className="text-xs text-slate-500">{filteredCount} items</p>
                        </button>

                        <button
                            className={cn(
                                "p-4 rounded-lg border-2 text-left transition-all",
                                exportMode === EXPORT_MODES.SELECTED
                                    ? "border-blue-500 bg-blue-50"
                                    : "border-slate-200 hover:border-slate-300"
                            )}
                            onClick={() => setExportMode(EXPORT_MODES.SELECTED)}
                        >
                            <ListChecks className={cn(
                                "w-5 h-5 mb-2",
                                exportMode === EXPORT_MODES.SELECTED ? "text-blue-600" : "text-slate-400"
                            )} />
                            <p className="font-medium text-sm">Select Items</p>
                            <p className="text-xs text-slate-500">{selectedIds.size} selected</p>
                        </button>
                    </div>

                    {/* Mode-specific content */}
                    {exportMode === EXPORT_MODES.FILTERED && (
                        <div className="bg-slate-50 rounded-lg p-4 mb-4">
                            <p className="text-sm font-medium text-slate-700 mb-2">Current Filters:</p>
                            <div className="flex flex-wrap gap-2">
                                {getFilterSummary().map((filter, idx) => (
                                    <Badge key={idx} variant="secondary" className="text-xs">
                                        {filter}
                                    </Badge>
                                ))}
                            </div>
                        </div>
                    )}

                    {exportMode === EXPORT_MODES.SELECTED && (
                        <div className="flex-1 flex flex-col min-h-0">
                            {/* Search and bulk actions */}
                            <div className="flex items-center gap-2 mb-3">
                                <div className="relative flex-1">
                                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                                    <Input
                                        placeholder="Search items..."
                                        value={searchQuery}
                                        onChange={(e) => setSearchQuery(e.target.value)}
                                        className="pl-9"
                                    />
                                </div>
                                <Button variant="outline" size="sm" onClick={handleSelectAll}>
                                    <CheckSquare className="w-4 h-4 mr-1" />
                                    All
                                </Button>
                                <Button variant="outline" size="sm" onClick={handleDeselectAll}>
                                    <Square className="w-4 h-4 mr-1" />
                                    None
                                </Button>
                            </div>

                            {/* Item list with checkboxes */}
                            <ScrollArea className="h-64 border rounded-lg">
                                <div className="p-2">
                                    {selectableItems.length === 0 ? (
                                        <p className="text-sm text-slate-500 text-center py-4">No items found</p>
                                    ) : (
                                        selectableItems.map(item => (
                                            <div
                                                key={item.item_id}
                                                className={cn(
                                                    "flex items-center gap-3 p-2 rounded-md cursor-pointer hover:bg-slate-50",
                                                    selectedIds.has(item.item_id) && "bg-blue-50"
                                                )}
                                                onClick={() => handleToggleItem(item.item_id)}
                                            >
                                                <Checkbox
                                                    checked={selectedIds.has(item.item_id)}
                                                    onCheckedChange={() => handleToggleItem(item.item_id)}
                                                />
                                                <div className="w-8 h-8 rounded bg-slate-100 flex items-center justify-center">
                                                    <Package className="w-4 h-4 text-slate-400" />
                                                </div>
                                                <div className="flex-1 min-w-0">
                                                    <p className="font-medium text-sm text-slate-900 truncate">{item.name}</p>
                                                    <p className="text-xs text-slate-500">{item.sku_code}</p>
                                                </div>
                                                <Badge className={cn("text-xs", getCategoryColor(item.category))}>
                                                    {item.category?.replace('_', ' ')}
                                                </Badge>
                                            </div>
                                        ))
                                    )}
                                </div>
                            </ScrollArea>
                        </div>
                    )}
                </div>

                <DialogFooter className="mt-4">
                    <div className="flex items-center justify-between w-full">
                        <p className="text-sm text-slate-500">
                            {getExportCount()} items will be exported
                        </p>
                        <div className="flex gap-2">
                            <Button variant="outline" onClick={onClose}>
                                Cancel
                            </Button>
                            <Button
                                onClick={handleExport}
                                disabled={loading || (exportMode === EXPORT_MODES.SELECTED && selectedIds.size === 0)}
                                className="bg-blue-600 hover:bg-blue-700"
                            >
                                {loading ? (
                                    <>
                                        <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                                        Exporting...
                                    </>
                                ) : (
                                    <>
                                        <Download className="w-4 h-4 mr-2" />
                                        Export CSV
                                    </>
                                )}
                            </Button>
                        </div>
                    </div>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
}
