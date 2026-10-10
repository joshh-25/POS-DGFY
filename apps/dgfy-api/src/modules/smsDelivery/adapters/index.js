import { fakeSmsAdapter } from './fakeSmsAdapter.js';
import { unconfiguredSmsAdapter } from './unconfiguredSmsAdapter.js';

export const getSmsProviderMode = () => {
  const configuredMode = String(process.env.SMS_PROVIDER || '').trim().toLowerCase();
  if (configuredMode === 'fake' && process.env.NODE_ENV !== 'production') return 'fake';
  if (configuredMode !== 'fake' && configuredMode !== 'unconfigured') return 'unconfigured';
  return configuredMode || 'unconfigured';
};

export const isSmsDeliveryLogEnabled = () => process.env.SMS_DELIVERY_LOG_ENABLED !== 'false';
export const isSmsDeliveryLogRetentionEnabled = () => process.env.SMS_DELIVERY_LOG_RETENTION_ENABLED !== 'false';
export const getSmsDeliveryLogRetentionDays = () => {
  const parsed = Number.parseInt(process.env.SMS_DELIVERY_LOG_RETENTION_DAYS || '30', 10);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : 30;
};

export const resolveSmsAdapter = ({ onProductionFakeBlocked } = {}) => {
  const configuredMode = String(process.env.SMS_PROVIDER || '').trim().toLowerCase();
  if (configuredMode === 'fake' && process.env.NODE_ENV === 'production') {
    onProductionFakeBlocked?.();
    return { mode: 'unconfigured', adapter: unconfiguredSmsAdapter };
  }
  const mode = getSmsProviderMode();
  return { mode, adapter: mode === 'fake' ? fakeSmsAdapter : unconfiguredSmsAdapter };
};
