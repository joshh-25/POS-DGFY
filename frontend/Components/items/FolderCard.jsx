import React from 'react';
import { useDroppable } from '@dnd-kit/core';
import { Folder, MoreVertical, Trash2 } from 'lucide-react';
import { cn } from '@/lib/utils';
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Button } from "@/components/ui/button";

/**
 * FolderCard - Displays a folder with item count
 * Click to enter folder and view items inside
 */
export default function FolderCard({
    name,
    itemCount = 0,
    onClick,
    onDelete,
    canDelete = false,
}) {
    const { setNodeRef, isOver } = useDroppable({
        id: name, // Folder name acts as the droppable ID
    });

    return (
        <div
            ref={setNodeRef}
            className={cn(
                "relative bg-white rounded-2xl border-2 border-slate-200 p-6 cursor-pointer transition-all duration-200",
                "hover:border-teal-400 hover:shadow-lg hover:scale-[1.02]",
                "flex flex-col items-center justify-center gap-3 min-h-[180px]",
                isOver && "border-teal-500 bg-teal-50 shadow-lg scale-[1.05] ring-2 ring-teal-500 ring-offset-2"
            )}
            onClick={onClick}
        >
            {canDelete && (
                <div className="absolute top-2 right-2" onClick={(e) => e.stopPropagation()}>
                    <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                            <Button variant="ghost" size="icon" className="h-8 w-8">
                                <MoreVertical className="w-4 h-4" />
                            </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
                            <DropdownMenuItem
                                onClick={() => onDelete?.()}
                                className="text-red-600 focus:text-red-600 focus:bg-red-50"
                            >
                                <Trash2 className="w-4 h-4 mr-2" /> Delete Folder
                            </DropdownMenuItem>
                        </DropdownMenuContent>
                    </DropdownMenu>
                </div>
            )}

            <div className={cn(
                "p-4 rounded-xl transition-colors",
                isOver ? "bg-teal-100" : "bg-slate-100"
            )}>
                <Folder className={cn(
                    "w-10 h-10",
                    isOver ? "text-teal-600" : "text-slate-500"
                )} />
            </div>

            <div className="text-center">
                <h3 className="font-semibold text-slate-900 text-lg">{name}</h3>
                <p className="text-sm text-slate-500 mt-1">
                    {itemCount} {itemCount === 1 ? 'item' : 'items'}
                </p>
            </div>
        </div>
    );
}
