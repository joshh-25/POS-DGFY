const toInteger = (value, fallback) => {
  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) ? parsed : fallback;
};

const toOptionalInteger = (value) => {
  if (value === undefined || value === null || value === '') {
    return null;
  }

  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) ? parsed : null;
};

const normalizePaperWidthMm = (value, fallback = 80) => {
  const parsed = Number.parseInt(value, 10);
  return parsed === 58 ? 58 : (parsed === 80 ? 80 : fallback);
};

export const runtimeConfig = {
  host: process.env.DEVICE_BRIDGE_HOST || '127.0.0.1',
  port: toInteger(process.env.DEVICE_BRIDGE_PORT, 5101),
  apiKey: process.env.DEVICE_BRIDGE_API_KEY || '',
  usbVendorId: toOptionalInteger(process.env.DEVICE_BRIDGE_USB_VENDOR_ID),
  usbProductId: toOptionalInteger(process.env.DEVICE_BRIDGE_USB_PRODUCT_ID),
  usbSerial: process.env.DEVICE_BRIDGE_USB_SERIAL || '',
  cashDrawerPin: process.env.DEVICE_BRIDGE_CASHDRAWER_PIN === '5' ? 5 : 2,
  printerEncoding: process.env.DEVICE_BRIDGE_PRINTER_ENCODING || 'GB18030',
  printerPaperWidthMm: normalizePaperWidthMm(process.env.DEVICE_BRIDGE_PRINTER_PAPER_MM, 80),
  printerWidth: toInteger(process.env.DEVICE_BRIDGE_PRINTER_WIDTH, normalizePaperWidthMm(process.env.DEVICE_BRIDGE_PRINTER_PAPER_MM, 80) === 58 ? 32 : 48),
};

export const printerSelector = (() => {
  if (runtimeConfig.usbSerial) {
    return {
      mode: 'serial',
      usbSerial: runtimeConfig.usbSerial,
    };
  }

  if (runtimeConfig.usbVendorId && runtimeConfig.usbProductId) {
    return {
      mode: 'vendor-product',
      usbVendorId: runtimeConfig.usbVendorId,
      usbProductId: runtimeConfig.usbProductId,
    };
  }

  return {
    mode: 'first-detected',
  };
})();

runtimeConfig.printerSelector = printerSelector;
