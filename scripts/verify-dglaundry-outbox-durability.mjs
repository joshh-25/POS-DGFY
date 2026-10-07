#!/usr/bin/env node
import crypto from 'node:crypto';
import { spawn } from 'node:child_process';
import { createRequire } from 'node:module';
import { fileURLToPath, pathToFileURL } from 'node:url';
import path from 'node:path';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const apiRoot = path.join(root, 'apps/dgfy-api');
const migrationPath = path.join(root, 'apps/dgfy-migration-runner/migrations/20261007000001-add-dglaundry-outbound-outbox.cjs');
const outboxPath = path.join(apiRoot, 'src/modules/dgfyLaundryOrders/repositories/dgfyLaundryOutboxRepository.js');
const orderRepositoryPath = path.join(apiRoot, 'src/modules/dgfyLaundryOrders/repositories/dgfyLaundryOrderRepository.js');
const verifierPath = path.join(apiRoot, 'src/modules/dgfyLaundryOrders/services/dglaundryEventSignature.js');
const assert = (condition, message) => { if (!condition) throw new Error(message); };
const runChild = (code, args = [], env = process.env, cwd = apiRoot) => new Promise((resolve, reject) => {
  const child = spawn(process.execPath, [...args, '-e', code], { cwd, env, stdio: ['ignore', 'pipe', 'pipe'] });
  let stdout = '';
  let stderr = '';
  child.stdout.on('data', (chunk) => { stdout += chunk; });
  child.stderr.on('data', (chunk) => { stderr += chunk; });
  child.on('error', reject);
  child.on('close', (codeValue) => codeValue === 0 ? resolve(stdout.trim()) : reject(new Error(stderr || `child exited ${codeValue}`)));
});

const verifyRedisAcrossProcesses = async () => {
  const redisUrl = process.env.DGLAUNDRY_TEST_REDIS_URL;
  assert(redisUrl, 'Set DGLAUNDRY_TEST_REDIS_URL to a disposable Redis 7 instance.');
  const { publicKey, privateKey } = crypto.generateKeyPairSync('ed25519');
  const now = Math.floor(Date.now() / 1000);
  const nonce = crypto.randomUUID();
  const parameters = `("@method" "@authority" "@path" "content-digest" "content-type");created=${now};expires=${now + 300};nonce="${nonce}";keyid="integration-test";alg="ed25519";tag="dglaundry-dgfy-v1"`;
  const event = { id: crypto.randomUUID(), type: 'dgfy.laundry_order.accepted.v1', data: {} };
  const rawBody = JSON.stringify(event);
  const digest = `sha-256=:${crypto.createHash('sha256').update(rawBody).digest('base64')}:`;
  const base = [`"@method": POST`, `"@authority": test.local`, `"@path": /api/v1/integrations/dglaundry/events`, `"content-digest": ${digest}`, '"content-type": application/json', `"@signature-params": ${parameters}`].join('\n');
  const request = {
    headers: { 'content-digest': digest, 'content-type': 'application/json', 'signature-input': `sig1=${parameters}`, signature: `sig1=:${crypto.sign(null, Buffer.from(base), privateKey).toString('base64')}:` },
    method: 'POST', authority: 'test.local', path: '/api/v1/integrations/dglaundry/events', rawBody
  };
  const childCode = `
    import { createClient } from 'redis';
    import { buildDglaundryEventSignatureVerifier } from ${JSON.stringify(pathToFileURL(verifierPath).href)};
    const redis = createClient({ url: process.env.DGLAUNDRY_TEST_REDIS_URL });
    try {
      await redis.connect();
      const verifier = buildDglaundryEventSignatureVerifier({ redisProvider: () => redis, redisConnected: () => redis.isReady });
      const result = await verifier(JSON.parse(Buffer.from(process.env.DGLAUNDRY_TEST_SIGNED_REQUEST, 'base64').toString('utf8')));
      console.log(JSON.stringify(result));
    } finally { if (redis.isOpen) await redis.quit(); }
  `;
  const childEnv = {
    ...process.env,
    DGLAUNDRY_TEST_REDIS_URL: redisUrl,
    DGLAUNDRY_TEST_SIGNED_REQUEST: Buffer.from(JSON.stringify(request)).toString('base64'),
    DGLAUNDRY_SIGNATURE_PROFILE: 'http-message-signatures-v1',
    DGLAUNDRY_INTEGRATION_PUBLIC_KEY: publicKey.export({ type: 'spki', format: 'pem' })
  };
  const results = await Promise.all([runChild(childCode, [], childEnv), runChild(childCode, [], childEnv)]);
  const parsed = results.map((result) => JSON.parse(result));
  assert(parsed.filter((result) => result.ok).length === 1, `Redis must accept exactly one parallel identical signature: ${JSON.stringify(parsed)}`);
  assert(parsed.filter((result) => result.code === 'DGLAUNDRY_SIGNATURE_REPLAY').length === 1, 'Redis must reject the concurrent replay.');
  const afterRestart = JSON.parse(await runChild(childCode, [], childEnv));
  assert(afterRestart.code === 'DGLAUNDRY_SIGNATURE_REPLAY', 'A new API process must reject the already-claimed signature.');
  console.log('PASS Redis 7: parallel cross-process nonce claim and replay rejection after process restart.');
};

