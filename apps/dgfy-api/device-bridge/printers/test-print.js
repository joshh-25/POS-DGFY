import 'dotenv/config';
import { printTestReceipt } from './usbPrinter.js';

const message = process.argv.slice(2).join(' ').trim() || 'Hardware proof print from standalone Node script.';

const main = async () => {
  const result = await printTestReceipt({ message, copies: 1 });
  console.log(
    JSON.stringify(
      {
        ok: true,
        action: 'test-print',
        message,
        result,
      },
      null,
      2
    )
  );
};

main().catch((error) => {
  console.error(
    JSON.stringify(
      {
        ok: false,
        error: 'TEST_PRINT_FAILED',
        message: error.message,
      },
      null,
      2
    )
  );
  process.exitCode = 1;
});
