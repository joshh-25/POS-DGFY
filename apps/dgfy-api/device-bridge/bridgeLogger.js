const formatMessage = (level, message, meta) => {
  const timestamp = new Date().toISOString();
  const suffix = meta && Object.keys(meta).length > 0
    ? ` ${JSON.stringify(meta)}`
    : '';
  return `[${timestamp}] [pos-device-bridge] [${level}] ${message}${suffix}`;
};

const normalizeError = (error) => {
  if (!error) return {};
  if (error instanceof Error) {
    return {
      message: error.message,
      stack: error.stack,
    };
  }
  return { error };
};

export const logInfo = (message, meta = {}) => {
  console.log(formatMessage('info', message, meta));
};

export const logError = (message, error) => {
  console.error(formatMessage('error', message, normalizeError(error)));
};
