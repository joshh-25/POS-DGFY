import { getCapabilityBlockMessage } from '../../../utils/tenantCapabilityMessages.js';

export const POS_TERMINAL_LOGIN_ERROR_CODES = Object.freeze({
  MULTIPLE_TENANTS: 'POS_LOGIN_MULTIPLE_TENANTS',
  TENANT_NOT_FOUND: 'POS_LOGIN_TENANT_NOT_FOUND',
  COMPANY_TOKEN_UNRESOLVED: 'POS_LOGIN_COMPANY_TOKEN_UNRESOLVED'
});

export const normalizeLookupTenantOptions = (payload = {}) => {
  if (payload?.company_token) {
    return [payload];
  }
  if (payload?.multiple === true && Array.isArray(payload?.tenants)) {
    return payload.tenants;
  }
  return [];
};

export const createTerminalLoginError = (message, code, details = {}) => {
  const error = new Error(message);
  error.code = code;
  error.details = details;
  return error;
};

const getResponseData = (error) => error?.response?.data || {};

const getStatus = (error) => Number(error?.response?.status || 0);

const getResponseMessage = (error) => String(getResponseData(error)?.message || error?.message || '').trim();

const getErrorCode = (error) => {
  const data = getResponseData(error);
  return String(data?.code || data?.error_code || data?.error?.code || error?.code || '').trim();
};

const getRetryAfterSeconds = (error) => {
  const data = getResponseData(error);
  const candidates = [
    data?.retryAfterSeconds,
    error?.response?.headers?.['retry-after'],
    error?.response?.headers?.['Retry-After']
  ];
  const retryAfter = candidates
    .map((candidate) => Number(candidate))
    .find((candidate) => Number.isFinite(candidate) && candidate > 0);
  return retryAfter || null;
};

const formatRetryAfter = (seconds) => {
  if (!seconds) return '';
  if (seconds < 60) return ` Try again in about ${Math.ceil(seconds)} second${Math.ceil(seconds) === 1 ? '' : 's'}.`;
  const minutes = Math.ceil(seconds / 60);
  return ` Try again in about ${minutes} minute${minutes === 1 ? '' : 's'}.`;
};

const getCapability = (error) => {
  const data = getResponseData(error);
  return String(data?.capability || data?.details?.capability || '').trim();
};

const getRequestPath = (error) => {
  const url = String(error?.config?.url || '').trim();
  try {
    return new URL(url, 'http://local').pathname;
  } catch {
    return url;
  }
};

export const shouldFallbackToCurrentCompanyTokenAfterLookupError = (error) => {
  const status = getStatus(error);
  if (!status) return true;
  return status >= 500 || status === 408 || status === 504;
};

export const isCompanyTokenResolutionError = (error) => {
  const status = getStatus(error);
  const message = getResponseMessage(error).toLowerCase();
  if (status === 404) {
    return message.includes('company token') || message.includes('tenant');
  }
  return status === 400 && message.includes('company token');
};

export const resolveTerminalLoginErrorMessage = (error) => {
  const status = getStatus(error);
  const code = getErrorCode(error);
  const responseMessage = getResponseMessage(error);
  const capability = getCapability(error);
  const requestPath = getRequestPath(error);
  const lowerMessage = responseMessage.toLowerCase();

  if (code === POS_TERMINAL_LOGIN_ERROR_CODES.MULTIPLE_TENANTS) {
    return responseMessage || 'This email belongs to multiple companies. Select the company to continue.';
  }

  if (code === POS_TERMINAL_LOGIN_ERROR_CODES.TENANT_NOT_FOUND || code === POS_TERMINAL_LOGIN_ERROR_CODES.COMPANY_TOKEN_UNRESOLVED) {
    return 'No company is registered for this POS login email. Check the email or sign in from SKUpervisor first.';
  }

  if (code === 'TENANT_CAPABILITY_DISABLED') {
    return getCapabilityBlockMessage(capability) || responseMessage || 'POS access is disabled for this company.';
  }

  if (code === 'POS_TERMINAL_PAIRING_INVALID' || lowerMessage.includes('pos device pairing is missing') || lowerMessage.includes('pairing is missing, expired, or no longer valid')) {
    return 'The registered terminal session is missing or expired. Select the terminal again and continue.';
  }

  if (requestPath.endsWith('/pos/device/status') && status === 503) {
    return 'The receipt printer/cash drawer bridge is unavailable. Login can continue, but hardware controls stay disabled until the bridge is running.';
  }

  if (!status) {
    return 'Unable to reach the POS backend. Check the server connection and try again.';
  }

  if (status === 401 && requestPath.includes('/pos/terminal/')) {
    if (lowerMessage.includes('company token') || lowerMessage.includes('tenant')) {
      return 'The selected business session is missing or expired. Select the company and continue again.';
    }
    if (lowerMessage.includes('terminal_id is required')) {
      return 'Select a registered terminal before continuing.';
    }
    if (lowerMessage.includes('not an active registry terminal')) {
      return responseMessage || 'The selected terminal is not an active registered terminal for this company.';
    }
    return responseMessage || 'The selected terminal is not ready for this POS session.';
  }

  if (status === 401) {
    if (requestPath.endsWith('/pos/auth/cashier-login')) {
      if (lowerMessage.includes('invalid username/email or password') || lowerMessage.includes('invalid email or password')) {
        return 'Invalid cashier username/email or password.';
      }
      return responseMessage || 'Invalid cashier username/email or password.';
    }
    if (requestPath.includes('/pos-session')) {
      if (lowerMessage.includes('terminal password')) {
        return responseMessage || 'Terminal password is incorrect.';
      }
      if (lowerMessage.includes('invalid dgfy account token') || lowerMessage.includes('invalid dgfy account session')) {
        return 'Your DGFY session expired before terminal unlock. Sign in again and retry.';
      }
    }
    if (lowerMessage.includes('invalid username/email or password') || lowerMessage.includes('invalid email or password')) {
      return responseMessage;
    }
    return 'Invalid email or password.';
  }
  if (status === 403) {
    if (code === 'CSRF_TOKEN_REQUIRED') {
      return responseMessage || 'The browser security token is missing. Refresh POS and sign in again.';
    }
    if (lowerMessage.includes('pos:') || lowerMessage.includes('permission')) {
      return 'Your account does not have permission to unlock or operate this POS terminal.';
    }
    return 'Your account is not allowed to unlock this terminal.';
  }
  if (status === 404) return 'No company is registered for this POS login email. Check the email or sign in from SKUpervisor first.';
  if (status === 429) return `Too many terminal login attempts.${formatRetryAfter(getRetryAfterSeconds(error)) || ' Wait a moment, then try again.'}`;

  if (responseMessage && status < 500) return responseMessage;
  if (status >= 500) return 'Unable to reach the POS backend. Check the server connection and try again.';

  return 'Unable to sign in to terminal.';
};
