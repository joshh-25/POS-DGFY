export interface SqlStatement {
    sql: string;
    params?: readonly unknown[];
}

export interface SqlRow {
    [key: string]: unknown;
}

export interface SqlTransaction {
    execute(statement: SqlStatement): Promise<void>;
    query<T extends SqlRow = SqlRow>(statement: SqlStatement): Promise<T[]>;
}

export interface SqliteDriver {
    execute(statement: SqlStatement): Promise<void>;
    query<T extends SqlRow = SqlRow>(statement: SqlStatement): Promise<T[]>;
    transaction<T>(work: (tx: SqlTransaction) => Promise<T>): Promise<T>;
}
