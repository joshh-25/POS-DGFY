import { NativeModules } from 'react-native';
import type { NativeSqliteConnection, NativeSqliteResultSet } from '../db/nativeSqliteDriver';
import type { SqlRow } from '../db/driver';

interface StandalonePosSqliteModule {
    initialize(): Promise<boolean>;
    beginTransaction(): Promise<string>;
    commitTransaction(transactionId: string): Promise<boolean>;
    rollbackTransaction(transactionId: string): Promise<boolean>;
    execute(sql: string, params?: readonly unknown[] | null, transactionId?: string | null): Promise<boolean>;
    query(sql: string, params?: readonly unknown[] | null, transactionId?: string | null): Promise<SqlRow[]>;
}

const nativeModule = NativeModules.StandalonePosSqlite as StandalonePosSqliteModule | undefined;

const normalizeParams = (params: readonly unknown[] | undefined): unknown[] => (
    params?.map((value) => {
        if (value === undefined) {
            return null;
        }

        if (typeof value === 'boolean') {
            return value ? 1 : 0;
        }

        return value;
    }) ?? []
);

export const isStandalonePosSqliteAvailable = (): boolean => Boolean(nativeModule);

export const createStandalonePosSqliteConnection = async (): Promise<NativeSqliteConnection> => {
    if (!nativeModule) {
        throw new Error('StandalonePosSqlite native module is not available.');
    }

    await nativeModule.initialize();

    return {
        async execute(statement: string, params?: readonly unknown[]): Promise<void> {
            await nativeModule.execute(statement, normalizeParams(params), null);
        },
        async query<T extends SqlRow = SqlRow>(statement: string, params?: readonly unknown[]): Promise<NativeSqliteResultSet<T>> {
            const rows = await nativeModule.query(statement, normalizeParams(params), null) as T[];
            return { rows };
        },
        async beginTransaction(): Promise<void> {
            throw new Error('Use transaction-scoped connection helpers for beginTransaction.');
        },
        async commitTransaction(): Promise<void> {
            throw new Error('Use transaction-scoped connection helpers for commitTransaction.');
        },
        async rollbackTransaction(): Promise<void> {
            throw new Error('Use transaction-scoped connection helpers for rollbackTransaction.');
        }
    };
};

export const createTransactionAwareStandalonePosSqliteConnection = async (): Promise<NativeSqliteConnection> => {
    if (!nativeModule) {
        throw new Error('StandalonePosSqlite native module is not available.');
    }

    await nativeModule.initialize();
    let transactionId: string | null = null;

    return {
        async execute(statement: string, params?: readonly unknown[]): Promise<void> {
            await nativeModule.execute(statement, normalizeParams(params), transactionId);
        },
        async query<T extends SqlRow = SqlRow>(statement: string, params?: readonly unknown[]): Promise<NativeSqliteResultSet<T>> {
            const rows = await nativeModule.query(statement, normalizeParams(params), transactionId) as T[];
            return { rows };
        },
        async beginTransaction(): Promise<void> {
            transactionId = await nativeModule.beginTransaction();
        },
        async commitTransaction(): Promise<void> {
            if (!transactionId) {
                return;
            }
            await nativeModule.commitTransaction(transactionId);
            transactionId = null;
        },
        async rollbackTransaction(): Promise<void> {
            if (!transactionId) {
                return;
            }
            await nativeModule.rollbackTransaction(transactionId);
            transactionId = null;
        }
    };
};
