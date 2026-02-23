import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import { createPageUrl } from '@/utils.js';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import {
  History,
  Plus,
  Ruler,
  Layers,
  Info,
  Warehouse,
  UtensilsCrossed,
  Factory,
  Droplet,
  Calendar,
  BoxIcon,
  DollarSign,
  ClipboardCheck,
  Shield
} from 'lucide-react';
import { cn } from "../../src/lib/utils.js";
import { getStockStatus } from '@/components/data/dummyData';
import FIFOBatchViewer from './FIFOBatchViewer';
import { formatNumber } from '../../src/lib/numberUtils.js';
import { getCategoryConfig, getCategoryLabel, isManufactured } from '@/components/utils/categoryHelpers';
import { calculateTotalProductCost } from './details/helpers';

// Import accordion components
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";

// Import detail section components
import BasicInfoSection from './details/BasicInfoSection';
import StockInventorySection from './details/StockInventorySection';
import RecipeIngredientsSection from './details/RecipeIngredientsSection';
import YieldManagementSection from './details/YieldManagementSection';
import NutritionalInfoSection from './details/NutritionalInfoSection';
import AllergenSection from './details/AllergenSection';
import PhysicalPropertiesSection from './details/PhysicalPropertiesSection';
import ShelfLifeSection from './details/ShelfLifeSection';
import PackagingInfoSection from './details/PackagingInfoSection';
import CostFinancialSection from './details/CostFinancialSection';
import QualityControlSection from './details/QualityControlSection';
import RegulatoryComplianceSection from './details/RegulatoryComplianceSection';

// Import helper functions
import {
  hasNutritionalInfo,
  hasAllergens,
  hasPhysicalProperties,
  hasShelfLife,
  hasPackagingInfo,
  hasQualityControl,
  hasRegulatoryCompliance,
  hasYieldManagement,
  hasRecipeData,
} from './details/helpers';

const statusConfig = {
  critical: { label: "Critical", color: "bg-red-100 text-red-700" },
  warning: { label: "Low Stock", color: "bg-amber-100 text-amber-700" },
  healthy: { label: "Healthy", color: "bg-emerald-100 text-emerald-700" },
  surplus: { label: "Surplus", color: "bg-blue-100 text-blue-700" }
};

