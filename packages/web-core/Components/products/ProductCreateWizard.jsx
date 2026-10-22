import React, { useState, useMemo, useEffect, useRef } from 'react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Check, ArrowRight, ArrowLeft, Package, FileEdit, X } from 'lucide-react';
import ConfirmationDialog from '@/components/ui/ConfirmationDialog';
import { validateComposition, showValidationErrors } from '../utils/compositionValidation';
import { useLocations } from '@/hooks/useLocations.js';
import { suggestNextSku } from '@/src/features/inventory/utils/skuSuggestion.js';
import {
  buildStockAllocationDraft,
  buildStockAllocations
} from '@/src/features/inventory/utils/stockAllocations.js';
import { resolveBusinessModeProductDefaults } from '@/src/features/settings/businessModeTemplates.js';
import { normalizeWorkflowMode } from '@/src/features/settings/workflowMode.js';
import { toast } from 'sonner';

// Import step components
import BasicInfoStep from './wizard/BasicInfoStep';
import RecipeFormulationStep from './wizard/RecipeFormulationStep';
import YieldManagementStep from './wizard/YieldManagementStep';
import NutritionalInfoStep from './wizard/NutritionalInfoStep';
import AllergenManagementStep from './wizard/AllergenManagementStep';
import PhysicalPropertiesStep from './wizard/PhysicalPropertiesStep';
import ShelfLifeStep from './wizard/ShelfLifeStep';
import PackagingLabelingStep from './wizard/PackagingLabelingStep';
import CostFinancialStep from './wizard/CostFinancialStep';
import QualityControlStep from './wizard/QualityControlStep';
import RegulatoryComplianceStep from './wizard/RegulatoryComplianceStep';
import POSSetupStep from './wizard/POSSetupStep';
import {
  ProductBarcodesAndReviewStep,
  ProductWizardGroupStep
} from './wizard/ProductWizardGroupedSteps';

const LEGACY_PRODUCT_WIZARD_STEP_KEYS = [
  'basic_info',
  'pos_setup',
  'recipe_ingredients',
  'yield_loss',
  'nutrition',
  'allergens',
  'physical_properties',
  'shelf_life',
  'packaging',
  'costing',
  'quality_control',
  'compliance',
  'review'
];

export const PRODUCT_WIZARD_STEP_DEFINITIONS = [
  {
    key: 'basic_info',
    name: 'Basic Information',
    description: 'Product identity, category, inventory settings, and VAT setup.',
    component: ProductWizardGroupStep,
    sections: [{
      key: 'basic_info',
      label: 'Basic Information',
      description: 'Name, category, SKU, inventory, and VAT setup.',
      component: BasicInfoStep
    }],
    legacyKeys: ['basic_info']
  },
  {
    key: 'pos_selling',
    name: 'POS & Selling',
    description: 'POS visibility, selling controls, Storefront visibility, and item images.',
    component: ProductWizardGroupStep,
    sections: [{
      key: 'pos_setup',
      label: 'POS Setup',
      description: 'Selling controls, POS visibility, and Storefront settings.',
      component: POSSetupStep
    }],
    legacyKeys: ['pos_setup']
  },
  {
    key: 'inventory_storage',
    name: 'Inventory & Storage',
    description: 'Shelf life, storage conditions, packaging, and labeling details.',
    component: ProductWizardGroupStep,
    sections: [
      {
        key: 'shelf_life',
        label: 'Shelf Life & Storage',
        description: 'Expiry, storage conditions, and FIFO settings.',
        component: ShelfLifeStep
      },
      {
        key: 'packaging',
        label: 'Packaging & Labels',
        description: 'Packaging items and labeling details.',
        component: PackagingLabelingStep
      }
    ],
    legacyKeys: ['shelf_life', 'packaging']
  },
  {
    key: 'recipe_cost_compliance',
    name: 'Recipe, Cost & Compliance',
    description: 'Recipe, yield, nutrition, allergens, costing, quality, and compliance details.',
    component: ProductWizardGroupStep,
    sections: [
      {
        key: 'recipe_ingredients',
        label: 'Recipe & Ingredients',
        description: 'Build the recipe and choose ingredient quantities.',
        component: RecipeFormulationStep
      },
      {
        key: 'yield_loss',
        label: 'Yield & Loss',
        description: 'Set batch output and processing loss assumptions.',
        component: YieldManagementStep
      },
      {
        key: 'nutrition',
        label: 'Nutrition',
        description: 'Record nutrition information shown with the product.',
        component: NutritionalInfoStep
      },
      {
        key: 'allergens',
        label: 'Allergens',
        description: 'Identify allergens and cross-contact warnings.',
        component: AllergenManagementStep
      },
      {
        key: 'physical_properties',
        label: 'Properties',
        description: 'Capture physical specifications for manufactured goods.',
        component: PhysicalPropertiesStep,
        excludeModes: ['fnb']
      },
      {
        key: 'costing',
        label: 'Cost & Financial',
        description: 'Review cost, margin, and financial settings.',
        component: CostFinancialStep
      },
      {
        key: 'quality_control',
        label: 'Quality Control',
        description: 'Define quality checks and acceptance criteria.',
        component: QualityControlStep,
        excludeModes: ['fnb']
      },
      {
        key: 'compliance',
        label: 'Compliance',
        description: 'Add regulatory and compliance information.',
        component: RegulatoryComplianceStep
      }
    ],
    legacyKeys: [
      'recipe_ingredients',
      'yield_loss',
      'nutrition',
      'allergens',
      'physical_properties',
      'costing',
      'quality_control',
      'compliance'
    ]
  },
  {
    key: 'barcodes_review',
    name: 'Barcodes & Review',
    description: 'Barcode identities, labels, and the final product review.',
    component: ProductBarcodesAndReviewStep,
    legacyKeys: ['review']
  }
];

