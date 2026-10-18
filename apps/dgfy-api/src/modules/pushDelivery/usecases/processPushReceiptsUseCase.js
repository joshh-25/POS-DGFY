import { toSafePushErrorCode } from '../utils/pushTokenSecurity.js';

const RECEIPT_DELAY_MS = 15 * 60 * 1000;
const RECEIPT_TTL_MS = 24 * 60 * 60 * 1000;
const MAX_RECEIPTS_PER_REQUEST = 1000;

const chunk = (items, size) => {
    const result = [];
    for (let index = 0; index < items.length; index += size) result.push(items.slice(index, index + size));
    return result;
};

export const buildProcessPushReceiptsUseCase = ({ repository, adapterResolver, now = () => new Date() }) => async () => {
    const currentTime = now();
    const { mode, adapter } = adapterResolver();
    if (mode !== 'expo') return { status: 'skipped', reason: 'expo_provider_not_enabled', checked: 0 };

    const candidates = await repository.findReceiptCandidates({
        olderThan: new Date(currentTime.getTime() - RECEIPT_DELAY_MS),
        youngerThan: new Date(currentTime.getTime() - RECEIPT_TTL_MS),
        limit: MAX_RECEIPTS_PER_REQUEST
    });
    let checked = 0;
    let notReady = 0;
    let failedBatches = 0;
    for (const batch of chunk(candidates, MAX_RECEIPTS_PER_REQUEST)) {
        const ids = batch.map((row) => row.ticket_id).filter(Boolean);
        if (!ids.length) continue;
        let receipts;
        try {
            receipts = await adapter.getReceipts(ids);
        } catch {
            failedBatches += 1;
            continue;
        }
        for (const row of batch) {
            const receipt = receipts?.[row.ticket_id];
            if (!receipt) {
                notReady += 1;
                continue;
            }
            const errorCode = receipt?.details?.error
                ? toSafePushErrorCode(receipt.details.error)
                : receipt?.status === 'error'
                    ? 'receipt_error'
                    : null;
            await repository.updateById(row.id, {
                receipt_status: String(receipt.status || 'unknown').slice(0, 80),
                receipt_checked_at: currentTime,
                ...(errorCode ? { error_code: errorCode } : {})
            });
            if (errorCode === 'devicenotregistered' || errorCode === 'device_not_registered') {
                await repository.revokeTokenById(row.token_id, 'device_not_registered');
            }
            checked += 1;
        }
    }
    return { status: 'completed', checked, not_ready: notReady, failed_batches: failedBatches };
};

export default buildProcessPushReceiptsUseCase;