const verifyMySqlOutbox = async () => {
  const user = process.env.DGLAUNDRY_TEST_MYSQL_ADMIN_USER;
  const password = process.env.DGLAUNDRY_TEST_MYSQL_ADMIN_PASSWORD;
  const host = process.env.DGLAUNDRY_TEST_MYSQL_HOST || '127.0.0.1';
  const port = Number(process.env.DGLAUNDRY_TEST_MYSQL_PORT || 3306);
  assert(user && password, 'Set DGLAUNDRY_TEST_MYSQL_ADMIN_USER/PASSWORD for a disposable MySQL 8 instance.');
  const dbName = `dglaundry_2310_test_${crypto.randomBytes(6).toString('hex')}`;
  const requireApi = createRequire(path.join(apiRoot, 'package.json'));
  const { Sequelize } = requireApi('sequelize');
  const admin = new Sequelize('mysql', user, password, { host, port, dialect: 'mysql', logging: false });
  let appDb = null;
  try {
    await admin.query(`CREATE DATABASE \`${dbName}\``);
    Object.assign(process.env, { NODE_ENV: 'test', DB_HOST: host, DB_PORT: String(port), DB_USER: user, DB_PASSWORD: password, DB_NAME: dbName, DB_NAME_TEST: dbName, DB_DIALECT: 'mysql' });
    appDb = (await import(pathToFileURL(path.join(apiRoot, 'src/config/database.js')).href)).default;
    const migration = requireApi(migrationPath);
    await migration.up(appDb.getQueryInterface(), Sequelize);
    await migration.up(appDb.getQueryInterface(), Sequelize);
    const outbox = (await import(pathToFileURL(outboxPath).href)).dgfyLaundryOutboxRepository;
    const orderRepository = (await import(pathToFileURL(orderRepositoryPath).href)).dgfyLaundryOrderRepository;
    const scope = { companyId: 'company-test', locationId: 'location-test' };
    for (const [index, operation] of ['updateOrder', 'cancelOrder'].entries()) {
      await outbox.enqueue({ ...scope, operation, idempotencyKey: `ordered-${index}`, requestHash: crypto.randomBytes(32).toString('hex'), payload: scope, orderReference: 'order-test' });
    }
    const [firstWorker, secondWorker] = await Promise.all([outbox.claimDue(10), outbox.claimDue(10)]);
    const claims = [...firstWorker, ...secondWorker];
    assert(claims.length === 1, `Expected one ordered claim across two workers; got ${claims.length}.`);
    const oldClaim = claims[0];
    await appDb.query('UPDATE dgfy_dglaundry_outbox SET lease_expires_at=DATE_SUB(NOW(),INTERVAL 1 SECOND) WHERE id=?', { replacements: [oldClaim.row.id] });
    const recovered = await outbox.claimDue(10);
    assert(recovered.length === 1 && recovered[0].token !== oldClaim.token, 'An expired lease must be reclaimed with a new token.');
    await outbox.acknowledge({ id: oldClaim.row.id, token: oldClaim.token, status: 'delivered', response: { stale: true } });
    const afterStaleAck = await outbox.findById(oldClaim.row.id);
    assert(afterStaleAck.status === 'leased' && afterStaleAck.lease_token === recovered[0].token, 'A stale worker must not overwrite a new lease.');
    await outbox.acknowledge({ id: oldClaim.row.id, token: recovered[0].token, status: 'delivered', response: { accepted: true } });
    const isolatedScope = await outbox.enqueue({ companyId: 'other-company', locationId: 'other-location', operation: 'updateOrder', idempotencyKey: 'other-tenant-same-order-reference', requestHash: crypto.randomBytes(32).toString('hex'), payload: { companyId: 'other-company', locationId: 'other-location' }, orderReference: 'order-test' });
    assert(isolatedScope.row.sequence_number === 0, 'Sequence allocation must be isolated by company and location.');
    const completion = await outbox.enqueue({ ...scope, operation: 'submitOrder', idempotencyKey: 'completion-test', callerIdempotencyKey: 'caller-key-test', requestHash: crypto.randomBytes(32).toString('hex'), payload: scope, completion: { type: 'paid_dglaundry_booking', reference: 'session-test' } });
    assert(completion.row.caller_idempotency_key === 'caller-key-test', 'The original caller idempotency key must persist with the outbox record.');
    await appDb.query("UPDATE dgfy_dglaundry_outbox SET status='delivered',completion_status='failed',completion_failure='test failure' WHERE id=?", { replacements: [completion.row.id] });
    const visible = await orderRepository.listDeadLetters({ ...scope, direction: 'outbound', limit: 20 });
    assert(visible.some((row) => row.id === completion.row.id && row.completionStatus === 'failed'), 'Scoped listing must include failed paid-session completion.');
    assert(await orderRepository.redriveOutboundCompletion({ id: completion.row.id, ...scope }), 'Completion-only redrive must succeed.');
    const afterRedrive = await outbox.findById(completion.row.id);
    assert(afterRedrive.status === 'delivered' && afterRedrive.completion_status === 'pending', 'Completion redrive must preserve provider delivery state.');
    const restartCode = `
      import { Sequelize } from 'sequelize';
      const db = new Sequelize(process.env.DB_NAME_TEST, process.env.DB_USER, process.env.DB_PASSWORD, { host: process.env.DB_HOST, port: Number(process.env.DB_PORT), dialect: 'mysql', logging: false });
      try { const [rows] = await db.query('SELECT status FROM dgfy_dglaundry_outbox WHERE id=?', { replacements: [process.env.DGLAUNDRY_TEST_ROW] }); if (rows[0]?.status !== 'delivered') process.exitCode=2; else console.log('persisted'); } finally { await db.close(); }
    `;
    const restarted = await runChild(restartCode, [], { ...process.env, DGLAUNDRY_TEST_ROW: oldClaim.row.id });
    assert(restarted === 'persisted', 'A separate process must read persisted delivery state.');
    console.log('PASS MySQL 8: migration up/re-run, two-worker ordering, lease recovery, stale-ack protection, completion-only recovery, and restart persistence.');
  } finally {
    if (appDb) await appDb.close();
    await admin.query(`DROP DATABASE IF EXISTS \`${dbName}\``);
    await admin.close();
  }
};

try {
  await verifyMySqlOutbox();
  await verifyRedisAcrossProcesses();
} catch (error) {
  console.error(`FAIL DGLaundry durability acceptance: ${error.message}`);
  process.exitCode = 1;
}
