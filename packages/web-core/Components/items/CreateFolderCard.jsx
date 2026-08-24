import React, { useState } from 'react';
import { Plus, FolderPlus } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

/**
 * CreateFolderCard - Special card for creating new folders
 * First card in the grid, with (+) icon
 */
export default function CreateFolderCard({ onCreateFolder }) {
    const [isCreating, setIsCreating] = useState(false);
    const [folderName, setFolderName] = useState('');
    const [error, setError] = useState('');

    const handleCreate = () => {
        const trimmedName = folderName.trim();

        if (!trimmedName) {
            setError('Folder name is required');
            return;
        }

        if (trimmedName.length > 50) {
            setError('Folder name must be 50 characters or less');
            return;
        }

        onCreateFolder(trimmedName);
        setFolderName('');
        setIsCreating(false);
        setError('');
    };

    const handleCancel = () => {
        setFolderName('');
        setIsCreating(false);
        setError('');
    };

    const handleKeyDown = (e) => {
        if (e.key === 'Enter') {
            handleCreate();
        } else if (e.key === 'Escape') {
            handleCancel();
        }
    };

    if (isCreating) {
        return (
            <div className="bg-white rounded-2xl border-2 border-teal-300 border-dashed p-6 min-h-[180px] flex flex-col items-center justify-center gap-3">
                <div className="p-3 rounded-xl bg-teal-50">
                    <FolderPlus className="w-8 h-8 text-teal-600" />
                </div>

                <div className="w-full space-y-2">
                    <Input
                        placeholder="Enter folder name"
                        value={folderName}
                        onChange={(e) => {
                            setFolderName(e.target.value);
                            setError('');
                        }}
                        onKeyDown={handleKeyDown}
                        className={cn(
                            "text-center",
                            error && "border-red-300 focus:border-red-500"
                        )}
                        autoFocus
                    />
                    {error && (
                        <p className="text-xs text-red-500 text-center">{error}</p>
                    )}
                </div>

                <div className="flex gap-2">
                    <Button size="sm" variant="outline" onClick={handleCancel}>
                        Cancel
                    </Button>
                    <Button size="sm" className="bg-teal-600 hover:bg-teal-700" onClick={handleCreate}>
                        Create
                    </Button>
                </div>
            </div>
        );
    }

    return (
        <div
            className={cn(
                "bg-slate-50 rounded-2xl border-2 border-dashed border-slate-300 p-6 cursor-pointer",
                "hover:border-teal-400 hover:bg-teal-50/50 transition-all duration-200",
                "flex flex-col items-center justify-center gap-3 min-h-[180px]"
            )}
            onClick={() => setIsCreating(true)}
        >
            <div className="p-4 rounded-xl bg-white border border-slate-200">
                <Plus className="w-8 h-8 text-slate-400" />
            </div>

            <div className="text-center">
                <h3 className="font-medium text-slate-600">Create Folder</h3>
                <p className="text-xs text-slate-400 mt-1">Organize your items</p>
            </div>
        </div>
    );
}
