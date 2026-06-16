import fs from 'fs';
import path from 'path';
import { describe, expect, it } from 'vitest';

const readFrontendFile = (relativePath) => {
  const directPath = path.resolve(process.cwd(), relativePath);
  const absolutePath = fs.existsSync(directPath)
    ? directPath
    : path.resolve(process.cwd(), 'frontend', relativePath);
  return fs.readFileSync(absolutePath, 'utf8');
};

describe('Item/Product wizard contracts', () => {
  it('defaults FIFO to enabled for item and product create flows', () => {
    const itemFormSource = readFrontendFile('Components/items/ItemFormModal.jsx');
    const productWizardSource = readFrontendFile('Components/products/ProductCreateWizard.jsx');

    expect(itemFormSource).toContain('fifo_enabled: true');
    expect(productWizardSource).toContain('fifo_enabled: true');
  });

  it('keeps Name field before SKU field in item and product basic forms', () => {
    const itemFormSource = readFrontendFile('Components/items/ItemFormModal.jsx');
    const productBasicInfoSource = readFrontendFile('Components/products/wizard/BasicInfoStep.jsx');

    const itemNameIndex = itemFormSource.indexOf('Label htmlFor="name">Item Name');
    const itemSkuIndex = itemFormSource.indexOf('Label htmlFor="sku">SKU Code');
    expect(itemNameIndex).toBeGreaterThan(-1);
    expect(itemSkuIndex).toBeGreaterThan(-1);
    expect(itemNameIndex).toBeLessThan(itemSkuIndex);

    const productNameIndex = productBasicInfoSource.indexOf('<Label>Product Name *');
    const productSkuIndex = productBasicInfoSource.indexOf('<Label>SKU Code *');
    expect(productNameIndex).toBeGreaterThan(-1);
    expect(productSkuIndex).toBeGreaterThan(-1);
    expect(productNameIndex).toBeLessThan(productSkuIndex);
  });

  it('keeps smart SKU autofill/manual override wiring in both wizard flows', () => {
    const itemFormSource = readFrontendFile('Components/items/ItemFormModal.jsx');
    const productWizardSource = readFrontendFile('Components/products/ProductCreateWizard.jsx');
    const productBasicInfoSource = readFrontendFile('Components/products/wizard/BasicInfoStep.jsx');

    expect(itemFormSource).toContain('const [skuManuallyEdited, setSkuManuallyEdited] = useState(false)');
    expect(itemFormSource).toContain('if (!open || skuManuallyEdited) return;');
    expect(itemFormSource).toContain('setSkuManuallyEdited(false);');
    expect(itemFormSource).toContain('setLastSuggestedSku(suggestedSku);');

    expect(productWizardSource).toContain('const [skuManuallyEdited, setSkuManuallyEdited] = useState(false)');
    expect(productWizardSource).toContain('if (!open || skuManuallyEdited) return;');
    expect(productWizardSource).toContain('setSkuManuallyEdited(false);');
    expect(productWizardSource).toContain('onSkuChange={handleSkuChange}');

    expect(productBasicInfoSource).toContain('onSkuChange');
    expect(productBasicInfoSource).toContain("placeholder=\"Auto-generated from product name\"");
  });

  it('applies shared wizard typography contract classes across item and product wizards', () => {
    const itemFormSource = readFrontendFile('Components/items/ItemFormModal.jsx');
    const productWizardSource = readFrontendFile('Components/products/ProductCreateWizard.jsx');
    const productBasicInfoSource = readFrontendFile('Components/products/wizard/BasicInfoStep.jsx');
    const indexCssSource = readFrontendFile('src/index.css');

    expect(itemFormSource).toContain('wizard-core-typography');
    expect(itemFormSource).toContain('wizard-title');
    expect(itemFormSource).toContain('wizard-footer');

    expect(productWizardSource).toContain('wizard-core-typography');
    expect(productWizardSource).toContain('wizard-title');
    expect(productWizardSource).toContain('wizard-footer');

    expect(productBasicInfoSource).toContain('wizard-section-title');

    expect(indexCssSource).toContain('.wizard-core-typography');
    expect(indexCssSource).toContain('.wizard-core-typography .wizard-title');
    expect(indexCssSource).toContain('.wizard-core-typography .wizard-step-content label');
    expect(indexCssSource).toContain('.wizard-core-typography .wizard-footer button');
    expect(indexCssSource).toContain('.wizard-step-navigator__button');
    expect(indexCssSource).toContain('.wizard-step-navigator__tooltip');
    expect(indexCssSource).toContain('.wizard-step-navigator__connector');
  });

  it('keeps item and product create/edit modal dimensions fixed to the largest wizard frame', () => {
    const itemFormSource = readFrontendFile('Components/items/ItemFormModal.jsx');
    const productWizardSource = readFrontendFile('Components/products/ProductCreateWizard.jsx');
    const indexCssSource = readFrontendFile('src/index.css');

    expect(itemFormSource).toContain('DialogContent className="wizard-modal-shell wizard-modal-compact wizard-core-typography pb-0"');
    expect(productWizardSource).toContain('DialogContent className="wizard-modal-shell wizard-modal-compact wizard-core-typography"');
    expect(itemFormSource).toContain('DialogHeader className="flex-shrink-0"');
    expect(productWizardSource).toContain('DialogHeader className="flex-shrink-0"');
    expect(itemFormSource).toContain('wizard-step-content flex-1 space-y-4 overflow-y-auto px-5 py-4 sm:px-6');
    expect(productWizardSource).toContain('wizard-step-content flex-1 overflow-y-auto py-4');
    expect(itemFormSource).toContain('wizard-footer flex-shrink-0 border-t border-slate-200 pt-4 flex flex-col-reverse gap-2 sm:flex-row sm:flex-wrap sm:justify-end');
    expect(productWizardSource).toContain('wizard-footer flex flex-col gap-3 border-t border-slate-200 pt-4 sm:flex-row sm:items-center sm:justify-between');
    expect(indexCssSource).toContain('width: min(95vw, 1100px) !important;');
    expect(indexCssSource).toContain('max-width: min(95vw, 1100px) !important;');
    expect(indexCssSource).toContain('height: 90vh;');
    expect(indexCssSource).toContain('max-height: 90vh !important;');
    expect(indexCssSource).toContain('@media (max-width: 640px)');
    expect(itemFormSource).not.toContain('w-[95vw]');
    expect(productWizardSource).not.toContain('w-[95vw]');
    expect(itemFormSource).not.toContain('max-h-[90vh] max-w-4xl overflow-y-auto pb-6');
  });

  it('uses expanded dropdown inventory data as SKU suggestion seed for both item and product wizards', () => {
    const itemsPageSource = readFrontendFile('src/features/inventory/pages/ItemsPage.jsx');

    expect(itemsPageSource).toContain("useInventoryItems({ fields: 'dropdown', limit: 10000 })");
    expect(itemsPageSource).toContain('const skuSuggestionItems = useMemo(() =>');
    expect(itemsPageSource).toContain('existingItems={skuSuggestionItems}');
    expect(itemsPageSource).toContain('items={skuSuggestionItems}');
  });

  it('keeps save-and-exit separate from final submit/finalize actions', () => {
    const itemFormSource = readFrontendFile('Components/items/ItemFormModal.jsx');
    const productWizardSource = readFrontendFile('Components/products/ProductCreateWizard.jsx');
    const itemsPageSource = readFrontendFile('src/features/inventory/pages/ItemsPage.jsx');

    expect(itemFormSource).toContain('const handleSaveAndExit = async () =>');
    expect(itemFormSource).toContain("item?.status === 'draft' || !item");
    expect(itemFormSource).toContain('await handleSubmit(true);');
    expect(itemFormSource).toContain('Save and exit');
    expect(itemFormSource).toContain('Finalize Item');
    expect(itemFormSource).not.toContain('{!item && onSaveDraft && (');

    expect(productWizardSource).toContain('const handleSaveAndExit = async () =>');
    expect(productWizardSource).toContain("product?.status === 'draft' || !product");
    expect(productWizardSource).toContain('await handleSaveDraft();');
    expect(productWizardSource).toContain('Save and exit');
    expect(productWizardSource).toContain('Finalize Product');
    expect(productWizardSource).not.toContain("{(!product || (product && product.status === 'draft')) && onSaveDraft && (");

    expect(productWizardSource).toContain('await onSaveDraft(draftData);');
    expect(productWizardSource).toContain('await onSubmit(finalData);');
    expect(itemFormSource).toContain('await onSaveDraft(finalPayload);');
    expect(itemFormSource).toContain('await onSave(finalPayload);');
    expect(itemsPageSource).toContain('throw error;');
  });

  it('uses mode-derived product wizard steps with POS setup second and F&B manufacturing steps removed', () => {
    const productWizardSource = readFrontendFile('Components/products/ProductCreateWizard.jsx');

    expect(productWizardSource).toContain('PRODUCT_WIZARD_STEP_DEFINITIONS');
    expect(productWizardSource).toContain("key: 'basic_info'");
    expect(productWizardSource).toContain("key: 'pos_setup'");
    expect(productWizardSource.indexOf("key: 'basic_info'")).toBeLessThan(productWizardSource.indexOf("key: 'pos_setup'"));
    expect(productWizardSource.indexOf("key: 'pos_setup'")).toBeLessThan(productWizardSource.indexOf("key: 'recipe_ingredients'"));
    expect(productWizardSource).toContain("key: 'physical_properties'");
    expect(productWizardSource).toContain("excludeModes: ['fnb']");
    expect(productWizardSource).toContain("key: 'quality_control'");
    expect(productWizardSource).toContain('resolveProductWizardSteps');
    expect(productWizardSource).toContain("filter((definition) => !(definition.excludeModes || []).includes(normalizedMode))");
  });

  it('clears manufacturing-only product wizard data for F&B saves without changing other modes', () => {
    const productWizardSource = readFrontendFile('Components/products/ProductCreateWizard.jsx');

    expect(productWizardSource).toContain('const clearFnbManufacturingFields = (payload, workflowMode) =>');
    expect(productWizardSource).toContain("normalizeWorkflowMode(workflowMode) !== 'fnb'");
    expect(productWizardSource).toContain('physical_properties: {}');
    expect(productWizardSource).toContain('quality_control: {}');
    expect(productWizardSource).toContain('const draftData = clearFnbManufacturingFields');
    expect(productWizardSource).toContain('const finalData = clearFnbManufacturingFields');
    expect(productWizardSource).toContain('return clearFnbManufacturingFields(sanitized, workflowMode);');
  });

  it('wires the shared step navigator into every multi-step modal surface', () => {
    const productWizardSource = readFrontendFile('Components/products/ProductCreateWizard.jsx');
    const poWizardSource = readFrontendFile('Components/po/POCreateWizard.jsx');
    const csvImportSource = readFrontendFile('Components/items/CSVImportModal.jsx');
    const supplierImportSource = readFrontendFile('Components/suppliers/SupplierImportModal.jsx');
    const onboardingSource = readFrontendFile('src/features/onboarding/components/OnboardingSetupModal.jsx');

    [productWizardSource, poWizardSource, csvImportSource, supplierImportSource, onboardingSource].forEach((source) => {
      expect(source).toContain('WizardStepNavigator');
    });

    expect(productWizardSource).toContain('ariaLabel="Product wizard steps"');
    expect(poWizardSource).toContain('ariaLabel="Purchase order wizard steps"');
    expect(csvImportSource).toContain('ariaLabel="CSV import steps"');
    expect(supplierImportSource).toContain('ariaLabel="Supplier import steps"');
    expect(onboardingSource).toContain('ariaLabel="Tenant onboarding setup steps"');
    expect(csvImportSource).toContain('disabledReason: \'Validate a CSV file before opening preview.\'');
    expect(supplierImportSource).toContain('disabledReason: \'Confirm the import before opening results.\'');
    expect(onboardingSource).toContain('maxReachableStepIndex');
  });

  it('preserves Storefront branch availability when saving item and product drafts', () => {
    const itemsPageSource = readFrontendFile('src/features/inventory/pages/ItemsPage.jsx');

    expect(itemsPageSource).toContain('const applyStorefrontLocationAvailabilityPatch = async (item, rows = []) =>');
    expect(itemsPageSource).toContain('storefront_location_availability: storefrontLocationAvailabilityPatch = []');
    expect(itemsPageSource).toContain('savedProduct = await createItemDraft(productPayload);');
    expect(itemsPageSource).toContain('await applyStorefrontLocationAvailabilityPatch(savedProduct || editingProduct, storefrontLocationAvailabilityPatch);');
    expect(itemsPageSource).toContain('const savedDraft = await createItemDraft(draftPayload);');
    expect(itemsPageSource).toContain('await applyStorefrontLocationAvailabilityPatch(savedDraft, storefrontLocationAvailabilityPatch);');
    expect(itemsPageSource).not.toContain('delete draftPayload.storefront_location_availability;');
  });

  it('guards save actions and keeps wizard footers responsive', () => {
    const itemFormSource = readFrontendFile('Components/items/ItemFormModal.jsx');
    const productWizardSource = readFrontendFile('Components/products/ProductCreateWizard.jsx');

    expect(itemFormSource).toContain('const [savingAction, setSavingAction] = useState(null)');
    expect(productWizardSource).toContain('const [savingAction, setSavingAction] = useState(null)');
    expect(itemFormSource).toContain('const savingActionRef = useRef(null)');
    expect(productWizardSource).toContain('const savingActionRef = useRef(null)');
    expect(itemFormSource).toContain('const runSaveAction = async (action, operation) =>');
    expect(productWizardSource).toContain('const runSaveAction = async (action, operation) =>');
    expect(itemFormSource).toContain('if (savingActionRef.current) return;');
    expect(productWizardSource).toContain('if (savingActionRef.current) return;');

    expect(productWizardSource).toContain('wizard-footer flex flex-col gap-3 border-t border-slate-200 pt-4 sm:flex-row sm:items-center sm:justify-between');
    expect(productWizardSource).toContain('order-1 flex flex-col gap-2 sm:order-none sm:flex-row sm:flex-wrap sm:justify-end');
    expect(productWizardSource).toContain('className="order-1 w-full bg-teal-600 hover:bg-teal-700 sm:order-none sm:w-auto"');
    expect(productWizardSource).toContain('className="order-3 w-full sm:order-none sm:w-auto"');
    expect(itemFormSource).toContain('wizard-footer flex-shrink-0 border-t border-slate-200 pt-4 flex flex-col-reverse gap-2 sm:flex-row sm:flex-wrap sm:justify-end');

    expect(itemFormSource).toContain('disabled={isSaving}');
    expect(productWizardSource).toContain('disabled={isSaving}');
    expect(itemFormSource).toContain("savingAction === 'save-exit' ? 'Saving...' : 'Save and exit'");
    expect(productWizardSource).toContain("savingAction === 'save-exit' ? 'Saving...' : 'Save and exit'");
    expect(itemFormSource).toContain("savingAction === 'submit' ? 'Saving...' : (item ? 'Update Item' : 'Create Item')");
    expect(productWizardSource).toContain("savingAction === 'submit' ? 'Saving...' : (product ? 'Update Product' : 'Create Product')");
  });

  it('uses Item image copy for item pictures while preserving Storefront visibility wording', () => {
    const itemFormSource = readFrontendFile('Components/items/ItemFormModal.jsx');
    const productPosSetupSource = readFrontendFile('Components/products/wizard/POSSetupStep.jsx');
    const itemsPageSource = readFrontendFile('src/features/inventory/pages/ItemsPage.jsx');
    const storefrontImageCarouselSource = readFrontendFile('Components/items/StorefrontImageCarousel.jsx');
    const selectedImageCarouselSource = readFrontendFile('Components/items/SelectedItemImageCarousel.jsx');

    expect(itemFormSource).toContain('Add Item Images');
    expect(itemFormSource).toContain('Choose Item Images');
    expect(itemFormSource).toContain('SelectedItemImageCarousel');
    expect(itemFormSource).toContain('storefront_image_files: selectedStorefrontImageFiles');
    expect(itemFormSource).toContain('Remove All Item Images');
    expect(itemFormSource).toContain('STOREFRONT_ITEM_IMAGE_MAX_COUNT = 5');
    expect(itemFormSource).toContain('parseStorefrontImageGallery');
    expect(itemFormSource).toContain('image slots remaining');
    expect(itemFormSource).toContain('No item image uploaded yet.');
    expect(itemFormSource).toContain('POS terminal cards use the item images added in Storefront Catalog below.');
    expect(itemFormSource).not.toContain('Upload Image');
    expect(itemFormSource).not.toContain('onUploadPosImage');
    expect(itemFormSource).toContain('Enable in Storefront');
    expect(itemFormSource).toContain('Disable in Storefront');
    expect(itemFormSource).toContain('<StorefrontImageCarousel');
    expect(itemFormSource).toContain('variant="wizard"');

    expect(productPosSetupSource).toContain('Add Item Images');
    expect(productPosSetupSource).toContain('Choose Item Images');
    expect(productPosSetupSource).toContain('SelectedItemImageCarousel');
    expect(productPosSetupSource).toContain('storefront_image_files: selectedStorefrontImageFiles');
    expect(productPosSetupSource).toContain('Remove All Item Images');
    expect(productPosSetupSource).toContain('STOREFRONT_ITEM_IMAGE_MAX_COUNT = 5');
    expect(productPosSetupSource).toContain('parseStorefrontImageGallery');
    expect(productPosSetupSource).toContain('image slots remaining');
    expect(productPosSetupSource).toContain('No item image uploaded yet.');
    expect(productPosSetupSource).toContain('POS terminal cards use the item images added in Storefront Catalog below.');
    expect(productPosSetupSource).not.toContain('Upload Image');
    expect(productPosSetupSource).not.toContain('onUploadPosImage');
    expect(productPosSetupSource).toContain('Enable in Storefront');
    expect(productPosSetupSource).toContain('Disable in Storefront');
    expect(productPosSetupSource).toContain('<StorefrontImageCarousel');
    expect(productPosSetupSource).toContain('variant="wizard"');

    expect(itemsPageSource).toContain('Item image updated for');
    expect(itemsPageSource).toContain('storefront_image_files: storefrontImageFiles = []');
    expect(itemsPageSource).toContain('await handleUploadStorefrontImage(savedItem || editingItem, storefrontImageFiles)');
    expect(itemsPageSource).toContain('await handleUploadStorefrontImage(savedProduct || editingProduct, storefrontImageFiles)');
    expect(itemsPageSource).toContain('Primary storefront image updated for');
    expect(itemsPageSource).toContain('STOREFRONT_ITEM_IMAGE_MAX_COUNT = 5');
    expect(itemsPageSource).toContain('parseStorefrontImageGallery');
    expect(itemsPageSource).toContain('updateStorefrontCatalogGallery(itemId, nextGallery)');
    expect(itemsPageSource).toContain('Failed to upload item image');
    expect(itemsPageSource).toContain('<StorefrontImageCarousel');
    expect(itemsPageSource).toContain('variant="table"');
    expect(storefrontImageCarouselSource).toContain('Set first');
    expect(storefrontImageCarouselSource).toContain('Remove');
    expect(storefrontImageCarouselSource).toContain('aria-label="Previous item image"');
    expect(storefrontImageCarouselSource).toContain('aria-label="Next item image"');
    expect(storefrontImageCarouselSource).toContain('item-carousel-dot');
    expect(selectedImageCarouselSource).toContain('aria-label="Previous selected item image"');
    expect(selectedImageCarouselSource).toContain('aria-label="Next selected item image"');
    expect(selectedImageCarouselSource).toContain('selected-item-carousel-dot');
  });

  it('uses mode-aware item taxonomy and filtered UOM options in the item form', () => {
    const itemFormSource = readFrontendFile('Components/items/ItemFormModal.jsx');
    const uomSelectSource = readFrontendFile('Components/ui/UomSelect.jsx');

    expect(itemFormSource).toContain('resolveModeItemTaxonomy');
    expect(itemFormSource).toContain("Label>{modeItemTaxonomy ? 'Item Type' : 'Category'}");
    expect(itemFormSource).toContain('allowedGroups={currentItemPreset?.allowed_uom_groups || []}');
    expect(itemFormSource).toContain('mode_item_preset: modeItemTaxonomy');
    expect(itemFormSource).toContain('This item type is stock-exempt');
    expect(itemFormSource).toContain("if (msmeMode && item)");
    expect(itemFormSource).toContain('setMsmeCategoryTouched(true)');
    expect(uomSelectSource).toContain('filterUomOptions');
    expect(uomSelectSource).toContain('Legacy/current value:');
  });

  it('keeps read-only item financial views mode-aware and service-stock-exempt', () => {
    const itemsPageSource = readFrontendFile('src/features/inventory/pages/ItemsPage.jsx');
    const itemDetailsSource = readFrontendFile('Components/items/ItemDetailsModal.jsx');
    const itemCardSource = readFrontendFile('Components/items/ItemCard.jsx');
    const costFinancialSource = readFrontendFile('Components/items/details/CostFinancialSection.jsx');

    expect(itemsPageSource).toContain('workflowMode={workflowMode}');
    expect(itemCardSource).toContain('workflowMode,');
    expect(itemCardSource).toContain('resolveItemFinancialPolicy({');
    expect(itemCardSource).toContain('!financialPolicy.is_pure_service && item.fifo_enabled');

    expect(itemDetailsSource).toContain('workflowMode })');
    expect(itemDetailsSource).toContain('<CostFinancialSection item={item} workflowMode={workflowMode} />');
    expect(itemDetailsSource).toContain('!financialPolicy.is_pure_service && item.fifo_enabled && (item.shelf_life_days || item.opened_shelf_life_days)');
    expect(itemDetailsSource).toContain('!financialPolicy.is_pure_service && item.fifo_enabled && (');

    expect(costFinancialSource).toContain('hasExplicitSalePrice');
    expect(costFinancialSource).toContain('workflowMode,');
  });
});
