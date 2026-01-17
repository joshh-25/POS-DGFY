import React from 'react';
import { useDroppable } from '@dnd-kit/core';
import { Folder } from 'lucide-react';
import { cn } from '@/lib/utils';

/**
 * FolderCard - Displays a folder with item count
 * Click to enter folder and view items inside
 */
export default function FolderCard({
    name,
    itemCount = 0,
    onClick,
}) {
    const { setNodeRef, isOver } = useDroppable({
        id: name, // Folder name acts as the droppable ID
    });

    return (
        <div
            ref={setNodeRef}
            className={cn(
                "bg-white rounded-2xl border-2 border-slate-200 p-6 cursor-pointer transition-all duration-200",
                "hover:border-teal-400 hover:shadow-lg hover:scale-[1.02]",
                "flex flex-col items-center justify-center gap-3 min-h-[180px]",
                isOver && "border-teal-500 bg-teal-50 shadow-lg scale-[1.05] ring-2 ring-teal-500 ring-offset-2"
            )}
            onClick={onClick}
        >
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
