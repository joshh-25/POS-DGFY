import type { SqlRow, SqlStatement, SqlTransaction, SqliteDriver } from './driver';

export interface NativeSqliteResultSet<T extends SqlRow = SqlRow> {
    rows: T[];
}

export interface NativeSqliteConnection {
    execute(statement: string, params?: readonly unknown[]): Promise<void>;
    query<T extends SqlRow = SqlRow>(statement: string, params?: readonly unknown[]): Promise<NativeSqliteResultSet<T>>;
    beginTransaction(): Promise<void>;
    commitTransaction(): Promise<void>;
    rollbackTransaction(): Promise<void>;
}

class NativeSqlTransaction implements SqlTransaction {
    constructor(private readonly connection: NativeSqliteConnection) {}

    async execute(statement: SqlStatement): Promise<void> {
        await this.connection.execute(statement.sql, statement.params);
    }

    async query<T extends SqlRow = SqlRow>(statement: SqlStatement): Promise<T[]> {
        const result = await this.connection.query<T>(statement.sql, statement.params);
        return result.rows;
    }
}

export class NativeSqliteDriver implements SqliteDriver {
    constructor(private readonly connection: NativeSqliteConnection) {}

    async execute(statement: SqlStatement): Promise<void> {
        await this.connection.execute(statement.sql, statement.params);
    }

    async query<T extends SqlRow = SqlRow>(statement: SqlStatement): Promise<T[]> {
        const result = await this.connection.query<T>(statement.sql, statement.params);
        return result.rows;
    }

    async transaction<T>(work: (tx: SqlTransaction) => Promise<T>): Promise<T> {
        await this.connection.beginTransaction();
        const tx = new NativeSqlTransaction(this.connection);
        try {
            const result = await work(tx);
            await this.connection.commitTransaction();
            return result;
        } catch (error) {
            await this.connection.rollbackTransaction();
            throw error;
        }
    }
}
