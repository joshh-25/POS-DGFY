import express from 'express';
import {
    registerCompanyRequest,
    listTenants,
    approveTenant,
    rejectTenant,
    provisionNewTenant,
    getPricingSettings,
    updatePricingSettings,
    updateTenant,
    deleteTenant
} from '../controllers/adminTenantController.js';
import { authenticateAdmin } from '../middleware/auth.js';
import { tenantRegistrationLimiter } from '../middleware/rateLimiter.js';

const router = express.Router();

// PUBLIC: Submit company registration request (no auth required)
router.post('/register', tenantRegistrationLimiter, registerCompanyRequest);

// ADMIN: List all tenants (requires admin auth)
router.get('/', authenticateAdmin, listTenants);

// ADMIN: Pricing Settings
router.get('/pricing', authenticateAdmin, getPricingSettings);
router.put('/pricing', authenticateAdmin, updatePricingSettings);

// ADMIN: Approve a pending tenant (triggers provisioning)
router.post('/:id/approve', authenticateAdmin, approveTenant);

// ADMIN: Reject a pending tenant
// ADMIN: Reject a pending tenant
router.post('/:id/reject', authenticateAdmin, rejectTenant);

// ADMIN: Update tenant details (status, plan)
router.put('/:id', authenticateAdmin, updateTenant);

// ADMIN: Permanently delete tenant
router.delete('/:id', authenticateAdmin, deleteTenant);

// ADMIN: Direct provisioning (legacy, kept for backward compatibility)
router.post('/provision', authenticateAdmin, provisionNewTenant);

export default router;
