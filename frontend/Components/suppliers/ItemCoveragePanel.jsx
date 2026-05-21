import React, { useState } from 'react';
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import {
  ChevronDown,
  ChevronUp,
  Package,
  AlertTriangle,
  CheckCircle2,
  Plus,
  Search
} from 'lucide-react';
import { Input } from "@/components/ui/input";
import { cn } from "../../src/lib/utils.js";
import { formatQty } from '../../src/lib/numberUtils.js';
import { useItemSupplierCoverage } from '../../src/hooks/useItems.js';

/**
 * Item Coverage Panel - Shows items with and without supplier assignments
 * Displayed on the Suppliers page to help users manage supplier-item relationships
 */
export default function ItemCoveragePanel({ onAddSupplier, suppliers }) {
  const [isExpanded, setIsExpanded] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [activeTab, setActiveTab] = useState('without');

  const {
    itemsWithSupplier,
    itemsWithoutSupplier,
    summary,
    loading,
    error,
    refetch
  } = useItemSupplierCoverage();

  // Filter items based on search query
  const filteredWithSupplier = itemsWithSupplier.filter(item =>
    item.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
    item.sku_code?.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const filteredWithoutSupplier = itemsWithoutSupplier.filter(item =>
    item.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
    item.sku_code?.toLowerCase().includes(searchQuery.toLowerCase())
  );

  // Format category for display
  const formatCategory = (category) => {
    return category?.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase()) || 'Unknown';
  };

  if (loading) {
    return (
      <div className="bg-white border border-slate-200 rounded-xl p-4 mb-6">
        <div className="flex items-center gap-2 text-slate-500">
          <Package className="w-5 h-5 animate-pulse" />
          <span>Loading item coverage data...</span>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="bg-red-50 border border-red-200 rounded-xl p-4 mb-6">
        <div className="flex items-center gap-2 text-red-600">
          <AlertTriangle className="w-5 h-5" />
          <span>Failed to load item coverage: {error}</span>
          <Button variant="outline" size="sm" onClick={refetch} className="ml-auto">
            Retry
          </Button>
        </div>
      </div>
    );
  }

  const hasItemsWithoutSupplier = itemsWithoutSupplier.length > 0;

  return (
    <div className={cn(
      "bg-white border rounded-xl mb-6 overflow-hidden transition-all",
      hasItemsWithoutSupplier ? "border-amber-300" : "border-slate-200"
    )}>
      {/* Header - Always visible */}
      <button
        onClick={() => setIsExpanded(!isExpanded)}
        className={cn(
          "w-full flex items-center justify-between p-4 text-left transition-colors",
          hasItemsWithoutSupplier ? "bg-amber-50 hover:bg-amber-100" : "bg-slate-50 hover:bg-slate-100"
        )}
      >
        <div className="flex items-center gap-3">
          <Package className={cn(
            "w-5 h-5",
            hasItemsWithoutSupplier ? "text-amber-600" : "text-slate-600"
          )} />
          <div>
            <h3 className="font-semibold text-slate-900">Item Supplier Coverage</h3>
            <p className="text-sm text-slate-500">
              {summary?.coverage_percent || 0}% of purchasable items have suppliers assigned
            </p>
          </div>
        </div>
        <div className="flex items-center gap-3">
          {hasItemsWithoutSupplier && (
            <Badge className="bg-amber-100 text-amber-700 border-amber-300">
              <AlertTriangle className="w-3 h-3 mr-1" />
              {itemsWithoutSupplier.length} items need suppliers
            </Badge>
          )}
          {isExpanded ? (
            <ChevronUp className="w-5 h-5 text-slate-400" />
          ) : (
            <ChevronDown className="w-5 h-5 text-slate-400" />
          )}
        </div>
      </button>

      {/* Expandable Content */}
      {isExpanded && (
        <div className="p-4 border-t border-slate-200">
          {/* Tabs */}
          <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
            <div className="flex items-center justify-between mb-4">
              <TabsList>
                <TabsTrigger value="without" className="gap-2">
                  <AlertTriangle className="w-4 h-4" />
                  Without Supplier
                  <Badge variant="outline" className={cn(
                    "ml-1",
                    activeTab === 'without' ? "bg-amber-100 text-amber-700" : ""
                  )}>
                    {itemsWithoutSupplier.length}
                  </Badge>
                </TabsTrigger>
                <TabsTrigger value="with" className="gap-2">
                  <CheckCircle2 className="w-4 h-4" />
                  With Supplier
                  <Badge variant="outline" className={cn(
                    "ml-1",
                    activeTab === 'with' ? "bg-teal-100 text-teal-700" : ""
                  )}>
                    {itemsWithSupplier.length}
                  </Badge>
                </TabsTrigger>
              </TabsList>

              {/* Search */}
              <div className="relative w-64">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                <Input
                  placeholder="Search items..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="pl-9 h-9"
                />
              </div>
            </div>

            {/* Items Without Supplier Tab */}
            <TabsContent value="without">
              {filteredWithoutSupplier.length === 0 ? (
                <div className="text-center py-8 text-slate-500">
                  {searchQuery ? (
                    <p>No items match your search</p>
                  ) : (
                    <div className="flex flex-col items-center gap-2">
                      <CheckCircle2 className="w-12 h-12 text-teal-500" />
                      <p className="font-medium text-teal-700">All items have suppliers assigned!</p>
                      <p className="text-sm">Great job keeping your supplier relationships up to date.</p>
                    </div>
                  )}
                </div>
              ) : (
                <div className="space-y-2 max-h-80 overflow-y-auto">
                  {filteredWithoutSupplier.map(item => (
                    <div
                      key={item.item_id}
                      className="flex items-center justify-between p-3 bg-slate-50 border border-slate-200 rounded-lg hover:border-slate-300 transition-colors"
                    >
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <span className="font-medium text-slate-900 truncate">{item.name}</span>
                          <Badge variant="outline" className="text-xs bg-slate-100">
                            {formatCategory(item.category)}
                          </Badge>
                        </div>
                        <p className="text-xs text-slate-500 mt-0.5">
                          {item.sku_code} • Stock: {formatQty(item.current_stock)} {item.unit_of_measure}
                        </p>
                      </div>
                      <Button
                        size="sm"
                        onClick={() => onAddSupplier(item)}
                        className="bg-teal-600 hover:bg-teal-700 ml-3"
                      >
                        <Plus className="w-4 h-4 mr-1" />
                        Add Supplier
                      </Button>
                    </div>
                  ))}
                </div>
              )}
            </TabsContent>

            {/* Items With Supplier Tab */}
            <TabsContent value="with">
              {filteredWithSupplier.length === 0 ? (
                <div className="text-center py-8 text-slate-500">
                  {searchQuery ? (
                    <p>No items match your search</p>
                  ) : (
                    <p>No items with suppliers found</p>
                  )}
                </div>
              ) : (
                <div className="space-y-2 max-h-80 overflow-y-auto">
                  {filteredWithSupplier.map(item => (
                    <div
                      key={item.item_id}
                      className="flex items-center justify-between p-3 bg-slate-50 border border-slate-200 rounded-lg"
                    >
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <span className="font-medium text-slate-900 truncate">{item.name}</span>
                          <Badge variant="outline" className="text-xs bg-slate-100">
                            {formatCategory(item.category)}
                          </Badge>
                        </div>
                        <p className="text-xs text-slate-500 mt-0.5">
                          {item.sku_code} • Stock: {formatQty(item.current_stock)} {item.unit_of_measure}
                        </p>
                      </div>
                      <div className="flex items-center gap-2 ml-3">
                        <div className="text-right">
                          <p className="text-sm font-medium text-teal-700">
                            {item.supplier_count} supplier{item.supplier_count !== 1 ? 's' : ''}
                          </p>
                          <p className="text-xs text-slate-500">
                            {item.suppliers?.map(s => s.supplier_name).slice(0, 2).join(', ')}
                            {item.suppliers?.length > 2 && ` +${item.suppliers.length - 2} more`}
                          </p>
                        </div>
                        <CheckCircle2 className="w-5 h-5 text-teal-500 flex-shrink-0" />
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </TabsContent>
          </Tabs>
        </div>
      )}
    </div>
  );
}
