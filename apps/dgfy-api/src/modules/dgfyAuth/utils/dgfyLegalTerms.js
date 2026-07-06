import { createHash } from 'crypto';
import { DomainError, DomainErrorCode } from '../contracts/domainErrors.js';

export const DGFY_MARKETPLACE_PROVIDER_CLAUSE = 'DGFY is an e-marketplace/platform service provider. The seller owns the product, sets the price, fulfills the order, and remains the seller of record. Online payments are processed by licensed payment partners such as PayMongo; DGFY does not operate a stored-value wallet or hold seller settlement funds. When PayMongo QR Ph checkout is used, the disclosed DGFY platform fee is 1% of the item subtotal and is charged to the customer as an added platform fee. PayMongo/provider processing, payout, bank, dispute, and related provider fees are shouldered by the registered company and reduce the company net settlement unless a separate signed provider contract says otherwise.';

export const DGFY_LEGAL_TERM_FLOWS = Object.freeze({
    ACCOUNT_REGISTRATION: 'dgfy_account_registration',
    COMPANY_REGISTRATION: 'dgfy_company_registration'
});

export const DGFY_LEGAL_TERM_VERSIONS = Object.freeze({
    accountTerms: 'dgfy-account-terms-2026-06-08',
    privacy: 'dgfy-privacy-2026-06-08',
    marketplaceTerms: 'dgfy-marketplace-provider-2026-06-08',
    companyTerms: 'dgfy-company-terms-2026-06-08'
});

export const DGFY_LEGAL_DOCUMENTS = Object.freeze({
    accountTerms: Object.freeze({
        key: 'accountTerms',
        title: 'DGFY Account Terms',
        version: DGFY_LEGAL_TERM_VERSIONS.accountTerms,
        href: '/legal/dgfy-account-terms',
        summary: 'Governs the DGFY account used for registration, customer activity, order tracking, and company ownership workflows.'
    }),
    privacy: Object.freeze({
        key: 'privacy',
        title: 'DGFY Privacy Policy',
        version: DGFY_LEGAL_TERM_VERSIONS.privacy,
        href: '/privacy',
        summary: 'Explains how DGFY account, registration, order, verification, and support information is handled.'
    }),
    marketplaceTerms: Object.freeze({
        key: 'marketplaceTerms',
        title: 'DGFY Marketplace Provider Terms',
        version: DGFY_LEGAL_TERM_VERSIONS.marketplaceTerms,
        href: '/legal/dgfy-marketplace-provider-terms',
        summary: DGFY_MARKETPLACE_PROVIDER_CLAUSE
    }),
    companyTerms: Object.freeze({
        key: 'companyTerms',
        title: 'DGFY Company Registration Terms',
        version: DGFY_LEGAL_TERM_VERSIONS.companyTerms,
        href: '/legal/dgfy-company-terms',
        summary: 'Confirms the registering company remains seller of record, owns fulfillment and customer obligations, uses a registered business payout account, and shoulders PayMongo/provider fees.'
    })
});

const ACCOUNT_ACKNOWLEDGEMENT_TEXT = [
    'I agree to the DGFY Terms, Privacy Policy, and marketplace account terms.',
    DGFY_MARKETPLACE_PROVIDER_CLAUSE
].join(' ');

const COMPANY_ACKNOWLEDGEMENT_TEXT = [
    'I confirm that the registered company is the seller of record for products, services, prices, fulfillment, customer support, tax obligations, and payout account ownership.',
    DGFY_MARKETPLACE_PROVIDER_CLAUSE
].join(' ');

const isTrue = (value) => value === true || value === 'true' || value === 1 || value === '1';
const hashText = (value) => createHash('sha256').update(String(value || ''), 'utf8').digest('hex');

const buildError = (message, details = {}) => new DomainError(
    DomainErrorCode.VALIDATION_FAILED,
    message,
    {
        statusCode: 422,
        details: {
            error_code: 'TERMS_ACKNOWLEDGEMENT_REQUIRED',
            ...details
        }
    }
);

const requireVersion = ({ provided, expected, field }) => {
    if (String(provided || '').trim() !== expected) {
        throw buildError('Accept the current DGFY terms before continuing.', {
            field,
            expected_version: expected,
            provided_version: provided || null
        });
    }
};

