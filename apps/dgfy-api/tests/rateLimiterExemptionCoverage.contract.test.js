import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const rateLimiterPath = path.resolve(__dirname, '../src/middleware/rateLimiter.js');
const routesDir = path.resolve(__dirname, '../src/routes');

const readRoute = (fileName) => fs.readFileSync(path.join(routesDir, fileName), 'utf8');

// generalLimiter.skip() exempts certain authenticated/internal traffic from the
// shared public-IP bucket (see rateLimiter.js:481-492) so a busy store network
// doesn't throttle ordinary operational work. Each exemption below MUST be
// covered by a dedicated limiter of its own in the corresponding route file —
// otherwise the exempted traffic is rate-limited by nothing at all. This is
// exactly the bug found in GET /api/v1/items/barcodes/resolve (uncapped
// authenticated item-operations traffic) that this test exists to prevent
// from recurring, for this route group or any other.
describe('generalLimiter exemption coverage', () => {
    let rateLimiterSource = '';

    beforeAll(() => {
        rateLimiterSource = fs.readFileSync(rateLimiterPath, 'utf8');
    });

    it('keeps the documented set of generalLimiter skip predicates unchanged without a conscious update here', () => {
        // If this fails, a new skip predicate was added to generalLimiter's skip()
        // (rateLimiter.js) without updating this test to verify it has a dedicated
        // limiter standing in for the shared IP bucket it now bypasses.
        const generalLimiterStart = rateLimiterSource.indexOf('export const generalLimiter');
        expect(generalLimiterStart).toBeGreaterThan(-1);
        const nextExportStart = rateLimiterSource.indexOf('\nexport const', generalLimiterStart + 1);
        const generalLimiterBlock = rateLimiterSource.slice(generalLimiterStart, nextExportStart);
        const skipBody = /skip:\s*\(req\)\s*=>\s*\{([\s\S]*?)\n\s*\},\n\}\);/.exec(generalLimiterBlock)?.[1] || '';
        const predicateCalls = [...skipBody.matchAll(/^\s*if \((.+)\) return true;\s*$/gm)].map((match) => match[1].trim());
        expect(predicateCalls).toEqual([
            "req.path === '/health'",
            "process.env.NODE_ENV === 'test'",
            "isDevelopment && process.env.DISABLE_RATE_LIMIT === 'true'",
            "/^\\/(?:v1\\/)?(?:pos|mobile-pos)(?:\\/|$)/.test(req.path || req.originalUrl || '')",
            'isAuthenticatedPosBootstrapRead(req)',
            'isAuthenticatedItemOperation(req)'
        ]);
    });

    it('covers pos/mobile-pos path-prefix exempted traffic with posLimiter', () => {
        const posRoutes = readRoute('pos.js');
        const mobilePosRoutes = readRoute('mobilePos.js');
        expect(posRoutes).toContain('router.use(posLimiter)');
        expect(mobilePosRoutes).toContain('router.use(posLimiter)');
    });

    it('covers isAuthenticatedItemOperation-exempted /api/v1/items traffic with itemOperationsLimiter', () => {
        const itemRoutes = readRoute('items.js');
        expect(itemRoutes).toContain("import { itemOperationsLimiter } from '../middleware/rateLimiter.js'");
        expect(itemRoutes).toContain('router.use(itemOperationsLimiter)');
        // Must be applied after authenticate so req.user/req.tenant are populated
        // for the limiter's tenant+user keyGenerator.
        expect(itemRoutes.indexOf('router.use(authenticate)')).toBeLessThan(itemRoutes.indexOf('router.use(itemOperationsLimiter)'));
    });

    it('documents every isAuthenticatedPosBootstrapRead path and its rate-limit coverage', () => {
        const pathsBlock = /AUTHENTICATED_POS_BOOTSTRAP_READ_PATHS = new Set\(\[([\s\S]*?)\]\);/.exec(rateLimiterSource)?.[1] || '';
        const paths = [...pathsBlock.matchAll(/'([^']+)'/g)].map((match) => match[1]);

        // /api/v1/pos/* bootstrap reads are covered by posLimiter (router.use in
        // pos.js applies to the whole router, including these GET routes).
        const posLimiterCoveredPrefixes = ['/api/v1/pos/'];

        // These are GET-only, low-volume bootstrap reads (settings, current user,
        // tenant locations, item/folder listing on app load) with no dedicated
        // limiter today. Known, pre-existing gap — same shape as the items.js bug
        // this test suite guards against, but far lower risk since none of these
        // are hit in a scan/retry loop. Tracked as a follow-up; NOT silently
        // acceptable to grow this list without reviewing whether the new path
        // needs its own limiter.
        const knownUnprotectedBootstrapReads = new Set([
            '/api/v1/settings',
            '/api/v1/settings/company-info',
            '/api/v1/users/me',
            '/api/v1/users',
            '/api/v1/tenant-locations',
            '/api/v1/items',
            '/api/v1/items/folders'
        ]);

        const uncoveredPaths = paths.filter((candidatePath) => (
            !posLimiterCoveredPrefixes.some((prefix) => candidatePath.startsWith(prefix))
            && !knownUnprotectedBootstrapReads.has(candidatePath)
        ));

        expect(uncoveredPaths).toEqual([]);
    });

    // Consolidated from tests/onboardingRoutes.contract.test.js (#1441)
    it('guards onboarding events route with dedicated onboarding events limiter', () => {
        const onboardingRoutes = readRoute('onboarding.js');
        expect(onboardingRoutes).toContain('onboardingEventsLimiter');
        expect(onboardingRoutes).toContain("router.post('/events', authenticate, requireMasterAdmin, onboardingEventsLimiter, validateOnboardingEventPayload, onboardingController.trackOnboardingEvent);");
    });

    // Consolidated from tests/onboardingRoutes.contract.test.js (#1441)
    it('exposes a master-admin guarded bulk onboarding items route', () => {
        const onboardingRoutes = readRoute('onboarding.js');
        expect(onboardingRoutes).toContain("router.post('/items/bulk', authenticate, requireMasterAdmin, validateOnboardingBulkItemsPayload, onboardingController.bulkCreateOnboardingItems);");
    });
});
