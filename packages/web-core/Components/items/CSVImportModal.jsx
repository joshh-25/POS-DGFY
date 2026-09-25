import React, { useState, useCallback, useEffect, useRef } from 'react';
import {
    Dialog,
    DialogContent,
    DialogHeader,
    DialogTitle,
    DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
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
    ShieldAlert,
    X
} from 'lucide-react';
import { cn } from "../../src/lib/utils.js";
import { useCSVImport } from '../../src/hooks/useCSVImport.js';
import { useWorkflowMode } from '../../src/features/settings/WorkflowModeContext.jsx';
import { getWorkflowModeLabel } from '../../src/features/settings/workflowMode.js';
import WizardStepNavigator from '@/src/components/common/WizardStepNavigator.jsx';
import StorefrontSectionInfo from '@/src/features/pos/settings/StorefrontSectionInfo.jsx';
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

const getPreviewActionTone = (action) => (
    action === 'CREATE'
        ? 'bg-[#EEF5FF] text-[#1A4E8D]'
        : action === 'REACTIVATE'
            ? 'bg-purple-50 text-purple-700'
            : 'bg-blue-50 text-blue-700'
);

export default function CSVImportModal({ open, onClose, onSuccess }) {
    const [step, setStep] = useState(1); // 1: Upload, 2: Preview, 3: Result
    const [file, setFile] = useState(null);
    const [fileName, setFileName] = useState('');
    const [importResult, setImportResult] = useState(null);
    const [mode, setMode] = useState('append');
    const [deactivationAcknowledged, setDeactivationAcknowledged] = useState(false);
    const modalBodyRef = useRef(null);

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

    useEffect(() => {
        if (!open || !modalBodyRef.current) return undefined;

        const body = modalBodyRef.current;
        const frame = window.requestAnimationFrame(() => {
            const shouldRevealSyncWarning = step === 1 && mode === 'sync';
            body.scrollTo({
                top: shouldRevealSyncWarning ? body.scrollHeight : 0,
                behavior: shouldRevealSyncWarning ? 'smooth' : 'auto'
            });
        });

        return () => window.cancelAnimationFrame(frame);
    }, [mode, open, step]);

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
    const confirmImportDisabled = loading
        || syncConfirmBlocked
        || (previewData?.validRows === 0 && !(isSyncMode && deactivateCount > 0));

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
        <div className="csv-import-step-content">
            <div className="csv-import-upload-dropzone rounded-xl border border-dashed border-[#8DB4DE] bg-[#F5F8FC] p-2.5 text-center transition-colors hover:bg-[#EEF5FF]"
                onDrop={handleDrop}
                onDragOver={handleDragOver}
            >
                <div className="mx-auto grid h-7 w-7 place-items-center rounded-lg bg-[#EEF5FF] text-[#1A4E8D]">
                    <Upload className="h-4 w-4" />
                </div>
                <p className="mt-1.5 text-[10px] font-bold text-slate-700">
                    Drag and drop a CSV file here, or
                </p>
                <label className="inline-block">
                    <input
                        type="file"
                        accept=".csv"
                        onChange={handleFileSelect}
                        className="hidden"
                    />
                    <span className="text-[10px] font-bold text-[#1A4E8D] underline decoration-[#8DB4DE] underline-offset-2 hover:text-[#143F73]">
                        browse files
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

            <div className="csv-import-template-panel flex items-center justify-between gap-2 rounded-lg border border-slate-200 bg-slate-50/60 p-2">
                <div className="flex min-w-0 items-center gap-2">
                    <span className="grid h-6 w-6 shrink-0 place-items-center rounded-md bg-white text-[#1A4E8D] ring-1 ring-[#C7DCF3]">
                        <FileText className="h-3.5 w-3.5" />
                    </span>
                    <div className="min-w-0">
                        <p className="truncate text-[9px] font-black text-slate-700">Download a template to get started</p>
                        <p className="truncate text-[8px] text-slate-500">
                            Current tenant mode: <span className="font-bold text-slate-700">{getWorkflowModeLabel(workflowMode)}</span>
                        </p>
                    </div>
                </div>
                <Button
                    variant="outline"
                    size="sm"
                    onClick={handleDownloadTemplate}
                    aria-label={`Download ${getWorkflowModeLabel(workflowMode)} Template`}
                    title={`Download ${getWorkflowModeLabel(workflowMode)} Template`}
                    className="h-7 shrink-0 rounded-lg border-[#1A4E8D] px-2 text-[9px] font-bold text-[#1A4E8D] hover:bg-blue-50"
                 >
                     <Download className="mr-1 h-3 w-3" />
                     Download Template (.csv)
                     <span className="sr-only">Download {getWorkflowModeLabel(workflowMode)} Template</span>
                 </Button>
            </div>

            <div className="csv-import-mode-section space-y-1.5">
                <div className="flex items-center justify-between gap-2">
                    <div className="flex items-center gap-1.5">
                        <p className="text-[9px] font-black uppercase tracking-wide text-slate-500">Import mode</p>
                        <StorefrontSectionInfo
                            label="Import Mode"
                            panelId="csv-import-mode-info"
                            placement="below"
                            portal
                            tone="amber"
                        >
                            <p className="font-black text-amber-800">Import Order Reminder</p>
                            <p className="mt-0.5 text-amber-700">
                                Template mode must match your tenant mode. Mismatched templates are blocked at preview and confirm import.
                            </p>
                        </StorefrontSectionInfo>
                    </div>
                </div>
                <div className="csv-import-mode-options grid grid-cols-1 gap-1.5">
                    {IMPORT_MODES.map((option) => (
                        <label
                            key={option.id}
                            className={cn(
                                'csv-import-mode-option flex min-w-0 cursor-pointer items-start gap-2 rounded-lg border p-2 transition-colors',
                                mode === option.id
                                    ? (option.id === 'sync'
                                        ? 'border-amber-400 bg-amber-50'
                                        : 'border-[#1A4E8D] bg-[#EEF5FF]')
                                    : 'border-slate-200 bg-white hover:border-slate-300'
                            )}
                        >
                            <input
                                type="radio"
                                name="csv-import-mode"
                                value={option.id}
                                checked={mode === option.id}
                                onChange={() => handleModeChange(option.id)}
                                className="mt-0.5 h-3.5 w-3.5 shrink-0 accent-[#1A4E8D]"
                            />
                            <span className="min-w-0">
                                <span className="block truncate text-[9px] font-black text-slate-800">{option.label}</span>
                                <span className="mt-0.5 block text-[8px] leading-3 text-slate-500">{option.description}</span>
                            </span>
                        </label>
                    ))}
                </div>
            </div>

            {isSyncMode && (
                <div className="csv-import-warning flex gap-2 rounded-lg border border-amber-200 bg-amber-50 p-2 text-[9px]">
                    <ShieldAlert className="mt-0.5 h-3.5 w-3.5 shrink-0 text-amber-700" />
                    <p className="leading-3.5 text-amber-800">
                        Full catalog sync deactivates active items missing from this file. You will see
                        the exact list before anything is applied, and nothing is ever deleted.
                    </p>
                </div>
            )}

        </div>
    );

    // Step 2: Preview
    const renderPreviewStep = () => (
        <div className="csv-import-step-content">
            {/* Summary */}
            <div className="csv-import-summary-grid grid grid-cols-2 gap-2">
                <div className="rounded-lg bg-slate-50 p-2 text-center">
                    <p className="text-xl font-bold text-slate-700">{previewData?.totalRows || 0}</p>
                    <p className="text-[9px] leading-3 text-slate-500">Total Rows</p>
                </div>
                <div className="rounded-lg bg-[#EEF5FF] p-2 text-center">
                    <p className="text-xl font-bold text-[#1A4E8D]">{previewData?.createCount || 0}</p>
                    <p className="text-[9px] leading-3 text-[#1A4E8D]">New Items</p>
                </div>
                <div className="rounded-lg bg-blue-50 p-2 text-center">
                    <p className="text-xl font-bold text-blue-600">
                        {(previewData?.updateCount || 0) + (previewData?.reactivateCount || 0)}
                    </p>
                    <p className="text-[9px] leading-3 text-blue-600">
                        Updates{previewData?.reactivateCount ? ` (${previewData.reactivateCount} reactivated)` : ''}
                    </p>
                </div>
                {isSyncMode && (
                    <div className="rounded-lg bg-amber-50 p-2 text-center">
                        <p className="text-xl font-bold text-amber-700">{deactivateCount}</p>
                        <p className="text-[9px] leading-3 text-amber-700">To Deactivate</p>
                    </div>
                )}
                <div className={cn(
                    'rounded-lg bg-red-50 p-2 text-center',
                    isSyncMode && 'csv-import-summary-error-card'
                )}>
                    <p className="text-xl font-bold text-red-600">{previewData?.invalidRows || 0}</p>
                    <p className="text-[9px] leading-3 text-red-600">Errors</p>
                </div>
            </div>

            {/* #1495 Part B: the mandatory deactivation gate. Sync mode is never confirmable
                without this list on screen and its acknowledgement ticked. */}
            {isSyncMode && !previewMatchesMode && (
                <div className="rounded-lg border border-amber-200 bg-amber-50 p-2 text-[9px] leading-3 text-amber-800">
                    <AlertCircle className="mr-1.5 inline h-3.5 w-3.5" />
                    Import mode changed since this preview ran. Go back and preview again before importing.
                </div>
            )}

            {isSyncMode && previewMatchesMode && (
                <div className="space-y-2 rounded-lg border border-amber-300 bg-amber-50/60 p-2.5">
                    <div className="flex items-start gap-2">
                        <ArchiveX className="mt-0.5 h-3.5 w-3.5 shrink-0 text-amber-700" />
                        <div className="text-[9px] leading-3 text-amber-900">
                            <p className="font-bold">
                                {deactivateCount === 0
                                    ? 'No items will be deactivated'
                                    : `${deactivateCount} item(s) will be deactivated`}
                            </p>
                            <p className="mt-0.5 text-[8px] leading-3 text-amber-800">
                                These active items have no matching SKU in this file. They are deactivated,
                                never deleted, and come back if you re-import them. Items still used by an
                                active product, purchase order, or job order are reported as skipped instead.
                            </p>
                        </div>
                    </div>

                    {deactivateCount > 0 && (
                        <>
                            <div className="max-h-40 overflow-y-auto rounded-md border border-amber-200 bg-white pos-items-modal-scrollbar">
                                <table className="w-full table-fixed text-[9px]">
                                    <thead className="bg-amber-100/60 sticky top-0">
                                        <tr>
                                            <th className="p-1.5 text-left font-bold text-amber-900">SKU</th>
                                            <th className="p-1.5 text-left font-bold text-amber-900">Name</th>
                                            <th className="p-1.5 text-left font-bold text-amber-900">Category</th>
                                        </tr>
                                    </thead>
                                    <tbody className="divide-y divide-amber-100">
                                        {deactivateRows.map((entry) => (
                                            <tr key={entry.item_id}>
                                                <td className="break-words p-1.5 font-mono">{entry.sku_code || '-'}</td>
                                                <td className="break-words p-1.5 text-slate-700">{entry.name || '-'}</td>
                                                <td className="break-words p-1.5 text-slate-600 capitalize">
                                                    {entry.category?.replace('_', ' ') || '-'}
                                                </td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>

                            <label className="flex cursor-pointer items-start gap-2 text-[9px] leading-3 text-amber-900">
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

            {/* Preview data */}
            <div className="csv-import-preview-panel overflow-hidden rounded-lg border border-slate-200 bg-white">
                <div className="flex items-center justify-between gap-2 border-b border-slate-200 bg-slate-50/80 px-2.5 py-2">
                    <div className="flex min-w-0 items-center gap-1.5">
                        <span className="truncate text-[9px] font-black uppercase tracking-wide text-slate-500">Preview Data</span>
                        <span className="shrink-0 rounded bg-slate-200 px-1.5 py-0.5 text-[8px] font-bold text-slate-600">
                            {previewData?.rows?.length || 0} Records
                        </span>
                    </div>
                    <span className="shrink-0 text-[8px] font-semibold text-slate-400">Format: UTF-8 standard</span>
                </div>

                <div
                    className="csv-import-preview-table-scroll max-h-[13rem] overflow-auto pos-items-modal-scrollbar"
                    data-testid="csv-import-preview-table-scroll"
                >
                    <table className="csv-import-preview-table w-full table-fixed text-[10px]">
                        <colgroup>
                            <col className="w-[8%]" />
                            <col className="w-[18%]" />
                            <col className="w-[23%]" />
                            <col className="w-[18%]" />
                            <col className="w-[18%]" />
                            <col className="w-[15%]" />
                        </colgroup>
                        <thead className="sticky top-0 bg-white">
                            <tr className="border-b border-slate-200">
                                <th className="p-1.5 text-left text-[8px] font-black uppercase tracking-wide text-slate-500">Row</th>
                                <th className="p-1.5 text-left text-[8px] font-black uppercase tracking-wide text-slate-500">SKU</th>
                                <th className="p-1.5 text-left text-[8px] font-black uppercase tracking-wide text-slate-500">Name</th>
                                <th className="p-1.5 text-left text-[8px] font-black uppercase tracking-wide text-slate-500">Category</th>
                                <th className="p-1.5 text-left text-[8px] font-black uppercase tracking-wide text-slate-500">Action</th>
                                <th className="p-1.5 text-left text-[8px] font-black uppercase tracking-wide text-slate-500">Status</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100">
                            {previewData?.rows?.map((row) => (
                                <tr key={row.rowNumber} className={cn(
                                    row.valid ? 'bg-white' : 'bg-red-50'
                                )}>
                                    <td className="p-1.5 text-slate-500">{row.rowNumber}</td>
                                    <td className="break-words p-1.5 font-mono text-[9px]">{row.sku_code || '-'}</td>
                                    <td className="break-words p-1.5 font-medium text-slate-700">{row.name || '-'}</td>
                                    <td className="p-1.5">
                                        <span className="csv-import-preview-chip csv-import-preview-category-chip bg-[#EEF5FF] text-[#1A4E8D]">
                                            {row.category?.replace('_', ' ') || '-'}
                                        </span>
                                    </td>
                                    <td className="p-1.5">
                                        <span className={cn(
                                            'csv-import-preview-chip csv-import-preview-action-chip',
                                            getPreviewActionTone(row.action)
                                        )}>
                                            {row.action}
                                        </span>
                                    </td>
                                    <td className="p-1.5">
                                        {row.valid ? (
                                            <span className="csv-import-preview-chip csv-import-preview-status-chip bg-[#EEF5FF] text-[#1A4E8D]">
                                                <CheckCircle2 className="mr-1 h-2.5 w-2.5" />
                                                Valid
                                            </span>
                                        ) : (
                                            <div className="space-y-1">
                                                <span className="csv-import-preview-chip csv-import-preview-status-chip bg-red-50 text-red-700">
                                                    Error
                                                </span>
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

            {previewData?.invalidRows > 0 && (
                <div className="csv-import-warning bg-amber-50 border border-amber-200 rounded-lg p-3 text-sm text-amber-800">
                    <AlertCircle className="w-4 h-4 inline mr-2" />
                    {previewData.invalidRows} row(s) have errors and will be skipped during import.
                </div>
            )}
        </div>
    );

    // Step 3: Result
    const renderResultStep = () => {
        const resultStatCount = 3
            + (importResult?.reactivatedCount > 0 ? 1 : 0)
            + (importResult?.mode === 'sync' ? 1 : 0);
        const resultStatsGridClassName = resultStatCount === 3 ? 'grid-cols-3' : 'grid-cols-2';

        return (
        <div className="csv-import-result-step py-3 text-center">
            <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-[#EEF5FF]">
                <CheckCircle2 className="h-6 w-6 text-[#1A4E8D]" />
            </div>

            <div className="space-y-0.5">
                <h3 className="text-base font-black text-slate-800">Import Complete!</h3>
                <p className="text-[11px] text-slate-600">Your items have been successfully imported.</p>
            </div>

            <div className={cn('csv-import-result-stats mx-auto grid max-w-[24rem] gap-2', resultStatsGridClassName)}>
                <div className="rounded-lg bg-[#EEF5FF] p-2 text-center">
                    <p className="text-xl font-bold text-[#1A4E8D]">{importResult?.createdCount || 0}</p>
                    <p className="text-[9px] leading-3 text-[#1A4E8D]">Created</p>
                </div>
                <div className="rounded-lg bg-blue-50 p-2 text-center">
                    <p className="text-xl font-bold text-blue-600">{importResult?.updatedCount || 0}</p>
                    <p className="text-[9px] leading-3 text-blue-600">Updated</p>
                </div>
                <div className="rounded-lg bg-red-50 p-2 text-center">
                    <p className="text-xl font-bold text-red-600">{importResult?.failedCount || 0}</p>
                    <p className="text-[9px] leading-3 text-red-600">Failed</p>
                </div>
                {importResult?.reactivatedCount > 0 && (
                    <div className="rounded-lg bg-purple-50 p-2 text-center">
                        <p className="text-xl font-bold text-purple-600">{importResult.reactivatedCount}</p>
                        <p className="flex items-center justify-center gap-1 text-[9px] leading-3 text-purple-600">
                            <RotateCcw className="h-3 w-3" /> Reactivated
                        </p>
                    </div>
                )}
                {importResult?.mode === 'sync' && (
                    <div className="rounded-lg bg-amber-50 p-2 text-center">
                        <p className="text-xl font-bold text-amber-700">{importResult?.deactivatedCount || 0}</p>
                        <p className="flex items-center justify-center gap-1 text-[9px] leading-3 text-amber-700">
                            <ArchiveX className="h-3 w-3" /> Deactivated
                        </p>
                    </div>
                )}
            </div>

            {importResult?.deactivationSkippedCount > 0 && (
                <div className="mx-auto max-w-[24rem] rounded-lg border border-amber-200 bg-amber-50 p-2.5 text-left">
                    <p className="mb-1.5 text-[10px] font-black text-amber-900">
                        Not deactivated ({importResult.deactivationSkippedCount}) — still in use:
                    </p>
            <div className="max-h-24 space-y-1 overflow-y-auto text-[9px] leading-3 text-amber-800 pos-items-modal-scrollbar">
                        {importResult.results?.deactivationSkipped?.map((entry) => (
                            <p key={entry.item_id}>{entry.sku_code} ({entry.name}): {entry.reason}</p>
                        ))}
                    </div>
                </div>
            )}

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
    };

    return (
        <Dialog
            open={open}
            onOpenChange={handleClose}
            mobileSheet
            overlayClassName="bg-slate-700/30 backdrop-blur-[2px]"
        >
            <DialogContent className={cn(
                'csv-import-modal pos-items-modal-panel pos-items-mobile-sheet-panel pos-items-form-scale !w-full !max-w-none sm:!w-[32rem] sm:!max-w-[32rem] flex min-h-0 max-h-[calc(100dvh-2rem)] flex-col overflow-hidden rounded-2xl border border-slate-200 bg-white p-0 shadow-2xl shadow-slate-900/20'
            )}>
                <DialogHeader className="-mx-px -mt-px flex shrink-0 flex-row items-center justify-between gap-3 rounded-t-[17px] border-b border-[#143F73] bg-[#1A4E8D] px-4 py-2.5 text-white sm:px-5">
                    <div className="flex min-w-0 items-center gap-2.5">
                        <div className="grid h-8 w-8 shrink-0 place-items-center rounded-lg bg-white text-[#1A4E8D] shadow-sm ring-1 ring-[#C7DCF3]">
                            <Upload className="h-4 w-4" />
                        </div>
                        <div className="min-w-0">
                            <DialogTitle className="truncate text-sm font-black text-white">
                                Import Items from CSV
                            </DialogTitle>
                            <p className="mt-0.5 truncate text-[9px] text-blue-100">{CSV_IMPORT_STEPS[step - 1]?.description || CSV_IMPORT_STEPS[0].description}</p>
                        </div>
                    </div>
                    <button
                        type="button"
                        onClick={handleClose}
                        aria-label="Close CSV import"
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
                    ariaLabel="CSV import steps"
                    showLabels
                    className="csv-import-stepper wizard-step-navigator--dgfy shrink-0"
                />

                <div
                    ref={modalBodyRef}
                    className={cn(
                        'csv-import-modal-body pos-items-modal-scroll-region min-h-0 flex-1 overflow-y-auto px-4 py-2 sm:px-5 sm:py-2.5',
                        step === 3 && 'csv-import-result-modal-body'
                    )}
                >
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
                    step === 2
                        ? 'grid grid-cols-2 items-center'
                        : 'grid grid-cols-2'
                )}>
                    {step === 1 && (
                        <>
                            <Button
                                variant="outline"
                                onClick={handleClose}
                                className="h-10 w-full rounded-lg border-[#1A4E8D] px-3 text-[10px] font-bold text-[#1A4E8D] hover:bg-blue-50"
                            >
                                Cancel
                            </Button>
                            <Button
                                onClick={handlePreview}
                                disabled={!file || loading}
                                className="h-10 w-full rounded-lg bg-[#1A4E8D] px-3 text-[10px] font-bold text-white hover:bg-[#143F73]"
                            >
                                {loading ? (
                                    <><Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" /> Validating...</>
                                ) : (
                                    <><ArrowRight className="mr-1.5 h-3.5 w-3.5" /> Preview Import</>
                                )}
                            </Button>
                        </>
                    )}

                    {step === 2 && (
                        <>
                            <Button
                                variant="outline"
                                onClick={handleStartOver}
                                className="h-10 w-full rounded-lg border-[#1A4E8D] px-3 text-[10px] font-bold text-[#1A4E8D] hover:bg-blue-50"
                            >
                                <ArrowLeft className="mr-1.5 h-3.5 w-3.5" />
                                Back
                            </Button>
                            <Button
                                onClick={handleConfirm}
                                disabled={confirmImportDisabled}
                                className={cn(
                                    'h-10 w-full rounded-lg px-3 text-[10px] font-bold text-white',
                                    confirmImportDisabled && !loading
                                        ? 'cursor-not-allowed bg-slate-200 text-slate-400 hover:bg-slate-200'
                                        : isSyncMode && deactivateCount > 0
                                        ? 'bg-amber-600 hover:bg-amber-700'
                                        : 'bg-[#1A4E8D] hover:bg-[#143F73]'
                                )}
                            >
                                {loading ? (
                                    <><Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" /> Importing...</>
                                ) : (
                                    <>
                                        <CheckCircle2 className="mr-1.5 h-3.5 w-3.5" />
                                        Confirm Import
                                    </>
                                )}
                            </Button>
                        </>
                    )}

                    {step === 3 && (
                        <>
                            <Button
                                variant="outline"
                                onClick={handleStartOver}
                                className="h-10 w-full rounded-lg border-[#1A4E8D] px-3 text-[10px] font-bold text-[#1A4E8D] hover:bg-blue-50"
                            >
                                <RefreshCw className="mr-1.5 h-3.5 w-3.5" />
                                Import More
                            </Button>
                            <Button
                                onClick={handleDone}
                                className="h-10 w-full rounded-lg bg-[#1A4E8D] px-3 text-[10px] font-bold text-white hover:bg-[#143F73]"
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
