import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { describe, expect, it } from 'vitest';

const webCoreRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../../..');
const checkoutPath = path.resolve(webCoreRoot, 'src/features/pos/components/POSCheckoutTerminal.jsx');
const checkoutViewPath = path.resolve(webCoreRoot, 'src/features/pos/components/POSCheckoutTerminalView.jsx');
const catalogWorkflowPath = path.resolve(webCoreRoot, 'src/features/pos/hooks/usePosCatalogWorkflow.js');
const catalogImageFailureStorePath = path.resolve(webCoreRoot, 'src/features/pos/services/posCatalogImageFailureStore.js');
const checkoutUtilsPath = path.resolve(webCoreRoot, 'src/features/pos/utils/posCheckoutTerminalUtils.js');
const layoutPath = path.resolve(webCoreRoot, 'src/features/pos/components/TerminalPageLayout.jsx');
const sidebarPath = path.resolve(webCoreRoot, 'src/features/pos/components/TerminalWorkspaceSidebar.jsx');
const operationsPath = path.resolve(webCoreRoot, 'src/features/pos/components/TerminalOperationsWorkspace.jsx');

const readSource = (filePath) => fs.readFileSync(filePath, 'utf8');
const readCheckoutRenderSource = () => [checkoutPath, checkoutViewPath].map(readSource).join('\n');

describe('hosted POS catalog performance contracts', () => {
  it('uses optimized thumbnail variants and bounded image-loading priorities', () => {
    const checkoutSource = readCheckoutRenderSource();
    const catalogWorkflowSource = readSource(catalogWorkflowPath);
    const checkoutUtilsSource = readSource(checkoutUtilsPath);
    const operationsSource = readSource(operationsPath);
    const catalogImageFailureStoreSource = readSource(catalogImageFailureStorePath);

    expect(checkoutUtilsSource).toContain("resolveAssetVariantUrl(item?.storefront_image_url, 'thumbnail')");
    expect(checkoutSource).toContain("loading={itemIndex < 4 ? 'eager' : 'lazy'}");
    expect(checkoutSource).toContain("fetchpriority={itemIndex < 4 ? 'high' : 'auto'}");
    expect(catalogWorkflowSource).toContain('nextCatalogImageUrls');
    expect(catalogWorkflowSource).toContain("image.fetchPriority = 'low';");
    expect(catalogWorkflowSource).toContain('loadPosCatalogImageFailures');
    expect(catalogWorkflowSource).toContain('savePosCatalogImageFailures');
    expect(catalogWorkflowSource).toContain('catalogImageErrors\n        ),');
    expect(catalogWorkflowSource).not.toContain('setCatalogImageErrors(new Set());');
    expect(catalogImageFailureStoreSource).toContain('window.sessionStorage');
    expect(operationsSource).toContain("resolveAssetVariantUrl(item?.storefront_image_url, 'thumbnail')");
    expect(operationsSource).toContain('loading="lazy"');
  });

  it('keeps the existing catalog rendered during background refreshes', () => {
    const checkoutSource = readCheckoutRenderSource();
    const catalogWorkflowSource = readSource(catalogWorkflowPath);

    expect(catalogWorkflowSource).toContain('const [catalogRefreshing, setCatalogRefreshing] = useState(false);');
    expect(catalogWorkflowSource).toContain('const isInitialLoad = !catalogHasLoadedRef.current;');
    expect(catalogWorkflowSource).toContain('setCatalogRefreshing(!isInitialLoad);');
    expect(catalogWorkflowSource).toContain('if (!sessionLocked) return;');
    expect(checkoutSource).toContain('className="sr-only">');
    expect(checkoutSource).toContain('Refreshing catalog...');
    expect(checkoutSource).not.toContain('pointer-events-none opacity-70');
    expect(checkoutSource).toContain('aria-busy={catalogRefreshing}');
    expect(catalogWorkflowSource).toContain('catalogRequestInFlightKeyRef');
    expect(catalogWorkflowSource).toContain('catalogRequestSequenceRef');
    expect(catalogWorkflowSource).toContain('if (catalogRequestInFlightKeyRef.current === requestKey) return;');
    expect(catalogWorkflowSource).toContain('if (catalogRequestSequenceRef.current !== requestSequence) return;');
  });

  it('initializes receipt settings before callbacks that use them', () => {
    const checkoutSource = readCheckoutRenderSource();
    const cartWorkflowSource = readSource(path.resolve(webCoreRoot, 'src/features/pos/hooks/usePosCartWorkflow.js'));
    const receiptSettingsStateIndex = checkoutSource.indexOf('const [receiptSettings, setReceiptSettings] = useState({});');
    const cartWorkflowInvocationIndex = checkoutSource.indexOf('} = usePosCartWorkflow({');
    const addToCartToastIndex = cartWorkflowSource.indexOf('const triggerAddToCartToast = useCallback');

    expect(receiptSettingsStateIndex).toBeGreaterThanOrEqual(0);
    expect(cartWorkflowInvocationIndex).toBeGreaterThan(receiptSettingsStateIndex);
    expect(addToCartToastIndex).toBeGreaterThanOrEqual(0);
  });

  it('keeps image-less POS cards blank and centers item names over item images', () => {
    const checkoutSource = readCheckoutRenderSource();
    const checkoutUtilsSource = readSource(checkoutUtilsPath);

    expect(checkoutUtilsSource).toContain("src: fallbackVariants.thumbnailUrl || configuredSrc || '',");
    expect(checkoutSource).not.toContain('src: fallbackVariants.thumbnailUrl || configuredSrc || mappedSrc || fallbackSrc');
    expect(checkoutSource).toContain("hasImage ? 'bg-transparent' : 'bg-[#1A4E8D]/85'");
    expect(checkoutSource).not.toContain('flex items-center justify-center bg-[#1A4E8D]/85');
    expect(checkoutSource).toContain('text-center text-[14px] font-black leading-tight text-white');
    expect(checkoutSource).not.toContain('No POS Image');
    expect(checkoutSource).toContain('backgroundImage: `url(${imageSources.placeholderSrc})`');
    expect(checkoutSource).toContain('next.add(String(item.item_id));');
  });

  it('keeps direct POS category chips without a redundant filter button', () => {
    const checkoutSource = readCheckoutRenderSource();

    expect(checkoutSource).toContain('data-testid="pos-catalog-controls"');
    expect(checkoutSource).toContain('<span>All Items</span>');
    expect(checkoutSource).toContain('<POSBarcodeScanner');
    expect(checkoutSource).toContain("isTabletViewport ? 'flex-row items-center'");
    expect(checkoutSource).toContain('className="flex h-11 min-w-0 flex-1 items-center');
    expect(checkoutSource).toContain('<div className="flex shrink-0">');
    expect(checkoutSource).toContain('className="w-auto"');
    expect(checkoutSource).not.toContain('title="Show or hide catalog filters"');
    expect(checkoutSource).not.toContain('<Filter size={18} />');
  });

  it('clears the complete desktop catalog search from the delete button', () => {
    const checkoutSource = readCheckoutRenderSource();

    expect(checkoutSource).toContain('aria-label="Clear search"');
    expect(checkoutSource).toContain("onClick={() => setSearch('')}");
    expect(checkoutSource).not.toContain('aria-label="Backspace search"');
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