export default function ItemDetailsModal({ item, open, onClose, onRefresh }) {
  const [defaultOpenSections, setDefaultOpenSections] = useState(['basic-info', 'stock-inventory', 'recipe']);

  if (!item) return null;

  const isProduct = isManufactured(item);

  // Parse packaging_specs if it's a string
  let packagingSpecs = item.packaging_specs;
  if (packagingSpecs && typeof packagingSpecs === 'string') {
    try {
      packagingSpecs = JSON.parse(packagingSpecs);
    } catch (e) {
      console.error('Failed to parse packaging_specs:', e);
      packagingSpecs = null;
    }
  }

  const category = getCategoryConfig(item);
  const status = getStockStatus(item);
  const statusStyle = statusConfig[status];
  const Icon = category.icon;
  const percentage = Math.round((item.current_stock / item.max_capacity) * 100);
  const totalValue = item.current_stock * calculateTotalProductCost(item);

  // Render simple view for ingredients and packaging
  if (!isProduct) {
    return (
      <Dialog open={open} onOpenChange={onClose}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-3">
              <div className={cn("w-10 h-10 rounded-lg flex items-center justify-center", category.color)}>
                <Icon className="w-5 h-5" />
              </div>
              <div>
                <span className="text-xl">{item.name}</span>
                <p className="text-sm font-normal text-slate-500">{item.sku_code}</p>
              </div>
            </DialogTitle>
          </DialogHeader>

          <div className="space-y-4">
            {/* Status and Category */}
            <div className="flex items-center gap-2 mb-6">
              <Badge variant="outline" className={cn("font-medium", statusStyle.color)}>
                {statusStyle.label}
              </Badge>
              <Badge variant="outline" className={category.color}>
                {getCategoryLabel(item)}
              </Badge>
            </div>

            {/* Description */}
            {item.description && (
              <p className="text-slate-600">{item.description}</p>
            )}

            {/* Stock Level */}
            <div className="bg-slate-50 rounded-lg p-4 space-y-4">
              <div className="flex items-center justify-between">
                <span className="font-medium text-slate-700">Stock Level</span>
                <span className="text-lg font-bold text-slate-900">
                  {item.current_stock} / {item.max_capacity} {item.unit_of_measure}
                </span>
              </div>
              <Progress value={percentage} className="h-3" />
              <div className="grid grid-cols-3 gap-4 text-sm">
                <div className="text-center p-3 bg-white rounded-lg border border-slate-200">
                  <p className="text-slate-500">Min Threshold</p>
                  <p className="font-semibold text-slate-900">{item.min_threshold} {item.unit_of_measure}</p>
                </div>
                <div className="text-center p-3 bg-white rounded-lg border border-slate-200">
                  <p className="text-slate-500">Purchase Allowance</p>
                  <p className="font-semibold text-slate-900">{item.purchase_allowance} {item.unit_of_measure}</p>
                </div>
                <div className="text-center p-3 bg-white rounded-lg border border-slate-200">
                  <p className="text-slate-500">Total Value</p>
                  <p className="font-semibold text-emerald-600">₱{formatNumber(totalValue, 2)}</p>
                </div>
              </div>
            </div>

            {/* Packaging Specs (for packaging) */}
            {item.category === 'packaging' && packagingSpecs && (
              <div className="bg-amber-50 rounded-lg p-4 space-y-4">
                <h4 className="font-medium text-amber-900 flex items-center gap-2">
                  <Ruler className="w-4 h-4" />
                  Packaging Specifications
                </h4>
                <div className="grid grid-cols-2 gap-4">
                  <div className="bg-white rounded-lg p-3 border border-amber-100">
                    <p className="text-xs text-slate-500">Dimensions</p>
                    <p className="font-medium text-slate-900">
                      {packagingSpecs.height} × {packagingSpecs.width}
                    </p>
                  </div>
                  <div className="bg-white rounded-lg p-3 border border-amber-100">
                    <p className="text-xs text-slate-500">Thickness</p>
                    <p className="font-medium text-slate-900">{packagingSpecs.thickness}</p>
                  </div>
                  <div className="bg-white rounded-lg p-3 border border-amber-100">
                    <p className="text-xs text-slate-500">Material</p>
                    <p className="font-medium text-slate-900">{packagingSpecs.material}</p>
                  </div>
                  <div className="bg-white rounded-lg p-3 border border-amber-100">
                    <p className="text-xs text-slate-500">Design</p>
                    <p className="font-medium text-slate-900">{packagingSpecs.design}</p>
                  </div>
                  <div className="bg-white rounded-lg p-3 border border-amber-100 col-span-2">
                    <p className="text-xs text-slate-500">Contents</p>
                    <p className="font-medium text-slate-900">{packagingSpecs.contents}</p>
                  </div>
                </div>
              </div>
            )}

            {/* Shelf Life Info - only show if shelf_life_days is configured */}
            {item.fifo_enabled && (item.shelf_life_days || item.opened_shelf_life_days) && (
              <div className="bg-purple-50 rounded-lg p-4 space-y-3">
                <h4 className="font-medium text-purple-900 flex items-center gap-2">
                  <Calendar className="w-4 h-4" />
                  Shelf Life Information
                </h4>
                <div className="grid grid-cols-2 gap-4">
                  <div className="bg-white rounded-lg p-3 border border-purple-100">
                    <p className="text-xs text-slate-500">Unopened Shelf Life</p>
                    <p className="font-medium text-slate-900">
                      {item.shelf_life_days ? `${item.shelf_life_days} Days` : 'Not set'}
                    </p>
                  </div>
                  <div className="bg-white rounded-lg p-3 border border-purple-100">
                    <p className="text-xs text-slate-500">Opened Shelf Life</p>
                    <p className="font-medium text-slate-900">
                      {item.opened_shelf_life_days ? `${item.opened_shelf_life_days} Days` : 'Not set'}
                    </p>
                  </div>
                </div>
              </div>
            )}

            {/* FIFO Batch Viewer - shows for all FIFO-enabled items (with or without expiry) */}
            {item.fifo_enabled && <FIFOBatchViewer item={item} onRefresh={onRefresh} />}

            {/* Cost Info */}
            <div className="flex items-center justify-between p-4 bg-slate-50 rounded-lg">
              <div>
                <p className="text-sm text-slate-500">Cost per Unit</p>
                <p className="text-xl font-bold text-slate-900">₱{formatNumber(item.cost_per_unit, 2)}</p>
              </div>
              <div className="text-right">
                <p className="text-sm text-slate-500">Last Updated</p>
                <p className="font-medium text-slate-700">{item.last_updated}</p>
              </div>
            </div>

            {/* Actions */}
            <div className="flex gap-6 pt-8 pb-6 border-t border-slate-200">
              <Link to={createPageUrl("StockMovements") + `?item=${item.id}`} className="flex-1">
                <Button variant="outline" className="w-full">
                  <History className="w-4 h-4 mr-2" />
                  View Movement History
                </Button>
              </Link>
              <Link to={createPageUrl("StockMovements") + `?action=create&item=${item.id}`} className="flex-1">
                <Button className="w-full bg-teal-600 hover:bg-teal-700">
                  <Plus className="w-4 h-4 mr-2" />
                  Create Stock Movement
                </Button>
              </Link>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    );
  }

  // Render enhanced accordion view for products
  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="w-[90vw] max-w-[90vw] h-[90vh] max-h-[90vh] overflow-hidden flex flex-col">
        <DialogHeader className="flex-shrink-0">
          <DialogTitle className="flex items-center gap-3">
            <div className={cn("w-10 h-10 rounded-lg flex items-center justify-center", category.color)}>
              <Icon className="w-5 h-5" />
            </div>
            <div>
              <span className="text-xl">{item.name}</span>
              <p className="text-sm font-normal text-slate-500">{item.sku_code}</p>
            </div>
          </DialogTitle>
        </DialogHeader>

        {/* Scrollable Accordion Content */}
        <div className="flex-1 overflow-y-auto py-2">
          <Accordion type="multiple" defaultValue={defaultOpenSections} className="w-full">

            {/* Basic Information */}
            <AccordionItem value="basic-info">
              <AccordionTrigger>
                <div className="flex items-center gap-2">
                  <Info className="w-5 h-5 text-teal-600" />
                  <span className="font-semibold">Basic Information</span>
                </div>
              </AccordionTrigger>
              <AccordionContent>
                <BasicInfoSection item={item} />
              </AccordionContent>
            </AccordionItem>

            {/* Stock & Inventory */}
            <AccordionItem value="stock-inventory">
              <AccordionTrigger>
                <div className="flex items-center gap-2">
                  <Warehouse className="w-5 h-5 text-teal-600" />
                  <span className="font-semibold">Stock & Inventory</span>
                </div>
              </AccordionTrigger>
              <AccordionContent>
                <StockInventorySection item={item} />
              </AccordionContent>
            </AccordionItem>

            {/* Yield Management */}
            {hasYieldManagement(item) && (
              <AccordionItem value="yield">
                <AccordionTrigger>
                  <div className="flex items-center gap-2">
                    <Factory className="w-5 h-5 text-green-600" />
                    <span className="font-semibold">Yield & Production</span>
                  </div>
                </AccordionTrigger>
                <AccordionContent>
                  <YieldManagementSection item={item} />
                </AccordionContent>
              </AccordionItem>
            )}

            {/* Nutritional Information */}
            {hasNutritionalInfo(item) && (
              <AccordionItem value="nutrition">
                <AccordionTrigger>
                  <div className="flex items-center gap-2">
                    <UtensilsCrossed className="w-5 h-5 text-orange-600" />
                    <span className="font-semibold">Nutritional Information</span>
                  </div>
                </AccordionTrigger>
                <AccordionContent>
                  <NutritionalInfoSection item={item} />
                </AccordionContent>
              </AccordionItem>
            )}

            {/* Physical Properties */}
            <AccordionItem value="properties">
              <AccordionTrigger>
                <div className="flex items-center gap-2">
                  <Droplet className="w-5 h-5 text-cyan-600" />
                  <span className="font-semibold">Physical Properties</span>
                </div>
              </AccordionTrigger>
              <AccordionContent>
                <PhysicalPropertiesSection item={item} />
              </AccordionContent>
            </AccordionItem>

            {/* Shelf Life */}
            <AccordionItem value="shelf-life">
              <AccordionTrigger>
                <div className="flex items-center gap-2">
                  <Calendar className="w-5 h-5 text-purple-600" />
                  <span className="font-semibold">Shelf Life & Storage</span>
                </div>
              </AccordionTrigger>
              <AccordionContent>
                <ShelfLifeSection item={item} />
              </AccordionContent>
            </AccordionItem>

            {/* Packaging Information */}
            <AccordionItem value="packaging">
              <AccordionTrigger>
                <div className="flex items-center gap-2">
                  <BoxIcon className="w-5 h-5 text-amber-600" />
                  <span className="font-semibold">Packaging & Labeling</span>
                </div>
              </AccordionTrigger>
              <AccordionContent>
                <PackagingInfoSection item={item} />
              </AccordionContent>
            </AccordionItem>

            {/* Cost & Financial */}
            <AccordionItem value="cost">
              <AccordionTrigger>
                <div className="flex items-center gap-2">
                  <DollarSign className="w-5 h-5 text-green-600" />
                  <span className="font-semibold">Cost & Financial</span>
                </div>
              </AccordionTrigger>
              <AccordionContent>
                <CostFinancialSection item={item} />
              </AccordionContent>
            </AccordionItem>

            {/* Quality Control */}
            <AccordionItem value="quality">
              <AccordionTrigger>
                <div className="flex items-center gap-2">
                  <ClipboardCheck className="w-5 h-5 text-indigo-600" />
                  <span className="font-semibold">Quality Control</span>
                </div>
              </AccordionTrigger>
              <AccordionContent>
                <QualityControlSection item={item} />
              </AccordionContent>
            </AccordionItem>

            {/* Regulatory Compliance */}
            <AccordionItem value="compliance">
              <AccordionTrigger>
                <div className="flex items-center gap-2">
                  <Shield className="w-5 h-5 text-teal-600" />
                  <span className="font-semibold">Regulatory Compliance</span>
                </div>
              </AccordionTrigger>
              <AccordionContent>
                <RegulatoryComplianceSection item={item} />
              </AccordionContent>
            </AccordionItem>

            {/* FIFO Batches */}
            {item.fifo_enabled && (
              <AccordionItem value="fifo">
                <AccordionTrigger>
                  <div className="flex items-center gap-2">
                    <Layers className="w-5 h-5 text-slate-600" />
                    <span className="font-semibold">FIFO Batches</span>
                  </div>
                </AccordionTrigger>
                <AccordionContent>
                  <FIFOBatchViewer item={item} onRefresh={onRefresh} />
                </AccordionContent>
              </AccordionItem>
            )}

          </Accordion>
        </div>

        {/* Actions Footer */}
        <div className="flex gap-4 pt-4 pb-2 border-t border-slate-200 flex-shrink-0">
          <Link to={createPageUrl("StockMovements") + `?item=${item.id}`} className="flex-1">
            <Button variant="outline" className="w-full">
              <History className="w-4 h-4 mr-2" />
              View Movement History
            </Button>
          </Link>
          <Link to={createPageUrl("StockMovements") + `?action=create&item=${item.id}`} className="flex-1">
            <Button className="w-full bg-teal-600 hover:bg-teal-700">
              <Plus className="w-4 h-4 mr-2" />
              Create Stock Movement
            </Button>
          </Link>
        </div>
      </DialogContent>
    </Dialog>
  );
}