const resolveLegacyProductWizardSteps = (workflowMode) => {
  const normalizedMode = normalizeWorkflowMode(workflowMode);
  return LEGACY_PRODUCT_WIZARD_STEP_KEYS.filter((key) => (
    normalizedMode !== 'fnb' || !['physical_properties', 'quality_control'].includes(key)
  ));
};

export const resolveProductWizardResumeStep = (metadata, wizardSteps, workflowMode) => {
  const completedStep = Number(metadata?.last_completed_step);
  if (!Number.isInteger(completedStep) || completedStep <= 0 || wizardSteps.length === 0) return 1;

  if (Number(metadata?.wizard_version) >= 2) {
    return Math.min(completedStep + 1, wizardSteps.length);
  }

  const legacySteps = resolveLegacyProductWizardSteps(workflowMode);
  const completedLegacyKey = legacySteps[Math.min(completedStep, legacySteps.length) - 1];
  if (!completedLegacyKey) return 1;

  const groupIndex = wizardSteps.findIndex((definition) => (
    (definition.legacyKeys || []).includes(completedLegacyKey)
  ));
  if (groupIndex < 0) return 1;

  const groupLegacyKeys = (wizardSteps[groupIndex].legacyKeys || [])
    .filter((key) => legacySteps.includes(key));
  const groupIsComplete = groupLegacyKeys[groupLegacyKeys.length - 1] === completedLegacyKey;
  const nextStep = groupIndex + 1 + (groupIsComplete ? 1 : 0);
  return Math.min(nextStep, wizardSteps.length);
};

export const resolveProductWizardSteps = (workflowMode = 'manufacturing') => {
  const normalizedMode = normalizeWorkflowMode(workflowMode);
  return PRODUCT_WIZARD_STEP_DEFINITIONS
    .filter((definition) => !(definition.excludeModes || []).includes(normalizedMode))
    .map((definition, index) => ({
      ...definition,
      id: definition.key,
      number: index + 1
    }));
};

function ProductWizardStepRail({ steps, currentStep, onStepChange }) {
  return (
    <nav className="product-wizard-step-rail" aria-label="Product wizard steps">
      <div className="product-wizard-step-rail__list">
        {steps.map((wizardStep, index) => {
          const isActive = wizardStep.number === currentStep;
          const isCompleted = wizardStep.number < currentStep;

          return (
            <React.Fragment key={wizardStep.id}>
              <button
                type="button"
                className={`product-wizard-step-rail__step${isActive ? ' product-wizard-step-rail__step--active' : ''}${isCompleted ? ' product-wizard-step-rail__step--completed' : ''}`}
                onClick={() => onStepChange(wizardStep.number)}
                aria-current={isActive ? 'step' : undefined}
                aria-label={`Step ${wizardStep.number}: ${wizardStep.name}`}
                data-product-wizard-step={wizardStep.key}
              >
                <span className="product-wizard-step-rail__number" aria-hidden="true">
                  {isCompleted ? <Check className="h-4 w-4" /> : wizardStep.number}
                </span>
                <span className="product-wizard-step-rail__copy">
                  <span className="product-wizard-step-rail__label">{wizardStep.name}</span>
                  <span className="product-wizard-step-rail__description">{wizardStep.description}</span>
                </span>
              </button>
              {index < steps.length - 1 && (
                <span className={`product-wizard-step-rail__connector${isCompleted ? ' product-wizard-step-rail__connector--completed' : ''}`} aria-hidden="true" />
              )}
            </React.Fragment>
          );
        })}
      </div>
    </nav>
  );
}

