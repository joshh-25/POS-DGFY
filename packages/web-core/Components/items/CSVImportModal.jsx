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
    RefreshCw,
    ArchiveX,
    RotateCcw,
    ShieldAlert
} from 'lucide-react';
import { cn } from "../../src/lib/utils.js";
import { useCSVImport } from '../../src/hooks/useCSVImport.js';
import { useWorkflowMode } from '../../src/features/settings/WorkflowModeContext.jsx';
import { getWorkflowModeLabel } from '../../src/features/settings/workflowMode.js';
import WizardStepNavigator from '@/src/components/common/WizardStepNavigator.jsx';
import { toast } from 'sonner';

const CSV_IMPORT_STEPS = Object.freeze([
    { id: 'upload', number: 1, name: 'Upload', description: 'Choose the CSV template file to validate.' },
    { id: 'preview', number: 2, name: 'Preview', description: 'Review parsed rows and validation errors before import.' },
    { id: 'result', number: 3, name: 'Result', description: 'Review created, updated, skipped, and failed rows.' }
]);

// #1495 Part B. Append is the historical behaviour and stays the default; sync additionally
// deactivates catalog items missing from the uploaded file, so it is opt-in and gated behind an
// explicit acknowledgement of the deactivation list below.
const IMPORT_MODES = Object.freeze([
    {
        id: 'append',
        label: 'Add & update only',
        description: 'Creates new items and updates matching ones. Nothing else in your catalog is touched.'
    },
    {
        id: 'sync',
        label: 'Full catalog sync',
        description: 'Also deactivates active items whose SKU is missing from this file. Deactivated items are never deleted and can be reactivated by re-importing them.'
    }
]);

