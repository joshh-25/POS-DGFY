import React, { useEffect, useState } from 'react';
import { toast } from 'sonner';
import { Copy, Download, Percent } from 'lucide-react';
import QRCode from 'qrcode';
import { copyTextToClipboard } from '../../shared/utils/clipboard.js';
import { buildStorefrontQrExportImage, downloadDataUrl } from '../../features/qr/utils/storefrontQrExport.js';
import { PayoutMethodsSection } from './PayoutMethodsSection.jsx';
import { CashoutsSection } from './CashoutsSection.jsx';

const centavosToPesos = (value) => Number(value || 0) / 100;

const formatCommissionRate = (enrollment) => {
  const bps = Number(enrollment?.commission_rate_bps);
  if (!Number.isFinite(bps) || bps <= 0) return 'Store default rate';
  return `${(bps / 100).toFixed(2)}% commission`;
};

// Small self-contained QR preview: generates a plain scannable code lazily
// per enrollment (same QRCode.toDataURL call the POS back-office panel
// uses), separate from the heavier branded flyer image used for download.
function AffiliateShareQrPreview({ shareUrl, theme }) {
  const [dataUrl, setDataUrl] = useState('');

  useEffect(() => {
    let cancelled = false;
    if (!shareUrl) return undefined;
    QRCode.toDataURL(shareUrl, { errorCorrectionLevel: 'M', margin: 1, width: 160 })
      .then((value) => { if (!cancelled) setDataUrl(value); })
      .catch(() => {});
    return () => { cancelled = true; };
  }, [shareUrl]);

  if (!shareUrl) return null;
  return (
    <div style={{ width: 96, height: 96, borderRadius: 12, border: `1px solid ${theme.border}`, background: '#FFFFFF', display: 'grid', placeItems: 'center', flexShrink: 0, overflow: 'hidden' }}>
      {dataUrl ? <img src={dataUrl} alt="Affiliate QR code" style={{ width: '100%', height: '100%' }} /> : <div style={{ fontSize: 11, color: theme.muted }}>Loading...</div>}
    </div>
  );
}

