import 'dotenv/config';
import { openDrawer } from './openDrawer.js';

const reason = process.argv.slice(2).join(' ').trim() || 'hardware-proof';

const main = async () => {
  const result = await openDrawer({ reason });
  console.log(
    JSON.stringify(
      {
        ok: true,
        action: 'open-drawer',
        reason,
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
        error: 'OPEN_DRAWER_FAILED',
        message: error.message,
      },
      null,
      2
    )
  );
  process.exitCode = 1;
});
