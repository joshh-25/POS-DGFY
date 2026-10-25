import express from 'express';
import { getPublicStorefrontSupportContact } from '../modules/contactInquiries/controllers/storefrontSupportContactHandlers.js';

const router = express.Router();

router.get('/', (req, res, next) => {
  res.set('Cache-Control', 'no-store');
  return getPublicStorefrontSupportContact(req, res, next);
});

export default router;
