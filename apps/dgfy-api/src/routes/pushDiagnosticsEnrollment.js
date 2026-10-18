import express from 'express';
import { pushDiagnosticEnrollLimiter } from '../middleware/rateLimiter.js';
import { enrollPushDiagnosticDevice } from '../modules/pushDiagnostics/controllers/pushDiagnosticsHandlers.js';

const router = express.Router();

// Session-less on purpose: the device proves possession of a single-use, short-lived code that a
// Platform Admin issued. See modules/pushDiagnostics/README.md.
router.post('/enroll', pushDiagnosticEnrollLimiter, enrollPushDiagnosticDevice);

export default router;
