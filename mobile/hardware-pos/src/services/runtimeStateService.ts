import type { MobilePosClientConfig } from '../api/mobilePosClient';
import type { CatalogProduct } from '../domain/catalog';
import type { PosTextScale } from '../domain/textScale';
import type { SqliteDriver } from '../db/driver';

export interface PersistedCashierSession {
    sessionId: string;
    cashierId: number;
    cashierName: string;
    roleCode: string;
    permissions?: string[];
    openedAt: string;
    status: 'active' | 'locked';
}

export interface PersistedShiftState {
    shiftId: string;
    cashierId: number;
    openingCashAmount: number;
    openedAt: string;
    status: 'open' | 'closed';
}

const AUTH_CONFIG_KEY = 'auth_config';
const CATALOG_CACHE_KEY = 'catalog_cache';
const BOOTSTRAP_CACHE_KEY = 'bootstrap_cache';
const OFFLINE_AUTH_PROFILE_KEY = 'offline_auth_profile';
const TEXT_SCALE_PREFERENCE_KEY = 'text_scale_preference';

export interface PersistedCatalogCache {
    savedAt: string;
    items: CatalogProduct[];
}

export interface PersistedBootstrapCache {
    savedAt: string;
    settingsSummary: string;
    devicePolicySummary: string;
}

export interface PersistedOfflineAuthProfile {
    cashierId: number;
    cashierName: string;
    email: string;
    roleCode: string;
    tenantId: string;
    companyName: string;
    companyToken: string;
    baseUrl: string;
    pinHash: string;
    authorizedAt: string;
}

export interface CachedCashierProfileRecord {
    cashierId: number;
    displayName: string;
    roleCode: string;
    authorizationSnapshot: Record<string, unknown>;
    cachedAt: string;
}

export class RuntimeStateService {
    constructor(private readonly driver: SqliteDriver) {}

    async saveAuthConfig(config: MobilePosClientConfig): Promise<void> {
        await this.saveRuntimeState(AUTH_CONFIG_KEY, config);
    }

    async getAuthConfig(): Promise<MobilePosClientConfig | null> {
        return await this.getRuntimeState<MobilePosClientConfig>(AUTH_CONFIG_KEY);
    }

    async clearAuthConfig(): Promise<void> {
        await this.driver.execute({
            sql: 'DELETE FROM app_runtime_state WHERE state_key = ?;',
            params: [AUTH_CONFIG_KEY]
        });
    }

    async saveCatalogCache(cache: PersistedCatalogCache): Promise<void> {
        await this.saveRuntimeState(CATALOG_CACHE_KEY, cache);
    }

    async getCatalogCache(): Promise<PersistedCatalogCache | null> {
        return await this.getRuntimeState<PersistedCatalogCache>(CATALOG_CACHE_KEY);
    }

    async saveBootstrapCache(cache: PersistedBootstrapCache): Promise<void> {
        await this.saveRuntimeState(BOOTSTRAP_CACHE_KEY, cache);
    }

    async getBootstrapCache(): Promise<PersistedBootstrapCache | null> {
        return await this.getRuntimeState<PersistedBootstrapCache>(BOOTSTRAP_CACHE_KEY);
    }

    async saveOfflineAuthProfile(profile: PersistedOfflineAuthProfile): Promise<void> {
        await this.saveRuntimeState(OFFLINE_AUTH_PROFILE_KEY, profile);
    }

    async getOfflineAuthProfile(): Promise<PersistedOfflineAuthProfile | null> {
        return await this.getRuntimeState<PersistedOfflineAuthProfile>(OFFLINE_AUTH_PROFILE_KEY);
    }

    async saveTextScalePreference(scale: PosTextScale): Promise<void> {
        await this.saveRuntimeState(TEXT_SCALE_PREFERENCE_KEY, scale);
    }

    async getTextScalePreference(): Promise<PosTextScale | null> {
        return await this.getRuntimeState<PosTextScale>(TEXT_SCALE_PREFERENCE_KEY);
    }

    async clearOfflineAuthProfile(): Promise<void> {
        await this.driver.execute({
            sql: 'DELETE FROM app_runtime_state WHERE state_key = ?;',
            params: [OFFLINE_AUTH_PROFILE_KEY]
        });
    }

    async saveCashierSession(session: PersistedCashierSession): Promise<void> {
        await this.driver.transaction(async (tx) => {
            await tx.execute({
                sql: `
                    INSERT INTO cashier_profiles_cache (
                        cashier_id,
                        display_name,
                        role_code,
                        authorization_snapshot_json,
                        cached_at
                    ) VALUES (?, ?, ?, ?, ?)
                    ON CONFLICT(cashier_id) DO UPDATE SET
                        display_name = excluded.display_name,
                        role_code = excluded.role_code,
                        authorization_snapshot_json = excluded.authorization_snapshot_json,
                        cached_at = excluded.cached_at;
                `,
                params: [
                    session.cashierId,
                    session.cashierName,
                    session.roleCode,
                    JSON.stringify({
                        cashierName: session.cashierName,
                        sessionId: session.sessionId,
                        roleCode: session.roleCode,
                        permissions: Array.isArray(session.permissions) ? session.permissions : []
                    }),
                    session.openedAt
                ]
            });

            await tx.execute({
                sql: `UPDATE cashier_session SET status = 'locked', locked_at = ? WHERE status = 'active';`,
                params: [session.openedAt]
            });

            await tx.execute({
                sql: `
                    INSERT INTO cashier_session (
                        session_id,
                        cashier_id,
                        status,
                        opened_at,
                        locked_at
                    ) VALUES (?, ?, ?, ?, NULL)
                    ON CONFLICT(session_id) DO UPDATE SET
                        cashier_id = excluded.cashier_id,
                        status = excluded.status,
                        opened_at = excluded.opened_at,
                        locked_at = excluded.locked_at;
                `,
                params: [
                    session.sessionId,
                    session.cashierId,
                    session.status,
                    session.openedAt
                ]
            });
        });
    }

