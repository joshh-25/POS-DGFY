import React, { useCallback, useEffect, useState } from 'react';
import QRCode from 'qrcode';
import { toast } from 'sonner';
import { Share2 } from 'lucide-react';

const HERO_CANVAS_MAX_WIDTH = 1280;
const DGFY_LOGO_ICON_URL = '/dgfy-symbologo.png';

export function StorefrontShareQr({
  storeUrl,
  isMobileViewport,
  accentColor = '#f97316',
  shareEnabled = true
}) {
  const [qrImageUrl, setQrImageUrl] = useState('');

  useEffect(() => {
    let active = true;
    if (!storeUrl) {
      setQrImageUrl('');
      return () => {
        active = false;
      };
    }
    QRCode.toDataURL(storeUrl, {
      margin: 1,
      width: isMobileViewport ? 96 : 112,
      errorCorrectionLevel: 'H',
      color: {
        dark: '#0f172a',
        light: '#ffffff'
      }
    })
      .then((url) => {
        if (active) setQrImageUrl(url);
      })
      .catch(() => {
        if (active) setQrImageUrl('');
      });
    return () => {
      active = false;
    };
  }, [isMobileViewport, storeUrl]);

  const copyStoreUrl = useCallback(async () => {
    if (!storeUrl) return;
    try {
      if (navigator?.clipboard?.writeText) {
        await navigator.clipboard.writeText(storeUrl);
        toast.success('Storefront link copied.');
        return;
      }
      throw new Error('Clipboard unavailable');
    } catch {
      toast.info(storeUrl);
    }
  }, [storeUrl]);

  const shareStoreUrl = useCallback(async () => {
    if (!storeUrl) return;
    const payload = {
      title: 'Storefront',
      text: 'Open this storefront',
      url: storeUrl
    };
    try {
      if (navigator?.share) {
        await navigator.share(payload);
        return;
      }
      if (navigator?.clipboard?.writeText) {
        await navigator.clipboard.writeText(storeUrl);
        toast.success('Storefront link copied.');
        return;
      }
      throw new Error('Share unavailable');
    } catch {
      if (navigator?.clipboard?.writeText) {
        try {
          await navigator.clipboard.writeText(storeUrl);
          toast.success('Storefront link copied.');
          return;
        } catch {
          // Fall through.
        }
      }
      toast.info(storeUrl);
    }
  }, [storeUrl]);

  if (!qrImageUrl) return null;

  return (
    <div
      style={{
        position: 'absolute',
        top: isMobileViewport ? 22 : 22,
        left: 'auto',
        right: isMobileViewport ? 16 : `max(41px, calc((100vw - ${HERO_CANVAS_MAX_WIDTH}px) / 2 + 41px))`,
        transform: 'none',
        zIndex: 14,
        display: 'grid',
        gap: 8
      }}
    >
      <button
        type="button"
        onClick={copyStoreUrl}
        style={{
          position: 'relative',
          width: isMobileViewport ? 82 : 116,
          height: isMobileViewport ? 82 : 116,
          borderRadius: isMobileViewport ? 18 : 22,
          border: '1px solid rgba(255,255,255,0.24)',
          background: 'rgba(255,255,255,0.96)',
          boxShadow: '0 18px 42px rgba(15, 23, 42, 0.18)',
          backdropFilter: 'blur(10px)',
          padding: isMobileViewport ? 7 : 10,
          cursor: 'pointer'
        }}
        aria-label="Copy storefront link"
        title="Copy storefront link"
      >
        <img
          src={qrImageUrl}
          alt="Storefront QR code"
          style={{ width: '100%', height: '100%', objectFit: 'contain', display: 'block', borderRadius: 14 }}
        />
        <div
          style={{
            position: 'absolute',
            inset: 0,
            display: 'grid',
            placeItems: 'center',
            pointerEvents: 'none'
          }}
        >
          <div
            style={{
              width: isMobileViewport ? 22 : 30,
              height: isMobileViewport ? 22 : 30,
              borderRadius: 10,
              background: 'rgba(255,255,255,0.92)',
              border: '1px solid rgba(15,23,42,0.08)',
              display: 'grid',
              placeItems: 'center',
              boxShadow: '0 8px 16px rgba(15, 23, 42, 0.12)'
            }}
          >
            <img
              src={DGFY_LOGO_ICON_URL}
              alt=""
              style={{ width: isMobileViewport ? 14 : 20, height: isMobileViewport ? 14 : 20, objectFit: 'contain', opacity: 0.96 }}
            />
          </div>
        </div>
      </button>

      {shareEnabled && (
        <button
          type="button"
          onClick={shareStoreUrl}
          style={{
            position: 'absolute',
            right: -6,
            bottom: -6,
            width: isMobileViewport ? 30 : 36,
            height: isMobileViewport ? 30 : 36,
            borderRadius: 999,
            border: 'none',
            background: accentColor,
            color: '#ffffff',
            display: 'inline-flex',
            alignItems: 'center',
            justifyContent: 'center',
            boxShadow: '0 10px 24px rgba(15, 23, 42, 0.24)',
            cursor: 'pointer'
          }}
          aria-label="Share storefront"
          title="Share storefront"
        >
          <Share2 size={16} />
        </button>
      )}
    </div>
  );
}

export default StorefrontShareQr;