export const getDgfyLegalTermSnapshot = (flow) => {
    if (flow === DGFY_LEGAL_TERM_FLOWS.ACCOUNT_REGISTRATION) {
        return {
            flow,
            terms_version: DGFY_LEGAL_TERM_VERSIONS.accountTerms,
            privacy_version: DGFY_LEGAL_TERM_VERSIONS.privacy,
            company_terms_version: null,
            marketplace_terms_version: DGFY_LEGAL_TERM_VERSIONS.marketplaceTerms,
            acknowledgement_text: ACCOUNT_ACKNOWLEDGEMENT_TEXT,
            acknowledgement_hash: hashText(ACCOUNT_ACKNOWLEDGEMENT_TEXT)
        };
    }

    if (flow === DGFY_LEGAL_TERM_FLOWS.COMPANY_REGISTRATION) {
        return {
            flow,
            terms_version: null,
            privacy_version: null,
            company_terms_version: DGFY_LEGAL_TERM_VERSIONS.companyTerms,
            marketplace_terms_version: DGFY_LEGAL_TERM_VERSIONS.marketplaceTerms,
            acknowledgement_text: COMPANY_ACKNOWLEDGEMENT_TEXT,
            acknowledgement_hash: hashText(COMPANY_ACKNOWLEDGEMENT_TEXT)
        };
    }

    throw new Error(`Unknown DGFY legal terms flow: ${flow}`);
};

export const getDgfyLegalTermsPayload = () => ({
    provider_clause: DGFY_MARKETPLACE_PROVIDER_CLAUSE,
    versions: DGFY_LEGAL_TERM_VERSIONS,
    documents: DGFY_LEGAL_DOCUMENTS,
    flows: {
        account_registration: {
            flow: DGFY_LEGAL_TERM_FLOWS.ACCOUNT_REGISTRATION,
            acknowledgement_field: 'accepted_terms',
            version_fields: ['terms_version', 'privacy_version', 'marketplace_terms_version'],
            documents: [
                DGFY_LEGAL_DOCUMENTS.accountTerms,
                DGFY_LEGAL_DOCUMENTS.privacy,
                DGFY_LEGAL_DOCUMENTS.marketplaceTerms
            ],
            snapshot: getDgfyLegalTermSnapshot(DGFY_LEGAL_TERM_FLOWS.ACCOUNT_REGISTRATION)
        },
        company_registration: {
            flow: DGFY_LEGAL_TERM_FLOWS.COMPANY_REGISTRATION,
            acknowledgement_field: 'accepted_company_terms',
            version_fields: ['company_terms_version', 'marketplace_terms_version'],
            documents: [
                DGFY_LEGAL_DOCUMENTS.companyTerms,
                DGFY_LEGAL_DOCUMENTS.marketplaceTerms
            ],
            snapshot: getDgfyLegalTermSnapshot(DGFY_LEGAL_TERM_FLOWS.COMPANY_REGISTRATION)
        }
    }
});

export const assertDgfyLegalAcknowledgement = ({ flow, body = {} }) => {
    const snapshot = getDgfyLegalTermSnapshot(flow);

    if (flow === DGFY_LEGAL_TERM_FLOWS.ACCOUNT_REGISTRATION) {
        if (!isTrue(body.accepted_terms ?? body.acceptedTerms)) {
            throw buildError('Accept the DGFY account terms before creating an account.', {
                field: 'accepted_terms'
            });
        }

        requireVersion({
            provided: body.terms_version ?? body.termsVersion,
            expected: snapshot.terms_version,
            field: 'terms_version'
        });
        requireVersion({
            provided: body.privacy_version ?? body.privacyVersion,
            expected: snapshot.privacy_version,
            field: 'privacy_version'
        });
        requireVersion({
            provided: body.marketplace_terms_version ?? body.marketplaceTermsVersion,
            expected: snapshot.marketplace_terms_version,
            field: 'marketplace_terms_version'
        });

        return snapshot;
    }

    if (flow === DGFY_LEGAL_TERM_FLOWS.COMPANY_REGISTRATION) {
        if (!isTrue(body.accepted_company_terms ?? body.acceptedCompanyTerms)) {
            throw buildError('Accept the DGFY company terms before registering a company.', {
                field: 'accepted_company_terms'
            });
        }

        requireVersion({
            provided: body.company_terms_version ?? body.companyTermsVersion,
            expected: snapshot.company_terms_version,
            field: 'company_terms_version'
        });
        requireVersion({
            provided: body.marketplace_terms_version ?? body.marketplaceTermsVersion,
            expected: snapshot.marketplace_terms_version,
            field: 'marketplace_terms_version'
        });

        return snapshot;
    }

    throw buildError('DGFY terms acknowledgement is required.', { field: 'flow' });
};
