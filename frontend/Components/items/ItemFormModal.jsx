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
import { Plus, Trash2, Package, Folder } from 'lucide-react';
import { Switch } from "@/components/ui/switch";
import { dummyItems } from '@/components/data/dummyData';
import ConfirmationDialog from '@/components/ui/ConfirmationDialog';
import { Badge } from "@/components/ui/badge";
import { UomSelect } from '@/components/ui/UomSelect';
import { createSupplier, getSuppliers } from '@/src/services/supplierService.js';
import { useLocations } from '@/src/hooks/useLocations.js';
import { resolveAssetUrl } from '@/src/utils/assetUrl.js';
import { suggestNextSku } from '@/src/features/inventory/utils/skuSuggestion.js';
import { resolveBusinessModeItemDefaults } from '@/src/features/settings/businessModeTemplates.js';
import {
  findItemPresetForValues,
  resolveItemPreset,
  resolveModeItemTaxonomy
} from '@/src/features/settings/modeItemTaxonomy.js';
import { resolveItemFinancialPolicy } from '@/src/features/inventory/itemFinancialPolicy.js';
import { toast } from 'sonner';

const MSME_ITEM_PRESET = Object.freeze({
  SELLABLE_POS: 'sellable_pos',
  INVENTORY_ONLY: 'inventory_only'
});

