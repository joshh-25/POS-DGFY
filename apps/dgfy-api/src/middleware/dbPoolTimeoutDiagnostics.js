import { recordConnectionAcquireTimeout } from '../utils/dbPoolDiagnostics.js';

export const dbPoolTimeoutDiagnostics = (error, req, _res, next) => {
    try {
        recordConnectionAcquireTimeout(error, { req });
    } catch {
        // The recorder is best-effort; preserve the original error regardless.
    }
    return next(error);
};

export default dbPoolTimeoutDiagnostics;
