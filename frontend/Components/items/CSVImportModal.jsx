import React, { useState, useCallback } from 'react';
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
    Upload,
    Download,
    FileText,
    CheckCircle2,
    XCircle,
    AlertCircle,
    Loader2,
    ArrowLeft,
    ArrowRight,
    RefreshCw
} from 'lucide-react';
import { cn } from "../../src/lib/utils.js";
import { useCSVImport } from '../../src/hooks/useCSVImport.js';
import { toast } from 'sonner';

export default function CSVImportModal({ open, onClose, onSuccess }) {
    const [step, setStep] = useState(1); // 1: Upload, 2: Preview, 3: Result
    const [csvContent, setCsvContent] = useState('');
    const [fileName, setFileName] = useState('');
    const [importResult, setImportResult] = useState(null);

    const {
        loading,
        previewData,
        error,
        previewCSV,
        confirmImport,
        downloadTemplate,
        reset
    } = useCSVImport();

    const handleClose = () => {
        setStep(1);
        setCsvContent('');
        setFileName('');
        setImportResult(null);
        reset();
        onClose();
    };

    const handleFileSelect = useCallback((event) => {
        const file = event.target.files?.[0];
        if (!file) return;

        if (!file.name.endsWith('.csv')) {
            toast.error('Please select a CSV file');
            return;
        }

        setFileName(file.name);

        const reader = new FileReader();
        reader.onload = (e) => {
            setCsvContent(e.target.result);
        };
        reader.onerror = () => {
            toast.error('Failed to read file');
        };
        reader.readAsText(file);
    }, []);

    const handleDrop = useCallback((event) => {
        event.preventDefault();
        const file = event.dataTransfer.files?.[0];
        if (!file) return;

        if (!file.name.endsWith('.csv')) {
            toast.error('Please select a CSV file');
            return;
        }

        setFileName(file.name);

        const reader = new FileReader();
        reader.onload = (e) => {
            setCsvContent(e.target.result);
        };
        reader.readAsText(file);
    }, []);

    const handleDragOver = useCallback((event) => {
        event.preventDefault();
    }, []);

    const handlePreview = async () => {
        if (!csvContent) {
            toast.error('Please select a CSV file first');
            return;
        }

        const result = await previewCSV(csvContent);
        if (result.success) {
            setStep(2);
        } else {
            toast.error(result.error);
        }
    };

    const handleConfirm = async () => {
        if (!previewData?.rows) return;

        // Only send valid rows
        const validRows = previewData.rows.filter(row => row.valid);
        if (validRows.length === 0) {
            toast.error('No valid rows to import');
            return;
        }

        const result = await confirmImport(previewData.rows);
        if (result.success) {
            setImportResult(result.data);
            setStep(3);
            toast.success(`Import complete: ${result.data.createdCount} created, ${result.data.updatedCount} updated`);
        } else {
            toast.error(result.error);
        }
    };

    const handleDownloadTemplate = async () => {
        const result = await downloadTemplate();
        if (result.success) {
            toast.success('Template downloaded');
        } else {
            toast.error(result.error);
        }
    };

    const handleStartOver = () => {
        setStep(1);
        setCsvContent('');
        setFileName('');
        setImportResult(null);
        reset();
    };

    const handleDone = () => {
        handleClose();
        if (onSuccess) {
            onSuccess();
        }
    };

    // Step 1: Upload
    const renderUploadStep = () => (
        <div className="space-y-6">
            <div className="text-center p-8 border-2 border-dashed border-slate-300 rounded-xl bg-slate-50 hover:border-teal-400 hover:bg-teal-50/30 transition-all"
                onDrop={handleDrop}
                onDragOver={handleDragOver}
            >
                <Upload className="w-12 h-12 mx-auto text-slate-400 mb-4" />
                <p className="text-slate-600 mb-2">
                    Drag and drop a CSV file here, or
                </p>
                <label className="inline-block">
                    <input
                        type="file"
                        accept=".csv"
                        onChange={handleFileSelect}
                        className="hidden"
                    />
                    <span className="text-teal-600 hover:text-teal-700 font-medium cursor-pointer underline">
                        browse to select
                    </span>
                </label>

                {fileName && (
                    <div className="mt-4 p-3 bg-white rounded-lg border border-teal-200 inline-flex items-center gap-2">
                        <FileText className="w-4 h-4 text-teal-600" />
                        <span className="text-sm font-medium text-slate-700">{fileName}</span>
                        <CheckCircle2 className="w-4 h-4 text-green-500" />
                    </div>
                )}
            </div>

            <div className="flex flex-col items-center gap-3 text-sm text-slate-500">
                <div className="flex items-center gap-2">
                    <AlertCircle className="w-4 h-4" />
                    <span>Download a template to get started:</span>
                </div>
                <div className="flex gap-2">
                    <Button
                        variant="outline"
                        size="sm"
                        onClick={() => downloadTemplate('items')}
                        className="text-teal-600 border-teal-200 hover:bg-teal-50"
                    >
                        <Download className="w-3 h-3 mr-1" />
                        Items Template
                    </Button>
                    <Button
                        variant="outline"
                        size="sm"
                        onClick={() => downloadTemplate('products')}
                        className="text-purple-600 border-purple-200 hover:bg-purple-50"
                    >
                        <Download className="w-3 h-3 mr-1" />
                        Products Template
                    </Button>
                </div>
                <p className="text-xs text-slate-400">
                    Items = Raw Materials, Packaging, Supplies | Products = WIP, Finished Goods
                </p>
            </div>

            <div className="bg-amber-50 border border-amber-200 rounded-lg p-4 text-sm">
                <p className="font-medium text-amber-800 mb-1">📋 Import Order Reminder</p>
                <p className="text-amber-700">
                    Import components (raw materials, packaging, supplies) <strong>before</strong> products.
                    Product recipes must be added manually via UI after import.
                </p>
            </div>
        </div>
    );

    // Step 2: Preview
    const renderPreviewStep = () => (
        <div className="space-y-4">
            {/* Summary */}
            <div className="grid grid-cols-4 gap-4">
                <div className="bg-slate-50 rounded-lg p-3 text-center">
                    <p className="text-2xl font-bold text-slate-700">{previewData?.totalRows || 0}</p>
                    <p className="text-xs text-slate-500">Total Rows</p>
                </div>
                <div className="bg-green-50 rounded-lg p-3 text-center">
                    <p className="text-2xl font-bold text-green-600">{previewData?.createCount || 0}</p>
                    <p className="text-xs text-green-600">New Items</p>
                </div>
                <div className="bg-blue-50 rounded-lg p-3 text-center">
                    <p className="text-2xl font-bold text-blue-600">{previewData?.updateCount || 0}</p>
                    <p className="text-xs text-blue-600">Updates</p>
                </div>
                <div className="bg-red-50 rounded-lg p-3 text-center">
                    <p className="text-2xl font-bold text-red-600">{previewData?.invalidRows || 0}</p>
                    <p className="text-xs text-red-600">Errors</p>
                </div>
            </div>

            {/* Table */}
            <div className="border rounded-lg overflow-hidden max-h-80 overflow-y-auto">
                <table className="w-full text-sm">
                    <thead className="bg-slate-50 sticky top-0">
                        <tr>
                            <th className="text-left p-3 font-medium text-slate-600">Row</th>
                            <th className="text-left p-3 font-medium text-slate-600">SKU</th>
                            <th className="text-left p-3 font-medium text-slate-600">Name</th>
                            <th className="text-left p-3 font-medium text-slate-600">Category</th>
                            <th className="text-left p-3 font-medium text-slate-600">Action</th>
                            <th className="text-left p-3 font-medium text-slate-600">Status</th>
                        </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                        {previewData?.rows?.map((row) => (
                            <tr key={row.rowNumber} className={cn(
                                row.valid ? 'bg-white' : 'bg-red-50'
                            )}>
                                <td className="p-3 text-slate-500">{row.rowNumber}</td>
                                <td className="p-3 font-mono text-xs">{row.sku_code || '-'}</td>
                                <td className="p-3 font-medium text-slate-700">{row.name || '-'}</td>
                                <td className="p-3 text-slate-600 capitalize">{row.category?.replace('_', ' ') || '-'}</td>
                                <td className="p-3">
                                    <Badge variant="outline" className={cn(
                                        row.action === 'CREATE'
                                            ? 'bg-green-50 text-green-700 border-green-200'
                                            : 'bg-blue-50 text-blue-700 border-blue-200'
                                    )}>
                                        {row.action}
                                    </Badge>
                                </td>
                                <td className="p-3">
                                    {row.valid ? (
                                        <Badge className="bg-green-100 text-green-700 hover:bg-green-100">
                                            <CheckCircle2 className="w-3 h-3 mr-1" />
                                            Valid
                                        </Badge>
                                    ) : (
                                        <div className="space-y-1">
                                            <Badge className="bg-red-100 text-red-700 hover:bg-red-100">
                                                <XCircle className="w-3 h-3 mr-1" />
                                                Error
                                            </Badge>
                                            {row.errors?.map((err, i) => (
                                                <p key={i} className="text-xs text-red-600">{err}</p>
                                            ))}
                                        </div>
                                    )}
                                </td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>

            {previewData?.invalidRows > 0 && (
                <div className="bg-amber-50 border border-amber-200 rounded-lg p-3 text-sm text-amber-800">
                    <AlertCircle className="w-4 h-4 inline mr-2" />
                    {previewData.invalidRows} row(s) have errors and will be skipped during import.
                </div>
            )}
        </div>
    );

    // Step 3: Result
    const renderResultStep = () => (
        <div className="space-y-6 text-center py-4">
            <div className="w-16 h-16 mx-auto bg-green-100 rounded-full flex items-center justify-center">
                <CheckCircle2 className="w-8 h-8 text-green-600" />
            </div>

            <div>
                <h3 className="text-xl font-semibold text-slate-800 mb-2">Import Complete!</h3>
                <p className="text-slate-600">Your items have been successfully imported.</p>
            </div>

            <div className="grid grid-cols-3 gap-4 max-w-md mx-auto">
                <div className="bg-green-50 rounded-lg p-4">
                    <p className="text-3xl font-bold text-green-600">{importResult?.createdCount || 0}</p>
                    <p className="text-sm text-green-600">Created</p>
                </div>
                <div className="bg-blue-50 rounded-lg p-4">
                    <p className="text-3xl font-bold text-blue-600">{importResult?.updatedCount || 0}</p>
                    <p className="text-sm text-blue-600">Updated</p>
                </div>
                <div className="bg-red-50 rounded-lg p-4">
                    <p className="text-3xl font-bold text-red-600">{importResult?.failedCount || 0}</p>
                    <p className="text-sm text-red-600">Failed</p>
                </div>
            </div>

            {importResult?.failedCount > 0 && (
                <div className="bg-red-50 border border-red-200 rounded-lg p-4 text-left max-w-md mx-auto">
                    <p className="font-medium text-red-800 mb-2">Failed Rows:</p>
                    <div className="space-y-1 text-sm text-red-700 max-h-32 overflow-y-auto">
                        {importResult.results?.failed?.map((f, i) => (
                            <p key={i}>Row {f.rowNumber} ({f.sku_code}): {f.errors?.join(', ')}</p>
                        ))}
                    </div>
                </div>
            )}
        </div>
    );

    return (
        <Dialog open={open} onOpenChange={handleClose}>
            <DialogContent className="sm:max-w-2xl">
                <DialogHeader>
                    <DialogTitle className="flex items-center gap-2">
                        <Upload className="w-5 h-5 text-teal-600" />
                        Import Items from CSV
                        {step > 1 && (
                            <Badge variant="outline" className="ml-2">
                                Step {step} of 3
                            </Badge>
                        )}
                    </DialogTitle>
                </DialogHeader>

                <div className="py-4">
                    {error && (
                        <div className="bg-red-50 border border-red-200 rounded-lg p-3 mb-4 text-sm text-red-700">
                            {error}
                        </div>
                    )}

                    {step === 1 && renderUploadStep()}
                    {step === 2 && renderPreviewStep()}
                    {step === 3 && renderResultStep()}
                </div>

                <DialogFooter className="gap-2">
                    {step === 1 && (
                        <>
                            <Button variant="outline" onClick={handleClose}>
                                Cancel
                            </Button>
                            <Button
                                onClick={handlePreview}
                                disabled={!csvContent || loading}
                                className="bg-teal-600 hover:bg-teal-700"
                            >
                                {loading ? (
                                    <><Loader2 className="w-4 h-4 mr-2 animate-spin" /> Validating...</>
                                ) : (
                                    <><ArrowRight className="w-4 h-4 mr-2" /> Preview Import</>
                                )}
                            </Button>
                        </>
                    )}

                    {step === 2 && (
                        <>
                            <Button variant="outline" onClick={handleStartOver}>
                                <ArrowLeft className="w-4 h-4 mr-2" />
                                Back
                            </Button>
                            <Button
                                onClick={handleConfirm}
                                disabled={loading || (previewData?.validRows === 0)}
                                className="bg-teal-600 hover:bg-teal-700"
                            >
                                {loading ? (
                                    <><Loader2 className="w-4 h-4 mr-2 animate-spin" /> Importing...</>
                                ) : (
                                    <><CheckCircle2 className="w-4 h-4 mr-2" /> Confirm Import ({previewData?.validRows} items)</>
                                )}
                            </Button>
                        </>
                    )}

                    {step === 3 && (
                        <>
                            <Button variant="outline" onClick={handleStartOver}>
                                <RefreshCw className="w-4 h-4 mr-2" />
                                Import More
                            </Button>
                            <Button
                                onClick={handleDone}
                                className="bg-teal-600 hover:bg-teal-700"
                            >
                                Done
                            </Button>
                        </>
                    )}
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
}
