import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { posToast as toast } from '@/src/utils/iminRuntimeFeedback.js';
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
    const scannerBufferRef = useRef('');
    const scannerBufferTimerRef = useRef(null);

    const submitScan = useCallback(async (submittedCode) => {
        const code = String(submittedCode || '').trim();
        if (!code) {
            setScannerStatus({ tone: 'blocked', message: 'Scan or type a barcode first.' });
            return;
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
                return;
            }
            if (result?.status !== 'resolved') {
                const message = result?.message || result?.reason_code || 'Scan blocked';
                setScannerStatus({ tone: 'blocked', message });
                toast.error(message);
                return;
            }
            const suggested = result.suggested_line || {};
            onAddToCart?.(result.item, {
                quantity: Number(suggested.quantity || 1),
                scanMetadata: suggested.scan_metadata || null
            });
            setScannerCode('');
            setScannerStatus({ tone: 'resolved', message: `${result.item?.name || 'Item'} added from scan` });
            toast.success(`${result.item?.name || 'Item'} added`);
        } catch (error) {
            const message = error?.response?.data?.message || 'Barcode scan failed';
            setScannerStatus({ tone: 'blocked', message });
            toast.error(message);
        } finally {
            setScannerLoading(false);
        }
    }, [onAddToCart, selectedLocationId, terminalId]);

    const handleSubmit = (event) => {
        event.preventDefault();
        submitScan(scannerCode);
    };

    useEffect(() => {
        if (sessionLocked || scannerLoading) return undefined;
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
                setScannerCode(bufferedCode);
                submitScan(bufferedCode);
                return;
            }

            if (event.key.length !== 1) return;
            scannerBufferRef.current += event.key;
            if (scannerBufferTimerRef.current) {
                window.clearTimeout(scannerBufferTimerRef.current);
            }
            scannerBufferTimerRef.current = window.setTimeout(() => {
                scannerBufferRef.current = '';
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
    }, [scannerLoading, sessionLocked, submitScan]);

    return (
        <form data-pos-barcode-scan-form="true" onSubmit={handleSubmit} className="rounded-2xl border border-slate-200 bg-white p-3 shadow-sm">
            <div className="flex flex-col gap-2 md:flex-row md:items-center">
                <div className="flex-1">
                    <label className="text-xs font-semibold uppercase tracking-wide text-slate-500">Barcode scanner</label>
                    <Input
                        value={scannerCode}
                        onChange={(event) => setScannerCode(event.target.value)}
                        placeholder="Scan item, package, or service barcode"
                        autoComplete="off"
                        disabled={sessionLocked || scannerLoading}
                    />
                </div>
                <Button type="submit" disabled={sessionLocked || scannerLoading || !scannerCode.trim()} className="md:mt-5">
                    {scannerLoading ? 'Resolving...' : 'Scan'}
                </Button>
            </div>
            {scannerStatus?.message && (
                <p className={`mt-2 rounded-lg px-3 py-2 text-sm ${
                    scannerStatus.tone === 'resolved'
                        ? 'border border-emerald-200 bg-emerald-50 text-emerald-800'
                        : scannerStatus.tone === 'info'
                            ? 'border border-sky-200 bg-sky-50 text-sky-800'
                            : 'border border-amber-200 bg-amber-50 text-amber-800'
                }`}>
                    {scannerStatus.message}
                </p>
            )}
        </form>
    );
}