export default function CSVImportModal({ open, onClose, onSuccess }) {
    const [step, setStep] = useState(1); // 1: Upload, 2: Preview, 3: Result
    const [file, setFile] = useState(null);
    const [fileName, setFileName] = useState('');
    const [importResult, setImportResult] = useState(null);
    const [mode, setMode] = useState('append');
    const [deactivationAcknowledged, setDeactivationAcknowledged] = useState(false);

    const {
        loading,
        previewData,
        error,
        previewCSV,
        confirmImport,
        downloadTemplate,
        reset
    } = useCSVImport();
    const { workflowMode } = useWorkflowMode();
    const navigatorSteps = CSV_IMPORT_STEPS.map((entry) => {
        if (entry.number === 2) {
            return {
                ...entry,
                disabled: !previewData,
                disabledReason: 'Validate a CSV file before opening preview.'
            };
        }
        if (entry.number === 3) {
            return {
                ...entry,
                disabled: !importResult,
                disabledReason: 'Confirm the import before opening results.'
            };
        }
        return entry;
    });

    const isSyncMode = mode === 'sync';
    const deactivateRows = previewData?.deactivateRows || [];
    const deactivateCount = previewData?.deactivateCount || 0;
    // The preview was computed for whichever mode was selected when it ran. If the mode changes
    // afterwards, the deactivation list on screen no longer describes what confirm would do, so the
    // preview is treated as stale rather than silently reused.
    const previewMatchesMode = !previewData || previewData.mode === mode;
    // The gate: sync mode cannot be confirmed until the user has ticked the acknowledgement for the
    // exact deactivation list shown. Zero deactivations still needs a valid, mode-matched preview.
    const syncConfirmBlocked = isSyncMode
        && (!previewMatchesMode || (deactivateCount > 0 && !deactivationAcknowledged));

    const handleClose = () => {
        setStep(1);
        setFile(null);
        setFileName('');
        setImportResult(null);
        setMode('append');
        setDeactivationAcknowledged(false);
        reset();
        onClose();
    };

    const handleModeChange = (nextMode) => {
        if (nextMode === mode) return;
        setMode(nextMode);
        setDeactivationAcknowledged(false);
        // Force a fresh preview: a stale deactivation list is the one thing this flow must never
        // let a user confirm against.
        setStep(1);
        setImportResult(null);
        reset();
    };

    const handleFileSelect = useCallback((event) => {
        const selectedFile = event.target.files?.[0];
        if (!selectedFile) return;

        if (!selectedFile.name.endsWith('.csv')) {
            toast.error('Please select a CSV file');
            return;
        }

        setFileName(selectedFile.name);
        setFile(selectedFile);
    }, []);

    const handleDrop = useCallback((event) => {
        event.preventDefault();
        const droppedFile = event.dataTransfer.files?.[0];
        if (!droppedFile) return;

        if (!droppedFile.name.endsWith('.csv')) {
            toast.error('Please select a CSV file');
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
            toast.error('Please select a CSV file first');
            return;
        }

        setDeactivationAcknowledged(false);
        const result = await previewCSV(file, { mode });
        if (result.success) {
            setStep(2);
        } else {
            if (result?.details?.code === 'WORKFLOW_MODE_TEMPLATE_MISMATCH') {
                const expectedMode = result?.details?.tenant_template_workflow_mode
                    || result?.details?.tenant_workflow_mode
                    || workflowMode;
                const expectedLabel = getWorkflowModeLabel(expectedMode);
                toast.error(`${result.error} Expected template: ${expectedLabel}.`);
                return;
            }
            toast.error(result.error);
        }
    };

    const handleConfirm = async () => {
        if (!previewData?.rows) return;

        // Only send valid rows
        const validRows = previewData.rows.filter(row => row.valid);
        // In sync mode a file of only-invalid rows still has work to do (the deactivation pass), so
        // an empty valid set is only fatal for append mode.
        if (validRows.length === 0 && !(isSyncMode && deactivateCount > 0)) {
            toast.error('No valid rows to import');
            return;
        }

        if (syncConfirmBlocked) {
            toast.error(previewMatchesMode
                ? 'Confirm you understand which items will be deactivated before importing'
                : 'Re-run the preview for the selected import mode before importing');
            return;
        }

        const result = await confirmImport(previewData.rows, {
            mode,
            // Echo back exactly the list the preview rendered above -- the server intersects it
            // with its own re-derived set, so this can only narrow the blast radius.
            deactivateSkus: deactivateRows.map((entry) => entry.sku_code)
        });
        if (result.success) {
            setImportResult(result.data);
            setStep(3);
            const deactivatedNotice = result.data.mode === 'sync'
                ? `, ${result.data.deactivatedCount || 0} deactivated`
                : '';
            toast.success(`Import complete: ${result.data.createdCount} created, ${result.data.updatedCount} updated${deactivatedNotice}`);
        } else {
            toast.error(result.error);
        }
    };

    const handleDownloadTemplate = async () => {
        const result = await downloadTemplate({ workflowMode });
        if (result.success) {
            toast.success(`${getWorkflowModeLabel(result.workflowMode)} template downloaded`);
        } else {
            toast.error(result.error);
        }
    };

    const handleStartOver = () => {
        setStep(1);
        setFile(null);
        setFileName('');
        setImportResult(null);
        setDeactivationAcknowledged(false);
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
                <Button
                    variant="outline"
                    size="sm"
                    onClick={handleDownloadTemplate}
                    className="text-teal-600 border-teal-200 hover:bg-teal-50"
                >
                    <Download className="w-3 h-3 mr-1" />
                    Download {getWorkflowModeLabel(workflowMode)} Template
                </Button>
                <p className="text-xs text-slate-400">
                    Current tenant mode: <span className="font-semibold text-slate-600">{getWorkflowModeLabel(workflowMode)}</span>
                </p>
            </div>

            <div className="space-y-2">
                <p className="text-sm font-medium text-slate-700">Import mode</p>
                {IMPORT_MODES.map((option) => (
                    <label
                        key={option.id}
                        className={cn(
                            'flex gap-3 items-start p-3 rounded-lg border cursor-pointer transition-colors',
                            mode === option.id
                                ? (option.id === 'sync'
                                    ? 'border-amber-400 bg-amber-50'
                                    : 'border-teal-400 bg-teal-50/40')
                                : 'border-slate-200 hover:border-slate-300'
                        )}
                    >
                        <input
                            type="radio"
                            name="csv-import-mode"
                            value={option.id}
                            checked={mode === option.id}
                            onChange={() => handleModeChange(option.id)}
                            className="mt-1"
                        />
                        <span>
                            <span className="block text-sm font-medium text-slate-800">{option.label}</span>
                            <span className="block text-xs text-slate-500">{option.description}</span>
                        </span>
                    </label>
                ))}
            </div>

            {isSyncMode && (
                <div className="bg-amber-50 border border-amber-200 rounded-lg p-4 text-sm flex gap-2">
                    <ShieldAlert className="w-4 h-4 text-amber-700 mt-0.5 shrink-0" />
                    <p className="text-amber-800">
                        Full catalog sync deactivates active items missing from this file. You will see
                        the exact list before anything is applied, and nothing is ever deleted.
                    </p>
                </div>
            )}

            <div className="bg-amber-50 border border-amber-200 rounded-lg p-4 text-sm">
                <p className="font-medium text-amber-800 mb-1">📋 Import Order Reminder</p>
                <p className="text-amber-700">
                    Template mode must match your tenant mode. Mismatched templates are blocked at preview and confirm import.
                </p>
            </div>
        </div>
    );

    // Step 2: Preview
    const renderPreviewStep = () => (
        <div className="space-y-4">
            {/* Summary */}
            <div className={cn('grid gap-3', isSyncMode ? 'grid-cols-5' : 'grid-cols-4')}>
                <div className="bg-slate-50 rounded-lg p-3 text-center">
                    <p className="text-2xl font-bold text-slate-700">{previewData?.totalRows || 0}</p>
                    <p className="text-xs text-slate-500">Total Rows</p>
                </div>
                <div className="bg-green-50 rounded-lg p-3 text-center">
                    <p className="text-2xl font-bold text-green-600">{previewData?.createCount || 0}</p>
                    <p className="text-xs text-green-600">New Items</p>
                </div>
                <div className="bg-blue-50 rounded-lg p-3 text-center">
                    <p className="text-2xl font-bold text-blue-600">
                        {(previewData?.updateCount || 0) + (previewData?.reactivateCount || 0)}
                    </p>
                    <p className="text-xs text-blue-600">
                        Updates{previewData?.reactivateCount ? ` (${previewData.reactivateCount} reactivated)` : ''}
                    </p>
                </div>
                {isSyncMode && (
                    <div className="bg-amber-50 rounded-lg p-3 text-center">
                        <p className="text-2xl font-bold text-amber-700">{deactivateCount}</p>
                        <p className="text-xs text-amber-700">To Deactivate</p>
                    </div>
                )}
                <div className="bg-red-50 rounded-lg p-3 text-center">
                    <p className="text-2xl font-bold text-red-600">{previewData?.invalidRows || 0}</p>
                    <p className="text-xs text-red-600">Errors</p>
                </div>
            </div>

            {/* #1495 Part B: the mandatory deactivation gate. Sync mode is never confirmable
                without this list on screen and its acknowledgement ticked. */}
            {isSyncMode && !previewMatchesMode && (
                <div className="bg-amber-50 border border-amber-200 rounded-lg p-3 text-sm text-amber-800">
                    <AlertCircle className="w-4 h-4 inline mr-2" />
                    Import mode changed since this preview ran. Go back and preview again before importing.
                </div>
            )}

            {isSyncMode && previewMatchesMode && (
                <div className="border border-amber-300 bg-amber-50/60 rounded-lg p-3 space-y-3">
                    <div className="flex items-start gap-2">
                        <ArchiveX className="w-4 h-4 text-amber-700 mt-0.5 shrink-0" />
                        <div className="text-sm text-amber-900">
                            <p className="font-medium">
                                {deactivateCount === 0
                                    ? 'No items will be deactivated'
                                    : `${deactivateCount} item(s) will be deactivated`}
                            </p>
                            <p className="text-xs text-amber-800">
                                These active items have no matching SKU in this file. They are deactivated,
                                never deleted, and come back if you re-import them. Items still used by an
                                active product, purchase order, or job order are reported as skipped instead.
                            </p>
                        </div>
                    </div>

                    {deactivateCount > 0 && (
                        <>
                            <div className="border border-amber-200 rounded-md bg-white max-h-40 overflow-y-auto">
                                <table className="w-full text-xs">
                                    <thead className="bg-amber-100/60 sticky top-0">
                                        <tr>
                                            <th className="text-left p-2 font-medium text-amber-900">SKU</th>
                                            <th className="text-left p-2 font-medium text-amber-900">Name</th>
                                            <th className="text-left p-2 font-medium text-amber-900">Category</th>
                                        </tr>
                                    </thead>
                                    <tbody className="divide-y divide-amber-100">
                                        {deactivateRows.map((entry) => (
                                            <tr key={entry.item_id}>
                                                <td className="p-2 font-mono">{entry.sku_code || '-'}</td>
                                                <td className="p-2 text-slate-700">{entry.name || '-'}</td>
                                                <td className="p-2 text-slate-600 capitalize">
                                                    {entry.category?.replace('_', ' ') || '-'}
                                                </td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>

                            <label className="flex items-start gap-2 text-sm text-amber-900 cursor-pointer">
                                <input
                                    type="checkbox"
                                    checked={deactivationAcknowledged}
                                    onChange={(event) => setDeactivationAcknowledged(event.target.checked)}
                                    className="mt-0.5"
                                />
                                <span>I understand {deactivateCount} item(s) will be deactivated.</span>
                            </label>
                        </>
                    )}
                </div>
            )}

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
                                            : row.action === 'REACTIVATE'
                                                ? 'bg-purple-50 text-purple-700 border-purple-200'
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

            <div className="grid grid-cols-3 gap-3 max-w-xl mx-auto">
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
                {importResult?.reactivatedCount > 0 && (
                    <div className="bg-purple-50 rounded-lg p-4">
                        <p className="text-3xl font-bold text-purple-600">{importResult.reactivatedCount}</p>
                        <p className="text-sm text-purple-600 flex items-center justify-center gap-1">
                            <RotateCcw className="w-3 h-3" /> Reactivated
                        </p>
                    </div>
                )}
                {importResult?.mode === 'sync' && (
                    <div className="bg-amber-50 rounded-lg p-4">
                        <p className="text-3xl font-bold text-amber-700">{importResult?.deactivatedCount || 0}</p>
                        <p className="text-sm text-amber-700 flex items-center justify-center gap-1">
                            <ArchiveX className="w-3 h-3" /> Deactivated
                        </p>
                    </div>
                )}
            </div>

            {importResult?.deactivationSkippedCount > 0 && (
                <div className="bg-amber-50 border border-amber-200 rounded-lg p-4 text-left max-w-xl mx-auto">
                    <p className="font-medium text-amber-900 mb-2">
                        Not deactivated ({importResult.deactivationSkippedCount}) — still in use:
                    </p>
                    <div className="space-y-1 text-sm text-amber-800 max-h-32 overflow-y-auto">
                        {importResult.results?.deactivationSkipped?.map((entry) => (
                            <p key={entry.item_id}>{entry.sku_code} ({entry.name}): {entry.reason}</p>
                        ))}
                    </div>
                </div>
            )}

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
                    </DialogTitle>
                </DialogHeader>

                <WizardStepNavigator
                    steps={navigatorSteps}
                    currentStep={step}
                    completedStep={step - 1}
                    onStepChange={setStep}
                    ariaLabel="CSV import steps"
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
                                disabled={
                                    loading
                                    || syncConfirmBlocked
                                    || (previewData?.validRows === 0 && !(isSyncMode && deactivateCount > 0))
                                }
                                className={cn(
                                    isSyncMode && deactivateCount > 0
                                        ? 'bg-amber-600 hover:bg-amber-700'
                                        : 'bg-teal-600 hover:bg-teal-700'
                                )}
                            >
                                {loading ? (
                                    <><Loader2 className="w-4 h-4 mr-2 animate-spin" /> Importing...</>
                                ) : (
                                    <>
                                        <CheckCircle2 className="w-4 h-4 mr-2" />
                                        Confirm Import ({previewData?.validRows} items
                                        {isSyncMode && deactivateCount > 0 ? `, ${deactivateCount} deactivated` : ''})
                                    </>
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
