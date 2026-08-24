import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { describe, expect, it } from 'vitest';

const webCoreRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../../..');
const componentSource = fs.readFileSync(
    path.resolve(webCoreRoot, 'src/features/pos/components/PosAddToCartToastContainer.jsx'),
    'utf8'
);
const stylesSource = fs.readFileSync(
    path.resolve(webCoreRoot, 'src/index.css'),
    'utf8'
);

describe('POS add-to-cart toast animation contract', () => {
    it('uses the explicit POS slide-in animation instead of optional Tailwind animation utilities', () => {
        expect(componentSource).toContain('pos-add-to-cart-toast');
        expect(componentSource).not.toContain('animate-in');
        expect(componentSource).not.toContain('slide-in-from-right-5');
        expect(stylesSource).toContain('.pos-add-to-cart-toast {');
        expect(stylesSource).toContain('animation: pos-add-to-cart-toast-enter 260ms');
        expect(stylesSource).toContain('@keyframes pos-add-to-cart-toast-enter');
        expect(stylesSource).toContain('transform: translate3d(28px, 0, 0);');
    });

    it('disables the motion for reduced-motion users', () => {
        expect(stylesSource).toContain('@media (prefers-reduced-motion: reduce)');
        expect(stylesSource).toContain('.pos-add-to-cart-toast {\n    animation-duration: 1ms;');
    });
});
