import { useState, useCallback } from 'react';

export function useItemSelection(items) {
    const [selectedIds, setSelectedIds] = useState(new Set());
    const [lastSelectedId, setLastSelectedId] = useState(null);

    const toggleSelection = useCallback((id, multiSelect = false, rangeSelect = false) => {
        setSelectedIds(prev => {
            const newSet = new Set(multiSelect ? prev : []);

            if (rangeSelect && lastSelectedId && items) {
                // Range selection logic
                const lastIndex = items.findIndex(i => (i.item_id || i.id) === lastSelectedId);
                const currentIndex = items.findIndex(i => (i.item_id || i.id) === id);

                if (lastIndex !== -1 && currentIndex !== -1) {
                    const start = Math.min(lastIndex, currentIndex);
                    const end = Math.max(lastIndex, currentIndex);

                    // Add all items in range
                    for (let i = start; i <= end; i++) {
                        const itemId = items[i].item_id || items[i].id;
                        newSet.add(itemId);
                    }
                    return newSet;
                }
            }

            // Normal/Multi selection logic
            if (newSet.has(id)) {
                if (multiSelect) {
                    newSet.delete(id);
                } else {
                    // If clicking selected item without modifier, select ONLY this item
                    newSet.clear();
                    newSet.add(id);
                }
            } else {
                newSet.add(id);
            }

            return newSet;
        });

        setLastSelectedId(id);
    }, [items, lastSelectedId]);

    const clearSelection = useCallback(() => {
        setSelectedIds(new Set());
        setLastSelectedId(null);
    }, []);

    const selectAll = useCallback(() => {
        if (!items) return;
        const allIds = items.map(i => i.item_id || i.id);
        setSelectedIds(new Set(allIds));
    }, [items]);

    return {
        selectedIds,
        toggleSelection,
        clearSelection,
        selectAll,
        count: selectedIds.size
    };
}
