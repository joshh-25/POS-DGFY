import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const testDirectory = path.dirname(fileURLToPath(import.meta.url));
const webCoreRoot = path.resolve(testDirectory, '../../../..');
const read = (relativePath) => fs.readFileSync(path.resolve(webCoreRoot, relativePath), 'utf8');

describe('POS Items modal viewport contract', () => {
  it('keeps the shared modal constraint compatible with Chrome 80', () => {
    const css = read('src/index.css');
    const panelRule = css.slice(css.indexOf('.pos-items-modal-panel {'), css.indexOf('.pos-items-modal-panel--auto'));

    expect(panelRule.indexOf('height: calc(100vh - 1.5rem)')).toBeLessThan(panelRule.indexOf('height: calc(100dvh - 1.5rem)'));
    expect(panelRule.indexOf('max-height: calc(100vh - 1.5rem)')).toBeLessThan(panelRule.indexOf('max-height: calc(100dvh - 1.5rem)'));
    expect(css).toContain('.pos-items-modal-scroll-region');
    expect(css).toContain('overscroll-behavior: contain');
    expect(css).toContain('env(safe-area-inset-bottom, 0px)');
  });

  it.each([
    ['Add/Edit Item', 'src/features/pos/components/TerminalOperationsWorkspace.jsx'],
    ['Create Service', 'src/features/pos/components/PosServiceCatalogCreateModal.jsx'],
    ['Edit Service', 'src/features/pos/components/PosServiceCatalogEditModal.jsx'],
    ['Product scanner', 'src/features/inventory/components/ProductQrScannerModal.jsx']
  ])('applies the bounded panel and internal scrolling to %s', (_surface, relativePath) => {
    const source = read(relativePath);
    expect(source).toContain('pos-items-modal-panel');
    expect(source).toContain('pos-items-modal-scroll-region');
  });

  it('keeps Add and Edit Item actions outside their scrolling bodies', () => {
    const source = read('src/features/pos/components/TerminalOperationsWorkspace.jsx');
    expect(source.match(/className="[^"]*\bpos-items-modal-panel\b[^"]*"/g)).toHaveLength(2);
    expect(source.match(/className="[^"]*\bpos-items-catalog-form-modal\b[^"]*"/g)).toHaveLength(2);
    expect(source.match(/className="[^"]*\bpos-items-modal-scroll-region\b[^"]*"/g)).toHaveLength(2);
    expect(source.match(/className="pos-items-modal-footer(?:\s|")/g)).toHaveLength(2);
  });

  it('keeps Add and Edit footer actions in one shared tablet button row', () => {
    const source = read('src/features/pos/components/TerminalOperationsWorkspace.jsx');
    const css = read('src/index.css');

    expect(source.match(/pos-items-modal-footer-actions/g)).toHaveLength(2);
    expect(source).not.toContain('pos-items-modal-footer-info');
    expect(css).toContain('.pos-items-form-scale.pos-items-catalog-form-modal .pos-items-modal-footer {');
    expect(css).toContain('grid-template-columns: minmax(0, 1fr);');
    expect(css).toContain('.pos-items-catalog-form-modal .pos-items-modal-footer-actions > :where(button, [role="button"])');
    expect(css).toContain('white-space: nowrap;');
  });

  it('keeps the four POS Add/Edit image thumbnails square in one row', () => {
    const css = read('src/index.css');
    const carousel = read('Components/items/SelectedItemImageCarousel.jsx');

    expect(carousel).toContain("editItemPresentation ? 'pos-items-image-carousel-thumbnails grid min-w-0 grid-cols-4 gap-2'");
    expect(carousel).toContain('pos-items-image-carousel-thumbnail min-w-0 w-full');
    expect(css).toContain('.pos-items-catalog-form-modal .pos-items-image-carousel-thumbnails {');
    expect(css).toContain('grid-template-columns: repeat(4, minmax(0, 1fr));');
    expect(css).toContain('.pos-items-catalog-form-modal .pos-items-image-carousel-thumbnail {');
    expect(css).toContain('aspect-ratio: 1;');
  });

  it('raises the Primary image control above carousel dots on PC and landscape tablets', () => {
    const css = read('src/index.css');
    const carousel = read('Components/items/SelectedItemImageCarousel.jsx');

    expect(css).toContain('@media screen and (orientation: landscape) and (min-width: 1024px),');
    expect(css).toContain('screen and (min-width: 1280px)');
    expect(css).toContain('.pos-items-catalog-form-modal .pos-items-image-carousel-primary-toggle {');
    expect(css).toContain('bottom: 2rem;');
    expect(carousel).toContain('pos-items-image-carousel-primary-toggle absolute bottom-2 left-2');
  });

  it('compacts both Add and Edit Item modals in portrait tablet view only', () => {
    const css = read('src/index.css');
    const tabletRuleStart = css.indexOf('/* Add/Edit Item share one compact portrait-tablet modal contract.');
    const desktopRuleStart = css.indexOf('@media (min-width: 1280px)', tabletRuleStart);
    const tabletRule = css.slice(tabletRuleStart, desktopRuleStart);

    expect(tabletRule).toContain('@media (orientation: portrait) and (min-width: 768px) and (max-width: 1023.98px)');
    expect(tabletRule).toContain('.pos-items-modal-overlay');
    expect(tabletRule).toContain('padding: 2.5rem;');
    expect(tabletRule).toContain('.pos-items-catalog-form-modal');
    expect(tabletRule).toContain('max-width: min(46rem, calc(100vw - 8rem));');
    expect(tabletRule).toContain('--pos-items-modal-side-margin: max(4rem, calc(50vw - 23rem));');
    expect(tabletRule).toContain('height: calc(100dvh - var(--pos-items-modal-side-margin) - var(--pos-items-modal-side-margin));');
    expect(tabletRule).toContain('max-height: calc(100dvh - var(--pos-items-modal-side-margin) - var(--pos-items-modal-side-margin));');
    expect(tabletRule).toContain('padding-inline: 1rem;');
    expect(tabletRule).toContain('height: 2rem !important;');
    expect(tabletRule).toContain('height: 3.25rem;');
    expect(tabletRule).toContain('min-height: 5.5rem;');
  });

  it('matches the dialog height inset to its side margins on larger portrait tablets', () => {
    const css = read('src/index.css');
    const ruleStart = css.indexOf('/* The compact portrait-tablet rule above ends at 1023px.');
    const ruleEnd = css.indexOf('/* Landscape tablets have enough width for the desktop form composition', ruleStart);
    const largerTabletRule = css.slice(ruleStart, ruleEnd);

    expect(largerTabletRule).toContain('@media (orientation: portrait) and (min-width: 1024px) and (max-width: 1199.98px)');
    expect(largerTabletRule).toContain('--pos-items-modal-side-margin: max(1rem, calc(50vw - 27rem));');
    expect(largerTabletRule).toContain('height: calc(100dvh - var(--pos-items-modal-side-margin) - var(--pos-items-modal-side-margin));');
    expect(largerTabletRule).toContain('max-height: calc(100dvh - var(--pos-items-modal-side-margin) - var(--pos-items-modal-side-margin));');
  });

  it('keeps tablet-portrait item image actions compact and carousel arrows square', () => {
    const css = read('src/index.css');
    const carousel = read('Components/items/SelectedItemImageCarousel.jsx');
    const tabletRuleStart = css.indexOf('/* Add/Edit Item share one compact portrait-tablet modal contract.');
    const desktopRuleStart = css.indexOf('@media (min-width: 1280px)', tabletRuleStart);
    const tabletRule = css.slice(tabletRuleStart, desktopRuleStart);

    expect(tabletRule).toContain('.pos-items-form-columns .pos-items-image-upload-dropzone {');
    expect(tabletRule).not.toContain('label[for="pos-item-image"]');
    expect(tabletRule).not.toContain('label[for="pos-item-edit-image"]');
    expect(tabletRule).toContain('.pos-items-image-carousel-navigation {');
    expect(tabletRule).toContain('width: 2rem;');
    expect(tabletRule).toContain('height: 2rem;');
    expect(tabletRule).toContain('min-height: 2rem;');
    expect(tabletRule).toContain('.pos-items-image-carousel-stage {');
    expect(tabletRule).toContain('aspect-ratio: 4 / 3;');
    expect(tabletRule).toContain('.pos-items-image-carousel-thumbnails {');
    expect(tabletRule).toContain('grid-template-columns: repeat(4, minmax(4.25rem, 1fr));');
    expect(tabletRule).toContain('.pos-items-image-carousel-thumbnail {');
    expect(tabletRule).toContain('width: 100%;');
    expect(tabletRule).toContain('aspect-ratio: 1;');
    expect(tabletRule).toContain('.pos-items-image-carousel-dot {');
    expect(tabletRule).toContain('min-height: 0.375rem !important;');
    expect(tabletRule).toContain('button[aria-label^="More information about Product Image"]');
    expect(tabletRule).toContain('min-height: 1.25rem !important;');
    expect(carousel).toContain('pos-items-image-carousel-main-image');
    expect(carousel).toContain('pos-items-image-carousel-dot');
    expect(carousel).toContain('pos-items-image-carousel-thumbnail');
    expect(carousel).toContain("editItemPresentation ? 'pos-items-image-carousel-navigation' : ''");
  });

  it('optimizes Add and Edit Item modals for landscape tablets without changing PC sizing', () => {
    const css = read('src/index.css');
    const landscapeRuleStart = css.indexOf('/* Landscape tablets have limited vertical space inside the device frame.');
    const desktopRuleStart = css.indexOf('/* Add/Edit Item opens through a body portal', landscapeRuleStart);
    const landscapeRule = css.slice(landscapeRuleStart, desktopRuleStart);

    expect(landscapeRule).toContain('@media screen and (orientation: landscape) and (min-width: 1024px) and (max-width: 1279.98px)');
    expect(landscapeRule).toContain('max-height: calc(100dvh - 2rem);');
    expect(landscapeRule).toContain('grid-template-columns:');
    expect(landscapeRule).toContain('min-height: 6rem;');
    expect(landscapeRule).toContain('height: 2.25rem !important;');
  });

  it('locks background scrolling and closes custom item modals from Escape', () => {
    const source = read('src/features/pos/components/TerminalOperationsWorkspace.jsx');
    expect(source).toContain('const releaseScrollLock = acquireModalScrollLock();');
    expect(source).toContain("event.key !== 'Escape'");
    expect(source).toContain("document.addEventListener('keydown', handleKeyDown, true)");
    expect(source).toContain("document.removeEventListener('keydown', handleKeyDown, true)");
  });
});
