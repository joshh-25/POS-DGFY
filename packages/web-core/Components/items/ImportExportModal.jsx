import React from 'react';
import {
    Dialog,
    DialogContent,
    DialogHeader,
    DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Upload, Download } from 'lucide-react';

export default function ImportExportModal({ open, onClose, onImport, onExport }) {
    return (
        <Dialog open={open} onOpenChange={onClose}>
            <DialogContent className="catalog-editor-dialog-content sm:max-w-md p-0">
                <DialogHeader className="border-b border-slate-100 p-4 pb-3">
                    <DialogTitle>Import or Export Items</DialogTitle>
                </DialogHeader>

                <div className="grid grid-cols-2 gap-3 p-4">
                    <Button
                        variant="outline"
                        className="flex h-24 flex-col items-center justify-center gap-2 transition-colors hover:border-teal-300 hover:bg-teal-50"
                        onClick={() => {
                            onClose();
                            onImport();
                        }}
                    >
                        <div className="flex h-10 w-10 items-center justify-center rounded-full bg-teal-100">
                            <Upload className="w-6 h-6 text-teal-600" />
                        </div>
                        <div className="text-center">
                            <p className="font-medium text-slate-900">Import</p>
                            <p className="text-xs text-slate-500">CSV</p>
                        </div>
                    </Button>

                    <Button
                        variant="outline"
                        className="flex h-24 flex-col items-center justify-center gap-2 transition-colors hover:border-blue-300 hover:bg-blue-50"
                        onClick={() => {
                            onClose();
                            onExport();
                        }}
                    >
                        <div className="flex h-10 w-10 items-center justify-center rounded-full bg-blue-100">
                            <Download className="w-6 h-6 text-blue-600" />
                        </div>
                        <div className="text-center">
                            <p className="font-medium text-slate-900">Export</p>
                            <p className="text-xs text-slate-500">CSV</p>
                        </div>
                    </Button>
                </div>
            </DialogContent>
        </Dialog>
    );
}