const clearFnbManufacturingFields = (payload, workflowMode) => {
  if (normalizeWorkflowMode(workflowMode) !== 'fnb') return payload;
  return {
    ...payload,
    physical_properties: {},
    quality_control: {}
  };
};

const BASE_PRODUCT_DATA = {
  category: 'product',
  product_type: 'finished_goods',
  vat_type: 'vatable',
  name: '',
  sku_code: '',
  description: '',
  product_folder: '',
  unit_of_measure: 'units',
  ingredients: [],
  packaging_items: [],
  batch_size: null,
  yield_percentage: 100,
  processing_loss: 0,
  nutritional_info: {},
  allergens: [],
  may_contain_allergens: [],
  physical_properties: {},
  shelf_life: {},
  packaging_info: {},
  current_stock: 0,
  location_id: '',
  max_capacity: 1000,
  min_threshold: 0,
  purchase_allowance: 0,
  quality_control: {},
  regulatory_compliance: {},
  production_notes: '',
  storefront_location_availability: [],
  fifo_enabled: true
};

const buildDefaultProductData = (templateDefaults = {}) => ({
  ...BASE_PRODUCT_DATA,
  unit_of_measure: templateDefaults.unit_of_measure || BASE_PRODUCT_DATA.unit_of_measure,
  vat_type: templateDefaults.vat_type || BASE_PRODUCT_DATA.vat_type,
  max_capacity: Number(templateDefaults.max_capacity ?? BASE_PRODUCT_DATA.max_capacity),
  fifo_enabled: templateDefaults.fifo_enabled !== false
});

