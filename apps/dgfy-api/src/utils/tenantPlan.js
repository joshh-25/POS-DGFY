import { paymentsEnabled } from '../config/paymentsFeature.js';

// Deliberately dependency-light (only config/paymentsFeature.js, itself
// dependency-free) so infrastructure that needs to ask "is this tenant
// premium?" - e.g. middleware/rateLimiter.js's mobile-pos free-tier cap -
// doesn't have to import middleware/auth.js and, transitively,
// services/authService.js, which throws at module-load time if JWT_SECRET
// isn't configured. middleware/auth.js's requirePremium uses this too, so
// the billing-paused / grace-period rules live in exactly one place.
export const isPremiumActiveTenant = (req) => {
  if (!req.tenant) return false;

  const tenantPlan = String(req.tenant.plan || '').toLowerCase();
  if (tenantPlan !== 'premium') return false;

  // Billing-paused mode allows manual plan metadata overrides to unlock premium-gated features.
  if (!paymentsEnabled) return true;

  // G7: Also verify the premium subscription is still live (active or in grace period).
  const now = new Date();
  const subStatus = String(req.tenant.subscription_status || '').toLowerCase();
  const gracePeriodEnd = req.tenant.grace_period_end ? new Date(req.tenant.grace_period_end) : null;
  const inGrace = subStatus === 'past_due' && gracePeriodEnd && gracePeriodEnd > now;

  return subStatus === 'active' || inGrace;
};
