import fs from 'node:fs';

const read = (relativePath) => fs.readFileSync(new URL(relativePath, import.meta.url), 'utf8');

describe('Phase 158 POS operator mutation attribution contract', () => {
    test('checkout derives cashier and operator session from server middleware', () => {
        const handlers = read('../src/modules/pos/controllers/posHandlers.js');
        const useCases = read('../src/modules/pos/usecases/posUseCases.js');

        expect(handlers).toContain('const actingUser = posMutationUser(req);');
        expect(handlers).toContain('operatorSessionId: req.posOperatorSession?.pos_terminal_operator_session_id || null');
        expect(useCases).toContain('operator_session_id: normalizedOperatorSessionId');
        expect(useCases).toContain('cashier_id: normalizedUserId');
    });

    test('money-changing routes revalidate active operator authority', () => {
        const routes = read('../src/routes/pos.js');
        const protectedFragments = [
            "'/checkouts'",
            "'/discount-approvals/verify'",
            "'/terminal/shifts/:id/cash-events'",
            "'/device/open-drawer'",
            "'/transactions/:id/void'",
            "'/transactions/:id/cash-refund'",
            "'/orders/:id/collect-cash'",
            "'/orders/:id/record-payment'"
        ];
        protectedFragments.forEach((fragment) => {
            const routeLine = routes.split('\n').find((line) => line.includes(fragment));
            expect(routeLine).toContain('requireActiveOperatorForMutation');
        });
    });

    test('protected operations are leased and released around the HTTP mutation lifecycle', () => {
        const handlers = read('../src/modules/pos/controllers/posHandlers.js');
        expect(handlers).toContain('operationKey');
        expect(handlers).toContain('releasePosOperatorMutationUseCase');
        expect(handlers).toContain("res.once('finish', releaseProtectedOperation)");
        expect(handlers).toContain("res.once('close', releaseProtectedOperation)");
    });

    test('immutable money evidence includes the active operator session identity', () => {
        for (const file of [
            '../src/modules/pos/usecases/cashRefundUseCases.js',
            '../src/modules/pos/usecases/externalRefundUseCases.js',
            '../src/modules/pos/usecases/providerRefundUseCases.js',
            '../src/modules/pos/usecases/splitAllocationReversalUseCases.js',
            '../src/modules/pos/usecases/posDeviceUseCases.js'
        ]) {
            expect(read(file)).toContain('operator_session_id');
        }
    });
});
