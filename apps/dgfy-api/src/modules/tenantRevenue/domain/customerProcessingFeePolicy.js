import { DomainError, DomainErrorCode } from '../../shared/contracts/domainErrors.js';

export const CUSTOMER_PROCESSING_FEE_MODES = Object.freeze(['fixed', 'percentage']);
// Customer-facing item-processing charge. This is not a payment-provider fee.
export const DEFAULT_CUSTOMER_PROCESSING_FEE_LABEL = 'Item processing fee';
const BPS_DENOMINATOR = 10000n;

const isPlainObject = (value) => Boolean(value) && typeof value === 'object' && !Array.isArray(value);

const parseNonNegativeInteger = (value, label) => {
  const parsed = Number.parseInt(value, 10);
  if (!Number.isInteger(parsed) || parsed < 0) {
    throw new DomainError(DomainErrorCode.VALIDATION_FAILED, `${label} must be a non-negative integer.`);
  }
  return parsed;
};

const normalizeLabel = (value) => {
  const label = String(value || DEFAULT_CUSTOMER_PROCESSING_FEE_LABEL).trim();
  if (label.length < 1 || label.length > 80) {
    throw new DomainError(DomainErrorCode.VALIDATION_FAILED, 'Item processing fee label must be between 1 and 80 characters.');
  }
  return label;
};

export const normalizeCustomerProcessingFeePolicy = (value) => {
  if (value === null || value === undefined) return null;
  if (!isPlainObject(value)) {
    throw new DomainError(DomainErrorCode.VALIDATION_FAILED, 'Item processing fee policy is invalid.');
  }

  const mode = String(value.mode || '').trim().toLowerCase();
  if (!CUSTOMER_PROCESSING_FEE_MODES.includes(mode)) {
    throw new DomainError(DomainErrorCode.VALIDATION_FAILED, 'Item processing fee mode must be fixed or percentage.');
  }

  const fixedCentavos = parseNonNegativeInteger(value.fixed_centavos ?? 0, 'Item processing fixed amount');
  const rateBps = parseNonNegativeInteger(value.rate_bps ?? 0, 'Item processing percentage');
  if (rateBps > 10000) {
    throw new DomainError(DomainErrorCode.VALIDATION_FAILED, 'Item processing percentage must be between 0% and 100%.');
  }

  if (mode === 'fixed' && rateBps !== 0) {
    throw new DomainError(DomainErrorCode.VALIDATION_FAILED, 'Fixed item processing fees cannot include a percentage rate.');
  }
  if (mode === 'percentage' && fixedCentavos !== 0) {
    throw new DomainError(DomainErrorCode.VALIDATION_FAILED, 'Percentage item processing fees cannot include a fixed amount.');
  }

  return {
    mode,
    fixed_centavos: mode === 'fixed' ? fixedCentavos : 0,
    rate_bps: mode === 'percentage' ? rateBps : 0,
    label: normalizeLabel(value.label)
  };
};

const roundBasisPoints = (amountCentavos, rateBps) => {
  const amount = BigInt(Math.max(0, Number.parseInt(amountCentavos, 10) || 0));
  const rate = BigInt(Math.max(0, Number.parseInt(rateBps, 10) || 0));
  return Number((amount * rate + (BPS_DENOMINATOR / 2n)) / BPS_DENOMINATOR);
};

export const calculateCustomerProcessingFee = ({ policy, baseAmountCentavos }) => {
  const normalizedPolicy = normalizeCustomerProcessingFeePolicy(policy);
  const base = Math.max(0, Number.parseInt(baseAmountCentavos, 10) || 0);
  if (!normalizedPolicy || base === 0) return 0;
  return normalizedPolicy.mode === 'fixed'
    ? normalizedPolicy.fixed_centavos
    : roundBasisPoints(base, normalizedPolicy.rate_bps);
};

export const buildCustomerProcessingFeeBreakdown = ({
  policy,
  baseAmountCentavos,
  amountCentavos,
  policyVersion = null,
  calculatedAt = new Date().toISOString()
} = {}) => {
  const normalizedPolicy = normalizeCustomerProcessingFeePolicy(policy);
  if (!normalizedPolicy) return null;
  const base = Math.max(0, Number.parseInt(baseAmountCentavos, 10) || 0);
  const amount = Math.max(0, Number.parseInt(amountCentavos, 10) || 0);
  return {
    mode: normalizedPolicy.mode,
    fixed_centavos: normalizedPolicy.fixed_centavos,
    rate_bps: normalizedPolicy.rate_bps,
    label: normalizedPolicy.label,
    base_amount_centavos: base,
    amount_centavos: amount,
    policy_version: Number.isInteger(Number(policyVersion)) ? Number(policyVersion) : null,
    calculated_at: calculatedAt
  };
};
