import React, { useCallback, useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Camera, Loader2, ScanLine, X } from 'lucide-react';
import { Button } from '@/components/ui/button';

const getCameraStartupError = (error) => {
  if (error?.name === 'NotAllowedError') {
    return 'Camera access was blocked. Allow camera access in your browser site settings, then try again or enter the barcode manually.';
  }
  if (error?.name === 'NotFoundError' || error?.name === 'DevicesNotFoundError') {
    return 'No camera was found. Connect a camera or enter the barcode manually.';
  }
  if (error?.name === 'NotReadableError' || error?.name === 'TrackStartError') {
    return 'The camera is already in use by another app. Close it and try again.';
  }
  return 'The camera could not start. Enter the barcode manually or try again.';
};

export default function ProductQrScannerModal({ open, onOpenChange, onDetected }) {
  const videoRef = useRef(null);
  const controlsRef = useRef(null);
  const detectedRef = useRef(false);
  const onDetectedRef = useRef(onDetected);
  const closeButtonRef = useRef(null);
  const [cameraRequested, setCameraRequested] = useState(false);
  const [starting, setStarting] = useState(false);
  const [scanError, setScanError] = useState('');
  const cameraAvailable = typeof window !== 'undefined'
    && window.isSecureContext
    && Boolean(navigator.mediaDevices?.getUserMedia);

  useEffect(() => {
    onDetectedRef.current = onDetected;
  }, [onDetected]);

  useEffect(() => {
    if (!open) return undefined;
    const previouslyFocusedElement = document.activeElement;
    const handleKeyDown = (event) => {
      if (event.key === 'Escape') onOpenChange(false);
    };

    document.addEventListener('keydown', handleKeyDown);
    window.requestAnimationFrame(() => closeButtonRef.current?.focus());
    return () => {
      document.removeEventListener('keydown', handleKeyDown);
      previouslyFocusedElement?.focus?.();
    };
  }, [onOpenChange, open]);

  useEffect(() => {
    if (!open) return undefined;

    setCameraRequested(false);
    setStarting(false);
    setScanError(cameraAvailable
      ? ''
      : 'Camera scanning requires HTTPS. Use a secure POS URL or enter the barcode manually.');
    detectedRef.current = false;

    return undefined;
  }, [cameraAvailable, open]);

  const stopCamera = useCallback(() => {
    controlsRef.current?.stop?.();
    controlsRef.current = null;
    const stream = videoRef.current?.srcObject;
    if (stream && typeof stream.getTracks === 'function') {
      stream.getTracks().forEach((track) => track.stop());
    }
    if (videoRef.current) videoRef.current.srcObject = null;
  }, []);

  useEffect(() => {
    if (!open || !cameraRequested) return undefined;

    let cancelled = false;
    detectedRef.current = false;
    setScanError('');
    setStarting(true);

    const startCamera = async () => {
      if (!window.isSecureContext || !navigator.mediaDevices?.getUserMedia) {
        setStarting(false);
        setScanError('Camera scanning requires HTTPS. Use a secure POS URL or enter the barcode manually.');
        setCameraRequested(false);
        return;
      }

      try {
        const [
          { BrowserMultiFormatOneDReader },
          { BarcodeFormat, DecodeHintType }
        ] = await Promise.all([
          import('@zxing/browser'),
          import('@zxing/library')
        ]);
        if (cancelled) return;

        const hints = new Map();
        hints.set(DecodeHintType.POSSIBLE_FORMATS, [
          BarcodeFormat.EAN_8,
          BarcodeFormat.EAN_13,
          BarcodeFormat.UPC_A,
          BarcodeFormat.UPC_E,
          BarcodeFormat.ITF,
          BarcodeFormat.CODE_128,
          BarcodeFormat.CODE_39
        ]);
        const reader = new BrowserMultiFormatOneDReader(hints, { delayBetweenScanAttempts: 150 });
        const controls = await reader.decodeFromConstraints(
          {
            audio: false,
            video: {
              facingMode: { ideal: 'environment' },
              width: { ideal: 1280 },
              height: { ideal: 720 }
            }
          },
          videoRef.current,
          (result, _error, activeControls) => {
            if (!result || detectedRef.current) return;

            const code = String(result.getText() || '').trim();
            if (!code) return;

            detectedRef.current = true;
            activeControls.stop();
            controlsRef.current = null;
            stopCamera();
            setStarting(false);
            setCameraRequested(false);
            onDetectedRef.current(code);
          }
        );

        if (cancelled) {
          controls.stop();
          return;
        }
        controlsRef.current = controls;
        setStarting(false);
      } catch (error) {
        if (cancelled) return;
        stopCamera();
        setStarting(false);
        setScanError(getCameraStartupError(error));
        setCameraRequested(false);
      }
    };

    startCamera();
    return () => {
      cancelled = true;
      stopCamera();
      setStarting(false);
    };
  }, [cameraRequested, open, stopCamera]);

  if (!open || typeof document === 'undefined') return null;

  return createPortal((
    <div
      className="pos-mobile-no-focus-zoom fixed inset-0 z-[10050] flex items-center justify-center bg-slate-950/70 p-4 backdrop-blur-sm"
      role="dialog"
      aria-modal="true"
      aria-labelledby="product-barcode-scanner-title"
      onClick={() => onOpenChange(false)}
    >
      <div
        className="pos-items-modal-panel pos-items-modal-panel--auto relative flex w-full max-w-xl flex-col overflow-hidden rounded-2xl bg-white shadow-2xl"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="shrink-0 border-b border-slate-200 p-6 pr-16">
          <h2 id="product-barcode-scanner-title" className="flex items-center gap-2 text-xl font-bold text-slate-900">
            <ScanLine className="h-5 w-5 text-blue-700" aria-hidden="true" />
            Scan Product Barcode
          </h2>
          <p className="mt-2 text-sm text-slate-500">
            Point the rear camera at a UPC, EAN, ITF, Code 128, or Code 39 product barcode. QR codes are not accepted.
          </p>
          <button
            ref={closeButtonRef}
            type="button"
            onClick={() => onOpenChange(false)}
            className="absolute right-5 top-5 rounded-full border border-slate-200 bg-white p-2 text-slate-600 hover:bg-slate-50"
            aria-label="Close product barcode scanner"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="pos-items-modal-scroll-region flex-1 space-y-3 px-5 py-4 sm:px-6">
          <div className="relative aspect-[4/3] overflow-hidden rounded-xl bg-slate-950">
            <video
              ref={videoRef}
              className="h-full w-full object-cover"
              muted
              autoPlay
              playsInline
              aria-label="Product barcode camera preview"
            />
            <div className="pointer-events-none absolute inset-[14%] rounded-2xl border-2 border-white/90 shadow-[0_0_0_999px_rgba(15,23,42,0.38)]" />
            {!cameraRequested && !starting ? (
              <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 bg-slate-950/80 px-6 text-center text-white">
                <Camera className="h-9 w-9" aria-hidden="true" />
                <div>
                  <p className="text-sm font-semibold">
                    {cameraAvailable ? 'Camera access is required to scan.' : 'Camera access is unavailable on this URL.'}
                  </p>
                  <p className="mt-1 text-xs text-slate-300">
                    {cameraAvailable
                      ? 'Press Scan below to request camera access.'
                      : 'Open the POS through a trusted HTTPS address to use the camera.'}
                  </p>
                </div>
              </div>
            ) : null}
            {starting ? (
              <div className="absolute inset-0 flex items-center justify-center gap-2 bg-slate-950/70 text-sm font-semibold text-white">
                <Loader2 className="h-5 w-5 animate-spin" aria-hidden="true" />
                Starting camera...
              </div>
            ) : null}
          </div>

          {scanError ? (
            <p className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-900" role="status">
              {scanError}
            </p>
          ) : (
            <p className="flex items-center gap-2 text-sm text-slate-600" role="status">
              <Camera className="h-4 w-4" aria-hidden="true" />
              {cameraRequested
                ? 'Hold the barcode steady inside the frame. Valid GTINs are looked up; private codes can be saved as internal POS barcodes.'
                : 'Camera access begins only after you press Scan.'}
            </p>
          )}
        </div>

        <div className="pos-items-modal-footer flex shrink-0 justify-end gap-3 border-t border-slate-200 px-4 pt-4">
          <Button
            type="button"
            onClick={() => {
              setScanError('');
              setCameraRequested(true);
            }}
            disabled={!cameraAvailable || cameraRequested || starting}
            className="min-h-11 bg-blue-600 text-white hover:bg-blue-700"
          >
            {starting ? (
              <Loader2 className="mr-2 h-4 w-4 animate-spin" aria-hidden="true" />
            ) : (
              <ScanLine className="mr-2 h-4 w-4" aria-hidden="true" />
            )}
            {starting ? 'Starting...' : cameraRequested ? 'Scanning...' : 'Scan'}
          </Button>
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
            Enter manually
          </Button>
        </div>
      </div>
    </div>
  ), document.body);
}
