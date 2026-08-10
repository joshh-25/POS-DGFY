import 'dotenv/config';
import { listUsbPrinters } from './usbPrinter.js';

const main = async () => {
  const printers = await listUsbPrinters();
  console.log(JSON.stringify({ ok: true, printersDetected: printers.length, printers }, null, 2));
};

main().catch((error) => {
  console.error(
    JSON.stringify(
      {
        ok: false,
        error: 'PRINTER_DISCOVERY_FAILED',
        message: error.message,
      },
      null,
      2
    )
  );
  process.exitCode = 1;
});
