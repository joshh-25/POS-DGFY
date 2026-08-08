import 'dotenv/config';
import express from 'express';
import { requireBridgeAuth } from './auth/bridgeAuth.js';
import { openDrawer } from './drawer/openDrawer.js';
import { runtimeConfig } from './config/runtime.js';
import { logError, logInfo } from './bridgeLogger.js';
import { listUsbPrinters, printTestReceipt, printReceiptPayload, printShiftSummaryPayload, printZReadingPayload } from './printers/usbPrinter.js';

const app = express();

app.use(express.json({ limit: '256kb' }));

app.get('/health', (_request, response) => {
  response.json({
    ok: true,
    service: 'pos-device-bridge',
    host: runtimeConfig.host,
    port: runtimeConfig.port,
    authMode: runtimeConfig.apiKey ? 'api-key' : 'development-open',
    timestamp: new Date().toISOString(),
  });
});

app.use(requireBridgeAuth);

app.get('/device/status', async (_request, response) => {
  try {
    const printers = await listUsbPrinters();
    response.json({
      ok: true,
      service: 'pos-device-bridge',
      authRequired: Boolean(runtimeConfig.apiKey),
      printerStrategy: 'usb-escpos',
      configuredPrinter: runtimeConfig.printerSelector,
      cashDrawerPin: runtimeConfig.cashDrawerPin,
      printersDetected: printers.length,
      printers,
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    logError('status probe failed', error);
    response.status(500).json({
      ok: false,
      error: 'DEVICE_STATUS_FAILED',
      message: error.message,
    });
  }
});

app.get('/device/printers', async (_request, response) => {
  try {
    const printers = await listUsbPrinters();
    response.json({
      ok: true,
      printers,
    });
  } catch (error) {
    logError('printer discovery failed', error);
    response.status(500).json({
      ok: false,
      error: 'PRINTER_DISCOVERY_FAILED',
      message: error.message,
    });
  }
});

app.post('/device/test-print', async (request, response) => {
  try {
    const { message, copies = 1 } = request.body ?? {};
    const result = await printTestReceipt({ message, copies });
    response.json({
      ok: true,
      result,
    });
  } catch (error) {
    logError('test print failed', error);
    response.status(500).json({
      ok: false,
      error: 'TEST_PRINT_FAILED',
      message: error.message,
    });
  }
});

app.post('/device/print-receipt', async (request, response) => {
  try {
    const { receipt, copies = 1 } = request.body ?? {};
    const result = await printReceiptPayload({ receipt, copies });
    response.json({
      ok: true,
      result,
    });
  } catch (error) {
    logError('receipt print failed', error);
    response.status(500).json({
      ok: false,
      error: 'RECEIPT_PRINT_FAILED',
      message: error.message,
    });
  }
});

app.post('/device/print-shift-summary', async (request, response) => {
  try {
    const { shift_summary: shiftSummary, copies = 1 } = request.body ?? {};
    const result = await printShiftSummaryPayload({ shiftSummary, copies });
    response.json({
      ok: true,
      result,
    });
  } catch (error) {
    logError('shift summary print failed', error);
    response.status(500).json({
      ok: false,
      error: 'SHIFT_SUMMARY_PRINT_FAILED',
      message: error.message,
    });
  }
});

app.post('/device/print-z-reading', async (request, response) => {
  try {
    const { z_reading: zReading, copies = 1 } = request.body ?? {};
    const result = await printZReadingPayload({ zReading, copies });
    response.json({
      ok: true,
      result,
    });
  } catch (error) {
    logError('Z-reading print failed', error);
    response.status(500).json({
      ok: false,
      error: 'Z_READING_PRINT_FAILED',
      message: error.message,
    });
  }
});

app.post('/device/open-drawer', async (request, response) => {
  try {
    const { reason = 'manual-test', pin } = request.body ?? {};
    const result = await openDrawer({ reason, pin });
    response.json({
      ok: true,
      result,
    });
  } catch (error) {
    logError('drawer open failed', error);
    response.status(500).json({
      ok: false,
      error: 'OPEN_DRAWER_FAILED',
      message: error.message,
    });
  }
});

app.use((error, _request, response, _next) => {
  logError('unhandled bridge error', error);
  response.status(500).json({
    ok: false,
    error: 'DEVICE_BRIDGE_UNHANDLED',
    message: error.message,
  });
});

app.listen(runtimeConfig.port, runtimeConfig.host, () => {
  logInfo('device bridge listening', {
    host: runtimeConfig.host,
    port: runtimeConfig.port,
    authRequired: Boolean(runtimeConfig.apiKey),
  });
});
