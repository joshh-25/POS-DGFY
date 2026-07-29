import React, { useEffect, useRef, useState } from 'react';
import { Button } from "@/components/ui/button";
import {
    Camera,
    CameraOff,
    AlertTriangle,
    CheckCircle2,
    Loader2,
    Trash2,
    FolderOpen
} from 'lucide-react';
import { cn } from "../../src/lib/utils.js";
import { analyzeMenuPhotoQuality } from '../../src/utils/menuPhotoQuality.js';

/**
 * In-app menu photo capture, rendered inline inside the batch import wizard
 * (not as its own Dialog — a modal inside a modal fights focus management for
 * no benefit here).
 *
 * The quality check runs on the live preview *before* the shutter and again on
 * the captured frame, and it only ever warns: `analyzeMenuPhotoQuality` never
 * returns `blocking: true` and this component has no path that refuses a
 * capture. That is a product decision, not an oversight — see the header of
 * `src/utils/menuPhotoQuality.js`.
 *
 * Captured frames leave here as ordinary JPEG `File` objects, so everything
 * downstream (job creation, polling, merge review, confirm) treats them
 * exactly like files picked from disk.
 */

const SAMPLE_MAX_EDGE = 320;
const LIVE_SAMPLE_INTERVAL_MS = 700;
const CAPTURE_JPEG_QUALITY = 0.9;

const CAMERA_CONSTRAINTS = {
    video: {
        facingMode: { ideal: 'environment' },
        width: { ideal: 1920 },
        height: { ideal: 1080 }
    },
    audio: false
};

const STATUS_MESSAGES = {
    denied: 'Camera access was blocked. Allow camera permission for this site in your browser settings, or add photos from your device instead.',
    unsupported: 'This device or browser cannot open a camera here. Add photos from your device instead.',
    error: 'The camera could not be started. Add photos from your device instead.'
};

const errorStatusFor = (error) => {
    const name = error?.name || '';
    if (name === 'NotAllowedError' || name === 'SecurityError') return 'denied';
    if (name === 'NotFoundError' || name === 'OverconstrainedError' || name === 'NotReadableError') return 'unsupported';
    return 'error';
};

export const supportsMenuPhotoCapture = () => (
    typeof navigator !== 'undefined' && Boolean(navigator.mediaDevices?.getUserMedia)
);

