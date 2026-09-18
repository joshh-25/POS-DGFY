import React, { useMemo, useState, useEffect, useRef } from 'react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Barcode, Check, ExternalLink, Folder, Loader2, Package, Plus, ScanLine, Search, Tags, Trash2, X } from 'lucide-react';
import { Switch } from "@/components/ui/switch";
import { dummyItems } from '@/components/data/dummyData';
import ConfirmationDialog from '@/components/ui/ConfirmationDialog';
import { Badge } from "@/components/ui/badge";
import { UomSelect } from '@/components/ui/UomSelect';
import { createSupplier, getSuppliers } from '@/services/supplierService.js';
import { useLocations } from '@/hooks/useLocations.js';
import StorefrontImageCarousel from '@/components/items/StorefrontImageCarousel';
import SelectedItemImageCarousel from '@/components/items/SelectedItemImageCarousel';
import { suggestNextSku } from '@/src/features/inventory/utils/skuSuggestion.js';
import { resolveBusinessModeItemDefaults } from '@/src/features/settings/businessModeTemplates.js';
import {
  findItemPresetForValues,
  resolveItemPreset,
  resolveModeItemTaxonomy
} from '@/src/features/settings/modeItemTaxonomy.js';
import { resolveItemFinancialPolicy } from '@/src/features/inventory/itemFinancialPolicy.js';
import { listItemFolders, lookupExternalProduct, replaceItemFolders } from '@/services/itemService.js';
import {
  getGtinValidationMessage,
  getInternalBarcodeValidationMessage,
  normalizeBarcodeEntry
} from '@/src/utils/barcodePolicy.js';
import ProductQrScannerModal from '@/src/features/inventory/components/ProductQrScannerModal.jsx';
import { toast } from 'sonner';

const MSME_ITEM_PRESET = Object.freeze({
  SELLABLE_POS: 'sellable_pos',
  INVENTORY_ONLY: 'inventory_only'
});
const STOREFRONT_ITEM_IMAGE_MAX_COUNT = 5;

