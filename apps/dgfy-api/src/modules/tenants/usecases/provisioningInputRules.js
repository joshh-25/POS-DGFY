import { randomBytes } from 'crypto';
import { DomainError, DomainErrorCode } from '../../shared/contracts/domainErrors.js';
import { isWorkflowMode, normalizeWorkflowMode } from '../../shared/constants/workflowModes.js';
import { isValidPhoneNumber, normalizePhoneNumber } from '../../../utils/phoneNumber.js';

const normalizeName = (value) => String(value || '').trim().replace(/\s+/g, ' ');
const normalizeEmail = (value) => String(value || '').trim().toLowerCase();
const normalizeReason = (value) => String(value || '').trim().replace(/\s+/g, ' ');
const isValidEmail = (value) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(value || ''));
const generateTemporaryPassword = () => `Dgfy-${randomBytes(9).toString('base64url')}1!`;

export const requireReason = (value) => {
    const reason = normalizeReason(value);
    if (reason.length < 3) {
        throw new DomainError(DomainErrorCode.VALIDATION_FAILED, 'Reason is required and must be at least 3 characters.', { statusCode: 400 });
    }
    return reason.slice(0, 500);
};

export const validateAccountFields = (body = {}) => {
    const firstName = normalizeName(body.first_name || body.firstName);
    const middleName = normalizeName(body.middle_name || body.middleName || '');
    const lastName = normalizeName(body.last_name || body.lastName);
    const email = normalizeEmail(body.email);
    const phone = normalizePhoneNumber(body.phone);
    const temporaryPassword = String(body.temporary_password || body.temporaryPassword || '') || generateTemporaryPassword();

    if (!firstName || !lastName || !email || !phone) {
        throw new DomainError(DomainErrorCode.VALIDATION_FAILED, 'DGFY last name, first name, email, and phone are required.', { statusCode: 400 });
    }
    if (!isValidEmail(email)) {
        throw new DomainError(DomainErrorCode.VALIDATION_FAILED, 'Enter a valid DGFY email address.', { statusCode: 400 });
    }
    if (!isValidPhoneNumber(phone)) {
        throw new DomainError(DomainErrorCode.VALIDATION_FAILED, 'DGFY phone must be a valid phone number.', { statusCode: 400 });
    }
    if (temporaryPassword.length < 8) {
        throw new DomainError(DomainErrorCode.VALIDATION_FAILED, 'Temporary password must be at least 8 characters.', { statusCode: 400 });
    }
    return { firstName, middleName, lastName, email, phone, temporaryPassword };
};

export const validateTenantInput = ({ body, ownerAccount = null }) => {
    const name = normalizeName(body.name || body.company_name || body.companyName);
    const workflowMode = normalizeWorkflowMode(body.workflowMode || body.workflow_mode);
    // Issue #178 Phase 17: optional, best-effort - see
    // tenantProvisioningService.js's provisionTenant doc comment. Not
    // validated here (an invalid/mismatched key is ignored with a warning
    // at the provisioning layer, never a hard failure).
    const templateKeyRaw = body.templateKey || body.template_key;
    const templateKey = templateKeyRaw ? String(templateKeyRaw).trim() : null;
    const adminEmail = normalizeEmail(ownerAccount?.email || body.adminEmail || body.admin_email);
    const adminPhone = normalizePhoneNumber(ownerAccount?.phone || body.adminPhone || body.admin_phone);
    const adminUsername = normalizeName(ownerAccount?.first_name || body.adminUsername || body.admin_username || 'Admin') || 'Admin';
    const temporaryPassword = String(body.adminPassword || body.admin_password || body.temporary_password || body.temporaryPassword || '') || generateTemporaryPassword();

    if (!name || !adminEmail || !adminPhone || !temporaryPassword || !isWorkflowMode(workflowMode)) {
        throw new DomainError(
            DomainErrorCode.VALIDATION_FAILED,
            'Company name, admin email, admin phone, temporary password, and business industry are required.',
            { statusCode: 400 }
        );
    }
    if (!isValidEmail(adminEmail)) {
        throw new DomainError(DomainErrorCode.VALIDATION_FAILED, 'Enter a valid admin email address.', { statusCode: 400 });
    }
    if (!isValidPhoneNumber(adminPhone)) {
        throw new DomainError(DomainErrorCode.VALIDATION_FAILED, 'Admin phone must be a valid phone number.', { statusCode: 400 });
    }
    if (temporaryPassword.length < 8) {
        throw new DomainError(DomainErrorCode.VALIDATION_FAILED, 'Temporary password must be at least 8 characters.', { statusCode: 400 });
    }

    return { name, workflowMode, templateKey, adminEmail, adminPhone, adminUsername, temporaryPassword };
};
