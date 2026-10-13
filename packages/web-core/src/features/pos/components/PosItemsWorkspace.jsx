import StorefrontSectionInfo from '../settings/StorefrontSectionInfo.jsx';
import PosFnbSelect from './PosFnbSelect.jsx';
import PosSearchField from './PosSearchField.jsx';
import PosItemResponsiveCard from './PosItemResponsiveCard.jsx';
import PosItemsListView from './PosItemsListView.jsx';
import PosItemsViewToggle from './PosItemsViewToggle.jsx';
import React, { Suspense, useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { lazyWithChunkRetry } from '../../../utils/chunkLoadRecovery.js';
import { createPortal } from 'react-dom';
import { AlertTriangle, BarChart3, CalendarPlus, Check, ChevronDown, CircleDollarSign, ClipboardList, Filter, ImagePlus, Pencil, Package, PackagePlus, Plus, Receipt, RefreshCcw, RotateCcw, Save, ScanLine, Search, ShoppingBag, Star, UserRound, Tags, Trash2, Upload, UtensilsCrossed, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { GlobalPagination, POS_PAGINATION_FOOTER_CLASS } from '@/components/ui/pagination';
import StorefrontItemQrCard from '@/components/items/StorefrontItemQrCard.jsx';
import { resolveStorefrontItemUrl } from '@/src/features/dgfyRouteHelpers.js';
import { acquireModalScrollLock, Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { useCreateItem, useDeleteItem, useUpdateItem } from '@/hooks/useItems.js';
import { attachItemBarcode, generateItemBarcode, getFolders, getItems, listItemFolders, lookupExternalProduct, replaceItemFolders, updateItemBarcode } from '@/services/itemService.js';
import { updatePosCatalogOverride } from '@/services/posCatalogService.js';
import { getGtinValidationMessage, normalizeBarcodeEntry, resolveProductBarcodeInput } from '@/src/utils/barcodePolicy.js';
import { notifyPosCatalogUpdated, subscribeToPosCatalogUpdates, subscribeToRemotePosCatalogUpdates } from '../utils/posCatalogRefresh.js';
import { persistPosItemBarcode } from '../utils/posItemBarcodePersistence.js';
import { useItemImageGenerationPoll } from '../hooks/useItemImageGenerationPoll.js';
import { updateStorefrontCatalogOverride, importExternalStorefrontCatalogImage, queueStorefrontCatalogImage, queueStorefrontCatalogImages, getStorefrontCatalogImageUploadStatus, updateStorefrontCatalogGallery, deleteStorefrontCatalogImage, generateStorefrontCatalogImage } from '@/services/storefrontCatalogService.js';
import SelectedItemImageCarousel from '@/components/items/SelectedItemImageCarousel';
import { suggestNextSku } from '@/src/features/inventory/utils/skuSuggestion.js';
import { resolveEditItemSaveError } from '../utils/editItemSaveErrors.js';
import { listFnbModifierGroups, replaceFnbItemModifierGroups } from '@/src/features/fnb/api/fnbApi.js';
import { resolveModeItemTaxonomy } from '@/src/features/settings/modeItemTaxonomy.js';
import { normalizeWorkflowMode } from '@/src/features/settings/workflowMode.js';
import { POS_HISTORY_PAGE_SIZE_OPTIONS } from '../utils/posHistoryQuery.js';
import resolveAssetUrl from '@/src/utils/assetUrl.js';
import { ResponsiveImage } from '@/src/components/media/ResponsiveImage.jsx';
import { resolvePosCatalogImageSources, resolvePosCatalogPreviewGallery } from '../utils/posCheckoutTerminalUtils.js';
import { isPdfMenuImportEnabled } from '@/hooks/usePdfMenuImport.js';
import { isMenuImportBatchEnabled } from '@/services/menuImportService.js';
import { fetchPosCatalogPage } from '../services/posService.js';
import { isServiceCatalogItem } from '../utils/posCatalogAvailability.js';
import { posToast as toast } from '@/src/utils/iminRuntimeFeedback.js';

const CSVImportModal = lazyWithChunkRetry(() => import('@/components/items/CSVImportModal.jsx'));

const ProductQrScannerModal = lazyWithChunkRetry(() => import('@/src/features/inventory/components/ProductQrScannerModal.jsx'));

const PdfMenuImportModal = lazyWithChunkRetry(() => import('@/components/items/PdfMenuImportModal.jsx'));

const MenuImportBatchModal = lazyWithChunkRetry(() => import('@/components/items/MenuImportBatchModal.jsx'));

const PosItemImageViewer = lazyWithChunkRetry(() => import('./PosItemImageViewer.jsx'));

const PosServiceCatalogCreateModal = lazyWithChunkRetry(() => import('./PosServiceCatalogCreateModal.jsx'));

const PosServiceCatalogEditModal = lazyWithChunkRetry(() => import('./PosServiceCatalogEditModal.jsx'));

const POS_ITEMS_PAGE_SIZE = 20;

const POS_ITEMS_PAGE_SIZE_OPTIONS = POS_HISTORY_PAGE_SIZE_OPTIONS;

// Keep the Items filter aligned with the desktop History/Calendar extended
// surface. A single width prevents the same filter language from looking
// oversized when the operator moves between POS tabs.
const POS_DESKTOP_FILTER_WIDTH = 464;

const POS_DESKTOP_STOCK_FILTER_OPTIONS = [
  { value: 'in_stock', label: 'High Stock' },
  { value: 'almost_out', label: 'Medium Stock' },
  { value: 'low_stock', label: 'Low Stock' },
  { value: 'out_of_stock', label: 'No Stock' }
];

const getPosItemStatusSwitchClass = (checked) => (
  `pos-items-status-switch self-center shrink-0 ${checked
    ? 'bg-[#1A4E8D] hover:bg-[#143F73] focus-visible:ring-[#2563EB]'
    : 'bg-slate-200 hover:bg-slate-300 focus-visible:ring-[#2563EB]'}`
);

const money = (value) => Number(value || 0).toFixed(2);

const STOREFRONT_ITEM_IMAGE_MAX_COUNT = 5;

// RF-2 (PR #1656 review, #1410): the create-item modal disables its own close button while
// postCreateSaving is true, so a stuck background upload job locks the operator out of the
// modal for the full poll duration -- unlike handleGenerateEditImage's edit-modal path, which
// stays dismissible throughout its own poll. Reusing useItemImageGenerationPoll's full
// ITEM_IMAGE_POLL_TIMEOUT_MS (90s) here would mean a genuinely stuck job locks the modal that
// long; bound it to a much shorter ceiling instead -- the common/fast case still resolves in a
// couple of seconds well under this, and a timeout here degrades to today's pre-fix behavior
// (soft warning, pos.catalog.changed SSE backstop), not a hard failure.
const CREATE_ITEM_IMAGE_UPLOAD_POLL_TIMEOUT_MS = 15 * 1000;

const resolveStoredItemImageUrl = (urlOrPath) => {
  const raw = String(urlOrPath || '').trim();
  if (!raw) return '';
  if (/^(data|blob):/i.test(raw)) return raw;
  if (/^https?:\/\//i.test(raw) || raw.startsWith('/uploads/') || raw.startsWith('/')) {
    return resolveAssetUrl(raw);
  }
  return resolveAssetUrl(`/uploads/${raw.replace(/^\/+/, '')}`);
};

const parseStorefrontItemImageGallery = (value) => {
  if (Array.isArray(value)) return value;
  if (typeof value !== 'string') return [];
  try {
    const parsed = JSON.parse(value);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
};

const normalizeStorefrontItemGallery = (item = {}) => {
  const entries = parseStorefrontItemImageGallery(item?.storefront_image_gallery);
  const primaryUrl = resolveStoredItemImageUrl(item?.storefront_image_url || item?.storefront_image_path || null) || null;
  const gallery = entries
    .map((entry, index) => ({
      path: entry?.path || null,
      url: resolveStoredItemImageUrl(entry?.url || entry?.image_url || entry?.path || entry),
      variants: entry?.variants || entry?.image_variants || null,
      is_primary: index === 0,
      sort_order: index
    }))
    .filter((entry) => entry.url || entry.path);
  if (primaryUrl && !gallery.some((entry) => entry.url === primaryUrl)) {
    gallery.unshift({
      path: item?.storefront_image_path || null,
      url: primaryUrl,
      variants: item?.storefront_image_variants || null,
      is_primary: true,
      sort_order: 0
    });
  }
  return gallery.map((entry, index) => ({
    ...entry,
    is_primary: index === 0,
    sort_order: index
  }));
};

const normalizeFolderNameKey = (value = '') => (
  String(value || '').trim().replace(/\s+/g, ' ').toLowerCase()
);

const createFolderFilterValue = (folder = {}) => {
  const folderId = Number(folder?.folder_id);
  if (Number.isInteger(folderId) && folderId > 0) return `folder:${folderId}`;
  return `name:${normalizeFolderNameKey(folder?.name)}`;
};

const createFoodCategoryOption = (folder = {}) => {
  const name = String(folder?.name || '').trim();
  return {
    value: createFolderFilterValue(folder),
    label: name,
    name,
    folder_id: Number.isInteger(Number(folder?.folder_id)) && Number(folder.folder_id) > 0
      ? Number(folder.folder_id)
      : null
  };
};

const createModifierOptionKey = (group = {}, option = {}, optionIndex = 0) => (
  `${Number(group?.modifier_group_id) || String(group?.name || 'group').trim().toLowerCase()}:${Number(option?.modifier_option_id) || optionIndex}`
);

function EditableFoodCategoryCombobox({
  id,
  value,
  options = [],
  onChange,
  onSelect,
  disabled = false,
  compact = false
}) {
  const [open, setOpen] = useState(false);
  const [isFiltering, setIsFiltering] = useState(false);
  const containerRef = useRef(null);
  const listboxRef = useRef(null);
  const [listboxPosition, setListboxPosition] = useState(null);
  const normalizedValue = normalizeFolderNameKey(value);
  const normalizedQuery = isFiltering ? normalizedValue : '';
  const filteredOptions = options.filter((option) => (
    !normalizedQuery || normalizeFolderNameKey(option.name).includes(normalizedQuery)
  ));

  useEffect(() => {
    const handlePointerDown = (event) => {
      if (!containerRef.current?.contains(event.target) && !listboxRef.current?.contains(event.target)) setOpen(false);
    };
    document.addEventListener('pointerdown', handlePointerDown);
    return () => document.removeEventListener('pointerdown', handlePointerDown);
  }, []);

  useEffect(() => {
    if (!open || typeof window === 'undefined') {
      setListboxPosition(null);
      return undefined;
    }

    const updateListboxPosition = () => {
      const input = containerRef.current?.querySelector('[role="combobox"]');
      if (!input) return;

      const rect = input.getBoundingClientRect();
      const menuMaxHeight = 184;
      const viewportPadding = 8;
      const scrollRegion = containerRef.current.closest('.pos-items-modal-scroll-region');
      const scrollRegionRect = scrollRegion?.getBoundingClientRect();
      const boundaryTop = scrollRegionRect
        ? Math.max(viewportPadding, scrollRegionRect.top + viewportPadding)
        : viewportPadding;
      const boundaryBottom = scrollRegionRect
        ? Math.min(window.innerHeight - viewportPadding, scrollRegionRect.bottom - viewportPadding)
        : window.innerHeight - viewportPadding;
      const spaceBelow = boundaryBottom - rect.bottom - 4;
      const spaceAbove = rect.top - boundaryTop - 4;
      const openUpward = spaceBelow < menuMaxHeight && spaceAbove > spaceBelow;
      const availableHeight = Math.max(96, Math.min(menuMaxHeight, openUpward ? spaceAbove : spaceBelow));

      setListboxPosition({
        top: openUpward ? Math.max(boundaryTop, rect.top - availableHeight - 4) : rect.bottom + 4,
        left: rect.left,
        width: rect.width,
        maxHeight: availableHeight
      });
    };

    updateListboxPosition();
    window.addEventListener('resize', updateListboxPosition);
    document.addEventListener('scroll', updateListboxPosition, true);
    return () => {
      window.removeEventListener('resize', updateListboxPosition);
      document.removeEventListener('scroll', updateListboxPosition, true);
    };
  }, [open]);

  const selectOption = (option) => {
    onChange(option.name);
    onSelect(option);
    setIsFiltering(false);
    setOpen(false);
  };

  return (
    <div ref={containerRef} className="relative">
      <Input
        id={id}
        autoComplete="off"
        role="combobox"
        aria-autocomplete="list"
        aria-controls={`${id}-listbox`}
        aria-expanded={open}
        value={value}
        onFocus={() => {
          setIsFiltering(false);
          setOpen(true);
        }}
        onChange={(event) => {
          onChange(event.target.value);
          setIsFiltering(true);
          setOpen(true);
        }}
        onKeyDown={(event) => {
          if (event.key === 'Escape') setOpen(false);
          if (event.key === 'ArrowDown') setOpen(true);
        }}
        className={`${compact ? 'pos-items-modal-field rounded-lg pr-8 text-[10px]' : 'h-11 rounded-xl pr-10 text-xs sm:text-sm'} border-slate-200 font-medium focus:border-[#1A4E8D] focus:ring-blue-100`}
        disabled={disabled}
        placeholder="Select or create a category"
      />
      <button
        type="button"
        className={`${compact ? 'w-8' : 'w-10'} absolute inset-y-0 right-0 grid place-items-center text-slate-500 hover:text-[#1A4E8D] disabled:cursor-not-allowed disabled:opacity-50`}
        onClick={() => {
          setIsFiltering(false);
          setOpen((current) => !current);
        }}
        disabled={disabled}
        aria-label="Show food categories"
        aria-expanded={open}
      >
        <ChevronDown className={`${compact ? 'h-3.5 w-3.5' : 'h-4 w-4'} transition-transform ${open ? 'rotate-180' : ''}`} />
      </button>
      {open && listboxPosition && typeof document !== 'undefined' ? createPortal((
        <div
          ref={listboxRef}
          id={`${id}-listbox`}
          role="listbox"
          aria-label="Food categories"
           className="pos-items-catalog-category-menu fixed z-[10050] rounded-lg border border-slate-200 bg-white p-1 shadow-xl shadow-slate-900/15"
          style={{
            top: listboxPosition.top,
            left: listboxPosition.left,
            width: listboxPosition.width,
            maxHeight: listboxPosition.maxHeight,
            overflowX: 'hidden',
            overflowY: 'auto'
          }}
        >
          {filteredOptions.length > 0 ? filteredOptions.map((option) => (
            <button
              key={option.value}
              type="button"
              role="option"
              aria-selected={normalizeFolderNameKey(option.name) === normalizedValue}
              className={`pos-items-dropdown-option flex min-h-8 w-full items-center rounded-md px-2.5 py-1.5 text-left text-[12px] transition-colors focus:outline-none ${normalizeFolderNameKey(option.name) === normalizedValue ? 'bg-blue-50 font-bold text-[#1A4E8D]' : 'text-[#0F172A] hover:bg-blue-50 focus:bg-blue-50'}`}
              onClick={() => selectOption(option)}
            >
              <span className="min-w-0 truncate">{option.label}</span>
            </button>
          )) : (
            <p className="px-3 py-2 text-xs text-slate-500">No existing category matches. Save to create “{value.trim()}”.</p>
          )}
        </div>
      ), document.body) : null}
    </div>
  );
}

const createEmptyPosItemForm = () => ({
  name: '',
  default_sale_price: '',
  cost_per_unit: '',
  current_stock: '0',
  pos_always_available: false,
  pos_best_seller_mode: 'auto',
  senior_pwd_discount_eligible: false,
  description: '',
  sku_code: '',
  pos_category: ''
});

const normalizeMoneyInput = (value) => {
  const sanitized = String(value ?? '').replace(/,/g, '').replace(/[^\d.]/g, '');
  const [whole = '', ...fractionParts] = sanitized.split('.');
  if (fractionParts.length === 0) return whole;
  return `${whole}.${fractionParts.join('').slice(0, 2)}`;
};

const formatMoneyInput = (value) => {
  const normalized = String(value ?? '').trim();
  if (!normalized) return '';
  const numericValue = Number(normalized);
  if (!Number.isFinite(numericValue)) return normalized;
  return numericValue.toLocaleString('en-PH', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2
  });
};

const resolveSellablePosItemPreset = (workflowMode = '') => {
  const taxonomy = resolveModeItemTaxonomy(workflowMode);
  const productPresets = Array.isArray(taxonomy?.presets)
    ? taxonomy.presets.filter((preset) => preset?.category === 'product')
    : [];
  const preferredKeys = ['menu_item', 'finished_product', 'product', 'physical_add_on', 'packaged_beverage', 'minibar_retail_product'];
  const preset = preferredKeys
    .map((key) => productPresets.find((entry) => entry.key === key))
    .find(Boolean) || productPresets[0] || null;

  return preset || {
    key: 'product',
    label: 'Product',
    category: 'product',
    product_type: 'finished_goods',
    default_unit: 'pcs',
    fifo_enabled: true
  };
};

const resolveItemWorkspacePresentation = (workflowMode = '') => {
  const normalizedMode = normalizeWorkflowMode(workflowMode);

  if (normalizedMode === 'fnb') {
    return {
      categoryLabel: 'Food Category',
      savingAriaLabel: 'Saving menu item',
      savingStatusLabel: 'F&B KITCHEN & MENU SYNC',
      savingTitle: 'Saving Menu Item…',
      savingDescription: 'Updating food & beverage details and syncing menu changes across POS terminals & Kitchen Displays.',
      savingIcon: UtensilsCrossed,
      accent: 'amber'
    };
  }

  if (normalizedMode === 'retail') {
    return {
      categoryLabel: 'Product Category',
      savingAriaLabel: 'Saving retail product',
      savingStatusLabel: 'RETAIL CATALOG SYNC',
      savingTitle: 'Saving Product…',
      savingDescription: 'Updating product details and syncing catalog changes across POS terminals and Storefront.',
      savingIcon: ShoppingBag,
      accent: 'blue'
    };
  }

  return {
    categoryLabel: 'Item Category',
    savingAriaLabel: 'Saving item',
    savingStatusLabel: 'POS CATALOG SYNC',
    savingTitle: 'Saving Item…',
    savingDescription: 'Updating item details across POS terminals and Storefront.',
    savingIcon: Package,
    accent: 'blue'
  };
};

function ItemsWorkspace({
  canViewPos,
  canCreateItems = false,
  canImportItems = false,
  canManageServiceCatalog = false,
  canManageFnbModifiers = false,
  canEditItems = false,
  canDeleteItems = false,
  canManageCategories = false,
  stockFilterPreset = '',
  onStockFilterPresetApplied = () => {},
  workflowMode = '',
  locked,
  isOnline = true,
  onQueueOfflineItemDraft = async () => '',
  operatingLocationId = null,
  availableLocations = [],
  locationsLoading = false,
  storefrontSlug = '',
  sectionId,
  refreshTerminalUser = async () => {},
  createModalOpen = null,
  onCreateModalOpenChange = () => {},
  onItemCreated = () => {},
  modalOnly = false
}) {
  const filterRadioGroupId = React.useId();
  const [items, setItems] = useState([]);
  const [itemsTotal, setItemsTotal] = useState(0);
  const itemsReadSequence = useRef(0);
  const itemsLoaded = useRef(false);
  const scopedItemsCache = useRef(new Map());
  const [primaryBarcodes, setPrimaryBarcodes] = useState({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const { createItem, loading: creatingItem } = useCreateItem();
  const [showPdfMenuImport, setShowPdfMenuImport] = useState(false);
  const pdfMenuImportEnabled = isPdfMenuImportEnabled();
  // Batch (multi-file) import supersedes the single-file wizard wherever it is
  // enabled; both flags default OFF and are independently killable.
  const menuImportBatchEnabled = isMenuImportBatchEnabled();
  const menuImportEntryEnabled = pdfMenuImportEnabled || menuImportBatchEnabled;
  // Use the shared menu-import label for both supported local import paths. The
  // feature flags still decide whether the entry point is rendered and which
  // importer modal is opened.
  const menuImportButtonLabel = 'Import Menu';
  const [showCsvImport, setShowCsvImport] = useState(false);
  const { updateItem, loading: savingItem } = useUpdateItem();
  const { deleteItem, loading: deletingItem } = useDeleteItem();
  const [editingItemId, setEditingItemId] = useState(null);
  const editItemDetailsRef = useRef(null);
  const editDescriptionRef = useRef(null);
  const [editItemDetailsHeight, setEditItemDetailsHeight] = useState(null);
  const [persistingEditAssets, setPersistingEditAssets] = useState(false);
  const [selectedEditImageFiles, setSelectedEditImageFiles] = useState([]);
  const [deferredEditImageFiles, setDeferredEditImageFiles] = useState([]);
  const [selectedEditPrimaryFile, setSelectedEditPrimaryFile] = useState(null);
  const [editImageUploadJob, setEditImageUploadJob] = useState(null);
  const [pendingEditImageRefresh, setPendingEditImageRefresh] = useState(null);
  // generatingEditImage covers the POST that queues the job; pollingEditImage
  // covers the wait for a terminal status afterwards — split so the button
  // label can tell the operator which stage it's actually in.
  const [generatingEditImage, setGeneratingEditImage] = useState(false);
  const [pollingEditImage, setPollingEditImage] = useState(false);
  const { pollItemImageGeneration, cancel: cancelImageGenerationPoll } = useItemImageGenerationPoll();
  // Same generic poll-until-terminal-status hook as above, just pointed at the
  // catalog-image-upload-status endpoint instead of the AI-generation one --
  // used by runPostCreateStages below to wait out the async image upload
  // worker (catalogImageUploadWorker.js) before the post-create item refetch.
  // A shorter timeout than the hook's 90s default (see
  // CREATE_ITEM_IMAGE_UPLOAD_POLL_TIMEOUT_MS above) -- this poll runs while
  // the create-item modal is locked, unlike the AI-generation path this hook
  // was originally built for.
  const { pollItemImageGeneration: pollCatalogImageUploadStatus } = useItemImageGenerationPoll(getStorefrontCatalogImageUploadStatus, CREATE_ITEM_IMAGE_UPLOAD_POLL_TIMEOUT_MS);
  const [editForm, setEditForm] = useState({
    name: '',
    current_stock: '0',
    default_sale_price: '',
    cost_per_unit: '',
    pos_always_available: false,
    pos_best_seller_mode: 'auto',
    senior_pwd_discount_eligible: false,
    description: '',
    pos_category: '',
    manual_barcode: '',
    gtin: ''
  });
  const [focusedEditMoneyField, setFocusedEditMoneyField] = useState('');
  const [savedMessage, setSavedMessage] = useState({ name: '', barcode: '', action: 'updated' });
  const [itemSaveInFlight, setItemSaveInFlight] = useState(false);
  const [editPermissionDenied, setEditPermissionDenied] = useState(false);
  const [deletedItemName, setDeletedItemName] = useState('');
  const [deleteConfirmItem, setDeleteConfirmItem] = useState(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [categoryFilter, setCategoryFilter] = useState('all');
  const [stockFilter, setStockFilter] = useState('all');
  const [draftCategoryFilter, setDraftCategoryFilter] = useState('all');
  const [draftStockFilter, setDraftStockFilter] = useState('all');
  const [showDesktopFilters, setShowDesktopFilters] = useState(false);
  const [showMobileFilters, setShowMobileFilters] = useState(false);
  const desktopFilterButtonRef = useRef(null);
  const [desktopFilterPosition, setDesktopFilterPosition] = useState(null);
  const [itemsPage, setItemsPage] = useState(1);
  const [itemsPageSize, setItemsPageSize] = useState(POS_ITEMS_PAGE_SIZE);
  const [itemsDisplayMode, setItemsDisplayMode] = useState('grid');
  const deferredItemsSearch = React.useDeferredValue(searchQuery);
  const [editingItemSnapshot, setEditingItemSnapshot] = useState(null);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [itemImagePreview, setItemImagePreview] = useState(null);
  const [showCreateServiceModal, setShowCreateServiceModal] = useState(false);
  const [editingServiceItem, setEditingServiceItem] = useState(null);
  const [createForm, setCreateForm] = useState(createEmptyPosItemForm());
  const createItemDetailsRef = useRef(null);
  const createDescriptionRef = useRef(null);
  const [createItemDetailsHeight, setCreateItemDetailsHeight] = useState(null);
  const [createModifierGroups, setCreateModifierGroups] = useState([]);
  const [createModifierGroupsLoading, setCreateModifierGroupsLoading] = useState(false);
  const [createModifierGroupsError, setCreateModifierGroupsError] = useState('');
  const [createOptionSearch, setCreateOptionSearch] = useState('');
  const [selectedCreateModifierOptionKeys, setSelectedCreateModifierOptionKeys] = useState([]);
  const [createCategoryInput, setCreateCategoryInput] = useState('');
  const [editCategoryInput, setEditCategoryInput] = useState('');
  // #1318 Wave C/C5 — POS's own "Additional Categories" secondary-membership
  // editor, mirroring packages/web-core/Components/items/ItemFormModal.jsx's
  // Phase 268 section but adapted to this file's activeEditItem-based state
  // (no itemIdForFolders equivalent exists here since this modal only ever
  // opens for an already-persisted item — see availableSecondaryFolders below).
  const [secondaryFolderIds, setSecondaryFolderIds] = useState([]);
  const [secondaryFoldersLoading, setSecondaryFoldersLoading] = useState(false);
  const [secondaryFoldersSaving, setSecondaryFoldersSaving] = useState(false);
  // #1318 PR #1581 review RF-3 — true only when the memberships GET itself
  // failed with 403 (categories:manage required server-side), distinct from
  // a genuinely empty membership list. See fetchSecondaryFolders below.
  const [secondaryFoldersUnavailable, setSecondaryFoldersUnavailable] = useState(false);
  const [posFolders, setPosFolders] = useState([]);
  const [skuSeedItems, setSkuSeedItems] = useState([]);
  const [selectedImageFiles, setSelectedImageFiles] = useState([]);
  const [selectedCreatePrimaryFile, setSelectedCreatePrimaryFile] = useState(null);
  const [manualBarcode, setManualBarcode] = useState('');
  const [externalBarcode, setExternalBarcode] = useState('');
  const [externalLookupLoading, setExternalLookupLoading] = useState(false);
  const [externalLookupError, setExternalLookupError] = useState('');
  const [externalProductLookup, setExternalProductLookup] = useState(null);
  const [acceptedExternalProduct, setAcceptedExternalProduct] = useState(null);
  const [externalQrScannerOpen, setExternalQrScannerOpen] = useState(false);
  const [pendingCreateRecovery, setPendingCreateRecovery] = useState(null);
  const [postCreateSaving, setPostCreateSaving] = useState(false);

  const posItemPreset = useMemo(() => resolveSellablePosItemPreset(workflowMode), [workflowMode]);
  const isServicesMode = normalizeWorkflowMode(workflowMode) === 'services';
  const isFnbMode = normalizeWorkflowMode(workflowMode) === 'fnb';
  const itemWorkspacePresentation = useMemo(
    () => resolveItemWorkspacePresentation(workflowMode),
    [workflowMode]
  );
  const SavingItemIcon = itemWorkspacePresentation.savingIcon;
  const usesWarmSavingAccent = itemWorkspacePresentation.accent === 'amber';

  useEffect(() => {
    const normalizedPreset = String(stockFilterPreset || '').trim();
    if (!normalizedPreset) return;
    setStockFilter(normalizedPreset);
    onStockFilterPresetApplied();
  }, [onStockFilterPresetApplied, stockFilterPreset]);

  const loadPrimaryBarcodes = useCallback((catalogItems = []) => {
    const normalizedItems = Array.isArray(catalogItems)
      ? catalogItems.filter((item) => Number(item?.item_id) > 0)
      : [];

    if (normalizedItems.length === 0) {
      setPrimaryBarcodes({});
      return;
    }

    const nextBarcodes = {};
    normalizedItems.forEach((item) => {
      const barcode = item?.primary_barcode;
      if (barcode?.code) {
        nextBarcodes[String(item.item_id)] = barcode;
      }
    });
    setPrimaryBarcodes(nextBarcodes);
  }, []);

  const loadItems = useCallback(async () => {
    const sequence = ++itemsReadSequence.current;
    if (modalOnly) {
      itemsLoaded.current = true;
      setItems([]);
      setItemsTotal(0);
      setPrimaryBarcodes({});
      setLoading(false);
      setError('');
      return;
    }
    if (!canViewPos || locked) {
      itemsLoaded.current = false;
      setItems([]);
      setItemsTotal(0);
      setPrimaryBarcodes({});
      setError('');
      setLoading(false);
      return;
    }

    // A loaded location list without a selected location is still an
    // incomplete scope. Do not send an unscoped catalog request during the
    // short render between those two state updates; the API must reject it.
    const scopedLocationId = Number(operatingLocationId || 0);
    const hasValidOperatingLocation = Number.isInteger(scopedLocationId)
      && scopedLocationId > 0
      && (availableLocations.length === 0
        || availableLocations.some((location) => (
          Number(location?.location_id) === scopedLocationId
        )));
    const scopedItemsCacheKey = hasValidOperatingLocation
      ? JSON.stringify({
        locationId: scopedLocationId,
        search: deferredItemsSearch,
        page: itemsPage,
        pageSize: itemsPageSize,
        categoryFilter,
        stockFilter
      })
      : '';
    const cachedItems = scopedItemsCacheKey
      ? scopedItemsCache.current.get(scopedItemsCacheKey)
      : null;

    if (locationsLoading || !hasValidOperatingLocation) {
      if (cachedItems) {
        setItems(cachedItems.items);
        setItemsTotal(cachedItems.total);
        loadPrimaryBarcodes(cachedItems.items);
        itemsLoaded.current = true;
        setError('');
        setLoading(false);
      } else {
        // Never replace an unavailable location-scoped response with the
        // tenant-wide inventory endpoint. That endpoint is not a safe POS
        // fallback because it is intentionally not location-scoped.
        itemsLoaded.current = false;
        setItems([]);
        setItemsTotal(0);
        setPrimaryBarcodes({});
        setLoading(locationsLoading);
        setError(locationsLoading ? '' : 'Select an authorized location to load POS items.');
      }
      return;
    }

    setLoading(true);
    setError('');
    try {
      const data = await fetchPosCatalogPage({
        search: deferredItemsSearch,
        page: itemsPage,
        page_size: itemsPageSize,
        category_filter: categoryFilter,
        stock_filter: stockFilter,
        location_id: scopedLocationId
      });
      if (itemsReadSequence.current !== sequence) return;
      const catalogItems = Array.isArray(data?.items) ? data.items : [];
      setItems(catalogItems);
      setItemsTotal(Number(data?.pagination?.total || 0));
      scopedItemsCache.current.set(scopedItemsCacheKey, {
        items: catalogItems,
        total: Number(data?.pagination?.total || 0)
      });
      itemsLoaded.current = true;
      loadPrimaryBarcodes(catalogItems);
    } catch (loadError) {
      if (itemsReadSequence.current !== sequence) return;
      if (cachedItems) {
        setItems(cachedItems.items);
        setItemsTotal(cachedItems.total);
        loadPrimaryBarcodes(cachedItems.items);
        itemsLoaded.current = true;
        setError('');
      } else {
        itemsLoaded.current = false;
        setItems([]);
        setItemsTotal(0);
        setPrimaryBarcodes({});
        setError(loadError?.response?.data?.message || 'Failed to load POS-visible IMS items.');
      }
    } finally {
      if (itemsReadSequence.current === sequence) setLoading(false);
    }
  }, [availableLocations, canViewPos, categoryFilter, deferredItemsSearch, itemsPage, itemsPageSize, loadPrimaryBarcodes, locationsLoading, locked, modalOnly, operatingLocationId, stockFilter]);

  useEffect(() => () => { itemsReadSequence.current++; }, [loadItems]);
  const normalizePosFolders = useCallback((rows = []) => (
    (Array.isArray(rows) ? rows : [])
      .map((folder) => ({
        ...folder,
        folder_id: Number(folder?.folder_id),
        name: String(folder?.name || '').trim(),
        is_active: folder?.is_active !== false,
        show_in_pos_filter: folder?.show_in_pos_filter !== false
      }))
      .filter((folder) => Number.isInteger(folder.folder_id) && folder.folder_id > 0 && folder.name)
  ), []);

  const loadPosFolders = useCallback(async () => {
    if (!canViewPos && !modalOnly) {
      setPosFolders([]);
      return [];
    }

    try {
      const folders = normalizePosFolders(await getFolders());
      setPosFolders(folders);
      return folders;
    } catch (folderError) {
      setPosFolders([]);
      return [];
    }
  }, [canViewPos, modalOnly, normalizePosFolders]);

  useEffect(() => {
    loadItems();
  }, [loadItems]);

  useEffect(() => {
    if (locked || !canViewPos) return undefined;
    const refreshItems = () => {
      void loadItems();
    };
    const unsubscribeLocal = subscribeToPosCatalogUpdates(refreshItems);
    const unsubscribeRemote = subscribeToRemotePosCatalogUpdates();
    return () => {
      unsubscribeLocal();
      unsubscribeRemote();
    };
  }, [canViewPos, loadItems, locked]);

  useEffect(() => {
    loadPosFolders();
  }, [loadPosFolders]);

  useEffect(() => {
    if (!showCreateModal || !canManageFnbModifiers || !isFnbMode || !isOnline) {
      setCreateModifierGroups([]);
      setCreateModifierGroupsLoading(false);
      setCreateModifierGroupsError('');
      return undefined;
    }

    let cancelled = false;
    setCreateModifierGroupsLoading(true);
    setCreateModifierGroupsError('');
    listFnbModifierGroups({ include_inactive: false })
      .then((payload) => {
        if (cancelled) return;
        const groups = Array.isArray(payload?.modifier_groups) ? payload.modifier_groups : [];
        setCreateModifierGroups(groups.filter((group) => group?.is_active !== false));
      })
      .catch((loadError) => {
        if (cancelled) return;
        setCreateModifierGroups([]);
        setCreateModifierGroupsError(loadError?.response?.data?.message || 'Unable to load menu options.');
      })
      .finally(() => {
        if (!cancelled) setCreateModifierGroupsLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [canManageFnbModifiers, isFnbMode, isOnline, showCreateModal]);

  useEffect(() => {
    if (!showCreateModal) {
      setCreateItemDetailsHeight(null);
      return undefined;
    }

    const detailsColumn = createItemDetailsRef.current;
    const descriptionField = createDescriptionRef.current;
    if (!detailsColumn || !descriptionField) return undefined;

    const syncOptionsHeight = () => {
      const detailsRect = detailsColumn.getBoundingClientRect();
      const descriptionRect = descriptionField.getBoundingClientRect();
      const nextHeight = Math.ceil(descriptionRect.bottom - detailsRect.top);
      setCreateItemDetailsHeight((currentHeight) => (
        currentHeight === nextHeight ? currentHeight : nextHeight
      ));
    };

    syncOptionsHeight();
    window.addEventListener('resize', syncOptionsHeight);
    if (typeof ResizeObserver === 'undefined') {
      return () => window.removeEventListener('resize', syncOptionsHeight);
    }

    const observer = new ResizeObserver(syncOptionsHeight);
    observer.observe(detailsColumn);
    observer.observe(descriptionField);
    return () => {
      observer.disconnect();
      window.removeEventListener('resize', syncOptionsHeight);
    };
  }, [showCreateModal]);

  useEffect(() => {
    if (!showCreateModal || !canCreateItems) return;
    let cancelled = false;

    (async () => {
      try {
        const payload = await getItems({ fields: 'dropdown', limit: 10000 });
        if (cancelled) return;
        setSkuSeedItems(Array.isArray(payload?.items) ? payload.items : []);
      } catch {
        if (!cancelled) {
          setSkuSeedItems([]);
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [canCreateItems, showCreateModal]);

  useEffect(() => {
    if (!showCreateModal) return;
    const suggestedSku = suggestNextSku({
      name: createForm.name,
      category: 'product',
      existingItems: skuSeedItems
    });
    setCreateForm((current) => (
      current.sku_code === suggestedSku
        ? current
        : { ...current, sku_code: suggestedSku }
    ));
  }, [createForm.name, showCreateModal, skuSeedItems]);

  const sortedItems = useMemo(
    () => [...(Array.isArray(items) ? items : [])].sort((left, right) => String(left?.name || '').localeCompare(String(right?.name || ''))),
    [items]
  );

  const foodCategoryOptions = useMemo(() => {
    const byName = new Map();
    posFolders
      .filter((folder) => folder?.is_active !== false && folder?.show_in_pos_filter !== false)
      .forEach((folder) => {
        byName.set(normalizeFolderNameKey(folder.name), createFoodCategoryOption(folder));
      });
    return Array.from(byName.values()).filter((option) => option.name);
  }, [posFolders]);

  const categoryOptions = useMemo(() => ['all', ...foodCategoryOptions.map((option) => option.value)], [foodCategoryOptions]);

  const categoryOptionLabels = useMemo(() => {
    const labels = new Map([['all', 'All categories']]);
    foodCategoryOptions.forEach((option) => labels.set(option.value, option.label));
    return labels;
  }, [foodCategoryOptions]);
  const desktopStockFilterOptions = POS_DESKTOP_STOCK_FILTER_OPTIONS;
  const modifierOptionRows = useMemo(() => {
    const query = String(createOptionSearch || '').trim().toLowerCase();
    return createModifierGroups.flatMap((group) => (
      (Array.isArray(group?.options) ? group.options : [])
        .map((option, optionIndex) => ({
          key: createModifierOptionKey(group, option, optionIndex),
          groupId: Number(group?.modifier_group_id),
          groupName: String(group?.display_name || group?.name || '').trim(),
          optionId: Number(option?.modifier_option_id),
          name: String(option?.name || '').trim(),
          price: Number(option?.price_delta || 0),
          isActive: option?.is_active !== false
        }))
        .filter((option) => option.isActive && option.name)
    )).filter((option) => (
      !query
      || option.name.toLowerCase().includes(query)
      || option.groupName.toLowerCase().includes(query)
    ));
  }, [createModifierGroups, createOptionSearch]);
  const selectedCreateModifierGroupIds = useMemo(() => {
    const selectedKeys = new Set(selectedCreateModifierOptionKeys);
    return createModifierGroups
      .filter((group) => (Array.isArray(group?.options) ? group.options : []).some((option, optionIndex) => (
        selectedKeys.has(createModifierOptionKey(group, option, optionIndex))
      )))
      .map((group) => Number(group?.modifier_group_id))
      .filter((groupId) => Number.isInteger(groupId) && groupId > 0);
  }, [createModifierGroups, selectedCreateModifierOptionKeys]);
  const resolveFoodCategorySelection = useCallback((selection = '') => {
    const normalizedSelection = String(selection || '').trim();
    return foodCategoryOptions.find((option) => option.value === normalizedSelection) || null;
  }, [foodCategoryOptions]);

  const filteredItems = sortedItems;
  const hasActiveItemsFilters = Boolean(String(searchQuery || '').trim())
    || categoryFilter !== 'all'
    || stockFilter !== 'all';

  useEffect(() => {
    setItemsPage(1);
  }, [categoryFilter, searchQuery, stockFilter]);

  useEffect(() => {
    setDraftCategoryFilter(categoryFilter);
    setDraftStockFilter(stockFilter);
  }, [categoryFilter, stockFilter]);

  const applyDesktopFilters = () => {
    setCategoryFilter(draftCategoryFilter);
    setStockFilter(draftStockFilter);
    setShowDesktopFilters(false);
  };

  const resetDesktopFilters = () => {
    setDraftCategoryFilter('all');
    setDraftStockFilter('all');
    setCategoryFilter('all');
    setStockFilter('all');
  };

  const openMobileFilters = () => {
    setShowDesktopFilters(false);
    setDesktopFilterPosition(null);
    setDraftCategoryFilter(categoryFilter);
    setDraftStockFilter(stockFilter);
    setShowMobileFilters(true);
  };

  const toggleDesktopFilters = () => {
    setShowMobileFilters(false);
    if (!showDesktopFilters) {
      setDraftCategoryFilter(categoryFilter);
      setDraftStockFilter(stockFilter);
    }
    setShowDesktopFilters((visible) => !visible);
  };

  const applyMobileFilters = () => {
    setCategoryFilter(draftCategoryFilter);
    setStockFilter(draftStockFilter);
    setShowMobileFilters(false);
  };

  const resetMobileFilters = () => {
    setDraftCategoryFilter('all');
    setDraftStockFilter('all');
    setCategoryFilter('all');
    setStockFilter('all');
  };

  useLayoutEffect(() => {
    if (!showDesktopFilters || typeof window === 'undefined') {
      setDesktopFilterPosition(null);
      return undefined;
    }

    const updateDesktopFilterPosition = () => {
      const buttonRect = desktopFilterButtonRef.current?.getBoundingClientRect?.();
      if (!buttonRect) return;

      const viewportPadding = 16;
      const dialogWidth = Math.min(
        POS_DESKTOP_FILTER_WIDTH,
        Math.max(360, window.innerWidth - (viewportPadding * 2))
      );
      const left = Math.max(
        viewportPadding,
        Math.min(
          buttonRect.right - dialogWidth,
          window.innerWidth - viewportPadding - dialogWidth
        )
      );
      const preferredTop = buttonRect.bottom + 8;
      const maxHeight = Math.min(
        768,
        Math.max(240, window.innerHeight - preferredTop - viewportPadding)
      );
      const top = preferredTop + 480 > window.innerHeight - viewportPadding
        ? Math.max(viewportPadding, buttonRect.top - Math.min(480, maxHeight) - 8)
        : preferredTop;

      setDesktopFilterPosition({
        left,
        top,
        width: dialogWidth,
        maxWidth: dialogWidth,
        maxHeight: Math.min(768, Math.max(240, window.innerHeight - top - viewportPadding)),
        boxSizing: 'border-box'
      });
    };

    updateDesktopFilterPosition();
    window.addEventListener('resize', updateDesktopFilterPosition);
    window.addEventListener('scroll', updateDesktopFilterPosition, true);
    return () => {
      window.removeEventListener('resize', updateDesktopFilterPosition);
      window.removeEventListener('scroll', updateDesktopFilterPosition, true);
    };
  }, [showDesktopFilters]);

  const totalItemsPages = Math.max(1, Math.ceil(itemsTotal / itemsPageSize));
  const currentItemsPage = Math.min(itemsPage, totalItemsPages);
  const paginatedItems = filteredItems;
  const presentedItems = useMemo(() => paginatedItems.map((item) => {
    const isServiceItem = isServiceCatalogItem(item);
    const imageSources = resolvePosCatalogImageSources(item);
    const previewSources = resolvePosCatalogPreviewGallery(item);
    const stockQuantity = Number(item?.current_stock || 0);
    const isAlwaysAvailable = item?.pos_always_available === true;
    const profit = Number(item?.default_sale_price || 0) - Number(item?.cost_per_unit || 0);
    const threshold = Number(item?.min_threshold);
    const lowStockThreshold = Number.isFinite(threshold) && threshold > 0 ? threshold : 5;
    const almostOutOfStock = !isAlwaysAvailable && stockQuantity > 0 && stockQuantity <= lowStockThreshold;
    const stockStatusLabel = isServiceItem
      ? 'Stock Exempt'
      : isAlwaysAvailable
      ? 'Always Available'
      : stockQuantity <= 0 ? 'Out of Stock' : almostOutOfStock ? 'Low Stock' : 'In Stock';
    const stockQuantityClassName = isServiceItem
      ? 'text-slate-500'
      : isAlwaysAvailable
      ? 'text-sky-700'
      : stockQuantity <= 0
      ? 'text-rose-700'
      : almostOutOfStock
      ? 'text-amber-700'
      : 'text-emerald-700';
    const stockStatusBadgeClassName = isServiceItem
      ? 'border-slate-300 bg-slate-100 text-slate-700'
      : isAlwaysAvailable
      ? 'border-sky-200 bg-sky-50 text-sky-800'
      : stockQuantity <= 0
      ? 'border-rose-200 bg-rose-50 text-rose-800'
      : almostOutOfStock
      ? 'border-amber-200 bg-amber-50 text-amber-800'
      : 'border-emerald-200 bg-emerald-50 text-emerald-800';
    const stockStatusDotClassName = isServiceItem
      ? 'bg-slate-500'
      : isAlwaysAvailable
      ? 'bg-sky-500'
      : stockQuantity <= 0
      ? 'bg-rose-500'
      : almostOutOfStock
      ? 'bg-amber-500'
      : 'bg-emerald-500';

    return {
      item,
      isServiceItem,
      imageSources,
      previewSources,
      stockQuantity,
      profit,
      stockStatusLabel,
      stockQuantityClassName,
      stockStatusBadgeClassName,
      stockStatusDotClassName
    };
  }), [paginatedItems]);

  useEffect(() => {
    if (itemsPage !== currentItemsPage) {
      setItemsPage(currentItemsPage);
    }
  }, [currentItemsPage, itemsPage]);

  const activeEditItem = useMemo(
    () => sortedItems.find((item) => Number(item?.item_id) === Number(editingItemId)) || editingItemSnapshot,
    [editingItemId, editingItemSnapshot, sortedItems]
  );

  useEffect(() => {
    if (!activeEditItem) {
      setEditItemDetailsHeight(null);
      return undefined;
    }

    const detailsColumn = editItemDetailsRef.current;
    const descriptionField = editDescriptionRef.current;
    if (!detailsColumn || !descriptionField) return undefined;

    const syncEditOptionsHeight = () => {
      const detailsRect = detailsColumn.getBoundingClientRect();
      const descriptionRect = descriptionField.getBoundingClientRect();
      const nextHeight = Math.ceil(descriptionRect.bottom - detailsRect.top);
      setEditItemDetailsHeight((currentHeight) => (
        currentHeight === nextHeight ? currentHeight : nextHeight
      ));
    };

    syncEditOptionsHeight();
    window.addEventListener('resize', syncEditOptionsHeight);
    if (typeof ResizeObserver === 'undefined') {
      return () => window.removeEventListener('resize', syncEditOptionsHeight);
    }

    const observer = new ResizeObserver(syncEditOptionsHeight);
    observer.observe(detailsColumn);
    observer.observe(descriptionField);
    return () => {
      observer.disconnect();
      window.removeEventListener('resize', syncEditOptionsHeight);
    };
  }, [activeEditItem]);

  // Real, already-persisted item id backing the open edit modal, or 0 when
  // there isn't one. This modal only ever opens for an item found in
  // sortedItems (activeEditItem above), so in practice this is always > 0
  // while the modal is rendered -- unlike IMS's ItemFormModal, which is
  // shared between create and edit and needs this guard to actually matter.
  // Kept as an explicit, defensive gate anyway so the Additional Categories
  // section never renders against an unsaved/invalid item.
  const editItemIdForFolders = Number(activeEditItem?.item_id) > 0 ? Number(activeEditItem.item_id) : 0;

  // #1318 PR #1581 review RF-1 (blocker) — the primary category field in this
  // same modal (EditableFoodCategoryCombobox / the read-only <select> above)
  // lets a manager stage a DIFFERENT primary category in editForm before
  // "Save Item" is ever clicked. "Save Additional Categories" is a separate,
  // independent write that can land while that staged change is still
  // unsaved -- the server's disjointness guard only ever sees the DB's
  // *current* primary at write time, so it cannot catch a pending primary
  // change that would collide with an already-saved secondary membership (or
  // the reverse order: stage primary -> save secondary against the still-old
  // DB primary -> save item, landing both as primary AND secondary at once).
  // Mirrors handleSave's own foodCategory resolution exactly (below, at
  // categoryPayload) so the two can never disagree about what the pending
  // primary actually is.
  const pendingPrimaryFolderId = useMemo(() => {
    const typedCategoryName = String(editCategoryInput || '').trim().replace(/\s+/g, ' ');
    const foodCategory = resolveFoodCategorySelection(editForm.pos_category)
      || foodCategoryOptions.find((option) => normalizeFolderNameKey(option.name) === normalizeFolderNameKey(typedCategoryName));
    if (Number.isInteger(Number(foodCategory?.folder_id)) && Number(foodCategory.folder_id) > 0) {
      return Number(foodCategory.folder_id);
    }
    // No resolvable pending category (blank, or a brand-new not-yet-created
    // name) -- nothing has actually changed from the persisted primary yet.
    return Number(activeEditItem?.folder_id) || 0;
  }, [editCategoryInput, editForm.pos_category, resolveFoodCategorySelection, foodCategoryOptions, activeEditItem?.folder_id]);

  // Every folder id that is, or is about to become, this item's primary
  // category -- both the currently-persisted one (already-excluded, as
  // before) and the staged-but-unsaved pending one, when they differ.
  const excludedPrimaryFolderIds = useMemo(() => {
    const ids = new Set();
    const persisted = Number(activeEditItem?.folder_id);
    if (Number.isInteger(persisted) && persisted > 0) ids.add(persisted);
    if (Number.isInteger(pendingPrimaryFolderId) && pendingPrimaryFolderId > 0) ids.add(pendingPrimaryFolderId);
    return ids;
  }, [activeEditItem?.folder_id, pendingPrimaryFolderId]);

  // #1318 Wave C/C5 — every persisted folder except the item's own primary
  // one (selecting it would be redundant, and the API silently drops it
  // anyway per the disjointness guard, ADR 0080 clause 2) *and* except any
  // pending, not-yet-saved primary selection (RF-1 above). Mirrors
  // ItemFormModal.jsx's availableSecondaryFolders, widened for the
  // pending-primary case IMS's own modal doesn't have to contend with here.
  const availableSecondaryFolders = useMemo(
    () => posFolders.filter((folder) => !excludedPrimaryFolderIds.has(Number(folder.folder_id))),
    [posFolders, excludedPrimaryFolderIds]
  );

  const fetchSecondaryFolders = useCallback(async (itemId) => {
    if (!itemId) return;
    setSecondaryFoldersLoading(true);
    setSecondaryFoldersUnavailable(false);
    try {
      const response = await listItemFolders(itemId);
      const memberships = Array.isArray(response?.memberships) ? response.memberships : [];
      setSecondaryFolderIds(memberships.map((membership) => String(membership.folder_id)));
    } catch (folderFetchError) {
      console.error('Failed to load item category memberships:', folderFetchError);
      setSecondaryFolderIds([]);
      // #1318 PR #1581 review RF-3 (should-fix) — GET /items/:item_id/folders
      // is gated by requireTenantAdmin (categories:manage) server-side, the
      // same permission canManageCategories mirrors client-side. The two can
      // drift (stale client permission cache, a race, direct testing), so
      // trust the *actual* response rather than the client flag: a 403 here
      // means the memberships genuinely could not be read, which is a
      // distinct state from "this item has zero secondary memberships" and
      // must not render the same "0/10 selected" as a real empty result.
      setSecondaryFoldersUnavailable(folderFetchError?.response?.status === 403);
    } finally {
      setSecondaryFoldersLoading(false);
    }
  }, []);

  useEffect(() => {
    if (editItemIdForFolders) {
      fetchSecondaryFolders(editItemIdForFolders);
    } else {
      setSecondaryFolderIds([]);
      setSecondaryFoldersUnavailable(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [editItemIdForFolders]);

  // RF-1 continued: if the pending primary selection changes (or the item's
  // persisted primary itself changes, e.g. after a reload) to a folder id
  // that is already checked as a secondary category, drop it immediately --
  // otherwise a stale checked-but-now-excluded id could still be sent by
  // "Save Additional Categories" even though its checkbox is no longer shown.
  useEffect(() => {
    setSecondaryFolderIds((current) => {
      const filtered = current.filter((id) => !excludedPrimaryFolderIds.has(Number(id)));
      return filtered.length === current.length ? current : filtered;
    });
  }, [excludedPrimaryFolderIds]);

  const toggleSecondaryFolder = (folderId, checked) => {
    const normalizedId = String(folderId);
    if (checked && excludedPrimaryFolderIds.has(Number(folderId))) return;
    setSecondaryFolderIds((current) => {
      if (checked) {
        if (current.includes(normalizedId) || current.length >= 10) return current;
        return [...current, normalizedId];
      }
      return current.filter((entry) => entry !== normalizedId);
    });
  };

  const saveSecondaryFolders = async () => {
    if (!editItemIdForFolders) return;
    // Defensive re-filter at the actual write boundary (RF-1) -- belt and
    // suspenders alongside the render-time exclusion and the cleanup effect
    // above, so a pending primary can never reach the API as a secondary
    // selection no matter which state update ordering got us here.
    const outgoingFolderIds = secondaryFolderIds
      .map((id) => Number(id))
      .filter((id) => !excludedPrimaryFolderIds.has(id));
    setSecondaryFoldersSaving(true);
    try {
      await replaceItemFolders(editItemIdForFolders, outgoingFolderIds);
      toast.success('Additional categories saved.');
    } catch (saveFolderError) {
      toast.error(saveFolderError?.response?.data?.message || 'Unable to save additional categories.');
    } finally {
      setSecondaryFoldersSaving(false);
    }
  };

  const queueDeferredEditImageFiles = useCallback(async ({ itemId, files, existingGalleryCount }) => {
    const normalizedFiles = Array.isArray(files) ? files.filter(Boolean) : [];
    const availableSlots = Math.max(0, STOREFRONT_ITEM_IMAGE_MAX_COUNT - existingGalleryCount);
    const filesToUpload = normalizedFiles.slice(0, availableSlots);
    const remainingFiles = normalizedFiles.slice(filesToUpload.length);
    if (!itemId || filesToUpload.length === 0) return;

    setPendingEditImageRefresh({
      itemId,
      existingGalleryCount,
      pendingCount: filesToUpload.length,
      remainingFiles
    });
    setEditImageUploadJob({ itemId, jobId: null });
    try {
      const queued = filesToUpload.length === 1
        ? await queueStorefrontCatalogImage(itemId, filesToUpload[0])
        : await queueStorefrontCatalogImages(itemId, filesToUpload);
      setEditImageUploadJob((current) => (
        current?.itemId === itemId
          ? { ...current, jobId: queued?.job_id || null }
          : current
      ));
    } catch (error) {
      setSelectedEditImageFiles([]);
      setDeferredEditImageFiles([]);
      setSelectedEditPrimaryFile(null);
      setPendingEditImageRefresh((current) => (
        current?.itemId === itemId ? null : current
      ));
      toast.error(error?.response?.data?.message || 'Image upload failed. Try selecting the image again.');
    } finally {
      setEditImageUploadJob((current) => (
        current?.itemId === itemId ? null : current
      ));
    }
  }, []);

  useEffect(() => {
    if (!pendingEditImageRefresh || !activeEditItem) return;
    if (Number(activeEditItem.item_id) !== Number(pendingEditImageRefresh.itemId)) return;
    const galleryCount = normalizeStorefrontItemGallery(activeEditItem).length;
    const expectedGalleryCount = pendingEditImageRefresh.existingGalleryCount
      + pendingEditImageRefresh.pendingCount;
    if (galleryCount < expectedGalleryCount) return;
    const remainingFiles = Array.isArray(pendingEditImageRefresh.remainingFiles)
      ? pendingEditImageRefresh.remainingFiles.filter(Boolean)
      : [];
    setSelectedEditImageFiles(remainingFiles);
    setDeferredEditImageFiles(remainingFiles);
    setSelectedEditPrimaryFile(null);
    setPendingEditImageRefresh(null);
  }, [activeEditItem, pendingEditImageRefresh]);

  useEffect(() => {
    if (!activeEditItem || deferredEditImageFiles.length === 0 || editImageUploadJob || pendingEditImageRefresh) return;
    const itemId = Number(activeEditItem.item_id || 0);
    if (!itemId) return;
    const existingGalleryCount = normalizeStorefrontItemGallery(activeEditItem).length;
    if (existingGalleryCount >= STOREFRONT_ITEM_IMAGE_MAX_COUNT) return;
    void queueDeferredEditImageFiles({
      itemId,
      files: deferredEditImageFiles,
      existingGalleryCount
    });
  }, [activeEditItem, deferredEditImageFiles, editImageUploadJob, pendingEditImageRefresh, queueDeferredEditImageFiles]);

  const activeEditStorefrontUrl = useMemo(() => resolveStorefrontItemUrl({
    slug: storefrontSlug,
    itemId: activeEditItem?.item_id
  }), [activeEditItem?.item_id, storefrontSlug]);
  const openEdit = (item) => {
    if (isServiceCatalogItem(item)) {
      if (canManageServiceCatalog) setEditingServiceItem(item);
      return;
    }
    const savedFolderId = Number(item?.folder_id || 0);
    const savedFolderName = String(item?.folder?.name || item?.product_folder || '').trim();
    const matchedActiveCategory = savedFolderId > 0
      ? foodCategoryOptions.find((option) => Number(option?.folder_id) === savedFolderId)
      : foodCategoryOptions.find((option) => normalizeFolderNameKey(option?.name) === normalizeFolderNameKey(savedFolderName));
    setEditingItemId(item?.item_id || null);
    setEditingItemSnapshot(item || null);
    setEditPermissionDenied(false);
    setFocusedEditMoneyField('');
    const savedBarcode = primaryBarcodes[String(item?.item_id)] || item?.primary_barcode || null;
    const savedBarcodeCode = String(savedBarcode?.code || '').trim();
    const savedBarcodeIsGtin = String(savedBarcode?.source || '').toLowerCase() === 'manufacturer';
    setEditForm({
      name: String(item?.name || ''),
      current_stock: String(item?.current_stock ?? '0'),
      default_sale_price: String(item?.default_sale_price ?? ''),
      cost_per_unit: String(item?.cost_per_unit ?? ''),
      pos_always_available: item?.pos_always_available === true,
      pos_best_seller_mode: ['force', 'never'].includes(String(item?.pos_best_seller_mode || '').toLowerCase())
        ? String(item.pos_best_seller_mode).toLowerCase()
        : 'auto',
      senior_pwd_discount_eligible: item?.senior_pwd_discount_eligible === true || Number(item?.senior_pwd_discount_eligible) === 1,
      description: String(item?.description || ''),
      // Item lists do not always hydrate the nested folder name. Resolve by saved ID first.
      pos_category: matchedActiveCategory?.value || (savedFolderId
        ? createFolderFilterValue({ folder_id: savedFolderId, name: item?.folder?.name || item?.product_folder })
        : ''),
      manual_barcode: savedBarcodeIsGtin ? '' : savedBarcodeCode,
      gtin: savedBarcodeIsGtin ? savedBarcodeCode : ''
    });
    setEditCategoryInput(String(item?.folder?.name || item?.product_folder || ''));
    setSelectedEditImageFiles([]);
    setDeferredEditImageFiles([]);
    setSelectedEditPrimaryFile(null);
    setEditImageUploadJob(null);
    setPendingEditImageRefresh(null);
  };

  const closeEdit = ({ force = false } = {}) => {
    if (!force && (savingItem || persistingEditAssets || generatingEditImage || pollingEditImage)) return;
    cancelImageGenerationPoll();
    setEditingItemId(null);
    setEditingItemSnapshot(null);
    setEditPermissionDenied(false);
    setFocusedEditMoneyField('');
    setPersistingEditAssets(false);
    setSelectedEditImageFiles([]);
    setDeferredEditImageFiles([]);
    setSelectedEditPrimaryFile(null);
    setEditImageUploadJob(null);
    setPendingEditImageRefresh(null);
    setGeneratingEditImage(false);
    setPollingEditImage(false);
    setEditCategoryInput('');
    setEditForm({
      name: '',
      current_stock: '0',
      default_sale_price: '',
      cost_per_unit: '',
      pos_always_available: false,
      pos_best_seller_mode: 'auto',
      senior_pwd_discount_eligible: false,
      description: '',
      pos_category: '',
      manual_barcode: '',
      gtin: ''
    });
  };

  const openCreate = () => {
    setCreateForm(createEmptyPosItemForm());
    setCreateOptionSearch('');
    setSelectedCreateModifierOptionKeys([]);
    setCreateCategoryInput('');
    setSelectedImageFiles([]);
    setSelectedCreatePrimaryFile(null);
    setManualBarcode('');
    setExternalBarcode('');
    setExternalLookupLoading(false);
    setExternalLookupError('');
    setExternalProductLookup(null);
    setAcceptedExternalProduct(null);
    setExternalQrScannerOpen(false);
    setPendingCreateRecovery(null);
    setShowCreateModal(true);
    onCreateModalOpenChange(true);
  };

  const closeCreate = ({ force = false } = {}) => {
    if ((creatingItem || postCreateSaving) && !force) return;
    setShowCreateModal(false);
    setCreateForm(createEmptyPosItemForm());
    setCreateOptionSearch('');
    setSelectedCreateModifierOptionKeys([]);
    setCreateCategoryInput('');
    setSelectedImageFiles([]);
    setSelectedCreatePrimaryFile(null);
    setManualBarcode('');
    setExternalBarcode('');
    setExternalLookupLoading(false);
    setExternalLookupError('');
    setExternalProductLookup(null);
    setAcceptedExternalProduct(null);
    setExternalQrScannerOpen(false);
    if (force) setPendingCreateRecovery(null);
    onCreateModalOpenChange(false);
  };

  useEffect(() => {
    if (createModalOpen === true && !showCreateModal) {
      openCreate();
    } else if (createModalOpen === false && showCreateModal) {
      closeCreate({ force: true });
    }
    // This effect is the optional controlled bridge used by the OPIS catalog.
    // POS keeps the existing internal open/close behavior by leaving the prop null.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [createModalOpen]);

  const closeEditRef = useRef(closeEdit);
  closeEditRef.current = closeEdit;
  const closeCreateRef = useRef(closeCreate);
  closeCreateRef.current = closeCreate;
  const externalQrScannerOpenRef = useRef(externalQrScannerOpen);
  externalQrScannerOpenRef.current = externalQrScannerOpen;
  const editItemModalOpen = Boolean(activeEditItem);

  useEffect(() => {
    if (!showCreateModal && !editItemModalOpen) return undefined;

    const releaseScrollLock = acquireModalScrollLock();
    const handleKeyDown = (event) => {
      if (event.key !== 'Escape' || (showCreateModal && externalQrScannerOpenRef.current)) return;
      if (showCreateModal && !creatingItem && !postCreateSaving) {
        event.preventDefault();
        closeCreateRef.current();
        return;
      }
      if (editItemModalOpen && !savingItem && !persistingEditAssets) {
        event.preventDefault();
        closeEditRef.current();
      }
    };
    document.addEventListener('keydown', handleKeyDown, true);
    return () => {
      document.removeEventListener('keydown', handleKeyDown, true);
      releaseScrollLock();
    };
  }, [creatingItem, editItemModalOpen, persistingEditAssets, postCreateSaving, savingItem, showCreateModal]);

  const parseMoneyValue = (rawValue) => Number(String(rawValue || '').trim());

  const getStageErrorMessage = (error) => (
    error?.response?.data?.message
    || error?.message
    || 'Unexpected error'
  );

  const handleSave = async () => {
    if (!activeEditItem || !canEditItems || editPermissionDenied) return;

    const editItemId = activeEditItem.item_id;
    let editSaveStage = 'item_details';
    const name = String(editForm.name || '').trim();
    const description = String(editForm.description || '').trim();
    const category = String(activeEditItem?.category || '').trim().toLowerCase() === 'service'
      ? 'service'
      : 'product';
    const stock = Number(String(editForm.current_stock || '0').trim());
    const price = parseMoneyValue(editForm.default_sale_price);
    const cost = parseMoneyValue(editForm.cost_per_unit);
    const barcodeSelection = resolveProductBarcodeInput({
      manualBarcode: editForm.manual_barcode,
      gtin: editForm.gtin
    });

    if (!name) {
      toast.error('Item name is required.');
      return;
    }
    if (!Number.isFinite(price) || price <= 0) {
      toast.error('Selling price is required.');
      return;
    }
    if (!Number.isFinite(cost) || cost < 0) {
      toast.error('Cost price is required.');
      return;
    }
    if (price <= cost) {
      toast.error('Selling price must be greater than cost.');
      return;
    }
    if (!Number.isFinite(stock) || stock < 0) {
      toast.error('Stock quantity cannot be negative.');
      return;
    }
    if (barcodeSelection.validationMessage) {
      toast.error(barcodeSelection.validationMessage);
      return;
    }

    try {
      setItemSaveInFlight(true);
      setPersistingEditAssets(true);
      const resolvedStock = category === 'product' || category === 'supplies' ? stock : 0;
      const currentFolderId = Number(activeEditItem.folder_id || 0);
      const currentFolderName = String(activeEditItem?.folder?.name || activeEditItem?.product_folder || '').trim();
      const typedCategoryName = String(editCategoryInput || '').trim().replace(/\s+/g, ' ');
      const foodCategory = resolveFoodCategorySelection(editForm.pos_category)
        || foodCategoryOptions.find((option) => normalizeFolderNameKey(option.name) === normalizeFolderNameKey(typedCategoryName));
      // Admins can type a brand-new category name (mirrors handleCreateItem) - but only treat it
      // as "create a new one" when it actually differs from the item's current category, so an
      // untouched field never gets misread as a create request.
      const categoryUnchanged = !foodCategory && normalizeFolderNameKey(typedCategoryName) === normalizeFolderNameKey(currentFolderName);
      const isTypingNewCategory = canManageCategories && !foodCategory && !categoryUnchanged && Boolean(typedCategoryName);
      if (!foodCategory && !currentFolderId && !isTypingNewCategory) {
        toast.error('Select an active category managed by an administrator.');
        return;
      }
      // foodCategory resolves to null whenever the item's current category is inactive
      // (foodCategoryOptions only lists active folders) even though the item still legitimately
      // has that folder assigned. Previously that silently dropped product_folder/folder_id from
      // the payload entirely, which cleared the item's category on every save. Fall back to the
      // item's existing folder so an untouched (inactive) category is preserved instead of wiped.
      const categoryPayload = foodCategory
        ? { product_folder: foodCategory.name, folder_id: foodCategory.folder_id }
        : isTypingNewCategory
          ? { create_category_name: typedCategoryName }
          : { product_folder: currentFolderName, folder_id: currentFolderId };
      await updateItem(editItemId, {
        name,
        category,
        description,
        ...categoryPayload,
        current_stock: resolvedStock,
        location_id: Number.isInteger(Number(operatingLocationId)) && Number(operatingLocationId) > 0
          ? Number(operatingLocationId)
          : null,
        product_type: category === 'product' ? (posItemPreset.product_type || 'finished_goods') : null,
        mode_item_preset: category === 'product' ? posItemPreset.key : 'service',
        unit_of_measure: category === 'product' ? (posItemPreset.default_unit || 'pcs') : 'service',
        fifo_enabled: category === 'product' ? posItemPreset.fifo_enabled !== false : false,
        max_capacity: category === 'service' ? 1 : Math.max(resolvedStock, 1),
        min_threshold: category === 'service' ? 0 : Math.min(5, Math.max(resolvedStock, 0)),
        default_sale_price: price,
        cost_per_unit: cost,
        senior_pwd_discount_eligible: editForm.senior_pwd_discount_eligible === true
      });
      editSaveStage = 'pos_catalog';
      await updatePosCatalogOverride(editItemId, {
        pos_always_available: editForm.pos_always_available === true,
        pos_best_seller_mode: editForm.pos_best_seller_mode
      });
      editSaveStage = 'barcode';
      const existingPrimaryBarcode = primaryBarcodes[String(editItemId)] || activeEditItem?.primary_barcode || null;
      const existingPrimaryCode = normalizeBarcodeEntry(existingPrimaryBarcode?.code || '');
      await persistPosItemBarcode({
        itemId: editItemId,
        barcodeSelection,
        existingPrimaryBarcode,
        attachBarcode: attachItemBarcode,
        updateBarcode: updateItemBarcode
      });
      editSaveStage = 'refresh';
      closeEdit({ force: true });
      await Promise.all([loadItems(), loadPosFolders()]);
      notifyPosCatalogUpdated();
      setSavedMessage({
        name,
        barcode: barcodeSelection.shouldGenerate ? existingPrimaryCode : barcodeSelection.code,
        action: 'updated'
      });
    } catch (updateError) {
      if (editSaveStage === 'item_details' && updateError?.response?.status === 403) {
        setEditPermissionDenied(true);
        try {
          await refreshTerminalUser({ suppressGlobalErrors: true });
        } catch {
          // Keep the item's draft open and locked even if the permission refresh itself fails.
        }
      }
      toast.error(resolveEditItemSaveError(updateError, editSaveStage).message);
    } finally {
      setPersistingEditAssets(false);
      setItemSaveInFlight(false);
    }
  };

  const handleSelectCreateImageFiles = (files) => {
    const normalizedFiles = Array.isArray(files) ? files.filter(Boolean) : [];
    if (normalizedFiles.length === 0) return;
    const remainingSlots = STOREFRONT_ITEM_IMAGE_MAX_COUNT - selectedImageFiles.length;
    if (remainingSlots <= 0) {
      toast.error(`Only ${STOREFRONT_ITEM_IMAGE_MAX_COUNT} images are allowed per item.`);
      return;
    }
    if (normalizedFiles.length > remainingSlots) {
      toast.error(`Only ${remainingSlots} more item image${remainingSlots === 1 ? '' : 's'} can be selected.`);
    }
    setSelectedImageFiles((current) => {
      const availableSlots = Math.max(0, STOREFRONT_ITEM_IMAGE_MAX_COUNT - current.length);
      return [
        ...current,
        ...normalizedFiles.slice(0, availableSlots)
      ];
    });
  };

  const removeSelectedCreateImageFile = (imageIndex) => {
    const removedFile = selectedImageFiles[imageIndex];
    if (removedFile === selectedCreatePrimaryFile) {
      setSelectedCreatePrimaryFile(null);
    }
    setSelectedImageFiles((current) => current.filter((_, index) => index !== imageIndex));
  };

  const handleSetPendingCreatePrimary = (file) => {
    setSelectedCreatePrimaryFile(file || null);
  };

  const handleExternalBarcodeChange = (value) => {
    const normalized = normalizeBarcodeEntry(value);
    setExternalBarcode(normalized);
    if (normalized !== externalProductLookup?.code) {
      setExternalLookupError('');
      setExternalProductLookup(null);
      setAcceptedExternalProduct(null);
    }
  };

  const handleExternalProductLookup = async (codeOverride) => {
    if (externalLookupLoading) return;
    const lookupCode = typeof codeOverride === 'string' ? codeOverride : externalBarcode;
    const validationMessage = getGtinValidationMessage(lookupCode);
    if (validationMessage) {
      setExternalLookupError(validationMessage);
      return;
    }

    setExternalLookupLoading(true);
    setExternalLookupError('');
    setExternalProductLookup(null);
    setAcceptedExternalProduct(null);
    try {
      const result = await lookupExternalProduct(lookupCode);
      setExternalProductLookup(result);
      if (!result?.found) {
        setExternalLookupError('Barcode captured. No registry details were found. Complete the remaining item details; this barcode will still be saved.');
      }
    } catch (lookupError) {
      setExternalLookupError(
        lookupError?.response?.data?.message
        || 'The product registry is unavailable. Complete the item manually; this valid barcode will still be saved.'
      );
    } finally {
      setExternalLookupLoading(false);
    }
  };

  const handleExternalQrDetected = (code) => {
    setExternalQrScannerOpen(false);
    handleExternalBarcodeChange(code);
    void handleExternalProductLookup(code);
  };

  const applyExternalProductDetails = () => {
    if (!externalProductLookup?.found) return;
    const product = externalProductLookup.product || {};
    const descriptionParts = [product.brand, product.quantity].filter(Boolean);
    const categorySuggestion = String(product.category_suggestion || '').trim().replace(/\s+/g, ' ').slice(0, 100);
    const matchedCategory = categorySuggestion
      ? foodCategoryOptions.find((option) => normalizeFolderNameKey(option.name) === normalizeFolderNameKey(categorySuggestion))
      : null;
    setCreateForm((current) => ({
      ...current,
      name: product.name || current.name,
      description: current.description || descriptionParts.join(' - '),
      pos_category: matchedCategory?.value || current.pos_category
    }));
    if (matchedCategory) {
      setCreateCategoryInput(matchedCategory.name);
    } else if (categorySuggestion && canManageCategories) {
      setCreateCategoryInput(categorySuggestion);
      setCreateForm((current) => ({ ...current, pos_category: '' }));
    } else if (categorySuggestion && !canManageCategories) {
      setExternalLookupError('Product details selected. Choose an existing category; only an administrator can create the suggested category.');
    }
    setAcceptedExternalProduct(externalProductLookup);
  };

  const applyExternalSuggestedPrice = () => {
    const amount = Number(externalProductLookup?.suggested_price?.amount);
    if (!Number.isFinite(amount) || amount <= 0) return;
    setCreateForm((current) => ({ ...current, default_sale_price: String(amount.toFixed(2)) }));
  };

  const handleSelectEditImageFile = (files) => {
    const normalizedFiles = Array.isArray(files) ? files.filter(Boolean) : (files ? [files] : []);
    const itemId = Number(activeEditItem?.item_id || 0);
    if (normalizedFiles.length === 0 || !itemId) return;
    if (editImageUploadJob || pendingEditImageRefresh) {
      toast.info('The previous image is still being optimized. It will be replaced automatically when ready.');
      return;
    }
    const existingGalleryCount = normalizeStorefrontItemGallery(activeEditItem || {}).length;
    const remainingSlots = Math.max(0, STOREFRONT_ITEM_IMAGE_MAX_COUNT - existingGalleryCount);
    const filesToPreview = normalizedFiles.slice(0, remainingSlots);
    if (filesToPreview.length === 0) {
      setSelectedEditImageFiles([]);
      setDeferredEditImageFiles([]);
      setSelectedEditPrimaryFile(null);
      toast.error(`Only ${STOREFRONT_ITEM_IMAGE_MAX_COUNT} images are allowed per item. Remove an existing image before adding another.`);
      return;
    }
    if (normalizedFiles.length > filesToPreview.length) {
      toast.error(`Only ${remainingSlots} more item image${remainingSlots === 1 ? '' : 's'} can be selected.`);
    }

    // Preview only images that fit the remaining gallery slots. Existing
    // over-limit images stay visible and removable; never stage a sixth image.
    setSelectedEditImageFiles(filesToPreview);
    setDeferredEditImageFiles(filesToPreview);
    setSelectedEditPrimaryFile(null);
  };

  const handleRemoveSelectedEditImageFile = (imageIndex) => {
    const removedFile = selectedEditImageFiles[imageIndex];
    if (removedFile === selectedEditPrimaryFile) {
      setSelectedEditPrimaryFile(null);
    }
    setSelectedEditImageFiles((current) => current.filter((_, index) => index !== imageIndex));
    setDeferredEditImageFiles((current) => current.filter((_, index) => index !== imageIndex));
  };

  const handleSetPendingEditPrimary = (file) => {
    setSelectedEditPrimaryFile(file || null);
  };

  const handleSetSavedEditPrimary = async (imageIndex) => {
    setSelectedEditPrimaryFile(null);
    await handleSetPrimaryStorefrontImage(activeEditItem, imageIndex);
  };

  const handleRemoveSavedEditImage = async (imageIndex) => {
    await handleDeleteStorefrontImage(activeEditItem, imageIndex);
  };

  const handleSetPrimaryStorefrontImage = async (item, imageIndex) => {
    const itemId = item?.item_id;
    if (!itemId) return;
    const current = normalizeStorefrontItemGallery(item);
    const normalizedImageIndex = Number.parseInt(imageIndex, 10);
    if (!Number.isInteger(normalizedImageIndex) || normalizedImageIndex <= 0 || normalizedImageIndex >= current.length) return;
    const nextGallery = [
      current[normalizedImageIndex],
      ...current.filter((_, index) => index !== normalizedImageIndex)
    ].map((entry, index) => ({ ...entry, is_primary: index === 0, sort_order: index }));

    try {
      await updateStorefrontCatalogGallery(itemId, nextGallery);
      await loadItems();
      toast.success(`Primary item image updated for ${item.name}`);
    } catch (error) {
      toast.error(error?.response?.data?.message || 'Failed to update primary item image');
    }
  };

  const handleDeleteStorefrontImage = async (item, imageIndex = null) => {
    const itemId = item?.item_id;
    if (!itemId) return;

    try {
      const normalizedImageIndex = Number.parseInt(imageIndex, 10);
      const isSingleImageDelete = Number.isInteger(normalizedImageIndex) && normalizedImageIndex >= 0;
      if (isSingleImageDelete) {
        const currentGallery = normalizeStorefrontItemGallery(item);
        if (normalizedImageIndex >= currentGallery.length) {
          toast.error('This item image is no longer available. Reopen the item and try again.');
          return;
        }
        const nextGallery = currentGallery
          .filter((_, index) => index !== normalizedImageIndex)
          .map((entry, index) => ({ ...entry, is_primary: index === 0, sort_order: index }));
        await updateStorefrontCatalogGallery(itemId, nextGallery);
      } else {
        await deleteStorefrontCatalogImage(itemId);
      }
      await loadItems();
      toast.success(isSingleImageDelete ? `Item gallery image removed for ${item.name}` : `Item image removed for ${item.name}`);
    } catch (error) {
      toast.error(error?.response?.data?.message || 'Failed to remove item image');
    }
  };

  // The POST only confirms the item was queued, not that a photo exists yet
  // (#199/#200) — generation happens minutes later in itemImageWorker.js.
  // What used to be a fire-and-forget "queued" toast with no way to learn
  // the outcome now polls the status endpoint (itemImageStatusStore.js)
  // until the worker records a terminal result, so the operator actually
  // finds out whether the photo landed — no manual save step either way,
  // the worker attaches it directly.
  const handleGenerateEditImage = async (item) => {
    const itemId = item?.item_id;
    if (!itemId) return;

    setGeneratingEditImage(true);
    try {
      await generateStorefrontCatalogImage(itemId);
      setGeneratingEditImage(false);
      setPollingEditImage(true);

      const result = await pollItemImageGeneration(itemId);
      if (result.status === 'cancelled') return; // modal closed mid-poll — no toast for an item no longer in view
      if (result.status === 'completed') {
        await loadItems();
        notifyPosCatalogUpdated();
        toast.success(`Image generated for ${item.name}.`);
      } else if (result.status === 'failed') {
        toast.error(`Image generation failed for ${item.name}${result.error_message ? `: ${result.error_message}` : '.'}`);
      } else {
        toast.error(`Still working on ${item.name}'s image — check back in a bit.`);
      }
    } catch (error) {
      toast.error(error?.response?.data?.message || 'Failed to queue image generation');
    } finally {
      setGeneratingEditImage(false);
      setPollingEditImage(false);
    }
  };

  const runPostCreateStages = async ({
    itemId,
    itemName,
    imageFiles,
    externalProductCode = '',
    requestedBarcodeCode = '',
    posAlwaysAvailable,
    posBestSellerMode = 'auto',
    modifierGroupIds = []
  }) => {

    const failedStages = [];
    let barcodeCode = String(requestedBarcodeCode || '').trim();

    const runStage = async (key, label, action) => {
      try {
        return await action();
      } catch (error) {
        failedStages.push({
          key,
          label,
          message: getStageErrorMessage(error),
          readinessBlocked: error?.is_pos_readiness_blocked === true
        });
        return null;
      }
    };

    if (Array.isArray(imageFiles) && imageFiles.length > 0) {
      const queuedImageUpload = await runStage(
        'storefront_images',
        imageFiles.length === 1 ? 'Item image upload' : 'Item image gallery upload',
        () => (imageFiles.length === 1
          ? queueStorefrontCatalogImage(itemId, imageFiles[0])
          : queueStorefrontCatalogImages(itemId, imageFiles))
      );

      // The queue call above only confirms the upload was accepted (HTTP 202,
      // {job_id, queued: true}) -- the backend worker
      // (catalogImageUploadWorker.js) still resizes/attaches the image in the
      // background afterwards. Without waiting here, finalizeCreatedItem's
      // loadItems() below fires immediately after this function returns and
      // commonly beats the worker, so the new item renders with no image
      // until a manual refresh or a pos.catalog.changed SSE event happens to
      // land. Mirrors handleGenerateEditImage's own
      // `await pollItemImageGeneration(itemId)` above, just against the
      // upload-status endpoint instead of the generation-status one -- same
      // hook, different readStatus.
      if (queuedImageUpload) {
        const uploadStatus = await pollCatalogImageUploadStatus(itemId);
        if (uploadStatus.status === 'failed') {
          toast.warning(`Item #${itemId} was created, but its image failed to process${uploadStatus.error_message ? `: ${uploadStatus.error_message}` : '.'} Try re-uploading it from Edit Item.`);
        } else if (uploadStatus.status === 'timeout') {
          toast.warning(`Item #${itemId} was created — its image is still processing and will appear shortly.`);
        }
        // 'completed': loadItems() below will already return the image, no
        // toast needed. 'cancelled': the workspace unmounted mid-poll.
      }
    } else if (externalProductCode) {
      await runStage(
        'external_product_image',
        'Registry image import',
        () => importExternalStorefrontCatalogImage(itemId, externalProductCode)
      );
    }

    if (!barcodeCode) {
      const generatedBarcode = await runStage('barcode', 'barcode generation', () => generateItemBarcode(itemId, {
        scope: 'pos',
        packaging_level: 'unit'
      }));
      barcodeCode = String(generatedBarcode?.code || generatedBarcode?.barcode?.code || '').trim();
    }

    await runStage('storefront_visibility', 'Storefront visibility', () => updateStorefrontCatalogOverride(itemId, { storefront_visible: true }));
    await runStage('always_available', 'Always Available', () => updatePosCatalogOverride(itemId, {
      pos_always_available: posAlwaysAvailable === true
    }));
    await runStage('best_seller_mode', 'Best Seller', () => updatePosCatalogOverride(itemId, {
      pos_best_seller_mode: ['force', 'never'].includes(String(posBestSellerMode || '').toLowerCase())
        ? String(posBestSellerMode).toLowerCase()
        : 'auto'
    }));
    await runStage('pos_visibility', 'POS visibility', () => updatePosCatalogOverride(itemId, {
      pos_visible: true
    }));

    if (Array.isArray(modifierGroupIds) && modifierGroupIds.length > 0) {
      await runStage('modifier_groups', 'Menu options', () => replaceFnbItemModifierGroups(itemId, {
        modifier_groups: [...new Set(modifierGroupIds.map(Number).filter((groupId) => Number.isInteger(groupId) && groupId > 0))]
          .map((modifierGroupId, sortOrder) => ({
            modifier_group_id: modifierGroupId,
            sort_order: sortOrder,
            is_excluded: false
          }))
      }));
    }

    if (failedStages.length > 0) {
      setPendingCreateRecovery({
        itemId,
        name: itemName,
        imageFiles,
        externalProductCode,
        requestedBarcodeCode: barcodeCode,
        posAlwaysAvailable,
        posBestSellerMode,
        modifierGroupIds,
        failedStages
      });
      const labels = failedStages.map((stage) => stage.label).join(', ');
      throw new Error(`Item #${itemId} was created, but these post-create steps still need retry: ${labels}.`);
    }

    setPendingCreateRecovery(null);
    return { barcodeCode };
  };

  const handleCreateItem = async () => {
    const name = String(createForm.name || '').trim();
    const description = String(createForm.description || '').trim();
    const category = 'product';
    const price = parseMoneyValue(createForm.default_sale_price);
    const cost = parseMoneyValue(createForm.cost_per_unit);
    const stock = Number(String(createForm.current_stock || '0').trim());
    const createImageFiles = selectedCreatePrimaryFile && selectedImageFiles.includes(selectedCreatePrimaryFile)
      ? [selectedCreatePrimaryFile, ...selectedImageFiles.filter((file) => file !== selectedCreatePrimaryFile)]
      : selectedImageFiles;
    const skuCode = String(createForm.sku_code || '').trim();
    const selectedModifierGroupIds = selectedCreateModifierGroupIds;
    const typedCategoryName = String(createCategoryInput || '').trim().replace(/\s+/g, ' ');
    const foodCategory = resolveFoodCategorySelection(createForm.pos_category)
      || foodCategoryOptions.find((option) => normalizeFolderNameKey(option.name) === normalizeFolderNameKey(typedCategoryName));

    if (!name) {
      toast.error('Item name is required.');
      return;
    }
    if (!skuCode) {
      toast.error('SKU is not ready yet. Add an item name first.');
      return;
    }
    if (!Number.isFinite(price) || price <= 0) {
      toast.error('Selling price is required.');
      return;
    }
    if (!Number.isFinite(cost) || cost < 0) {
      toast.error('Cost price is required.');
      return;
    }
    if (price <= cost) {
      toast.error('Selling price must be greater than cost.');
      return;
    }
    if (!Number.isFinite(stock) || stock < 0) {
      toast.error('Stock quantity cannot be negative.');
      return;
    }

    if (!foodCategory?.folder_id && !typedCategoryName) {
      toast.error('Select an active category or enter a new category name.');
      return;
    }
    if (!foodCategory?.folder_id && !canManageCategories) {
      toast.error('Admin access is required to create a new category.');
      return;
    }

    const barcodeSelection = resolveProductBarcodeInput({ manualBarcode, gtin: externalBarcode });
    if (barcodeSelection.validationMessage) {
      setExternalLookupError(barcodeSelection.validationMessage);
      toast.error(barcodeSelection.validationMessage);
      return;
    }

    const resolvedStock = category === 'product' || category === 'supplies' ? stock : 0;
    const payload = {
      sku_code: skuCode,
      name,
      category,
      product_type: category === 'product' ? (posItemPreset.product_type || 'finished_goods') : null,
      mode_item_preset: category === 'product' ? posItemPreset.key : undefined,
      ...(foodCategory?.folder_id
        ? { product_folder: foodCategory.name, folder_id: foodCategory.folder_id }
        : { create_category_name: typedCategoryName }),
      description,
      current_stock: resolvedStock,
      location_id: Number.isInteger(Number(operatingLocationId)) && Number(operatingLocationId) > 0
        ? Number(operatingLocationId)
        : null,
      max_capacity: Math.max(resolvedStock, 1),
      min_threshold: Math.min(5, Math.max(resolvedStock, 0)),
      purchase_allowance: 0,
      unit_of_measure: category === 'product' ? (posItemPreset.default_unit || 'pcs') : 'pcs',
      cost_per_unit: cost,
      default_sale_price: price,
      fifo_enabled: category === 'product' ? posItemPreset.fifo_enabled !== false : true,
      vat_type: 'vatable',
      senior_pwd_discount_eligible: createForm.senior_pwd_discount_eligible === true,
      ...(barcodeSelection.code
        ? barcodeSelection.kind === 'manual'
          ? { internal_barcode: { code: barcodeSelection.code } }
          : { manufacturer_barcode: { code: barcodeSelection.code, scope: 'pos' } }
        : {}),
      status: 'active'
    };

    if (!isOnline) {
      if (selectedImageFiles.length > 0) {
        toast.error('Item images require an online connection. Remove the image and save this item as an offline draft.');
        return;
      }
      if (selectedModifierGroupIds.length > 0) {
        toast.error('Menu options require an online connection. Remove the selected options or reconnect before saving.');
        return;
      }
      try {
        await onQueueOfflineItemDraft({
          ...payload,
          pos_always_available: createForm.pos_always_available === true
        });
        closeCreate({ force: true });
        toast.success('Offline item draft saved. Press Sync to create it when you are online.');
      } catch (queueError) {
        toast.error(queueError?.message || 'Failed to save the offline item draft.');
      }
      return;
    }

    const finalizeCreatedItem = async ({ barcode = '', warningMessage = '', action = 'created', item = null } = {}) => {
      closeCreate({ force: true });
      await Promise.all([loadItems(), loadPosFolders()]);
      notifyPosCatalogUpdated();
      setSavedMessage({ name, barcode, action });
      onItemCreated(item);
      if (warningMessage) {
        toast.warning(warningMessage);
      }
    };

    try {
      setItemSaveInFlight(true);
      setPostCreateSaving(true);
      if (pendingCreateRecovery?.itemId) {
        const recoveryName = pendingCreateRecovery.name || name;
        const result = await runPostCreateStages({
          itemId: pendingCreateRecovery.itemId,
          itemName: recoveryName,
          imageFiles: pendingCreateRecovery.imageFiles || createImageFiles,
          externalProductCode: pendingCreateRecovery.externalProductCode || '',
          requestedBarcodeCode: pendingCreateRecovery.requestedBarcodeCode || '',
          posAlwaysAvailable: pendingCreateRecovery.posAlwaysAvailable,
          posBestSellerMode: pendingCreateRecovery.posBestSellerMode,
          modifierGroupIds: pendingCreateRecovery.modifierGroupIds || [],
        });
        await finalizeCreatedItem({
          barcode: result.barcodeCode,
          action: 'created',
          warningMessage: `Post-create setup completed for item #${pendingCreateRecovery.itemId}.`
        });
        toast.success('POS item setup resumed successfully.');
        return;
      }

      const createdItem = await createItem(payload);
      const itemId = Number(createdItem?.item_id || createdItem?.id || 0);
      if (!Number.isInteger(itemId) || itemId <= 0) {
        throw new Error('Item was created but no valid item ID was returned.');
      }

      if (foodCategory?.folder_id && Number(createdItem?.folder_id || 0) !== foodCategory.folder_id) {
        await updateItem(itemId, {
          product_folder: foodCategory.name,
          folder_id: foodCategory.folder_id
        });
      }

      const result = await runPostCreateStages({
        itemId,
        itemName: name,
        imageFiles: createImageFiles,
        externalProductCode: selectedImageFiles.length === 0 && acceptedExternalProduct?.product?.image_url
          ? acceptedExternalProduct.code
          : '',
        requestedBarcodeCode: barcodeSelection.code,
        posAlwaysAvailable: createForm.pos_always_available === true,
        posBestSellerMode: createForm.pos_best_seller_mode,
        modifierGroupIds: selectedModifierGroupIds,
      });

      await finalizeCreatedItem({ barcode: result.barcodeCode, item: createdItem });
      toast.success('POS item created.');
    } catch (createError) {
      if (pendingCreateRecovery?.itemId || /post-create steps still need retry/i.test(String(createError?.message || ''))) {
        await loadItems().catch(() => {});
        toast.warning(createError.message);
      } else {
        toast.error(createError?.response?.data?.message || createError?.message || 'Failed to create item.');
      }
    } finally {
      setPostCreateSaving(false);
      setItemSaveInFlight(false);
    }
  };

  const closeDeleteConfirm = () => {
    if (deletingItem) return;
    setDeleteConfirmItem(null);
  };

  const handleDelete = async (item = deleteConfirmItem) => {
    if (!item?.item_id) return;
    const itemName = String(item?.name || 'this item').trim();
    try {
      await deleteItem(item.item_id);
      closeDeleteConfirm();
      if (Number(editingItemId) === Number(item.item_id)) {
        closeEdit();
      }
      await loadItems();
      setDeletedItemName(itemName);
    } catch (deleteError) {
      toast.error(deleteError?.response?.data?.message || 'Failed to delete item.');
    }
  };

  const deleteConfirmImageSources = deleteConfirmItem
    ? resolvePosCatalogImageSources(deleteConfirmItem)
    : null;
  const deleteConfirmIsService = deleteConfirmItem ? isServiceCatalogItem(deleteConfirmItem) : false;
  const deleteConfirmCategory = deleteConfirmItem?.folder?.name
    || deleteConfirmItem?.product_folder
    || (deleteConfirmIsService ? 'Service' : 'Uncategorized');

  if (!canViewPos) {
    return (
      <p id={sectionId} className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-700">
        You need POS view permission to access SKUpervisor items.
      </p>
    );
  }

  return (
    <div id={sectionId} className={modalOnly ? 'hidden' : 'flex min-h-0 min-w-0 max-w-full flex-1 flex-col gap-3 overflow-hidden'}>
      <div className="shrink-0 rounded-xl border border-slate-200 bg-white p-3 shadow-none max-sm:rounded-none max-sm:border-0 max-sm:bg-transparent max-sm:p-0 max-sm:shadow-none sm:rounded-none sm:border-0 sm:bg-transparent sm:p-0 sm:shadow-none">
        <div className="relative">
          <div className="pos-items-desktop-toolbar hidden items-center gap-2 sm:flex">
            <PosSearchField
              id="pos-items-search"
              ariaLabel="Search items"
              value={searchQuery}
              onChange={(event) => setSearchQuery(event.target.value)}
              onClear={() => setSearchQuery('')}
              placeholder="Search item by Name, SKU, or Barcode"
              className="min-w-0 flex-1"
              inputClassName="h-9"
            />
            <div className="pos-items-desktop-actions flex shrink-0 flex-wrap items-center justify-end gap-2">
              <div className="hidden min-[768px]:inline-flex">
                <PosItemsViewToggle value={itemsDisplayMode} onChange={setItemsDisplayMode} />
              </div>
              <Button
                type="button"
                variant="default"
                ref={desktopFilterButtonRef}
                onClick={toggleDesktopFilters}
                className="pos-filter-trigger pos-items-primary-action h-9 rounded-lg bg-[#1A4E8D] px-3 text-[13px] text-white hover:bg-[#143F73] active:bg-[#143F73]"
                aria-expanded={showDesktopFilters}
                aria-pressed={showDesktopFilters || hasActiveItemsFilters}
                aria-controls="pos-items-desktop-filters"
                aria-label="Filter items"
                title="Filter items"
              >
                <Filter className="mr-1.5 h-3.5 w-3.5" aria-hidden="true" />
                <span className="pos-items-tablet-action-label">Filter</span>
              </Button>
              {canCreateItems ? (
                <Button
                  type="button"
                  variant="default"
                  onClick={openCreate}
                  disabled={locked || creatingItem}
                  aria-pressed={showCreateModal}
                  aria-label="Add Items"
                  title="Add Items"
                  className="pos-items-primary-action h-9 rounded-lg border-[#1A4E8D] bg-[#1A4E8D] px-3 text-[13px] text-white shadow-none hover:bg-[#143F73] active:bg-[#143F73]"
                >
                  <PackagePlus className="mr-1.5 h-3.5 w-3.5" aria-hidden="true" />
                  <span className="pos-items-tablet-action-label">Add Items</span>
                </Button>
              ) : null}
              {canImportItems ? (
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => setShowCsvImport(true)}
                  disabled={locked || !isOnline}
                  aria-pressed={showCsvImport}
                  aria-label="Import Items"
                  title={!isOnline ? 'Reconnect to import items.' : 'Import items using the IMS CSV template.'}
                  className={`pos-items-desktop-import-button h-9 rounded-lg border-[#1A4E8D] px-3 text-[13px] active:bg-[#1A4E8D] active:text-white ${showCsvImport ? 'bg-[#1A4E8D] text-white hover:bg-[#143F73]' : 'bg-white text-[#1A4E8D] hover:bg-[#1A4E8D]/5'}`}
                >
                  <Upload className="mr-1.5 h-3.5 w-3.5" />
                  <span className="pos-items-tablet-action-label">Import Items</span>
                </Button>
              ) : null}
              {canCreateItems && menuImportEntryEnabled ? (
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => setShowPdfMenuImport(true)}
                  disabled={locked}
                  aria-pressed={showPdfMenuImport}
                  aria-label={menuImportButtonLabel}
                  title={menuImportButtonLabel}
                  className={`pos-items-desktop-import-button h-9 rounded-lg border-[#1A4E8D] px-3 text-[13px] active:bg-[#1A4E8D] active:text-white ${showPdfMenuImport ? 'bg-[#1A4E8D] text-white hover:bg-[#143F73]' : 'bg-white text-[#1A4E8D] hover:bg-[#1A4E8D]/5'}`}
                >
                  <Upload className="mr-1.5 h-3.5 w-3.5" />
                  <span className="pos-items-tablet-action-label">{menuImportButtonLabel}</span>
                </Button>
              ) : null}
            </div>
          </div>

          {showDesktopFilters ? (
            <div
              id="pos-items-desktop-filters"
              role="dialog"
              aria-labelledby="pos-items-filter-title"
              className="pos-filter-surface pos-filter-surface--extended fixed z-40 hidden max-h-[min(90vh,48rem)] flex-col overflow-hidden rounded-2xl border border-slate-200 bg-white p-0 shadow-2xl shadow-slate-900/20 sm:flex"
              style={desktopFilterPosition || undefined}
            >
              <div className="pos-filter-surface-header pos-filter-surface-header--extended flex shrink-0 flex-row items-center justify-between gap-3 border-b border-slate-200 bg-white px-5 py-3.5 text-[#0F172A]">
                <div className="min-w-0 flex-1">
                  <p id="pos-items-filter-title" className="pos-filter-surface-title pos-filter-surface-title--extended truncate text-xl font-bold leading-6 tracking-tight">Filter</p>
                  <p className="mt-1 max-w-full break-words text-sm leading-5 text-slate-500">Refine your item list</p>
                </div>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  onClick={() => setShowDesktopFilters(false)}
                  aria-label="Close item filters"
                  className="grid h-10 w-10 shrink-0 place-items-center rounded-full text-slate-500 transition-colors hover:bg-slate-100 hover:text-slate-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#1A4E8D] focus-visible:ring-offset-2"
                >
                  <X className="h-4 w-4" aria-hidden="true" />
                </Button>
              </div>

              <div className="pos-filter-surface-body min-h-0 min-w-0 flex-1 overflow-x-hidden overflow-y-auto overscroll-contain px-4 py-2.5">
                <div className="grid min-w-0 gap-4">
                  <fieldset className="min-w-0">
                    <legend className="text-[13px] font-semibold text-[#334155]">Category</legend>
                    <div
                      data-testid="pos-items-filter-category-scroll"
                      className="mt-1.5 grid min-w-0 max-w-full grid-cols-4 gap-2"
                    >
                      {categoryOptions.map((option) => {
                        const isSelected = draftCategoryFilter === option;
                        const label = option === 'all' ? 'All' : (categoryOptionLabels.get(option) || option);
                        return (
                          <label
                            key={option}
                            title={label}
                            className={`pos-filter-choice inline-flex min-h-8 h-auto w-full min-w-0 cursor-pointer items-center justify-center rounded-lg border px-2 py-1 text-center text-[10px] font-extrabold leading-tight transition-colors focus-within:outline-none focus-within:ring-4 focus-within:ring-blue-100 ${isSelected
                              ? 'border-[#1A4E8D] bg-[#1A4E8D] text-white shadow-sm shadow-blue-900/15'
                              : 'border-[#8AA8CD] bg-white text-[#1A4E8D] hover:bg-blue-50'}`}
                          >
                            <input
                              type="radio"
                              name={`pos-items-category-filter-${filterRadioGroupId}`}
                              value={option}
                              checked={isSelected}
                              onChange={() => setDraftCategoryFilter(option)}
                              className="sr-only"
                            />
                            <span className="min-w-0 max-w-full whitespace-normal break-words text-center">{label}</span>
                          </label>
                        );
                      })}
                    </div>
                  </fieldset>

                  <fieldset className="min-w-0">
                    <legend className="text-[13px] font-semibold text-[#334155]">Stock</legend>
                    <div className="mt-1.5 grid min-w-0 max-w-full grid-cols-4 gap-2">
                      {desktopStockFilterOptions.map(({ value, label }) => {
                        const isSelected = draftStockFilter === value;
                        return (
                          <label
                            key={value}
                            title={label}
                            className={`pos-filter-choice inline-flex min-h-8 h-auto w-full min-w-0 cursor-pointer items-center justify-center rounded-lg border px-2 py-1 text-center text-[10px] font-extrabold leading-tight transition-colors focus-within:outline-none focus-within:ring-4 focus-within:ring-blue-100 ${isSelected
                              ? 'border-[#1A4E8D] bg-[#1A4E8D] text-white shadow-sm shadow-blue-900/15'
                              : 'border-[#8AA8CD] bg-white text-[#1A4E8D] hover:bg-blue-50'}`}
                          >
                            <input
                              type="radio"
                              name={`pos-items-stock-filter-${filterRadioGroupId}`}
                              value={value}
                              checked={isSelected}
                              onChange={() => setDraftStockFilter(value)}
                              className="sr-only"
                            />
                            <span className="min-w-0 max-w-full whitespace-normal break-words text-center">{label}</span>
                          </label>
                        );
                      })}
                    </div>
                  </fieldset>
                </div>
              </div>

              <div className="pos-filter-surface-footer flex shrink-0 items-center gap-2 border-t border-slate-200 px-4 py-2.5">
                {isServicesMode && canManageServiceCatalog ? (
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => setShowCreateServiceModal(true)}
                    disabled={locked}
                    aria-pressed={showCreateServiceModal}
                    className={`h-9 rounded-lg border-teal-600/30 px-3 text-xs active:border-teal-700 active:bg-teal-700 active:text-white ${showCreateServiceModal ? 'bg-teal-700 text-white hover:bg-teal-800' : 'bg-white text-teal-700 hover:bg-teal-50'}`}
                  >
                    <CalendarPlus className="mr-1.5 h-3.5 w-3.5" />
                    Add Service
                  </Button>
                ) : null}
                <div className="grid min-w-0 flex-1 grid-cols-2 gap-2">
                  <Button
                    type="button"
                    variant="outline"
                    onClick={resetDesktopFilters}
                    className="pos-items-reset-action h-10 min-w-0 flex-1 rounded-lg px-3 text-[13px] font-extrabold shadow-sm hover:bg-[#fff1f2] hover:text-[#9f1239]"
                  >
                    <RefreshCcw className="mr-1.5 h-3.5 w-3.5" />
                    Reset All
                  </Button>
                  <Button
                    type="button"
                    onClick={applyDesktopFilters}
                    className="h-10 min-w-0 flex-1 rounded-lg bg-[#1A4E8D] px-3 text-[13px] font-extrabold text-white shadow-lg shadow-blue-900/20 hover:bg-[#143F73]"
                  >
                    Apply Filters
                  </Button>
                </div>
              </div>
            </div>
          ) : null}
        </div>

        <div className="pos-items-mobile-controls sm:hidden">
          <div className="pos-items-mobile-toolbar">
            <div className="pos-items-mobile-search relative min-w-0">
              <PosSearchField
                id="pos-items-search-mobile"
                ariaLabel="Search items"
                value={searchQuery}
                onChange={(event) => setSearchQuery(event.target.value)}
                onClear={() => setSearchQuery('')}
                placeholder="Search"
                className="w-full"
                inputClassName="h-11 rounded-2xl border-[#1A4E8D] bg-white pl-9 pr-10 text-base text-[#0F172A] placeholder:text-slate-300 shadow-none focus:border-[#1A4E8D] focus:ring-2 focus:ring-blue-100"
              />
            </div>
            <div className="hidden min-[768px]:inline-flex">
              <PosItemsViewToggle compact value={itemsDisplayMode} onChange={setItemsDisplayMode} />
            </div>
            <button
              type="button"
              onClick={openMobileFilters}
              aria-label="Filter items"
              aria-expanded={showMobileFilters}
              aria-controls="pos-items-mobile-filter-dialog"
              aria-pressed={showMobileFilters || hasActiveItemsFilters}
              className={`pos-items-mobile-icon-button pos-items-mobile-primary-button ${showMobileFilters || hasActiveItemsFilters ? 'pos-items-mobile-icon-button--active' : ''}`}
            >
              <Filter aria-hidden="true" />
            </button>
            {canCreateItems ? (
              <button
                type="button"
                onClick={openCreate}
                disabled={locked || creatingItem}
                aria-label="Add Items"
                title="Add Items"
                className="pos-items-mobile-icon-button pos-items-mobile-primary-button"
              >
                <PackagePlus aria-hidden="true" />
              </button>
            ) : null}
            <div className="pos-items-mobile-import-actions">
              {canImportItems ? (
                <button
                  type="button"
                  onClick={() => setShowCsvImport(true)}
                  disabled={locked || !isOnline}
                  aria-label="Import Items"
                  title={!isOnline ? 'Reconnect to import items.' : 'Import items using the IMS CSV template.'}
                  className="pos-items-mobile-icon-button pos-items-mobile-import-button"
                >
                  <Upload aria-hidden="true" />
                  <span>Import Items</span>
                </button>
              ) : null}
              {canCreateItems && menuImportEntryEnabled ? (
                <button
                  type="button"
                  onClick={() => setShowPdfMenuImport(true)}
                  disabled={locked}
                  aria-label={menuImportButtonLabel}
                  aria-pressed={showPdfMenuImport}
                  title={menuImportButtonLabel}
                  className={`pos-items-mobile-icon-button pos-items-mobile-import-button ${showPdfMenuImport ? 'pos-items-mobile-icon-button--active' : ''}`}
                >
                  <Upload aria-hidden="true" />
                  <span>{menuImportButtonLabel}</span>
                </button>
              ) : null}
            </div>
          </div>

          <Dialog
            open={showMobileFilters}
            onOpenChange={(open) => !open && setShowMobileFilters(false)}
            mobileSheet
            overlayClassName="bg-black/30 backdrop-blur-none"
          >
            <DialogContent
              id="pos-items-mobile-filter-dialog"
              className="pos-filter-surface flex max-h-[min(90vh,40rem)] max-w-none flex-col overflow-hidden rounded-t-2xl border border-slate-300 bg-white p-0 shadow-[0_12px_30px_rgba(15,23,42,0.2)] dgfy-pos-history-mobile-sheet"
            >
              <DialogHeader className="pos-filter-surface-header shrink-0 flex-row items-center justify-between gap-3 border-b border-slate-200 bg-white px-5 py-3.5 text-[#0F172A]">
                <div className="min-w-0 flex-1">
                  <DialogTitle className="pos-filter-surface-title truncate text-xl font-bold leading-6 tracking-tight">Filter</DialogTitle>
                  <DialogDescription className="mt-1 text-sm leading-5 text-slate-500">Refine your item list</DialogDescription>
                </div>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  onClick={() => setShowMobileFilters(false)}
                  aria-label="Close item filters"
                  className="grid h-10 w-10 shrink-0 place-items-center rounded-full text-slate-500 transition-colors hover:bg-slate-100 hover:text-slate-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#1A4E8D] focus-visible:ring-offset-2"
                >
                  <X className="h-4 w-4" aria-hidden="true" />
                </Button>
              </DialogHeader>

              <div className="pos-filter-surface-body min-h-0 min-w-0 flex-1 overflow-x-hidden overflow-y-auto overscroll-contain px-4 py-3">
                <div className="grid min-w-0 gap-3">
                  <fieldset className="min-w-0">
                    <legend className="text-[13px] font-semibold text-[#334155]">Category</legend>
                    <div className="dgfy-pos-history-horizontal-scroll mt-1 flex min-w-0 max-w-full flex-nowrap gap-2 overflow-x-auto overscroll-x-contain scroll-smooth pb-1 touch-pan-x" role="group" aria-label="Category options">
                      {categoryOptions.map((option) => {
                        const selected = draftCategoryFilter === option;
                        const label = option === 'all' ? 'All' : (categoryOptionLabels.get(option) || option);
                        return (
                          <button
                            key={option}
                            type="button"
                            data-testid={`pos-items-mobile-filter-category-${option}`}
                            aria-pressed={selected}
                            aria-label={`Category: ${label}`}
                            title={label}
                            onClick={() => setDraftCategoryFilter(option)}
                            className={`inline-flex min-h-11 h-auto w-[6.5rem] min-w-[6.5rem] shrink-0 items-center justify-center rounded-lg border px-2 py-1 text-center text-[11px] font-extrabold leading-tight transition focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-blue-100 ${selected
                              ? 'border-[#1A4E8D] bg-[#1A4E8D] text-white shadow-sm shadow-blue-900/15'
                              : 'border-[#8AA8CD] bg-white text-[#1A4E8D] hover:bg-blue-50'}`}
                          >
                            <span className="min-w-0 max-w-full whitespace-normal break-words text-center">{label}</span>
                          </button>
                        );
                      })}
                    </div>
                  </fieldset>

                  <fieldset className="min-w-0">
                    <legend className="text-[13px] font-semibold text-[#334155]">Stock Level</legend>
                    <div className="dgfy-pos-history-horizontal-scroll mt-1 flex min-w-0 max-w-full flex-nowrap gap-2 overflow-x-auto overscroll-x-contain scroll-smooth pb-1 touch-pan-x" role="group" aria-label="Stock level options">
                      {[{ value: 'all', label: 'All' }, ...desktopStockFilterOptions].map((option) => {
                        const selected = draftStockFilter === option.value;
                        return (
                          <button
                            key={option.value}
                            type="button"
                            data-testid={`pos-items-mobile-filter-stock-${option.value}`}
                            aria-pressed={selected}
                            aria-label={`Stock level: ${option.label}`}
                            title={option.label}
                            onClick={() => setDraftStockFilter(option.value)}
                            className={`inline-flex min-h-11 h-auto w-[6.5rem] min-w-[6.5rem] shrink-0 items-center justify-center rounded-lg border px-2 py-1 text-center text-[11px] font-extrabold leading-tight transition focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-blue-100 ${selected
                              ? 'border-[#1A4E8D] bg-[#1A4E8D] text-white shadow-sm shadow-blue-900/15'
                              : 'border-[#8AA8CD] bg-white text-[#1A4E8D] hover:bg-blue-50'}`}
                          >
                            <span className="min-w-0 max-w-full whitespace-normal break-words text-center">{option.label}</span>
                          </button>
                        );
                      })}
                    </div>
                  </fieldset>
                </div>
              </div>

              <DialogFooter className="pos-filter-surface-footer shrink-0 flex-row justify-between gap-3 border-t border-slate-200 px-4 py-3">
                <Button
                  type="button"
                  variant="outline"
                  onClick={resetMobileFilters}
                  data-testid="pos-items-mobile-reset-filters"
                  className="pos-items-reset-action h-12 min-w-0 flex-1 rounded-lg text-[13px] font-extrabold shadow-sm hover:bg-[#fff1f2] hover:text-[#9f1239]"
                >
                  <RotateCcw className="mr-2 h-4 w-4" aria-hidden="true" />
                  Reset All
                </Button>
                <Button
                  type="button"
                  onClick={applyMobileFilters}
                  data-testid="pos-items-mobile-apply-filters"
                  className="h-12 min-w-0 flex-1 rounded-lg bg-[#1A4E8D] text-[13px] font-extrabold text-white shadow-lg shadow-blue-900/20 hover:bg-[#143F73]"
                >
                  <Filter className="mr-2 h-4 w-4" aria-hidden="true" />
                  Apply Filters
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>

          {isServicesMode && canManageServiceCatalog ? (
            <Button
              type="button"
              variant="outline"
              onClick={() => setShowCreateServiceModal(true)}
              disabled={locked}
              className="mt-2 h-11 w-full rounded-xl border-teal-600/30 text-teal-700 hover:bg-teal-50"
            >
              <CalendarPlus className="mr-2 h-4 w-4" />
              Add Service
            </Button>
          ) : null}
        </div>
      </div>

      <Suspense fallback={null}>
        {showPdfMenuImport && canCreateItems && menuImportBatchEnabled ? (
          <MenuImportBatchModal
            open={showPdfMenuImport}
            onClose={() => setShowPdfMenuImport(false)}
            onSuccess={() => { loadItems(); }}
          />
        ) : showPdfMenuImport && canCreateItems && pdfMenuImportEnabled ? (
          <PdfMenuImportModal
            open={showPdfMenuImport}
            onClose={() => setShowPdfMenuImport(false)}
            onSuccess={() => { loadItems(); }}
          />
        ) : null}

        {showCsvImport && canImportItems ? (
        <CSVImportModal
          open={showCsvImport}
          posItemsPresentation
          onClose={() => setShowCsvImport(false)}
          onSuccess={async () => {
            await Promise.all([loadItems(), loadPosFolders()]);
            notifyPosCatalogUpdated();
          }}
        />
        ) : null}

        {showCreateServiceModal ? (
          <PosServiceCatalogCreateModal
            open={showCreateServiceModal}
            isOnline={isOnline}
            onClose={() => setShowCreateServiceModal(false)}
            onCreated={async () => {
              await loadItems();
              notifyPosCatalogUpdated();
            }}
          />
        ) : null}

        {editingServiceItem ? (
          <PosServiceCatalogEditModal
            open={Boolean(editingServiceItem)}
            serviceItem={editingServiceItem}
            isOnline={isOnline}
            onClose={() => setEditingServiceItem(null)}
            onUpdated={async (updatedService) => {
              setEditingServiceItem(null);
              await loadItems();
              notifyPosCatalogUpdated();
              setSavedMessage({
                name: updatedService?.service?.name || updatedService?.name || editingServiceItem?.name || 'Service',
                barcode: '',
                action: 'updated'
              });
            }}
          />
        ) : null}
      </Suspense>

      {error ? (
        <p className="rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700">
          {error}
        </p>
      ) : null}

      {loading && filteredItems.length === 0 ? (
        <p className="rounded-lg border border-slate-200 bg-white px-3 py-3 text-sm text-slate-500">Loading POS-visible IMS items...</p>
      ) : filteredItems.length === 0 ? (
        <div className="rounded-xl border border-dashed border-slate-300 bg-white px-5 py-8 text-center shadow-sm shadow-slate-200/60">
          <ClipboardList className="mx-auto h-10 w-10 text-slate-300" />
          <p className="mt-3 text-base font-black text-[#0F172A]">
            {hasActiveItemsFilters ? 'No matching items' : 'No POS items found'}
          </p>
          <p className="mt-1 text-sm text-[#64748B]">
            {hasActiveItemsFilters
              ? 'Try changing your search or filters.'
              : 'Only IMS items with POS visibility enabled appear here.'}
          </p>
          {canCreateItems && !hasActiveItemsFilters && (
            <Button
              type="button"
              onClick={openCreate}
              disabled={locked || creatingItem}
              className="mt-4 h-11 rounded-lg bg-[#1A4E8D] px-5 text-white hover:bg-[#143F73]"
            >
              <Plus className="mr-2 h-4 w-4" />
              Add your first POS item
            </Button>
          )}
        </div>
      ) : (
        <div className="flex min-h-0 min-w-0 flex-1 flex-col gap-2">
          {loading && itemsLoaded.current ? (
            <p
              data-testid="pos-items-refreshing"
              role="status"
              aria-live="polite"
              className="rounded-lg border border-blue-200 bg-blue-50 px-3 py-2 text-sm font-medium text-blue-900"
            >
              Updating items… Showing previous results until the refresh finishes.
            </p>
          ) : null}
          <div
            data-testid="pos-items-results"
            data-view-mode={itemsDisplayMode}
            aria-busy={loading}
            className="pos-items-mobile-results pos-items-responsive-results dgfy-pos-scroll-region min-h-0 min-w-0 flex-1 content-start auto-rows-max overflow-y-auto overscroll-contain pr-1 touch-pan-y grid gap-2 dgfy-pos-items-catalog-results"
          >
          {presentedItems.map((presentation) => {
            const {
              item,
              isServiceItem,
              imageSources,
              previewSources,
              stockQuantity,
              profit,
              stockStatusLabel,
              stockQuantityClassName,
              stockStatusBadgeClassName,
              stockStatusDotClassName
            } = presentation;
            return (
              <div key={item.item_id} className="pos-items-grid-entry min-w-0">
                <div className="pos-items-reference-mobile-card flex flex-col gap-5 rounded-[1.25rem] border-2 border-[#CBD5E1] bg-white p-4 shadow-none md:hidden">
                    <div className="pos-items-reference-mobile-card-top grid min-w-0 grid-cols-[clamp(4.75rem,24vw,5.75rem)_minmax(0,1fr)] items-start gap-4">
                      <button
                        type="button"
                        disabled={previewSources.gallery.length === 0}
                        aria-label={previewSources.gallery.length > 0 ? `View ${item.name || 'item'} image` : undefined}
                        onClick={() => setItemImagePreview({ itemName: item.name, sellingPrice: item.default_sale_price, gallery: previewSources.gallery })}
                        className="pos-items-reference-mobile-card-image relative flex aspect-square min-w-0 items-center justify-center overflow-hidden bg-slate-100 enabled:cursor-zoom-in"
                      >
                        <ImagePlus className="h-6 w-6 text-slate-300" />
                        {imageSources.src ? (
                          <ResponsiveImage
                            sources={imageSources}
                            alt={item?.name || 'Item image'}
                            sizes="(max-width: 639px) 24vw, 150px"
                            width={288}
                            height={288}
                            className="absolute h-full w-full object-cover"
                            fallbackSrcs={[imageSources.configuredLargeSrc].filter(Boolean)}
                          />
                        ) : null}
                        <span
                          data-testid="pos-item-stock-status"
                          className={`pointer-events-none absolute left-1 top-1 z-10 inline-flex max-w-[calc(100%-0.5rem)] items-center gap-0.5 rounded-full border px-1 py-0.5 text-[8px] font-bold leading-none shadow-sm ${stockStatusBadgeClassName}`}
                        >
                          <span aria-hidden="true" className={`h-1 w-1 shrink-0 rounded-full ${stockStatusDotClassName}`} />
                          <span className="min-w-0 break-words text-center">{stockStatusLabel}</span>
                        </span>
                      </button>
                    <div className="pos-items-reference-mobile-card-summary min-w-0 self-stretch">
                      <p
                        className="pos-items-reference-mobile-card-title min-w-0 line-clamp-2 break-words font-black tracking-tight text-[#0F172A]"
                        title={item.name || 'Unnamed item'}
                      >
                        {item.name || 'Unnamed item'}
                      </p>
                      <p className="pos-items-reference-mobile-card-subtitle mt-1 break-words font-medium text-[#64748B]">
                        {isServiceItem ? 'Service catalog entry' : 'Inventory item synced from IMS'}
                      </p>
                      <div className="pos-items-reference-mobile-card-meta mt-4 flex min-w-0 flex-col gap-2">
                        <div className="flex min-w-0 items-center gap-3">
                          <ScanLine className="h-3.5 w-3.5 shrink-0 text-[#1A4E8D]" aria-hidden="true" />
                          <p className="min-w-0 break-words font-medium text-[#0F172A]">{item.sku_code || 'Not set'}</p>
                        </div>
                        <div className="flex min-w-0 items-center gap-3">
                          <ClipboardList className="h-3.5 w-3.5 shrink-0 text-[#1A4E8D]" aria-hidden="true" />
                          <p className="min-w-0 break-words font-medium text-[#0F172A]">{isServiceItem ? 'Service' : (item.folder?.name || item.product_folder || 'Uncategorized')}</p>
                        </div>
                      </div>
                    </div>
                  </div>

                  <div className="pos-items-reference-mobile-card-metrics grid grid-cols-2 grid-rows-2 overflow-hidden rounded-[1rem] border-2 border-[#CBD5E1] bg-white">
                    <div className="flex min-w-0 items-center gap-3 border-b border-[#CBD5E1] px-4 py-3">
                      <CircleDollarSign className="h-4 w-4 shrink-0 text-[#1A4E8D]" aria-hidden="true" />
                      <div className="min-w-0">
                        <p className="font-medium leading-tight text-[#64748B]">Cost (₱):</p>
                        <p className="font-black leading-tight tabular-nums text-[#1A4E8D]">{isServiceItem && item.cost_per_unit == null ? 'Not tracked' : `₱${money(item.cost_per_unit)}`}</p>
                      </div>
                    </div>
                    <div className="flex min-w-0 items-center gap-3 border-b border-l border-[#CBD5E1] px-4 py-3">
                      <ShoppingBag className="h-4 w-4 shrink-0 text-[#1A4E8D]" aria-hidden="true" />
                      <div className="min-w-0">
                        <p className="font-medium leading-tight text-[#64748B]">Stock:</p>
                        <p className={`font-black leading-tight tabular-nums ${stockQuantityClassName}`}>{isServiceItem ? '—' : stockQuantity}</p>
                        <span className="sr-only">Stock status: {stockStatusLabel}</span>
                      </div>
                    </div>
                    <div className="flex min-w-0 items-center gap-3 px-4 py-3">
                      <Receipt className="h-4 w-4 shrink-0 text-[#1A4E8D]" aria-hidden="true" />
                      <div className="min-w-0">
                        <p className="font-medium leading-tight text-[#64748B]">Price (₱):</p>
                        <p className="font-black leading-tight tabular-nums text-[#1A4E8D]">₱{money(item.default_sale_price)}</p>
                      </div>
                    </div>
                    <div className="flex min-w-0 items-center gap-3 border-l border-[#CBD5E1] px-4 py-3">
                      <BarChart3 className="h-4 w-4 shrink-0 text-[#1A4E8D]" aria-hidden="true" />
                      <div className="min-w-0">
                        <p className="font-medium leading-tight text-[#64748B]">Profit (₱):</p>
                        <p className="font-black leading-tight tabular-nums text-emerald-700">{isServiceItem && item.cost_per_unit == null ? 'Not tracked' : money(profit)}</p>
                      </div>
                    </div>
                  </div>

                  <div className="pos-items-reference-mobile-card-actions grid grid-cols-2 gap-4">
                    {(isServiceItem ? canManageServiceCatalog : canEditItems) && (
                      <Button
                        type="button"
                        variant="outline"
                        onClick={() => openEdit(item)}
                        disabled={locked || savingItem || deletingItem || creatingItem || (isServiceItem && !isOnline)}
                        className="h-14 min-w-0 rounded-xl border-2 border-[#1A4E8D] bg-white px-3 text-base font-bold text-[#1A4E8D] shadow-none hover:bg-[#1A4E8D]/5"
                        title={`Edit ${item.name || 'item'}`}
                      >
                        <Pencil className="mr-1 h-3.5 w-3.5" />
                        Edit Item
                      </Button>
                    )}
                    {canDeleteItems && (
                      <Button
                        type="button"
                        variant="outline"
                        onClick={() => setDeleteConfirmItem(item)}
                        disabled={locked || savingItem || deletingItem || creatingItem}
                        className="h-14 min-w-0 rounded-xl border-2 border-rose-600 bg-white px-3 text-base font-bold text-rose-600 shadow-none hover:bg-rose-50"
                        title={`Delete ${item.name || 'item'}`}
                      >
                        <Trash2 className="mr-1 h-3.5 w-3.5" />
                        Delete
                      </Button>
                    )}
                  </div>
                </div>

              <PosItemResponsiveCard
                item={item}
                isServiceItem={isServiceItem}
                imageSources={imageSources}
                imageGallery={previewSources.gallery}
                stock={{
                  quantity: stockQuantity,
                  quantityClassName: stockQuantityClassName,
                  statusLabel: stockStatusLabel,
                  badgeClassName: stockStatusBadgeClassName,
                  dotClassName: stockStatusDotClassName
                }}
                profit={profit}
                formatMoney={money}
                permissions={{
                  canDelete: canDeleteItems,
                  canEdit: isServiceItem ? canManageServiceCatalog : canEditItems
                }}
                disabledActions={{
                  delete: locked || savingItem || deletingItem || creatingItem,
                  edit: locked || savingItem || deletingItem || creatingItem || (isServiceItem && !isOnline)
                }}
                onDelete={() => setDeleteConfirmItem(item)}
                onEdit={() => openEdit(item)}
                onImagePreview={() => setItemImagePreview({ itemName: item.name, sellingPrice: item.default_sale_price, gallery: previewSources.gallery })}
              />
              </div>
            );
          })}
          <PosItemsListView
            items={presentedItems}
            formatMoney={money}
            permissions={{
              canDelete: canDeleteItems,
              canEdit: canEditItems,
              canManageServiceCatalog
            }}
            disabledActions={{
              delete: locked || savingItem || deletingItem || creatingItem,
              edit: locked || savingItem || deletingItem || creatingItem,
              serviceEdit: !isOnline
            }}
            onDelete={setDeleteConfirmItem}
            onEdit={openEdit}
            onImagePreview={(presentation) => setItemImagePreview({
              itemName: presentation.item.name,
              sellingPrice: presentation.item.default_sale_price,
              gallery: presentation.previewSources.gallery
            })}
          />
          </div>

          <GlobalPagination
            testId="pos-items-pagination"
            ariaLabel="POS item catalog pagination"
            currentPage={currentItemsPage}
            totalPages={totalItemsPages}
            totalItems={itemsTotal}
            pageSize={itemsPageSize}
            pageSizeOptions={POS_ITEMS_PAGE_SIZE_OPTIONS}
            hidePageSizeSuffixOnMobile
            itemLabel="entries"
            loading={loading}
            onPageChange={setItemsPage}
            onPageSizeChange={(nextPageSize) => {
              if (!Number.isInteger(nextPageSize) || nextPageSize <= 0) return;
              setItemsPageSize(nextPageSize);
              setItemsPage(1);
            }}
            accentColor="#1A4E8D"
            className={`${POS_PAGINATION_FOOTER_CLASS} mt-auto`}
          />
        </div>
      )}

      {showCreateModal && typeof document !== 'undefined' && createPortal((
        <div
          className="pos-items-modal-overlay pos-mobile-no-focus-zoom fixed inset-0 z-[9999] flex items-start justify-center overflow-hidden bg-slate-700/30 px-3 py-3 backdrop-blur-[2px] sm:items-center sm:px-4 sm:py-3"
          role="dialog"
          aria-modal="true"
          aria-labelledby="pos-items-create-modal-title"
          onClick={closeCreate}
        >
          <div
            className="pos-items-modal-panel pos-items-catalog-form-modal pos-items-mobile-sheet-panel pos-items-form-scale relative flex h-[calc(100dvh-1.5rem)] w-full max-w-[54rem] flex-col overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-2xl shadow-slate-900/20 sm:h-auto sm:max-h-[calc(100dvh-1.5rem)]"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="-mx-px -mt-px flex shrink-0 items-center justify-between gap-3 rounded-t-[17px] border-b border-[#143F73] bg-[#1A4E8D] px-4 py-2.5 sm:px-5">
              <div className="flex min-w-0 items-center gap-2.5">
                <div className="grid h-8 w-8 shrink-0 place-items-center rounded-lg bg-white text-[#1A4E8D] shadow-sm ring-1 ring-[#C7DCF3]">
                  <Package className="h-4 w-4" aria-hidden="true" />
                </div>
                <div className="min-w-0">
                  <h2 id="pos-items-create-modal-title" className="text-sm font-black text-white">
                    Product Details
                  </h2>
                  <p className="mt-0.5 max-w-full break-words text-[10px] leading-3 text-blue-100">Edit or configure POS catalog item &amp; storefront sync</p>
                </div>
              </div>
              <button
                type="button"
                onClick={closeCreate}
                disabled={creatingItem || postCreateSaving}
                aria-label="Close Add Item"
                className="grid h-8 w-8 place-items-center rounded-lg text-blue-100 transition-colors hover:bg-white/15 hover:text-white focus-visible:outline-none focus:ring-2 focus:ring-white focus:ring-offset-2 focus:ring-offset-[#1A4E8D]"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            </div>

            <div className="pos-items-modal-body pos-items-modal-scroll-region min-h-0 flex-1 overflow-y-auto bg-white px-4 pb-5 sm:px-5 sm:pb-6">
              <section className="mt-4 space-y-3 rounded-xl border border-[#C7DCF3] bg-[#EEF5FF] p-3" aria-labelledby="pos-external-barcode-heading">
                <div className="space-y-1.5">
                  <h3 id="pos-external-barcode-heading" className="whitespace-nowrap text-[11px] font-black text-[#0F172A]">Product Barcode</h3>
                  <p className="min-w-0 text-left text-[10px] leading-3 text-[#64748B] sm:whitespace-nowrap">Manual barcode takes priority. Otherwise a valid GTIN is used; a code is generated only when both fields are empty.</p>
                </div>
                <div className="grid gap-2 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.4fr)]">
                  <div className="space-y-1">
                    <Label htmlFor="pos-create-manual-barcode" className="text-[10px] font-semibold uppercase tracking-wide text-[#64748B]">Manual Barcode <span className="normal-case tracking-normal">(optional)</span></Label>
                    <Input
                      id="pos-create-manual-barcode"
                      value={manualBarcode}
                      onChange={(event) => setManualBarcode(normalizeBarcodeEntry(event.target.value))}
                      inputMode="text"
                      autoCapitalize="characters"
                      spellCheck={false}
                      autoComplete="off"
                      placeholder="Enter Company Supplier or Company Barcode"
                      disabled={externalLookupLoading || creatingItem || postCreateSaving}
                      className="h-8 rounded-lg border-slate-300 bg-white text-[10px] placeholder:text-slate-300"
                    />
                  </div>
                  <div className="space-y-1">
                    <Label htmlFor="pos-create-gtin" className="text-[10px] font-semibold uppercase tracking-wide text-[#64748B]">GTIN / UPC / EAN <span className="normal-case tracking-normal">(optional)</span></Label>
                    <div className="flex gap-2">
                      <div className="relative min-w-0 flex-1">
                        <Input
                          id="pos-create-gtin"
                          value={externalBarcode}
                          onChange={(event) => handleExternalBarcodeChange(event.target.value)}
                          onKeyDown={(event) => {
                            if (event.key === 'Enter') {
                              event.preventDefault();
                              handleExternalProductLookup();
                            }
                          }}
                          inputMode="text"
                          autoCapitalize="characters"
                          spellCheck={false}
                          autoComplete="off"
                          placeholder="Scan or enter GTIN/UPC/EAN"
                          aria-label="Product GTIN"
                          disabled={externalLookupLoading || creatingItem || postCreateSaving}
                          className="h-8 rounded-lg border-slate-300 bg-white text-[10px] placeholder:text-slate-300"
                        />
                      </div>
                      <Button
                        type="button"
                        variant="outline"
                        aria-label="Look up GTIN"
                        title="Look up GTIN"
                        className="h-8 w-20 shrink-0 justify-center rounded-lg border-slate-300 bg-white px-2 text-[10px] text-[#1A4E8D]"
                        onClick={handleExternalProductLookup}
                        disabled={externalLookupLoading || creatingItem || postCreateSaving || !externalBarcode}
                      >
                        <Search className="mr-1.5 h-3 w-3" aria-hidden="true" />
                        {externalLookupLoading ? 'Looking up…' : 'Look up'}
                      </Button>
                      <Button
                        type="button"
                        variant="outline"
                        className="h-8 w-20 shrink-0 justify-center rounded-lg border-slate-300 bg-white px-2 text-[10px] text-[#1A4E8D]"
                        onClick={() => setExternalQrScannerOpen(true)}
                        disabled={externalLookupLoading || creatingItem || postCreateSaving}
                      >
                        <ScanLine className="mr-1.5 h-3 w-3" aria-hidden="true" />
                        Scan
                      </Button>
                    </div>
                  </div>
                </div>
                {externalLookupLoading ? <p className="text-xs text-[#1A4E8D]" role="status">Looking up product details…</p> : null}
                {externalLookupError ? <p className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800" role="status">{externalLookupError}</p> : null}
                {manualBarcode ? <p className="rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-xs text-emerald-900" role="status">Manual barcode selected. The GTIN remains available for product lookup, but the manual code will be saved as the primary POS barcode.</p> : null}
                {externalProductLookup?.found ? (
                  <div className="rounded-xl border border-blue-200 bg-white p-3">
                    <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
                      {externalProductLookup.product?.image_url ? <img src={externalProductLookup.product.image_url} alt="External product preview" className="h-16 w-16 shrink-0 rounded-lg border border-slate-200 object-contain" loading="lazy" referrerPolicy="no-referrer" /> : null}
                      <div className="min-w-0 flex-1">
                        <p className="font-semibold text-slate-900">{externalProductLookup.product?.name || 'Unnamed registry product'}</p>
                        {externalProductLookup.product?.brand ? <p className="text-xs text-slate-600">Brand: {externalProductLookup.product.brand}</p> : null}
                        {externalProductLookup.product?.category_suggestion ? <p className="text-xs text-slate-600">Category suggestion: {externalProductLookup.product.category_suggestion}</p> : null}
                        <p className="mt-1 text-xs text-amber-700">Review before saving. Details are applied only after you select Use product details.</p>
                        {externalProductLookup.suggested_price ? (
                          <div className="mt-2 rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-xs text-emerald-900">
                            <p className="font-semibold">
                              Suggested selling price: PHP {Number(externalProductLookup.suggested_price.amount).toFixed(2)}
                            </p>
                            <p>
                              {externalProductLookup.suggested_price.label} from Open Prices
                              {externalProductLookup.suggested_price.location ? ` at ${externalProductLookup.suggested_price.location}` : ''}
                              {externalProductLookup.suggested_price.observed_at ? ` on ${externalProductLookup.suggested_price.observed_at}` : ''}.
                            </p>
                            <p className="mt-1 text-emerald-800">{externalProductLookup.suggested_price.disclaimer}</p>
                          </div>
                        ) : null}
                      </div>
                      <div className="flex shrink-0 flex-wrap gap-2">
                        <Button type="button" size="sm" onClick={applyExternalProductDetails} disabled={acceptedExternalProduct?.code === externalProductLookup.code}>
                          {acceptedExternalProduct?.code === externalProductLookup.code ? <Check className="mr-2 h-4 w-4" /> : null}
                          {acceptedExternalProduct?.code === externalProductLookup.code ? 'Details selected' : 'Use product details'}
                        </Button>
                        {externalProductLookup.suggested_price ? <Button type="button" size="sm" variant="outline" onClick={applyExternalSuggestedPrice} disabled={Number(createForm.default_sale_price) === Number(externalProductLookup.suggested_price.amount)}>{Number(createForm.default_sale_price) === Number(externalProductLookup.suggested_price.amount) ? 'Price selected' : 'Use suggested price'}</Button> : null}
                      </div>
                    </div>
                  </div>
                ) : null}
              </section>

              <div className="pos-items-status-grid mt-4 grid gap-3 md:grid-cols-3">
                <div className="flex min-w-0 items-start justify-between gap-2 rounded-lg border border-slate-200 bg-slate-50/40 px-2.5 py-2">
                  <div className="flex min-w-0 items-start gap-2">
                    <div className="grid h-6 w-6 shrink-0 place-items-center rounded-md bg-emerald-50 text-emerald-600"><Check className="h-3.5 w-3.5" aria-hidden="true" /></div>
                    <div className="flex min-h-9 min-w-0 flex-1 flex-col justify-center"><label htmlFor="pos-items-create-always-available" className="block break-words text-[10px] font-black text-[#0F172A]">Always Available</label><span className="mt-0.5 block break-words text-[10px] text-[#94A3B8]">Allow POS sales at zero stock.</span></div>
                  </div>
                  <Switch id="pos-items-create-always-available" checked={createForm.pos_always_available === true} onCheckedChange={(checked) => setCreateForm((current) => ({ ...current, pos_always_available: Boolean(checked) }))} disabled={creatingItem || postCreateSaving} className={getPosItemStatusSwitchClass(createForm.pos_always_available === true)} />
                </div>
                <div className="flex min-w-0 items-start justify-between gap-2 rounded-lg border border-slate-200 bg-slate-50/40 px-2.5 py-2">
                  <div className="flex min-w-0 items-start gap-2">
                    <div className="grid h-6 w-6 shrink-0 place-items-center rounded-md bg-amber-50 text-amber-600"><Star className="h-3.5 w-3.5" aria-hidden="true" /></div>
                    <div className="flex min-h-9 min-w-0 flex-1 flex-col justify-center"><label htmlFor="pos-items-create-best-seller-mode" className="block break-words text-[10px] font-black text-[#0F172A]">Best Seller</label><span className="mt-0.5 block break-words text-[10px] text-[#94A3B8]">Manually tag this item as a Best Seller.</span></div>
                  </div>
                  <Switch id="pos-items-create-best-seller-mode" checked={createForm.pos_best_seller_mode === 'force'} onCheckedChange={(checked) => setCreateForm((current) => ({ ...current, pos_best_seller_mode: checked ? 'force' : 'never' }))} disabled={creatingItem || postCreateSaving} className={getPosItemStatusSwitchClass(createForm.pos_best_seller_mode === 'force')} />
                </div>
                <div className="flex min-w-0 items-start justify-between gap-2 rounded-lg border border-slate-200 bg-slate-50/40 px-2.5 py-2">
                  <div className="flex min-w-0 items-start gap-2">
                    <div className="grid h-6 w-6 shrink-0 place-items-center rounded-md bg-indigo-50 text-indigo-500"><UserRound className="h-3.5 w-3.5" aria-hidden="true" /></div>
                    <div className="flex min-h-9 min-w-0 flex-1 flex-col justify-center"><label htmlFor="pos-items-create-senior-pwd" className="block break-words text-[10px] font-black text-[#0F172A]">Senior/PWD Eligible</label><span className="mt-0.5 block break-words text-[10px] text-[#94A3B8]">Allow statutory discount selection.</span></div>
                  </div>
                  <Switch id="pos-items-create-senior-pwd" aria-checked={createForm.senior_pwd_discount_eligible} checked={createForm.senior_pwd_discount_eligible === true} onCheckedChange={(checked) => setCreateForm((current) => ({ ...current, senior_pwd_discount_eligible: Boolean(checked) }))} disabled={creatingItem || postCreateSaving} className={getPosItemStatusSwitchClass(createForm.senior_pwd_discount_eligible === true)} />
                </div>
              </div>

              <div className="pos-items-form-columns mt-5 grid min-w-0 gap-4 xl:grid-cols-[12rem_minmax(0,1fr)_12rem]">
                <div className="space-y-3">
                  <div className="flex min-h-5 items-center justify-between gap-2">
                    <div className="flex min-w-0 items-center gap-1">
                      <label className="pos-items-modal-label block">Product Images</label>
                      <StorefrontSectionInfo label="Product Images" panelId="pos-items-create-product-image-info" portal>
                        <p>The same images will be used for POS and storefront visibility.</p>
                      </StorefrontSectionInfo>
                    </div>
                    <span className="shrink-0 text-[10px] font-semibold text-[#94A3B8]">
                      {selectedImageFiles.length} / {STOREFRONT_ITEM_IMAGE_MAX_COUNT}
                    </span>
                  </div>

                  <input
                    id="pos-item-image"
                    type="file"
                    accept="image/*"
                    multiple
                    className="hidden"
                    disabled={creatingItem || postCreateSaving}
                    onChange={(event) => {
                      const files = Array.from(event.target.files || []);
                      if (files.length) {
                        handleSelectCreateImageFiles(files);
                      }
                      event.target.value = '';
                    }}
                  />

                  {selectedImageFiles.length > 0 ? (
                    <>
                      <SelectedItemImageCarousel
                        files={selectedImageFiles}
                        itemName={createForm.name || 'Item'}
                        disabled={creatingItem || postCreateSaving}
                        posItemsPresentation
                        showPrimaryToggle
                        editItemPresentation
                        maxVisibleThumbnails={4}
                        onRemove={removeSelectedCreateImageFile}
                        onSetPendingPrimary={handleSetPendingCreatePrimary}
                      />
                      <label
                        htmlFor="pos-item-image"
                        className={`flex h-9 cursor-pointer items-center justify-center gap-2 rounded-lg border border-[#1A4E8D] bg-white px-3 text-[10px] font-bold text-[#1A4E8D] transition-colors hover:bg-blue-50/60 ${(creatingItem || postCreateSaving) ? 'cursor-not-allowed opacity-50' : ''}`}
                      >
                        <Upload className="h-4 w-4" aria-hidden="true" />
                        Upload New Image
                      </label>
                      <p className="text-[10px] leading-3 text-[#94A3B8]">JPG, PNG or WEBP (large files optimized by server)</p>
                    </>
                  ) : (
                    <label
                      htmlFor="pos-item-image"
                      className={`pos-items-image-upload-dropzone flex min-h-[10rem] cursor-pointer flex-col items-center justify-center rounded-lg border border-dashed border-[#1A4E8D]/45 bg-[#F5F8FC] p-3 text-center transition-colors hover:bg-blue-50/60 ${(creatingItem || postCreateSaving) ? 'cursor-not-allowed opacity-50' : ''}`}
                    >
                      <div className="grid h-7 w-7 place-items-center rounded-full bg-blue-50 text-[#1A4E8D]"><Upload className="h-3.5 w-3.5" aria-hidden="true" /></div>
                      <p className="mt-2 text-[10px] font-black text-[#64748B]">Add Item Images</p>
                      <p className="mt-0.5 text-[10px] font-medium leading-3 text-[#64748B]">JPG, PNG or WEBP (large files optimized by server)</p>
                      <p className="mt-1.5 text-[10px] leading-3 text-[#94A3B8]">
                        Up to 5 images per item. Choose a primary image after uploading.
                      </p>
                    </label>
                  )}
                  {selectedImageFiles.length === 0 && acceptedExternalProduct?.product?.image_url ? (
                    <div className="rounded-xl border border-emerald-200 bg-emerald-50 px-3 py-2 text-xs text-emerald-800">
                      The accepted registry image will be optimized and saved to DGFY storage when this item is created.
                    </div>
                  ) : null}
                </div>

                <div ref={createItemDetailsRef} className="min-w-0 space-y-3">
                  {pendingCreateRecovery?.itemId ? (
                    <div className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-[10px] text-amber-800">
                      <p className="font-bold">Item #{pendingCreateRecovery.itemId} was created. Resume setup retries only unfinished post-create stages and will not create a duplicate item.</p>
                      {Array.isArray(pendingCreateRecovery.failedStages) && pendingCreateRecovery.failedStages.length > 0 ? (
                        <ul className="mt-2 list-disc space-y-1 pl-5">
                          {pendingCreateRecovery.failedStages.map((stage) => (
                            <li key={stage.key}>{stage.label}: {stage.message}</li>
                          ))}
                        </ul>
                      ) : null}
                    </div>
                  ) : null}

                  <div className="grid gap-2.5 sm:grid-cols-2">
                    {/* Item Name */}
                    <div className="space-y-1 sm:col-span-2">
                      <label className="pos-items-modal-label block">
                        Item Name <span className="text-rose-500">*</span>
                      </label>
                      <Input
                        value={createForm.name}
                        onChange={(event) => setCreateForm((current) => ({ ...current, name: event.target.value }))}
                        className="pos-items-modal-field font-medium"
                        disabled={creatingItem || postCreateSaving}
                        placeholder="Classic Milk Tea"
                      />
                    </div>

                    {/* Workflow-aware category */}
                    <div className="space-y-1">
                      <div className="flex items-center gap-1">
                        <label className="pos-items-modal-label block">
                          {itemWorkspacePresentation.categoryLabel} <span className="text-rose-500">*</span>
                        </label>
                        <StorefrontSectionInfo label={itemWorkspacePresentation.categoryLabel} panelId="pos-items-create-category-info" portal>
                          <p>{canManageCategories
                            ? 'Select an existing category, or enter a new name to create it when this item is saved.'
                            : 'Only an administrator can create categories.'}</p>
                        </StorefrontSectionInfo>
                      </div>
                      {canManageCategories ? (
                        <>
                          <EditableFoodCategoryCombobox
                            id="pos-items-create-category"
                            value={createCategoryInput}
                            onChange={(nextValue) => {
                              const matchedCategory = foodCategoryOptions.find((option) => (
                                normalizeFolderNameKey(option.name) === normalizeFolderNameKey(nextValue)
                              ));
                              setCreateCategoryInput(nextValue);
                              setCreateForm((current) => ({
                                ...current,
                                pos_category: matchedCategory?.value || ''
                              }));
                            }}
                            onSelect={(option) => {
                              setCreateCategoryInput(option.name);
                              setCreateForm((current) => ({ ...current, pos_category: option.value }));
                            }}
                            options={foodCategoryOptions}
                            compact
                            disabled={creatingItem || postCreateSaving}
                          />
                        </>
                      ) : (
                        <>
                          <PosFnbSelect
                            id="pos-items-create-category-fallback"
                            value={createForm.pos_category}
                            options={foodCategoryOptions}
                            onChange={(event) => setCreateForm((current) => ({ ...current, pos_category: event.target.value }))}
                            placeholder="Select an active category"
                            aria-label={itemWorkspacePresentation.categoryLabel}
                            className="pos-items-catalog-select pos-items-modal-field px-2.5 font-medium text-[#0F172A]"
                            menuClassName="pos-items-catalog-select-menu"
                            disabled={creatingItem || postCreateSaving}
                          />
                        </>
                      )}
                    </div>

                    {/* Stock Quantity */}
                    <div className="space-y-1">
                      <label className="pos-items-modal-label block">
                        Stock Quantity <span className="text-rose-500">*</span>
                      </label>
                      <div className="relative">
                        <span className="pointer-events-none absolute left-2 top-1/2 flex h-5 w-5 -translate-y-1/2 items-center justify-center rounded bg-blue-50 text-[#1A4E8D]">
                          <Package className="h-3.5 w-3.5" aria-hidden="true" />
                        </span>
                        <Input
                          type="number"
                          min="0"
                          step="1"
                          value={createForm.current_stock}
                          onChange={(event) => setCreateForm((current) => ({ ...current, current_stock: event.target.value }))}
                          className="pos-items-modal-field pl-8 font-medium"
                          disabled={creatingItem || postCreateSaving}
                        />
                      </div>
                    </div>

                    {/* Selling Price */}
                    <div className="space-y-1">
                      <label className="pos-items-modal-label block">
                        Selling Price <span className="text-rose-500">*</span>
                      </label>
                      <div className="relative">
                        <span className="pos-items-modal-currency-prefix pointer-events-none absolute top-1/2 -translate-y-1/2">₱</span>
                        <Input
                          type="number"
                          min="0"
                          step="0.01"
                          value={createForm.default_sale_price}
                          onChange={(event) => setCreateForm((current) => ({ ...current, default_sale_price: event.target.value }))}
                          className="pos-items-modal-field pl-6 font-medium"
                          disabled={creatingItem || postCreateSaving}
                        />
                      </div>
                    </div>

                    {/* Cost Price */}
                    <div className="space-y-1">
                      <label className="pos-items-modal-label block">
                        Cost Price <span className="text-rose-500">*</span>
                      </label>
                      <div className="relative">
                        <span className="pos-items-modal-currency-prefix pointer-events-none absolute top-1/2 -translate-y-1/2">₱</span>
                        <Input
                          type="number"
                          min="0"
                          step="0.01"
                          value={createForm.cost_per_unit}
                          onChange={(event) => setCreateForm((current) => ({ ...current, cost_per_unit: event.target.value }))}
                          className="pos-items-modal-field pl-6 font-medium"
                          disabled={creatingItem || postCreateSaving}
                        />
                      </div>
                    </div>

                    {/* SKU (POS Rule) */}
                    <div className="space-y-1 sm:col-span-2">
                      <label className="pos-items-modal-label block">SKU (POS Rule)</label>
                      <Input
                        value={createForm.sku_code}
                        className="pos-items-modal-field bg-slate-50 font-mono text-slate-500"
                        disabled
                        readOnly
                      />
                    </div>

                    {/* Description / notes */}
                    <div className="space-y-1 sm:col-span-2">
                      <div className="flex items-center justify-between gap-2">
                        <label className="pos-items-modal-label block min-w-0">Description / Notes</label>
                        <span className="shrink-0 text-[10px] font-medium text-slate-400">
                          {String(createForm.description || '').length} / 500
                        </span>
                      </div>
                      <textarea
                        ref={createDescriptionRef}
                        value={createForm.description}
                        onChange={(event) => setCreateForm((current) => ({ ...current, description: event.target.value.slice(0, 500) }))}
                        className="pos-items-modal-field pos-items-modal-textarea w-full bg-white px-2.5 py-2 text-[#0F172A] shadow-sm outline-none"
                        disabled={creatingItem || postCreateSaving}
                        placeholder="Optional notes for the POS item record"
                      />
                    </div>
                  </div>
                </div>

                  <section
                    className="pos-items-modal-secondary-panel pos-items-create-options-panel min-w-0"
                    style={createItemDetailsHeight ? { '--pos-items-create-options-max-height': `${createItemDetailsHeight}px` } : undefined}
                    aria-labelledby="pos-items-create-options-heading"
                  >
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex min-w-0 items-center gap-1">
                      <h3 id="pos-items-create-options-heading" className="pos-items-modal-section-title">Add Options</h3>
                      <StorefrontSectionInfo label="Add Options" panelId="pos-items-create-options-info" portal>
                        <p>Choose from configured menu options.</p>
                      </StorefrontSectionInfo>
                    </div>
                    {selectedCreateModifierGroupIds.length > 0 ? <span className="shrink-0 rounded-full bg-blue-50 px-2 py-1 text-[10px] font-bold text-[#1A4E8D]">{selectedCreateModifierGroupIds.length} group{selectedCreateModifierGroupIds.length === 1 ? '' : 's'}</span> : null}
                  </div>
                    <div className="relative mt-2">
                    <PosSearchField
                      value={createOptionSearch}
                      ariaLabel="Search item options"
                      onChange={(event) => setCreateOptionSearch(event.target.value)}
                      onClear={() => setCreateOptionSearch('')}
                      placeholder="Search Options"
                      disabled={!canManageFnbModifiers || !isFnbMode || createModifierGroupsLoading || creatingItem || postCreateSaving}
                      inputClassName="h-8 rounded-lg text-[10px] placeholder:text-slate-300"
                    />
                  </div>
                  <div data-testid="pos-items-create-options-list" className="pos-items-modal-option-list pos-items-modal-scrollbar mt-2 min-h-0 space-y-1.5 overflow-y-auto pr-1">
                    {createModifierGroupsLoading ? <p className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-4 text-center text-xs text-slate-500" role="status">Loading options…</p> : null}
                    {!createModifierGroupsLoading && createModifierGroupsError ? <p className="rounded-lg border border-amber-200 bg-amber-50 px-2 py-3 text-[10px] text-amber-800" role="alert">{createModifierGroupsError}</p> : null}
                    {!createModifierGroupsLoading && !createModifierGroupsError && !canManageFnbModifiers ? <p className="rounded-lg border border-slate-200 bg-slate-50 px-2 py-3 text-[10px] text-slate-500">Menu options are managed from the Item Options &amp; Modifiers workspace.</p> : null}
                    {!createModifierGroupsLoading && !createModifierGroupsError && canManageFnbModifiers && !isFnbMode ? <p className="rounded-lg border border-slate-200 bg-slate-50 px-2 py-3 text-[10px] text-slate-500">Menu options are available in F&amp;B mode.</p> : null}
                    {!createModifierGroupsLoading && !createModifierGroupsError && canManageFnbModifiers && isFnbMode && modifierOptionRows.length === 0 ? <p className="rounded-lg border border-slate-200 bg-slate-50 px-2 py-3 text-center text-[10px] text-slate-500">No configured options match this search.</p> : null}
                    {!createModifierGroupsLoading && !createModifierGroupsError && canManageFnbModifiers && isFnbMode && modifierOptionRows.map((option) => {
                      const checked = selectedCreateModifierOptionKeys.includes(option.key);
                      return (
                        <label key={option.key} className="pos-items-modal-option-row flex min-w-0 cursor-pointer items-center gap-2 transition-colors hover:bg-blue-50/50">
                          <input
                            type="checkbox"
                            checked={checked}
                            onChange={(event) => setSelectedCreateModifierOptionKeys((current) => (
                              event.target.checked
                                ? [...new Set([...current, option.key])]
                                : current.filter((key) => key !== option.key)
                            ))}
                            disabled={creatingItem || postCreateSaving}
                            className="pos-items-modal-checkbox shrink-0"
                          />
                          <span className="min-w-0 flex-1 truncate text-[10px] font-black text-[#0F172A]" title={option.groupName ? `${option.groupName}: ${option.name}` : option.name}>{option.name}</span>
                          <span className="shrink-0 text-[10px] font-black text-[#64748B]">₱{option.price.toFixed(2)}</span>
                        </label>
                      );
                    })}
                  </div>
                </section>
              </div>
            </div>

            {/* Footer */}
            <div className="pos-items-modal-footer grid shrink-0 grid-cols-1 gap-2 border-t border-slate-200 bg-white px-4 py-2 sm:px-5">
              <div className="pos-items-modal-footer-actions grid min-w-0 grid-cols-2 gap-2">
                <Button
                  type="button"
                  variant="outline"
                  onClick={closeCreate}
                  disabled={creatingItem || postCreateSaving}
                  className="h-10 min-w-0 w-full rounded-lg border-[#1A4E8D] px-2 text-[11px] font-bold text-[#1A4E8D] hover:bg-blue-50"
                >
                  Cancel
                </Button>
                <Button
                  type="button"
                  onClick={handleCreateItem}
                  disabled={creatingItem || postCreateSaving || locked}
                  className="flex h-10 min-w-0 w-full items-center justify-center gap-1.5 rounded-lg bg-[#1A4E8D] px-2 text-[11px] font-bold text-white transition-colors hover:bg-[#143F73]"
                >
                  <Save className="h-3.5 w-3.5" />
                  {creatingItem || postCreateSaving ? 'Saving…' : (pendingCreateRecovery?.itemId ? 'Resume Item Setup' : 'Save Item')}
                </Button>
              </div>
            </div>
          </div>
        </div>
      ), document.body)}

      {externalQrScannerOpen ? (
        <Suspense fallback={null}>
          <ProductQrScannerModal
            open={externalQrScannerOpen}
            onOpenChange={setExternalQrScannerOpen}
            onDetected={handleExternalQrDetected}
          />
        </Suspense>
      ) : null}

      {itemImagePreview ? (
        <Suspense fallback={null}>
          <PosItemImageViewer preview={itemImagePreview} onClose={() => setItemImagePreview(null)} />
        </Suspense>
      ) : null}

      {activeEditItem && typeof document !== 'undefined' && createPortal((
        <div
          className="pos-items-modal-overlay pos-mobile-no-focus-zoom fixed inset-0 z-[9999] flex items-start justify-center overflow-hidden bg-slate-700/30 px-3 py-3 backdrop-blur-[2px] sm:items-center sm:px-4 sm:py-3"
          role="dialog"
          aria-modal="true"
          aria-labelledby="pos-items-edit-modal-title"
          onClick={closeEdit}
        >
          <div
            className="pos-items-modal-panel pos-items-catalog-form-modal pos-items-mobile-sheet-panel pos-items-form-scale relative flex h-[calc(100dvh-1.5rem)] w-full max-w-[54rem] flex-col overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-2xl shadow-slate-900/20 sm:h-auto sm:max-h-[calc(100dvh-1.5rem)]"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="-mx-px -mt-px flex shrink-0 items-center justify-between gap-3 rounded-t-[17px] border-b border-[#143F73] bg-[#1A4E8D] px-4 py-2.5 sm:px-5">
              <div className="flex min-w-0 items-center gap-2.5">
                <div className="grid h-8 w-8 shrink-0 place-items-center rounded-lg bg-white text-[#1A4E8D] shadow-sm ring-1 ring-[#C7DCF3]">
                  <Package className="h-4 w-4" aria-hidden="true" />
                </div>
                <div className="min-w-0">
                  <p id="pos-items-edit-modal-title" className="text-sm font-black text-white">Edit Item</p>
                  <p className="mt-0.5 max-w-full break-words text-[10px] leading-3 text-blue-100">Update the shared POS item details and image used by POS and storefront.</p>
                </div>
              </div>
              <button
                type="button"
                onClick={closeEdit}
                disabled={savingItem || persistingEditAssets}
                aria-label="Close Edit Item"
                className="grid h-8 w-8 place-items-center rounded-lg text-blue-100 transition-colors hover:bg-white/15 hover:text-white focus-visible:outline-none focus:ring-2 focus:ring-white focus:ring-offset-2 focus:ring-offset-[#1A4E8D]"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            </div>

            <div className="pos-items-modal-body pos-items-modal-scroll-region min-h-0 flex-1 overflow-y-auto bg-white px-4 pb-5 sm:px-5 sm:pb-6">
              <div className="pos-items-status-grid mt-4 grid gap-3 md:grid-cols-3">
                {/* Toggle Card 1: Always Available */}
                <div className="flex min-w-0 items-start justify-between gap-2 rounded-lg border border-slate-200 bg-slate-50/40 px-2.5 py-2">
                  <div className="flex min-w-0 items-start gap-2">
                    <div className="grid h-6 w-6 shrink-0 place-items-center rounded-md bg-emerald-50 text-emerald-600">
                      <Check className="h-3.5 w-3.5" aria-hidden="true" />
                    </div>
                    <div className="flex min-h-9 min-w-0 flex-1 flex-col justify-center"><label htmlFor="pos-items-edit-always-available" className="block break-words text-[10px] font-black text-[#0F172A]">Always Available</label><span className="mt-0.5 block break-words text-[10px] text-[#94A3B8]">Allow POS sales at zero stock.</span></div>
                  </div>
                  <Switch
                    id="pos-items-edit-always-available"
                    checked={editForm.pos_always_available === true}
                    onCheckedChange={(checked) => setEditForm((current) => ({
                      ...current,
                      pos_always_available: Boolean(checked)
                    }))}
                    disabled={savingItem || persistingEditAssets}
                    className={getPosItemStatusSwitchClass(editForm.pos_always_available === true)}
                  />
                </div>

                {/* Toggle Card 2: Best Seller */}
                <div className="flex min-w-0 items-start justify-between gap-2 rounded-lg border border-slate-200 bg-slate-50/40 px-2.5 py-2">
                  <div className="flex min-w-0 items-start gap-2">
                    <div className="grid h-6 w-6 shrink-0 place-items-center rounded-md bg-amber-50 text-amber-600">
                      <Star className="h-3.5 w-3.5" aria-hidden="true" />
                    </div>
                    <div className="flex min-h-9 min-w-0 flex-1 flex-col justify-center"><label htmlFor="pos-items-edit-best-seller-mode" className="block break-words text-[10px] font-black text-[#0F172A]">Best Seller</label><span className="mt-0.5 block break-words text-[10px] text-[#94A3B8]">Manually tag this item as a Best Seller.</span></div>
                  </div>
                  <Switch
                    id="pos-items-edit-best-seller-mode"
                    checked={editForm.pos_best_seller_mode === 'force'}
                    onCheckedChange={(checked) => setEditForm((current) => ({
                      ...current,
                      pos_best_seller_mode: checked ? 'force' : 'never'
                    }))}
                    disabled={savingItem || persistingEditAssets}
                    className={getPosItemStatusSwitchClass(editForm.pos_best_seller_mode === 'force')}
                  />
                </div>

                {/* Toggle Card 3: Senior/PWD Eligible */}
                <div className="flex min-w-0 items-start justify-between gap-2 rounded-lg border border-slate-200 bg-slate-50/40 px-2.5 py-2">
                  <div className="flex min-w-0 items-start gap-2">
                    <div className="grid h-6 w-6 shrink-0 place-items-center rounded-md bg-indigo-50 text-indigo-500">
                      <UserRound className="h-3.5 w-3.5" aria-hidden="true" />
                    </div>
                    <div className="flex min-h-9 min-w-0 flex-1 flex-col justify-center"><label htmlFor="pos-items-edit-senior-pwd" className="block break-words text-[10px] font-black text-[#0F172A]">Senior/PWD Eligible</label><span className="mt-0.5 block break-words text-[10px] text-[#94A3B8]">Allow statutory discount selection.</span></div>
                  </div>
                  <Switch
                    id="pos-items-edit-senior-pwd"
                    aria-checked={editForm.senior_pwd_discount_eligible}
                    checked={editForm.senior_pwd_discount_eligible === true}
                    onCheckedChange={(checked) => setEditForm((current) => ({
                      ...current,
                      senior_pwd_discount_eligible: Boolean(checked)
                    }))}
                    disabled={savingItem || persistingEditAssets}
                    className={getPosItemStatusSwitchClass(editForm.senior_pwd_discount_eligible === true)}
                  />
                </div>
              </div>

              {/* Main Body: shared Add/Edit three-column layout */}
              <div className="pos-items-form-columns mt-5 grid min-w-0 gap-4 xl:grid-cols-[12rem_minmax(0,1fr)_12rem]">
                {/* Column 1: Product Image */}
                <div className="min-w-0 space-y-3">
                  {(() => {
                    const editGallery = normalizeStorefrontItemGallery(activeEditItem || {});
                    const hasEditImages = editGallery.length > 0 || selectedEditImageFiles.length > 0;
                    const editImageCount = editGallery.length + selectedEditImageFiles.length;
                    const imageControlsDisabled = savingItem || persistingEditAssets || editImageUploadJob || pendingEditImageRefresh;

                    return (
                      <div className="space-y-3">
                        <input
                          id="pos-item-edit-image"
                          type="file"
                          accept="image/*"
                          multiple
                          className="hidden"
                          disabled={imageControlsDisabled}
                          onChange={(event) => {
                            const files = Array.from(event.target.files || []);
                            void handleSelectEditImageFile(files);
                            event.target.value = '';
                          }}
                        />

                        {hasEditImages ? (
                          <>
                            <div className="flex min-h-5 items-center justify-between gap-2 leading-4">
                              <div className="flex min-w-0 items-center gap-1">
                                <label className="pos-items-modal-label block">Product Images</label>
                                <StorefrontSectionInfo label="Product Images" panelId="pos-items-edit-product-image-info" portal>
                                  <p>The same images will be used for POS and storefront visibility.</p>
                                </StorefrontSectionInfo>
                              </div>
                              <span className="shrink-0 text-[10px] font-semibold text-[#94A3B8]">{editImageCount} / {STOREFRONT_ITEM_IMAGE_MAX_COUNT}</span>
                            </div>

                            <SelectedItemImageCarousel
                              files={selectedEditImageFiles}
                              savedGallery={editGallery}
                              itemName={editForm.name || activeEditItem?.name || 'Item'}
                              disabled={imageControlsDisabled}
                              posItemsPresentation
                              showPrimaryToggle
                              editItemPresentation
                              maxVisibleThumbnails={4}
                              onRemove={handleRemoveSelectedEditImageFile}
                              onSetPendingPrimary={handleSetPendingEditPrimary}
                              onSetSavedPrimary={handleSetSavedEditPrimary}
                              onRemoveSaved={handleRemoveSavedEditImage}
                            />

                            <label
                              htmlFor="pos-item-edit-image"
                              className={`flex h-9 cursor-pointer items-center justify-center gap-2 rounded-lg border border-[#1A4E8D] bg-white px-3 text-[10px] font-bold text-[#1A4E8D] transition-colors hover:bg-blue-50/60 ${imageControlsDisabled ? 'cursor-not-allowed opacity-50' : ''}`}
                            >
                              <Upload className="h-4 w-4" aria-hidden="true" />
                              Upload New Image
                            </label>
                            <p className="text-[10px] leading-3 text-[#94A3B8]">JPG, PNG or WEBP (large files optimized by server)</p>
                          </>
                        ) : (
                          <>
                            <div className="flex min-h-5 items-center gap-1 leading-4">
                              <label className="pos-items-modal-label block">Product Image</label>
                              <StorefrontSectionInfo label="Product Image" panelId="pos-items-edit-product-image-info" portal>
                                <p>The same image will be used for POS and storefront visibility.</p>
                              </StorefrontSectionInfo>
                            </div>
                            <label
                              htmlFor="pos-item-edit-image"
                              className={`pos-items-image-upload-dropzone flex min-h-[10rem] cursor-pointer flex-col items-center justify-center rounded-lg border border-dashed border-[#1A4E8D]/45 bg-[#F5F8FC] p-3 text-center transition-colors hover:bg-blue-50/60 ${imageControlsDisabled ? 'cursor-not-allowed opacity-50' : ''}`}
                            >
                              <div className="grid h-7 w-7 place-items-center rounded-full bg-blue-50 text-[#1A4E8D]"><Upload className="h-3.5 w-3.5" aria-hidden="true" /></div>
                              <p className="mt-2 text-[10px] font-black text-[#64748B]">Add Item Images</p>
                              <p className="mt-0.5 text-[10px] font-medium leading-3 text-[#64748B]">JPG, PNG or WEBP (large files optimized by server)</p>
                              <p className="mt-1.5 text-[10px] leading-3 text-[#94A3B8]">
                                The preview appears immediately. The optimized image is saved automatically and then replaces the preview.
                              </p>
                            </label>
                          </>
                        )}

                        {selectedEditImageFiles.length > 0
                          && editGallery.length >= STOREFRONT_ITEM_IMAGE_MAX_COUNT
                          && !editImageUploadJob
                          && !pendingEditImageRefresh && (
                          <p className="rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-[11px] font-medium leading-normal text-amber-800" role="status">
                            Preview ready. Remove existing images to make room; the upload will continue automatically.
                          </p>
                        )}

                        {canEditItems && (
                          <div className="space-y-1">
                            <p className="pos-items-modal-label block whitespace-nowrap">
                              Generate your product image with AI
                            </p>
                            <Button
                              type="button"
                              variant="outline"
                              onClick={() => handleGenerateEditImage(activeEditItem)}
                              disabled={savingItem || persistingEditAssets || editImageUploadJob || pendingEditImageRefresh || generatingEditImage || pollingEditImage}
                              className="h-9 w-full rounded-lg px-2 text-[10px] font-bold"
                              title={
                                editGallery.length > 0
                                  ? 'Generate a new AI photo, replacing the current one.'
                                  : 'Generate an AI photo for this item (watermarked).'
                              }
                              >
                              <ImagePlus className="mr-2 h-4 w-4" />
                              {generatingEditImage
                                ? 'Queuing…'
                                : pollingEditImage
                                  ? 'Generating…'
                                  : editGallery.length > 0 ? 'Regenerate Image (AI)' : 'Generate Image (AI)'}
                            </Button>
                          </div>
                        )}
                      </div>
                    );
                  })()}
                </div>

                {/* Column 2: Item Details */}
                <div ref={editItemDetailsRef} className="min-w-0">
                  <h3 className="pos-items-modal-section-title mb-2">Item Details</h3>
                  <div className="grid gap-2.5 sm:grid-cols-2">
                    <div className="space-y-1 sm:col-span-2">
                    <label className="pos-items-modal-label block">
                      Item Name <span className="text-rose-500">*</span>
                    </label>
                    <Input
                      value={editForm.name}
                      onChange={(event) => setEditForm((current) => ({ ...current, name: event.target.value }))}
                      className="pos-items-modal-field font-medium"
                      disabled={savingItem || persistingEditAssets}
                    />
                    </div>

                    <div className="space-y-1">
                    <div className="flex min-h-5 items-center gap-1 leading-4">
                      <label className="pos-items-modal-label block">
                        {itemWorkspacePresentation.categoryLabel} <span className="text-rose-500">*</span>
                      </label>
                      <StorefrontSectionInfo label={itemWorkspacePresentation.categoryLabel} panelId="pos-items-edit-category-info" portal>
                        <p>{canManageCategories
                          ? 'Select an existing category, or enter a new name to create it when this item is saved.'
                          : 'Inactive categories remain on existing items but cannot be selected again. Only an administrator can create new categories.'}</p>
                      </StorefrontSectionInfo>
                    </div>
                      {canManageCategories ? (
                        <>
                          <EditableFoodCategoryCombobox
                            id="pos-items-edit-category"
                            value={editCategoryInput}
                            onChange={(nextValue) => {
                              const matchedCategory = foodCategoryOptions.find((option) => (
                                normalizeFolderNameKey(option.name) === normalizeFolderNameKey(nextValue)
                              ));
                              setEditCategoryInput(nextValue);
                              setEditForm((current) => ({
                                ...current,
                                pos_category: matchedCategory?.value || ''
                              }));
                            }}
                            onSelect={(option) => {
                              setEditCategoryInput(option.name);
                              setEditForm((current) => ({ ...current, pos_category: option.value }));
                            }}
                            options={foodCategoryOptions}
                            compact
                            disabled={savingItem || persistingEditAssets}
                          />
                        </>
                      ) : (
                        <>
                          <PosFnbSelect
                            id="pos-items-edit-category-fallback"
                            value={editForm.pos_category}
                            options={[
                              ...(editForm.pos_category && !foodCategoryOptions.some((option) => option.value === editForm.pos_category)
                                ? [{ value: editForm.pos_category, label: 'Current category is inactive', disabled: true }]
                                : []),
                              ...foodCategoryOptions
                            ]}
                            onChange={(event) => setEditForm((current) => ({ ...current, pos_category: event.target.value }))}
                            placeholder="Select an active category"
                            aria-label={itemWorkspacePresentation.categoryLabel}
                            className="pos-items-catalog-select pos-items-modal-field px-2.5 font-medium text-[#0F172A]"
                            menuClassName="pos-items-catalog-select-menu"
                            disabled={savingItem || persistingEditAssets}
                          />
                        </>
                      )}
                    </div>

                    <div className="space-y-1">
                    <label className="pos-items-modal-label block">
                      Stock Quantity <span className="text-rose-500">*</span>
                    </label>
                    <div className="relative">
                      <span className="pointer-events-none absolute left-2 top-1/2 -translate-y-1/2 flex h-5 w-5 items-center justify-center rounded bg-blue-50 text-[#1A4E8D]">
                        <Package className="h-3.5 w-3.5" aria-hidden="true" />
                      </span>
                      <Input
                        type="number"
                        min="0"
                        step="1"
                        value={editForm.current_stock}
                        onChange={(event) => setEditForm((current) => ({ ...current, current_stock: event.target.value }))}
                        className="pos-items-modal-field pl-8 font-medium"
                        disabled={savingItem || persistingEditAssets}
                      />
                    </div>
                    </div>

                    <div className="space-y-1">
                    <label className="pos-items-modal-label block">
                      Selling Price <span className="text-rose-500">*</span>
                    </label>
                    <div className="relative">
                      <span className="pos-items-modal-currency-prefix pointer-events-none absolute top-1/2 -translate-y-1/2">₱</span>
                      <Input
                        type="text"
                        inputMode="decimal"
                        value={focusedEditMoneyField === 'default_sale_price'
                          ? editForm.default_sale_price
                          : formatMoneyInput(editForm.default_sale_price)}
                        onFocus={() => setFocusedEditMoneyField('default_sale_price')}
                        onBlur={() => setFocusedEditMoneyField('')}
                        onChange={(event) => setEditForm((current) => ({
                          ...current,
                          default_sale_price: normalizeMoneyInput(event.target.value)
                        }))}
                        className="pos-items-modal-field pl-6 font-medium"
                        disabled={savingItem || persistingEditAssets}
                      />
                    </div>
                    </div>

                    <div className="space-y-1">
                    <label className="pos-items-modal-label block">
                      Cost Price <span className="text-rose-500">*</span>
                    </label>
                    <div className="relative">
                      <span className="pos-items-modal-currency-prefix pointer-events-none absolute top-1/2 -translate-y-1/2">₱</span>
                      <Input
                        type="text"
                        inputMode="decimal"
                        value={focusedEditMoneyField === 'cost_per_unit'
                          ? editForm.cost_per_unit
                          : formatMoneyInput(editForm.cost_per_unit)}
                        onFocus={() => setFocusedEditMoneyField('cost_per_unit')}
                        onBlur={() => setFocusedEditMoneyField('')}
                        onChange={(event) => setEditForm((current) => ({
                          ...current,
                          cost_per_unit: normalizeMoneyInput(event.target.value)
                        }))}
                        className="pos-items-modal-field pl-6 font-medium"
                        disabled={savingItem || persistingEditAssets}
                      />
                    </div>
                    </div>

                    <div className="space-y-1 sm:col-span-2">
                    <div className="flex min-h-5 items-center justify-between gap-2 leading-4">
                      <label className="pos-items-modal-label block min-w-0">Description / Notes</label>
                      <span className="shrink-0 text-[10px] font-medium text-slate-400">
                        {String(editForm.description || '').length} / 500
                      </span>
                    </div>
                    <textarea
                      ref={editDescriptionRef}
                      value={editForm.description}
                      onChange={(event) => setEditForm((current) => ({ ...current, description: event.target.value.slice(0, 500) }))}
                      className="pos-items-modal-field pos-items-modal-textarea w-full bg-white px-2.5 py-2 text-[#0F172A] shadow-sm outline-none"
                      disabled={savingItem || persistingEditAssets}
                      placeholder="Optional notes visible in POS"
                    />
                    </div>

                    <div className="space-y-1 sm:col-span-2">
                      <label htmlFor="pos-items-edit-manual-barcode" className="pos-items-modal-label block">
                        Manual Barcode (priority)
                      </label>
                      <Input
                        id="pos-items-edit-manual-barcode"
                        value={editForm.manual_barcode}
                        onChange={(event) => setEditForm((current) => ({
                          ...current,
                          manual_barcode: normalizeBarcodeEntry(event.target.value)
                        }))}
                        className="pos-items-modal-field w-full font-medium"
                        placeholder="Supplier or company barcode"
                        disabled={savingItem || persistingEditAssets}
                      />
                    </div>

                    <div className="space-y-1 sm:col-span-2">
                      <div className="flex min-h-5 items-center gap-1 leading-4">
                        <label htmlFor="pos-items-edit-gtin" className="pos-items-modal-label block">GTIN / UPC / EAN</label>
                        <StorefrontSectionInfo label="GTIN / UPC / EAN" panelId="pos-items-edit-gtin-info" portal>
                          <p>Manual barcode wins when both fields are filled. Leaving both empty preserves the current barcode.</p>
                        </StorefrontSectionInfo>
                      </div>
                      <Input
                        id="pos-items-edit-gtin"
                        value={editForm.gtin}
                        onChange={(event) => setEditForm((current) => ({
                          ...current,
                          gtin: normalizeBarcodeEntry(event.target.value)
                        }))}
                        className="pos-items-modal-field w-full font-medium"
                        placeholder="8, 12, 13, or 14 digit GTIN"
                        disabled={savingItem || persistingEditAssets}
                      />
                    </div>

                  </div>
                </div>

                {/* Column 3: Additional Categories */}
                <div className="min-w-0 space-y-3">
                  <div className="space-y-3">
                    {/* #1318 Wave C/C5 — Additional Categories: secondary-membership editor,
                        POS's own equivalent of ItemFormModal.jsx's Phase 268 section. Visible
                        (never hidden) when the operator lacks canManageCategories, matching the
                        primary category field's own visible-but-read-only convention above; only
                        hidden when there is no real persisted item to attach memberships to. */}
                    {editItemIdForFolders > 0 && (
                      <div
                        className="pos-items-modal-secondary-panel pos-items-edit-categories-panel space-y-1.5"
                        style={editItemDetailsHeight ? { '--pos-items-edit-categories-height': `${editItemDetailsHeight}px` } : undefined}
                      >
                        <div className="pos-items-modal-section-title flex min-h-5 items-center gap-1">
                          <Tags className="h-3.5 w-3.5" />
                          Additional Categories
                          <StorefrontSectionInfo label="Additional Categories" panelId="pos-items-edit-additional-categories-info" portal>
                            <p>Optional. List this item under up to 10 more categories, alongside its primary category above. This does not change the primary category.</p>
                          </StorefrontSectionInfo>
                        </div>
                        {secondaryFoldersLoading ? (
                          <div className="flex items-center gap-2 text-xs text-slate-500">
                            <RefreshCcw className="w-3.5 h-3.5 animate-spin" />
                            Loading additional categories...
                          </div>
                        ) : secondaryFoldersUnavailable ? (
                          // RF-3: an honest "could not be loaded" state -- never the same
                          // "0/10 selected" a genuinely empty membership list would show.
                          <p role="status" className="text-xs text-amber-600">
                            Additional categories are unavailable right now -- you do not have permission to view them.
                          </p>
                        ) : (
                          <>
                            <div className="pos-items-edit-categories-list pos-items-modal-scrollbar">
                              {availableSecondaryFolders.length > 0 ? (
                                <fieldset
                                  className="grid grid-cols-1 gap-1.5"
                                  disabled={!canManageCategories || secondaryFoldersSaving}
                                >
                                  <legend className="sr-only">Additional categories</legend>
                                  {availableSecondaryFolders.map((folder) => {
                                    const normalizedId = String(folder.folder_id);
                                    const checked = secondaryFolderIds.includes(normalizedId);
                                    const atCap = !checked && secondaryFolderIds.length >= 10;
                                    return (
                                      <label
                                        key={folder.folder_id}
                                        className={`pos-items-modal-option-row flex min-w-0 items-center gap-2 ${atCap ? 'opacity-50' : ''}`}
                                      >
                                        <input
                                          type="checkbox"
                                          checked={checked}
                                          disabled={atCap}
                                          onChange={(event) => toggleSecondaryFolder(folder.folder_id, event.target.checked)}
                                          className="pos-items-modal-checkbox shrink-0"
                                        />
                                        <span className="min-w-0 flex-1 break-words">{folder.name}</span>
                                      </label>
                                    );
                                  })}
                                </fieldset>
                              ) : (
                                <p className="text-xs text-slate-500">No other categories available yet.</p>
                              )}
                            </div>
                            <div className="flex items-center justify-between gap-3">
                              {canManageCategories ? (
                                  <Button
                                    type="button"
                                    size="sm"
                                    onClick={saveSecondaryFolders}
                                    disabled={secondaryFoldersSaving}
                                    aria-label="Save Additional Categories"
                                    title="Save Additional Categories"
                                    className="h-8 min-w-0 flex-1 justify-center rounded-lg border border-[#1A4E8D] bg-[#1A4E8D] px-2 text-[10px] font-bold whitespace-nowrap text-white shadow-sm hover:bg-[#143F73] focus-visible:ring-2 focus-visible:ring-[#1A4E8D] focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-60"
                                  >
                                    <span className="truncate">{secondaryFoldersSaving ? 'Saving...' : 'Save Categories'}</span>
                                  </Button>
                              ) : (
                                <p role="status" className="text-[11px] text-slate-500">
                                  You can review additional categories, but your role cannot change them.
                                </p>
                              )}
                              <p className="text-[10px] text-slate-400">{secondaryFolderIds.length}/10 selected</p>
                            </div>
                          </>
                        )}
                      </div>
                    )}

                  </div>
                  <div className="flex justify-center">
                    <StorefrontItemQrCard
                      itemName={editForm.name || activeEditItem.name}
                      itemUrl={activeEditStorefrontUrl}
                      helperText=""
                      compact
                      fullWidth
                      qrSize={160}
                    />
                  </div>
                </div>
              </div>
            </div>

            {/* Footer */}
            <div className="pos-items-modal-footer grid shrink-0 grid-cols-1 gap-2 border-t border-slate-200 bg-white px-4 py-2 sm:px-5">
              {editPermissionDenied ? (
                <div
                  role="alert"
                  data-testid="pos-edit-item-permission-denied"
                  className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs font-medium text-amber-800"
                >
                  Your permission to edit items changed. Your unsaved changes are still open, but you can’t save them.
                </div>
              ) : null}
              <div className="pos-items-modal-footer-actions grid min-w-0 grid-cols-2 gap-2">
                <Button
                  type="button"
                  variant="outline"
                  onClick={closeEdit}
                  disabled={savingItem || persistingEditAssets}
                  className="h-10 min-w-0 w-full rounded-lg border-[#1A4E8D] px-2 text-[11px] font-bold text-[#1A4E8D] hover:bg-blue-50"
                >
                  Cancel
                </Button>
                <Button
                  type="button"
                  onClick={handleSave}
                  disabled={!canEditItems || editPermissionDenied || savingItem || persistingEditAssets}
                  className="flex h-10 min-w-0 w-full items-center justify-center gap-1.5 rounded-lg bg-[#1A4E8D] px-2 text-[11px] font-bold text-white transition-colors hover:bg-[#143F73]"
                >
                  <Save className="h-3.5 w-3.5" />
                  {savingItem || persistingEditAssets ? 'Saving...' : 'Save Item'}
                </Button>
              </div>
            </div>
          </div>
        </div>
      ), document.body)}

      {itemSaveInFlight && typeof document !== 'undefined' && createPortal((
        <div
          className="fixed inset-0 z-[10000] flex items-center justify-center bg-slate-950/75 px-4 backdrop-blur-md transition-all duration-300"
          role="status"
          aria-live="assertive"
          aria-label={itemWorkspacePresentation.savingAriaLabel}
        >
          <div className={`relative w-full max-w-sm overflow-hidden rounded-3xl bg-white/95 p-8 text-center backdrop-blur-xl animate-float ${usesWarmSavingAccent ? 'border border-amber-100/80 shadow-[0_25px_60px_-15px_rgba(245,158,11,0.25)]' : 'border border-blue-100/80 shadow-[0_25px_60px_-15px_rgba(37,99,235,0.22)]'}`}>

            {/* Top Warm Accent Shimmer Bar */}
            <div className={`absolute top-0 left-0 right-0 h-1.5 overflow-hidden ${usesWarmSavingAccent ? 'bg-amber-50' : 'bg-blue-50'}`}>
              <div className={`h-full w-1/2 rounded-full animate-shimmer ${usesWarmSavingAccent ? 'bg-gradient-to-r from-amber-500 via-orange-500 to-amber-600' : 'bg-gradient-to-r from-blue-500 via-indigo-500 to-blue-600'}`} />
            </div>

            {/* F&B Status Pill */}
            <div className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-[11px] font-bold tracking-wide border mb-2 ${usesWarmSavingAccent ? 'bg-amber-50 text-amber-700 border-amber-200/60' : 'bg-blue-50 text-blue-700 border-blue-200/60'}`}>
              <span className={`h-1.5 w-1.5 rounded-full animate-ping ${usesWarmSavingAccent ? 'bg-amber-500' : 'bg-blue-500'}`} />
              {itemWorkspacePresentation.savingStatusLabel}
            </div>

            {/* Icon Container with Animated Orbital Rings */}
            <div className="relative mx-auto my-3 flex h-20 w-20 items-center justify-center">
              {/* Outer Glowing Pulse Ring */}
              <div className={`absolute inset-0 rounded-full animate-pulse-ring ${usesWarmSavingAccent ? 'bg-amber-500/10' : 'bg-blue-500/10'}`} />

              {/* Outer Rotating Gradient Ring */}
              <div className={`absolute inset-0 rounded-full border-2 border-dashed animate-spin-slow ${usesWarmSavingAccent ? 'border-amber-400/50' : 'border-blue-400/50'}`} />

              {/* Inner Counter-rotating Gradient Ring */}
              <div className={`absolute inset-1 rounded-full border-2 animate-spin-reverse ${usesWarmSavingAccent ? 'border-orange-500/30 border-t-orange-500' : 'border-indigo-500/30 border-t-indigo-500'}`} />

              {/* Center F&B Emblem Container */}
              <div className={`relative flex h-14 w-14 items-center justify-center rounded-2xl bg-gradient-to-br shadow-lg text-white ${usesWarmSavingAccent ? 'from-amber-500 via-orange-500 to-amber-600 shadow-orange-500/35' : 'from-blue-500 via-indigo-500 to-blue-600 shadow-blue-500/30'}`}>
                <SavingItemIcon className="h-7 w-7 text-white drop-shadow" />
              </div>
            </div>

            {/* Title */}
            <h3 className="mt-3 text-xl font-extrabold tracking-tight text-slate-900">
              {itemWorkspacePresentation.savingTitle}
            </h3>

            {/* Subtitle */}
            <p className="mt-2 text-xs font-medium leading-relaxed text-slate-500 px-1">
              {itemWorkspacePresentation.savingDescription}
            </p>

            {/* Animated Dots Indicator */}
            <div className={`mt-5 flex items-center justify-center gap-1.5 ${usesWarmSavingAccent ? 'text-amber-600' : 'text-blue-600'}`}>
              <span className={`h-2 w-2 rounded-full dot-1 ${usesWarmSavingAccent ? 'bg-amber-500' : 'bg-blue-500'}`} />
              <span className={`h-2 w-2 rounded-full dot-2 ${usesWarmSavingAccent ? 'bg-amber-500' : 'bg-blue-500'}`} />
              <span className={`h-2 w-2 rounded-full dot-3 ${usesWarmSavingAccent ? 'bg-amber-500' : 'bg-blue-500'}`} />
            </div>

          </div>
        </div>
      ), document.body)}

      {savedMessage.name && typeof document !== 'undefined' && createPortal((
        <div
          className="fixed inset-0 z-[9999] flex items-center justify-center overflow-hidden bg-slate-950/60 backdrop-blur-sm px-4 py-6 animate-pos-overlay-fade-in"
          role="dialog"
          aria-modal="true"
          aria-labelledby="pos-items-saved-modal-title"
          onClick={() => setSavedMessage({ name: '', barcode: '', action: 'updated' })}
        >
          <div
            className="relative flex w-full max-w-[420px] flex-col overflow-hidden rounded-[28px] border border-slate-100 bg-white p-7 sm:p-8 text-center shadow-2xl shadow-slate-900/10 animate-pos-card-scale-up"
            onClick={(event) => event.stopPropagation()}
          >
            {/* Top Centered Success Badge */}
            <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-emerald-50 border border-emerald-200/80 shadow-[0_0_20px_rgba(16,185,129,0.18)] text-emerald-600">
              <Check className="h-8 w-8 stroke-[2.5]" aria-hidden="true" />
            </div>

            {/* Title */}
            <p id="pos-items-saved-modal-title" className="mt-4 text-xl font-bold tracking-tight text-[#0F172A]">
              Item {savedMessage.action === 'created' ? 'created' : 'saved'} successfully
            </p>

            {/* Main Subtitle */}
            <p className="mt-1.5 text-xs sm:text-sm font-medium text-[#64748B] leading-relaxed">
              <span className="font-semibold text-slate-800">{savedMessage.name}</span> was {savedMessage.action === 'created' ? 'created in IMS and added to POS.' : 'updated in POS and IMS.'}
            </p>

            {/* Inner Summary Detail Card */}
            <div className="my-5 flex items-center gap-3.5 rounded-2xl border border-slate-200/70 bg-[#F8FAFC] p-4 text-left shadow-sm">
              <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-blue-50 text-blue-600">
                <UtensilsCrossed className="h-6 w-6" aria-hidden="true" />
              </div>
              <div className="h-9 w-px bg-slate-200/80 shrink-0" />
              <div className="min-w-0 flex-1">
                <p className="text-sm font-bold text-[#0F172A] truncate">{savedMessage.name}</p>
                <div className="mt-1 flex items-center gap-1.5 text-xs font-medium text-slate-600">
                  <span className="h-2.5 w-2.5 rounded-full bg-emerald-500 shrink-0" aria-hidden="true" />
                  <span>{savedMessage.action === 'created' ? 'Created in IMS and added to POS' : 'Updated in POS and IMS'}</span>
                </div>
                {savedMessage.barcode ? (
                  <p className="mt-1 text-[11px] font-semibold uppercase tracking-wide text-slate-500">
                    Barcode: <span className="font-mono text-slate-700">{savedMessage.barcode}</span>
                  </p>
                ) : null}
              </div>
            </div>

            {/* Bottom Centered Action Button */}
            <div className="mt-1 flex justify-center">
              <Button
                type="button"
                onClick={() => setSavedMessage({ name: '', barcode: '', action: 'updated' })}
                className="h-11 w-full max-w-[200px] rounded-xl bg-[#0B3067] px-6 text-sm font-bold text-white hover:bg-[#072047] transition-colors shadow-sm"
              >
                Got it
              </Button>
            </div>
          </div>
        </div>
      ), document.body)}

      {deleteConfirmItem && typeof document !== 'undefined' && createPortal((
        <div
          className="fixed inset-0 z-[9999] flex items-center justify-center overflow-hidden bg-slate-950/60 px-3 py-3 sm:px-4 sm:py-6"
          role="dialog"
          aria-modal="true"
          aria-labelledby="pos-items-delete-confirm-modal-title"
          onClick={closeDeleteConfirm}
        >
          <div
            className="flex h-auto max-h-[calc(100dvh-1.5rem)] w-full max-w-lg flex-col overflow-hidden rounded-xl border border-slate-200 bg-white shadow-2xl shadow-slate-950/25 sm:max-h-[calc(100dvh-3rem)]"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="flex shrink-0 items-center justify-between gap-3 border-b border-slate-200 bg-white px-5 py-3.5 text-slate-900">
              <div className="flex min-w-0 items-center gap-3">
                <div className="grid h-8 w-8 shrink-0 place-items-center rounded-lg bg-slate-100 text-slate-600 ring-1 ring-slate-200">
                  <Trash2 className="h-4 w-4" aria-hidden="true" />
                </div>
                <div className="min-w-0">
                  <p id="pos-items-delete-confirm-modal-title" className="text-base font-black leading-5 text-[#0F172A]">Delete Item</p>
                  <p className="mt-0.5 break-words text-xs leading-4 text-slate-500">Confirm the removal of this item from POS and IMS.</p>
                </div>
              </div>
              <button
                type="button"
                onClick={closeDeleteConfirm}
                disabled={deletingItem}
                aria-label="Close delete item confirmation"
                className="grid h-8 w-8 shrink-0 place-items-center rounded-lg text-slate-500 transition-colors hover:bg-slate-100 hover:text-slate-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#1A4E8D]"
              >
                <X className="h-5 w-5" aria-hidden="true" />
              </button>
            </div>

            <div className="flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto p-5">
              <div className="flex min-w-0 items-center gap-3 rounded-lg border border-slate-200 bg-slate-50/70 p-3">
                <div className="relative grid h-14 w-14 shrink-0 place-items-center overflow-hidden rounded-md bg-slate-100">
                  <ImagePlus className="h-5 w-5 text-slate-300" aria-hidden="true" />
                  {deleteConfirmImageSources?.src ? (
                    <ResponsiveImage
                      sources={deleteConfirmImageSources}
                      alt={deleteConfirmItem.name || 'Item image'}
                      sizes="56px"
                      width={112}
                      height={112}
                      className="absolute h-full w-full object-cover"
                      fallbackSrcs={[deleteConfirmImageSources.configuredLargeSrc].filter(Boolean)}
                    />
                  ) : null}
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex min-w-0 flex-wrap items-center gap-2">
                    <p className="min-w-0 break-words text-sm font-black leading-5 text-[#0F172A]">{deleteConfirmItem.name || 'Unnamed item'}</p>
                    <span className="shrink-0 rounded-md border border-amber-200 bg-amber-50 px-2 py-0.5 text-[10px] font-bold text-amber-700">{deleteConfirmCategory}</span>
                  </div>
                  <div className="mt-1 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-slate-500">
                    <span>Stock: <strong className="font-bold text-emerald-600">{deleteConfirmIsService ? '—' : `${Number(deleteConfirmItem.current_stock || 0)} pcs`}</strong></span>
                    <span>Price: <strong className="font-bold text-slate-700">₱{money(deleteConfirmItem.default_sale_price)}</strong></span>
                    <span>Cost: <strong className="font-bold text-slate-700">₱{money(deleteConfirmItem.cost_per_unit)}</strong></span>
                  </div>
                </div>
              </div>

              <div className="flex items-start gap-2 rounded-lg border border-slate-200 bg-slate-50 px-3 py-3 text-xs leading-5 text-slate-600" role="alert">
                <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-slate-500" aria-hidden="true" />
                <p>This action is permanent and cannot be undone. Active orders will not be disrupted.</p>
              </div>
            </div>

            <div className="flex shrink-0 flex-col gap-2 border-t border-slate-200 bg-white px-5 py-3">
              <Button
                type="button"
                onClick={() => handleDelete(deleteConfirmItem)}
                disabled={deletingItem}
                className="order-1 h-10 w-full justify-center rounded-lg bg-rose-600 px-3 text-sm font-bold text-white hover:bg-rose-700"
              >
                <Trash2 className="mr-2 h-4 w-4" aria-hidden="true" />
                {deletingItem ? 'Deleting...' : 'Delete Item'}
              </Button>
              <Button
                type="button"
                variant="outline"
                onClick={closeDeleteConfirm}
                disabled={deletingItem}
                className="order-2 h-10 w-full justify-center rounded-lg border-slate-300 px-3 text-sm font-bold text-slate-700"
              >
                Cancel
              </Button>
            </div>
          </div>
        </div>
      ), document.body)}

      {deletedItemName && typeof document !== 'undefined' && createPortal((
        <div
          className="fixed inset-0 z-[9999] flex items-start justify-center overflow-hidden bg-slate-950/60 px-3 py-3 sm:items-center sm:px-4 sm:py-6"
          role="dialog"
          aria-modal="true"
          aria-labelledby="pos-items-deleted-modal-title"
          onClick={() => setDeletedItemName('')}
        >
          <div
            className="flex h-[calc(100dvh-1.5rem)] w-full max-w-md flex-col overflow-hidden rounded-xl border border-slate-200 bg-white shadow-2xl shadow-slate-950/25 sm:h-auto sm:max-h-[calc(100dvh-3rem)]"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="p-5">
              <div className="flex items-start gap-3">
                <div className="flex h-11 w-11 items-center justify-center rounded-full bg-emerald-50 text-emerald-600">
                  <Trash2 className="h-5 w-5" />
                </div>
                <div className="min-w-0 flex-1">
                  <p id="pos-items-deleted-modal-title" className="text-lg font-black text-[#0F172A]">Item deleted</p>
                  <p className="mt-1 text-sm text-[#64748B]">
                    <span className="font-bold text-[#0F172A]">{deletedItemName}</span> was removed from POS and IMS.
                  </p>
                </div>
              </div>
              <div className="mt-5 flex justify-end">
                <Button
                  type="button"
                  onClick={() => setDeletedItemName('')}
                  className="h-11 rounded-lg bg-[#1A4E8D] px-5 text-white hover:bg-[#143F73]"
                >
                  OK
                </Button>
              </div>
            </div>
          </div>
        </div>
      ), document.body)}
    </div>
  );
}

export default ItemsWorkspace;
