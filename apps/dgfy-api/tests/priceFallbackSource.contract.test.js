import fs from 'fs';
import path from 'path';

const repoRoot = path.resolve(process.cwd(), '../..');
const read = (relativePath) => fs.readFileSync(path.join(repoRoot, relativePath), 'utf8');

describe('sale price fallback source contract', () => {
    it('keeps POS, Storefront checkout, and Dispatch Orders off cost-as-price fallback', () => {
        const sources = [
            'apps/dgfy-api/src/modules/pos/usecases/posUseCases.js',
            'apps/dgfy-api/src/modules/store/usecases/storeUseCases.js',
            'apps/dgfy-api/src/services/dispatchOrderService.js',
            'packages/web-core/src/features/pos/hooks/usePosCartWorkflow.js'
        ].map((file) => ({
            file,
            text: read(file)
        }));

        sources.forEach(({ file, text }) => {
            expect(text).not.toMatch(/default_sale_price\s*(?:\?\?|\|\|)[\s\S]{0,80}cost_per_unit/i);
            expect(text).not.toMatch(/cost_per_unit[\s\S]{0,80}(?:fallback|default to cost|first use)/i);
        });

        expect(read('apps/dgfy-api/src/modules/pos/usecases/posUseCases.js')).toContain('requireExplicitSalePrice(item, \'POS checkout\')');
        expect(read('apps/dgfy-api/src/modules/store/usecases/storeUseCases.js')).toContain('requireExplicitSalePrice(item, \'Storefront checkout\')');
        expect(read('apps/dgfy-api/src/services/dispatchOrderService.js')).toContain('resolveDispatchSalePrice(line, item)');
        expect(read('packages/web-core/src/features/pos/hooks/usePosCartWorkflow.js')).toContain('Number(item.default_sale_price ?? 0)');
    });
});
