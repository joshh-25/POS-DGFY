import React, { useEffect, useState } from 'react';
import QRCode from 'qrcode';

function downloadQrImage(dataUrl, filename) {
  const anchor = document.createElement('a');
  anchor.href = dataUrl;
  anchor.download = filename;
  document.body.appendChild(anchor);
  anchor.click();
  document.body.removeChild(anchor);
}

function toQrFilename(itemName) {
  const normalizedName = String(itemName || 'item')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');

  return `${normalizedName || 'item'}-storefront-qr.png`;
}

export default function StorefrontItemQrCard({
  itemName = 'Item',
  itemUrl = '',
  helperText = 'Scan to open this item in Storefront View Details.',
  compact = false,
  qrSize = null
}) {
  const [qrDataUrl, setQrDataUrl] = useState('');
  const [sharing, setSharing] = useState(false);
  const normalizedItemName = String(itemName || 'Item').trim() || 'Item';
  const normalizedItemUrl = String(itemUrl || '').trim();
  const normalizedHelperText = String(helperText || '').trim();
  const hasRequestedQrSize = qrSize !== null && qrSize !== undefined && qrSize !== '';
  const requestedQrSize = Number(qrSize);
  const resolvedQrSize = hasRequestedQrSize && Number.isFinite(requestedQrSize)
    ? Math.max(96, Math.min(320, requestedQrSize))
    : compact
      ? 176
      : 220;

  useEffect(() => {
    let active = true;
    setQrDataUrl('');

    if (!normalizedItemUrl) {
      return () => {
        active = false;
      };
    }

    QRCode.toDataURL(normalizedItemUrl, {
      width: resolvedQrSize,
      margin: 1,
      errorCorrectionLevel: 'M',
      color: {
        dark: '#0F172AFF',
        light: '#FFFFFFFF'
      }
    })
      .then((dataUrl) => {
        if (active) setQrDataUrl(dataUrl);
      })
      .catch(() => {
        if (active) setQrDataUrl('');
      });

    return () => {
      active = false;
    };
  }, [normalizedItemUrl, resolvedQrSize]);

  if (!normalizedItemUrl) {
    return (
      <section
        aria-label={`${normalizedItemName} Storefront QR unavailable`}
        style={{
          display: 'grid',
          justifyItems: 'center',
          gap: compact ? 8 : 10,
          padding: compact ? 14 : 16,
          color: '#475569',
          textAlign: 'center'
        }}
      >
        <div
          role="status"
          style={{
            display: 'grid',
            placeItems: 'center',
            width: resolvedQrSize,
            maxWidth: '100%',
            aspectRatio: '1',
            border: '1px dashed #CBD5E1',
            borderRadius: 12,
            background: '#FFFFFF',
            fontSize: 13,
            fontWeight: 700
          }}
        >
          Storefront QR unavailable
        </div>
        <p style={{ margin: 0, maxWidth: 280, fontSize: 12, lineHeight: 1.45 }}>
          Configure the Storefront URL, then reopen this item.
        </p>
      </section>
    );
  }

  const qrFilename = toQrFilename(normalizedItemName);
  const handleDownload = () => {
    if (!qrDataUrl) return;
    downloadQrImage(qrDataUrl, qrFilename);
  };

  const handleShare = async () => {
    if (!qrDataUrl || sharing) return;

    const canUseNativeShare = typeof navigator !== 'undefined' && typeof navigator.share === 'function';
    if (!canUseNativeShare) {
      handleDownload();
      return;
    }

    setSharing(true);
    try {
      const response = await fetch(qrDataUrl);
      const blob = await response.blob();
      const file = new File([blob], qrFilename, { type: 'image/png' });
      const shareData = {
        title: `${normalizedItemName} Storefront QR`,
        text: `Open ${normalizedItemName} in Storefront.`,
        url: normalizedItemUrl
      };

      if (typeof navigator.canShare === 'function' && navigator.canShare({ files: [file] })) {
        await navigator.share({ ...shareData, files: [file] });
      } else {
        await navigator.share(shareData);
      }
    } catch (error) {
      if (error?.name !== 'AbortError') handleDownload();
    } finally {
      setSharing(false);
    }
  };

  return (
    <section
      aria-label={`${normalizedItemName} Storefront QR`}
      style={{
        display: 'grid',
        justifyItems: 'center',
        gap: compact ? 8 : 10,
        padding: compact ? 14 : 16,
        border: '1px solid #E2E8F0',
        borderRadius: 16,
        background: '#F8FAFC',
        color: '#0F172A',
        textAlign: 'center'
      }}
    >
      <p style={{ margin: 0, fontSize: compact ? 15 : 16, lineHeight: 1.25, fontWeight: 800 }}>
        {normalizedItemName}
      </p>

      {qrDataUrl ? (
        <div style={{ position: 'relative', width: resolvedQrSize, maxWidth: '100%' }}>
          <button
            type="button"
            onClick={handleDownload}
            title="Download QR code"
            aria-label={`Download ${normalizedItemName} Storefront QR code`}
            style={{
              display: 'block',
              width: '100%',
              padding: 0,
              border: 0,
              borderRadius: 12,
              background: '#FFFFFF',
              cursor: 'pointer'
            }}
          >
            <img
              src={qrDataUrl}
              alt={`${normalizedItemName} Storefront QR code`}
              width={resolvedQrSize}
              height={resolvedQrSize}
              style={{
                display: 'block',
                width: '100%',
                height: 'auto',
                borderRadius: 12
              }}
            />
          </button>
          <button
            type="button"
            onClick={handleShare}
            disabled={sharing}
            title="Share QR code"
            aria-label={`Share ${normalizedItemName} Storefront QR code`}
            style={{
              position: 'absolute',
              right: -10,
              bottom: -10,
              display: 'grid',
              placeItems: 'center',
              width: 34,
              height: 34,
              padding: 0,
              border: '2px solid #FFFFFF',
              borderRadius: '50%',
              background: '#F59E0B',
              color: '#FFFFFF',
              boxShadow: '0 4px 10px rgba(15, 23, 42, 0.2)',
              cursor: sharing ? 'wait' : 'pointer'
            }}
          >
            <svg viewBox="0 0 24 24" width="17" height="17" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <circle cx="18" cy="5" r="2.5" />
              <circle cx="6" cy="12" r="2.5" />
              <circle cx="18" cy="19" r="2.5" />
              <path d="m8.2 10.8 7.6-4.3M8.2 13.2l7.6 4.3" />
            </svg>
          </button>
        </div>
      ) : (
        <div
          aria-label="Generating item QR code"
          style={{
           display: 'grid',
           placeItems: 'center',
            width: resolvedQrSize,
            maxWidth: '100%',
            aspectRatio: '1',
            borderRadius: 12,
            background: '#FFFFFF',
            color: '#64748B',
            fontSize: 13,
            fontWeight: 700
          }}
        >
          Generating QR...
        </div>
      )}

      {normalizedHelperText ? (
        <p style={{ margin: 0, maxWidth: 280, color: '#64748B', fontSize: 12, lineHeight: 1.45 }}>
          {normalizedHelperText}
        </p>
      ) : null}
      <a
        href={normalizedItemUrl}
        target="_blank"
        rel="noreferrer"
        style={{ color: '#1D4ED8', fontSize: 12, fontWeight: 800, textDecoration: 'underline' }}
      >
        Open Storefront item
      </a>
    </section>
  );
}