export default function MenuPhotoCaptureSheet({ onAddFiles, onCancel, onUseFilePicker, remainingSlots = 0 }) {
    const [status, setStatus] = useState('starting');
    const [liveQuality, setLiveQuality] = useState(null);
    const [shots, setShots] = useState([]);

    const videoRef = useRef(null);
    const sampleCanvasRef = useRef(null);
    const captureCanvasRef = useRef(null);
    const streamRef = useRef(null);
    const shotCounterRef = useRef(0);
    // Object URLs are revoked from a ref rather than from `shots` so unmount
    // cleanup does not have to re-run every time a shot is added.
    const previewUrlsRef = useRef([]);

    const slotsLeft = Math.max(remainingSlots - shots.length, 0);

    // Draws the current preview frame into the small sample canvas and scores
    // it. Returns the score so the shutter can reuse it for the captured shot.
    const scoreCurrentFrame = () => {
        const video = videoRef.current;
        const canvas = sampleCanvasRef.current;
        if (!video || !canvas) return null;

        const sourceWidth = video.videoWidth || 0;
        const sourceHeight = video.videoHeight || 0;
        if (!sourceWidth || !sourceHeight) return null;

        const scale = Math.min(SAMPLE_MAX_EDGE / Math.max(sourceWidth, sourceHeight), 1);
        canvas.width = Math.max(Math.round(sourceWidth * scale), 1);
        canvas.height = Math.max(Math.round(sourceHeight * scale), 1);

        const context = canvas.getContext('2d');
        if (!context) return null;

        context.drawImage(video, 0, 0, canvas.width, canvas.height);
        const imageData = context.getImageData(0, 0, canvas.width, canvas.height);
        return analyzeMenuPhotoQuality(imageData, { sourceWidth, sourceHeight });
    };

    useEffect(() => {
        let cancelled = false;
        let sampleTimer = null;

        const start = async () => {
            if (!supportsMenuPhotoCapture()) {
                setStatus('unsupported');
                return;
            }

            try {
                const stream = await navigator.mediaDevices.getUserMedia(CAMERA_CONSTRAINTS);
                if (cancelled) {
                    stream.getTracks().forEach((track) => track.stop());
                    return;
                }
                streamRef.current = stream;
                if (videoRef.current) {
                    videoRef.current.srcObject = stream;
                    // Older iOS Safari needs the explicit play() even with autoPlay.
                    videoRef.current.play?.().catch(() => {});
                }
                setStatus('live');
                sampleTimer = setInterval(() => {
                    const score = scoreCurrentFrame();
                    if (score) setLiveQuality(score);
                }, LIVE_SAMPLE_INTERVAL_MS);
            } catch (error) {
                if (!cancelled) setStatus(errorStatusFor(error));
            }
        };

        start();

        return () => {
            cancelled = true;
            if (sampleTimer) clearInterval(sampleTimer);
            streamRef.current?.getTracks().forEach((track) => track.stop());
            streamRef.current = null;
            previewUrlsRef.current.forEach((url) => URL.revokeObjectURL(url));
            previewUrlsRef.current = [];
        };
    }, []);

    const stopCamera = () => {
        streamRef.current?.getTracks().forEach((track) => track.stop());
        streamRef.current = null;
    };

    const handleShutter = async () => {
        const video = videoRef.current;
        const canvas = captureCanvasRef.current;
        if (!video || !canvas || slotsLeft <= 0) return;

        const sourceWidth = video.videoWidth || 0;
        const sourceHeight = video.videoHeight || 0;
        if (!sourceWidth || !sourceHeight) return;

        const quality = scoreCurrentFrame();

        canvas.width = sourceWidth;
        canvas.height = sourceHeight;
        const context = canvas.getContext('2d');
        if (!context) return;
        context.drawImage(video, 0, 0, sourceWidth, sourceHeight);

        const blob = await new Promise((resolve) => {
            if (typeof canvas.toBlob !== 'function') {
                resolve(null);
                return;
            }
            canvas.toBlob(resolve, 'image/jpeg', CAPTURE_JPEG_QUALITY);
        });
        if (!blob) return;

        shotCounterRef.current += 1;
        const index = shotCounterRef.current;
        const file = new File([blob], `menu-photo-${index}.jpg`, { type: 'image/jpeg' });
        const previewUrl = typeof URL.createObjectURL === 'function' ? URL.createObjectURL(blob) : null;
        if (previewUrl) previewUrlsRef.current.push(previewUrl);

        setShots((current) => [...current, { id: index, file, previewUrl, quality }]);
    };

    const removeShot = (id) => {
        setShots((current) => {
            const target = current.find((shot) => shot.id === id);
            if (target?.previewUrl) {
                URL.revokeObjectURL(target.previewUrl);
                previewUrlsRef.current = previewUrlsRef.current.filter((url) => url !== target.previewUrl);
            }
            return current.filter((shot) => shot.id !== id);
        });
    };

    const handleAdd = () => {
        if (shots.length === 0) return;
        stopCamera();
        onAddFiles(shots.map((shot) => shot.file));
    };

    const handleCancel = () => {
        stopCamera();
        onCancel();
    };

    const handleUseFilePicker = () => {
        stopCamera();
        onUseFilePicker?.();
    };

    const cameraFailed = status === 'denied' || status === 'unsupported' || status === 'error';

    return (
        <div className="space-y-4">
            <div className="relative overflow-hidden rounded-xl border border-slate-200 bg-slate-900">
                {/* A live camera preview has nothing to caption. */}
                <video
                    ref={videoRef}
                    autoPlay
                    playsInline
                    muted
                    aria-label="Menu camera preview"
                    className={cn('h-64 w-full object-cover', cameraFailed && 'hidden')}
                />

                {status === 'starting' && (
                    <div className="absolute inset-0 flex items-center justify-center gap-2 text-sm text-white">
                        <Loader2 className="h-4 w-4 animate-spin" />
                        Starting camera…
                    </div>
                )}

                {cameraFailed && (
                    <div className="flex h-64 flex-col items-center justify-center gap-3 px-6 text-center">
                        <CameraOff className="h-8 w-8 text-slate-400" />
                        <p className="text-sm text-slate-200">{STATUS_MESSAGES[status]}</p>
                        <Button type="button" variant="outline" onClick={handleUseFilePicker}>
                            <FolderOpen className="mr-2 h-4 w-4" />
                            Add photos from device
                        </Button>
                    </div>
                )}

                {status === 'live' && liveQuality && (
                    <div className="absolute inset-x-0 bottom-0 bg-black/60 px-3 py-2 text-xs text-white">
                        {liveQuality.warnings.length === 0 ? (
                            <p className="flex items-center gap-2 text-green-300">
                                <CheckCircle2 className="h-3.5 w-3.5" />
                                Looks readable — go ahead and shoot.
                            </p>
                        ) : (
                            <ul className="space-y-0.5 text-amber-200">
                                {liveQuality.warnings.map((warning) => (
                                    <li key={warning.code} className="flex items-center gap-2">
                                        <AlertTriangle className="h-3.5 w-3.5 shrink-0" />
                                        {warning.message}
                                    </li>
                                ))}
                            </ul>
                        )}
                    </div>
                )}
            </div>

            {/* Offscreen scratch surfaces: one small one for scoring, one at full frame size for the capture itself. */}
            <canvas ref={sampleCanvasRef} className="hidden" aria-hidden="true" />
            <canvas ref={captureCanvasRef} className="hidden" aria-hidden="true" />

            {status === 'live' && (
                <div className="flex items-center justify-between gap-3">
                    <p className="text-xs text-slate-500">
                        {slotsLeft > 0
                            ? `${slotsLeft} more photo(s) can be added to this import.`
                            : 'This import is already at its file limit.'}
                    </p>
                    <Button
                        type="button"
                        onClick={handleShutter}
                        disabled={slotsLeft <= 0}
                        className="bg-teal-600 hover:bg-teal-700"
                    >
                        <Camera className="mr-2 h-4 w-4" />
                        Take Photo
                    </Button>
                </div>
            )}

            {shots.length > 0 && (
                <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
                    {shots.map((shot) => (
                        <div key={shot.id} className="rounded-lg border border-slate-200 p-2">
                            {shot.previewUrl && (
                                <img
                                    src={shot.previewUrl}
                                    alt={`Captured menu photo ${shot.id}`}
                                    className="h-24 w-full rounded object-cover"
                                />
                            )}
                            <div className="mt-2 flex items-start justify-between gap-2">
                                <div className="min-w-0">
                                    {shot.quality?.warnings?.length > 0 ? (
                                        <p className="text-xs text-amber-700">
                                            {shot.quality.warnings[0].message}
                                        </p>
                                    ) : (
                                        <p className="text-xs text-green-700">Looks good</p>
                                    )}
                                </div>
                                <button
                                    type="button"
                                    onClick={() => removeShot(shot.id)}
                                    className="text-slate-400 hover:text-red-600"
                                    aria-label={`Discard captured menu photo ${shot.id}`}
                                >
                                    <Trash2 className="h-4 w-4" />
                                </button>
                            </div>
                        </div>
                    ))}
                </div>
            )}

            <div className="flex items-center justify-end gap-2">
                <Button type="button" variant="outline" onClick={handleCancel}>
                    Cancel
                </Button>
                <Button
                    type="button"
                    onClick={handleAdd}
                    disabled={shots.length === 0}
                    className="bg-teal-600 hover:bg-teal-700"
                >
                    Add {shots.length} Photo(s)
                </Button>
            </div>
        </div>
    );
}
