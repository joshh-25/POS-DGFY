import express from 'express';
import {
    leaseStorefrontDomainOperation,
    reportStorefrontDomainOperation
} from '../modules/storefrontDomains/controllers/storefrontDomainOperationHandlers.js';
import { authenticateStorefrontDomainController } from '../modules/storefrontDomains/middleware/authenticateStorefrontDomainController.js';

const router = express.Router();

router.use(authenticateStorefrontDomainController);
router.post('/lease', leaseStorefrontDomainOperation);
router.post('/:operationId/result', reportStorefrontDomainOperation);

export default router;
