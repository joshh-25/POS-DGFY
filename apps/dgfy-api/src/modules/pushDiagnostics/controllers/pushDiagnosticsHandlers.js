import { DomainError } from '../../shared/contracts/domainErrors.js';
import { pushDiagnosticsUseCases } from '../index.js';

const requestContext = (req) => ({
    requestId: req.requestId || null,
    method: req.method,
    path: req.originalUrl || req.path
});

// Transport only: map a use case result or DomainError to the JSON envelope. An unexpected error
// goes to the global error handler, which never echoes internals.
const respond = (action, status = 200) => async (req, res, next) => {
    res.set('Cache-Control', 'no-store');
    try {
        const data = await action(req);
        return res.status(status).json({ success: true, data });
    } catch (error) {
        if (error instanceof DomainError) {
            return res.status(error.statusCode).json({
                success: false,
                error_code: error.code,
                message: error.message
            });
        }
        return next(error);
    }
};

export const getPushDiagnosticsOverview = respond((req) => pushDiagnosticsUseCases.getOverview({
    admin: req.admin,
    request: requestContext(req)
}));
export const listPushRegistrations = respond((req) => pushDiagnosticsUseCases.listRegistrations(req.query));
export const listPushAttempts = respond((req) => pushDiagnosticsUseCases.listAttempts(req.query));
export const createPushEnrollmentCode = respond((req) => pushDiagnosticsUseCases.createEnrollmentCode({
    admin: req.admin,
    request: requestContext(req)
}), 201);
export const listPushDiagnosticDevices = respond(() => pushDiagnosticsUseCases.listDiagnosticDevices());
export const revokePushDiagnosticDevice = respond((req) => pushDiagnosticsUseCases.revokeDiagnosticDevice({
    admin: req.admin,
    id: req.params.id,
    request: requestContext(req)
}));
export const sendPushDiagnosticTest = respond((req) => pushDiagnosticsUseCases.sendTestNotification({
    admin: req.admin,
    id: req.params.id,
    body: req.body,
    request: requestContext(req)
}));
export const enrollPushDiagnosticDevice = respond((req) => pushDiagnosticsUseCases.enrollDevice(req.body), 201);
export const getPushDiagnosticsAppVisibility = respond(
    () => pushDiagnosticsUseCases.listAppVisibility()
);
export const setPushDiagnosticsAppVisibility = respond((req) => pushDiagnosticsUseCases.setAppVisibility({
    admin: req.admin,
    app: req.params.app,
    body: req.body,
    request: requestContext(req)
}));

export const getPushDiagnosticsAvailability = async (req, res, next) => {
    try {
        const result = await pushDiagnosticsUseCases.getAvailability(req.query);
        return res.set('Cache-Control', 'public, max-age=30').json(result);
    } catch (error) {
        res.set('Cache-Control', 'no-store');
        if (error instanceof DomainError) {
            return res.status(error.statusCode).json({
                success: false,
                error_code: error.code,
                message: error.message
            });
        }
        return next(error);
    }
};
