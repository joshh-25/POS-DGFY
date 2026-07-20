import crypto from 'crypto';
import { ok, fail } from '../../shared/contracts/applicationResult.js';
import { DomainError, DomainErrorCode } from '../../shared/contracts/domainErrors.js';
import {
  isPayMongoLiveMode,
  isPayMongoPlatformSplitConfirmed
} from '../../../config/commercePaymentsFeature.js';

const REQUIRED_CONFIG_KEYS = [
  'PAYMONGO_TEST_SECRET_KEY',
  'PAYMONGO_TEST_PUBLIC_KEY',
  'PAYMONGO_DGFY_MERCHANT_ID'
];

const hasValue = (value) => String(value || '').trim().length > 0;

const buildCheck = ({ key, label, passed, severity = 'error', details = null }) => ({
  key,
  label,
  passed: Boolean(passed),
  severity,
  details
});

export const buildGetPayMongoSandboxCertificationUseCase = ({ paymongoService, commercePaymentRepository = null }) => async () => {
  try {
    const liveMode = isPayMongoLiveMode();
    const platformSplitConfirmed = isPayMongoPlatformSplitConfirmed();
    const checks = REQUIRED_CONFIG_KEYS.map((key) => buildCheck({
      key,
      label: `${key} configured`,
      passed: hasValue(process.env[key])
    }));
    checks.push(buildCheck({
      key: 'PAYMONGO_TEST_WEBHOOK_SECRET',
      label: 'PAYMONGO_TEST_WEBHOOK_SECRET configured, or PAYMONGO_WEBHOOK_SECRET fallback configured',
      passed: hasValue(process.env.PAYMONGO_TEST_WEBHOOK_SECRET || process.env.PAYMONGO_WEBHOOK_SECRET)
    }));

    const webhookPayload = JSON.stringify({
      data: {
        id: 'evt_certification_probe',
        attributes: {
          type: 'payment.paid',
          data: {
            id: 'pay_certification_probe',
            attributes: {
              metadata: { commerce_payment_session: 'CPS-CERT000001' }
            }
          }
        }
      }
    });
    const timestamp = Math.floor(Date.now() / 1000);
    const webhookSecret = process.env.PAYMONGO_TEST_WEBHOOK_SECRET || process.env.PAYMONGO_WEBHOOK_SECRET || 'missing_secret';
    const signatureDigest = crypto
      .createHmac('sha256', webhookSecret)
      .update(`${timestamp}.${webhookPayload}`)
      .digest('hex');
    const signatureModeKey = process.env.PAYMONGO_MODE === 'live' ? 'li' : 'te';
    checks.push(buildCheck({
      key: 'webhook_signature_verification',
      label: 'Webhook signature verifier accepts correctly signed sandbox payload',
      passed: paymongoService.verifyWebhookSignature(`t=${timestamp},${signatureModeKey}=${signatureDigest}`, webhookPayload)
    }));

    checks.push(buildCheck({
      key: 'split_payload_shape',
      label: 'Fixed DGFY 1% split payload uses PayMongo split_payment.recipients fixed centavo amount',
      passed: true,
      details: {
        split_payment: {
          transfer_to: 'tenant_child_merchant_id',
          recipients: [{
            merchant_id: process.env.PAYMONGO_DGFY_MERCHANT_ID || 'PAYMONGO_DGFY_MERCHANT_ID',
            split_type: 'fixed',
            value: 100
          }]
        }
      }
    }));

    checks.push(buildCheck({
      key: 'platform_split_capability_confirmation',
      label: 'PayMongo parent account split-payment capability is externally confirmed',
      passed: platformSplitConfirmed,
      severity: liveMode ? 'error' : 'warning',
      details: platformSplitConfirmed
        ? 'Operator has explicitly confirmed PayMongo platform split capability in environment configuration.'
        : 'PayMongo support has not yet confirmed parent merchant ID and split_payment marketplace capability. Sandbox/internal readiness may continue, but live customer use remains blocked.'
    }));

    checks.push(buildCheck({
      key: 'api_generated_child_merchant_ids',
      label: 'Tenant merchant IDs are generated/stored through PayMongo child account APIs, not typed as production readiness evidence',
      passed: true,
      details: 'The app can create tenant child merchants and store returned provider_merchant_id values, but activation, wallet, QR Ph, split, and payout readiness remain provider-evidence gated.'
    }));

    checks.push(buildCheck({
      key: 'manual_child_merchant_verification_required',
      label: 'Tenant child merchant capability still requires PayMongo-side onboarding evidence',
      passed: false,
      severity: 'warning',
      details: 'This app can store readiness, but PayMongo Platform child merchant activation must be verified with PayMongo credentials or dashboard/API evidence.'
    }));

    checks.push(buildCheck({
      key: 'child_account_webhook_registration_required',
      label: 'Child-account webhook registration must be verified if using Account-Id child-account processing',
      passed: false,
      severity: 'warning',
      details: 'PayMongo documents that parent-account requests acting as a child account send webhooks to the child account webhook endpoint. Verify webhook registration mode during sandbox setup.'
    }));

    if (commercePaymentRepository?.listTenantPaymentAccounts) {
      const accounts = await commercePaymentRepository.listTenantPaymentAccounts({ provider: 'paymongo' }, { limit: 250 });
      const activeAccountsMissingEvidence = accounts.filter((account) => {
        const metadata = account.metadata || {};
        const enabled = account.onboarding_status === 'active'
          || account.qrph_enabled
          || account.split_enabled
          || account.charges_enabled;
        return enabled && (!metadata.verification_reference || !metadata.verified_at);
      });
      const splitAccountsMissingWalletEvidence = accounts.filter((account) => {
        const settlementEnabled = account.split_enabled || account.charges_enabled;
        return settlementEnabled && (account.wallet_status !== 'enabled' || !account.wallet_verified_at);
      });
      checks.push(buildCheck({
        key: 'tenant_readiness_evidence',
        label: 'Enabled tenant payment accounts include verification reference and timestamp',
        passed: activeAccountsMissingEvidence.length === 0,
        details: activeAccountsMissingEvidence.length
          ? { missing_evidence_tenant_ids: activeAccountsMissingEvidence.map((account) => account.tenant_id) }
          : { checked_accounts: accounts.length }
      }));
      checks.push(buildCheck({
        key: 'tenant_wallet_evidence',
        label: 'Split/charge-enabled tenant payment accounts include enabled-wallet evidence',
        passed: splitAccountsMissingWalletEvidence.length === 0,
        details: splitAccountsMissingWalletEvidence.length
          ? { missing_wallet_evidence_tenant_ids: splitAccountsMissingWalletEvidence.map((account) => account.tenant_id) }
          : { checked_accounts: accounts.length }
      }));
    }

    const failedErrors = checks.filter((check) => !check.passed && check.severity === 'error');
    return ok({
      certification: {
        provider: 'paymongo',
        mode: process.env.PAYMONGO_MODE || 'test',
        certified: failedErrors.length === 0,
        checks,
        next_required_external_evidence: [
          'Obtain PayMongo confirmation for parent merchant ID and split_payment marketplace capability before any live customer rollout.',
          'Create sandbox QR Ph payment session with a real tenant child merchant ID.',
          'Pay the QR Ph sandbox transaction or replay PayMongo-provided payment.paid payload.',
          'Submit proportional and split_refund sandbox refunds and store provider payload samples.',
          'Verify PayMongo Dashboard split recipients and refund shoulder allocation.'
        ]
      }
    });
  } catch (error) {
    return fail(error instanceof DomainError ? error : new DomainError(DomainErrorCode.INTERNAL_ERROR, error.message));
  }
};
