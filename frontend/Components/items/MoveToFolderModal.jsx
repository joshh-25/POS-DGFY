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
    const handleMove = (targetFolder) => {
        onMove(targetFolder);
        onClose();
    };

    return (
        <Dialog open={open} onOpenChange={onClose}>
            <DialogContent className="max-w-md">
                <DialogHeader>
                    <DialogTitle>Move to Folder</DialogTitle>
                </DialogHeader>

                <div className="py-4">
                    <p className="text-sm text-slate-500 mb-4">
                        {itemName ? (
                            <>Select a folder to move <span className="font-medium text-slate-900">"{itemName}"</span> to:</>
                        ) : (
                            <>Select a destination folder for the selected items:</>
                        )}
                    </p>

                    <div className="space-y-2 max-h-[300px] overflow-y-auto">
                        {/* No folder / Uncategorized option */}
                        <button
                            onClick={() => handleMove(null)}
                            className={cn(
                                "w-full flex items-center gap-3 p-3 rounded-lg border transition-colors text-left",
                                currentFolder === null
                                    ? "bg-teal-50 border-teal-300 text-teal-900"
                                    : "bg-white border-slate-200 hover:bg-slate-50 hover:border-slate-300"
                            )}
                        >
                            <div className="w-10 h-10 rounded-lg bg-slate-100 flex items-center justify-center">
                                <FolderOpen className="w-5 h-5 text-slate-500" />
                            </div>
                            <div>
                                <p className="font-medium">No Folder</p>
                                <p className="text-xs text-slate-500">Uncategorized items</p>
                            </div>
                            {currentFolder === null && (
                                <span className="ml-auto text-xs text-teal-600 font-medium">Current</span>
                            )}
                        </button>

                        {/* Folder options */}
                        {folders.map(folder => (
                            <button
                                key={folder}
                                onClick={() => handleMove(folder)}
                                className={cn(
                                    "w-full flex items-center gap-3 p-3 rounded-lg border transition-colors text-left",
                                    currentFolder === folder
                                        ? "bg-teal-50 border-teal-300 text-teal-900"
                                        : "bg-white border-slate-200 hover:bg-slate-50 hover:border-slate-300"
                                )}
                            >
                                <div className="w-10 h-10 rounded-lg bg-amber-100 flex items-center justify-center">
                                    <Folder className="w-5 h-5 text-amber-600" />
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

                <DialogFooter>
                    <Button variant="outline" onClick={onClose}>Cancel</Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
}
