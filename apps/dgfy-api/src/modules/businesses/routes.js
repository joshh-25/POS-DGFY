import express from 'express';
import { buildBusinessController } from './controllers/businessController.js';

/**
 * Scaffolded in Wave 2; Wave 3 (04-03-PLAN.md) adds real business
 * creation/listing/staff-onboarding routes. Returns an empty router so it
 * can be safely mounted (or left unmounted) without exposing any endpoints
 * yet — no premature dependency on Wave 3 logic.
 * @param {Object} [useCases] - reserved for Wave 3
 */
export function createBusinessRoutes(useCases = {}) {
    const router = express.Router();
    buildBusinessController(useCases); // wired for parity with accounts/routes.js; no routes yet
    return router;
}

export default createBusinessRoutes;
