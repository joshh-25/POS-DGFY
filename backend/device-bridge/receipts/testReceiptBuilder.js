export const buildTestReceipt = ({ message, width = 48 }) => {
  const divider = '-'.repeat(Math.max(16, Math.min(width, 64)));
  const normalizedMessage = String(message || 'Printer bridge connectivity check.')
    .replace(/\s+/g, ' ')
    .trim();

  return [
    'DGFY POS DEVICE BRIDGE',
    divider,
    'Test receipt',
    normalizedMessage,
    `Generated: ${new Date().toISOString()}`,
    divider,
    'If this printed correctly,',
    'USB printer communication is working.',
  ];
};
