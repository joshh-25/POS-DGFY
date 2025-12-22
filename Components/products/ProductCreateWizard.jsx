import React, { useState, useMemo } from 'react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Check, ArrowRight, ArrowLeft, Package } from 'lucide-react';
import { cn } from "../../src/lib/utils.js";

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
  { id: 10, name: 'Quality Control', component: QualityControlStep },
  { id: 11, name: 'Compliance', component: RegulatoryComplianceStep },
  { id: 12, name: 'Review', component: SummaryStep },
];

export default function ProductCreateWizard({ open, onClose, onSubmit, items, folders }) {
  const [step, setStep] = useState(1);
  const [productData, setProductData] = useState({
    category: 'product',
    name: '',
    sku_code: '',
    description: '',
    product_folder: '',
    unit_of_measure: 'units',
    ingredients: [],
    batch_size: 0,
    yield_percentage: 100,
    processing_loss: 0,
    nutritional_info: {},
    allergens: [],
    may_contain_allergens: [],
    physical_properties: {},
    shelf_life: {},
    packaging_info: {},
    current_stock: 0,
    max_capacity: 0,
    min_threshold: 0,
    purchase_allowance: 0,
    quality_control: {},
    regulatory_compliance: {},
    production_notes: ''
  });

  const updateProductData = (updates) => {
    setProductData(prev => ({ ...prev, ...updates }));
  };

  const handleNext = () => {
    if (step < STEPS.length) setStep(step + 1);
  };

  const handleBack = () => {
    if (step > 1) setStep(step - 1);
  };

  const handleSubmit = () => {
    onSubmit(productData);
    onClose();
  };

  const CurrentStepComponent = STEPS[step - 1].component;

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-w-5xl max-h-[90vh] overflow-hidden flex flex-col">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Package className="w-5 h-5 text-teal-600" />
            Create New Product
          </DialogTitle>
        </DialogHeader>

        {/* Progress Bar */}
        <div className="py-4 border-b border-slate-200">
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
        <div className="flex-1 overflow-y-auto py-6">
          <CurrentStepComponent
            data={productData}
            updateData={updateProductData}
            items={items}
            folders={folders}
          />
        </div>

        {/* Navigation */}
        <DialogFooter className="flex justify-between border-t border-slate-200 pt-4">
          <div>
            {step > 1 && (
              <Button variant="outline" onClick={handleBack}>
                <ArrowLeft className="w-4 h-4 mr-2" /> Back
              </Button>
            )}
          </div>
          <div className="flex gap-2">
            <Button variant="outline" onClick={onClose}>Cancel</Button>
            {step < STEPS.length ? (
              <Button onClick={handleNext} className="bg-teal-600 hover:bg-teal-700">
                Next <ArrowRight className="w-4 h-4 ml-2" />
              </Button>
            ) : (
              <Button onClick={handleSubmit} className="bg-teal-600 hover:bg-teal-700">
                <Check className="w-4 h-4 mr-2" /> Create Product
              </Button>
            )}
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}