import React, { useState, useEffect, useRef } from 'react';
import QRCode from 'qrcode';
import {
    Dialog,
    DialogContent,
    DialogHeader,
    DialogTitle,
    DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Download, Copy, RefreshCw, QrCode, Clock, CheckCircle } from 'lucide-react';

export default function QRCodeModal({ open, onClose, orderType, orderId, orderNumber, onGenerateToken }) {
    const [qrDataUrl, setQrDataUrl] = useState(null);
    const [tokenData, setTokenData] = useState(null);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState(null);
    const [copied, setCopied] = useState(false);
    const canvasRef = useRef(null);

    // Generate token when modal opens
    useEffect(() => {
        if (open && !tokenData) {
            generateToken();
        }
    }, [open]);

    const generateToken = async () => {
        setLoading(true);
        setError(null);
        try {
            const result = await onGenerateToken(orderType, orderId);
            setTokenData(result);

            // Generate QR code from the URL
            const fullUrl = `${window.location.origin}${result.url}`;
            const dataUrl = await QRCode.toDataURL(fullUrl, {
                width: 300,
                margin: 2,
                color: {
                    dark: '#0d9488', // teal-600
                    light: '#ffffff'
                }
            });
            setQrDataUrl(dataUrl);
        } catch (err) {
            setError(err.message || 'Failed to generate QR code');
        } finally {
            setLoading(false);
        }
    };

    const handleDownload = () => {
        if (!qrDataUrl) return;

        const link = document.createElement('a');
        link.download = `${orderNumber}-qr.png`;
        link.href = qrDataUrl;
        link.click();
    };

    const handleCopyLink = async () => {
        if (!tokenData) return;

        const fullUrl = `${window.location.origin}${tokenData.url}`;
        try {
            await navigator.clipboard.writeText(fullUrl);
            setCopied(true);
            setTimeout(() => setCopied(false), 2000);
        } catch (err) {
            console.error('Failed to copy:', err);
        }
    };

    const handleClose = () => {
        setTokenData(null);
        setQrDataUrl(null);
        setError(null);
        onClose();
    };

    const formatExpiry = (dateStr) => {
        const date = new Date(dateStr);
        return date.toLocaleDateString('en-US', {
            weekday: 'short',
            month: 'short',
            day: 'numeric',
            year: 'numeric'
        });
    };

    return (
        <Dialog open={open} onOpenChange={handleClose}>
            <DialogContent className="max-w-md">
                <DialogHeader>
                    <DialogTitle className="flex items-center gap-2">
                        <QrCode className="w-5 h-5 text-teal-600" />
                        QR Code - {orderNumber}
                    </DialogTitle>
                </DialogHeader>

                <div className="flex flex-col items-center py-4">
                    {loading && (
                        <div className="w-[300px] h-[300px] flex items-center justify-center bg-slate-100 rounded-xl">
                            <RefreshCw className="w-8 h-8 text-teal-600 animate-spin" />
                        </div>
                    )}

                    {error && (
                        <div className="w-full p-4 bg-red-50 border border-red-200 rounded-xl text-red-700 text-center">
                            {error}
                            <Button
                                variant="outline"
                                size="sm"
                                onClick={generateToken}
                                className="mt-2"
                            >
                                Try Again
                            </Button>
                        </div>
                    )}

                    {qrDataUrl && !loading && (
                        <>
                            <div className="p-4 bg-white border-2 border-slate-200 rounded-xl shadow-sm">
                                <img
                                    src={qrDataUrl}
                                    alt={`QR Code for ${orderNumber}`}
                                    className="w-[280px] h-[280px]"
                                />
                            </div>

                            <div className="mt-4 w-full space-y-2">
                                <div className="flex items-center justify-center gap-2 text-sm text-slate-600">
                                    <Clock className="w-4 h-4" />
                                    <span>Expires: {tokenData && formatExpiry(tokenData.expires_at)}</span>
                                </div>

                                <Badge variant="outline" className="w-full justify-center py-2 text-xs font-mono bg-slate-50">
                                    {tokenData && `${window.location.origin}${tokenData.url}`}
                                </Badge>
                            </div>
                        </>
                    )}
                </div>

                <DialogFooter className="flex-col sm:flex-row gap-2">
                    <Button
                        variant="outline"
                        onClick={handleCopyLink}
                        disabled={!tokenData}
                        className="flex-1"
                    >
                        {copied ? (
                            <>
                                <CheckCircle className="w-4 h-4 mr-2 text-emerald-500" />
                                Copied!
                            </>
                        ) : (
                            <>
                                <Copy className="w-4 h-4 mr-2" />
                                Copy Link
                            </>
                        )}
                    </Button>
                    <Button
                        onClick={handleDownload}
                        disabled={!qrDataUrl}
                        className="flex-1 bg-teal-600 hover:bg-teal-700"
                    >
                        <Download className="w-4 h-4 mr-2" />
                        Download QR
                    </Button>
                </DialogFooter>

                <p className="text-xs text-center text-slate-500 mt-2">
                    Scan this code with a mobile device to receive items
                </p>
            </DialogContent>
        </Dialog>
    );
}
