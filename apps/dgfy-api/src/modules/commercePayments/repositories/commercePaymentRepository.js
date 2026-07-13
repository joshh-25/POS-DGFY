import crypto from 'crypto';

// commercePaymentRepository.js — Phase 10 Plan 05 Task 2 (D-01, STF-04).
//
// Landlord (dgfy_core) persistence adapter for commerce_payment_sessions
// (10-01's CommercePaymentSession model). Mirrors
// ../../businesses/repositories/businessRepository.js's role: owns ALL
// Sequelize queries for this domain; every use case reaches
// CommercePaymentSession exclusively through this repository. No business
// logic lives here, only data access + Model<->plain-object translation.
//
// tenant_id is a UUID string throughout (business_database_registry.
// business_id) and is NEVER integer-coerced anywhere in this file
// (Pitfall 7, ADR 0027 #17) — every method passes it straight through.

const toPlain = (row) => (row?.get ? row.get({ plain: true }) : row);

// Same generation scheme as the legacy reference
// (backend/src/modules/store/usecases/storeUseCases.js:202-210,2421 —
// `CPS-${randomAlphaNumeric(10)}`), re-implemented here rather than
// imported (apps/dgfy-api never imports backend/ code).
const REFERENCE_ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';

const randomAlphaNumeric = (length) => {
    const bytes = crypto.randomBytes(length);
    let output = '';
    for (let i = 0; i < bytes.length; i += 1) {
        output += REFERENCE_ALPHABET[bytes[i] % REFERENCE_ALPHABET.length];
    }
    return output;
};

/** Public-facing session reference, e.g. `CPS-7F3K9A2QXZ`. */
export const generateSessionPublicReference = () => `CPS-${randomAlphaNumeric(10)}`;

export class CommercePaymentRepository {
    /**
     * @param {{commercePaymentSessionModel, sequelize?}} deps - the
     *   Sequelize CommercePaymentSession model, injected by the caller
     *   (index.js) rather than imported directly, so this repository stays
     *   testable with mocks. `sequelize` defaults to
     *   commercePaymentSessionModel.sequelize when omitted.
     */
    constructor({ commercePaymentSessionModel, sequelize } = {}) {
        if (!commercePaymentSessionModel) {
            throw new Error('CommercePaymentRepository requires a Sequelize CommercePaymentSession model.');
        }
        this.model = commercePaymentSessionModel;
        this.sequelize = sequelize || commercePaymentSessionModel.sequelize;
    }

    /**
     * Persists a new landlord payment session row (status defaults to
     * `awaiting_payment`, provider defaults to `paymongo`). D-02: no
     * `split_payload`/`platform_fee_centavos` are ever written here — those
     * columns stay whatever the model's own nullable default is.
     *
     * @param {{storefront_order_id, tenant_id, amount_centavos, provider_payment_intent_id?, provider_payment_id?, qr_code_image_url?, expires_at?, public_reference?}} payload
     */
    async createSession({
        storefront_order_id,
        tenant_id,
        amount_centavos,
        provider_payment_intent_id = null,
        provider_payment_id = null,
        qr_code_image_url = null,
        expires_at = null,
        public_reference = generateSessionPublicReference()
    }) {
        const row = await this.model.create({
            public_reference,
            storefront_order_id,
            // Never integer-coerced (Pitfall 7) — passed through verbatim.
            tenant_id,
            status: 'awaiting_payment',
            provider: 'paymongo',
            provider_payment_intent_id,
            provider_payment_id,
            qr_code_image_url,
            amount_centavos,
            expires_at
        });
        return toPlain(row);
    }

    /**
     * Session resolution order for the webhook (10-08): metadata
     * reference -> payment_intent id -> payment id (Pattern 1,
     * 10-RESEARCH.md:201-223). This method covers the FIRST step.
     */
    async findSessionByPublicReference(publicReference) {
        if (!publicReference) return null;
        const row = await this.model.findOne({ where: { public_reference: publicReference } });
        return toPlain(row);
    }

    /** Session resolution, SECOND step (payment_intent id fallback). */
    async findSessionByProviderPaymentIntent(providerPaymentIntentId) {
        if (!providerPaymentIntentId) return null;
        const row = await this.model.findOne({ where: { provider_payment_intent_id: providerPaymentIntentId } });
        return toPlain(row);
    }

    /** Session resolution, THIRD/last step (payment id fallback). */
    async findSessionByProviderPayment(providerPaymentId) {
        if (!providerPaymentId) return null;
        const row = await this.model.findOne({ where: { provider_payment_id: providerPaymentId } });
        return toPlain(row);
    }

    /**
     * Partial update by primary key (id). Used by 10-08's webhook
     * finalize/expire flow — NOT invoked by this plan's createQrphSession.
     * @param {string} id
     * @param {Object} patch
     */
    async updateSessionStatus(id, patch = {}) {
        const row = await this.model.findByPk(id);
        if (!row) return null;
        await row.update(patch);
        return toPlain(row);
    }
}

/**
 * @param {{commercePaymentSessionModel, sequelize?}} deps
 * @returns {CommercePaymentRepository}
 */
export const buildCommercePaymentRepository = (deps) => new CommercePaymentRepository(deps);

export default CommercePaymentRepository;
