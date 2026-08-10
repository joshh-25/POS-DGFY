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
            <DialogContent className="sm:max-w-md">
                <DialogHeader>
                    <DialogTitle>Import or Export Items</DialogTitle>
                </DialogHeader>

                <div className="grid grid-cols-2 gap-4 py-6">
                    <Button
                        variant="outline"
                        className="flex flex-col items-center justify-center h-32 gap-3 hover:bg-teal-50 hover:border-teal-300 transition-colors"
                        onClick={() => {
                            onClose();
                            onImport();
                        }}
                    >
                        <div className="w-12 h-12 rounded-full bg-teal-100 flex items-center justify-center">
                            <Upload className="w-6 h-6 text-teal-600" />
                        </div>
                        <div className="text-center">
                            <p className="font-medium text-slate-900">Import</p>
                            <p className="text-xs text-slate-500">Upload CSV file</p>
                        </div>
                    </Button>

                    <Button
                        variant="outline"
                        className="flex flex-col items-center justify-center h-32 gap-3 hover:bg-blue-50 hover:border-blue-300 transition-colors"
                        onClick={() => {
                            onClose();
                            onExport();
                        }}
                    >
                        <div className="w-12 h-12 rounded-full bg-blue-100 flex items-center justify-center">
                            <Download className="w-6 h-6 text-blue-600" />
                        </div>
                        <div className="text-center">
                            <p className="font-medium text-slate-900">Export</p>
                            <p className="text-xs text-slate-500">Download as CSV</p>
                        </div>
                    </Button>
                </div>
            </DialogContent>
        </Dialog>
    );
}
