import { runtimeConfig } from '../config/runtime.js';

export const requireBridgeAuth = (request, response, next) => {
  if (!runtimeConfig.apiKey) {
    return next();
  }

  const requestKey = request.get('x-device-bridge-key');
  if (requestKey !== runtimeConfig.apiKey) {
    return response.status(401).json({
      ok: false,
      error: 'DEVICE_BRIDGE_UNAUTHORIZED',
      message: 'Missing or invalid device bridge API key.',
    });
  }

  return next();
};
