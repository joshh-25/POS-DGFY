import React, { useState } from 'react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogDescription,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Star,
  Package,
  Loader2
} from 'lucide-react';
import { cn } from "../../src/lib/utils.js";
import { addSupplierItem } from '../../src/services/supplierService.js';
import { toast } from 'sonner';

/**
 * Quick Assign Supplier Modal
 * Allows quickly assigning an item to an existing supplier
 * with MOQ and price per unit
 */
export default function QuickAssignSupplierModal({
  open,
  onClose,
  item,
  suppliers,
  onSuccess
}) {
  const [selectedSupplierId, setSelectedSupplierId] = useState('');
  const [moq, setMoq] = useState('1');
  const [pricePerUnit, setPricePerUnit] = useState('');
  const [loading, setLoading] = useState(false);

  // Filter to only active suppliers
  const activeSuppliers = suppliers?.filter(s => s.status === 'active') || [];

  // Get selected supplier details
  const selectedSupplier = activeSuppliers.find(
    s => String(s.supplier_id || s.id) === selectedSupplierId
  );

  const handleSubmit = async (e) => {
    e.preventDefault();

    if (!selectedSupplierId) {
      toast.error('Please select a supplier');
      return;
    }

    if (!pricePerUnit || parseFloat(pricePerUnit) <= 0) {
      toast.error('Please enter a valid price per unit');
      return;
    }

    setLoading(true);
    try {
      await addSupplierItem(selectedSupplierId, {
        item_id: item.item_id || item.id,
        moq: parseFloat(moq) || 1,
        price_per_unit: parseFloat(pricePerUnit)
      });

      toast.success('Supplier assigned successfully', {
        description: `${item.name} has been assigned to ${selectedSupplier?.name}`
      });

      // Reset form and close
      setSelectedSupplierId('');
      setMoq('1');
      setPricePerUnit('');
      onSuccess?.();
      onClose();
    } catch (err) {
      console.error('Failed to assign supplier:', err);
      const message = err.response?.data?.message || err.message || 'Failed to assign supplier';
      toast.error(message);
    } finally {
      setLoading(false);
    }
  };

  const handleClose = () => {
    if (!loading) {
      setSelectedSupplierId('');
      setMoq('1');
      setPricePerUnit('');
      onClose();
    }
  };

  if (!item) return null;

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Package className="w-5 h-5 text-teal-600" />
            Assign to Existing Supplier
          </DialogTitle>
          <DialogDescription>
            Link &quot;{item.name}&quot; to one of your suppliers
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4">
          {/* Supplier Selection */}
          <div className="space-y-2">
            <Label htmlFor="supplier">Supplier *</Label>
            <Select
              value={selectedSupplierId}
              onValueChange={setSelectedSupplierId}
            >
              <SelectTrigger className="w-full">
                <SelectValue placeholder="Select a supplier" />
              </SelectTrigger>
              <SelectContent>
                {activeSuppliers.map(supplier => (
                  <SelectItem
                    key={supplier.supplier_id || supplier.id}
                    value={String(supplier.supplier_id || supplier.id)}
                  >
                    <div className="flex items-center gap-2">
                      <span>{supplier.name}</span>
                      {supplier.quality_rating && (
                        <span className="flex items-center gap-1 text-xs text-amber-600">
                          <Star className="w-3 h-3" fill="currentColor" />
                          {supplier.quality_rating}
                        </span>
                      )}
                    </div>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Selected Supplier Info */}
          {selectedSupplier && (
            <div className="bg-teal-50 border border-teal-200 rounded-lg p-3 text-sm">
              <div className="flex items-center justify-between">
                <span className="font-medium text-teal-800">{selectedSupplier.name}</span>
                <Badge className="bg-teal-100 text-teal-700">
                  {selectedSupplier.items_supplied?.length || 0} items
                </Badge>
              </div>
              {selectedSupplier.quality_rating && (
                <div className="flex items-center gap-1 mt-1 text-teal-600">
                  <Star className="w-3 h-3" fill="currentColor" />
                  <span>{selectedSupplier.quality_rating} rating</span>
                  {selectedSupplier.avg_delivery_days && (
                    <span className="ml-2">• {selectedSupplier.avg_delivery_days} day delivery</span>
                  )}
                </div>
              )}
            </div>
          )}

          {/* MOQ and Price */}
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="moq">
                Minimum Order Qty (MOQ)
              </Label>
              <Input
                id="moq"
                type="number"
                min="1"
                step="1"
                value={moq}
                onChange={(e) => setMoq(e.target.value)}
                placeholder="1"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="price">
                Price per {item.unit_of_measure || 'unit'} *
              </Label>
              <div className="relative">
                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500">₱</span>
                <Input
                  id="price"
                  type="number"
                  min="0"
                  step="0.01"
                  value={pricePerUnit}
                  onChange={(e) => setPricePerUnit(e.target.value)}
                  placeholder="0.00"
                  className="pl-7"
                  required
                />
              </div>
            </div>
          </div>

          <DialogFooter className="gap-2 sm:gap-2">
            <Button
              type="button"
              variant="outline"
              onClick={handleClose}
              disabled={loading}
            >
              Cancel
            </Button>
            <Button
              type="submit"
              disabled={loading || !selectedSupplierId || !pricePerUnit}
              className="bg-teal-600 hover:bg-teal-700"
            >
              {loading ? (
                <>
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  Assigning...
                </>
              ) : (
                'Assign Supplier'
              )}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