export default function ProductCreateWizard({
  open,
  onClose,
  onSubmit,
  onSaveDraft,
  items,
  product,
  workflowMode = 'manufacturing',
  posConfig = null,
  storefrontConfig = null,
  showStorefrontCatalogControls = true,
  onTogglePosVisibility,
  onTogglePosAlwaysAvailable,
  onUploadPosImage,
  onDeletePosImage,
  onToggleStorefrontVisibility,
  onToggleStorefrontLocationAvailability,
  onUploadStorefrontImage,
  onSetPrimaryStorefrontImage,
  onDeleteStorefrontImage,
  onOpenBulkPosSetup
}) {
  const [step, setStep] = useState(1);
  const [initialStep, setInitialStep] = useState(1);
  const wizardSteps = useMemo(
    () => resolveProductWizardSteps(workflowMode),
    [workflowMode]
  );
  const modeProductDefaults = useMemo(
    () => resolveBusinessModeProductDefaults(workflowMode),
    [workflowMode]
  );
  const [productData, setProductData] = useState(buildDefaultProductData(modeProductDefaults));
  const [initialProductData, setInitialProductData] = useState(null);
  const [isDirty, setIsDirty] = useState(false);
  const [showConfirmation, setShowConfirmation] = useState(false);
  const [savingAction, setSavingAction] = useState(null);
  const savingActionRef = useRef(null);
  const stepContentRef = useRef(null);
  const [skuManuallyEdited, setSkuManuallyEdited] = useState(false);
  const [lastSuggestedSku, setLastSuggestedSku] = useState('');
  const [stockAllocationDraft, setStockAllocationDraft] = useState({});
  const { locations, loading: loadingLocations } = useLocations();
  const activeLocations = useMemo(
    () => (Array.isArray(locations) ? locations.filter((location) => location?.is_active !== false) : []),
    [locations]
  );
  const activeLocationsKey = useMemo(
    () => activeLocations
      .map((location) => `${location?.location_id || ''}:${location?.is_active !== false ? '1' : '0'}`)
      .join('|'),
    [activeLocations]
  );
  const productLocationStockMap = useMemo(() => {
    const rows = Array.isArray(product?.item_location_stocks) ? product.item_location_stocks : [];
    const map = new Map();
    rows.forEach((row) => {
      const locationId = Number.parseInt(row?.location_id, 10);
      if (!Number.isInteger(locationId) || locationId <= 0) return;
      map.set(String(locationId), Number(row?.quantity_on_hand) || 0);
    });
    return map;
  }, [product]);
  const stockAllocations = useMemo(
    () => buildStockAllocations(stockAllocationDraft, activeLocations),
    [activeLocations, stockAllocationDraft]
  );

  const isEditingDraft = product?.status === 'draft';
  const isSaving = Boolean(savingAction);

  useEffect(() => {
    if (step > wizardSteps.length) {
      setStep(wizardSteps.length);
    }
  }, [step, wizardSteps.length]);

  useEffect(() => {
    if (!stepContentRef.current) return;
    if (typeof stepContentRef.current.scrollTo === 'function') {
      stepContentRef.current.scrollTo({ top: 0, behavior: 'auto' });
      return;
    }
    stepContentRef.current.scrollTop = 0;
  }, [step]);

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

  // Helper to parse numeric fields
  const parseNumberField = (value, fallback = 0) => {
    if (value === null || value === undefined || value === '') return fallback;
    const num = Number(value);
    return isNaN(num) ? fallback : num;
  };

  const parseNumberFieldOrNull = (value) => {
    if (value === null || value === undefined || value === '') return null;
    const num = Number(value);
    return isNaN(num) ? null : num;
  };

  // Helper to parse JSON string fields that may be stored as strings in the database
  const parseJsonField = (value, fallback = {}) => {
    if (!value) return fallback;
    if (typeof value === 'string') {
      try {
        return JSON.parse(value);
      } catch (e) {
        console.warn('Failed to parse JSON field:', e);
        return fallback;
      }
    }
    return value;
  };

  // Initialize from product (for editing/resuming drafts)
  useEffect(() => {
    if (product && open) {
      const locationStocks = Array.isArray(product.item_location_stocks) ? product.item_location_stocks : [];
      const stockByLocation = new Map();
      locationStocks.forEach((stockRow) => {
        const locationId = Number.parseInt(stockRow?.location_id, 10);
        if (!Number.isInteger(locationId) || locationId <= 0) return;
        stockByLocation.set(String(locationId), parseNumberField(stockRow?.quantity_on_hand, 0));
      });
      const initialLocationId = product.location_id
        ? String(product.location_id)
        : activeLocations.length === 1
          ? String(activeLocations[0].location_id)
          : locationStocks.length === 1
            ? String(locationStocks[0].location_id)
            : '';
      const initialLocationStock = initialLocationId && stockByLocation.has(initialLocationId)
        ? stockByLocation.get(initialLocationId)
        : (activeLocations.length > 1 ? 0 : parseNumberField(product.current_stock, 0));
      const loadedData = {
        ...buildDefaultProductData(modeProductDefaults),
        ...product,
        // Parse numeric fields
        batch_size: parseNumberFieldOrNull(product.batch_size),
        yield_percentage: parseNumberField(product.yield_percentage, 100),
        processing_loss: parseNumberField(product.processing_loss, 0),
        current_stock: initialLocationStock,
        location_id: initialLocationId,
        max_capacity: parseNumberField(product.max_capacity, Number(modeProductDefaults.max_capacity ?? 1000)),
        min_threshold: parseNumberField(product.min_threshold, 0),
        purchase_allowance: parseNumberField(product.purchase_allowance, 0),
        cost_per_unit: parseNumberField(product.cost_per_unit, 0),
        // Parse nested JSON fields that may be stored as strings
        nutritional_info: parseJsonField(product.nutritional_info, {}),
        physical_properties: parseJsonField(product.physical_properties, {}),
        shelf_life: parseJsonField(product.shelf_life, {}),
        packaging_info: parseJsonField(product.packaging_info, {}),
        quality_control: parseJsonField(product.quality_control, {}),
        regulatory_compliance: parseJsonField(product.regulatory_compliance, {}),
        wizard_metadata: product.wizard_metadata || null
      };
      if (!loadedData.vat_type) {
        loadedData.vat_type = 'vatable';
      }

      // Denormalize ingredients: User inputs "Per Batch", DB stores "Per Unit"
      // So when loading, we multiply by batch_size to show "Per Batch" values.
      // Round to 6dp to prevent floating-point drift from accumulating across edit cycles.
      if (loadedData.ingredients && loadedData.batch_size) {
        loadedData.ingredients = loadedData.ingredients.map(ing => ({
          ...ing,
          quantity: parseFloat(((Number(ing.quantity) || 0) * Number(loadedData.batch_size)).toFixed(6))
        }));
      }

      setProductData(loadedData);
      setInitialProductData(loadedData);
      setStockAllocationDraft(buildStockAllocationDraft(activeLocations));
      setSkuManuallyEdited(Boolean(String(loadedData.sku_code || '').trim()));
      setLastSuggestedSku('');

      // Resume from last completed step if draft
      if (product.status === 'draft' && product.wizard_metadata?.last_completed_step) {
        const resumeStep = resolveProductWizardResumeStep(
          product.wizard_metadata,
          wizardSteps,
          workflowMode
        );
        setStep(resumeStep);
        setInitialStep(resumeStep);
      } else {
        setStep(1);
        setInitialStep(1);
      }

      setIsDirty(false);
    } else if (!product && open) {
      // Reset for new product
      const nextDefaultData = {
        ...buildDefaultProductData(modeProductDefaults),
        location_id: activeLocations.length === 1 ? String(activeLocations[0].location_id) : ''
      };
      setProductData(nextDefaultData);
      setInitialProductData(nextDefaultData);
      setStockAllocationDraft(buildStockAllocationDraft(activeLocations));
      setStep(1);
      setInitialStep(1);
      setIsDirty(false);
      setSkuManuallyEdited(false);
      setLastSuggestedSku('');
    }
  }, [modeProductDefaults, product, open, activeLocations, activeLocationsKey, workflowMode, wizardSteps, wizardSteps.length]);

  useEffect(() => {
    if (!open || skuManuallyEdited) return;

    const suggestedSku = suggestNextSku({
      name: productData.name,
      category: 'product',
      existingItems: items,
      currentItemId: product?.item_id || product?.id || null
    });
    setLastSuggestedSku(suggestedSku);
    if (!suggestedSku) return;

    if (productData.sku_code !== suggestedSku) {
      setProductData((previous) => ({
        ...previous,
        sku_code: suggestedSku
      }));
    }
  }, [
    items,
    open,
    product?.id,
    product?.item_id,
    productData.name,
    productData.sku_code,
    skuManuallyEdited
  ]);

  // Track dirty state - check if any meaningful data has been entered
  useEffect(() => {
    if (!product) {
      // For new products, check if any field has been modified from default
      const hasName = productData.name && productData.name.trim() !== '';
      const hasSku = productData.sku_code && productData.sku_code.trim() !== '';
      const hasIngredients = productData.ingredients && productData.ingredients.length > 0;
      const hasPackaging = productData.packaging_items && productData.packaging_items.length > 0;
      const hasBatchSize = productData.batch_size && productData.batch_size > 0;
      const hasDescription = productData.description && productData.description.trim() !== '';
      const hasStockAllocations = stockAllocations.length > 0;

      setIsDirty(hasName || hasSku || hasIngredients || hasPackaging || hasBatchSize || hasDescription || hasStockAllocations);
    } else {
      // Editing product - check if data changed from initial
      const hasChanges = JSON.stringify(productData) !== JSON.stringify(initialProductData) || stockAllocations.length > 0;
      setIsDirty(hasChanges);
    }
  }, [productData, product, initialProductData, stockAllocations.length]);

  const updateProductData = (updates) => {
    setProductData((prev) => ({ ...prev, ...updates }));
  };

  const handleStockAllocationChange = (locationId, value) => {
    setStockAllocationDraft((previous) => ({
      ...previous,
      [String(locationId)]: value
    }));
  };

  const handleSkuChange = (value) => {
    const nextValue = String(value || '');
    setProductData((prev) => ({
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

  const resetWizard = () => {
    setStep(1);
    setInitialStep(1);
    setProductData({ ...buildDefaultProductData(modeProductDefaults) });
    setInitialProductData(null);
    setStockAllocationDraft(buildStockAllocationDraft(activeLocations));
    setIsDirty(false);
    setSkuManuallyEdited(false);
    setLastSuggestedSku('');
  };

  const handleNext = () => {
    if (step < wizardSteps.length) setStep(step + 1);
  };

  const handleBack = () => {
    if (step > 1) setStep(step - 1);
  };

  const handleClose = (isOpen) => {
    // onOpenChange passes false when trying to close
    // If isOpen is true, the dialog is opening - just return
    if (isOpen === true) return;
    if (savingActionRef.current) return;

    console.log('DEBUG: handleClose', {
      isOpen,
      product: !!product,
      isDirty,
      step,
      name: productData.name,
      hasName: productData.name && productData.name.trim().length > 0
    });

    // Check if we should show confirmation for unsaved changes
    const hasName = productData.name && productData.name.trim().length > 0;
    const hasSku = productData.sku_code && productData.sku_code.trim().length > 0;

    // Allow closing if just viewing (no dirtiness check needed if not editable, but here we assume editable)
    // For new products: check if any data entered
    // For existing products: check isDirty
    const shouldShowConfirmation = product ? isDirty : (hasName || hasSku || isDirty || step > 1);

    if (shouldShowConfirmation) {
      setShowConfirmation(true);
    } else {
      resetWizard();
      onClose();
    }
  };

  const handleSaveDraft = async () => {
    const draftData = clearFnbManufacturingFields({
      ...productData,
      status: 'draft',
      wizard_metadata: {
        wizard_version: 2,
        last_completed_step: step - 1,
        steps_completed: Array.from({ length: step }, (_, i) => i + 1),
        last_saved_at: new Date().toISOString()
      }
    }, workflowMode);
    delete draftData.current_stock;
    delete draftData.location_id;
    delete draftData.stock_allocations;

    if (onSaveDraft) {
      try {
        await onSaveDraft(draftData);
      } catch {
        return;
      }
    }
    setIsDirty(false);
    resetWizard();
    onClose();
  };

  const handleSaveAndExit = async () => {
    if (product?.status === 'draft' || !product) {
      await handleSaveDraft();
      return;
    }
    await handleSubmit();
  };

  // Stock is an additive command owned by the inventory ledger. Keep the
  // legacy form fields out of the payload so saving this wizard can never
  // overwrite an existing branch balance.
  const getSanitizedData = (data, includeStock = true) => {
    const sanitized = { ...data };

    // Ensure quantity fields are numbers, not NaN or strings
    if (sanitized.packaging_items) {
      sanitized.packaging_items = sanitized.packaging_items.map(item => ({
        ...item,
        quantity: Number(item.quantity) || 0,
        item_id: Number(item.item_id)
      })).filter(item => item.item_id && item.quantity > 0);
    }

    // Get batch size for normalization (avoid division by zero)
    const batchSize = Number(sanitized.batch_size) || 1;

    if (sanitized.ingredients) {
      sanitized.ingredients = sanitized.ingredients.map(item => ({
        ...item,
        // Normalize: User inputs "Per Batch", but Backend/DB expects "Per Unit"
        // So we divide by batch size to get the per-unit requirement.
        // Round to 10dp to eliminate floating-point noise before DB persistence.
        quantity: parseFloat(((Number(item.quantity) || 0) / batchSize).toFixed(10)),
        item_id: Number(item.item_id)
      })).filter(item => item.item_id && item.quantity > 0);
    }

    // Ensure other numeric fields are not NaN
    // batch_size must be positive or null, not 0
    const numericFields = ['yield_percentage', 'processing_loss', 'max_capacity', 'min_threshold', 'purchase_allowance'];
    numericFields.forEach(field => {
      if (field in sanitized) {
        sanitized[field] = Number(sanitized[field]) || 0;
      }
    });

    // batch_size requires special handling: must be positive or null (not 0)
    if ('batch_size' in sanitized) {
      const batchSizeValue = Number(sanitized.batch_size);
      sanitized.batch_size = batchSizeValue > 0 ? batchSizeValue : null;
    }

    // Ensure packaging_info is an object
    if (!sanitized.packaging_info || typeof sanitized.packaging_info !== 'object') {
      sanitized.packaging_info = {};
    }

    delete sanitized.current_stock;
    delete sanitized.location_id;
    delete sanitized.stock_allocations;

    const allocations = includeStock
      ? buildStockAllocations(stockAllocationDraft, activeLocations)
      : [];
    if (allocations.length > 0) {
      sanitized.stock_allocations = allocations;
    }

    return clearFnbManufacturingFields(sanitized, workflowMode);
  };

  const handleFinalize = async () => {
    if (productData.product_type === 'finished_goods' && !productData.vat_type) {
      toast.error('VAT type is required to finalize finished goods.');
      return;
    }
    const finalData = {
      ...getSanitizedData(productData, true),
      status: 'active',
      wizard_metadata: null
    };

    try {
      await onSubmit(finalData);
    } catch {
      return;
    }
    resetWizard();
    onClose();
  };

  const handleSubmit = async () => {
    if (productData.product_type === 'finished_goods' && !productData.vat_type) {
      toast.error('VAT type is required for finished goods.');
      return;
    }
    // Validate composition for nested products (circular dependencies and depth limits)
    if (productData.ingredients && productData.ingredients.length > 0) {
      const validation = await validateComposition(
        product?.item_id || null,
        productData.ingredients
      );

      if (!validation.valid) {
        showValidationErrors(validation.errors);
        return; // Don't submit
      }
    }

    if (product) {
      // Updating existing product
      const finalData = {
        ...getSanitizedData(productData),
        status: 'active',
        wizard_metadata: null
      };
      try {
        await onSubmit(finalData);
      } catch {
        return;
      }
    } else {
      // Creating new product - always set status to active
      const finalData = {
        ...getSanitizedData(productData),
        status: 'active',
        wizard_metadata: null
      };
      try {
        await onSubmit(finalData);
      } catch {
        return;
      }
    }
    resetWizard();
    onClose();
  };

  const currentWizardStep = wizardSteps[step - 1] || wizardSteps[0];
  const CurrentStepComponent = currentWizardStep.component;

  return (
    <>
      <Dialog open={open} onOpenChange={handleClose}>
        <DialogContent className="wizard-modal-shell wizard-modal-compact wizard-core-typography product-wizard-dialog" data-catalog-editor="true">
          <DialogHeader className="flex-shrink-0 product-wizard-header">
            <div className="flex items-start justify-between gap-4">
              <div>
                <DialogTitle className="wizard-title flex items-center gap-2">
                  <Package className="w-5 h-5 text-teal-600" />
                  {product ? 'Edit Product' : 'Create New Product'}
                  {isEditingDraft && (
                    <Badge variant="outline" className="bg-slate-100 text-slate-700 border-slate-200 ml-2">
                      <FileEdit className="w-3 h-3 mr-1" />
                      Draft
                    </Badge>
                  )}
                </DialogTitle>
                <p className="product-wizard-header-meta">
                  {productData.name?.trim() || 'Set up a sellable product'}
                  {productData.sku_code?.trim() ? ` · ${productData.sku_code.trim()}` : ''}
                </p>
              </div>
              <Button
                type="button"
                variant="ghost"
                size="icon"
                className="h-9 w-9 shrink-0 rounded-full text-slate-500 hover:bg-slate-100 hover:text-slate-900"
                onClick={() => handleClose(false)}
                disabled={isSaving}
                aria-label={product ? 'Close edit product modal' : 'Close create product modal'}
                title="Close"
              >
                <X className="h-5 w-5" />
              </Button>
            </div>
            {isEditingDraft && initialStep > 1 && (
              <p className="text-sm text-slate-500 mt-2">
                Resuming from Step {initialStep}
              </p>
            )}
          </DialogHeader>

          <div className="product-wizard-progress" aria-label="Product setup progress">
            <div className="product-wizard-progress__summary">
              <span className="product-wizard-progress__eyebrow">Product setup</span>
              <span className="product-wizard-progress__count">Step {step} of {wizardSteps.length}</span>
            </div>
            <div className="product-wizard-progress__track" aria-hidden="true">
              <div
                className="product-wizard-progress__value"
                style={{ width: `${(step / wizardSteps.length) * 100}%` }}
              />
            </div>
          </div>

          <div className="product-wizard-mobile-nav">
            <label htmlFor="product-wizard-step-select" className="product-wizard-mobile-nav__label">
              Current section
            </label>
            <select
              id="product-wizard-step-select"
              value={step}
              onChange={(event) => setStep(Number(event.target.value))}
              className="product-wizard-mobile-nav__select"
            >
              {wizardSteps.map((wizardStep) => (
                <option key={wizardStep.id} value={wizardStep.number}>
                  {wizardStep.number}. {wizardStep.name}
                </option>
              ))}
            </select>
          </div>

          <div className="product-wizard-layout">
            <aside className="product-wizard-sidebar">
              <ProductWizardStepRail
                steps={wizardSteps}
                currentStep={step}
                onStepChange={setStep}
              />
            </aside>

            <main ref={stepContentRef} className="wizard-step-content product-wizard-main">
              <div className="product-wizard-content-heading">
                <span className="product-wizard-content-heading__eyebrow">Current section</span>
                <h2>{currentWizardStep.name}</h2>
                <p>{currentWizardStep.description}</p>
              </div>
              <CurrentStepComponent
                key={currentWizardStep.key}
                sections={currentWizardStep.sections}
                data={productData}
                updateData={updateProductData}
                onSkuChange={handleSkuChange}
                items={items}
                locations={activeLocations}
                loadingLocations={loadingLocations}
                stockAllocationDraft={stockAllocationDraft}
                onStockAllocationChange={handleStockAllocationChange}
                existingStockByLocation={productLocationStockMap}
                isEditing={Boolean(product)}
                productItem={product}
                workflowMode={workflowMode}
                posConfig={posConfig}
                storefrontConfig={storefrontConfig}
                showStorefrontCatalogControls={showStorefrontCatalogControls}
                onTogglePosVisibility={onTogglePosVisibility}
                onTogglePosAlwaysAvailable={onTogglePosAlwaysAvailable}
                onUploadPosImage={onUploadPosImage}
                onDeletePosImage={onDeletePosImage}
                onToggleStorefrontVisibility={onToggleStorefrontVisibility}
                onToggleStorefrontLocationAvailability={onToggleStorefrontLocationAvailability}
                onUploadStorefrontImage={onUploadStorefrontImage}
                onSetPrimaryStorefrontImage={onSetPrimaryStorefrontImage}
                onDeleteStorefrontImage={onDeleteStorefrontImage}
                onOpenBulkPosSetup={onOpenBulkPosSetup}
              />
            </main>
          </div>

          {/* Navigation */}
          <DialogFooter className="wizard-footer product-wizard-footer flex flex-col gap-3 border-t border-slate-200 pt-4 sm:flex-row sm:items-center sm:justify-between">
            <div className="min-h-10 order-2 sm:order-none">
              {step > 1 && (
                <Button variant="outline" onClick={handleBack} disabled={isSaving} className="w-full sm:w-auto">
                  <ArrowLeft className="w-4 h-4 mr-2" /> Back
                </Button>
              )}
            </div>
            <div className="order-1 flex flex-col gap-2 sm:order-none sm:flex-row sm:flex-wrap sm:justify-end">
              <Button variant="outline" onClick={() => handleClose(false)} disabled={isSaving} className="order-3 w-full sm:order-none sm:w-auto">Cancel</Button>

              {((product && product.status !== 'draft') || onSaveDraft) && (
                <Button
                  variant="outline"
                  onClick={() => runSaveAction('save-exit', handleSaveAndExit)}
                  disabled={isSaving}
                  className="order-2 w-full sm:order-none sm:w-auto"
                >
                  {savingAction === 'save-exit' ? 'Saving...' : 'Save and exit'}
                </Button>
              )}

              {step < wizardSteps.length ? (
                <Button onClick={handleNext} className="order-1 w-full bg-teal-600 hover:bg-teal-700 sm:order-none sm:w-auto" disabled={isSaving}>
                  Next <ArrowRight className="w-4 h-4 ml-2" />
                </Button>
              ) : (
                <>
                  {isEditingDraft ? (
                    <Button
                      onClick={() => runSaveAction('finalize', handleFinalize)}
                      className="order-1 w-full bg-teal-600 hover:bg-teal-700 sm:order-none sm:w-auto"
                      disabled={isSaving}
                    >
                      <Check className="w-4 h-4 mr-2" />
                      {savingAction === 'finalize' ? 'Saving...' : 'Finalize Product'}
                    </Button>
                  ) : (
                    <Button
                      onClick={() => runSaveAction('submit', handleSubmit)}
                      className="order-1 w-full bg-teal-600 hover:bg-teal-700 sm:order-none sm:w-auto"
                      disabled={isSaving}
                    >
                      <Check className="w-4 h-4 mr-2" />
                      {savingAction === 'submit' ? 'Saving...' : (product ? 'Update Product' : 'Create Product')}
                    </Button>
                  )}
                </>
              )}
            </div>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <ConfirmationDialog
        open={showConfirmation}
        onOpenChange={setShowConfirmation}
        title={product && product.status !== 'draft' ? "Unsaved Changes" : "Save Draft?"}
        message={
          product && product.status !== 'draft'
            ? "You have unsaved changes to this product. What would you like to do?"
            : "You have unsaved changes. Would you like to save them as a draft?"
        }
        saveDraftLabel={product && product.status !== 'draft' ? "Save Changes" : "Save as Draft"}
        discardLabel="Discard Changes"
        continueEditingLabel="Continue Editing"
        onSaveDraft={() => runSaveAction(
          product && product.status !== 'draft' ? 'submit' : 'save-draft',
          product && product.status !== 'draft' ? handleSubmit : handleSaveDraft
        )}
        onDiscard={() => {
          // If discarding changes on an existing product, we just close and reset
          // effectively reverting to the original state (since we reload from props on open)
          setIsDirty(false);
          resetWizard();
          onClose();
        }}
        onContinueEditing={() => setShowConfirmation(false)}
        className="catalog-editor-dialog-content p-0 sm:max-w-md"
        compact
      />
    </>
  );
}
