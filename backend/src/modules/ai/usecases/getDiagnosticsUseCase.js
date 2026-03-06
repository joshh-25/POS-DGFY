export const buildGetDiagnosticsUseCase = ({ runDiagnostics }) => {
    return async ({ user }) => {
        const report = await runDiagnostics(user);
        return report;
    };
};
