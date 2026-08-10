import PDFDocument from 'pdfkit';
import crypto from 'crypto';
import { existsSync } from 'fs';
import { fileURLToPath } from 'url';

const pesos = (centavos) => `PHP ${(Number(centavos || 0) / 100).toFixed(2)}`;
const text = (value) => String(value || '-').replace(/[\r\n]+/g, ' ').slice(0, 500);
const sieitzLogoPath = fileURLToPath(new URL('../../../../assets/sieitz-logo.png', import.meta.url));
const placeholderLines = (seller = {}) => Array.isArray(seller.fiscal_placeholders) ? seller.fiscal_placeholders.filter(Boolean) : [];

export const renderPlatformInvoicePdf = async (invoice) => new Promise((resolve, reject) => {
  const doc = new PDFDocument({ size: 'A4', margin: 48, bufferPages: true, info: { Title: `DGFY QA Invoice ${invoice.invoice_number}`, Author: 'DGFY' } });
  const chunks = [];
  doc.on('data', (chunk) => chunks.push(chunk)); doc.on('error', reject); doc.on('end', () => { const buffer = Buffer.concat(chunks); resolve({ buffer, sha256: crypto.createHash('sha256').update(buffer).digest('hex') }); });
  if (invoice.seller_snapshot?.logo_asset === 'sieitz-logo-v1' && existsSync(sieitzLogoPath)) doc.image(sieitzLogoPath, 48, 42, { fit: [56, 56] });
  doc.fillColor('#1A4E8D').fontSize(24).text('DGFY', invoice.seller_snapshot?.logo_asset === 'sieitz-logo-v1' ? 114 : 48, 48, { continued: true }).fillColor('#64748B').fontSize(12).text('  PLATFORM INVOICE');
  doc.moveDown(0.5).fillColor('#DC2626').fontSize(14).text('TEST DOCUMENT - NOT VALID AS A VAT INVOICE OR FOR INPUT TAX');
  doc.moveDown().fillColor('#0F172A').fontSize(11).text(`Invoice: ${text(invoice.invoice_number)}`).text(`Issued: ${new Date(invoice.issued_at || Date.now()).toLocaleString('en-PH')}`).text(`Seller: ${text(invoice.seller_snapshot?.legal_name)} (${text(invoice.seller_snapshot?.trade_name)})`).text(`Seller: ${text(invoice.seller_snapshot?.vat_status)} REG TIN ${text(invoice.seller_snapshot?.tin)} / Branch ${text(invoice.seller_snapshot?.branch_code)}`).text(`Seller address: ${text(invoice.seller_snapshot?.address)}`).text(`Seller contact: ${text(invoice.seller_snapshot?.contact)}`).text(`Buyer: ${text(invoice.buyer_snapshot?.legal_name)}`);
  for (const placeholder of placeholderLines(invoice.seller_snapshot)) doc.fillColor('#DC2626').fontSize(9).text(text(placeholder));
  doc.moveDown().fontSize(12).fillColor('#1A4E8D').text('Payment details'); doc.fillColor('#0F172A').fontSize(10).text(text(invoice.service_snapshot?.description));
  doc.moveDown().fontSize(11).text(`VATable sales: ${pesos(invoice.vatable_sales_centavos)}`).text(`VAT (inclusive): ${pesos(invoice.vat_centavos)}`).font('Helvetica-Bold').text(`DGFY platform fee: ${pesos(invoice.gross_centavos)}`).font('Helvetica');
  const payments = invoice.payments || []; const applied = payments.reduce((total, payment) => total + Number(payment.amount_applied_centavos || 0), 0); const tendered = payments.reduce((total, payment) => total + Number(payment.tendered_centavos || 0), 0); const change = payments.reduce((total, payment) => total + Number(payment.change_due_centavos || 0), 0);
  doc.moveDown().text(`Cash tendered: ${pesos(tendered)}`).text(`Amount applied: ${pesos(applied)}`).text(`Balance due: ${pesos(Number(invoice.gross_centavos) - applied)}`).text(`Change due: ${pesos(change)}`);
  doc.moveDown(2).fillColor('#64748B').fontSize(8).text('QA-only landlord billing record. This is not a tenant POS receipt and does not affect company access.', { align: 'center' }); doc.end();
});
