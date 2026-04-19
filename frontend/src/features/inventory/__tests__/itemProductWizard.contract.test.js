import fs from 'fs';
import path from 'path';
import { describe, expect, it } from 'vitest';

const readFrontendFile = (relativePath) => {
  const absolutePath = path.resolve(process.cwd(), relativePath);
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
  });

  it('uses expanded dropdown inventory data as SKU suggestion seed for both item and product wizards', () => {
    const itemsPageSource = readFrontendFile('src/features/inventory/pages/ItemsPage.jsx');

    expect(itemsPageSource).toContain("useInventoryItems({ fields: 'dropdown', limit: 10000 })");
    expect(itemsPageSource).toContain('const skuSuggestionItems = useMemo(() =>');
    expect(itemsPageSource).toContain('existingItems={skuSuggestionItems}');
    expect(itemsPageSource).toContain('items={skuSuggestionItems}');
  });
});
