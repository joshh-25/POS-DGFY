import { pulseCashDrawer } from '../printers/usbPrinter.js';

export const openDrawer = async ({ reason = 'manual-test', pin } = {}) => {
  const result = await pulseCashDrawer({ pin });

  return {
    ...result,
    reason,
    openedAt: new Date().toISOString(),
  };
};