const MSME_VISIBLE_UPDATE_FIELDS = Object.freeze([
  'sku_code',
  'name',
  'category',
  'description',
  'unit_of_measure',
  'cost_per_unit',
  'default_sale_price',
  'vat_type',
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
  existingItems = [],
  workflowMode = 'manufacturing',
  msmeMode = false,
  createPreset = MSME_ITEM_PRESET.INVENTORY_ONLY,
  posConfig = null,
  storefrontConfig = null,
  showStorefrontCatalogControls = true,
  onTogglePosVisibility,
  onUploadPosImage,
  onDeletePosImage,
  onToggleStorefrontVisibility,
  onUploadStorefrontImage,
  onSetPrimaryStorefrontImage,
  onDeleteStorefrontImage,
  onOpenBulkPosSetup
}) {
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
  const modeItemDefaults = useMemo(
    () => resolveBusinessModeItemDefaults(workflowMode),
    [workflowMode]
  );
  const storefrontGallery = useMemo(() => {
    const entries = Array.isArray(storefrontConfig?.storefront_image_gallery)
      ? storefrontConfig.storefront_image_gallery
      : [];
    const gallery = entries
      .map((entry, index) => ({
        path: entry?.path || null,
        url: entry?.url || entry?.image_url || entry,
        is_primary: index === 0,
        sort_order: index
      }))
      .filter((entry) => entry.path || entry.url);
    const primaryUrl = storefrontConfig?.storefront_image_url || null;
    if (primaryUrl && !gallery.some((entry) => entry.url === primaryUrl)) {
      gallery.unshift({
        path: storefrontConfig?.storefront_image_path || null,
        url: primaryUrl,
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
  const isStockExemptItem = currentItemPreset?.stock_behavior === 'stock_exempt' || formData.category === 'service';
  const financialPolicy = useMemo(() => resolveItemFinancialPolicy({
    workflowMode,
    item: {
      ...formData,
      mode_item_preset: currentItemPreset?.key || formData.mode_preset || null
    },
    preset: currentItemPreset,
    posVisible: posConfig?.pos_visible === true,
    storefrontVisible: storefrontConfig?.storefront_visible === true,
    serviceCostTrackingEnabled: trackServiceCost
  }), [currentItemPreset, formData, posConfig?.pos_visible, storefrontConfig?.storefront_visible, trackServiceCost, workflowMode]);
  const { locations, loading: loadingLocations } = useLocations();
  const activeLocations = useMemo(
    () => (Array.isArray(locations) ? locations.filter((location) => location?.is_active !== false) : []),
    [locations]
  );
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
  const isEditingDraft = item?.status === 'draft';
  const isSaving = Boolean(savingAction);

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
      setTrackServiceCost(false);
      setMsmeOriginalCategory(null);
      setMsmeCategoryTouched(false);
    }
  }, [createPreset, item, modeItemDefaults, modeItemTaxonomy, msmeMode, open, activeLocations, workflowMode]);

  // Track dirty state
  useEffect(() => {
    if (initialFormData && !item) {
      const hasChanged = JSON.stringify(formData) !== JSON.stringify(initialFormData);
      setIsDirty(hasChanged);
    }
  }, [formData, initialFormData, item]);

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

  const handleClose = () => {
    if (savingActionRef.current) return;
    if (isDirty && !item) {
      setShowConfirmation(true);
    } else {
      onClose();
    }
  };

  const handleSaveDraft = async () => {
    const draftData = {
      ...formData,
      status: 'draft'
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
      mode_item_preset: modeItemTaxonomy ? (currentItemPreset?.key || cleanedData.mode_preset || null) : null,
      description: cleanedData.description || '',
      unit_of_measure: cleanedData.unit_of_measure || modeItemDefaults.unit_of_measure || '',
      cost_per_unit: financialPolicy.show_cost ? toNumberOrNull(cleanedData.cost_per_unit) : null,
      default_sale_price: toNumberOrNull(cleanedData.default_sale_price),
      vat_type: cleanedData.vat_type || 'vatable',
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
      status: isDraft ? 'draft' : (item?.status || 'active'),
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
        supplier_links: normalizedSupplierLinks,
        supplier_links_dirty: !areSupplierLinksEqual(normalizedSupplierLinks, item?.suppliers || [])
      }
      : submitPayload;

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
        <DialogContent className="wizard-modal-shell wizard-modal-compact wizard-core-typography max-h-[90vh] max-w-4xl overflow-y-auto pb-6">
          <DialogHeader>
            <DialogTitle className="wizard-title flex items-center gap-2">
              {item ? 'Edit Item' : 'Create New Item'}
              {isEditingDraft && (
                <Badge variant="outline" className="bg-slate-100 text-slate-700">
                  Draft
                </Badge>
              )}
            </DialogTitle>
            {msmeMode && !item && (
              <p className="text-xs text-slate-500">
                Item type: {createPreset === MSME_ITEM_PRESET.SELLABLE_POS ? 'Sell in POS (auto-show)' : 'Inventory only'}.
              </p>
            )}
          </DialogHeader>

          <div className="wizard-step-content space-y-4">
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

            {/* Folder Assignment */}
            {folders.length > 0 && (
              <div className="space-y-2">
                <Label className="flex items-center gap-2">
                  <Folder className="w-4 h-4" />
                  Folder
                </Label>
                <Select
                  value={formData.product_folder || '__none__'}
                  onValueChange={(v) => handleChange('product_folder', v === '__none__' ? '' : v)}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="No folder (uncategorized)" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="__none__">No folder (uncategorized)</SelectItem>
                    {folders.map(folder => (
                      <SelectItem key={folder} value={folder}>{folder}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <p className="text-xs text-slate-500">Assign this item to a folder for organization</p>
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
                    Configure how this item appears in POS and upload a menu image.
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
                <div className="space-y-3">
                  {posConfig?.pos_image_url ? (
                    <img
                      src={resolveAssetUrl(posConfig.pos_image_url)}
                      alt={`${item.name} POS menu`}
                      className="h-28 w-40 rounded-md border border-slate-200 object-cover"
                    />
                  ) : (
                    <p className="text-sm text-slate-500">No POS image uploaded yet.</p>
                  )}
                  <div className="flex flex-wrap gap-2">
                    <label className="cursor-pointer rounded-md border border-slate-300 bg-white px-3 py-2 text-sm hover:bg-slate-100">
                      Upload Image
                      <input
                        type="file"
                        accept="image/*"
                        className="hidden"
                        onChange={(event) => {
                          const file = event.target.files?.[0];
                          if (file && onUploadPosImage) {
                            onUploadPosImage(item, file);
                          }
                          event.target.value = '';
                        }}
                      />
                    </label>
                    <Button
                      type="button"
                      variant="outline"
                      onClick={() => onDeletePosImage && onDeletePosImage(item)}
                      disabled={!posConfig?.pos_image_url || !onDeletePosImage}
                    >
                      Remove Image
                    </Button>
                  </div>
                </div>
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
                    Configure customer-facing catalog visibility and item image independently from POS.
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

              {item ? (
                <div className="space-y-3">
                  {storefrontGallery.length > 0 ? (
                    <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
                      {storefrontGallery.map((entry, index) => (
                        <div key={`${entry.url || entry.path}-${index}`} className="rounded-md border border-slate-200 bg-white p-2">
                          <div className="relative">
                            <img
                              src={resolveAssetUrl(entry.url || entry.path)}
                              alt={`${item.name} storefront image ${index + 1}`}
                              className="h-24 w-full rounded-md object-cover"
                            />
                            {index === 0 && (
                              <Badge className="absolute left-2 top-2 bg-emerald-600 text-white hover:bg-emerald-600">
                                Primary
                              </Badge>
                            )}
                          </div>
                          <div className="mt-2 flex flex-wrap gap-2">
                            {index > 0 && (
                              <Button
                                type="button"
                                variant="outline"
                                size="sm"
                                onClick={() => onSetPrimaryStorefrontImage && onSetPrimaryStorefrontImage(item, index)}
                                disabled={!onSetPrimaryStorefrontImage}
                              >
                                Set first
                              </Button>
                            )}
                            <Button
                              type="button"
                              variant="outline"
                              size="sm"
                              onClick={() => onDeleteStorefrontImage && onDeleteStorefrontImage(item, index)}
                              disabled={!onDeleteStorefrontImage}
                            >
                              Remove
                            </Button>
                          </div>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <p className="text-sm text-slate-500">No item image uploaded yet.</p>
                  )}
                  <div className="flex flex-wrap gap-2">
                    <label className="cursor-pointer rounded-md border border-slate-300 bg-white px-3 py-2 text-sm hover:bg-slate-100">
                      Add Item Images
                      <input
                        type="file"
                        accept="image/*"
                        multiple
                        className="hidden"
                        onChange={(event) => {
                          const files = Array.from(event.target.files || []);
                          if (files.length && onUploadStorefrontImage) {
                            onUploadStorefrontImage(item, files);
                          }
                          event.target.value = '';
                        }}
                      />
                    </label>
                    <Button
                      type="button"
                      variant="outline"
                      onClick={() => onDeleteStorefrontImage && onDeleteStorefrontImage(item)}
                      disabled={storefrontGallery.length === 0 || !onDeleteStorefrontImage}
                    >
                      Remove All Item Images
                    </Button>
                  </div>
                </div>
              ) : (
                <p className="text-sm text-slate-500">
                  Save the item first, then reopen it to complete item image setup.
                </p>
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

          <DialogFooter className="wizard-footer pt-8 flex flex-col-reverse gap-2 sm:flex-row sm:flex-wrap sm:justify-end">
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
