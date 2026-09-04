import QRCode from 'qrcode';
import { DGFY_BRAND_NAME } from '../model/storefrontConstants.js';
import { money } from './storefrontFormatters.js';

export const downloadDataUrl = (dataUrl, filename) => {
  const link = document.createElement('a');
  link.href = dataUrl;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
};

export const loadImage = (src) => new Promise((resolve, reject) => {
  const image = new Image();
  image.onload = () => resolve(image);
  image.onerror = reject;
  image.src = src;
});

export const formatTicketDate = (value) => {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return 'Unscheduled';
  return date.toLocaleString([], {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit'
  });
};

export const buildTicketImage = async ({ result = {}, storeName = '', cartLines = [], totals = {} } = {}) => {
  const booking = result.booking || null;
  const reference = booking?.public_reference || result.tracking_pin || result.order?.tracking_pin || 'PENDING';
  const typeLabel = booking ? 'SERVICE TICKET' : 'ORDER RECEIPT';
  const paymentStatus = booking?.payment_status || result.order?.payment_status || result.payment_status || 'unpaid';
  const canvas = document.createElement('canvas');
  canvas.width = 900;
  canvas.height = 1250;
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.fillStyle = '#0f172a';
  ctx.font = '700 42px Arial';
  ctx.fillText(typeLabel, 64, 88);
  ctx.font = '700 26px Arial';
  ctx.fillText(storeName || DGFY_BRAND_NAME, 64, 132);
  ctx.font = '400 22px Arial';
  ctx.fillStyle = '#475569';
  ctx.fillText(`Reference: ${reference}`, 64, 182);
  ctx.fillText(`Payment: ${paymentStatus}`, 64, 218);
  if (booking?.start_at) ctx.fillText(`Appointment: ${formatTicketDate(booking.start_at)}`, 64, 254);
  if (booking?.service?.name || booking?.service_name) ctx.fillText(`Service: ${booking.service?.name || booking.service_name}`, 64, 290);
  ctx.strokeStyle = '#cbd5e1';
  ctx.beginPath();
  ctx.moveTo(64, 330);
  ctx.lineTo(836, 330);
  ctx.stroke();
  ctx.fillStyle = '#0f172a';
  ctx.font = '700 24px Arial';
  ctx.fillText('Line Items', 64, 382);
  ctx.font = '400 22px Arial';
  let y = 426;
  cartLines.slice(0, 10).forEach((line) => {
    ctx.fillStyle = '#0f172a';
    ctx.fillText(`${Number(line.quantity || 1)} x ${line.name}`, 64, y);
    ctx.fillStyle = '#475569';
    ctx.fillText(money(Number(line.quantity || 1) * Number(line.price || 0)), 650, y);
    y += 38;
  });
  ctx.strokeStyle = '#cbd5e1';
  ctx.beginPath();
  ctx.moveTo(64, y + 8);
  ctx.lineTo(836, y + 8);
  ctx.stroke();
  y += 58;
  ctx.fillStyle = '#0f172a';
  ctx.font = '700 28px Arial';
  ctx.fillText('Total', 64, y);
  ctx.fillText(money(totals.total_amount || booking?.total_amount || result.order?.total_amount || 0), 650, y);
  y += 56;
  ctx.font = '400 20px Arial';
  ctx.fillStyle = '#64748b';
  ctx.fillText(
    booking
      ? 'Booking ticket - not a fiscal receipt unless marked paid.'
      : 'Digital order receipt/ticket. Keep this image for your records.',
    64,
    y
  );
  const qrPayload = JSON.stringify({ type: booking ? 'service_booking' : 'store_order', reference, store: storeName || '' });
  const qrDataUrl = await QRCode.toDataURL(qrPayload, { margin: 1, width: 220 });
  const qrImage = await loadImage(qrDataUrl);
  ctx.drawImage(qrImage, 340, 900, 220, 220);
  ctx.font = '700 22px Arial';
  ctx.fillStyle = '#0f172a';
  ctx.textAlign = 'center';
  ctx.fillText(reference, 450, 1156);
  ctx.textAlign = 'left';
  return canvas.toDataURL('image/png');
};
