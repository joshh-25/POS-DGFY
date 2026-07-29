export const getPlatformInvoicingMode = (env = process.env) => String(env.PLATFORM_INVOICING_MODE || 'qa').trim().toLowerCase() === 'live' ? 'live' : 'qa';

export const assertInvoiceIssuanceMode = ({ mode = getPlatformInvoicingMode(), sellerProfile, env = process.env }) => {
  if (mode === 'qa') return { mode: 'qa', sequence_prefix: 'TEST-', watermark: 'TEST DOCUMENT — NOT VALID AS A VAT INVOICE OR FOR INPUT TAX' };
  const confirmed = String(env.PLATFORM_INVOICING_LIVE_CONFIRMED || '').toLowerCase() === 'true';
  if (!confirmed || !sellerProfile || sellerProfile.is_dummy || !sellerProfile.invoice_series_authority || !sellerProfile.tin || !sellerProfile.address) {
    const error = new Error('Live landlord invoice issuance is not configured and confirmed.');
    error.code = 'PLATFORM_INVOICING_LIVE_GATE_CLOSED';
    throw error;
  }
  return { mode: 'live', sequence_prefix: sellerProfile.sequence_prefix || '' };
};
