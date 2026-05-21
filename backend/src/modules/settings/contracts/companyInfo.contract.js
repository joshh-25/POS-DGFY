/**
 * getCompanyInfo use-case input contract.
 *
 * @typedef {Object} GetCompanyInfoInput
 * @property {string} tenantId
 */

/**
 * getCompanyInfo use-case output contract.
 *
 * @typedef {Object} CompanyInfoOutput
 * @property {string} company_name
 * @property {string} company_token
 * @property {string} registration_link
 */

export const CompanyInfoContract = Object.freeze({
    input: ['tenantId'],
    output: ['company_name', 'company_token', 'registration_link']
});
