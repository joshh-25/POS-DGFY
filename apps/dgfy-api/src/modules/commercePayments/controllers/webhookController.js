import { sendUseCaseResult } from '../../../shared/controllers/useCaseResponder.js';

// Transport-only controller (Clean Architecture Interface Adapter) for the
// PayMongo webhook + operator retry surface (STF-05, 10-08-PLAN.md). No
// business logic, no direct model/repository imports — parses HTTP
// request data and delegates to the injected use cases.
//
// handleWebhook reads `req.rawBody` (the EXACT bytes app.js's
// express.json({verify}) stashed) so signature verification happens over
// what PayMongo actually signed, not a re-serialized `req.body` (T-10-08-04
// — the point of the raw-body capture). Falls back to re-stringifying
// req.body only if rawBody is somehow missing (defensive, should not
// happen in production once app.js's verify callback is wired).
export function buildWebhookController(useCases = {}) {
    return {
        // POST /commerce-payments/paymongo/webhook
        async handleWebhook(req, res) {
            const signatureHeader = req.headers['paymongo-signature'] || req.headers['x-paymongo-signature'] || '';
            const rawBody = req.rawBody ? req.rawBody.toString('utf8') : JSON.stringify(req.body || {});
            const result = await useCases.handleWebhook({
                rawBody,
                signatureHeader,
                body: req.body || {},
                headers: req.headers || {}
            });
            return sendUseCaseResult(res, result, 200);
        },

        // POST /commerce-payments/sessions/:reference/retry-finalization
        async retryFinalization(req, res) {
            const result = await useCases.retryFinalization({
                sessionReference: req.params.reference,
                actorAccountId: req.account?.id ?? null
            });
            return sendUseCaseResult(res, result, 200);
        }
    };
}

export default buildWebhookController;