const parseStorefrontImageGallery = (value) => {
  if (Array.isArray(value)) return value;
  if (typeof value !== 'string') return [];

  try {
    const parsed = JSON.parse(value);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
};

const MSME_VISIBLE_UPDATE_FIELDS = Object.freeze([
  'sku_code',
  'name',
  'category',
  'description',
  'unit_of_measure',
  'cost_per_unit',
  'default_sale_price',
  'vat_type',
  'senior_pwd_discount_eligible',
  'max_capacity',
  'current_stock',
  'location_id',
  'fifo_enabled',
  'shelf_life_days',
  'opened_shelf_life_days',
  'product_folder',
  'packaging_specs'
]);

const MSME_NUMERIC_FIELDS = new Set([
  'cost_per_unit',
  'default_sale_price',
  'max_capacity',
  'current_stock',
  'shelf_life_days',
  'opened_shelf_life_days'
]);

const MSME_CATEGORY_VALUES = Object.freeze({
  PRODUCT: 'product',
  SUPPLIES: 'supplies'
});

const MSME_LEGACY_SUPPLIES_CATEGORIES = new Set(['raw_material', 'packaging', 'supplies']);

const toNonNegativeNumberOrNull = (value) => {
  const parsed = toNumberOrNull(value);
  if (parsed === null) return null;
  return parsed < 0 ? null : parsed;
};

const mapCategoryToMsmeSelection = (category) => {
  if (category === MSME_CATEGORY_VALUES.PRODUCT) return MSME_CATEGORY_VALUES.PRODUCT;
  return MSME_CATEGORY_VALUES.SUPPLIES;
};

const normalizeSupplierLinks = (links = []) => {
  if (!Array.isArray(links)) return [];
  return links
    .map((link) => ({
      supplier_id: Number.parseInt(link?.supplier_id, 10),
      moq: toNonNegativeNumberOrNull(link?.moq),
      price_per_unit: toNonNegativeNumberOrNull(link?.price_per_unit)
    }))
    .filter((link) => Number.isInteger(link.supplier_id) && link.supplier_id > 0)
    .sort((left, right) => left.supplier_id - right.supplier_id);
};

const areSupplierLinksEqual = (left, right) => (
  JSON.stringify(normalizeSupplierLinks(left)) === JSON.stringify(normalizeSupplierLinks(right))
);

const isPlainObject = (value) => Boolean(value) && typeof value === 'object' && !Array.isArray(value);

const toNumberOrNull = (value) => {
  if (value === '' || value === null || value === undefined) return null;
  const num = Number(value);
  return Number.isFinite(num) ? num : null;
};

const normalizePackagingSpecs = (value) => {
  if (!isPlainObject(value)) return null;
  const normalized = {
    height: String(value.height || ''),
    width: String(value.width || ''),
    thickness: String(value.thickness || ''),
    material: String(value.material || ''),
    design: String(value.design || ''),
    contents: String(value.contents || '')
  };
  const hasAnyValue = Object.values(normalized).some((entry) => entry !== '');
  return hasAnyValue ? normalized : null;
};

const normalizeMsmeFieldValue = (field, value) => {
  if (field === 'packaging_specs') {
    return normalizePackagingSpecs(value);
  }
  if (field === 'fifo_enabled') {
    return value === true;
  }
  if (field === 'product_folder') {
    const normalized = String(value || '').trim();
    return normalized === '' ? null : normalized;
  }
  if (MSME_NUMERIC_FIELDS.has(field)) {
    return toNumberOrNull(value);
  }
  if (value === null || value === undefined) {
    return '';
  }
  return String(value);
};

const areEquivalentMsmeValues = (field, left, right) => {
  if (field === 'packaging_specs') {
    return JSON.stringify(left) === JSON.stringify(right);
  }
  return left === right;
};

export const buildMsmeVisibleUpdatePatch = ({ payload, originalItem }) => {
  const safePayload = isPlainObject(payload) ? payload : {};
  const safeOriginalItem = isPlainObject(originalItem) ? originalItem : {};
  const patch = {};

  for (const field of MSME_VISIBLE_UPDATE_FIELDS) {
    if (!Object.prototype.hasOwnProperty.call(safePayload, field)) continue;

    const nextValue = normalizeMsmeFieldValue(field, safePayload[field]);
    const previousValue = normalizeMsmeFieldValue(field, safeOriginalItem[field]);

    if (!areEquivalentMsmeValues(field, nextValue, previousValue)) {
      patch[field] = nextValue;
    }
  }

  return patch;
};

export default function ItemFormModal({
  item,
  open,
  onClose,
  onSave,
  onSaveDraft,
  folders = [],
  folderOptions = [],
  canManageFolders = false,
  existingItems = [],
  workflowMode = 'manufacturing',
  msmeMode = false,
  createPreset = MSME_ITEM_PRESET.INVENTORY_ONLY,
  posConfig = null,
  storefrontConfig = null,
  showStorefrontCatalogControls = true,
  onTogglePosVisibility,
  onTogglePosAlwaysAvailable,
  onToggleStorefrontVisibility,
  onToggleStorefrontLocationAvailability,
  onUploadStorefrontImage,
  onSetPrimaryStorefrontImage,
  onDeleteStorefrontImage,
  onGenerateStorefrontImage,
  onOpenBulkPosSetup
}) {
  const [generatingImage, setGeneratingImage] = useState(false);
  const [formData, setFormData] = useState({
    sku_code: '',
    name: '',
    category: 'raw_material',
    product_type: null,
    description: '',
    unit_of_measure: 'kg',
    cost_per_unit: 0,
    default_sale_price: 0,
    vat_type: 'vatable',
    senior_pwd_discount_eligible: false,
    pos_always_available: false,
    max_capacity: 0,
    current_stock: 0,
    location_id: '',
    fifo_enabled: true,
    shelf_life_days: '',
    opened_shelf_life_days: '',
    product_folder: '',
    ingredients: [],
    packaging_specs: {
      height: '',
      width: '',
      thickness: '',
      material: '',
      design: '',
      contents: ''
    },
    supplier_links: []
  });
  const [marginPercent, setMarginPercent] = useState('');
  const [supplierOptions, setSupplierOptions] = useState([]);
  const [loadingSuppliers, setLoadingSuppliers] = useState(false);
  const [showCreateSupplierDialog, setShowCreateSupplierDialog] = useState(false);
  const [selectedStorefrontImageFiles, setSelectedStorefrontImageFiles] = useState([]);
  const [isStorefrontImageDragActive, setIsStorefrontImageDragActive] = useState(false);
  const [createSupplierTargetRow, setCreateSupplierTargetRow] = useState(null);
  const [creatingSupplier, setCreatingSupplier] = useState(false);
  const [newSupplierForm, setNewSupplierForm] = useState({
    name: '',
    contact_person: '',
    phone: ''
  });
  const [msmeOriginalCategory, setMsmeOriginalCategory] = useState(null);
  const [msmeCategoryTouched, setMsmeCategoryTouched] = useState(false);
  const [trackServiceCost, setTrackServiceCost] = useState(false);
  // #1318 Phase 268 — secondary category memberships (additive to the
  // primary `product_folder`/`folder_id` above; ADR 0080 clause 1/2). Kept
  // as its own self-contained load/save cycle rather than folded into
  // formData/onSave, since the API is item-scoped and only exists once the
  // item itself has been created — mirrors PosFnbModifiersWorkspace.jsx's
  // checkbox-grid + explicit-save shape, not this modal's supplier_links
  // dirty-tracking shape.
  const [secondaryFolderIds, setSecondaryFolderIds] = useState([]);
  const [secondaryFoldersLoading, setSecondaryFoldersLoading] = useState(false);
  const [secondaryFoldersSaving, setSecondaryFoldersSaving] = useState(false);
  const modeItemDefaults = useMemo(
    () => resolveBusinessModeItemDefaults(workflowMode),
    [workflowMode]
  );
  const { locations, loading: loadingLocations } = useLocations();
  const activeLocations = useMemo(
    () => (Array.isArray(locations) ? locations.filter((location) => location?.is_active !== false) : []),
    [locations]
  );
  const [draftStorefrontLocationAvailability, setDraftStorefrontLocationAvailability] = useState([]);
  const storefrontGallery = useMemo(() => {
    const entries = parseStorefrontImageGallery(storefrontConfig?.storefront_image_gallery);
    const gallery = entries
      .map((entry, index) => ({
        path: entry?.path || null,
        url: entry?.url || entry?.image_url || entry,
        variants: entry?.variants || entry?.image_variants || null,
        is_primary: index === 0,
        sort_order: index
      }))
      .filter((entry) => entry.path || entry.url);
    const primaryUrl = storefrontConfig?.storefront_image_url || null;
    if (primaryUrl && !gallery.some((entry) => entry.url === primaryUrl)) {
      gallery.unshift({
        path: storefrontConfig?.storefront_image_path || null,
        url: primaryUrl,
        variants: storefrontConfig?.storefront_image_variants || null,
        is_primary: true,
        sort_order: 0
      });
    }
    return gallery.map((entry, index) => ({
      ...entry,
      is_primary: index === 0,
      sort_order: index
    }));
  }, [storefrontConfig]);
  const configuredStorefrontLocationAvailability = useMemo(() => {
    const configuredRows = Array.isArray(storefrontConfig?.location_availability)
      ? storefrontConfig.location_availability
      : [];
    const configuredByLocationId = new Map(configuredRows.map((row) => [
      String(row?.location_id),
      row
    ]));
    return activeLocations.map((location) => {
      const configured = configuredByLocationId.get(String(location?.location_id));
      return {
        location_id: location.location_id,
        name: location.name,
        is_primary_storefront: location.is_primary_storefront === true,
        storefront_available: configured?.storefront_available !== false
      };
    });
  }, [activeLocations, storefrontConfig]);
  const storefrontLocationAvailability = item
    ? configuredStorefrontLocationAvailability
    : draftStorefrontLocationAvailability;
  const modeItemTaxonomy = useMemo(
    () => resolveModeItemTaxonomy(workflowMode),
    [workflowMode]
  );
  const currentItemPreset = useMemo(() => {
    if (!modeItemTaxonomy) return null;
    if (formData.mode_preset) {
      const selectedPreset = modeItemTaxonomy.presets.find((presetConfig) => presetConfig.key === formData.mode_preset);
      if (selectedPreset) return selectedPreset;
    }
    return findItemPresetForValues(workflowMode, formData);
  }, [formData, modeItemTaxonomy, workflowMode]);
  const resolvedModeItemPresetKey = modeItemTaxonomy
    ? (currentItemPreset?.key || modeItemTaxonomy.default_preset || null)
    : null;
  const isStockExemptItem = currentItemPreset?.stock_behavior === 'stock_exempt' || formData.category === 'service';
  const financialPolicy = useMemo(() => resolveItemFinancialPolicy({
    workflowMode,
    item: {
      ...formData,
      mode_item_preset: resolvedModeItemPresetKey
    },
    preset: currentItemPreset,
    posVisible: posConfig?.pos_visible === true,
    storefrontVisible: storefrontConfig?.storefront_visible === true,
    serviceCostTrackingEnabled: trackServiceCost
  }), [currentItemPreset, formData, posConfig?.pos_visible, resolvedModeItemPresetKey, storefrontConfig?.storefront_visible, trackServiceCost, workflowMode]);
  const [stockBaseline, setStockBaseline] = useState(0);
  const itemLocationStockMap = useMemo(() => {
    const rows = Array.isArray(item?.item_location_stocks) ? item.item_location_stocks : [];
    const map = new Map();
    rows.forEach((row) => {
      const locationId = Number.parseInt(row?.location_id, 10);
      if (!Number.isInteger(locationId) || locationId <= 0) return;
      map.set(String(locationId), Number(row?.quantity_on_hand) || 0);
    });
    return map;
  }, [item]);
  const resolveLocationStock = (locationId) => {
    if (!locationId) return null;
    const normalized = String(locationId);
    return itemLocationStockMap.has(normalized) ? (itemLocationStockMap.get(normalized) || 0) : null;
  };

  const [initialFormData, setInitialFormData] = useState(null);
  const [isDirty, setIsDirty] = useState(false);
  const [showConfirmation, setShowConfirmation] = useState(false);
  const [savingAction, setSavingAction] = useState(null);
  const savingActionRef = useRef(null);
  const [skuManuallyEdited, setSkuManuallyEdited] = useState(false);
  const [lastSuggestedSku, setLastSuggestedSku] = useState('');
  const [externalBarcode, setExternalBarcode] = useState('');
  const [externalProductLookup, setExternalProductLookup] = useState(null);
  const [acceptedExternalProduct, setAcceptedExternalProduct] = useState(null);
  const [externalLookupLoading, setExternalLookupLoading] = useState(false);
  const [externalLookupError, setExternalLookupError] = useState('');
  const [externalQrScannerOpen, setExternalQrScannerOpen] = useState(false);
  const [useInternalBarcode, setUseInternalBarcode] = useState(false);
  const isEditingDraft = item?.status === 'draft';
  const isSaving = Boolean(savingAction);
  const folderSuggestionsListId = `item-folder-suggestions-${item?.item_id || item?.id || 'new'}`;
  // #1318 Phase 268 — offerable secondary categories: every persisted folder
  // except the item's own primary one (selecting it would be redundant, and
  // the API silently drops it anyway per the disjointness guard, ADR 0080
  // clause 2).
  const availableSecondaryFolders = useMemo(
    () => (Array.isArray(folderOptions) ? folderOptions : []).filter(
      (folder) => Number(folder.folder_id) !== Number(item?.folder_id)
    ),
    [folderOptions, item?.folder_id]
  );

  const normalizedFolderSuggestions = useMemo(() => {
    const query = String(formData.product_folder || '').trim().toLowerCase();
    const uniqueSuggestions = [];
    const seen = new Set();

    (Array.isArray(folders) ? folders : []).forEach((folderName) => {
      const normalizedName = String(folderName || '').trim();
      if (!normalizedName) return;
      const lookupKey = normalizedName.toLowerCase();
      if (seen.has(lookupKey)) return;
      if (query && !lookupKey.includes(query)) return;
      seen.add(lookupKey);
      uniqueSuggestions.push(normalizedName);
    });

    return uniqueSuggestions.slice(0, 8);
  }, [folders, formData.product_folder]);

  const runSaveAction = async (action, operation) => {
    if (savingActionRef.current) return;
    savingActionRef.current = action;
    setSavingAction(action);
    try {
      await operation();
    } finally {
      savingActionRef.current = null;
      setSavingAction(null);
    }
  };

  const fetchSuppliers = async () => {
    if (!msmeMode) return;
    setLoadingSuppliers(true);
    try {
      const supplierResponse = await getSuppliers({ status: 'active', limit: 1000 });
      setSupplierOptions(Array.isArray(supplierResponse?.suppliers) ? supplierResponse.suppliers : []);
    } catch (error) {
      console.error('Failed to load suppliers:', error);
      setSupplierOptions([]);
    } finally {
      setLoadingSuppliers(false);
    }
  };

  useEffect(() => {
    if (open && msmeMode) {
      fetchSuppliers();
    }
  }, [msmeMode, open]);

  const itemIdForFolders = item?.item_id || item?.id || null;

  const fetchSecondaryFolders = async () => {
    if (!itemIdForFolders) return;
    setSecondaryFoldersLoading(true);
    try {
      const response = await listItemFolders(itemIdForFolders);
      const memberships = Array.isArray(response?.memberships) ? response.memberships : [];
      setSecondaryFolderIds(memberships.map((membership) => String(membership.folder_id)));
    } catch (error) {
      console.error('Failed to load item category memberships:', error);
      setSecondaryFolderIds([]);
    } finally {
      setSecondaryFoldersLoading(false);
    }
  };

  useEffect(() => {
    if (open && itemIdForFolders) {
      fetchSecondaryFolders();
    } else if (!open) {
      setSecondaryFolderIds([]);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, itemIdForFolders]);

  const toggleSecondaryFolder = (folderId, checked) => {
    const normalizedId = String(folderId);
    setSecondaryFolderIds((current) => {
      if (checked) {
        if (current.includes(normalizedId) || current.length >= 10) return current;
        return [...current, normalizedId];
      }
      return current.filter((entry) => entry !== normalizedId);
    });
  };

  const saveSecondaryFolders = async () => {
    if (!itemIdForFolders) return;
    setSecondaryFoldersSaving(true);
    try {
      await replaceItemFolders(itemIdForFolders, secondaryFolderIds.map((id) => Number(id)));
      toast.success('Additional categories saved.');
    } catch (error) {
      toast.error(error?.response?.data?.message || 'Unable to save additional categories.');
    } finally {
      setSecondaryFoldersSaving(false);
    }
  };

  useEffect(() => {
    if (!open || item) return;
    setDraftStorefrontLocationAvailability(configuredStorefrontLocationAvailability);
  }, [configuredStorefrontLocationAvailability, item, open]);

  useEffect(() => {
    if (item && open) {
      const parseNum = (val, fallback = 0) => {
        if (val === null || val === undefined || val === '') return fallback;
        const num = Number(val);
        return isNaN(num) ? fallback : num;
      };
      const initialCategory = msmeMode
        ? mapCategoryToMsmeSelection(item.category)
        : (item.category || 'raw_material');
      const initialModePreset = findItemPresetForValues(workflowMode, {
        category: initialCategory,
        product_type: initialCategory === MSME_CATEGORY_VALUES.PRODUCT ? 'finished_goods' : (item.product_type || null),
        unit_of_measure: item.unit_of_measure || modeItemDefaults.unit_of_measure
      })?.key || '';
      const persistedModePreset = modeItemTaxonomy?.presets.some((presetConfig) => presetConfig.key === item.mode_item_preset)
        ? item.mode_item_preset
        : initialModePreset;
      const locationStocks = Array.isArray(item.item_location_stocks) ? item.item_location_stocks : [];
      const stockByLocation = new Map();
      locationStocks.forEach((stockRow) => {
        const locationId = Number.parseInt(stockRow?.location_id, 10);
        if (!Number.isInteger(locationId) || locationId <= 0) return;
        stockByLocation.set(String(locationId), parseNum(stockRow?.quantity_on_hand, 0));
      });
      const initialLocationId = item.location_id
        ? String(item.location_id)
        : activeLocations.length === 1
          ? String(activeLocations[0].location_id)
          : locationStocks.length === 1
            ? String(locationStocks[0].location_id)
            : '';
      const initialLocationStock = initialLocationId && stockByLocation.has(initialLocationId)
        ? stockByLocation.get(initialLocationId)
        : (activeLocations.length > 1 ? 0 : parseNum(item.current_stock, 0));

      const initialData = {
        sku_code: item.sku_code || '',
        name: item.name || '',
        mode_preset: persistedModePreset,
        category: initialCategory,
        product_type: initialCategory === MSME_CATEGORY_VALUES.PRODUCT ? 'finished_goods' : (item.product_type || null),
        description: item.description || '',
        unit_of_measure: item.unit_of_measure || modeItemDefaults.unit_of_measure || 'kg',
        cost_per_unit: parseNum(item.cost_per_unit, 0),
        default_sale_price: parseNum(item.default_sale_price, 0),
        vat_type: item.vat_type || modeItemDefaults.vat_type || 'vatable',
        senior_pwd_discount_eligible: item.senior_pwd_discount_eligible === true || Number(item.senior_pwd_discount_eligible) === 1,
        pos_always_available: posConfig?.pos_always_available === true,
        max_capacity: parseNum(item.max_capacity, Number(modeItemDefaults.max_capacity || 0)),
        current_stock: initialLocationStock,
        location_id: initialLocationId,
        min_threshold: parseNum(item.min_threshold, 0),
        purchase_allowance: parseNum(item.purchase_allowance, 0),
        fifo_enabled: item.fifo_enabled || false,
        shelf_life_days: item.shelf_life_days ?? '',
        opened_shelf_life_days: item.opened_shelf_life_days ?? '',
        ingredients: item.ingredients || [],
        supplier_links: Array.isArray(item.suppliers) ? item.suppliers.map((supplier) => ({
          supplier_id: supplier.supplier_id ? String(supplier.supplier_id) : '',
          moq: supplier.moq ?? '',
          price_per_unit: supplier.price_per_unit ?? ''
        })) : [],
        packaging_specs: (() => {
          // Parse packaging_specs if it's a string (from database)
          let packagingSpecs = item.packaging_specs;
          if (packagingSpecs && typeof packagingSpecs === 'string') {
            try {
              packagingSpecs = JSON.parse(packagingSpecs);
            } catch (e) {
              console.error('Failed to parse packaging_specs:', e);
              packagingSpecs = null;
            }
          }

          // Ensure packaging_specs is always an object, not an array
          if (!packagingSpecs) {
            return {
              height: '',
              width: '',
              thickness: '',
              material: '',
              design: '',
              contents: ''
            };
          }

          if (Array.isArray(packagingSpecs)) {
            return {
              height: '',
              width: '',
              thickness: '',
              material: '',
              design: '',
              contents: ''
            };
          }

          // Return as object with defaults for missing properties
          return {
            height: packagingSpecs?.height || '',
            width: packagingSpecs?.width || '',
            thickness: packagingSpecs?.thickness || '',
            material: packagingSpecs?.material || '',
            design: packagingSpecs?.design || '',
            contents: packagingSpecs?.contents || ''
          };
        })(),
        product_folder: item.product_folder || ''
      };
      setFormData(initialData);
      setInitialFormData(initialData);
      setStockBaseline(initialLocationStock);
      setIsDirty(false);
      setSkuManuallyEdited(Boolean(String(item.sku_code || '').trim()));
      setLastSuggestedSku('');
      setMarginPercent('');
      setSelectedStorefrontImageFiles([]);
      setIsStorefrontImageDragActive(false);
      setExternalBarcode('');
      setExternalProductLookup(null);
      setAcceptedExternalProduct(null);
      setExternalLookupError('');
      setExternalLookupLoading(false);
      setExternalQrScannerOpen(false);
      setUseInternalBarcode(false);
      setTrackServiceCost(initialCategory === 'service' && Number(item.cost_per_unit || 0) > 0);
      if (msmeMode) {
        setMsmeOriginalCategory(item.category || null);
        setMsmeCategoryTouched(false);
      } else {
        setMsmeOriginalCategory(null);
        setMsmeCategoryTouched(false);
      }
    } else if (!item && open) {
      let initialData = {
        sku_code: '',
        name: '',
        mode_preset: modeItemTaxonomy?.default_preset || '',
        category: modeItemDefaults.category || 'raw_material',
        product_type: modeItemDefaults.product_type ?? null,
        description: '',
        unit_of_measure: modeItemDefaults.unit_of_measure || 'kg',
        cost_per_unit: 0,
        default_sale_price: 0,
        vat_type: modeItemDefaults.vat_type || 'vatable',
        senior_pwd_discount_eligible: false,
        pos_always_available: false,
        max_capacity: Number(modeItemDefaults.max_capacity || 0),
        current_stock: 0,
        location_id: activeLocations.length === 1 ? String(activeLocations[0].location_id) : '',
        min_threshold: 0,
        purchase_allowance: 0,
        fifo_enabled: modeItemDefaults.fifo_enabled !== false,
        shelf_life_days: '',
        opened_shelf_life_days: '',
        product_folder: '',
        ingredients: [],
        packaging_specs: {
          height: '',
          width: '',
          thickness: '',
          material: '',
          design: '',
          contents: ''
        },
        supplier_links: []
      };
      if (msmeMode) {
        if (createPreset === MSME_ITEM_PRESET.SELLABLE_POS) {
          initialData = {
            ...initialData,
            category: MSME_CATEGORY_VALUES.PRODUCT,
            mode_preset: 'product',
            product_type: 'finished_goods',
            unit_of_measure: 'pcs',
            vat_type: 'vatable',
            max_capacity: 100,
            fifo_enabled: true
          };
        } else {
          initialData = {
            ...initialData,
            category: MSME_CATEGORY_VALUES.SUPPLIES,
            mode_preset: 'supplies',
            product_type: null,
            unit_of_measure: 'pcs',
            max_capacity: 100
          };
        }
      }
      setFormData(initialData);
      setInitialFormData(initialData);
      setStockBaseline(Number(initialData.current_stock) || 0);
      setIsDirty(false);
      setSkuManuallyEdited(false);
      setLastSuggestedSku('');
      setMarginPercent('');
      setSelectedStorefrontImageFiles([]);
      setIsStorefrontImageDragActive(false);
      setExternalBarcode('');
      setExternalProductLookup(null);
      setAcceptedExternalProduct(null);
      setExternalLookupError('');
      setExternalLookupLoading(false);
      setExternalQrScannerOpen(false);
      setUseInternalBarcode(false);
      setTrackServiceCost(false);
      setMsmeOriginalCategory(null);
      setMsmeCategoryTouched(false);
    }
  }, [createPreset, item, modeItemDefaults, modeItemTaxonomy, msmeMode, open, activeLocations, workflowMode]);

  // Track dirty state
  useEffect(() => {
    if (initialFormData && !item) {
      const hasChanged = JSON.stringify(formData) !== JSON.stringify(initialFormData) || selectedStorefrontImageFiles.length > 0;
      setIsDirty(hasChanged);
    }
  }, [formData, initialFormData, item, selectedStorefrontImageFiles.length]);

  const handleSelectStorefrontImageFiles = (selectedFiles, existingGalleryCount = 0) => {
    const remainingSlots = Math.max(STOREFRONT_ITEM_IMAGE_MAX_COUNT - existingGalleryCount - selectedStorefrontImageFiles.length, 0);
    const files = (Array.isArray(selectedFiles) ? selectedFiles : []).slice(0, remainingSlots);
    if (selectedFiles.length > files.length) {
      toast.error(`Only ${remainingSlots} more item image${remainingSlots === 1 ? '' : 's'} can be selected. Galleries are limited to ${STOREFRONT_ITEM_IMAGE_MAX_COUNT} images.`);
    }
    if (files.length === 0) return;
    setSelectedStorefrontImageFiles((current) => [...current, ...files].slice(0, STOREFRONT_ITEM_IMAGE_MAX_COUNT));
  };

  const removeSelectedStorefrontImageFile = (imageIndex) => {
    setSelectedStorefrontImageFiles((files) => files.filter((_, index) => index !== imageIndex));
  };

  const handleStorefrontImageDrop = async (event) => {
    event.preventDefault();
    event.stopPropagation();
    setIsStorefrontImageDragActive(false);

    const droppedFiles = Array.from(event.dataTransfer?.files || []);
    const imageFiles = droppedFiles.filter((file) => file.type?.startsWith('image/'));
    if (droppedFiles.length > imageFiles.length) {
      toast.error('Only image files can be added as item images.');
    }
    if (imageFiles.length > 0) {
      handleSelectStorefrontImageFiles(imageFiles);
      return;
    }

    const droppedUrl = String(event.dataTransfer?.getData('text/uri-list') || '')
      .split(/\r?\n/)
      .find((value) => value && !value.startsWith('#'));
    if (!droppedUrl || !/^https?:\/\//i.test(droppedUrl)) {
      toast.error('Drop an image file or drag an image directly from a browser page.');
      return;
    }

    try {
      const response = await fetch(droppedUrl);
      if (!response.ok) throw new Error(`Image request failed with ${response.status}`);
      const blob = await response.blob();
      if (!blob.type.startsWith('image/')) throw new Error('Dropped URL is not an image');
      const urlName = new URL(droppedUrl).pathname.split('/').pop() || 'dragged-item-image';
      const extension = blob.type.split('/')[1]?.replace('jpeg', 'jpg') || 'jpg';
      const filename = urlName.includes('.') ? urlName : `${urlName}.${extension}`;
      handleSelectStorefrontImageFiles([new File([blob], filename, { type: blob.type })]);
    } catch {
      toast.error('Chrome blocked access to that image. Save it to your device, then drag the saved file here.');
    }
  };

  useEffect(() => {
    if (!open || skuManuallyEdited) return;

    const suggestedSku = suggestNextSku({
      name: formData.name,
      category: formData.category,
      existingItems,
      currentItemId: item?.item_id || item?.id || null
    });
    setLastSuggestedSku(suggestedSku);
    if (!suggestedSku) return;

    if (formData.sku_code !== suggestedSku) {
      setFormData((previous) => ({
        ...previous,
        sku_code: suggestedSku
      }));
    }
  }, [
    existingItems,
    formData.category,
    formData.name,
    formData.sku_code,
    item?.id,
    item?.item_id,
    open,
    skuManuallyEdited
  ]);

  const handleChange = (field, value) => {
    setFormData(prev => {
      const updated = { ...prev, [field]: value };

      // Note: min_threshold and purchase_allowance are now calculated by the backend
      // based on system settings (enable_auto_reorder, min_stock_threshold_percent, purchase_allowance_percent)

      if (field === 'mode_preset' && modeItemTaxonomy) {
        if (value === 'legacy_current') {
          return prev;
        }
        if (msmeMode && item) {
          setMsmeCategoryTouched(true);
        }
        const presetConfig = resolveItemPreset(workflowMode, value);
        if (presetConfig) {
          updated.category = presetConfig.category;
          updated.product_type = presetConfig.product_type;
          updated.unit_of_measure = presetConfig.default_unit;
          updated.max_capacity = presetConfig.max_capacity;
          updated.fifo_enabled = presetConfig.fifo_enabled;
          if (presetConfig.stock_behavior === 'stock_exempt') {
            updated.current_stock = 0;
          }
        }
      }

      // Ensure product_type is null for non-product categories
      if (field === 'category') {
        if (msmeMode) {
          setMsmeCategoryTouched(true);
        }
        if (value === 'product') {
          updated.product_type = 'finished_goods';
        } else {
          updated.product_type = null;
        }
      }

      if (field === 'location_id' && item) {
        const locationStock = resolveLocationStock(value);
        if (locationStock !== null) {
          updated.current_stock = locationStock;
          setStockBaseline(locationStock);
        } else if (!value && activeLocations.length > 1) {
          updated.current_stock = 0;
          setStockBaseline(0);
        }
      }

      return updated;
    });
  };

  const handleExternalBarcodeChange = (value) => {
    const normalized = normalizeBarcodeEntry(value);
    setExternalBarcode(normalized);
    setUseInternalBarcode(false);
    if (normalized !== externalProductLookup?.code) {
      setExternalProductLookup(null);
      setAcceptedExternalProduct(null);
      setExternalLookupError('');
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
    setUseInternalBarcode(false);
    try {
      const result = await lookupExternalProduct(lookupCode);
      setExternalProductLookup(result);
      if (!result?.found) {
        setExternalLookupError('Barcode captured. No registry details were found. Complete the remaining item details; this barcode will still be saved.');
      }
    } catch (error) {
      setExternalLookupError(
        error?.response?.data?.message
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

  const handleUseInternalBarcode = () => {
    const validationMessage = getInternalBarcodeValidationMessage(externalBarcode);
    if (validationMessage) {
      setExternalLookupError(validationMessage);
      toast.error(validationMessage);
      return;
    }

    setUseInternalBarcode(true);
    setExternalLookupError('');
    setExternalProductLookup(null);
    setAcceptedExternalProduct(null);
  };

  const applyExternalProductDetails = () => {
    if (!externalProductLookup?.found) return;
    const product = externalProductLookup.product || {};
    const descriptionParts = [product.brand, product.quantity].filter(Boolean);
    const categorySuggestion = String(product.category_suggestion || '').trim().replace(/\s+/g, ' ').slice(0, 100);
    const matchedCategory = categorySuggestion
      ? (Array.isArray(folders) ? folders : []).find((folderName) => (
          String(folderName || '').trim().toLowerCase() === categorySuggestion.toLowerCase()
        ))
      : null;
    setFormData((previous) => ({
      ...previous,
      name: product.name || previous.name,
      description: previous.description || descriptionParts.join(' - '),
      product_folder: matchedCategory || categorySuggestion || previous.product_folder
    }));
    setAcceptedExternalProduct(externalProductLookup);
  };

  const applyExternalSuggestedPrice = () => {
    const amount = Number(externalProductLookup?.suggested_price?.amount);
    if (!Number.isFinite(amount) || amount <= 0) return;
    handleChange('default_sale_price', amount);
  };

  const handleSkuChange = (value) => {
    const nextValue = String(value || '');
    setFormData((prev) => ({
      ...prev,
      sku_code: nextValue
    }));

    const trimmedValue = nextValue.trim();
    if (!trimmedValue) {
      setSkuManuallyEdited(false);
      return;
    }

    setSkuManuallyEdited(trimmedValue.toUpperCase() !== String(lastSuggestedSku || '').trim().toUpperCase());
  };

  const addSupplierLink = () => {
    setFormData((prev) => ({
      ...prev,
      supplier_links: [...(prev.supplier_links || []), { supplier_id: '', moq: '', price_per_unit: '' }]
    }));
  };

  const updateSupplierLink = (index, field, value) => {
    setFormData((prev) => {
      const nextLinks = [...(prev.supplier_links || [])];
      nextLinks[index] = { ...nextLinks[index], [field]: value };
      return { ...prev, supplier_links: nextLinks };
    });
  };

  const removeSupplierLink = (index) => {
    setFormData((prev) => ({
      ...prev,
      supplier_links: (prev.supplier_links || []).filter((_, rowIndex) => rowIndex !== index)
    }));
  };

  const openCreateSupplierDialog = (rowIndex = null) => {
    setCreateSupplierTargetRow(rowIndex);
    setNewSupplierForm({
      name: '',
      contact_person: '',
      phone: ''
    });
    setShowCreateSupplierDialog(true);
  };

  const handleCreateSupplierFromItemForm = async () => {
    const trimmedName = String(newSupplierForm.name || '').trim();
    if (!trimmedName) {
      toast.error('Supplier name is required.');
      return;
    }

    setCreatingSupplier(true);
    try {
      const createdSupplier = await createSupplier({
        name: trimmedName,
        contact_person: String(newSupplierForm.contact_person || '').trim() || null,
        phone: String(newSupplierForm.phone || '').trim() || null,
        status: 'active'
      });

      setSupplierOptions((prev) => {
        const merged = [...prev, createdSupplier];
        merged.sort((left, right) => String(left.name || '').localeCompare(String(right.name || '')));
        return merged;
      });

      if (Number.isInteger(createSupplierTargetRow)) {
        updateSupplierLink(createSupplierTargetRow, 'supplier_id', String(createdSupplier.supplier_id || createdSupplier.id));
      }

      setShowCreateSupplierDialog(false);
      setCreateSupplierTargetRow(null);
      toast.success('Supplier created and added to the item form.');
    } catch (error) {
      const message = error?.response?.data?.message || error?.message || 'Failed to create supplier';
      toast.error(message);
    } finally {
      setCreatingSupplier(false);
    }
  };

  const handlePackagingChange = (field, value) => {
    setFormData(prev => ({
      ...prev,
      packaging_specs: { ...prev.packaging_specs, [field]: value }
    }));
  };

  const addIngredient = () => {
    setFormData(prev => ({
      ...prev,
      ingredients: [...prev.ingredients, { item_id: '', item_name: '', quantity: 0 }]
    }));
  };

  const removeIngredient = (index) => {
    setFormData(prev => ({
      ...prev,
      ingredients: prev.ingredients.filter((_, i) => i !== index)
    }));
  };

  const updateIngredient = (index, field, value) => {
    setFormData(prev => {
      const ingredients = [...prev.ingredients];
      ingredients[index] = { ...ingredients[index], [field]: value };
      if (field === 'item_id') {
        const selectedItem = dummyItems.find(i => i.id === value);
        if (selectedItem) {
          ingredients[index].item_name = selectedItem.name;
        }
      }
      return { ...prev, ingredients };
    });
  };

  const handleStorefrontLocationAvailabilityChange = (locationId, checked) => {
    const normalizedLocationId = Number.parseInt(locationId, 10);
    if (!Number.isInteger(normalizedLocationId) || normalizedLocationId <= 0) return;

    if (item) {
      onToggleStorefrontLocationAvailability?.(item, normalizedLocationId, checked);
      return;
    }

    setDraftStorefrontLocationAvailability((previous) => {
      const sourceRows = previous.length > 0 ? previous : configuredStorefrontLocationAvailability;
      const hasLocationRow = sourceRows.some((row) => Number(row?.location_id) === normalizedLocationId);
      if (hasLocationRow) {
        return sourceRows.map((row) => (
          Number(row?.location_id) === normalizedLocationId
            ? { ...row, storefront_available: Boolean(checked) }
            : row
        ));
      }
      return [
        ...sourceRows,
        {
          location_id: normalizedLocationId,
          storefront_available: Boolean(checked)
        }
      ];
    });
  };

  const handleClose = () => {
    if (savingActionRef.current) return;
    if (isDirty && !item) {
      setShowConfirmation(true);
    } else {
      onClose();
    }
  };

  const handleSaveDraft = async () => {
    const barcodeValidationMessage = !item && externalBarcode
      ? getGtinValidationMessage(externalBarcode)
      : '';
    if (barcodeValidationMessage && !useInternalBarcode) {
      setExternalLookupError(barcodeValidationMessage);
      toast.error(barcodeValidationMessage);
      return;
    }

    const draftData = {
      ...formData,
      status: 'draft',
      ...(!item && externalBarcode
        ? useInternalBarcode
          ? { internal_barcode: { code: externalBarcode } }
          : { manufacturer_barcode: { code: externalBarcode } }
        : {})
    };
    if (onSaveDraft) {
      try {
        await onSaveDraft(draftData);
      } catch {
        return;
      }
    }
    setIsDirty(false);
    onClose();
  };

  const handleFinalize = async () => {
    // For editing drafts, finalize means saving with full validation
    await handleSubmit(false);
  };

  const handleSubmit = async (isDraft = false) => {
    const barcodeValidationMessage = !item && externalBarcode
      ? getGtinValidationMessage(externalBarcode)
      : '';
    if (barcodeValidationMessage && !useInternalBarcode) {
      setExternalLookupError(barcodeValidationMessage);
      toast.error(barcodeValidationMessage);
      return;
    }

    // Convert empty strings to null for financial fields so hidden service cost stays unset.
    const cleanedData = {
      ...formData,
      cost_per_unit: formData.cost_per_unit === '' ? null : (typeof formData.cost_per_unit === 'string' ? parseFloat(formData.cost_per_unit) : formData.cost_per_unit),
      default_sale_price: formData.default_sale_price === '' ? null : (typeof formData.default_sale_price === 'string' ? parseFloat(formData.default_sale_price) : formData.default_sale_price),
      max_capacity: formData.max_capacity === '' ? 0 : (typeof formData.max_capacity === 'string' ? parseFloat(formData.max_capacity) || 0 : formData.max_capacity),
      current_stock: formData.current_stock === '' ? 0 : (typeof formData.current_stock === 'string' ? parseFloat(formData.current_stock) || 0 : formData.current_stock),
      ingredients: formData.ingredients.map(ing => ({
        ...ing,
        quantity: ing.quantity === '' ? 0 : (typeof ing.quantity === 'string' ? parseFloat(ing.quantity) || 0 : ing.quantity)
      }))
    };

    // Validate max_capacity is positive before submitting (skip validation for drafts)
    if (!isDraft && !isStockExemptItem && (!cleanedData.max_capacity || cleanedData.max_capacity <= 0)) {
      toast.error('Max Capacity must be a positive number greater than 0');
      return;
    }

    const normalizedCurrentStock = Number(cleanedData.current_stock) || 0;
    const previousCurrentStock = item ? (Number(stockBaseline) || 0) : 0;
    const hasStockAdjustment = item
      ? normalizedCurrentStock !== previousCurrentStock
      : normalizedCurrentStock > 0;
    if (hasStockAdjustment && activeLocations.length > 1 && !cleanedData.location_id) {
      toast.error('Please select a location when setting current stock.');
      return;
    }

    // Filter out fields that aren't in the backend schema
    // Only send fields that the backend validator expects
    // Note: current_stock is not in the create schema - backend sets it automatically
    // Convert number fields to proper numbers or null (not empty strings, undefined, or NaN)
    const toNumberOrNull = (value) => {
      if (value === '' || value === undefined || value === null) return null;
      const num = Number(value);
      return isNaN(num) ? null : num;
    };

    let categoryForSave = cleanedData.category || 'raw_material';
    if (
      msmeMode
      && item
      && !msmeCategoryTouched
      && categoryForSave === MSME_CATEGORY_VALUES.SUPPLIES
      && MSME_LEGACY_SUPPLIES_CATEGORIES.has(String(msmeOriginalCategory || ''))
    ) {
      categoryForSave = msmeOriginalCategory;
    }

    const validFields = {
      sku_code: cleanedData.sku_code || '',
      name: cleanedData.name || '',
      category: categoryForSave,
      product_type: categoryForSave === 'product' ? 'finished_goods' : null,
      mode_item_preset: resolvedModeItemPresetKey,
      description: cleanedData.description || '',
      unit_of_measure: cleanedData.unit_of_measure || modeItemDefaults.unit_of_measure || '',
      cost_per_unit: financialPolicy.show_cost ? toNumberOrNull(cleanedData.cost_per_unit) : null,
      default_sale_price: toNumberOrNull(cleanedData.default_sale_price),
      vat_type: cleanedData.vat_type || 'vatable',
      senior_pwd_discount_eligible: cleanedData.senior_pwd_discount_eligible === true,
      max_capacity: Number(cleanedData.max_capacity) || null, // Allow null for drafts
      min_threshold: toNumberOrNull(cleanedData.min_threshold),
      purchase_allowance: toNumberOrNull(cleanedData.purchase_allowance),
      current_stock: toNumberOrNull(cleanedData.current_stock),
      location_id: hasStockAdjustment ? toNumberOrNull(cleanedData.location_id) : null,
      fifo_enabled: cleanedData.fifo_enabled || false,
      product_folder: cleanedData.product_folder || null,
      batch_size: toNumberOrNull(cleanedData.batch_size),
      yield_percentage: toNumberOrNull(cleanedData.yield_percentage),
      processing_loss: toNumberOrNull(cleanedData.processing_loss),
      production_notes: cleanedData.production_notes || null,
      shelf_life_days: cleanedData.fifo_enabled ? toNumberOrNull(cleanedData.shelf_life_days) : null,
      opened_shelf_life_days: cleanedData.fifo_enabled ? toNumberOrNull(cleanedData.opened_shelf_life_days) : null,
      status: isDraft ? 'draft' : 'active',
      ...(!item && externalBarcode
        ? useInternalBarcode
          ? { internal_barcode: { code: externalBarcode } }
          : { manufacturer_barcode: { code: externalBarcode } }
        : {}),
      ...(categoryForSave === 'packaging' ? {
        packaging_specs: cleanedData.packaging_specs ? (() => {

          // Ensure packaging_specs is an object, not an array
          if (Array.isArray(cleanedData.packaging_specs)) {
            return {
              height: '',
              width: '',
              thickness: '',
              material: '',
              design: '',
              contents: ''
            };
          }

          // Ensure it's a proper object with the expected structure
          // Create a new clean object with only the expected properties (no numeric keys)
          const cleanSpecs = {
            height: cleanedData.packaging_specs?.height || '',
            width: cleanedData.packaging_specs?.width || '',
            thickness: cleanedData.packaging_specs?.thickness || '',
            material: cleanedData.packaging_specs?.material || '',
            design: cleanedData.packaging_specs?.design || '',
            contents: cleanedData.packaging_specs?.contents || ''
          };

          return cleanSpecs;
        })() : null
      } : {})
    };

    if (!isDraft) {
      if (financialPolicy.requires_cost && (validFields.cost_per_unit === null || Number(validFields.cost_per_unit) <= 0)) {
        toast.error('Cost per unit is required for this item mode.');
        return;
      }
      if (financialPolicy.requires_sale_price && (validFields.default_sale_price === null || Number(validFields.default_sale_price) <= 0)) {
        toast.error('Selling price is required before this item can be sold.');
        return;
      }
    }

    if (msmeMode && !isDraft) {
      if (validFields.cost_per_unit === null || Number(validFields.cost_per_unit) <= 0) {
        toast.error('Cost per unit is required in MSME mode.');
        return;
      }
      if (validFields.default_sale_price === null || Number(validFields.default_sale_price) <= 0) {
        toast.error('Selling price is required in MSME mode.');
        return;
      }
    }

    const normalizedSupplierLinks = normalizeSupplierLinks(formData.supplier_links);
    const duplicateSupplierLink = normalizedSupplierLinks.find((link, index) => (
      normalizedSupplierLinks.findIndex((candidate) => candidate.supplier_id === link.supplier_id) !== index
    ));

    if (duplicateSupplierLink) {
      toast.error(`Duplicate supplier selected: ${duplicateSupplierLink.supplier_id}`);
      return;
    }

    const submitPayload = (msmeMode && item)
      ? buildMsmeVisibleUpdatePatch({
        payload: validFields,
        originalItem: {
          ...item,
          current_stock: stockBaseline
        }
      })
      : validFields;

    const finalPayload = msmeMode
      ? {
        ...submitPayload,
        pos_always_available: cleanedData.pos_always_available === true,
        supplier_links: normalizedSupplierLinks,
        supplier_links_dirty: !areSupplierLinksEqual(normalizedSupplierLinks, item?.suppliers || []),
        storefront_location_availability: storefrontLocationAvailability,
        storefront_image_files: selectedStorefrontImageFiles
      }
      : {
        ...submitPayload,
        pos_always_available: cleanedData.pos_always_available === true,
        storefront_location_availability: storefrontLocationAvailability,
        storefront_image_files: selectedStorefrontImageFiles
      };

    if (isDraft && onSaveDraft && !item) {
      try {
        await onSaveDraft(finalPayload);
      } catch {
        return;
      }
    } else {
      try {
        await onSave(finalPayload);
      } catch {
        return;
      }
    }
    setIsDirty(false);
    setSelectedStorefrontImageFiles([]);
    onClose();
  };

  const handleSaveAndExit = async () => {
    if (item?.status === 'draft' || !item) {
      await handleSubmit(true);
      return;
    }
    await handleSubmit(false);
  };

  const parsedMarginPercent = Number.parseFloat(marginPercent);
  const hasMarginInput = marginPercent !== '' && Number.isFinite(parsedMarginPercent) && parsedMarginPercent >= 0;
  const costValueForMargin = Number.parseFloat(formData.cost_per_unit || 0);
  const suggestedSalePrice = hasMarginInput && Number.isFinite(costValueForMargin)
    ? Number((costValueForMargin * (1 + (parsedMarginPercent / 100))).toFixed(2))
    : null;

  const applySuggestedSalePrice = () => {
    if (!Number.isFinite(suggestedSalePrice)) return;
    handleChange('default_sale_price', suggestedSalePrice);
  };

  const ingredientOptions = dummyItems.filter(i => i.category === 'raw_material');

  return (
    <>
      <Dialog open={open} onOpenChange={handleClose}>
        <DialogContent
          className="pos-mobile-no-focus-zoom wizard-modal-shell wizard-modal-compact wizard-core-typography pb-0"
          onDragOver={(event) => event.preventDefault()}
          onDrop={(event) => event.preventDefault()}
        >
          <DialogHeader className="flex-shrink-0">
            <div className="flex items-start justify-between gap-4">
              <DialogTitle className="wizard-title flex items-center gap-2">
                {item ? 'Edit Item' : 'Create New Item'}
                {isEditingDraft && (
                  <Badge variant="outline" className="bg-slate-100 text-slate-700">
                    Draft
                  </Badge>
                )}
              </DialogTitle>
              <Button
                type="button"
                variant="ghost"
                size="icon"
                className="h-9 w-9 shrink-0 rounded-full text-slate-500 hover:bg-slate-100 hover:text-slate-900"
                onClick={handleClose}
                disabled={isSaving}
                aria-label={item ? 'Close edit item modal' : 'Close create item modal'}
                title="Close"
              >
                <X className="h-5 w-5" />
              </Button>
            </div>
            {msmeMode && !item && (
              <p className="text-xs text-slate-500">
                Item type: {createPreset === MSME_ITEM_PRESET.SELLABLE_POS ? 'Sell in POS (auto-show)' : 'Inventory only'}.
              </p>
            )}
          </DialogHeader>

          <div className="wizard-step-content flex-1 space-y-4 overflow-y-auto px-5 py-4 sm:px-6">
            {!item && (
              <section className="space-y-3 rounded-xl border border-blue-200 bg-blue-50/70 p-4" aria-labelledby="external-barcode-heading">
                <div className="flex items-start gap-3">
                  <div className="rounded-lg bg-white p-2 text-blue-700 shadow-sm">
                    <Barcode className="h-5 w-5" />
                  </div>
                  <div>
                    <h3 id="external-barcode-heading" className="text-sm font-semibold text-slate-900">Scan Product Barcode</h3>
                    <p className="text-xs text-slate-600">Look up valid UPC/EAN details, or explicitly save a private code as an internal POS barcode.</p>
                  </div>
                </div>
                <div className="flex flex-col gap-2 sm:flex-row">
                  <Input
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
                    placeholder="Scan or enter GTIN / UPC / EAN / internal code"
                    aria-label="Product barcode"
                    disabled={externalLookupLoading || isSaving}
                  />
                  <Button
                    type="button"
                    variant="outline"
                    className="shrink-0 bg-white"
                    onClick={() => setExternalQrScannerOpen(true)}
                    disabled={externalLookupLoading || isSaving}
                  >
                    <ScanLine className="mr-2 h-4 w-4" aria-hidden="true" />
                    Scan
                  </Button>
                  <Button
                    type="button"
                    variant="outline"
                    className="shrink-0 bg-white"
                    onClick={handleExternalProductLookup}
                    disabled={externalLookupLoading || isSaving || !externalBarcode}
                  >
                    {externalLookupLoading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Search className="mr-2 h-4 w-4" />}
                    {externalLookupLoading ? 'Looking up...' : 'Look up'}
                  </Button>
                </div>
                {externalLookupError && (
                  <p className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800" role="status">
                    {externalLookupError}
                  </p>
                )}
                {externalBarcode && getGtinValidationMessage(externalBarcode) && !useInternalBarcode && (
                  <Button
                    type="button"
                    variant="outline"
                    className="w-full border-amber-300 bg-amber-50 text-amber-900 hover:bg-amber-100 sm:w-fit"
                    onClick={handleUseInternalBarcode}
                    disabled={externalLookupLoading || isSaving}
                  >
                    Use as Internal Barcode
                  </Button>
                )}
                {useInternalBarcode && (
                  <p className="rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-xs text-emerald-900" role="status">
                    Internal barcode selected. It will be saved for this company and can be used by the POS scanner. Registry details will not be imported.
                  </p>
                )}
                {externalProductLookup?.found && (
                  <div className="rounded-xl border border-blue-200 bg-white p-3">
                    <div className="flex flex-col gap-3 sm:flex-row">
                      {externalProductLookup.product?.image_url && (
                        <img
                          src={externalProductLookup.product.image_url}
                          alt="External product preview"
                          className="h-20 w-20 shrink-0 rounded-lg border border-slate-200 object-contain"
                          loading="lazy"
                          referrerPolicy="no-referrer"
                        />
                      )}
                      <div className="min-w-0 flex-1 space-y-1">
                        <p className="font-semibold text-slate-900">{externalProductLookup.product?.name || 'Unnamed registry product'}</p>
                        {externalProductLookup.product?.brand && <p className="text-xs text-slate-600">Brand: {externalProductLookup.product.brand}</p>}
                        {externalProductLookup.product?.quantity && <p className="text-xs text-slate-600">Package: {externalProductLookup.product.quantity}</p>}
                        {externalProductLookup.product?.category_suggestion && (
                          <p className="text-xs text-slate-600">Category suggestion: {externalProductLookup.product.category_suggestion}</p>
                        )}
                        {externalProductLookup.suggested_price && (
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
                        )}
                        <p className="text-xs text-amber-700">Review before saving. The category suggestion is editable; POS image import uses the governed Add POS Item flow.</p>
                      </div>
                      <div className="flex shrink-0 flex-col gap-2">
                        <Button
                          type="button"
                          size="sm"
                          onClick={applyExternalProductDetails}
                          disabled={acceptedExternalProduct?.code === externalProductLookup.code}
                        >
                          {acceptedExternalProduct?.code === externalProductLookup.code ? <Check className="mr-2 h-4 w-4" /> : null}
                          {acceptedExternalProduct?.code === externalProductLookup.code ? 'Details selected' : 'Use product details'}
                        </Button>
                        {externalProductLookup.suggested_price && (
                          <Button
                            type="button"
                            size="sm"
                            variant="outline"
                            onClick={applyExternalSuggestedPrice}
                            disabled={Number(formData.default_sale_price) === Number(externalProductLookup.suggested_price.amount)}
                          >
                            {Number(formData.default_sale_price) === Number(externalProductLookup.suggested_price.amount) ? 'Price selected' : 'Use suggested price'}
                          </Button>
                        )}
                      </div>
                    </div>
                    <a
                      href={externalProductLookup.product?.provider_product_url || externalProductLookup.attribution?.url}
                      target="_blank"
                      rel="noreferrer"
                      className="mt-3 inline-flex items-center gap-1 text-xs font-medium text-blue-700 hover:underline"
                    >
                      {externalProductLookup.attribution?.label || 'View registry source'}
                      <ExternalLink className="h-3 w-3" />
                    </a>
                  </div>
                )}
              </section>
            )}
            {/* Basic Info */}
            <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="name">Item Name</Label>
                <Input
                  id="name"
                  value={formData.name || ''}
                  onChange={(e) => handleChange('name', e.target.value)}
                  placeholder="e.g., Sugar"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="sku">SKU Code</Label>
                <Input
                  id="sku"
                  value={formData.sku_code || ''}
                  onChange={(e) => handleSkuChange(e.target.value)}
                  placeholder="Auto-generated from item name"
                />
              </div>
            </div>

            <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
              <div className="space-y-2">
                <Label>{modeItemTaxonomy ? 'Item Type' : 'Category'}</Label>
                <Select
                  value={modeItemTaxonomy
                    ? (currentItemPreset?.key || formData.mode_preset || 'legacy_current')
                    : (formData.category || (msmeMode ? MSME_CATEGORY_VALUES.SUPPLIES : 'raw_material'))}
                  onValueChange={(v) => (modeItemTaxonomy ? handleChange('mode_preset', v) : handleChange('category', v))}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {modeItemTaxonomy ? (
                      <>
                        {!currentItemPreset && formData.category && (
                          <SelectItem value="legacy_current">
                            Legacy/current value: {formData.category}
                          </SelectItem>
                        )}
                        {modeItemTaxonomy.presets.map((presetConfig) => (
                          <SelectItem key={presetConfig.key} value={presetConfig.key}>
                            {presetConfig.label}
                          </SelectItem>
                        ))}
                      </>
                    ) : msmeMode ? (
                      <>
                        <SelectItem value={MSME_CATEGORY_VALUES.PRODUCT}>Products</SelectItem>
                        <SelectItem value={MSME_CATEGORY_VALUES.SUPPLIES}>Supplies</SelectItem>
                      </>
                    ) : (
                      <>
                        <SelectItem value="raw_material">Raw Material</SelectItem>
                        <SelectItem value="packaging">Packaging</SelectItem>
                        <SelectItem value="supplies">Supplies</SelectItem>
                      </>
                    )}
                  </SelectContent>
                </Select>
                {modeItemTaxonomy ? (
                  <p className="text-xs text-slate-500">
                    Options follow the corrected {modeItemTaxonomy.label} item taxonomy. Legacy rows stay editable without recategorizing old data.
                  </p>
                ) : msmeMode && (
                  <p className="text-xs text-slate-500">
                    MSME mode shows only Products and Supplies. Legacy raw material/packaging records remain preserved.
                  </p>
                )}
              </div>
              <div className="space-y-2">
                <Label>Unit of Measure</Label>
                <UomSelect
                  value={formData.unit_of_measure || modeItemDefaults.unit_of_measure || ''}
                  onValueChange={(v) => handleChange('unit_of_measure', v)}
                  placeholder="Select unit..."
                  allowedGroups={currentItemPreset?.allowed_uom_groups || []}
                  allowedUnits={currentItemPreset?.allowed_uoms || []}
                />
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="product_folder" className="flex items-center gap-2">
                <Folder className="w-4 h-4" />
                Category
              </Label>
              <Input
                id="product_folder"
                list={folderSuggestionsListId}
                value={formData.product_folder || ''}
                onChange={(e) => handleChange('product_folder', e.target.value)}
                placeholder="Type a category or leave blank"
                autoComplete="off"
              />
              <datalist id={folderSuggestionsListId}>
                {normalizedFolderSuggestions.map((folder) => (
                  <option key={folder} value={folder} />
                ))}
              </datalist>
              {normalizedFolderSuggestions.length > 0 && (
                <div className="flex flex-wrap gap-2">
                  {normalizedFolderSuggestions.map((folder) => (
                    <button
                      key={folder}
                      type="button"
                      onClick={() => handleChange('product_folder', folder)}
                      className="rounded-full border border-slate-200 bg-slate-50 px-2.5 py-1 text-xs font-medium text-slate-700 transition hover:border-slate-300 hover:bg-slate-100"
                    >
                      {folder}
                    </button>
                  ))}
                </div>
              )}
              <p className="text-xs text-slate-500">
                Existing categories are suggested as you type. A new category is saved automatically when you save the item.
              </p>
            </div>

            {Boolean(itemIdForFolders) && (
              <div className="space-y-2 rounded-xl border border-slate-200 bg-slate-50/60 p-4">
                <Label className="flex items-center gap-2">
                  <Tags className="w-4 h-4" />
                  Additional Categories
                </Label>
                <p className="text-xs text-slate-500">
                  Optional. List this item under up to 10 more categories, alongside its primary category above. This does not change the primary category.
                </p>
                {secondaryFoldersLoading ? (
                  <div className="flex items-center gap-2 text-sm text-slate-500">
                    <Loader2 className="w-4 h-4 animate-spin" />
                    Loading additional categories...
                  </div>
                ) : (
                  <>
                    {availableSecondaryFolders.length > 0 ? (
                      <fieldset
                        className="grid grid-cols-1 gap-2 sm:grid-cols-2"
                        disabled={!canManageFolders || secondaryFoldersSaving}
                      >
                        <legend className="sr-only">Additional categories</legend>
                        {availableSecondaryFolders
                          .map((folder) => {
                            const normalizedId = String(folder.folder_id);
                            const checked = secondaryFolderIds.includes(normalizedId);
                            const atCap = !checked && secondaryFolderIds.length >= 10;
                            return (
                              <label
                                key={folder.folder_id}
                                className={`flex min-h-11 items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-medium text-slate-700 ${atCap ? 'opacity-50' : ''}`}
                              >
                                <input
                                  type="checkbox"
                                  checked={checked}
                                  disabled={atCap}
                                  onChange={(e) => toggleSecondaryFolder(folder.folder_id, e.target.checked)}
                                />
                                {folder.name}
                              </label>
                            );
                          })}
                      </fieldset>
                    ) : (
                      <p className="text-sm text-slate-500">No other categories available yet.</p>
                    )}
                    <div className="flex items-center justify-between gap-3">
                      {canManageFolders ? (
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          onClick={saveSecondaryFolders}
                          disabled={secondaryFoldersSaving}
                        >
                          {secondaryFoldersSaving ? 'Saving...' : 'Save Additional Categories'}
                        </Button>
                      ) : (
                        <p role="status" className="text-xs text-slate-500">
                          You can review additional categories, but your role cannot change them.
                        </p>
                      )}
                      <p className="text-xs text-slate-400">{secondaryFolderIds.length}/10 selected</p>
                    </div>
                  </>
                )}
              </div>
            )}

            <div className="space-y-2">
              <Label htmlFor="description">Description</Label>
              <Textarea
                id="description"
                value={formData.description || ''}
                onChange={(e) => handleChange('description', e.target.value)}
                placeholder="Item description..."
                rows={3}
              />
            </div>

            {financialPolicy.is_pure_service && (
              <div className="rounded-lg border border-slate-200 bg-slate-50 p-3">
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <p className="text-sm font-semibold text-slate-900">Track internal service cost</p>
                    <p className="text-xs text-slate-500">Leave this off for pure service items such as a haircut.</p>
                  </div>
                  <Switch
                    checked={trackServiceCost}
                    onCheckedChange={(checked) => {
                      setTrackServiceCost(Boolean(checked));
                      if (!checked) handleChange('cost_per_unit', '');
                    }}
                  />
                </div>
              </div>
            )}

            <div className="grid grid-cols-1 gap-4 lg:grid-cols-12">
              {financialPolicy.show_cost && (
                <div className="space-y-2 lg:col-span-3">
                  <Label htmlFor="cost">Cost per Unit (PHP)</Label>
                  <Input
                    id="cost"
                    type="number"
                    step="0.01"
                    value={formData.cost_per_unit ?? ''}
                    onChange={(e) => handleChange('cost_per_unit', e.target.value === '' ? '' : parseFloat(e.target.value) || 0)}
                  />
                  {(financialPolicy.requires_cost || msmeMode) && <p className="text-xs text-slate-500">Required for this item mode</p>}
                </div>
              )}
              {financialPolicy.show_sale_price && (
                <div className="space-y-2 lg:col-span-3">
                  <Label htmlFor="sale_price">Selling Price (PHP)</Label>
                  <Input
                    id="sale_price"
                    type="number"
                    step="0.01"
                    value={formData.default_sale_price ?? ''}
                    onChange={(e) => handleChange('default_sale_price', e.target.value === '' ? '' : parseFloat(e.target.value) || 0)}
                  />
                  {(financialPolicy.requires_sale_price || msmeMode) && <p className="text-xs text-slate-500">Required before selling</p>}
                </div>
              )}
              {financialPolicy.show_cost && financialPolicy.show_sale_price && (
                <div className="space-y-2 lg:col-span-3">
                  <Label htmlFor="margin_percent">Margin % (Optional)</Label>
                  <div className="flex gap-2">
                    <Input
                      id="margin_percent"
                      type="number"
                      step="0.01"
                      value={marginPercent}
                      onChange={(e) => setMarginPercent(e.target.value)}
                      placeholder="e.g., 20"
                    />
                    <Button
                      type="button"
                      variant="outline"
                      onClick={applySuggestedSalePrice}
                      disabled={!Number.isFinite(suggestedSalePrice)}
                    >
                      Apply
                    </Button>
                  </div>
                  {Number.isFinite(suggestedSalePrice) && (
                    <p className="text-xs text-slate-500">Suggested: PHP {suggestedSalePrice.toFixed(2)}</p>
                  )}
                </div>
              )}
              <div className="space-y-2 lg:col-span-3">
                <Label>VAT Type</Label>
                <Select
                  value={formData.vat_type || 'vatable'}
                  onValueChange={(v) => handleChange('vat_type', v)}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="vatable">Vatable (12%)</SelectItem>
                    <SelectItem value="vat_exempt">VAT Exempt</SelectItem>
                    <SelectItem value="zero_rated">Zero Rated</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="flex items-center justify-between gap-3 rounded-lg border border-slate-200 bg-slate-50 p-3 lg:col-span-3">
                <div>
                  <Label htmlFor="senior-pwd-discount-eligible" className="font-semibold text-slate-900">
                    Senior/PWD Eligible
                  </Label>
                  <p className="text-xs text-slate-500">Allow this item to receive statutory Senior/PWD discounts.</p>
                </div>
                <Switch
                  id="senior-pwd-discount-eligible"
                  checked={formData.senior_pwd_discount_eligible === true}
                  onCheckedChange={(checked) => handleChange('senior_pwd_discount_eligible', Boolean(checked))}
                  disabled={isSaving}
                />
              </div>
              <div className="space-y-2 lg:col-span-6">
                <Label htmlFor="capacity">Max Capacity</Label>
                <div className="relative">
                  <Input
                    id="capacity"
                    type="number"
                    min={0}
                    step={1}
                    value={formData.max_capacity ?? ''}
                    onChange={(e) => handleChange('max_capacity', e.target.value === '' ? '' : parseFloat(e.target.value) || 0)}
                    className="pr-20"
                  />
                  {formData.unit_of_measure && (
                    <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-xs font-medium uppercase text-slate-400">
                      {formData.unit_of_measure}
                    </span>
                  )}
                </div>
              </div>
              <div className="space-y-2 lg:col-span-6">
                <Label htmlFor="stock">Current Stock</Label>
                <div className="relative">
                  <Input
                    id="stock"
                    type="number"
                    min={0}
                    step={1}
                    value={isStockExemptItem ? 0 : (formData.current_stock ?? '')}
                    onChange={(e) => handleChange('current_stock', e.target.value === '' ? '' : parseFloat(e.target.value) || 0)}
                    className="pr-20"
                    disabled={isStockExemptItem}
                  />
                  {formData.unit_of_measure && (
                    <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-xs font-medium uppercase text-slate-400">
                      {formData.unit_of_measure}
                    </span>
                  )}
                </div>
                {!isStockExemptItem ? (
                <div className="space-y-2 pt-2">
                  <Label>Stock Location</Label>
                  <Select
                    value={formData.location_id || ''}
                    onValueChange={(value) => handleChange('location_id', value)}
                    disabled={loadingLocations || activeLocations.length === 0}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder={loadingLocations ? "Loading locations..." : "Select location"} />
                    </SelectTrigger>
                    <SelectContent>
                      {activeLocations.map((location) => (
                        <SelectItem key={`item-location-${location.location_id}`} value={String(location.location_id)}>
                          {location.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  {activeLocations.length > 1 && !formData.location_id && Number(formData.current_stock || 0) > 0 && (
                    <p className="text-xs text-red-600">Required when setting stock in a multi-location tenant.</p>
                  )}
                </div>
                ) : (
                  <p className="text-xs text-slate-500">This item type is stock-exempt and does not create inventory batches.</p>
                )}
              </div>
            </div>

            {/* Auto-calculated fields - values set by backend based on system settings */}
            <div className="grid grid-cols-1 gap-4 rounded-lg bg-slate-50 p-4 md:grid-cols-2">
              <div>
                <p className="text-sm text-slate-500">Min Threshold (auto-calculated)</p>
                <p className="font-semibold text-slate-900">{formData.min_threshold ?? 'Auto'} {formData.unit_of_measure}</p>
              </div>
              <div>
                <p className="text-sm text-slate-500">Purchase Allowance (auto-calculated)</p>
                <p className="font-semibold text-slate-900">{formData.purchase_allowance ?? 'Auto'} {formData.unit_of_measure}</p>
              </div>
            </div>

            <div className="space-y-3 rounded-lg border border-slate-200 bg-slate-50 p-4">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div>
                  <Label>POS Setup (Optional)</Label>
                  <p className="text-xs text-slate-500">
                    Configure how this item appears in POS. Item images are managed in Storefront Catalog and used by POS terminal cards.
                  </p>
                </div>
                <div className="flex flex-wrap gap-2">
                  {item && (
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={() => onTogglePosVisibility && onTogglePosVisibility(item, !(posConfig?.pos_visible !== false))}
                      disabled={!onTogglePosVisibility}
                    >
                      {posConfig?.pos_visible !== false ? 'Disable in POS' : 'Enable in POS'}
                    </Button>
                  )}
                  {item && (
                    <Button
                      type="button"
                      variant={posConfig?.pos_always_available === true ? 'default' : 'outline'}
                      size="sm"
                      onClick={() => onTogglePosAlwaysAvailable && onTogglePosAlwaysAvailable(item, posConfig?.pos_always_available !== true)}
                      disabled={!onTogglePosAlwaysAvailable}
                    >
                      {posConfig?.pos_always_available === true ? 'Always Available: On' : 'Always Available: Off'}
                    </Button>
                  )}
                  {onOpenBulkPosSetup && (
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={onOpenBulkPosSetup}
                    >
                      Open Bulk POS Setup
                    </Button>
                  )}
                </div>
              </div>

              <div className="flex items-center justify-between gap-3 rounded-lg border border-slate-200 bg-white p-3">
                <div>
                  <Label htmlFor="pos-always-available" className="font-semibold text-slate-900">
                    Always Available
                  </Label>
                  <p className="text-xs text-slate-500">
                    Keep this item sellable in POS even when inventory stock is depleted.
                  </p>
                </div>
                <Switch
                  id="pos-always-available"
                  checked={formData.pos_always_available === true}
                  onCheckedChange={(checked) => handleChange('pos_always_available', Boolean(checked))}
                  disabled={isSaving}
                />
              </div>

              {Array.isArray(posConfig?.pos_readiness?.missing_requirements) && posConfig.pos_readiness.missing_requirements.length > 0 && (
                <div className="rounded-md border border-amber-200 bg-amber-50 p-3">
                  <p className="text-xs font-semibold text-amber-900">POS readiness requirements</p>
                  <ul className="mt-1 list-disc space-y-1 pl-4 text-xs text-amber-800">
                    {posConfig.pos_readiness.missing_requirements.map((entry, index) => (
                      <li key={`${entry?.code || 'missing'}-${index}`}>
                        {entry?.label || entry?.code || 'Complete missing requirement'}
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              {item ? (
                <p className="text-sm text-slate-500">
                  POS terminal cards use the item images added in Storefront Catalog below.
                </p>
              ) : (
                <p className="text-sm text-slate-500">
                  Save the item first, then reopen it to complete POS setup.
                </p>
              )}
            </div>

            {showStorefrontCatalogControls && (
            <div className="space-y-3 rounded-lg border border-slate-200 bg-slate-50 p-4">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div>
                  <Label>Storefront Catalog (Optional)</Label>
                  <p className="text-xs text-slate-500">
                    Configure customer-facing catalog visibility separately while sharing item images with POS.
                  </p>
                </div>
                {item && (
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => onToggleStorefrontVisibility && onToggleStorefrontVisibility(item, !(storefrontConfig?.storefront_visible !== false))}
                    disabled={!onToggleStorefrontVisibility}
                  >
                    {storefrontConfig?.storefront_visible !== false ? 'Disable in Storefront' : 'Enable in Storefront'}
                  </Button>
                )}
              </div>

              {storefrontLocationAvailability.length > 0 && (
                <div className="rounded-md border border-slate-200 bg-white p-3">
                  <div className="mb-2 flex items-center justify-between gap-3">
                    <div>
                      <p className="text-sm font-semibold text-slate-900">Branch availability</p>
                      <p className="text-xs text-slate-500">Controls where this item appears inside the tenant store.</p>
                    </div>
                    <Badge variant="outline">
                      {storefrontLocationAvailability.filter((row) => row.storefront_available !== false).length}/{storefrontLocationAvailability.length}
                    </Badge>
                  </div>
                  <div className="grid gap-2 sm:grid-cols-2">
                    {storefrontLocationAvailability.map((location) => (
                      <div key={location.location_id} className="flex items-center justify-between gap-3 rounded-md border border-slate-100 px-3 py-2">
                        <div className="min-w-0">
                          <p className="truncate text-sm font-medium text-slate-800">{location.name || `Location ${location.location_id}`}</p>
                          <p className="text-xs text-slate-500">{location.is_primary_storefront ? 'Main branch' : 'Branch'}</p>
                        </div>
                        <Switch
                          checked={location.storefront_available !== false}
                          onCheckedChange={(checked) => handleStorefrontLocationAvailabilityChange(location.location_id, checked)}
                          disabled={item ? !onToggleStorefrontLocationAvailability : false}
                          aria-label={`Toggle storefront availability for ${location.name || location.location_id}`}
                        />
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {item ? (
                <div className="space-y-3">
                  {storefrontGallery.length > 0 ? (
                    <StorefrontImageCarousel
                      gallery={storefrontGallery}
                      itemName={item.name}
                      variant="wizard"
                      onSetPrimary={(index) => onSetPrimaryStorefrontImage && onSetPrimaryStorefrontImage(item, index)}
                      onRemove={(index) => onDeleteStorefrontImage && onDeleteStorefrontImage(item, index)}
                    />
                  ) : (
                    <p className="text-sm text-slate-500">No item image uploaded yet.</p>
                  )}
                  <div className="flex flex-wrap gap-2">
                    <label
                      className={`rounded-md border border-slate-300 px-3 py-2 text-sm ${storefrontGallery.length >= STOREFRONT_ITEM_IMAGE_MAX_COUNT ? 'cursor-not-allowed bg-slate-100 text-slate-400' : 'cursor-pointer bg-white hover:bg-slate-100'}`}
                      aria-disabled={storefrontGallery.length >= STOREFRONT_ITEM_IMAGE_MAX_COUNT}
                    >
                      Add Item Images
                      <input
                        type="file"
                        accept="image/*"
                        multiple
                        className="hidden"
                        onChange={(event) => {
                          const remainingSlots = STOREFRONT_ITEM_IMAGE_MAX_COUNT - storefrontGallery.length;
                          const selectedFiles = Array.from(event.target.files || []);
                          const files = selectedFiles.slice(0, Math.max(remainingSlots, 0));
                          if (selectedFiles.length > files.length) {
                            toast.error(`Only ${Math.max(remainingSlots, 0)} more item image${remainingSlots === 1 ? '' : 's'} can be uploaded. Galleries are limited to ${STOREFRONT_ITEM_IMAGE_MAX_COUNT} images.`);
                          }
                          if (files.length && onUploadStorefrontImage) {
                            onUploadStorefrontImage(item, files);
                          }
                          event.target.value = '';
                        }}
                        disabled={storefrontGallery.length >= STOREFRONT_ITEM_IMAGE_MAX_COUNT}
                      />
                    </label>
                    <p className="basis-full text-xs text-slate-500">
                      {Math.max(STOREFRONT_ITEM_IMAGE_MAX_COUNT - storefrontGallery.length, 0)} of {STOREFRONT_ITEM_IMAGE_MAX_COUNT} image slots remaining.
                    </p>
                    <Button
                      type="button"
                      variant="outline"
                      onClick={() => onDeleteStorefrontImage && onDeleteStorefrontImage(item)}
                      disabled={storefrontGallery.length === 0 || !onDeleteStorefrontImage}
                    >
                      Remove All Item Images
                    </Button>
                    {onGenerateStorefrontImage && (
                      <Button
                        type="button"
                        variant="outline"
                        disabled={generatingImage}
                        onClick={async () => {
                          setGeneratingImage(true);
                          try {
                            await onGenerateStorefrontImage(item);
                          } finally {
                            setGeneratingImage(false);
                          }
                        }}
                        title={
                          storefrontGallery.length > 0
                            ? 'Generate a new AI photo, replacing the current one.'
                            : 'Generate an AI photo for this item (watermarked).'
                        }
                      >
                        {generatingImage
                          ? 'Queuing…'
                          : storefrontGallery.length > 0 ? 'Regenerate Image (AI)' : 'Generate Image (AI)'}
                      </Button>
                    )}
                  </div>
                </div>
              ) : (
                <div
                  data-testid="item-image-drop-zone"
                  className={`space-y-3 rounded-lg border-2 border-dashed p-4 transition-colors ${isStorefrontImageDragActive ? 'border-teal-500 bg-teal-50' : 'border-slate-300 bg-slate-50'}`}
                  onDragEnter={(event) => {
                    event.preventDefault();
                    setIsStorefrontImageDragActive(true);
                  }}
                  onDragOver={(event) => {
                    event.preventDefault();
                    event.dataTransfer.dropEffect = 'copy';
                    setIsStorefrontImageDragActive(true);
                  }}
                  onDragLeave={(event) => {
                    if (!event.currentTarget.contains(event.relatedTarget)) {
                      setIsStorefrontImageDragActive(false);
                    }
                  }}
                  onDrop={handleStorefrontImageDrop}
                >
                  <p className="text-sm text-slate-500">
                    Drag item images here, or choose them from your device. They will be uploaded after the item is saved.
                  </p>
                  <label className="inline-flex cursor-pointer rounded-md border border-slate-300 bg-white px-3 py-2 text-sm hover:bg-slate-100">
                    Choose Item Images
                    <input
                      type="file"
                      accept="image/*"
                      multiple
                      className="hidden"
                      onChange={(event) => {
                        handleSelectStorefrontImageFiles(Array.from(event.target.files || []));
                        event.target.value = '';
                      }}
                    />
                  </label>
                  <p className="text-xs text-slate-500">
                    {Math.max(STOREFRONT_ITEM_IMAGE_MAX_COUNT - selectedStorefrontImageFiles.length, 0)} of {STOREFRONT_ITEM_IMAGE_MAX_COUNT} image slots remaining.
                  </p>
                  <SelectedItemImageCarousel
                    files={selectedStorefrontImageFiles}
                    itemName={formData.name || 'Item'}
                    disabled={isSaving}
                    onRemove={removeSelectedStorefrontImageFile}
                  />
                </div>
              )}
            </div>
            )}

            {msmeMode && (
              <div className="space-y-3 rounded-lg border border-slate-200 bg-slate-50 p-4">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div>
                    <Label>Suppliers (Optional)</Label>
                    <p className="text-xs text-slate-500">
                      Add existing suppliers or quickly create one here, then save supplier MOQ and unit cost per item.
                    </p>
                  </div>
                  <div className="flex gap-2">
                    <Button type="button" variant="outline" size="sm" onClick={() => openCreateSupplierDialog(null)}>
                      <Plus className="mr-1 h-4 w-4" />
                      New Supplier
                    </Button>
                    <Button type="button" variant="outline" size="sm" onClick={addSupplierLink}>
                      <Plus className="mr-1 h-4 w-4" />
                      Add Row
                    </Button>
                  </div>
                </div>

                {loadingSuppliers && (
                  <p className="text-xs text-slate-500">Loading suppliers...</p>
                )}

                {(formData.supplier_links || []).length === 0 && (
                  <p className="text-sm text-slate-500">No suppliers attached yet.</p>
                )}

                {(formData.supplier_links || []).map((link, index) => (
                  <div key={`supplier-link-${index}`} className="grid grid-cols-1 gap-2 rounded-md border border-slate-200 bg-white p-3 lg:grid-cols-12">
                    <div className="lg:col-span-5">
                      <Label className="text-xs text-slate-600">Supplier</Label>
                      <Select
                        value={String(link.supplier_id || '')}
                        onValueChange={(value) => updateSupplierLink(index, 'supplier_id', value)}
                      >
                        <SelectTrigger>
                          <SelectValue placeholder="Select supplier" />
                        </SelectTrigger>
                        <SelectContent>
                          {supplierOptions.map((supplierOption) => (
                            <SelectItem
                              key={supplierOption.supplier_id || supplierOption.id}
                              value={String(supplierOption.supplier_id || supplierOption.id)}
                            >
                              {supplierOption.name}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="lg:col-span-2">
                      <Label className="text-xs text-slate-600">MOQ</Label>
                      <Input
                        type="number"
                        min={0}
                        step="0.01"
                        value={link.moq ?? ''}
                        onChange={(e) => updateSupplierLink(index, 'moq', e.target.value === '' ? '' : parseFloat(e.target.value) || 0)}
                      />
                    </div>
                    <div className="lg:col-span-3">
                      <Label className="text-xs text-slate-600">Supplier Unit Cost</Label>
                      <Input
                        type="number"
                        min={0}
                        step="0.01"
                        value={link.price_per_unit ?? ''}
                        onChange={(e) => updateSupplierLink(index, 'price_per_unit', e.target.value === '' ? '' : parseFloat(e.target.value) || 0)}
                      />
                    </div>
                    <div className="flex items-end gap-2 lg:col-span-2">
                      <Button type="button" variant="outline" size="sm" onClick={() => openCreateSupplierDialog(index)}>
                        New
                      </Button>
                      <Button type="button" variant="outline" size="sm" onClick={() => removeSupplierLink(index)}>
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  </div>
                ))}
              </div>
            )}

            {/* FIFO Tracking Option - Available for all physically trackable items */}
            {!isStockExemptItem && (formData.category === 'raw_material' || formData.category === 'product' || formData.category === 'packaging' || formData.category === 'supplies') && (
              <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
                <div className="flex items-start justify-between">
                  <div className="flex items-start gap-3 flex-1">
                    <div className="w-10 h-10 rounded-lg bg-blue-100 flex items-center justify-center flex-shrink-0">
                      <Package className="w-5 h-5 text-blue-600" />
                    </div>
                    <div className="flex-1 space-y-1">
                      <div className="flex items-center gap-2">
                        <Label htmlFor="fifo-toggle" className="font-semibold text-slate-900 cursor-pointer">
                          Enable FIFO Batch Tracking
                        </Label>
                      </div>
                      <p className="text-sm text-slate-600">
                        Track inventory in batches with automatic First-In-First-Out consumption.
                        Useful for cost tracking, lot traceability, and items with expiry dates.
                      </p>
                    </div>
                  </div>
                  <Switch
                    id="fifo-toggle"
                    checked={formData.fifo_enabled || false}
                    onCheckedChange={(checked) => handleChange('fifo_enabled', checked)}
                  />
                </div>

                {/* Shelf Life Fields - shown when FIFO is enabled (optional for non-perishables) */}
                {formData.fifo_enabled && (
                  <div className="mt-4 pt-4 border-t border-blue-200">
                    <p className="text-xs text-slate-500 mb-3">
                      Expiry tracking is optional. Leave blank for non-perishable items (e.g., packaging, supplies).
                    </p>
            <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                      <div className="space-y-2">
                        <Label htmlFor="shelf_life_days" className="text-sm font-medium text-slate-700">
                          Shelf Life (Days)
                        </Label>
                        <Input
                          id="shelf_life_days"
                          type="number"
                          min="1"
                          value={formData.shelf_life_days}
                          onChange={(e) => handleChange('shelf_life_days', e.target.value === '' ? '' : parseInt(e.target.value) || '')}
                          placeholder="Leave blank if no expiry"
                          className="bg-white"
                        />
                        <p className="text-xs text-slate-500">Days until expiry (unopened)</p>
                      </div>
                      <div className="space-y-2">
                        <Label htmlFor="opened_shelf_life_days" className="text-sm font-medium text-slate-700">
                          Opened Shelf Life (Days)
                        </Label>
                        <Input
                          id="opened_shelf_life_days"
                          type="number"
                          min="1"
                          value={formData.opened_shelf_life_days}
                          onChange={(e) => handleChange('opened_shelf_life_days', e.target.value === '' ? '' : parseInt(e.target.value) || '')}
                          placeholder="Leave blank if no expiry"
                          className="bg-white"
                        />
                        <p className="text-xs text-slate-500">Days after opening</p>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* Packaging Specs */}
            {formData.category === 'packaging' && (
              <div className="space-y-4">
                <Label>Packaging Specifications</Label>
                <div className="grid grid-cols-3 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="height">Height</Label>
                    <Input
                      id="height"
                      value={formData.packaging_specs?.height || ''}
                      onChange={(e) => handlePackagingChange('height', e.target.value)}
                      placeholder="e.g., 6 inches"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="width">Width</Label>
                    <Input
                      id="width"
                      value={formData.packaging_specs?.width || ''}
                      onChange={(e) => handlePackagingChange('width', e.target.value)}
                      placeholder="e.g., 2 inches"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="thickness">Thickness</Label>
                    <Input
                      id="thickness"
                      value={formData.packaging_specs?.thickness || ''}
                      onChange={(e) => handlePackagingChange('thickness', e.target.value)}
                      placeholder="e.g., 3mm"
                    />
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="material">Material</Label>
                    <Input
                      id="material"
                      value={formData.packaging_specs?.material || ''}
                      onChange={(e) => handlePackagingChange('material', e.target.value)}
                      placeholder="e.g., Borosilicate Glass"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="design">Design</Label>
                    <Input
                      id="design"
                      value={formData.packaging_specs?.design || ''}
                      onChange={(e) => handlePackagingChange('design', e.target.value)}
                      placeholder="e.g., Clear with embossed logo"
                    />
                  </div>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="contents">Contents Description</Label>
                  <Textarea
                    id="contents"
                    value={formData.packaging_specs?.contents || ''}
                    onChange={(e) => handlePackagingChange('contents', e.target.value)}
                    placeholder="What this packaging can hold..."
                    rows={2}
                  />
                </div>
              </div>
            )}
          </div>

          <DialogFooter className="wizard-footer flex-shrink-0 border-t border-slate-200 pt-4 flex flex-col-reverse gap-2 sm:flex-row sm:flex-wrap sm:justify-end">
            <Button variant="outline" onClick={handleClose} disabled={isSaving}>Cancel</Button>
            {((item && item.status !== 'draft') || onSaveDraft) && (
              <Button
                variant="outline"
                onClick={() => runSaveAction('save-exit', handleSaveAndExit)}
                disabled={isSaving}
              >
                {savingAction === 'save-exit' ? 'Saving...' : 'Save and exit'}
              </Button>
            )}
            {isEditingDraft ? (
              <Button
                onClick={() => runSaveAction('finalize', handleFinalize)}
                className="bg-teal-600 hover:bg-teal-700"
                disabled={isSaving}
              >
                {savingAction === 'finalize' ? 'Saving...' : 'Finalize Item'}
              </Button>
            ) : (
              <Button
                onClick={() => runSaveAction('submit', () => handleSubmit(false))}
                className="bg-teal-600 hover:bg-teal-700"
                disabled={isSaving}
              >
                {savingAction === 'submit' ? 'Saving...' : (item ? 'Update Item' : 'Create Item')}
              </Button>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <ProductQrScannerModal
        open={externalQrScannerOpen}
        onOpenChange={setExternalQrScannerOpen}
        onDetected={handleExternalQrDetected}
      />

      <Dialog open={showCreateSupplierDialog} onOpenChange={setShowCreateSupplierDialog}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Create Supplier</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div className="space-y-2">
              <Label htmlFor="inline_supplier_name">Supplier Name</Label>
              <Input
                id="inline_supplier_name"
                value={newSupplierForm.name}
                onChange={(e) => setNewSupplierForm((prev) => ({ ...prev, name: e.target.value }))}
                placeholder="e.g., ABC Trading"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="inline_supplier_contact">Contact Person</Label>
              <Input
                id="inline_supplier_contact"
                value={newSupplierForm.contact_person}
                onChange={(e) => setNewSupplierForm((prev) => ({ ...prev, contact_person: e.target.value }))}
                placeholder="Optional"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="inline_supplier_phone">Phone</Label>
              <Input
                id="inline_supplier_phone"
                value={newSupplierForm.phone}
                onChange={(e) => setNewSupplierForm((prev) => ({ ...prev, phone: e.target.value }))}
                placeholder="Optional"
              />
            </div>
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setShowCreateSupplierDialog(false)}>
              Cancel
            </Button>
            <Button type="button" onClick={handleCreateSupplierFromItemForm} disabled={creatingSupplier}>
              {creatingSupplier ? 'Creating...' : 'Create Supplier'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <ConfirmationDialog
        open={showConfirmation}
        onOpenChange={setShowConfirmation}
        title="Save Draft?"
        message="You have unsaved changes. Would you like to save them as a draft?"
        onSaveDraft={() => runSaveAction('save-draft', handleSaveDraft)}
        onDiscard={() => {
          setIsDirty(false);
          onClose();
        }}
        onContinueEditing={() => setShowConfirmation(false)}
      />
    </>
  );
}
