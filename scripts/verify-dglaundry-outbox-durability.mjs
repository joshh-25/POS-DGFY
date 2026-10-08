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
  const redisVersionCode = `
    import { createClient } from 'redis';
    const redis = createClient({ url: process.env.DGLAUNDRY_TEST_REDIS_URL });
    try { await redis.connect(); const info = await redis.info('server'); console.log(info.match(/^redis_version:([^\\r\\n]+)/m)?.[1] || 'unknown'); }
    finally { if (redis.isOpen) await redis.quit(); }
  `;
  const redisVersion = await runChild(redisVersionCode, [], { ...process.env, DGLAUNDRY_TEST_REDIS_URL: redisUrl });
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
    DGLAUNDRY_INTEGRATION_KEY_ID: 'integration-test',
    DGLAUNDRY_INTEGRATION_PUBLIC_KEY: publicKey.export({ type: 'spki', format: 'pem' })
  };
  const results = await Promise.all([runChild(childCode, [], childEnv), runChild(childCode, [], childEnv)]);
  const parsed = results.map((result) => JSON.parse(result));
  assert(parsed.filter((result) => result.ok).length === 1, `Redis must accept exactly one parallel identical signature: ${JSON.stringify(parsed)}`);
  assert(parsed.filter((result) => result.code === 'DGLAUNDRY_SIGNATURE_REPLAY').length === 1, 'Redis must reject the concurrent replay.');
  const afterRestart = JSON.parse(await runChild(childCode, [], childEnv));
  assert(afterRestart.code === 'DGLAUNDRY_SIGNATURE_REPLAY', 'A new API process must reject the already-claimed signature.');
  const outageRequest = { ...request, headers: { ...request.headers } };
  const outageNonce = crypto.randomUUID();
  const outageParameters = `("@method" "@authority" "@path" "content-digest" "content-type");created=${now};expires=${now + 300};nonce="${outageNonce}";keyid="integration-test";alg="ed25519";tag="dglaundry-dgfy-v1"`;
  const outageBase = [`"@method": POST`, `"@authority": test.local`, `"@path": /api/v1/integrations/dglaundry/events`, `"content-digest": ${digest}`, '"content-type": application/json', `"@signature-params": ${outageParameters}`].join('\n');
  outageRequest.headers['signature-input'] = `sig1=${outageParameters}`;
  outageRequest.headers.signature = `sig1=:${crypto.sign(null, Buffer.from(outageBase), privateKey).toString('base64')}:`;
  const outageCode = `
    import { createClient } from 'redis';
    import { buildDglaundryEventSignatureVerifier } from ${JSON.stringify(pathToFileURL(verifierPath).href)};
    const redis = createClient({ url: process.env.DGLAUNDRY_TEST_REDIS_URL });
    await redis.connect();
    const info = await redis.info('server');
    await redis.quit();
    const verifier = buildDglaundryEventSignatureVerifier({ redisProvider: () => redis, redisConnected: () => redis.isReady });
    const result = await verifier(JSON.parse(Buffer.from(process.env.DGLAUNDRY_TEST_SIGNED_REQUEST, 'base64').toString('utf8')));
    console.log(JSON.stringify({ result, redisVersion: info.match(/^redis_version:([^\\r\\n]+)/m)?.[1] || 'unknown', disconnected: !redis.isReady }));
  `;
  const outage = JSON.parse(await runChild(outageCode, [], {
    ...childEnv,
    DGLAUNDRY_TEST_SIGNED_REQUEST: Buffer.from(JSON.stringify(outageRequest)).toString('base64')
  }));
  assert(outage.disconnected && outage.result.code === 'DGLAUNDRY_EVENT_REPLAY_STORE_UNAVAILABLE',
    `A disconnected real Redis client must fail signature verification closed: ${JSON.stringify(outage)}`);
  assert(outage.redisVersion === redisVersion, 'Redis version must be stable across the harness scenarios.');
  console.log(`PASS Redis ${redisVersion}: cross-process nonce contention, restart replay rejection, and fail-closed verification after disconnect.`);
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
    const [versionRows] = await admin.query('SELECT VERSION() AS version');
    const mysqlVersion = versionRows[0]?.version || 'unknown';
    await admin.query(`CREATE DATABASE \`${dbName}\``);
    Object.assign(process.env, { NODE_ENV: 'test', DB_HOST: host, DB_PORT: String(port), DB_USER: user, DB_PASSWORD: password, DB_NAME: dbName, DB_NAME_TEST: dbName, DB_DIALECT: 'mysql' });
    appDb = (await import(pathToFileURL(path.join(apiRoot, 'src/config/database.js')).href)).default;
    const migration = requireApi(migrationPath);
    await migration.up(appDb.getQueryInterface(), Sequelize);
    await migration.up(appDb.getQueryInterface(), Sequelize);
    const outbox = (await import(pathToFileURL(outboxPath).href)).dgfyLaundryOutboxRepository;
    const orderRepository = (await import(pathToFileURL(orderRepositoryPath).href)).dgfyLaundryOrderRepository;
    const { buildDglaundryDurableDelivery } = await import(pathToFileURL(path.join(apiRoot, 'src/modules/dgfyLaundryOrders/services/dglaundryDurableDelivery.js')).href);
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

    const retryPayload = { id: 'retry-cap-event', type: 'dgfy.laundry_order.updated.v1', data: { companyId: scope.companyId, locationId: scope.locationId } };
    const retryRecord = await outbox.enqueue({
      ...scope, operation: 'updateOrder', idempotencyKey: 'retry-cap-real-mysql', eventId: retryPayload.id,
      requestHash: crypto.randomBytes(32).toString('hex'), payload: retryPayload, maxAttempts: 2
    });
    const retryTransport = { updateOrder: async () => { throw Object.assign(new Error('simulated provider outage'), { statusCode: 503 }); } };
    const retryDelivery = buildDglaundryDurableDelivery({ repository: outbox, transportClient: retryTransport });
    const firstRetryClaim = await outbox.claim(retryRecord.row.id);
    assert(firstRetryClaim?.row.attempts === 1, 'First retry-cap attempt must be leased and counted.');
    await retryDelivery.processClaim(firstRetryClaim).then(() => { throw new Error('The first retryable failure must remain queued.'); }, (error) => {
      assert(error.statusCode === 503 && error.details?.delivery_status === 'retry_wait', 'The first retryable failure must be reported as retry_wait.');
    });
    await appDb.query('UPDATE dgfy_dglaundry_outbox SET next_attempt_at=DATE_SUB(NOW(),INTERVAL 1 SECOND) WHERE id=?', { replacements: [retryRecord.row.id] });
    const finalRetryClaim = await outbox.claim(retryRecord.row.id);
    assert(finalRetryClaim?.row.attempts === 2, 'The final retry-cap attempt must be leased and counted.');
    await retryDelivery.processClaim(finalRetryClaim).then(() => { throw new Error('The exhausted retry must throw the terminal provider error.'); }, (error) => {
      assert(error.message === 'simulated provider outage' && !error.details?.delivery_status, 'The exhausted retry must throw the terminal provider error directly.');
    });
    const exhausted = await outbox.findById(retryRecord.row.id);
    assert(exhausted.status === 'dead_letter' && exhausted.attempts === exhausted.max_attempts, 'The retry cap must persist the row as dead_letter.');

    assert(!(await orderRepository.redriveOutbound({ id: exhausted.id, companyId: 'other-company', locationId: scope.locationId, maxAttempts: 2 })), 'Outbound redrive must reject the wrong company in SQL.');
    assert(!(await orderRepository.redriveOutbound({ id: exhausted.id, companyId: scope.companyId, locationId: 'other-location', maxAttempts: 2 })), 'Outbound redrive must reject the wrong location in SQL.');
    const redriveScope = { companyId: 'redrive-company', locationId: 'redrive-location' };
    const redriveRow = await outbox.enqueue({
      ...redriveScope, operation: 'updateOrder', idempotencyKey: 'redrive-real-mysql',
      requestHash: crypto.randomBytes(32).toString('hex'), payload: { id: 'redrive-event', data: redriveScope }, maxAttempts: 1
    });
    const stuckClaim = await outbox.claim(redriveRow.row.id);
    assert(stuckClaim?.row.attempts === 1, 'The markExhausted scenario must begin with a real lease.');
    await appDb.query('UPDATE dgfy_dglaundry_outbox SET attempts=max_attempts,lease_expires_at=DATE_SUB(NOW(),INTERVAL 1 SECOND) WHERE id=?', { replacements: [redriveRow.row.id] });
    await outbox.markExhausted();
    const swept = await outbox.findById(redriveRow.row.id);
    assert(swept.status === 'dead_letter' && swept.attempts === swept.max_attempts, 'markExhausted must dead-letter an expired exhausted lease.');
    assert(await orderRepository.redriveOutbound({ id: swept.id, ...redriveScope, maxAttempts: 2 }), 'A valid owner/location-scoped outbound redrive must succeed.');
    const redriven = await outbox.findById(swept.id);
    assert(redriven.status === 'pending' && redriven.attempts === 0, 'A valid real-MySQL redrive must reset the row to pending with attempts zero.');
    const reClaim = await outbox.claim(swept.id);
    assert(reClaim, 'A validly redriven row must be claimable again.');
    const successfulDelivery = buildDglaundryDurableDelivery({ repository: outbox, transportClient: { updateOrder: async () => ({ accepted: true }) } });
    await successfulDelivery.processClaim(reClaim);
    assert((await outbox.findById(swept.id)).status === 'delivered', 'The re-claimed real-MySQL row must be deliverable.');
    assert(!(await orderRepository.redriveOutbound({ id: swept.id, ...redriveScope, maxAttempts: 2 })), 'Outbound redrive must reject a row after it is no longer dead_letter.');
    console.log(`PASS MySQL ${mysqlVersion}: migration, FIFO/lease/stale-ack, restart, retry-cap exhaustion, expired-lease sweep, and scope-guarded outbound redrive/re-delivery (scenario max_attempts=2).`);
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
