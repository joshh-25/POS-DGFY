import React from 'react';
import {
    Dialog,
    DialogContent,
    DialogHeader,
    DialogTitle,
    DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Folder, FolderOpen } from 'lucide-react';
import { cn } from "@/lib/utils";

export default function MoveToFolderModal({
    open,
    onClose,
    folders = [],
    currentFolder = null,
    itemName = '',
    onMove
}) {
    const [moving, setMoving] = React.useState(false);

    const handleMove = async (targetFolder) => {
        if (moving || typeof onMove !== 'function') return;
        setMoving(true);
        try {
            const result = await onMove(targetFolder);
            if (result !== false) onClose();
        } catch {
            // The owning page is responsible for displaying the request error.
        } finally {
            setMoving(false);
        }
    };

    const handleOpenChange = (nextOpen) => {
        if (!nextOpen && !moving) onClose();
    };

    return (
        <Dialog open={open} onOpenChange={handleOpenChange}>
            <DialogContent className="catalog-editor-dialog-content max-w-md p-0">
                <DialogHeader className="border-b border-slate-100 p-4 pb-3">
                    <DialogTitle>Move to Folder</DialogTitle>
                </DialogHeader>

                <div className="p-4 pt-3">
                    <p className="mb-3 text-sm text-slate-500">
                        {itemName ? (
                            <>Select a folder to move <span className="font-medium text-slate-900">&quot;{itemName}&quot;</span> to:</>
                        ) : (
                            <>Select a destination folder for the selected items:</>
                        )}
                    </p>

                    <div className="max-h-[300px] space-y-2 overflow-y-auto">
                        {/* No folder / Uncategorized option */}
                        <button
                            type="button"
                            onClick={() => handleMove(null)}
                            disabled={moving}
                            className={cn(
                                "flex w-full items-center gap-3 rounded-lg border p-2.5 text-left transition-colors",
                                currentFolder === null
                                    ? "bg-teal-50 border-teal-300 text-teal-900"
                                    : "bg-white border-slate-200 hover:bg-slate-50 hover:border-slate-300"
                            )}
                        >
                            <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-slate-100">
                                <FolderOpen className="h-4 w-4 text-slate-500" />
                            </div>
                            <div>
                                <p className="font-medium">No Folder</p>
                                <p className="text-xs text-slate-500">No category</p>
                            </div>
                            {currentFolder === null && (
                                <span className="ml-auto text-xs text-teal-600 font-medium">Current</span>
                            )}
                        </button>

                        {/* Folder options */}
                        {folders.map(folder => (
                            <button
                                key={folder}
                                type="button"
                                onClick={() => handleMove(folder)}
                                disabled={moving}
                                className={cn(
                                    "flex w-full items-center gap-3 rounded-lg border p-2.5 text-left transition-colors",
                                    currentFolder === folder
                                        ? "bg-teal-50 border-teal-300 text-teal-900"
                                        : "bg-white border-slate-200 hover:bg-slate-50 hover:border-slate-300"
                                )}
                            >
                                <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-amber-100">
                                    <Folder className="h-4 w-4 text-amber-600" />
                                </div>
                                <div>
                                    <p className="font-medium">{folder}</p>
                                </div>
                                {currentFolder === folder && (
                                    <span className="ml-auto text-xs text-teal-600 font-medium">Current</span>
                                )}
                            </button>
                        ))}
                    </div>
                </div>

                <DialogFooter className="p-4 pt-1">
                    {moving && <span className="mr-auto self-center text-sm text-slate-500">Moving…</span>}
                    <Button variant="outline" onClick={onClose} disabled={moving}>Cancel</Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
}
