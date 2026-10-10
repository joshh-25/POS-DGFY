import crypto from 'node:crypto';
import { raiseSmsOperationalAlert } from '../adapters/operationalAlertAdapter.js';
import { resolveSmsAdapter, isSmsDeliveryLogEnabled } from '../adapters/index.js';
import { coarsePrefix, hashPhone, toE164 } from '../utils/phoneNumber.js';

const PURPOSES = new Set(['transactional_order', 'promotional']);
const makeId = () => crypto.randomUUID();
const toErrorText = (value) => String(value || '').slice(0, 500) || null;

let repositoryOverride = null;
export const setSmsDeliveryLogRepository = (repository) => { repositoryOverride = repository; };
const getRepository = async () => repositoryOverride || (await import('../repositories/smsDeliveryLogRepository.js')).smsDeliveryLogRepository;

const recordFailureAlert = async (deliveryId, provider, errorCode) => raiseSmsOperationalAlert({
  key: 'sms.send_failed',
  context: { delivery_id: deliveryId, provider, error_code: errorCode || 'SMS_SEND_FAILED' }
});

const deriveDedupeKey = (key, recipientHash) => {
  if (!key) return null;
  const keyHash = crypto.createHash('sha256').update(String(key)).digest('hex').slice(0, 32);
  return `${keyHash}:${recipientHash}`;
};

const resolveMessage = ({ content, template, data }) => {
  if (typeof content === 'string') return content;
  if (!template) return '';
  try {
    return JSON.stringify({ template, data: data || {} });
  } catch {
    return '';
  }
};

const existingResult = (row) => ({
  id: row.id,
  recipientHash: row.recipient_phone_hash,
  status: row.status,
  simulated: Boolean(row.simulated)
});

export const sendSmsUseCase = async ({
  recipients = [], purpose, content, template, data, tenantId = null, orderId = null, correlation = null, dedupeKey = null
} = {}, { repository = null, adapterResolver = resolveSmsAdapter } = {}) => {
  const deliveries = [];
  const repo = repository || await getRepository().catch(() => null);
  const message = resolveMessage({ content, template, data });
  const validPurpose = PURPOSES.has(purpose);

  for (const recipient of Array.isArray(recipients) ? recipients : []) {
    const normalized = toE164(recipient);
    const phoneForHash = normalized.ok ? normalized.e164 : String(recipient ?? '').trim();
    let recipientHash;
    try {
      recipientHash = hashPhone(phoneForHash || '');
    } catch {
      recipientHash = crypto.createHmac('sha256', crypto.randomBytes(32)).update(phoneForHash || '').digest('hex');
    }
    const id = makeId();
    let status = 'rejected';
    let provider = 'unconfigured';
    let providerMessageId = null;
    let errorCode = !validPurpose ? 'invalid_purpose' : !normalized.ok ? normalized.reason : !message.trim() ? 'empty_content' : null;
    let errorMessage = null;
    let simulated = false;
    let dedupe = null;
    try { dedupe = deriveDedupeKey(dedupeKey, recipientHash); } catch { errorCode ||= 'invalid_dedupe_key'; }

    if (errorCode) {
      status = 'rejected';
    } else if (repo && dedupe) {
      try {
        const existing = await repo.findByDedupeKey(dedupe);
        if (existing) {
          deliveries.push(existingResult(existing));
          continue;
        }
      } catch { /* Continue; logging is best-effort and must not block delivery. */ }
    }

    if (!errorCode) {
      try {
        const resolved = adapterResolver({ onProductionFakeBlocked: () => {
          void raiseSmsOperationalAlert({ key: 'sms.fake_provider_blocked', level: 'warning', context: { provider: 'fake' } });
        } });
        provider = resolved.mode;
        const outcome = await resolved.adapter.send({ id, to: normalized.e164, purpose, content: message, correlation });
        status = outcome?.status === 'accepted' || outcome?.status === 'rejected' || outcome?.status === 'failed'
          ? outcome.status
          : outcome?.status === 'unconfigured' ? 'unconfigured' : 'failed';
        if (provider === 'unconfigured') status = 'unconfigured';
        providerMessageId = outcome?.providerMessageId || null;
        errorCode = outcome?.errorCode || null;
        errorMessage = toErrorText(outcome?.errorMessage);
        simulated = provider === 'fake' && status === 'accepted' ? true : Boolean(outcome?.simulated);
      } catch (error) {
        status = 'failed';
        errorCode = String(error?.code || 'SMS_ADAPTER_ERROR').slice(0, 80);
        errorMessage = toErrorText(error?.message);
      }
      if (status === 'failed') await recordFailureAlert(id, provider, errorCode).catch(() => {});
    }

    const result = { id, recipientHash, status, simulated };
    deliveries.push(result);
    if (repo && isSmsDeliveryLogEnabled()) {
      try {
        await repo.create({
          id,
          dedupe_key: dedupe,
          provider,
          provider_message_id: providerMessageId,
          purpose: PURPOSES.has(purpose) ? purpose : null,
          tenant_id: tenantId,
          order_id: orderId,
          recipient_phone: normalized.ok ? normalized.e164 : null,
          recipient_phone_hash: recipientHash,
          recipient_prefix: normalized.ok ? coarsePrefix(normalized.e164) : null,
          status,
          simulated,
          error_code: errorCode,
          error_message: errorMessage,
          pii_redacted_at: null,
          metadata: null,
          sent_at: new Date()
        });
      } catch (error) {
        if (dedupe) {
          try {
            const existing = await repo.findByDedupeKey(dedupe);
            if (existing) deliveries[deliveries.length - 1] = existingResult(existing);
          } catch { /* Preserve the adapter outcome if the log is unavailable. */ }
        }
        await raiseSmsOperationalAlert({ key: 'sms.delivery_log_write_failed', context: { delivery_id: id }, error }).catch(() => {});
      }
    }
  }

  return { status: deliveries.some((item) => item.status === 'failed') ? 'failed' : 'completed', deliveries };
};

export default sendSmsUseCase;
