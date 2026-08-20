import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const storeRoutesPath = path.resolve(__dirname, '../src/routes/store.js');
const storefrontDiscoveryRoutesPath = path.resolve(__dirname, '../src/routes/storefrontDiscovery.js');

const escapeRegexLiteral = (value) => String(value).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

const extractRouteDeclaration = ({ source, method, routePath }) => {
    const methodPattern = escapeRegexLiteral(method);
    const pathPattern = escapeRegexLiteral(routePath);
    const matcher = new RegExp(`router\\.${methodPattern}\\(\\s*['"]${pathPattern}['"][\\s\\S]{0,420}?\\);`, 'm');
    const match = matcher.exec(source);
    return match ? match[0] : null;
};

const expectRouteContract = ({ source, method, routePath, requiredFragments = [] }) => {
    const declaration = extractRouteDeclaration({ source, method, routePath });
    expect(declaration).not.toBeNull();
    requiredFragments.forEach((fragment) => {
        if (fragment instanceof RegExp) {
            expect(declaration).toMatch(fragment);
            return;
        }
        expect(declaration).toContain(fragment);
    });
};

describe('cache policy route contracts', () => {
    let storeRoutes = '';
    let discoveryRoutes = '';

    beforeAll(() => {
        storeRoutes = fs.readFileSync(storeRoutesPath, 'utf8');
        discoveryRoutes = fs.readFileSync(storefrontDiscoveryRoutesPath, 'utf8');
    });

    it('applies explicit read-cache middleware to public storefront reads', () => {
        expect(storeRoutes).toContain("varyHeaders: ['X-Store-Slug']");
        expectRouteContract({
            source: storeRoutes,
            method: 'get',
            routePath: '/catalog',
            requiredFragments: ['catalogReadCacheControl']
        });
        expectRouteContract({
            source: storeRoutes,
            method: 'get',
            routePath: '/locations',
            // storeLocationsLimiter: this route had no rate limiter at all until
            // the discovery-page fan-out that hammered it was found (#297).
            requiredFragments: ['storeLocationsLimiter', 'locationsReadCacheControl']
        });
        expectRouteContract({
            source: storeRoutes,
            method: 'get',
            routePath: '/track/:tracking_pin',
            requiredFragments: ['storeTrackingReadLimiter', 'trackingReadCacheControl']
        });
        expectRouteContract({
            source: discoveryRoutes,
            method: 'get',
            routePath: '/discovery',
            requiredFragments: ['discoveryListCacheControl']
        });
        expectRouteContract({
            source: discoveryRoutes,
            method: 'get',
            routePath: '/discovery/:slug',
            requiredFragments: ['discoveryProfileCacheControl']
        });
    });

    it('bypasses the shared catalog/QR cache for both a voucher code and affiliate attribution (#671)', () => {
        // Both are per-buyer pricing overrides baked into the response body -- a shared cache must
        // not serve one buyer's priced response to another. Contract-level (source-text) check,
        // matching this file's existing style, since these routes need a live DB-backed app to
        // exercise as a real request.
        expectRouteContract({
            source: storeRoutes,
            method: 'get',
            routePath: '/catalog',
            requiredFragments: ['bypassCacheForPerBuyerPricing']
        });
        expectRouteContract({
            source: storeRoutes,
            method: 'get',
            routePath: '/qr/resolve',
            requiredFragments: ['bypassCacheForPerBuyerPricing']
        });
        expect(storeRoutes).toMatch(/bypassCacheForPerBuyerPricing[\s\S]{0,400}getCookie\(req, SESSION_COOKIE_NAMES\.affiliateAttribution\)/);
    });

    it('keeps mutation/auth endpoints non-cacheable with no-store middleware', () => {
        expectRouteContract({
            source: storeRoutes,
            method: 'post',
            routePath: '/auth/register',
            requiredFragments: ['setNoStoreCacheControl']
        });
        expectRouteContract({
            source: storeRoutes,
            method: 'post',
            routePath: '/auth/login',
            requiredFragments: ['setNoStoreCacheControl']
        });
        expectRouteContract({
            source: storeRoutes,
            method: 'post',
            routePath: '/checkout',
            requiredFragments: ['setNoStoreCacheControl']
        });
        expectRouteContract({
            source: storeRoutes,
            method: 'post',
            routePath: '/cart/quote',
            requiredFragments: ['setNoStoreCacheControl']
        });
        expectRouteContract({
            source: storeRoutes,
            method: 'patch',
            routePath: '/orders/:tracking_pin/cancel',
            requiredFragments: ['setNoStoreCacheControl', 'storeTrackingLimiter']
        });
    });
});
