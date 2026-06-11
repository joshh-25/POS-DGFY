import USBAdapter from '@node-escpos/usb-adapter';
import { Printer } from '@node-escpos/core';
import { runtimeConfig } from '../config/runtime.js';
import { buildReceiptLines } from '../receipts/receiptFormatter.js';
import { buildTestReceipt } from '../receipts/testReceiptBuilder.js';

const formatHex = (value) => {
  if (typeof value !== 'number') {
    return null;
  }

  return `0x${value.toString(16).padStart(4, '0')}`;
};

const describeUsbDevice = (device) => {
  const descriptor = device?.deviceDescriptor ?? {};
  return {
    vendorId: descriptor.idVendor ?? null,
    productId: descriptor.idProduct ?? null,
    vendorIdHex: formatHex(descriptor.idVendor),
    productIdHex: formatHex(descriptor.idProduct),
    busNumber: device?.busNumber ?? null,
    deviceAddress: device?.deviceAddress ?? null,
    serialNumber: device?.serialNumber ?? null,
  };
};

const getConfiguredDevice = async () => {
  if (runtimeConfig.usbSerial) {
    const device = await USBAdapter.getDeviceBySerial(runtimeConfig.usbSerial);
    if (!device) {
      throw new Error(`Configured USB printer serial "${runtimeConfig.usbSerial}" was not found.`);
    }

    return device;
  }

  if (runtimeConfig.usbVendorId && runtimeConfig.usbProductId) {
    const device = await USBAdapter.getDevice(
      runtimeConfig.usbVendorId,
      runtimeConfig.usbProductId
    );
    if (!device) {
      throw new Error(
        `Configured USB printer ${formatHex(runtimeConfig.usbVendorId)}:${formatHex(runtimeConfig.usbProductId)} was not found.`
      );
    }

    return device;
  }

  const printers = USBAdapter.findPrinter();
  if (!printers.length) {
    throw new Error('No USB ESC/POS printers were detected.');
  }

  return printers[0];
};

const openAdapter = (adapter) =>
  new Promise((resolve, reject) => {
    adapter.open((error) => {
      if (error) {
        reject(error);
        return;
      }

      resolve();
    });
  });

export const listUsbPrinters = async () => {
  const printers = USBAdapter.findPrinter();
  return printers.map(describeUsbDevice);
};

const withPrinter = async (work) => {
  const device = await getConfiguredDevice();
  const adapter = new USBAdapter(device);
  await openAdapter(adapter);

  const printer = new Printer(adapter, {
    encoding: runtimeConfig.printerEncoding,
    width: runtimeConfig.printerWidth,
  });

  try {
    const result = await work(printer, describeUsbDevice(device));
    await printer.close();
    return result;
  } catch (error) {
    try {
      await printer.close();
    } catch {
      // Ignore close failures and preserve the original error.
    }
    throw error;
  }
};

export const printTestReceipt = async ({ message, copies = 1 } = {}) => {
  const receiptLines = buildTestReceipt({
    message,
    width: runtimeConfig.printerWidth,
  });
  const safeCopies = Math.max(1, Math.min(Number.parseInt(copies, 10) || 1, 5));

  return withPrinter(async (printer, device) => {
    for (let index = 0; index < safeCopies; index += 1) {
      printer
        .align('ct')
        .style('b')
        .size(1, 1);

      receiptLines.forEach((line) => {
        printer.println(line);
      });

      printer
        .style('normal')
        .align('lt')
        .println('')
        .cut();

      await printer.flush();
    }

    return {
      copies: safeCopies,
      device,
    };
  });
};

export const printReceiptPayload = async ({ receipt, copies = 1 } = {}) => {
  if (!receipt || typeof receipt !== 'object' || Array.isArray(receipt)) {
    throw new Error('receipt payload is required');
  }

  const receiptLines = buildReceiptLines(receipt, {
    width: runtimeConfig.printerWidth
  });
  const safeCopies = Math.max(1, Math.min(Number.parseInt(copies, 10) || 1, 5));

  return withPrinter(async (printer, device) => {
    for (let index = 0; index < safeCopies; index += 1) {
      printer.align('lt').style('normal').size(1, 1);

      receiptLines.forEach((line) => {
        printer.println(line);
      });

      printer.style('normal').align('lt').println('').cut();
      await printer.flush();
    }

    return {
      copies: safeCopies,
      device,
      invoiceNumber: receipt?.transaction?.invoice_number || null,
      transactionId: receipt?.transaction?.pos_transaction_id || null
    };
  });
};

export const pulseCashDrawer = async ({ pin = runtimeConfig.cashDrawerPin } = {}) =>
  withPrinter(async (printer, device) => {
    printer.cashdraw(pin);
    await printer.flush();

    return {
      pin,
      device,
    };
  });