function AffiliateBusinessCard({ enrollment, storeEarnings, money, formatDate, StatusBadge, theme, isMobileViewport }) {
  const [downloading, setDownloading] = useState(false);
  const businessName = enrollment?.tenant?.name || 'Business';
  const shareUrl = enrollment?.share_url || '';
  const sharePath = enrollment?.share_path || '';

  const handleCopyLink = () => {
    copyTextToClipboard(toast, shareUrl || sharePath, 'Share link copied.');
  };

  const handleDownloadQr = async () => {
    if (!shareUrl || downloading) return;
    setDownloading(true);
    try {
      const image = await buildStorefrontQrExportImage({ storeUrl: shareUrl, storeName: businessName });
      downloadDataUrl(image, `${businessName.replace(/\s+/g, '-').toLowerCase()}-affiliate-qr.png`);
    } catch {
      toast.error('Unable to generate the QR image right now.');
    } finally {
      setDownloading(false);
    }
  };

  return (
    <div style={{ background: theme.surface, borderRadius: 16, border: `1px solid ${theme.border}`, padding: isMobileViewport ? 16 : 24, display: 'flex', flexDirection: isMobileViewport ? 'column' : 'row', gap: 20, alignItems: isMobileViewport ? 'stretch' : 'center' }}>
      <AffiliateShareQrPreview key={shareUrl} shareUrl={shareUrl} theme={theme} />
      <div style={{ flex: 1, minWidth: 0, display: 'grid', gap: 8 }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
          <div style={{ fontSize: 17, fontWeight: 700, color: theme.text }}>{businessName}</div>
          <StatusBadge status={enrollment?.status} />
        </div>
        <div style={{ fontSize: 13, color: theme.muted }}>{formatCommissionRate(enrollment)}</div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, color: theme.primary, fontFamily: 'monospace', wordBreak: 'break-all' }}>
          {enrollment?.short_code}
        </div>
        {storeEarnings ? (
          <div style={{ display: 'flex', gap: 20, flexWrap: 'wrap', marginTop: 4 }}>
            <div><div style={{ fontSize: 11, color: theme.muted }}>Available</div><div style={{ fontSize: 14, fontWeight: 700, color: theme.success }}>{money(centavosToPesos(storeEarnings.available_centavos))}</div></div>
            <div><div style={{ fontSize: 11, color: theme.muted }}>Pending</div><div style={{ fontSize: 14, fontWeight: 700, color: theme.warning }}>{money(centavosToPesos(storeEarnings.pending_centavos))}</div></div>
            <div><div style={{ fontSize: 11, color: theme.muted }}>Paid out</div><div style={{ fontSize: 14, fontWeight: 700, color: theme.text }}>{money(centavosToPesos(storeEarnings.paid_centavos))}</div></div>
          </div>
        ) : null}
        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', marginTop: 8 }}>
          <button type="button" onClick={handleCopyLink} disabled={!shareUrl && !sharePath} style={{ display: 'inline-flex', alignItems: 'center', gap: 6, background: theme.surface, border: `1px solid ${theme.border}`, color: theme.primary, borderRadius: 8, padding: '8px 14px', fontSize: 13, fontWeight: 600, cursor: shareUrl || sharePath ? 'pointer' : 'not-allowed' }}>
            <Copy size={14} /> Copy link
          </button>
          <button type="button" onClick={handleDownloadQr} disabled={!shareUrl || downloading} style={{ display: 'inline-flex', alignItems: 'center', gap: 6, background: theme.primary, border: 'none', color: '#FFFFFF', borderRadius: 8, padding: '8px 14px', fontSize: 13, fontWeight: 600, cursor: shareUrl && !downloading ? 'pointer' : 'not-allowed' }}>
            <Download size={14} /> {downloading ? 'Preparing...' : 'Download QR'}
          </button>
        </div>
        {enrollment?.activated_at ? <div style={{ fontSize: 12, color: theme.muted, marginTop: 4 }}>Enrolled {formatDate(enrollment.activated_at)}</div> : null}
      </div>
    </div>
  );
}

