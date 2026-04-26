describe('auth middleware module export contract', () => {
    it('exposes all exports required by server-bound modules', async () => {
        const authModule = await import('../src/middleware/auth.js');

        const requiredExports = [
            'authenticate',
            'checkPermission',
            'checkStorefrontBrandingEditPermission',
            'requirePremium',
            'requireMasterAdmin',
            'authenticateAdmin',
            'invalidateUserAuthCache'
        ];

        for (const exportName of requiredExports) {
            expect(typeof authModule[exportName]).toBe('function');
        }
    });
});
