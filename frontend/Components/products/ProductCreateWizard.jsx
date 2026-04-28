import React, { useState, useMemo, useEffect } from 'react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Check, ArrowRight, ArrowLeft, Package, FileEdit } from 'lucide-react';
import ConfirmationDialog from '@/components/ui/ConfirmationDialog';
import { validateComposition, showValidationErrors } from '../utils/compositionValidation';
import { useLocations } from '@/src/hooks/useLocations.js';
import { suggestNextSku } from '@/src/features/inventory/utils/skuSuggestion.js';
import { resolveBusinessModeProductDefaults } from '@/src/features/settings/businessModeTemplates.js';
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
import SummaryStep from './wizard/SummaryStep';

const STEPS = [
  { id: 1, name: 'Basic Info', component: BasicInfoStep },
  { id: 2, name: 'Recipe & Ingredients', component: RecipeFormulationStep },
  { id: 3, name: 'Yield & Loss', component: YieldManagementStep },
  { id: 4, name: 'Nutrition', component: NutritionalInfoStep },
  { id: 5, name: 'Allergens', component: AllergenManagementStep },
  { id: 6, name: 'Properties', component: PhysicalPropertiesStep },
  { id: 7, name: 'Shelf Life', component: ShelfLifeStep },
  { id: 8, name: 'Packaging', component: PackagingLabelingStep },
  { id: 9, name: 'Costing', component: CostFinancialStep },
  { id: 10, name: 'POS Setup', component: POSSetupStep },
  { id: 11, name: 'Quality Control', component: QualityControlStep },
  { id: 12, name: 'Compliance', component: RegulatoryComplianceStep },
  { id: 13, name: 'Review', component: SummaryStep },
];

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
  onTogglePosVisibility,
  onUploadPosImage,
  onDeletePosImage,
  onOpenBulkPosSetup
}) {
  const [step, setStep] = useState(1);
  const [initialStep, setInitialStep] = useState(1);
  const modeProductDefaults = useMemo(
    () => resolveBusinessModeProductDefaults(workflowMode),
    [workflowMode]
  );
  const [productData, setProductData] = useState(buildDefaultProductData(modeProductDefaults));
  const [initialProductData, setInitialProductData] = useState(null);
  const [isDirty, setIsDirty] = useState(false);
  const [showConfirmation, setShowConfirmation] = useState(false);
  const [skuManuallyEdited, setSkuManuallyEdited] = useState(false);
  const [lastSuggestedSku, setLastSuggestedSku] = useState('');
  const [stockBaseline, setStockBaseline] = useState(0);
  const { locations, loading: loadingLocations } = useLocations();
  const activeLocations = useMemo(
    () => (Array.isArray(locations) ? locations.filter((location) => location?.is_active !== false) : []),
    [locations]
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
  const resolveLocationStock = (locationId) => {
    if (!locationId) return null;
    const normalized = String(locationId);
    return productLocationStockMap.has(normalized) ? (productLocationStockMap.get(normalized) || 0) : null;
  };

  const isEditingDraft = product?.status === 'draft';

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
      setStockBaseline(Number(initialLocationStock) || 0);
      setSkuManuallyEdited(Boolean(String(loadedData.sku_code || '').trim()));
      setLastSuggestedSku('');

      // Resume from last completed step if draft
      if (product.status === 'draft' && product.wizard_metadata?.last_completed_step) {
        const resumeStep = product.wizard_metadata.last_completed_step + 1;
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
      setStockBaseline(Number(nextDefaultData.current_stock) || 0);
      setStep(1);
      setInitialStep(1);
      setIsDirty(false);
      setSkuManuallyEdited(false);
      setLastSuggestedSku('');
    }
  }, [modeProductDefaults, product, open, activeLocations]);

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

      setIsDirty(hasName || hasSku || hasIngredients || hasPackaging || hasBatchSize || hasDescription);
    } else {
      // Editing product - check if data changed from initial
      const hasChanges = JSON.stringify(productData) !== JSON.stringify(initialProductData);
      setIsDirty(hasChanges);
    }
  }, [productData, product, initialProductData]);

  const updateProductData = (updates) => {
    setProductData((prev) => {
      const next = { ...prev, ...updates };
      if (product && Object.prototype.hasOwnProperty.call(updates, 'location_id')) {
        const locationStock = resolveLocationStock(updates.location_id);
        if (locationStock !== null) {
          next.current_stock = locationStock;
          setStockBaseline(locationStock);
        } else if (!updates.location_id && activeLocations.length > 1) {
          next.current_stock = 0;
          setStockBaseline(0);
        }
      }
      return next;
    });
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
    setStockBaseline(0);
    setIsDirty(false);
    setSkuManuallyEdited(false);
    setLastSuggestedSku('');
  };

  const handleNext = () => {
    if (step < STEPS.length) setStep(step + 1);
  };

  const handleBack = () => {
    if (step > 1) setStep(step - 1);
  };

  const handleClose = (isOpen) => {
    // onOpenChange passes false when trying to close
    // If isOpen is true, the dialog is opening - just return
    if (isOpen === true) return;

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

  const handleSaveDraft = () => {
    const draftData = {
      ...productData,
      status: 'draft',
      wizard_metadata: {
        last_completed_step: step - 1,
        steps_completed: Array.from({ length: step }, (_, i) => i + 1),
        last_saved_at: new Date().toISOString()
      }
    };

    if (onSaveDraft) {
      onSaveDraft(draftData);
    }
    setIsDirty(false);
    resetWizard();
    onClose();
  };

  const handleFinalize = () => {
    if (productData.product_type === 'finished_goods' && !productData.vat_type) {
      toast.error('VAT type is required to finalize finished goods.');
      return;
    }
    const hasStockAdjustment = product
      ? (Number(productData.current_stock) || 0) !== (Number(stockBaseline) || 0)
      : (Number(productData.current_stock) || 0) > 0;
    if (hasStockAdjustment && activeLocations.length > 1 && !productData.location_id) {
      toast.error('Please select a location when setting current stock.');
      return;
    }
    const parsedLocationId = Number.parseInt(productData.location_id, 10);
    const finalData = {
      ...productData,
      location_id: hasStockAdjustment && Number.isInteger(parsedLocationId) && parsedLocationId > 0 ? parsedLocationId : null,
      status: 'active',
      wizard_metadata: null
    };

    onSubmit(finalData);
    resetWizard();
    onClose();
  };

  const handleSubmit = async () => {
    if (productData.product_type === 'finished_goods' && !productData.vat_type) {
      toast.error('VAT type is required for finished goods.');
      return;
    }
    const hasStockAdjustment = product
      ? (Number(productData.current_stock) || 0) !== (Number(stockBaseline) || 0)
      : (Number(productData.current_stock) || 0) > 0;
    if (hasStockAdjustment && activeLocations.length > 1 && !productData.location_id) {
      toast.error('Please select a location when setting current stock.');
      return;
    }
    // Common cleanup function to ensure data validity before submission
    const getSanitizedData = (data) => {
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
      const numericFields = ['yield_percentage', 'processing_loss', 'current_stock', 'max_capacity', 'min_threshold', 'purchase_allowance'];
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

      const parsedLocationId = Number.parseInt(sanitized.location_id, 10);
      sanitized.location_id = hasStockAdjustment && Number.isInteger(parsedLocationId) && parsedLocationId > 0
        ? parsedLocationId
        : null;

      return sanitized;
    };

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
      onSubmit(finalData);
    } else {
      // Creating new product - always set status to active
      const finalData = {
        ...getSanitizedData(productData),
        status: 'active',
        wizard_metadata: null
      };
      onSubmit(finalData);
    }
    resetWizard();
    onClose();
  };

  const CurrentStepComponent = STEPS[step - 1].component;

  return (
    <>
      <Dialog open={open} onOpenChange={handleClose}>
        <DialogContent className="wizard-modal-shell wizard-modal-compact wizard-core-typography h-[90vh] max-h-[90vh] w-[95vw] max-w-5xl overflow-hidden flex flex-col">
          <DialogHeader className="flex-shrink-0">
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
            {isEditingDraft && initialStep > 1 && (
              <p className="text-sm text-slate-500 mt-2">
                Resuming from Step {initialStep}
              </p>
            )}
          </DialogHeader>

          {/* Progress Bar */}
          <div className="border-b border-slate-200 py-3">
            <div className="flex items-center justify-between mb-2">
              <span className="text-sm font-medium text-slate-600">
                Step {step} of {STEPS.length}
              </span>
              <span className="text-sm text-slate-500">{STEPS[step - 1].name}</span>
            </div>
            <div className="w-full h-2 bg-slate-100 rounded-full overflow-hidden">
              <div
                className="h-full bg-teal-600 transition-all duration-300"
                style={{ width: `${(step / STEPS.length) * 100}%` }}
              />
            </div>
          </div>

          {/* Step Content */}
          <div className="wizard-step-content flex-1 overflow-y-auto py-4">
            <CurrentStepComponent
              data={productData}
              updateData={updateProductData}
              onSkuChange={handleSkuChange}
              items={items}
              locations={activeLocations}
              loadingLocations={loadingLocations}
              productItem={product}
              posConfig={posConfig}
              onTogglePosVisibility={onTogglePosVisibility}
              onUploadPosImage={onUploadPosImage}
              onDeletePosImage={onDeletePosImage}
              onOpenBulkPosSetup={onOpenBulkPosSetup}
            />
          </div>

          {/* Navigation */}
          <DialogFooter className="wizard-footer flex justify-between border-t border-slate-200 pt-4">
            <div>
              {step > 1 && (
                <Button variant="outline" onClick={handleBack}>
                  <ArrowLeft className="w-4 h-4 mr-2" /> Back
                </Button>
              )}
            </div>
            <div className="flex gap-2">
              <Button variant="outline" onClick={() => handleClose(false)}>Cancel</Button>

              {(!product || (product && product.status === 'draft')) && onSaveDraft && (
                <Button variant="outline" onClick={handleSaveDraft}>
                  Save as Draft
                </Button>
              )}

              {step < STEPS.length ? (
                <Button onClick={handleNext} className="bg-teal-600 hover:bg-teal-700">
                  Next <ArrowRight className="w-4 h-4 ml-2" />
                </Button>
              ) : (
                <>
                  {isEditingDraft ? (
                    <Button onClick={handleFinalize} className="bg-teal-600 hover:bg-teal-700">
                      <Check className="w-4 h-4 mr-2" /> Finalize Product
                    </Button>
                  ) : (
                    <Button onClick={handleSubmit} className="bg-teal-600 hover:bg-teal-700">
                      <Check className="w-4 h-4 mr-2" />
                      {product ? 'Update Product' : 'Create Product'}
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
        onSaveDraft={product && product.status !== 'draft' ? handleSubmit : handleSaveDraft}
        onDiscard={() => {
          // If discarding changes on an existing product, we just close and reset
          // effectively reverting to the original state (since we reload from props on open)
          setIsDirty(false);
          resetWizard();
          onClose();
        }}
        onContinueEditing={() => setShowConfirmation(false)}
      />
    </>
  );
}
