import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const pageSource = fs.readFileSync(
    path.resolve(__dirname, '../../src/features/businessAdmin/BusinessAdminPage.jsx'),
    'utf8'
);
const serviceSource = fs.readFileSync(
    path.resolve(__dirname, '../../src/features/businessAdmin/businessAdminService.js'),
    'utf8'
);

describe('OPIS Business Admin stability contract', () => {
    it('keeps the mounted workspace during revalidation and aborts stale section requests', () => {
        expect(pageSource).toContain('const [bootstrapRefreshing, setBootstrapRefreshing] = useState(false);');
        expect(pageSource).toContain('if (bootstrapLoading && !bootstrap) return <Loading />;');
        expect(pageSource).toContain('const controller = typeof AbortController');
        expect(pageSource).toContain('signal: controller.signal');
        expect(pageSource).toContain('sectionAbortRef.current?.abort();');
        expect(pageSource).toContain('if (sectionError && !canKeepSectionWorkspace && !sectionLoading)');
        expect(pageSource).not.toContain('key={workspaceTransitionKey}');
    });

    it('uses one authorized URL branch selector and debounces committed search', () => {
        expect(pageSource).toContain('const selectAuthorizedBranch = useCallback');
        expect(pageSource).toContain("selectAuthorizedBranch(normalizedBranchId, 'pos-location-context');");
        expect(pageSource).toContain('setSearch(searchInput.trim())');
        expect(pageSource).toContain('window.setTimeout');
        expect(pageSource).toContain(', 300);');
    });

    it('allows the service facade to pass AbortSignal without changing query parameters', () => {
        expect(serviceSource).toContain('const get = (path, params = {}, config = {}) => api.get(path, { ...config, params })');
        expect(serviceSource).toContain('overview: (params, config)');
        expect(serviceSource).toContain('orders: (params, config)');
    });
});
