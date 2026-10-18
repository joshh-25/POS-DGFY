import crypto from 'node:crypto';
import { resolveDglaundryOrigin } from '../dglaundryOrigin.js';

const ISSUER = process.env.DGFY_OIDC_ISSUER || 'https://api.dgfy.ph/oidc';
const enabled = (value) => String(value || '').trim().toLowerCase() === 'true';

const normalizedMapping = (row) => ({
  companyId: String(row.dgfy_company_id || ''),
  locationId: String(row.dgfy_location_id || ''),
  organizationId: String(row.dglaundry_organization_id || ''),
  branchId: String(row.dglaundry_branch_id || '')
});

export const buildDglaundryRuntimeAttestationUseCase = ({
  repository,
  listVerificationKeysFn = async () => [],
  resolveRuntimeShaInfoFn = () => ({ runtimeSha: null, present: false }),
  redisConfiguredFn = () => false,
  redisConnectedFn = () => false,
  redisClientFn = () => null,
  parPkceConfiguredFn = () => false,
  signDocumentFn = () => { throw new Error('DGFY_EVENT_SIGNING_PRIVATE_KEY_REQUIRED'); },
  now = () => new Date()
}) => async () => {
  const details = {};
  let oidcJwksReady = false;
  try {
    oidcJwksReady = (await listVerificationKeysFn()).length > 0;
  } catch {
    details.oidcJwksReady = 'OIDC verification keys could not be loaded.';
  }

  let replayStatePersistenceReady = false;
  try {
    if (redisConfiguredFn() && redisConnectedFn()) {
      const redis = redisClientFn();
      replayStatePersistenceReady = Boolean(redis && typeof redis.ping === 'function' && await redis.ping());
    }
  } catch {
    replayStatePersistenceReady = false;
  }

  let runtime = { runtimeSha: null, present: false };
  try { runtime = resolveRuntimeShaInfoFn(); }
  catch { details.configurationRevision = 'Deployed runtime metadata could not be resolved.'; }
  let mappings = [];
  let mappingsAvailable = true;
  try {
    mappings = await repository.listMappings({});
  } catch {
    mappingsAvailable = false;
    details.branchAllowlistSha256 = 'Active company/location mappings could not be loaded.';
  }
  const sortedMappings = mappings.map(normalizedMapping)
    .sort((a, b) => JSON.stringify(a).localeCompare(JSON.stringify(b)));
  const branchAllowlistSha256 = mappingsAvailable ? crypto.createHash('sha256')
    .update(JSON.stringify(sortedMappings))
    .digest('hex') : null;

  const paymongoMode = String(process.env.PAYMONGO_MODE || '').trim().toLowerCase();
  const bookingPaymentsEnabled = enabled(process.env.DGLAUNDRY_BOOKING_PAYMENTS_ENABLED)
    && !enabled(process.env.DGLAUNDRY_BOOKING_PAYMENTS_KILL_SWITCH);
  let apiOrigin = null;
  try { apiOrigin = new URL(ISSUER).origin; }
  catch { details.issuer = 'Configured OIDC issuer is not a valid absolute URL.'; }
  const laundryOrigin = resolveDglaundryOrigin();
  if (!laundryOrigin) details.laundryOrigin = 'DGLAUNDRY_PARTNER_BASE_URL is not configured as a valid origin.';
  let parPkceReady = false;
  try { parPkceReady = Boolean(parPkceConfiguredFn() && replayStatePersistenceReady); }
  catch { details.parPkceReady = 'The existing PAR/PKCE configuration check failed.'; }
  const attestation = {
    providerRuntimeAttestationVersion: '1',
    environment: process.env.NODE_ENV || 'development',
    configurationRevision: runtime.present ? runtime.runtimeSha : null,
    applicationShas: { 'dgfy-api': runtime.present ? runtime.runtimeSha : null },
    branchAllowlistSha256,
    issuer: ISSUER,
    origins: { api: apiOrigin, laundry: laundryOrigin },
    paymentsMode: paymongoMode || 'unconfigured',
    publicAdmission: bookingPaymentsEnabled,
    testAdmission: ['test', 'sandbox'].includes(paymongoMode),
    oidcJwksReady,
    // #2304's registration inventory is not present in this API. Client IDs
    // default to known strings, which cannot establish a live registration.
    browserClientReady: false,
    machineClientReady: false,
    parPkceReady,
    replayStatePersistenceReady,
    generatedAt: now().toISOString()
  };
  if (!runtime.present) details.configurationRevision = 'No deployed runtime SHA is available.';
  details.browserClientReady = 'Client registration is not verifiable from this runtime; environment values are insufficient.';
  details.machineClientReady = 'Client registration is not verifiable from this runtime; environment values are insufficient.';
  details.publicAdmission = 'Mapped from the DGLaundry booking payment gate; provider validator semantics remain unconfirmed.';
  details.testAdmission = 'True only when PAYMONGO_MODE is test or sandbox; provider validator semantics remain unconfirmed.';

  const signed = signDocumentFn(attestation);
  return {
    attestation,
    signature: signed.signature,
    keyId: signed.keyId,
    algorithm: 'ed25519',
    details
  };
};