export function AffiliateSection({
  enrollments = [],
  earnings,
  earningsByStore = [],
  payoutMethods = [],
  onSavePayoutMethod,
  onDeletePayoutMethod,
  onSetDefaultPayoutMethod,
  accountPayoutActionId,
  cashouts = [],
  onRequestCashout,
  onCancelCashout,
  accountCashoutActionId,
  isMobileViewport,
  EmptyState,
  StatusBadge,
  money,
  formatDate,
  theme
}) {
  const [activeTab, setActiveTab] = useState('businesses');
  const earningsByTenant = new Map((Array.isArray(earningsByStore) ? earningsByStore : []).map((entry) => [String(entry.tenant_id), entry.earnings]));

  const tabs = [
    { id: 'businesses', label: 'Businesses', count: enrollments.length },
    { id: 'payout_methods', label: 'Payout Methods' },
    { id: 'cashouts', label: 'Cashouts' }
  ];

  return (
    <div style={{ display: 'grid', gap: 24 }}>
      <div>
        <h2 style={{ fontSize: 24, fontWeight: 800, color: theme.text, margin: 0 }}>Affiliate Program</h2>
        <p style={{ margin: '8px 0 0', fontSize: 14, color: theme.muted }}>Share your QR code or link and earn a commission when someone buys from a business that added you as an affiliate.</p>
      </div>

      <div style={{ background: theme.surface, borderRadius: 16, border: `1px solid ${theme.border}`, padding: isMobileViewport ? 20 : 32, display: 'flex', alignItems: 'center', gap: 24, flexWrap: 'wrap' }}>
        <div style={{ width: 64, height: 64, borderRadius: 16, background: theme.successBg, color: theme.success, display: 'grid', placeItems: 'center', flexShrink: 0 }}><Percent size={32} /></div>
        <div style={{ display: 'flex', gap: 32, flexWrap: 'wrap' }}>
          <div><div style={{ fontSize: 13, color: theme.muted, fontWeight: 500 }}>Available to cash out</div><div style={{ fontSize: 28, fontWeight: 900, color: theme.text }}>{money(centavosToPesos(earnings?.available_centavos))}</div></div>
          <div><div style={{ fontSize: 13, color: theme.muted, fontWeight: 500 }}>Pending</div><div style={{ fontSize: 20, fontWeight: 700, color: theme.warning }}>{money(centavosToPesos(earnings?.pending_centavos))}</div></div>
          <div><div style={{ fontSize: 13, color: theme.muted, fontWeight: 500 }}>Paid out</div><div style={{ fontSize: 20, fontWeight: 700, color: theme.text }}>{money(centavosToPesos(earnings?.paid_centavos))}</div></div>
        </div>
      </div>

      <div style={{ display: 'flex', flexWrap: 'wrap', gap: isMobileViewport ? 8 : 10, padding: isMobileViewport ? '0 0 4px' : 0, borderBottom: `1px solid ${theme.border}` }}>
        {tabs.map((tab) => {
          const selected = activeTab === tab.id;
          return (
            <button key={tab.id} type="button" onClick={() => setActiveTab(tab.id)} style={{ background: isMobileViewport && selected ? theme.infoBg : 'transparent', border: 'none', borderBottom: isMobileViewport ? 'none' : selected ? `2px solid ${theme.primary}` : '2px solid transparent', color: selected ? theme.primary : theme.muted, fontSize: isMobileViewport ? 12 : 14, fontWeight: selected ? 600 : 500, padding: isMobileViewport ? '9px 12px' : '16px 18px', borderRadius: isMobileViewport ? 999 : 0, cursor: 'pointer', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 8, flex: isMobileViewport ? '1 1 auto' : '0 0 auto', whiteSpace: 'nowrap' }}>
              <span>{tab.label}</span>
              {typeof tab.count === 'number' ? <span style={{ fontSize: 11, fontWeight: 700, background: selected ? '#fff' : theme.bg, color: selected ? theme.primary : theme.muted, padding: '2px 6px', borderRadius: 999 }}>{tab.count}</span> : null}
            </button>
          );
        })}
      </div>

      {activeTab === 'businesses' ? (
        <div style={{ display: 'grid', gap: 16 }}>
          {enrollments.length === 0 ? (
            <EmptyState title="You're not an affiliate yet" desc="Ask a business owner to add you as an affiliate. Once they do, your businesses and share QR/link will show up here." />
          ) : enrollments.map((enrollment) => (
            <AffiliateBusinessCard
              key={enrollment.enrollment_id}
              enrollment={enrollment}
              storeEarnings={earningsByTenant.get(String(enrollment.tenant_id))}
              money={money}
              formatDate={formatDate}
              StatusBadge={StatusBadge}
              theme={theme}
              isMobileViewport={isMobileViewport}
            />
          ))}
        </div>
      ) : null}

      {activeTab === 'payout_methods' ? (
        <PayoutMethodsSection
          payoutMethods={payoutMethods}
          onSavePayoutMethod={onSavePayoutMethod}
          onDeletePayoutMethod={onDeletePayoutMethod}
          onSetDefaultPayoutMethod={onSetDefaultPayoutMethod}
          accountPayoutActionId={accountPayoutActionId}
          isMobileViewport={isMobileViewport}
          theme={theme}
        />
      ) : null}

      {activeTab === 'cashouts' ? (
        <CashoutsSection
          enrollments={enrollments}
          earningsByStore={earningsByStore}
          cashouts={cashouts}
          onRequestCashout={onRequestCashout}
          onCancelCashout={onCancelCashout}
          accountCashoutActionId={accountCashoutActionId}
          isMobileViewport={isMobileViewport}
          EmptyState={EmptyState}
          StatusBadge={StatusBadge}
          money={money}
          formatDate={formatDate}
          theme={theme}
        />
      ) : null}
    </div>
  );
}

export default AffiliateSection;
