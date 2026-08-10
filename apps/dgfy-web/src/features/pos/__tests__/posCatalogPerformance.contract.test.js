import fs from 'fs';
import path from 'path';
import { describe, expect, it } from 'vitest';

const checkoutPath = path.resolve(process.cwd(), 'src/features/pos/components/POSCheckoutTerminal.jsx');
const layoutPath = path.resolve(process.cwd(), 'src/features/pos/components/TerminalPageLayout.jsx');
const sidebarPath = path.resolve(process.cwd(), 'src/features/pos/components/TerminalWorkspaceSidebar.jsx');
const operationsPath = path.resolve(process.cwd(), 'src/features/pos/components/TerminalOperationsWorkspace.jsx');

const readSource = (filePath) => fs.readFileSync(filePath, 'utf8');

describe('hosted POS catalog performance contracts', () => {
  it('uses optimized thumbnail variants and bounded image-loading priorities', () => {
    const checkoutSource = readSource(checkoutPath);
    const operationsSource = readSource(operationsPath);

    expect(checkoutSource).toContain("resolveAssetVariantUrl(item?.storefront_image_url, 'thumbnail')");
    expect(checkoutSource).toContain("loading={itemIndex < 4 ? 'eager' : 'lazy'}");
    expect(checkoutSource).toContain("fetchpriority={itemIndex < 4 ? 'high' : 'auto'}");
    expect(checkoutSource).toContain('nextCatalogImageUrls');
    expect(checkoutSource).toContain("image.fetchPriority = 'low';");
    expect(operationsSource).toContain("resolveAssetVariantUrl(item?.storefront_image_url, 'thumbnail')");
    expect(operationsSource).toContain('loading="lazy"');
  });

  it('keeps the existing catalog rendered during background refreshes', () => {
    const checkoutSource = readSource(checkoutPath);

    expect(checkoutSource).toContain('const [catalogRefreshing, setCatalogRefreshing] = useState(false);');
    expect(checkoutSource).toContain('const isInitialLoad = !catalogHasLoadedRef.current;');
    expect(checkoutSource).toContain('setCatalogRefreshing(!isInitialLoad);');
    expect(checkoutSource).toContain('if (!sessionLocked) return;');
    expect(checkoutSource).toContain('Refreshing catalog...');
    expect(checkoutSource).toContain('aria-busy={catalogRefreshing}');
  });

  it('initializes receipt settings before callbacks that use them', () => {
    const checkoutSource = readSource(checkoutPath);
    const receiptSettingsStateIndex = checkoutSource.indexOf('const [receiptSettings, setReceiptSettings] = useState({});');
    const addToCartToastIndex = checkoutSource.indexOf('const triggerAddToCartToast = useCallback');

    expect(receiptSettingsStateIndex).toBeGreaterThanOrEqual(0);
    expect(addToCartToastIndex).toBeGreaterThan(receiptSettingsStateIndex);
  });

  it('preloads lazy workspaces on idle and navigation intent', () => {
    const layoutSource = readSource(layoutPath);
    const sidebarSource = readSource(sidebarPath);

    expect(layoutSource).toContain("const loadPOSCheckoutTerminal = () => import('./POSCheckoutTerminal.jsx');");
    expect(layoutSource).toContain("const loadTerminalOperationsWorkspace = () => import('./TerminalOperationsWorkspace.jsx');");
    expect(layoutSource).toContain('window.requestIdleCallback(preloadWorkspaces');
    expect(layoutSource).toContain('onPrefetchViewMode={preloadWorkspaceForViewMode}');
    expect(sidebarSource).toContain('onPointerEnter={onPrefetch}');
    expect(sidebarSource).toContain('onFocus={onPrefetch}');
  });

  it('recovers from a chunk-load failure when mounting the lazy workspaces (issue #182)', () => {
    const layoutSource = readSource(layoutPath);

    expect(layoutSource).toContain("import { lazyWithChunkRetry } from '../../../utils/chunkLoadRecovery.js';");
    expect(layoutSource).toContain('const POSCheckoutTerminal = lazyWithChunkRetry(loadPOSCheckoutTerminal);');
    expect(layoutSource).toContain('const TerminalOperationsWorkspace = lazyWithChunkRetry(loadTerminalOperationsWorkspace);');
    expect(layoutSource).not.toContain('React.lazy(loadPOSCheckoutTerminal)');
    expect(layoutSource).not.toContain('React.lazy(loadTerminalOperationsWorkspace)');
  });
});
