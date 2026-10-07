import React, { useCallback, useMemo, useRef, useState } from 'react';
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
import { Progress } from "@/components/ui/progress";
import {
    Upload,
    FileText,
    Image as ImageIcon,
    CheckCircle2,
    XCircle,
    AlertCircle,
    AlertTriangle,
    Loader2,
    ArrowLeft,
    ArrowRight,
    RefreshCw,
    Trash2,
    Scissors,
    Camera,
    FolderTree,
    X
} from 'lucide-react';
import { cn } from "../../src/lib/utils.js";
import MenuPhotoCaptureSheet from './MenuPhotoCaptureSheet.jsx';
import { useMenuImportJob } from '../../src/hooks/useMenuImportJob.js';
import { usePermission } from '../../src/hooks/usePermission.js';
import {
    MENU_IMPORT_ACCEPTED_FILE_PATTERN,
    MENU_IMPORT_FILE_ACCEPT_ATTRIBUTE,
    MENU_IMPORT_MAX_FILES_HINT
} from '../../src/services/menuImportService.js';
import WizardStepNavigator from '@/src/components/common/WizardStepNavigator.jsx';
import { toast } from 'sonner';

/**
 * Batch menu import wizard — several PDFs/photos in one job.
 *
 * Separate from PdfMenuImportModal.jsx (the shipped single-file wizard) rather
 * than a mode inside it: the batch flow has an asynchronous processing stage
 * with its own progress/per-file-failure UI and a merge-review layer that the
 * synchronous single-file path has no concept of, and the two flags ship
 * independently.
 */

const BATCH_IMPORT_STEPS = Object.freeze([
    { id: 'upload', number: 1, name: 'Upload', description: 'Add up to 20 menu PDFs or photos.' },
    { id: 'preview', number: 2, name: 'Review', description: 'Review merged items before importing.' },
    { id: 'result', number: 3, name: 'Result', description: 'Review created and failed rows.' }
]);

const formatFileSize = (bytes) => {
    if (!Number.isFinite(bytes)) return '';
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
};

const formatPrice = (value) => `₱${Number(value).toFixed(2)}`;

// Human-readable labels for images_skipped[].reason (see
// menuImportController.js's enqueueGeneratedImages) — anything unrecognized
// falls back to its raw reason string rather than being hidden.
const IMAGE_SKIP_REASON_LABELS = Object.freeze({
    row_not_created: 'the row wasn’t created',
    feature_disabled: 'AI image generation is currently disabled',
    permission_denied: 'you need the Edit Items permission',
    budget_exceeded: 'the daily AI image budget was already reached',
    batch_cap_exceeded: 'over the per-batch image limit',
    queue_unavailable: 'the generation queue was unavailable'
});

const IMAGE_SKIP_REASON_SUMMARY = (skipped = []) => {
    const counts = new Map();
    for (const entry of skipped) {
        const key = entry?.reason || 'unknown';
        counts.set(key, (counts.get(key) || 0) + 1);
    }
    return Array.from(counts.entries())
        .map(([reason, count]) => `${count} — ${IMAGE_SKIP_REASON_LABELS[reason] || reason}`)
        .join('; ');
};

// Rough, non-billing per-image estimate shown before confirm so spend is
// visible up front — matches the ~$0.03/image (1K tier) figure in #176.
// The server prices the real charge at generation time
// (config/aiModelRates.js's resolveImageModelRate); this is only ever an
// indicative estimate, never what gets billed.
const APPROX_ITEM_IMAGE_COST_USD = 0.03;

// Deep-copies preview rows into an editable working set and normalizes an
// `included` flag (valid rows default to included; invalid rows default to
// excluded so a bad extraction never silently creates junk items) and a
// `generate_image` opt-in flag, which always defaults off — image
// generation is an extra cost the operator chooses per item, never assumed.
const toEditableRows = (rows = []) => rows.map((row) => ({
    ...row,
    data: { ...row.data },
    included: row.valid,
    generate_image: false
}));

const FILE_STATUS_BADGES = {
    queued: { label: 'Queued', className: 'bg-slate-100 text-slate-600' },
    processing: { label: 'Reading…', className: 'bg-blue-100 text-blue-700' },
    completed: { label: 'Done', className: 'bg-green-100 text-green-700' },
    failed: { label: 'Failed', className: 'bg-red-100 text-red-700' }
};

