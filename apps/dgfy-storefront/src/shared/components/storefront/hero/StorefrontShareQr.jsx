import React, { useCallback, useEffect, useRef, useState } from 'react';
import QRCode from 'qrcode';
import { toast } from 'sonner';
import { Share2 } from 'lucide-react';
import { buildStorefrontQrExportImage, downloadDataUrl } from '../../../../features/qr/utils/storefrontQrExport.js';

const HERO_CANVAS_MAX_WIDTH = 1280;
const DGFY_LOGO_ICON_URL = '/dgfy-symbologo.png';

export function StorefrontShareQr({
  storeUrl,
  storeName = 'Storefront',
  storeLogoUrl = '',
  isMobileViewport,
  accentColor = '#f97316',
  shareEnabled = true
}) {
  const [qrImageUrl, setQrImageUrl] = useState('');
  const [showSaveHint, setShowSaveHint] = useState(false);
  const [isShareMenuOpen, setIsShareMenuOpen] = useState(false);
  const longPressTimerRef = useRef(null);
  const longPressTriggeredRef = useRef(false);
  const mobileHintShownRef = useRef(false);
  const shareMenuRef = useRef(null);

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
    try {
      if (navigator?.share) {
        await navigator.share({
          title: storeName || 'Storefront',
          text: 'Find What You Need',
          url: storeUrl
        });
        return;
      }
    } catch {
      // Fall through to copy fallback.
    }

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
  }, [storeName, storeUrl]);

  const downloadBrandedQr = useCallback(async () => {
    if (!storeUrl) return;
    try {
      const dataUrl = await buildStorefrontQrExportImage({
        storeUrl,
        storeName,
        storeLogoUrl,
        accentColor
      });
      const sanitizedName = String(storeName || 'storefront')
        .trim()
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-+|-+$/g, '') || 'storefront';
      downloadDataUrl(dataUrl, `${sanitizedName}-qr.png`);
      toast.success('Branded QR downloaded.');
    } catch {
      toast.error('Unable to download the branded QR.');
    }
  }, [accentColor, storeLogoUrl, storeName, storeUrl]);

  const handleQrContextMenu = useCallback(async (event) => {
    event.preventDefault();
    await downloadBrandedQr();
  }, [downloadBrandedQr]);

  const clearLongPressTimer = useCallback(() => {
    if (longPressTimerRef.current) {
      window.clearTimeout(longPressTimerRef.current);
      longPressTimerRef.current = null;
    }
  }, []);

  const handleTouchStart = useCallback(() => {
    if (!isMobileViewport) return;
    longPressTriggeredRef.current = false;
    clearLongPressTimer();
    longPressTimerRef.current = window.setTimeout(() => {
      longPressTriggeredRef.current = true;
      downloadBrandedQr();
    }, 650);
  }, [clearLongPressTimer, downloadBrandedQr, isMobileViewport]);

  const handleTouchEnd = useCallback(() => {
    clearLongPressTimer();
  }, [clearLongPressTimer]);

  const handleQrClick = useCallback(async () => {
    if (longPressTriggeredRef.current) {
      longPressTriggeredRef.current = false;
      return;
    }
    await copyStoreUrl();
    if (isMobileViewport && !mobileHintShownRef.current) {
      mobileHintShownRef.current = true;
      toast.info('Long-press QR to save.');
    }
  }, [copyStoreUrl, isMobileViewport]);

  useEffect(() => () => {
    clearLongPressTimer();
  }, [clearLongPressTimer]);

  useEffect(() => {
    if (!isShareMenuOpen) return undefined;

    const handlePointerDown = (event) => {
      if (!shareMenuRef.current?.contains(event.target)) {
        setIsShareMenuOpen(false);
      }
    };

    const handleKeyDown = (event) => {
      if (event.key === 'Escape') {
        setIsShareMenuOpen(false);
      }
    };

    document.addEventListener('mousedown', handlePointerDown);
    document.addEventListener('touchstart', handlePointerDown);
    document.addEventListener('keydown', handleKeyDown);

    return () => {
      document.removeEventListener('mousedown', handlePointerDown);
      document.removeEventListener('touchstart', handlePointerDown);
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [isShareMenuOpen]);

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
        onClick={handleQrClick}
        onContextMenu={handleQrContextMenu}
        onTouchStart={handleTouchStart}
        onTouchEnd={handleTouchEnd}
        onTouchCancel={handleTouchEnd}
        onMouseEnter={() => setShowSaveHint(true)}
        onMouseLeave={() => setShowSaveHint(false)}
        onFocus={() => setShowSaveHint(true)}
        onBlur={() => setShowSaveHint(false)}
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
        title="Copy storefront link. Right-click or long-press to download branded QR."
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

      {!isMobileViewport && showSaveHint ? (
        <div
          style={{
            position: 'absolute',
            top: '100%',
            right: 0,
            marginTop: 6,
            padding: '5px 8px',
            borderRadius: 10,
            background: 'rgba(15, 23, 42, 0.92)',
            color: '#ffffff',
            fontSize: 11,
            fontWeight: 600,
            lineHeight: 1.25,
            whiteSpace: 'nowrap',
            boxShadow: '0 10px 24px rgba(15, 23, 42, 0.18)',
            pointerEvents: 'none',
            zIndex: 16
          }}
        >
          Right-click or long-press QR to save
        </div>
      ) : null}

      {shareEnabled && (
        <div
          ref={shareMenuRef}
          style={{
            position: 'absolute',
            right: -6,
            bottom: -6,
            zIndex: 17
          }}
        >
          {isShareMenuOpen ? (
            <div
              style={{
                position: 'absolute',
                right: 0,
                bottom: isMobileViewport ? 38 : 44,
                minWidth: isMobileViewport ? 132 : 144,
                padding: 6,
                borderRadius: 14,
                border: '1px solid rgba(226,232,240,0.95)',
                background: 'rgba(255,255,255,0.98)',
                boxShadow: '0 16px 32px rgba(15, 23, 42, 0.18)',
                display: 'grid',
                gap: 4,
                backdropFilter: 'blur(10px)'
              }}
            >
              <button
                type="button"
                onClick={async () => {
                  setIsShareMenuOpen(false);
                  await shareStoreUrl();
                }}
                style={{
                  minHeight: isMobileViewport ? 32 : 34,
                  border: 'none',
                  borderRadius: 10,
                  background: 'transparent',
                  color: '#0f172a',
                  fontSize: isMobileViewport ? 11 : 12,
                  fontWeight: 700,
                  textAlign: 'left',
                  padding: '0 10px',
                  cursor: 'pointer'
                }}
              >
                Share storefront
              </button>
              <button
                type="button"
                onClick={async () => {
                  setIsShareMenuOpen(false);
                  await downloadBrandedQr();
                }}
                style={{
                  minHeight: isMobileViewport ? 32 : 34,
                  border: 'none',
                  borderRadius: 10,
                  background: 'transparent',
                  color: '#0f172a',
                  fontSize: isMobileViewport ? 11 : 12,
                  fontWeight: 700,
                  textAlign: 'left',
                  padding: '0 10px',
                  cursor: 'pointer'
                }}
              >
                Download QR
              </button>
            </div>
          ) : null}

          <button
            type="button"
            onClick={() => setIsShareMenuOpen((previous) => !previous)}
            style={{
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
            aria-label="Storefront share options"
            title="Storefront share options"
            aria-expanded={isShareMenuOpen}
            aria-haspopup="menu"
          >
            <Share2 size={16} />
          </button>
        </div>
      )}
    </div>
  );
}

export default StorefrontShareQr;
