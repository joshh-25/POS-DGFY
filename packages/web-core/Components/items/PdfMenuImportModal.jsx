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
    RefreshCw,
    X
} from 'lucide-react';
import { cn } from "../../src/lib/utils.js";
import { usePdfMenuImport } from '../../src/hooks/usePdfMenuImport.js';
import WizardStepNavigator from '@/src/components/common/WizardStepNavigator.jsx';
import { toast } from 'sonner';

const PDF_IMPORT_STEPS = Object.freeze([
    { id: 'upload', number: 1, name: 'Upload', description: 'Upload a PDF or photo of your menu.' },
    { id: 'preview', number: 2, name: 'Review', description: 'Review and edit the extracted items before import.' },
    { id: 'result', number: 3, name: 'Result', description: 'Review created and failed rows.' }
]);

const ACCEPTED_FILE_PATTERN = /\.(pdf|png|jpe?g)$/i;

/**
 * @deprecated Superseded by `MenuImportBatchModal.jsx`, which the POS Items
 * view renders instead wherever `VITE_MENU_IMPORT_BATCH_ENABLED` is on. This
 * single-file wizard stays as the fallback for deployments without Redis (the
 * batch path requires it). Do not extend it — see ADR 0039's removal criteria.
 */

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
            return { ...entry, disabled: !previewData, disabledReason: 'Upload a menu PDF or image before reviewing items.' };
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
        if (!ACCEPTED_FILE_PATTERN.test(selectedFile.name)) {
            toast.error('Please select a PDF, PNG, or JPG file');
            return;
        }
        setFileName(selectedFile.name);
        setFile(selectedFile);
    }, []);

    const handleDrop = useCallback((event) => {
        event.preventDefault();
        const droppedFile = event.dataTransfer.files?.[0];
        if (!droppedFile) return;
        if (!ACCEPTED_FILE_PATTERN.test(droppedFile.name)) {
            toast.error('Please select a PDF, PNG, or JPG file');
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
            toast.error('Please select a PDF, PNG, or JPG file first');
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
        <div className="csv-import-step-content">
            <div className="csv-import-upload-dropzone rounded-xl border border-dashed border-[#8DB4DE] bg-[#F5F8FC] p-2.5 text-center transition-colors hover:bg-[#EEF5FF]"
                onDrop={handleDrop}
                onDragOver={handleDragOver}
            >
                <div className="mx-auto grid h-7 w-7 place-items-center rounded-lg bg-[#EEF5FF] text-[#1A4E8D]">
                    <Upload className="h-4 w-4" />
                </div>
                <p className="mt-1.5 text-[10px] font-bold text-slate-700">
                    Drag and drop your menu PDF or image here, or
                </p>
                <label className="inline-block">
                    <input
                        type="file"
                        accept=".pdf,application/pdf,.png,image/png,.jpg,.jpeg,image/jpeg"
                        onChange={handleFileSelect}
                        className="hidden"
                    />
                    <span className="text-[10px] font-bold text-[#1A4E8D] underline decoration-[#8DB4DE] underline-offset-2 hover:text-[#143F73]">
                        browse to select
                    </span>
                </label>

                {fileName && (
                    <div className="mx-auto mt-1.5 flex max-w-full items-center justify-center gap-1.5 rounded-lg border border-[#C7DCF3] bg-white px-2 py-1.5 text-left">
                        <FileText className="h-3.5 w-3.5 shrink-0 text-[#1A4E8D]" />
                        <span className="min-w-0 truncate text-[9px] font-bold text-slate-700">{fileName}</span>
                        <CheckCircle2 className="h-3.5 w-3.5 shrink-0 text-[#1A4E8D]" />
                    </div>
                )}
            </div>

            <div className="csv-import-warning flex gap-2 rounded-lg border border-amber-200 bg-amber-50 p-2 text-[9px]">
                <AlertCircle className="mt-0.5 h-3.5 w-3.5 shrink-0 text-amber-700" />
                <p className="leading-3.5 text-amber-800">
                    <span className="font-bold">Before you import: </span>
                    An AI model reads your PDF or photo and extracts item names and prices —
                    always review the results on the next step before confirming. Works best
                    with a clear, well-lit photo or a text-based PDF export of your menu.
                </p>
            </div>
        </div>
    );

    // Step 2: Review & edit
    const renderPreviewStep = () => (
        <div className="csv-import-step-content">
            <div className="csv-import-summary-grid grid grid-cols-2 gap-2 sm:grid-cols-3">
                <div className="rounded-lg bg-slate-50 p-2 text-center">
                    <p className="text-xl font-bold text-slate-700">{previewData?.totalRows || 0}</p>
                    <p className="text-[9px] leading-3 text-slate-500">Extracted</p>
                </div>
                <div className="rounded-lg bg-[#EEF5FF] p-2 text-center">
                    <p className="text-xl font-bold text-[#1A4E8D]">{includedCount}</p>
                    <p className="text-[9px] leading-3 text-[#1A4E8D]">Selected to import</p>
                </div>
                <div className="rounded-lg bg-red-50 p-2 text-center">
                    <p className="text-xl font-bold text-red-600">{previewData?.invalidRows || 0}</p>
                    <p className="text-[9px] leading-3 text-red-600">Need review</p>
                </div>
            </div>

            <div className="csv-import-preview-panel overflow-hidden rounded-lg border border-slate-200 bg-white">
                <div className="flex items-center justify-between gap-2 border-b border-slate-200 bg-slate-50/80 px-2.5 py-2">
                    <span className="truncate text-[9px] font-black uppercase tracking-wide text-slate-500">Extracted Items</span>
                    <span className="shrink-0 rounded bg-slate-200 px-1.5 py-0.5 text-[8px] font-bold text-slate-600">
                        {editableRows.length} Records
                    </span>
                </div>
                <div className="csv-import-preview-table-scroll max-h-[13rem] overflow-auto pos-items-modal-scrollbar" data-testid="menu-import-preview-table-scroll">
                <table className="csv-import-preview-table w-full min-w-[44rem] table-fixed text-[10px]">
                    <thead className="sticky top-0 bg-white">
                        <tr>
                            <th className="p-1.5 text-left text-[8px] font-black uppercase tracking-wide text-slate-500">Import</th>
                            <th className="p-1.5 text-left text-[8px] font-black uppercase tracking-wide text-slate-500">Name</th>
                            <th className="p-1.5 text-left text-[8px] font-black uppercase tracking-wide text-slate-500">Price (₱)</th>
                            <th className="p-1.5 text-left text-[8px] font-black uppercase tracking-wide text-slate-500">Category</th>
                            <th className="p-1.5 text-left text-[8px] font-black uppercase tracking-wide text-slate-500">Status</th>
                        </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                        {editableRows.map((row) => (
                            <tr key={row.rowNumber} className={cn(!row.valid && !row.included && 'bg-red-50/60')}>
                                <td className="p-1.5">
                                    <input
                                        type="checkbox"
                                        checked={row.included}
                                        onChange={(e) => updateRow(row.rowNumber, { included: e.target.checked })}
                                        aria-label={`Import ${row.data?.name || 'row ' + row.rowNumber}`}
                                    />
                                </td>
                                <td className="p-1.5">
                                    <Input
                                        value={row.data?.name || ''}
                                        onChange={(e) => updateRowField(row.rowNumber, 'name', e.target.value)}
                                        className="h-8 min-w-0 text-[10px]"
                                    />
                                </td>
                                <td className="p-1.5">
                                    <Input
                                        type="number"
                                        step="0.01"
                                        min="0"
                                        value={row.data?.default_sale_price ?? ''}
                                        onChange={(e) => updateRowField(row.rowNumber, 'default_sale_price', e.target.value)}
                                        className="h-8 w-28 min-w-0 text-[10px]"
                                    />
                                </td>
                                <td className="p-1.5">
                                    <Input
                                        value={row.data?.product_folder || ''}
                                        onChange={(e) => updateRowField(row.rowNumber, 'product_folder', e.target.value)}
                                        className="h-8 min-w-0 text-[10px]"
                                    />
                                </td>
                                <td className="p-1.5">
                                    {row.valid ? (
                                        <Badge className="bg-[#EEF5FF] text-[#1A4E8D] hover:bg-[#EEF5FF]">
                                            <CheckCircle2 className="mr-1 h-2.5 w-2.5" />
                                            Extracted
                                        </Badge>
                                    ) : (
                                        <div className="space-y-1">
                                            <Badge className="bg-red-100 text-red-700 hover:bg-red-100">
                                                <XCircle className="mr-1 h-2.5 w-2.5" />
                                                Check row
                                            </Badge>
                                            {row.errors?.map((err, i) => (
                                                <p key={i} className="text-[9px] leading-3 text-red-600">{err}</p>
                                            ))}
                                        </div>
                                    )}
                                </td>
                            </tr>
                        ))}
                    </tbody>
                </table>
                </div>
            </div>

            <div className="csv-import-warning flex gap-2 rounded-lg border border-[#C7DCF3] bg-[#EEF5FF] p-2.5 text-[9px] text-[#1A4E8D]">
                <AlertCircle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                Edits are re-checked when you confirm — a row with an error is still safe to
                fix here and import.
            </div>
        </div>
    );

    // Step 3: Result
    const renderResultStep = () => (
        <div className="csv-import-result-step py-3 text-center">
            <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-[#EEF5FF]">
                <CheckCircle2 className="h-6 w-6 text-[#1A4E8D]" />
            </div>

            <div>
                <h3 className="text-lg font-black text-slate-800">Import Complete!</h3>
                <p className="text-[10px] text-slate-600">Your menu items have been added to inventory.</p>
            </div>

            <div className="csv-import-result-stats grid grid-cols-2 gap-2">
                <div className="rounded-lg bg-[#EEF5FF] p-2">
                    <p className="text-xl font-bold text-[#1A4E8D]">{importResult?.createdCount || 0}</p>
                    <p className="text-[9px] text-[#1A4E8D]">Created</p>
                </div>
                <div className="rounded-lg bg-red-50 p-2">
                    <p className="text-xl font-bold text-red-600">{importResult?.failedCount || 0}</p>
                    <p className="text-[9px] text-red-600">Failed</p>
                </div>
            </div>

            {importResult?.failedCount > 0 && (
                <div className="mx-auto max-w-[24rem] rounded-lg border border-red-200 bg-red-50 p-2.5 text-left">
                    <p className="mb-1.5 text-[10px] font-black text-red-800">Failed Rows:</p>
                    <div className="max-h-24 space-y-1 overflow-y-auto text-[9px] leading-3 text-red-700 pos-items-modal-scrollbar">
                        {importResult.results?.failed?.map((f, i) => (
                            <p key={i}>Row {f.rowNumber} ({f.sku_code}): {f.errors?.join(', ')}</p>
                        ))}
                    </div>
                </div>
            )}
        </div>
    );

    return (
        <Dialog
            open={open}
            onOpenChange={handleClose}
            mobileSheet
            overlayClassName="bg-slate-700/30 backdrop-blur-[2px]"
        >
            <DialogContent className={cn(
                'csv-import-modal pos-items-import-modal pos-items-modal-panel pos-items-mobile-sheet-panel pos-items-form-scale !w-full !max-w-none sm:!w-[32rem] sm:!max-w-[32rem] flex min-h-0 max-h-[calc(100dvh-2rem)] flex-col overflow-hidden rounded-2xl border border-slate-200 bg-white p-0 shadow-2xl shadow-slate-900/20'
            )}>
                <DialogHeader className="-mx-px -mt-px flex shrink-0 flex-row items-center justify-between gap-3 rounded-t-[17px] border-b border-[#143F73] bg-[#1A4E8D] px-4 py-2.5 text-white sm:px-5">
                    <div className="flex min-w-0 items-center gap-2.5">
                        <div className="grid h-8 w-8 shrink-0 place-items-center rounded-lg bg-white text-[#1A4E8D] shadow-sm ring-1 ring-[#C7DCF3]">
                            <Upload className="h-4 w-4" />
                        </div>
                        <div className="min-w-0">
                            <DialogTitle className="truncate text-sm font-black text-white">
                                Import Menu from PDF or Image
                            </DialogTitle>
                            <p className="mt-0.5 truncate text-[9px] text-blue-100">{PDF_IMPORT_STEPS[step - 1]?.description || PDF_IMPORT_STEPS[0].description}</p>
                        </div>
                    </div>
                    <button
                        type="button"
                        onClick={handleClose}
                        aria-label="Close menu import"
                        className="grid h-8 w-8 shrink-0 place-items-center rounded-lg text-blue-100 transition-colors hover:bg-white/15 hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white focus-visible:ring-offset-2 focus-visible:ring-offset-[#1A4E8D]"
                    >
                        <X className="h-4 w-4" />
                    </button>
                </DialogHeader>

                <WizardStepNavigator
                    steps={navigatorSteps}
                    currentStep={step}
                    completedStep={step - 1}
                    onStepChange={setStep}
                    ariaLabel="Menu import steps"
                    showLabels
                    className="csv-import-stepper wizard-step-navigator--dgfy shrink-0"
                />

                <div className="csv-import-modal-body pos-items-modal-scroll-region min-h-0 flex-1 overflow-y-auto px-4 py-2 sm:px-5 sm:py-2.5">
                    {error && (
                        <div className="mb-3 rounded-lg border border-red-200 bg-red-50 p-2.5 text-[10px] text-red-700">
                            {error}
                        </div>
                    )}

                    {step === 1 && renderUploadStep()}
                    {step === 2 && renderPreviewStep()}
                    {step === 3 && renderResultStep()}
                </div>

                <DialogFooter className={cn(
                    'csv-import-modal-footer pos-items-modal-footer shrink-0 gap-2 border-t border-slate-200 bg-white px-4 py-2.5 sm:px-5 sm:py-2.5',
                    step === 2 ? 'grid grid-cols-2 items-center' : 'grid grid-cols-2'
                )}>
                    {step === 1 && (
                        <>
                            <Button variant="outline" onClick={handleClose} className="h-10 w-full rounded-lg border-[#1A4E8D] px-3 text-[10px] font-bold text-[#1A4E8D] hover:bg-blue-50">
                                Cancel
                            </Button>
                            <Button
                                onClick={handlePreview}
                                disabled={!file || loading}
                                className="h-10 w-full rounded-lg bg-[#1A4E8D] px-3 text-[10px] font-bold text-white hover:bg-[#143F73]"
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
                            <Button variant="outline" onClick={handleStartOver} className="h-10 w-full rounded-lg border-[#1A4E8D] px-3 text-[10px] font-bold text-[#1A4E8D] hover:bg-blue-50">
                                <ArrowLeft className="w-4 h-4 mr-2" />
                                Back
                            </Button>
                            <Button
                                onClick={handleConfirm}
                                disabled={loading || includedCount === 0}
                                className="h-10 w-full rounded-lg bg-[#1A4E8D] px-3 text-[10px] font-bold text-white hover:bg-[#143F73]"
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
                            <Button variant="outline" onClick={handleStartOver} className="h-10 w-full rounded-lg border-[#1A4E8D] px-3 text-[10px] font-bold text-[#1A4E8D] hover:bg-blue-50">
                                <RefreshCw className="w-4 h-4 mr-2" />
                                Import More
                            </Button>
                            <Button onClick={handleDone} className="h-10 w-full rounded-lg bg-[#1A4E8D] px-3 text-[10px] font-bold text-white hover:bg-[#143F73]">
                                Done
                            </Button>
                        </>
                    )}
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
}
