import { describe, expect, it } from '@jest/globals';
import { readFileSync } from 'node:fs';

const routeSource = readFileSync(new URL('../src/routes/pos.js', import.meta.url), 'utf8');

describe('POS terminal device bootstrap route', () => {
    it('keeps first enrollment before authenticated POS middleware and uses the bootstrap validator/handler', () => {
        const activationRoute = routeSource.indexOf("'/terminal/devices/activate'");
        const authMiddleware = routeSource.indexOf('router.use(authenticate);');

        expect(activationRoute).toBeGreaterThan(-1);
        expect(authMiddleware).toBeGreaterThan(activationRoute);
        expect(routeSource.slice(activationRoute, authMiddleware)).toContain('validatePosTerminalDeviceBootstrapActivate');
        expect(routeSource.slice(activationRoute, authMiddleware)).toContain('activateDeviceBootstrap');
    });
});
