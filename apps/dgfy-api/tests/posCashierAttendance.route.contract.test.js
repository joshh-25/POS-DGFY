import fs from 'fs';
import path from 'path';
import { describe, expect, it } from '@jest/globals';
import {
    validateAttendanceCorrection,
    validateAttendanceMutation,
    validateAttendanceQuery,
    validateCashierResume
} from '../src/validators/posValidator.js';

const routeSource = fs.readFileSync(path.resolve(process.cwd(), 'src/routes/pos.js'), 'utf8');

const runValidator = (validator, source, value) => {
    const req = { [source]: value };
    const res = { status: () => res, json: () => res };
    let nextCalled = false;
    validator(req, res, () => { nextCalled = true; });
    return { req, nextCalled };
};

describe('POS cashier attendance lifecycle route contract', () => {
    it('exposes every lifecycle action with dedicated attendance permissions', () => {
        expect(routeSource).toContain("router.get('/attendance/current', checkPermission(PERMISSIONS.POS.actions.VIEW_ATTENDANCE), validateAttendanceQuery, posController.getCurrentAttendance);");
        expect(routeSource).toContain("router.post('/attendance/time-in', checkPermission(PERMISSIONS.POS.actions.OPERATE_ATTENDANCE), validateAttendanceMutation, posController.timeInAttendance);");
        expect(routeSource).toContain("router.post('/attendance/time-out', checkPermission(PERMISSIONS.POS.actions.OPERATE_ATTENDANCE), validateAttendanceMutation, posController.timeOutAttendance);");
        expect(routeSource).toContain("router.post('/attendance/breaks/start', checkPermission(PERMISSIONS.POS.actions.OPERATE_ATTENDANCE), validateAttendanceMutation, posController.startAttendanceBreak);");
        expect(routeSource).toContain("router.post('/attendance/breaks/end', checkPermission(PERMISSIONS.POS.actions.OPERATE_ATTENDANCE), validateAttendanceMutation, posController.endAttendanceBreak);");
        expect(routeSource).toContain("router.post('/attendance/relief/start', checkPermission(PERMISSIONS.POS.actions.OPERATE_ATTENDANCE), validateAttendanceMutation, posController.startReliefDuty);");
        expect(routeSource).toContain("router.post('/attendance/relief/end', checkPermission(PERMISSIONS.POS.actions.OPERATE_ATTENDANCE), validateAttendanceMutation, posController.endReliefDuty);");
        expect(routeSource).toContain("router.post('/attendance/corrections', checkPermission(PERMISSIONS.POS.actions.MANAGE_ATTENDANCE), validateAttendanceCorrection, posController.correctAttendance);");
        // #1045: /terminal/operator/current and /terminal/operator/resume enforce
        // pos:attendance:* INSIDE their use cases, after the attendance-feature
        // resolve -- never via route-level checkPermission -- so a location with
        // the lifecycle disabled answers POS_ATTENDANCE_FEATURE_DISABLED instead of
        // a bare 403 the terminal cannot interpret. Pin both the new literal and
        // the absence of the route-level guard, so a well-meaning "restore" of the
        // guard fails this test instead of silently reproducing the incident.
        expect(routeSource).toContain("router.get('/terminal/operator/current', posController.requirePairedTerminal, validateOperatorCurrentQuery, posController.getCurrentOperator);");
        expect(routeSource).toContain("router.post('/terminal/operator/resume', posController.requirePairedTerminal, validateCashierResume, posController.resumeCashier);");
        expect(routeSource).not.toContain("checkPermission(PERMISSIONS.POS.actions.VIEW_ATTENDANCE), posController.requirePairedTerminal, validateOperatorCurrentQuery, posController.getCurrentOperator");
        expect(routeSource).not.toContain("checkPermission(PERMISSIONS.POS.actions.OPERATE_ATTENDANCE), posController.requirePairedTerminal, validateCashierResume, posController.resumeCashier");
    });

    it('validates server-owned lifecycle input and strips unsupported fields', () => {
        const mutation = runValidator(validateAttendanceMutation, 'body', {
            idempotency_key: 'attendance-action-001',
            location_id: 12,
            employee_id: 44,
            started_at: 'client-controlled',
            status: 'open'
        });
        const current = runValidator(validateAttendanceQuery, 'query', { location_id: '12', limit: '10', cursor: 'ignored' });
        const correction = runValidator(validateAttendanceCorrection, 'body', {
            idempotency_key: 'manager-correction-001',
            attendance_session_id: 81,
            correction_action: 'end_break',
            location_id: 12,
            reason: 'Cashier forgot to end break',
            ended_at: 'client-controlled'
        });
        const resume = runValidator(validateCashierResume, 'body', {
            idempotency_key: 'cashier-resume-001',
            terminal_id: 'COUNTER-01',
            location_id: 12,
            shift_id: 81,
            ignored: 'client-controlled'
        });

        expect(mutation.nextCalled).toBe(true);
        expect(mutation.req.validatedData).toEqual({
            idempotency_key: 'attendance-action-001',
            location_id: 12,
            employee_id: 44
        });
        expect(current.nextCalled).toBe(true);
        expect(current.req.validatedQuery).toEqual({ location_id: 12, limit: 10 });
        expect(correction.nextCalled).toBe(true);
        expect(correction.req.validatedData).not.toHaveProperty('ended_at');
        expect(correction.req.validatedData.reason).toBe('Cashier forgot to end break');
        expect(resume.nextCalled).toBe(true);
        expect(resume.req.validatedData).toEqual({
            idempotency_key: 'cashier-resume-001',
            terminal_id: 'COUNTER-01',
            location_id: 12,
            shift_id: 81
        });
    });
});