const isImageFile = (name) => /\.(png|jpe?g)$/i.test(name || '');

export default function MenuImportBatchModal({ open, onClose, onSuccess }) {
    const [step, setStep] = useState(1);
    const [selectedFiles, setSelectedFiles] = useState([]);
    const [editableRows, setEditableRows] = useState([]);
    const [importResult, setImportResult] = useState(null);
    const [capturing, setCapturing] = useState(false);
    // Defaults ON, unlike generate_image: marking an item Always Available
    // costs nothing, and without it every batch-imported item lands out of
    // stock and unsellable until someone opens it and flips the toggle by
    // hand, one item at a time — the path of least resistance should be the
    // fix, not the problem.
    const [markAlwaysAvailable, setMarkAlwaysAvailable] = useState(true);
    const fileInputRef = useRef(null);

    const {
        phase,
        job,
        previewData,
        error,
        progress,
        startJob,
        confirmImport,
        reset
    } = useMenuImportJob();

    const { canEdit } = usePermission();
    // Generating an image is an edit to the item, not an import action — an
    // importer without items:edit gets the checkbox disabled up front rather
    // than a silent skip discovered only after confirming (see #176).
    const canGenerateImages = canEdit('items');

    const merge = previewData?.merge;
    const jobFiles = job?.files || [];
    const failedFiles = jobFiles.filter((file) => file.status === 'failed');
    const truncatedFiles = jobFiles.filter((file) => file.truncated);
    const includedCount = editableRows.filter((row) => row.included).length;
    const imageCount = editableRows.filter((row) => row.included && row.generate_image).length;
    const conflictCount = merge?.conflicts?.length || 0;

    const isProcessing = phase === 'uploading' || phase === 'processing' || phase === 'previewing';
    const isConfirming = phase === 'confirming';

    const navigatorSteps = useMemo(() => BATCH_IMPORT_STEPS.map((entry) => {
        if (entry.number === 2) {
            return { ...entry, disabled: !previewData, disabledReason: 'Extract your menu files before reviewing items.' };
        }
        if (entry.number === 3) {
            return { ...entry, disabled: !importResult, disabledReason: 'Confirm the import before opening results.' };
        }
        return entry;
    }), [previewData, importResult]);

    // Not memoized on purpose: `reset` comes from the hook and is recreated
    // each render, so a useCallback here would only ever capture a stale one.
    const clearWizard = () => {
        setStep(1);
        setSelectedFiles([]);
        setEditableRows([]);
        setImportResult(null);
        setCapturing(false);
        setMarkAlwaysAvailable(true);
        reset();
    };

    const handleClose = () => {
        clearWizard();
        onClose();
    };

    const addFiles = useCallback((incoming) => {
        const candidates = Array.from(incoming || []);
        if (candidates.length === 0) return;

        const accepted = candidates.filter((file) => MENU_IMPORT_ACCEPTED_FILE_PATTERN.test(file.name));
        if (accepted.length < candidates.length) {
            toast.error('Only PDF, PNG, and JPG files can be imported');
        }
        if (accepted.length === 0) return;

        setSelectedFiles((current) => {
            // De-duplicate an accidental re-pick of the same file (the picker
            // has no memory of what's already staged).
            const seen = new Set(current.map((file) => `${file.name}:${file.size}`));
            const additions = accepted.filter((file) => !seen.has(`${file.name}:${file.size}`));
            const next = [...current, ...additions];
            if (next.length > MENU_IMPORT_MAX_FILES_HINT) {
                toast.error(`You can import at most ${MENU_IMPORT_MAX_FILES_HINT} files at a time`);
                return next.slice(0, MENU_IMPORT_MAX_FILES_HINT);
            }
            return next;
        });
    }, []);

    const handleFileSelect = useCallback((event) => {
        addFiles(event.target.files);
        // Reset the input so re-picking the same file after removing it still fires onChange.
        event.target.value = '';
    }, [addFiles]);

    const handleDrop = useCallback((event) => {
        event.preventDefault();
        addFiles(event.dataTransfer?.files);
    }, [addFiles]);

    const handleDragOver = useCallback((event) => {
        event.preventDefault();
    }, []);

    const removeFile = (index) => {
        setSelectedFiles((current) => current.filter((_, i) => i !== index));
    };

    // Captured frames are ordinary JPEG Files, so they join the same staged
    // list the picker and drop zone feed — nothing downstream distinguishes
    // a photo taken here from one picked off the device.
    const handleCaptured = (files) => {
        addFiles(files);
        setCapturing(false);
    };

    const handleCaptureFallbackToPicker = () => {
        setCapturing(false);
        fileInputRef.current?.click();
    };

    const handleExtract = async () => {
        if (selectedFiles.length === 0) {
            toast.error('Add at least one PDF or photo first');
            return;
        }
        // The review step opens from the hook's onReady callback rather than an
        // effect watching `phase` — the merged preview lands inside the poll
        // continuation, long after this handler has returned.
        const result = await startJob(selectedFiles, {
            onReady: (preview) => {
                setEditableRows(toEditableRows(preview.rows));
                setStep(2);
            }
        });
        if (!result.success && result.error) {
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

        const result = await confirmImport(includedRows, { markAlwaysAvailable });
        if (result.success) {
            setImportResult(result.data);
            setStep(3);
            toast.success(`Import complete: ${result.data.createdCount} created`);
        } else if (result.error) {
            toast.error(result.error);
        }
    };

    const handleStartOver = () => {
        clearWizard();
    };

    const handleDone = () => {
        handleClose();
        if (onSuccess) onSuccess();
    };

    // Per-file status comes back in upload order (the server preserves
    // file_order), so a staged file lines up with the job file at the same
    // index until the first poll replaces the placeholder list.
    const fileRows = selectedFiles.map((file, index) => ({
        name: file.name,
        size: file.size,
        status: jobFiles[index]?.status || (isProcessing ? 'queued' : null),
        errorMessage: jobFiles[index]?.error_message || null,
        kind: jobFiles[index]?.kind || null,
        itemCount: jobFiles[index]?.item_count ?? null,
        truncated: Boolean(jobFiles[index]?.truncated),
        pages: jobFiles[index]?.pages ?? null,
        pagesTotal: jobFiles[index]?.pages_total ?? null
    }));

    const renderUploadStep = () => (
        <div className="csv-import-step-content">
            {/* Lives outside the drop zone so the capture sheet's
                "add photos from device" fallback can still reach it. */}
            <input
                ref={fileInputRef}
                type="file"
                multiple
                accept={MENU_IMPORT_FILE_ACCEPT_ATTRIBUTE}
                onChange={handleFileSelect}
                className="hidden"
            />

            {capturing && !isProcessing && (
                <MenuPhotoCaptureSheet
                    onAddFiles={handleCaptured}
                    onCancel={() => setCapturing(false)}
                    onUseFilePicker={handleCaptureFallbackToPicker}
                    remainingSlots={MENU_IMPORT_MAX_FILES_HINT - selectedFiles.length}
                />
            )}

            {!isProcessing && !capturing && (
                <div
                    className="csv-import-upload-dropzone rounded-xl border border-dashed border-[#8DB4DE] bg-[#F5F8FC] p-2.5 text-center transition-colors hover:bg-[#EEF5FF]"
                    onDrop={handleDrop}
                    onDragOver={handleDragOver}
                >
                    <div className="mx-auto grid h-7 w-7 place-items-center rounded-lg bg-[#EEF5FF] text-[#1A4E8D]">
                        <Upload className="h-4 w-4" />
                    </div>
                    <p className="mt-1.5 text-[10px] font-bold text-slate-700">
                        Drag and drop menu PDFs or photos here, or
                    </p>
                    <button
                        type="button"
                        onClick={() => fileInputRef.current?.click()}
                        className="text-[10px] font-bold text-[#1A4E8D] underline decoration-[#8DB4DE] underline-offset-2 hover:text-[#143F73]"
                    >
                        browse to select
                    </button>
                    {/* Always offered, even where the camera turns out to be
                        unreachable (no webcam, blocked permission, or a POS
                        served over plain HTTP where mediaDevices does not
                        exist at all). A silently missing button reads as a
                        missing feature; the sheet says which of those it is
                        and hands the operator back to the file picker. */}
                    <div className="mt-4">
                        <Button
                            type="button"
                            variant="outline"
                            onClick={() => setCapturing(true)}
                            disabled={selectedFiles.length >= MENU_IMPORT_MAX_FILES_HINT}
                            className="mt-2 h-8 rounded-lg border-[#1A4E8D] px-2 text-[10px] font-bold text-[#1A4E8D] hover:bg-blue-50"
                        >
                            <Camera className="mr-1.5 h-3.5 w-3.5" />
                            Take Photos
                        </Button>
                    </div>
                    <p className="mt-1.5 text-[8px] leading-3 text-slate-500">
                        Up to {MENU_IMPORT_MAX_FILES_HINT} files per import — PDF, PNG, or JPG.
                    </p>
                </div>
            )}

            {isProcessing && (
                <div className="rounded-lg border border-[#C7DCF3] bg-[#EEF5FF] p-2.5">
                    <div className="flex items-center gap-2 text-[#1A4E8D]">
                        <Loader2 className="h-3.5 w-3.5 animate-spin" />
                        <p className="text-[10px] font-bold">
                            {phase === 'uploading' && 'Uploading your files…'}
                            {phase === 'processing' && `Reading your menus — ${progress.settled} of ${progress.total} file(s) done`}
                            {phase === 'previewing' && 'Merging items from every file…'}
                        </p>
                    </div>
                    <Progress value={phase === 'previewing' ? 100 : progress.percent} className="mt-2 h-1.5" />
                    <p className="mt-1.5 text-[9px] leading-3 text-[#1A4E8D]">
                        This can take a few minutes for a large batch. Keep this window open.
                    </p>
                </div>
            )}

            {fileRows.length > 0 && (
                <div className="csv-import-file-list max-h-40 overflow-y-auto rounded-lg border border-slate-200 divide-y divide-slate-100 pos-items-modal-scrollbar">
                    {fileRows.map((file, index) => {
                        const badge = file.status ? FILE_STATUS_BADGES[file.status] : null;
                        return (
                            <div key={`${file.name}-${index}`} className="flex min-w-0 items-center gap-2 p-2">
                                {isImageFile(file.name)
                                    ? <ImageIcon className="h-3.5 w-3.5 shrink-0 text-slate-400" />
                                    : <FileText className="h-3.5 w-3.5 shrink-0 text-slate-400" />}
                                <div className="min-w-0 flex-1">
                                    <p className="truncate text-[10px] font-bold text-slate-700">{file.name}</p>
                                    <p className="text-[8px] leading-3 text-slate-500">
                                        {formatFileSize(file.size)}
                                        {file.itemCount !== null ? ` · ${file.itemCount} item(s)` : ''}
                                        {file.kind === 'pdf_rasterized' ? ' · scanned PDF' : ''}
                                    </p>
                                    {file.errorMessage && (
                                        <p className="text-[9px] leading-3 text-red-600">{file.errorMessage}</p>
                                    )}
                                    {file.truncated && (
                                        <p className="text-[9px] leading-3 text-amber-700">
                                            Only the first {file.pages} of {file.pagesTotal} page(s) were read.
                                        </p>
                                    )}
                                </div>
                                {badge && (
                                    <Badge className={`shrink-0 ${badge.className}`}>{badge.label}</Badge>
                                )}
                                {!isProcessing && !job && (
                                    <button
                                        type="button"
                                        onClick={() => removeFile(index)}
                                        className="h-7 w-7 text-slate-400 hover:text-red-600"
                                        aria-label={`Remove ${file.name}`}
                                    >
                                        <Trash2 className="w-4 h-4" />
                                    </button>
                                )}
                            </div>
                        );
                    })}
                </div>
            )}

            <div className="csv-import-warning flex gap-2 rounded-lg border border-amber-200 bg-amber-50 p-2 text-[9px]">
                <AlertCircle className="mt-0.5 h-3.5 w-3.5 shrink-0 text-amber-700" />
                <p className="leading-3.5 text-amber-800">
                    <span className="font-bold">Before you import: </span>
                    An AI model reads every file and extracts item names and prices. Items with the
                    same name across files are merged into one, and any price disagreement is
                    flagged for you on the next step — always review before confirming.
                </p>
            </div>
        </div>
    );

    const renderMergeSummary = () => {
        if (!merge) return null;
        return (
            <div className="rounded-lg border border-slate-200 bg-slate-50 p-2.5 text-[9px] leading-3 text-slate-700">
                <p>
                    Merged <span className="font-medium">{merge.items_before_dedup}</span> extracted item(s) from{' '}
                    <span className="font-medium">{merge.files_considered}</span> file(s) into{' '}
                    <span className="font-medium">{merge.items_after_dedup}</span> unique item(s).
                    {merge.files_excluded > 0 && (
                        <span className="text-red-700"> {merge.files_excluded} file(s) could not be read.</span>
                    )}
                </p>
            </div>
        );
    };

    // Categories come from the preview payload, but the row inputs above are
    // editable — so this reads the live rows rather than previewData.categories,
    // and stays accurate after the user retypes a category.
    const renderCategorySummary = () => {
        const counts = new Map();
        for (const row of editableRows) {
            if (!row.included) continue;
            const name = String(row.data?.product_folder || '').replace(/\s+/g, ' ').trim();
            if (!name) continue;
            const key = name.toLowerCase();
            counts.set(key, { name, count: (counts.get(key)?.count || 0) + 1 });
        }
        if (counts.size === 0) return null;
        const categories = [...counts.values()];
        return (
            <div className="rounded-lg border border-slate-200 bg-slate-50 p-2.5 text-[9px] leading-3 text-slate-700">
                <p className="flex items-center gap-2 font-bold">
                    <FolderTree className="h-3.5 w-3.5" />
                    {categories.length} categor{categories.length === 1 ? 'y' : 'ies'} will be applied
                </p>
                <p className="mt-1 text-slate-600">
                    {categories.map((category) => `${category.name} (${category.count})`).join(' · ')}
                </p>
                <p className="mt-1 text-[8px] leading-3 text-slate-500">
                    Categories that don’t exist yet are created on import — that needs admin access.
                    Edit any Category cell below to change where an item lands.
                </p>
            </div>
        );
    };

    const renderPreviewStep = () => (
        <div className="csv-import-step-content">
            <div className="csv-import-summary-grid grid grid-cols-2 gap-2 sm:grid-cols-3">
                <div className="rounded-lg bg-slate-50 p-2 text-center">
                    <p className="text-xl font-bold text-slate-700">{previewData?.totalRows || 0}</p>
                    <p className="text-[9px] leading-3 text-slate-500">Merged items</p>
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

            <div className="flex items-start gap-2 rounded-lg border border-slate-200 bg-slate-50 p-2.5">
                <input
                    type="checkbox"
                    id="mark-always-available"
                    checked={markAlwaysAvailable}
                    onChange={(e) => setMarkAlwaysAvailable(e.target.checked)}
                    className="mt-0.5"
                />
                <label htmlFor="mark-always-available" className="text-[9px] leading-3 text-slate-700">
                    <span className="font-bold text-slate-900">Mark all imported items as Always Available.</span>
                    {' '}Skips stock tracking so they&rsquo;re sellable in the POS right away, instead of landing
                    out of stock until you set each one individually.
                </label>
            </div>

            {renderMergeSummary()}
            {renderCategorySummary()}

            {conflictCount > 0 && (
                <div className="rounded-lg border border-amber-200 bg-amber-50 p-2.5 text-[9px] leading-3 text-amber-800">
                    <p className="flex items-center gap-2 font-bold">
                        <AlertTriangle className="h-3.5 w-3.5" />
                        {conflictCount} item(s) had different prices across files
                    </p>
                    <p className="mt-1 text-[9px] leading-3 text-amber-700">
                        We kept the first price we saw and marked those rows below — check each one
                        before importing.
                    </p>
                </div>
            )}

            {merge?.near_duplicates?.length > 0 && (
                <div className="rounded-lg border border-[#C7DCF3] bg-[#EEF5FF] p-2.5 text-[9px] leading-3 text-[#1A4E8D]">
                    <p className="flex items-center gap-2 font-bold">
                        <AlertCircle className="h-3.5 w-3.5" />
                        Possible duplicates — these were kept separate
                    </p>
                    <ul className="mt-1 space-y-0.5 text-[9px] leading-3 text-[#1A4E8D]">
                        {merge.near_duplicates.map((pair, index) => (
                            <li key={index}>
                                “{pair.name_a}” and “{pair.name_b}” at {formatPrice(pair.price)}
                            </li>
                        ))}
                    </ul>
                </div>
            )}

            {truncatedFiles.length > 0 && (
                <div className="rounded-lg border border-amber-200 bg-amber-50 p-2.5 text-[9px] leading-3 text-amber-800">
                    <p className="flex items-center gap-2 font-bold">
                        <Scissors className="h-3.5 w-3.5" />
                        Some files were only partly read
                    </p>
                    <ul className="mt-1 space-y-0.5 text-[9px] leading-3 text-amber-700">
                        {truncatedFiles.map((file) => (
                            <li key={file.file_id}>
                                {file.original_name} — first {file.pages} of {file.pages_total} page(s)
                            </li>
                        ))}
                    </ul>
                </div>
            )}

            {failedFiles.length > 0 && (
                <div className="rounded-lg border border-red-200 bg-red-50 p-2.5 text-[9px] leading-3 text-red-800">
                    <p className="flex items-center gap-2 font-bold">
                        <XCircle className="h-3.5 w-3.5" />
                        {failedFiles.length} file(s) could not be read
                    </p>
                    <ul className="mt-1 space-y-0.5 text-[9px] leading-3 text-red-700">
                        {failedFiles.map((file) => (
                            <li key={file.file_id}>
                                {file.original_name}{file.error_message ? ` — ${file.error_message}` : ''}
                            </li>
                        ))}
                    </ul>
                </div>
            )}

            <div className="csv-import-preview-panel overflow-hidden rounded-lg border border-slate-200 bg-white">
                <div className="flex items-center justify-between gap-2 border-b border-slate-200 bg-slate-50/80 px-2.5 py-2">
                    <span className="truncate text-[9px] font-black uppercase tracking-wide text-slate-500">Extracted Items</span>
                    <span className="shrink-0 rounded bg-slate-200 px-1.5 py-0.5 text-[8px] font-bold text-slate-600">
                        {editableRows.length} Records
                    </span>
                </div>
                <div className="csv-import-preview-table-scroll max-h-[13rem] overflow-auto pos-items-modal-scrollbar" data-testid="menu-import-batch-preview-table-scroll">
                <table className="csv-import-preview-table w-full min-w-[44rem] table-fixed text-[10px]">
                    <thead className="sticky top-0 bg-white">
                        <tr>
                            <th className="p-1.5 text-left text-[8px] font-black uppercase tracking-wide text-slate-500">Import</th>
                            <th className="p-1.5 text-left text-[8px] font-black uppercase tracking-wide text-slate-500">
                                <span className="inline-flex items-center gap-1">
                                    <ImageIcon className="w-3.5 h-3.5" />
                                    Image
                                </span>
                            </th>
                            <th className="p-1.5 text-left text-[8px] font-black uppercase tracking-wide text-slate-500">Name</th>
                            <th className="p-1.5 text-left text-[8px] font-black uppercase tracking-wide text-slate-500">Price (₱)</th>
                            <th className="p-1.5 text-left text-[8px] font-black uppercase tracking-wide text-slate-500">Category</th>
                            <th className="p-1.5 text-left text-[8px] font-black uppercase tracking-wide text-slate-500">Status</th>
                        </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                        {editableRows.map((row) => (
                            <tr
                                key={row.rowNumber}
                                className={cn(
                                    !row.valid && !row.included && 'bg-red-50/60',
                                    row.price_conflict && 'bg-amber-50/60'
                                )}
                            >
                                <td className="p-1.5">
                                    <input
                                        type="checkbox"
                                        checked={row.included}
                                        onChange={(e) => updateRow(row.rowNumber, { included: e.target.checked })}
                                        aria-label={`Import ${row.data?.name || 'row ' + row.rowNumber}`}
                                    />
                                </td>
                                <td className="p-1.5">
                                    <input
                                        type="checkbox"
                                        checked={row.generate_image}
                                        disabled={!canGenerateImages || !row.included}
                                        onChange={(e) => updateRow(row.rowNumber, { generate_image: e.target.checked })}
                                        aria-label={`Generate an AI image for ${row.data?.name || 'row ' + row.rowNumber}`}
                                        title={
                                            !canGenerateImages
                                                ? 'You need the Edit Items permission to generate AI images.'
                                                : !row.included
                                                    ? 'Only imported rows can get a generated image.'
                                                    : `Generate an AI image for this item (~$${APPROX_ITEM_IMAGE_COST_USD.toFixed(2)}, watermarked).`
                                        }
                                    />
                                </td>
                                <td className="p-1.5">
                                    <Input
                                        value={row.data?.name || ''}
                                        onChange={(e) => updateRowField(row.rowNumber, 'name', e.target.value)}
                                        className="h-8 text-[10px]"
                                    />
                                </td>
                                <td className="p-1.5">
                                    <Input
                                        type="number"
                                        step="0.01"
                                        min="0"
                                        value={row.data?.default_sale_price ?? ''}
                                        onChange={(e) => updateRowField(row.rowNumber, 'default_sale_price', e.target.value)}
                                        className="h-8 w-28 text-[10px]"
                                    />
                                    {row.price_conflict && (
                                        <p className="mt-1 text-xs text-amber-700">
                                            Also seen at {row.observed_prices?.map(formatPrice).join(', ')}
                                        </p>
                                    )}
                                </td>
                                <td className="p-1.5">
                                    <Input
                                        value={row.data?.product_folder || ''}
                                        onChange={(e) => updateRowField(row.rowNumber, 'product_folder', e.target.value)}
                                        className="h-8 text-[10px]"
                                    />
                                    {row.category_inferred && (
                                        <p className="mt-1 text-xs text-blue-700">Guessed — not printed on the menu</p>
                                    )}
                                </td>
                                <td className="p-1.5">
                                    <div className="space-y-1">
                                        {row.valid ? (
                                            <Badge className="bg-[#EEF5FF] text-[#1A4E8D] hover:bg-[#EEF5FF]">
                                                <CheckCircle2 className="mr-1 h-2.5 w-2.5" />
                                                Extracted
                                            </Badge>
                                        ) : (
                                            <>
                                                <Badge className="bg-red-100 text-red-700 hover:bg-red-100">
                                                    <XCircle className="mr-1 h-2.5 w-2.5" />
                                                    Check row
                                                </Badge>
                                                {row.errors?.map((err, i) => (
                                                    <p key={i} className="text-[9px] leading-3 text-red-600">{err}</p>
                                                ))}
                                            </>
                                        )}
                                        {row.price_conflict && (
                                            <Badge className="bg-amber-100 text-amber-800 hover:bg-amber-100">
                                                <AlertTriangle className="mr-1 h-2.5 w-2.5" />
                                                Price conflict
                                            </Badge>
                                        )}
                                    </div>
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

            {importResult?.categories_created?.length > 0 && (
                <div className="mx-auto max-w-[24rem] rounded-lg border border-slate-200 bg-slate-50 p-2.5 text-left text-[9px] text-slate-700">
                    <p className="mb-1 font-bold">
                        {importResult.categories_created.length} new categor
                        {importResult.categories_created.length === 1 ? 'y' : 'ies'} created
                    </p>
                    <p className="text-[9px] leading-3 text-slate-600">{importResult.categories_created.join(', ')}</p>
                </div>
            )}

            {importResult?.categories_skipped?.length > 0 && (
                <div className="mx-auto max-w-[24rem] rounded-lg border border-amber-200 bg-amber-50 p-2.5 text-left text-[9px] text-amber-800">
                    <p className="mb-1 flex items-center gap-2 font-bold">
                        <AlertTriangle className="h-3.5 w-3.5" />
                        {importResult.categories_skipped.length} categor
                        {importResult.categories_skipped.length === 1 ? 'y' : 'ies'} not created
                    </p>
                    <p className="text-[9px] leading-3 text-amber-700">
                        {importResult.categories_skipped.join(', ')} — creating a category needs admin
                        access. These items imported with the category name saved, but won’t appear
                        under it in the POS until an admin creates it.
                    </p>
                </div>
            )}

            {importResult?.always_available_marked_count > 0 && (
                <div className="mx-auto max-w-[24rem] rounded-lg border border-[#C7DCF3] bg-[#EEF5FF] p-2.5 text-left text-[9px] text-[#1A4E8D]">
                    <p className="font-bold">
                        {importResult.always_available_marked_count} item{importResult.always_available_marked_count === 1 ? '' : 's'} marked Always Available — ready to sell in the POS now.
                    </p>
                </div>
            )}

            {importResult?.images_queued > 0 && (
                <div className="mx-auto max-w-[24rem] rounded-lg border border-[#C7DCF3] bg-[#EEF5FF] p-2.5 text-left text-[9px] text-[#1A4E8D]">
                    <p className="mb-1 flex items-center gap-2 font-bold">
                        <ImageIcon className="h-3.5 w-3.5" />
                        {importResult.images_queued} image{importResult.images_queued === 1 ? '' : 's'} queued for AI generation
                    </p>
                    <p className="text-[9px] leading-3 text-[#1A4E8D]">
                        Generation happens in the background — check back on these items shortly.
                    </p>
                </div>
            )}

            {importResult?.images_skipped?.length > 0 && (
                <div className="mx-auto max-w-[24rem] rounded-lg border border-amber-200 bg-amber-50 p-2.5 text-left text-[9px] text-amber-800">
                    <p className="mb-1 flex items-center gap-2 font-bold">
                        <AlertTriangle className="h-3.5 w-3.5" />
                        {importResult.images_skipped.length} requested image{importResult.images_skipped.length === 1 ? '' : 's'} not queued
                    </p>
                    <p className="text-[9px] leading-3 text-amber-700">
                        {IMAGE_SKIP_REASON_SUMMARY(importResult.images_skipped)}
                    </p>
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
                                Import Menu from PDFs or Photos
                            </DialogTitle>
                            <p className="mt-0.5 truncate text-[9px] text-blue-100">{BATCH_IMPORT_STEPS[step - 1]?.description || BATCH_IMPORT_STEPS[0].description}</p>
                        </div>
                    </div>
                    <button
                        type="button"
                        onClick={handleClose}
                        aria-label="Close batch menu import"
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
                    ariaLabel="Batch menu import steps"
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
                            <Button variant="outline" onClick={handleClose} disabled={isProcessing} className="h-10 w-full rounded-lg border-[#1A4E8D] px-3 text-[10px] font-bold text-[#1A4E8D] hover:bg-blue-50">
                                Cancel
                            </Button>
                            {phase === 'error' ? (
                                <Button onClick={handleStartOver} className="h-10 w-full rounded-lg bg-[#1A4E8D] px-3 text-[10px] font-bold text-white hover:bg-[#143F73]">
                                    <RefreshCw className="w-4 h-4 mr-2" />
                                    Start Over
                                </Button>
                            ) : (
                                <Button
                                    onClick={handleExtract}
                                    disabled={selectedFiles.length === 0 || isProcessing || capturing}
                                    className="h-10 w-full rounded-lg bg-[#1A4E8D] px-3 text-[10px] font-bold text-white hover:bg-[#143F73]"
                                >
                                    {isProcessing ? (
                                        <><Loader2 className="w-4 h-4 mr-2 animate-spin" /> Extracting...</>
                                    ) : (
                                        <><ArrowRight className="w-4 h-4 mr-2" /> Extract Items ({selectedFiles.length})</>
                                    )}
                                </Button>
                            )}
                        </>
                    )}

                    {step === 2 && (
                        <div className="col-span-2 flex min-w-0 flex-1 items-center justify-between gap-2">
                            {imageCount > 0 ? (
                                <p className="flex items-center gap-1 text-[9px] text-slate-500">
                                    <ImageIcon className="w-3.5 h-3.5" />
                                    {imageCount} image{imageCount === 1 ? '' : 's'} × ~${APPROX_ITEM_IMAGE_COST_USD.toFixed(2)}
                                    {' '}≈ ${(imageCount * APPROX_ITEM_IMAGE_COST_USD).toFixed(2)} estimated
                                </p>
                            ) : <span />}
                            <div className="flex gap-2">
                                <Button variant="outline" onClick={handleStartOver} disabled={isConfirming} className="h-10 rounded-lg border-[#1A4E8D] px-3 text-[10px] font-bold text-[#1A4E8D] hover:bg-blue-50">
                                    <ArrowLeft className="w-4 h-4 mr-2" />
                                    Start Over
                                </Button>
                                <Button
                                    onClick={handleConfirm}
                                    disabled={isConfirming || includedCount === 0}
                                    className="h-10 rounded-lg bg-[#1A4E8D] px-3 text-[10px] font-bold text-white hover:bg-[#143F73]"
                                >
                                    {isConfirming ? (
                                        <><Loader2 className="w-4 h-4 mr-2 animate-spin" /> Importing...</>
                                    ) : (
                                        <><CheckCircle2 className="w-4 h-4 mr-2" /> Confirm Import ({includedCount} items)</>
                                    )}
                                </Button>
                            </div>
                        </div>
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
