import React, { useCallback, useState } from 'react';
import {
    Dialog,
    DialogContent,
    DialogHeader,
    DialogTitle,
    DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import {
    Upload,
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
import { usePdfMenuImport } from '../../src/hooks/usePdfMenuImport.js';
import WizardStepNavigator from '@/src/components/common/WizardStepNavigator.jsx';
import { toast } from 'sonner';

const PDF_IMPORT_STEPS = Object.freeze([
    { id: 'upload', number: 1, name: 'Upload', description: 'Upload a PDF of your menu.' },
    { id: 'preview', number: 2, name: 'Review', description: 'Review and edit the extracted items before import.' },
    { id: 'result', number: 3, name: 'Result', description: 'Review created and failed rows.' }
]);

// Deep-copies the preview rows into an editable working set, and normalizes an
// `included` flag per row (valid rows default to included; invalid rows
// default to excluded so a bad extraction never silently creates junk items).
const toEditableRows = (rows = []) => rows.map((row) => ({
    ...row,
    data: { ...row.data },
    included: row.valid
}));

export default function PdfMenuImportModal({ open, onClose, onSuccess }) {
    const [step, setStep] = useState(1);
    const [file, setFile] = useState(null);
    const [fileName, setFileName] = useState('');
    const [editableRows, setEditableRows] = useState([]);
    const [importResult, setImportResult] = useState(null);

    const {
        loading,
        previewData,
        error,
        previewPdf,
        confirmImport,
        reset
    } = usePdfMenuImport();

    const navigatorSteps = PDF_IMPORT_STEPS.map((entry) => {
        if (entry.number === 2) {
            return { ...entry, disabled: !previewData, disabledReason: 'Upload a PDF menu before reviewing items.' };
        }
        if (entry.number === 3) {
            return { ...entry, disabled: !importResult, disabledReason: 'Confirm the import before opening results.' };
        }
        return entry;
    });

    const handleClose = () => {
        setStep(1);
        setFile(null);
        setFileName('');
        setEditableRows([]);
        setImportResult(null);
        reset();
        onClose();
    };

    const handleFileSelect = useCallback((event) => {
        const selectedFile = event.target.files?.[0];
        if (!selectedFile) return;
        if (!selectedFile.name.toLowerCase().endsWith('.pdf')) {
            toast.error('Please select a PDF file');
            return;
        }
        setFileName(selectedFile.name);
        setFile(selectedFile);
    }, []);

    const handleDrop = useCallback((event) => {
        event.preventDefault();
        const droppedFile = event.dataTransfer.files?.[0];
        if (!droppedFile) return;
        if (!droppedFile.name.toLowerCase().endsWith('.pdf')) {
            toast.error('Please select a PDF file');
            return;
        }
        setFileName(droppedFile.name);
        setFile(droppedFile);
    }, []);

    const handleDragOver = useCallback((event) => {
        event.preventDefault();
    }, []);

    const handlePreview = async () => {
        if (!file) {
            toast.error('Please select a PDF file first');
            return;
        }

        const result = await previewPdf(file);
        if (result.success) {
            setEditableRows(toEditableRows(result.data?.rows));
            setStep(2);
        } else {
            toast.error(result.error);
        }
    };

    const updateRow = (rowNumber, patch) => {
        setEditableRows((rows) => rows.map((row) => (
            row.rowNumber === rowNumber ? { ...row, ...patch } : row
        )));
    };

    const updateRowField = (rowNumber, field, value) => {
        setEditableRows((rows) => rows.map((row) => (
            row.rowNumber === rowNumber
                ? { ...row, data: { ...row.data, [field]: value } }
                : row
        )));
    };

    const handleConfirm = async () => {
        const includedRows = editableRows.filter((row) => row.included);
        if (includedRows.length === 0) {
            toast.error('No items selected to import');
            return;
        }

        const result = await confirmImport(includedRows);
        if (result.success) {
            setImportResult(result.data);
            setStep(3);
            toast.success(`Import complete: ${result.data.createdCount} created`);
        } else {
            toast.error(result.error);
        }
    };

    const handleStartOver = () => {
        setStep(1);
        setFile(null);
        setFileName('');
        setEditableRows([]);
        setImportResult(null);
        reset();
    };

    const handleDone = () => {
        handleClose();
        if (onSuccess) onSuccess();
    };

    const includedCount = editableRows.filter((row) => row.included).length;

    // Step 1: Upload
    const renderUploadStep = () => (
        <div className="space-y-6">
            <div className="text-center p-8 border-2 border-dashed border-slate-300 rounded-xl bg-slate-50 hover:border-teal-400 hover:bg-teal-50/30 transition-all"
                onDrop={handleDrop}
                onDragOver={handleDragOver}
            >
                <Upload className="w-12 h-12 mx-auto text-slate-400 mb-4" />
                <p className="text-slate-600 mb-2">
                    Drag and drop your menu PDF here, or
                </p>
                <label className="inline-block">
                    <input
                        type="file"
                        accept=".pdf,application/pdf"
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

            <div className="bg-amber-50 border border-amber-200 rounded-lg p-4 text-sm">
                <p className="font-medium text-amber-800 mb-1">📋 Before you import</p>
                <p className="text-amber-700">
                    An AI model reads your PDF and extracts item names and prices — always
                    review the results on the next step before confirming. Scanned/image-only
                    menus aren&apos;t supported yet; use a text-based PDF export of your menu.
                </p>
            </div>
        </div>
    );

    // Step 2: Review & edit
    const renderPreviewStep = () => (
        <div className="space-y-4">
            <div className="grid grid-cols-3 gap-4">
                <div className="bg-slate-50 rounded-lg p-3 text-center">
                    <p className="text-2xl font-bold text-slate-700">{previewData?.totalRows || 0}</p>
                    <p className="text-xs text-slate-500">Extracted</p>
                </div>
                <div className="bg-green-50 rounded-lg p-3 text-center">
                    <p className="text-2xl font-bold text-green-600">{includedCount}</p>
                    <p className="text-xs text-green-600">Selected to import</p>
                </div>
                <div className="bg-red-50 rounded-lg p-3 text-center">
                    <p className="text-2xl font-bold text-red-600">{previewData?.invalidRows || 0}</p>
                    <p className="text-xs text-red-600">Need review</p>
                </div>
            </div>

            <div className="border rounded-lg overflow-hidden max-h-96 overflow-y-auto">
                <table className="w-full text-sm">
                    <thead className="bg-slate-50 sticky top-0">
                        <tr>
                            <th className="text-left p-3 font-medium text-slate-600">Import</th>
                            <th className="text-left p-3 font-medium text-slate-600">Name</th>
                            <th className="text-left p-3 font-medium text-slate-600">Price (₱)</th>
                            <th className="text-left p-3 font-medium text-slate-600">Section</th>
                            <th className="text-left p-3 font-medium text-slate-600">Status</th>
                        </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                        {editableRows.map((row) => (
                            <tr key={row.rowNumber} className={cn(!row.valid && !row.included && 'bg-red-50/60')}>
                                <td className="p-3">
                                    <input
                                        type="checkbox"
                                        checked={row.included}
                                        onChange={(e) => updateRow(row.rowNumber, { included: e.target.checked })}
                                        aria-label={`Import ${row.data?.name || 'row ' + row.rowNumber}`}
                                    />
                                </td>
                                <td className="p-3">
                                    <Input
                                        value={row.data?.name || ''}
                                        onChange={(e) => updateRowField(row.rowNumber, 'name', e.target.value)}
                                        className="h-8 text-sm"
                                    />
                                </td>
                                <td className="p-3">
                                    <Input
                                        type="number"
                                        step="0.01"
                                        min="0"
                                        value={row.data?.default_sale_price ?? ''}
                                        onChange={(e) => updateRowField(row.rowNumber, 'default_sale_price', e.target.value)}
                                        className="h-8 w-28 text-sm"
                                    />
                                </td>
                                <td className="p-3">
                                    <Input
                                        value={row.data?.product_folder || ''}
                                        onChange={(e) => updateRowField(row.rowNumber, 'product_folder', e.target.value)}
                                        className="h-8 text-sm"
                                    />
                                </td>
                                <td className="p-3">
                                    {row.valid ? (
                                        <Badge className="bg-green-100 text-green-700 hover:bg-green-100">
                                            <CheckCircle2 className="w-3 h-3 mr-1" />
                                            Extracted
                                        </Badge>
                                    ) : (
                                        <div className="space-y-1">
                                            <Badge className="bg-red-100 text-red-700 hover:bg-red-100">
                                                <XCircle className="w-3 h-3 mr-1" />
                                                Check row
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

            <div className="bg-blue-50 border border-blue-200 rounded-lg p-3 text-sm text-blue-800">
                <AlertCircle className="w-4 h-4 inline mr-2" />
                Edits are re-checked when you confirm — a row with an error is still safe to
                fix here and import.
            </div>
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
                <p className="text-slate-600">Your menu items have been added to inventory.</p>
            </div>

            <div className="grid grid-cols-2 gap-4 max-w-sm mx-auto">
                <div className="bg-green-50 rounded-lg p-4">
                    <p className="text-3xl font-bold text-green-600">{importResult?.createdCount || 0}</p>
                    <p className="text-sm text-green-600">Created</p>
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
                        Import Menu from PDF
                    </DialogTitle>
                </DialogHeader>

                <WizardStepNavigator
                    steps={navigatorSteps}
                    currentStep={step}
                    completedStep={step - 1}
                    onStepChange={setStep}
                    ariaLabel="PDF menu import steps"
                />

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
                                disabled={!file || loading}
                                className="bg-teal-600 hover:bg-teal-700"
                            >
                                {loading ? (
                                    <><Loader2 className="w-4 h-4 mr-2 animate-spin" /> Extracting...</>
                                ) : (
                                    <><ArrowRight className="w-4 h-4 mr-2" /> Extract Items</>
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
                                disabled={loading || includedCount === 0}
                                className="bg-teal-600 hover:bg-teal-700"
                            >
                                {loading ? (
                                    <><Loader2 className="w-4 h-4 mr-2 animate-spin" /> Importing...</>
                                ) : (
                                    <><CheckCircle2 className="w-4 h-4 mr-2" /> Confirm Import ({includedCount} items)</>
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
                            <Button onClick={handleDone} className="bg-teal-600 hover:bg-teal-700">
                                Done
                            </Button>
                        </>
                    )}
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
}