    async getActiveCashierSession(): Promise<PersistedCashierSession | null> {
        const rows = await this.driver.query<{
            session_id: string;
            cashier_id: number;
            display_name: string;
            role_code: string;
            opened_at: string;
            status: 'active' | 'locked';
        }>({
            sql: `
                SELECT cs.session_id, cs.cashier_id, cpc.display_name, cpc.role_code, cs.opened_at, cs.status
                FROM cashier_session cs
                LEFT JOIN cashier_profiles_cache cpc ON cpc.cashier_id = cs.cashier_id
                WHERE cs.status = 'active'
                ORDER BY cs.opened_at DESC
                LIMIT 1;
            `
        });

        const row = rows[0];
        if (!row) {
            return null;
        }

        return {
            sessionId: row.session_id,
            cashierId: Number(row.cashier_id),
            cashierName: row.display_name || 'Cashier',
            roleCode: row.role_code || 'cashier',
            openedAt: row.opened_at,
            status: row.status
        };
    }

    async listCachedCashierProfiles(): Promise<CachedCashierProfileRecord[]> {
        const rows = await this.driver.query<{
            cashier_id: number;
            display_name: string;
            role_code: string;
            authorization_snapshot_json: string;
            cached_at: string;
        }>({
            sql: `
                SELECT cashier_id, display_name, role_code, authorization_snapshot_json, cached_at
                FROM cashier_profiles_cache
                ORDER BY cached_at DESC;
            `
        });

        return rows.map((row) => ({
            cashierId: Number(row.cashier_id),
            displayName: row.display_name || 'Cashier',
            roleCode: row.role_code || 'cashier',
            authorizationSnapshot: row.authorization_snapshot_json
                ? JSON.parse(row.authorization_snapshot_json)
                : {},
            cachedAt: row.cached_at
        }));
    }

    async removeCachedCashierProfile(cashierId: number): Promise<void> {
        await this.driver.transaction(async (tx) => {
            await tx.execute({
                sql: 'DELETE FROM cashier_profiles_cache WHERE cashier_id = ?;',
                params: [cashierId]
            });

            await tx.execute({
                sql: 'DELETE FROM cashier_session WHERE cashier_id = ? AND status = ?;',
                params: [cashierId, 'locked']
            });
        });
    }

    async lockCashierSession(lockedAt: string): Promise<void> {
        await this.driver.execute({
            sql: `UPDATE cashier_session SET status = 'locked', locked_at = ? WHERE status = 'active';`,
            params: [lockedAt]
        });
    }

    async saveShiftState(shift: PersistedShiftState): Promise<void> {
        await this.driver.execute({
            sql: `
                INSERT INTO shift_state (
                    shift_id,
                    cashier_id,
                    opening_cash_amount,
                    status,
                    opened_at,
                    closed_at
                ) VALUES (?, ?, ?, ?, ?, NULL)
                ON CONFLICT(shift_id) DO UPDATE SET
                    cashier_id = excluded.cashier_id,
                    opening_cash_amount = excluded.opening_cash_amount,
                    status = excluded.status,
                    opened_at = excluded.opened_at,
                    closed_at = excluded.closed_at;
            `,
            params: [
                shift.shiftId,
                shift.cashierId,
                shift.openingCashAmount,
                shift.status,
                shift.openedAt
            ]
        });
    }

    async getActiveShiftState(): Promise<PersistedShiftState | null> {
        const rows = await this.driver.query<{
            shift_id: string;
            cashier_id: number;
            opening_cash_amount: number;
            opened_at: string;
            status: 'open' | 'closed';
        }>({
            sql: `
                SELECT shift_id, cashier_id, opening_cash_amount, opened_at, status
                FROM shift_state
                WHERE status = 'open'
                ORDER BY opened_at DESC
                LIMIT 1;
            `
        });

        const row = rows[0];
        if (!row) {
            return null;
        }

        return {
            shiftId: row.shift_id,
            cashierId: Number(row.cashier_id),
            openingCashAmount: Number(row.opening_cash_amount),
            openedAt: row.opened_at,
            status: row.status
        };
    }

    async closeShift(shiftId: string, closedAt: string): Promise<void> {
        await this.driver.execute({
            sql: `
                UPDATE shift_state
                SET status = 'closed',
                    closed_at = ?
                WHERE shift_id = ?;
            `,
            params: [closedAt, shiftId]
        });
    }

    private async saveRuntimeState(key: string, payload: unknown): Promise<void> {
        const updatedAt = new Date().toISOString();
        await this.driver.execute({
            sql: `
                INSERT INTO app_runtime_state (
                    state_key,
                    state_json,
                    updated_at
                ) VALUES (?, ?, ?)
                ON CONFLICT(state_key) DO UPDATE SET
                    state_json = excluded.state_json,
                    updated_at = excluded.updated_at;
            `,
            params: [key, JSON.stringify(payload), updatedAt]
        });
    }

    private async getRuntimeState<T>(key: string): Promise<T | null> {
        const rows = await this.driver.query<{ state_json: string }>({
            sql: `SELECT state_json FROM app_runtime_state WHERE state_key = ? LIMIT 1;`,
            params: [key]
        });

        const row = rows[0];
        if (!row?.state_json) {
            return null;
        }

        return JSON.parse(row.state_json) as T;
    }
}
