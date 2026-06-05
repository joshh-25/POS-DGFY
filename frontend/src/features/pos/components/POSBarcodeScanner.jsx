import React, { useCallback, useEffect, useRef, useState } from 'react';
import { ScanLine, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { toast } from 'sonner';
import { scanPosBarcode } from '../services/posService';

export default function POSBarcodeScanner({
    sessionLocked = false,
    selectedLocationId = null,
    terminalId = '',
    onAddToCart = null
}) {
    const [scannerCode, setScannerCode] = useState('');
    const [scannerStatus, setScannerStatus] = useState(null);
    const [scannerLoading, setScannerLoading] = useState(false);
    const [scannerModalOpen, setScannerModalOpen] = useState(false);
    const scannerBufferRef = useRef('');
    const scannerBufferTimerRef = useRef(null);

    const submitScan = useCallback(async (submittedCode) => {
        const code = String(submittedCode || '').trim();
        if (!code) {
            setScannerStatus({ tone: 'blocked', message: 'Scan or type a barcode first.' });
            return false;
        }
        setScannerLoading(true);
        setScannerStatus(null);
        try {
            const result = await scanPosBarcode({
                code,
                location_id: selectedLocationId || undefined,
                terminal_id: String(terminalId || '').trim() || undefined
            });
            if (result?.status === 'routed') {
                const message = result?.message || 'Scan recognized and routed outside the POS cart.';
                setScannerCode('');
                setScannerStatus({ tone: 'info', message });
                toast.info(message);
                setScannerModalOpen(false);
                return true;
            }
            if (result?.status !== 'resolved') {
                const message = result?.message || result?.reason_code || 'Scan blocked';
                setScannerStatus({ tone: 'blocked', message });
                toast.error(message);
                return false;
            }
            const suggested = result.suggested_line || {};
            onAddToCart?.(result.item, {
                quantity: Number(suggested.quantity || 1),
                scanMetadata: suggested.scan_metadata || null
            });
            setScannerCode('');
            setScannerStatus({ tone: 'resolved', message: `${result.item?.name || 'Item'} added from scan` });
            toast.success(`${result.item?.name || 'Item'} added`);
            setScannerModalOpen(false);
            return true;
        } catch (error) {
            const message = error?.response?.data?.message || 'Barcode scan failed';
            setScannerStatus({ tone: 'blocked', message });
            toast.error(message);
            return false;
        } finally {
            setScannerLoading(false);
        }
    }, [onAddToCart, selectedLocationId, terminalId]);

    const handleSubmit = (event) => {
        event.preventDefault();
        submitScan(scannerCode);
    };

    const openScannerModal = () => {
        if (sessionLocked) return;
        scannerBufferRef.current = '';
        setScannerCode('');
        setScannerStatus(null);
        setScannerModalOpen(true);
    };

    const closeScannerModal = useCallback(() => {
        if (scannerLoading) return;
        scannerBufferRef.current = '';
        setScannerModalOpen(false);
        setScannerCode('');
    }, [scannerLoading]);

    useEffect(() => {
        if (!scannerModalOpen || sessionLocked || scannerLoading) return undefined;
        const handleScannerKeyDown = (event) => {
            if (event.defaultPrevented || event.ctrlKey || event.metaKey || event.altKey) return;
            const target = event.target;
            const tagName = String(target?.tagName || '').toLowerCase();
            const isEditableTarget = tagName === 'input'
                || tagName === 'textarea'
                || tagName === 'select'
                || target?.isContentEditable;
            if (isEditableTarget) return;

            if (event.key === 'Enter') {
                const bufferedCode = scannerBufferRef.current.trim();
                if (!bufferedCode) return;
                event.preventDefault();
                scannerBufferRef.current = '';
                if (scannerBufferTimerRef.current) {
                    window.clearTimeout(scannerBufferTimerRef.current);
                    scannerBufferTimerRef.current = null;
                }
                setScannerCode(bufferedCode);
                return;
            }

            if (event.key.length !== 1) return;
            const nextCode = `${scannerBufferRef.current}${event.key}`;
            scannerBufferRef.current = nextCode;
            setScannerCode(nextCode);
            if (scannerBufferTimerRef.current) {
                window.clearTimeout(scannerBufferTimerRef.current);
            }
            scannerBufferTimerRef.current = window.setTimeout(() => {
                scannerBufferRef.current = '';
                setScannerCode('');
            }, 250);
        };

        window.addEventListener('keydown', handleScannerKeyDown);
        return () => {
            window.removeEventListener('keydown', handleScannerKeyDown);
            if (scannerBufferTimerRef.current) {
                window.clearTimeout(scannerBufferTimerRef.current);
                scannerBufferTimerRef.current = null;
            }
        };
    }, [scannerLoading, scannerModalOpen, sessionLocked, submitScan]);

    useEffect(() => {
        if (!scannerModalOpen) return undefined;
        const handleKeyDown = (event) => {
            if (event.key === 'Escape') {
                closeScannerModal();
            }
        };
        window.addEventListener('keydown', handleKeyDown);
        return () => window.removeEventListener('keydown', handleKeyDown);
    }, [closeScannerModal, scannerModalOpen]);

    return (
        <div data-pos-barcode-scan-form="true" className="contents">
            <Button
                type="button"
                disabled={sessionLocked || scannerLoading}
                onClick={openScannerModal}
                className="flex h-11 shrink-0 items-center justify-center gap-3 rounded-lg border border-slate-300 bg-white px-5 text-[13px] font-extrabold text-[#0F172A] shadow-sm transition hover:border-slate-400 hover:bg-white disabled:opacity-50"
            >
                <ScanLine size={20} />
                {scannerLoading ? 'Resolving...' : 'Scan'}
            </Button>
            {scannerModalOpen && (
                <div className="fixed inset-0 z-[80] flex items-center justify-center bg-slate-950/45 px-4 py-6">
                    <form onSubmit={handleSubmit} className="w-full max-w-md rounded-xl border border-slate-200 bg-white p-4 shadow-xl shadow-slate-950/20">
                        <div className="flex items-start justify-between gap-3">
                            <div>
                                <h2 className="text-lg font-black text-[#0F172A]">Barcode</h2>
                                <p className="mt-1 text-sm text-[#64748B]">Scan the barcode, or encode it manually below.</p>
                            </div>
                            <button
                                type="button"
                                onClick={closeScannerModal}
                                disabled={scannerLoading}
                                className="grid h-9 w-9 place-items-center rounded-lg border border-slate-200 text-[#64748B] hover:bg-slate-50 disabled:opacity-50"
                                aria-label="Close barcode modal"
                            >
                                <X className="h-4 w-4" />
                            </button>
                        </div>

                        <div className="mt-4 rounded-lg border border-dashed border-blue-300 bg-blue-50 p-4 text-center">
                            <ScanLine className="mx-auto h-8 w-8 text-[#1A4E8D]" />
                            <p className="mt-2 text-sm font-extrabold text-[#0F172A]">Scan barcode</p>
                            <p className="mt-1 text-xs text-[#64748B]">Use your barcode scanner, then click Add.</p>
                            <div className="mt-3 min-h-11 rounded-lg border border-blue-200 bg-white px-3 py-2 text-sm font-semibold text-[#0F172A]">
                                {scannerCode || 'Waiting for barcode...'}
                            </div>
                        </div>

                        <label className="mt-4 block text-xs font-extrabold uppercase tracking-wide text-[#334155]">
                            Manual encode
                            <Input
                                value={scannerCode}
                                onChange={(event) => setScannerCode(event.target.value)}
                                placeholder="Enter barcode number"
                                autoComplete="off"
                                disabled={scannerLoading}
                                className="mt-2 h-11 text-sm"
                            />
                        </label>

                        {scannerStatus?.message && (
                            <p className={`mt-3 rounded-lg px-3 py-2 text-sm ${
                                scannerStatus.tone === 'resolved'
                                    ? 'border border-emerald-200 bg-emerald-50 text-emerald-800'
                                    : scannerStatus.tone === 'info'
                                        ? 'border border-sky-200 bg-sky-50 text-sky-800'
                                        : 'border border-amber-200 bg-amber-50 text-amber-800'
                            }`}>
                                {scannerStatus.message}
                            </p>
                        )}

                        <div className="mt-5 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
                            <Button
                                type="button"
                                variant="outline"
                                onClick={closeScannerModal}
                                disabled={scannerLoading}
                                className="h-11 rounded-lg"
                            >
                                Cancel
                            </Button>
                            <Button
                                type="submit"
                                disabled={scannerLoading || !scannerCode.trim()}
                                className="h-11 rounded-lg bg-[#1A4E8D] px-5 font-extrabold text-white hover:bg-[#143F73]"
                            >
                                {scannerLoading ? 'Adding...' : 'Add'}
                            </Button>
                        </div>
                    </form>
                </div>
            )}
        </div>
    );
}
