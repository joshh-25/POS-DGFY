/**
 * Tenant Location Controller (Compatibility Facade)
 */

export {
    listTenantLocations,
    createTenantLocation,
    updateTenantLocation,
    updateDineInPaymentPolicy,
    deactivateTenantLocation,
    deleteTenantLocation
} from '../modules/tenantLocations/controllers/tenantLocationHandlers.js';

import {
    listTenantLocations,
    createTenantLocation,
    updateTenantLocation,
    updateDineInPaymentPolicy,
    deactivateTenantLocation,
    deleteTenantLocation
} from '../modules/tenantLocations/controllers/tenantLocationHandlers.js';

export default {
    listTenantLocations,
    createTenantLocation,
    updateTenantLocation,
    deactivateTenantLocation,
    deleteTenantLocation
};
