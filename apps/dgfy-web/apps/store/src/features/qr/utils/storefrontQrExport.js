import QRCode from 'qrcode';

const DGFY_FALLBACK_LOGO_URL = '/dgfy-symbologo.png';
const DGFY_HORIZONTAL_LOGO_URL = '/dgfy-logo.png';

const resolveImageUrl = (src) => {
  const trimmed = String(src || '').trim();
  if (!trimmed) return '';
  try {
    return new URL(trimmed, window.location.origin).href;
  } catch {
    return trimmed;
  }
};

const loadImage = (src) => new Promise((resolve, reject) => {
  const image = new Image();
  image.crossOrigin = 'anonymous';
  image.onload = () => resolve(image);
  image.onerror = reject;
  image.src = src;
});

const loadFirstAvailableImage = async (sources = []) => {
  for (const source of sources) {
    const resolved = resolveImageUrl(source);
    if (!resolved) continue;
    try {
      // eslint-disable-next-line no-await-in-loop
      return await loadImage(resolved);
    } catch {
      // Try the next candidate.
    }
  }
  throw new Error('Unable to load any image source.');
};

const buildStoreLogoCandidates = (storeLogoUrl = '') => {
  const raw = String(storeLogoUrl || '').trim();
  if (!raw) return [DGFY_FALLBACK_LOGO_URL];

  const candidates = new Set([
    raw,
    resolveImageUrl(raw)
  ]);

  if (raw.startsWith('/')) {
    const withoutLeadingSlash = raw.replace(/^\/+/, '');
    candidates.add(`/${withoutLeadingSlash}`);
    candidates.add(withoutLeadingSlash);
  }

  return [...candidates].filter(Boolean);
};

const fillRoundedRect = (ctx, x, y, width, height, radius, fillStyle) => {
  ctx.save();
  ctx.beginPath();
  ctx.moveTo(x + radius, y);
  ctx.arcTo(x + width, y, x + width, y + height, radius);
  ctx.arcTo(x + width, y + height, x, y + height, radius);
  ctx.arcTo(x, y + height, x, y, radius);
  ctx.arcTo(x, y, x + width, y, radius);
  ctx.closePath();
  ctx.fillStyle = fillStyle;
  ctx.fill();
  ctx.restore();
};

const strokeRoundedRect = (ctx, x, y, width, height, radius, strokeStyle, lineWidth = 1) => {
  ctx.save();
  ctx.beginPath();
  ctx.moveTo(x + radius, y);
  ctx.arcTo(x + width, y, x + width, y + height, radius);
  ctx.arcTo(x + width, y + height, x, y + height, radius);
  ctx.arcTo(x, y + height, x, y, radius);
  ctx.arcTo(x, y, x + width, y, radius);
  ctx.closePath();
  ctx.lineWidth = lineWidth;
  ctx.strokeStyle = strokeStyle;
  ctx.stroke();
  ctx.restore();
};

const drawImageCover = (ctx, image, x, y, width, height, radius = 0) => {
  const imageRatio = image.width / image.height;
  const frameRatio = width / height;
  let drawWidth = width;
  let drawHeight = height;
  let drawX = x;
  let drawY = y;

  if (imageRatio > frameRatio) {
    drawWidth = height * imageRatio;
    drawX = x - ((drawWidth - width) / 2);
  } else {
    drawHeight = width / imageRatio;
    drawY = y - ((drawHeight - height) / 2);
  }

  ctx.save();
  if (radius > 0) {
    ctx.beginPath();
    ctx.moveTo(x + radius, y);
    ctx.arcTo(x + width, y, x + width, y + height, radius);
    ctx.arcTo(x + width, y + height, x, y + height, radius);
    ctx.arcTo(x, y + height, x, y, radius);
    ctx.arcTo(x, y, x + width, y, radius);
    ctx.closePath();
    ctx.clip();
  }
  ctx.drawImage(image, drawX, drawY, drawWidth, drawHeight);
  ctx.restore();
};

export const downloadDataUrl = (dataUrl, filename) => {
  const link = document.createElement('a');
  link.href = dataUrl;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
};

export const buildStorefrontQrExportImage = async ({
  storeUrl = '',
  storeName = 'Storefront',
  storeLogoUrl = '',
  accentColor = '#f97316'
} = {}) => {
  if (!storeUrl) throw new Error('Storefront URL is required.');

  const exportScale = 2;
  const width = 960;
  const height = 1180;
  const canvas = document.createElement('canvas');
  canvas.width = width * exportScale;
  canvas.height = height * exportScale;
  const ctx = canvas.getContext('2d');
  ctx.scale(exportScale, exportScale);

  fillRoundedRect(ctx, 0, 0, width, height, 0, '#f8fafc');
  fillRoundedRect(ctx, 40, 40, width - 80, height - 80, 32, '#ffffff');
  strokeRoundedRect(ctx, 40, 40, width - 80, height - 80, 32, '#dbe5ee', 1.5);

  const storeLogoCandidates = buildStoreLogoCandidates(storeLogoUrl);

  try {
    const dgfyLogo = await loadFirstAvailableImage([DGFY_HORIZONTAL_LOGO_URL, DGFY_FALLBACK_LOGO_URL]);
    drawImageCover(ctx, dgfyLogo, 290, 96, 380, 82, 0);
  } catch {
    ctx.fillStyle = '#0f172a';
    ctx.textAlign = 'center';
    ctx.font = '700 24px Arial';
    ctx.fillText('DGFY', width / 2, 146);
    ctx.textAlign = 'left';
  }

  const qrDataUrl = await QRCode.toDataURL(storeUrl, {
    margin: 1,
    width: 640,
    errorCorrectionLevel: 'H',
    color: { dark: '#0f172a', light: '#ffffff' }
  });
  const qrImage = await loadImage(qrDataUrl);

  const qrCardX = 130;
  const qrCardY = 212;
  const qrCardSize = 700;
  fillRoundedRect(ctx, qrCardX, qrCardY, qrCardSize, qrCardSize, 36, '#ffffff');
  strokeRoundedRect(ctx, qrCardX, qrCardY, qrCardSize, qrCardSize, 36, accentColor, 3);
  fillRoundedRect(ctx, qrCardX + 26, qrCardY + 26, qrCardSize - 52, qrCardSize - 52, 28, '#f8fbff');
  ctx.drawImage(qrImage, qrCardX + 74, qrCardY + 74, qrCardSize - 148, qrCardSize - 148);

  fillRoundedRect(ctx, qrCardX + 300, qrCardY + 300, 100, 100, 28, 'rgba(255,255,255,0.97)');
  strokeRoundedRect(ctx, qrCardX + 300, qrCardY + 300, 100, 100, 28, '#dbe5ee', 1);
  try {
    const centerLogo = await loadFirstAvailableImage(storeLogoCandidates);
    drawImageCover(ctx, centerLogo, qrCardX + 320, qrCardY + 320, 60, 60, 18);
  } catch {
    const dgfyLogo = await loadFirstAvailableImage([DGFY_FALLBACK_LOGO_URL]);
    drawImageCover(ctx, dgfyLogo, qrCardX + 320, qrCardY + 320, 60, 60, 18);
  }

  ctx.fillStyle = '#0f172a';
  ctx.textAlign = 'center';
  ctx.font = '700 20px Arial';
  ctx.fillText('Find What You Need', width / 2, 998);
  ctx.font = '400 14px Arial';
  ctx.fillStyle = '#64748b';
  ctx.fillText(storeUrl, width / 2, 1028);
  ctx.textAlign = 'left';

  return canvas.toDataURL('image/png');
};

export default buildStorefrontQrExportImage;
