import { createHash } from 'crypto';
import { requireReason, validateAccountFields, validateTenantInput } from '../../tenants/usecases/provisioningInputRules.js';
import { WORKFLOW_MODE_VALUES } from '../../shared/constants/workflowModes.js';

export const canonicalJson = (value) => JSON.stringify(sort(value));
const sort = (value) => Array.isArray(value) ? value.map(sort)
    : value && typeof value === 'object'
        ? Object.fromEntries(Object.keys(value).sort().map((key) => [key, sort(value[key])])) : value;
export const hashProposal = (target, payload) => createHash('sha256').update(canonicalJson({ target, payload })).digest('hex');

// Reject credential-bearing input instead of silently forwarding it to a provider.
export const assertNoCredentials = (value) => {
    const credentialName = /(?:password|passwd|passphrase|secret|api[ _-]?key|access[ _-]?token|cookie)/i;
    const text = typeof value === 'string' ? value : JSON.stringify(value);
    const containsCredentialKey = (entry) => entry && typeof entry === 'object'
        && Object.entries(entry).some(([key, child]) => credentialName.test(key) || containsCredentialKey(child));
    // Credential labels in text/CSV, JSON keys, bearer values and common API-key prefixes.
    // Ordinary names such as "Cookie Shop" are not credential assignments.
    if (containsCredentialKey(value)
        || /(?:password|passwd|passphrase|secret|api[ _-]?key|access[ _-]?token|cookie)["'\s]*[:=,\]\r\n]/i.test(text || '')
        || /\bbearer\s+\S+|\bsk-(?:proj-)?[a-zA-Z0-9_-]{12,}/i.test(text || '')) {
        throw new Error('Remove credentials from the intake input before submitting.');
    }
};

export const validateProvisioningProposal = (input = {}, target = 'OFFICIAL') => {
    const warnings = ['Contact information is extracted or operator-supplied; ownership has not been independently verified.'];
    try {
        if (!['OFFICIAL', 'DEMO'].includes(target)) throw new Error('Target must be OFFICIAL or DEMO.');
        assertNoCredentials(input);
        const account = validateAccountFields(input.dgfy_account || input.account || input);
        const company = validateTenantInput({ body: input.company || input.tenant || input,
            ownerAccount: { email: account.email, phone: account.phone, first_name: account.firstName } });
        const rawCompany = input.company || input.tenant || input;
        if (!WORKFLOW_MODE_VALUES.includes(rawCompany.workflowMode || rawCompany.workflow_mode)) {
            warnings.push(`Business industry was missing or unrecognized and normalized to ${company.workflowMode}; explicitly review it.`);
        }
        const payload = {
            reason: requireReason(input.reason),
            dgfy_account: { first_name: account.firstName, middle_name: account.middleName,
                last_name: account.lastName, email: account.email, phone: account.phone },
            company: { name: company.name, workflowMode: company.workflowMode, templateKey: company.templateKey }
        };
        // Only explicit fields survive. LLM output cannot select role, owner, verification or credentials.
        for (const fields of [payload.dgfy_account, payload.company]) {
            if (Object.values(fields).some((value) => typeof value === 'string' && value.length > 255)) {
                throw new Error('Provisioning fields must be at most 255 characters.');
            }
        }
        if (company.templateKey) warnings.push('Template selection is best-effort; provisioning may ignore an incompatible template.');
        return { payload, payload_hash: hashProposal(target, payload), warnings, errors: [] };
    } catch (error) {
        return { payload: null, payload_hash: null, warnings, errors: [error.message] };
    }
};
