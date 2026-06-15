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

  if (code === POS_TERMINAL_LOGIN_ERROR_CODES.MULTIPLE_TENANTS) {
    return responseMessage || 'This email belongs to multiple companies. Sign in from SKUpervisor once, then reopen POS for the selected company.';
  }

  if (code === POS_TERMINAL_LOGIN_ERROR_CODES.TENANT_NOT_FOUND || code === POS_TERMINAL_LOGIN_ERROR_CODES.COMPANY_TOKEN_UNRESOLVED) {
    return 'No company is registered for this POS login email. Check the email or sign in from SKUpervisor first.';
  }

  if (code === 'TENANT_CAPABILITY_DISABLED') {
    return getCapabilityBlockMessage(capability) || responseMessage || 'POS access is disabled for this company.';
  }

  if (requestPath.endsWith('/pos/device/status') && status === 503) {
    return 'The receipt printer/cash drawer bridge is unavailable. Login can continue, but hardware controls stay disabled until the bridge is running.';
  }

  if (!status) {
    return 'Unable to reach the POS backend. Check the server connection and try again.';
  }

  if (status === 401) return 'Invalid email or password.';
  if (status === 403) {
    const lowerMessage = responseMessage.toLowerCase();
    if (lowerMessage.includes('pos:') || lowerMessage.includes('permission')) {
      return 'Your account does not have permission to unlock or operate this POS terminal.';
    }
    return 'Your account is not allowed to unlock this terminal.';
  }
  if (status === 404) return 'No company is registered for this POS login email. Check the email or sign in from SKUpervisor first.';
  if (status === 429) return 'Too many terminal login attempts. Wait a moment, then try again.';

  if (responseMessage && status < 500) return responseMessage;
  if (status >= 500) return 'Unable to reach the POS backend. Check the server connection and try again.';

  return 'Unable to sign in to terminal.';
};
