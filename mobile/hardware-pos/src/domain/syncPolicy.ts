import type { SyncAllowance, SyncPolicyRecord } from './types';

export interface SyncAuthorizationInput {
    now: Date;
    policy: SyncPolicyRecord;
}

export interface SyncAuthorizationResult {
    allowed: boolean;
    allowance: SyncAllowance;
    reason: 'within_daily_limit' | 'daily_limit_reached';
    nextAllowedSyncAt: string | null;
}

export interface SyncCompletionInput {
    now: Date;
    policy: SyncPolicyRecord;
    durableCheckpointReturned: boolean;
    checkpointToken: string | null;
    replayAcceptedCount: number;
}

const MAX_SUCCESSFUL_SYNCS_PER_DAY = 2;

const toBusinessDayKey = (value: Date) => value.toISOString().slice(0, 10);

const toAllowance = (count: number): SyncAllowance => {
    if (count <= 0) return '0/2';
    if (count === 1) return '1/2';
    return '2/2';
};

export const resetPolicyForNewBusinessDay = (
    policy: SyncPolicyRecord,
    now: Date
): SyncPolicyRecord => {
    const businessDayKey = toBusinessDayKey(now);
    if (policy.businessDayKey === businessDayKey) {
        return policy;
    }

    return {
        ...policy,
        businessDayKey,
        successfulSyncCountToday: 0,
        lastSuccessfulSyncAt: null,
        nextAllowedSyncAt: null
    };
};

export const authorizeManualSync = ({
    now,
    policy
}: SyncAuthorizationInput): SyncAuthorizationResult => {
    const normalizedPolicy = resetPolicyForNewBusinessDay(policy, now);
    const successfulCount = normalizedPolicy.successfulSyncCountToday;

    if (successfulCount >= MAX_SUCCESSFUL_SYNCS_PER_DAY) {
        return {
            allowed: false,
            allowance: '2/2',
            reason: 'daily_limit_reached',
            nextAllowedSyncAt: normalizedPolicy.nextAllowedSyncAt
        };
    }

    return {
        allowed: true,
        allowance: toAllowance(successfulCount),
        reason: 'within_daily_limit',
        nextAllowedSyncAt: normalizedPolicy.nextAllowedSyncAt
    };
};

export const applySyncCompletion = ({
    now,
    policy,
    durableCheckpointReturned,
    checkpointToken,
    replayAcceptedCount
}: SyncCompletionInput): SyncPolicyRecord => {
    const normalizedPolicy = resetPolicyForNewBusinessDay(policy, now);
    const consumedSlot = durableCheckpointReturned && replayAcceptedCount > 0;

    if (!consumedSlot) {
        return {
            ...normalizedPolicy,
            lastCheckpoint: checkpointToken ?? normalizedPolicy.lastCheckpoint
        };
    }

    const nextCount = Math.min(
        normalizedPolicy.successfulSyncCountToday + 1,
        MAX_SUCCESSFUL_SYNCS_PER_DAY
    );
    const nextAllowedSyncAt = nextCount >= MAX_SUCCESSFUL_SYNCS_PER_DAY
        ? new Date(Date.UTC(
            now.getUTCFullYear(),
            now.getUTCMonth(),
            now.getUTCDate() + 1,
            normalizedPolicy.resetHour,
            normalizedPolicy.resetMinute,
            0,
            0
        )).toISOString()
        : null;

    return {
        ...normalizedPolicy,
        successfulSyncCountToday: nextCount,
        lastSuccessfulSyncAt: now.toISOString(),
        nextAllowedSyncAt,
        lastCheckpoint: checkpointToken ?? normalizedPolicy.lastCheckpoint
    };
};
