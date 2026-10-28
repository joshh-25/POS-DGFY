import crypto from 'node:crypto';
import fs from 'node:fs';
import fsp from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawn } from 'node:child_process';
import mysql from '../apps/dgfy-api/node_modules/mysql2/promise.js';

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(scriptDir, '..');
const evidenceRoot = path.join(repoRoot, 'BIR_ANNEX_B_LOCAL_EVIDENCE');
const outputDir = path.join(evidenceRoot, '14');
const envPath = path.join(repoRoot, 'apps', 'dgfy-api', '.env');
const companyName = String(process.env.BIR_LOCAL_COMPANY_NAME || 'Masu Cafe Indian Foodszt').trim();
const tenantId = String(process.env.BIR_LOCAL_TENANT_ID || 'f5d1f5e9-7fda-4aaa-95d6-9ed3dac1a11a').trim();
const generatedAt = new Date().toISOString();

const localHosts = new Set(['127.0.0.1', 'localhost', '::1']);
const parseEnvFile = (content) => Object.fromEntries(content.split(/\r?\n/)
    .map((line) => line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*?)\s*$/))
    .filter(Boolean)
    .map((match) => [match[1], match[2].replace(/^(['"])(.*)\1$/, '$2')]));

const ensureLocalHost = (host) => {
    if (!localHosts.has(String(host || '').trim().toLowerCase())) {
        throw new Error(`The restore drill only permits a local MySQL host; received ${host || 'empty'}.`);
    }
};
const safeIdentifier = (value, label) => {
    const normalized = String(value || '').trim();
    if (!/^[A-Za-z0-9_]+$/.test(normalized)) throw new Error(`${label} is not a safe local identifier.`);
    return normalized;
};
const quoteIdentifier = (value) => `\`${String(value).replaceAll('`', '``')}\``;
const sha256File = async (filePath) => {
    const hash = crypto.createHash('sha256');
    await new Promise((resolve, reject) => {
        const stream = fs.createReadStream(filePath);
        stream.on('data', (chunk) => hash.update(chunk));
        stream.on('error', reject);
        stream.on('end', resolve);
    });
    return hash.digest('hex');
};
const writeJson = async (fileName, value) => {
    await fsp.mkdir(outputDir, { recursive: true });
    await fsp.writeFile(path.join(outputDir, fileName), `${JSON.stringify(value, null, 2)}\n`, 'utf8');
};
const writeText = async (fileName, value) => {
    await fsp.mkdir(outputDir, { recursive: true });
    await fsp.writeFile(path.join(outputDir, fileName), `${String(value)}\n`, 'utf8');
};

const runProcess = ({ executable, args, env, inputPath = null, outputPath = null }) => new Promise((resolve, reject) => {
    const child = spawn(executable, args, {
        env: { ...process.env, ...env },
        windowsHide: true,
        stdio: ['pipe', 'pipe', 'pipe']
    });
    const stdout = [];
    const stderr = [];
    const output = outputPath ? fs.createWriteStream(outputPath) : null;
    child.stdout.on('data', (chunk) => {
        if (output) output.write(chunk);
        else stdout.push(chunk);
    });
    child.stderr.on('data', (chunk) => stderr.push(chunk));
    child.on('error', reject);
    child.on('close', async (code, signal) => {
        if (output) await new Promise((resolveOutput, rejectOutput) => {
            output.on('finish', resolveOutput);
            output.on('error', rejectOutput);
            output.end();
        });
        resolve({
            code: code ?? -1,
            signal: signal || null,
            stdout: Buffer.concat(stdout).toString('utf8'),
            stderr: Buffer.concat(stderr).toString('utf8')
        });
    });
    if (inputPath) fs.createReadStream(inputPath).pipe(child.stdin);
    else child.stdin.end();
});

const getDbConfig = async () => {
    const fileEnv = parseEnvFile(await fsp.readFile(envPath, 'utf8'));
    const config = {
        host: process.env.BIR_LOCAL_DB_HOST || fileEnv.DB_HOST || 'localhost',
        port: Number(process.env.BIR_LOCAL_DB_PORT || fileEnv.DB_PORT || 3306),
        user: process.env.BIR_LOCAL_DB_USER || fileEnv.DB_USER || 'root',
        password: process.env.BIR_LOCAL_DB_PASSWORD ?? fileEnv.DB_PASSWORD ?? '',
        database: process.env.BIR_LOCAL_DB_NAME || fileEnv.DB_NAME || 'sku_inventory_manager'
    };
    ensureLocalHost(config.host);
    if (!Number.isInteger(config.port) || config.port <= 0) throw new Error('Local MySQL port is invalid.');
    return config;
};

const findTenantDatabase = async (config) => {
    const landlord = await mysql.createConnection({ ...config, database: config.database });
    try {
        const [rows] = await landlord.query(
            'SELECT id, name, db_name FROM tenants WHERE id = ? OR name = ? LIMIT 1',
            [tenantId, companyName]
        );
        const tenant = rows[0];
        if (!tenant?.db_name) throw new Error(`Local tenant database was not found for ${companyName}.`);
        return { id: String(tenant.id), name: String(tenant.name), dbName: safeIdentifier(tenant.db_name, 'Source tenant database') };
    } finally {
        await landlord.end();
    }
};

const listTableNames = async (connection) => {
    const [rows] = await connection.query('SHOW TABLES');
    return rows.map((row) => String(Object.values(row)[0])).filter((name) => /^[A-Za-z0-9_]+$/.test(name)).sort();
};
const countTables = async (connection, database, tableNames) => {
    const result = {};
    for (const tableName of tableNames) {
        const [rows] = await connection.query(`SELECT COUNT(*) AS row_count FROM ${quoteIdentifier(database)}.${quoteIdentifier(tableName)}`);
        result[tableName] = Number(rows[0]?.row_count || 0);
    }
    return result;
};

const main = async () => {
    const config = await getDbConfig();
    const tenant = await findTenantDatabase(config);
    const sourceDb = safeIdentifier(tenant.dbName, 'Source tenant database');
    const suffix = new Date().toISOString().replace(/[-:TZ.]/g, '').slice(0, 14);
    const restoreDb = safeIdentifier(`bir_annex_b_restore_${suffix}`, 'Restore database');
    if (restoreDb === sourceDb || restoreDb === config.database) throw new Error('Restore database collided with a source database.');

    const backupPath = path.join(outputDir, 'backup.sql');
    const dumpExecutable = process.env.BIR_LOCAL_MYSQLDUMP || 'C:\\xampp\\mysql\\bin\\mysqldump.exe';
    const mysqlExecutable = process.env.BIR_LOCAL_MYSQL || 'C:\\xampp\\mysql\\bin\\mysql.exe';
    if (!(await fsp.stat(dumpExecutable).catch(() => null))) throw new Error(`mysqldump was not found at ${dumpExecutable}.`);
    if (!(await fsp.stat(mysqlExecutable).catch(() => null))) throw new Error(`mysql client was not found at ${mysqlExecutable}.`);

    const processEnv = { MYSQL_PWD: config.password };
    const log = [`LOCAL TEST - NOT FOR SUBMISSION`, `started_at=${generatedAt}`, `company=${tenant.name}`, `tenant_id=${tenant.id}`, `source_database=${sourceDb}`, `restore_database=${restoreDb}`, `mysql_host=${config.host}`, `mysql_port=${config.port}`];
    let restoreConnection;
    let droppedRestoreDb = false;
    try {
        log.push('backup=starting');
        const dump = await runProcess({
            executable: dumpExecutable,
            args: ['--host', config.host, '--port', String(config.port), '--user', config.user, '--single-transaction', '--routines=false', '--triggers', '--default-character-set=utf8mb4', sourceDb],
            env: processEnv,
            outputPath: backupPath
        });
        log.push(`backup_exit_code=${dump.code}`);
        if (dump.stderr.trim()) log.push(`backup_stderr=${dump.stderr.trim().replaceAll(/\r?\n/g, ' ')}`);
        if (dump.code !== 0) throw new Error('mysqldump failed; no restore was attempted.');
        const backupStat = await fsp.stat(backupPath);
        if (backupStat.size <= 0) throw new Error('mysqldump produced an empty backup.');
        const backupSha256 = await sha256File(backupPath);
        await writeJson('backup-metadata.json', {
            environment: 'LOCAL_ONLY',
            evidence_label: 'LOCAL TEST - NOT FOR SUBMISSION',
            generated_at: generatedAt,
            company: tenant.name,
            tenant_id: tenant.id,
            source_database: sourceDb,
            backup_file: '14/backup.sql',
            backup_bytes: backupStat.size,
            backup_sha256: backupSha256,
            mysqldump: 'local XAMPP mysqldump --single-transaction --triggers'
        });
        log.push(`backup_bytes=${backupStat.size}`, `backup_sha256=${backupSha256}`);

        const admin = await mysql.createConnection({ ...config, database: config.database });
        try {
            await admin.query(`CREATE DATABASE ${quoteIdentifier(restoreDb)} CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci`);
        } finally {
            await admin.end();
        }
        log.push('restore_database_created=true');

        const restore = await runProcess({
            executable: mysqlExecutable,
            args: ['--host', config.host, '--port', String(config.port), '--user', config.user, '--default-character-set=utf8mb4', restoreDb],
            env: processEnv,
            inputPath: backupPath
        });
        log.push(`restore_exit_code=${restore.code}`);
        if (restore.stderr.trim()) log.push(`restore_stderr=${restore.stderr.trim().replaceAll(/\r?\n/g, ' ')}`);
        if (restore.code !== 0) throw new Error('mysql restore failed.');

        const sourceConnection = await mysql.createConnection({ ...config, database: sourceDb });
        restoreConnection = await mysql.createConnection({ ...config, database: restoreDb });
        const sourceTables = await listTableNames(sourceConnection);
        const restoreTables = await listTableNames(restoreConnection);
        const sourceCounts = await countTables(sourceConnection, sourceDb, sourceTables);
        const restoreCounts = await countTables(restoreConnection, restoreDb, restoreTables);
        await sourceConnection.end();
        await restoreConnection.end();
        restoreConnection = null;

        const allTablesMatch = JSON.stringify(sourceTables) === JSON.stringify(restoreTables)
            && JSON.stringify(sourceCounts) === JSON.stringify(restoreCounts);
        const counts = {
            environment: 'LOCAL_ONLY',
            evidence_label: 'LOCAL TEST - NOT FOR SUBMISSION',
            generated_at: new Date().toISOString(),
            source_database: sourceDb,
            restore_database: restoreDb,
            source_table_count: sourceTables.length,
            restore_table_count: restoreTables.length,
            table_names_match: JSON.stringify(sourceTables) === JSON.stringify(restoreTables),
            row_counts_match: JSON.stringify(sourceCounts) === JSON.stringify(restoreCounts),
            all_tables_match: allTablesMatch,
            source_counts: sourceCounts,
            restore_counts: restoreCounts
        };
        await writeJson('restore-counts.json', counts);
        log.push(`source_table_count=${sourceTables.length}`, `restore_table_count=${restoreTables.length}`, `table_names_match=${counts.table_names_match}`, `row_counts_match=${counts.row_counts_match}`, `all_tables_match=${allTablesMatch}`);
        if (!allTablesMatch) throw new Error('Restored table names or row counts do not match the source database.');

        const status = { success: true, environment: 'LOCAL_ONLY', evidence_label: 'LOCAL TEST - NOT FOR SUBMISSION', generated_at: new Date().toISOString(), source_database: sourceDb, restore_database: restoreDb, backup_sha256: backupSha256, all_tables_match: true };
        await writeJson('restore-drill-status.json', status);
        log.push('result=PASS');
        log.push('restore_database_disposed=true');
        await writeText('local_restore_test_log.txt', log.join('\n'));
    } catch (error) {
        if (restoreConnection) await restoreConnection.end().catch(() => {});
        const status = { success: false, environment: 'LOCAL_ONLY', evidence_label: 'LOCAL TEST - NOT FOR SUBMISSION', generated_at: new Date().toISOString(), source_database: sourceDb, restore_database: restoreDb, error: error.message };
        await writeJson('restore-drill-status.json', status);
        log.push(`result=FAIL`, `error=${error.message}`);
        await writeText('local_restore_test_log.txt', log.join('\n'));
        throw error;
    } finally {
        const admin = await mysql.createConnection({ ...config, database: config.database }).catch(() => null);
        if (admin) {
            try {
                await admin.query(`DROP DATABASE IF EXISTS ${quoteIdentifier(restoreDb)}`);
                droppedRestoreDb = true;
            } finally {
                await admin.end();
            }
        }
        if (droppedRestoreDb) {
            const existing = await fsp.readFile(path.join(outputDir, 'local_restore_test_log.txt'), 'utf8').catch(() => '');
            if (existing && !existing.includes('restore_database_disposed=true')) await writeText('local_restore_test_log.txt', `${existing.trim()}\nrestore_database_disposed=true`);
        }
    }
    console.log(JSON.stringify({ evidence_root: evidenceRoot, status: 'PASS', environment: 'LOCAL_ONLY', source_database: sourceDb, restore_database_disposed: droppedRestoreDb }, null, 2));
};

main().catch((error) => {
    console.error(`[AnnexBLocalRestore] ${error.message}`);
    process.exitCode = 1;
});
