import React from 'react';
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { Plus, Folder } from 'lucide-react';

export default function BasicInfoStep({ data, updateData, folders }) {
  const [showNewFolder, setShowNewFolder] = React.useState(false);
  const [newFolderName, setNewFolderName] = React.useState('');

  const handleAddFolder = () => {
    if (newFolderName.trim()) {
      updateData({ product_folder: newFolderName.trim() });
      setNewFolderName('');
      setShowNewFolder(false);
    }
  };

  return (
    <div className="space-y-6">
      <div className="bg-teal-50 border border-teal-200 rounded-xl p-4">
        <h3 className="font-semibold text-teal-900 mb-1">Product Basic Information</h3>
        <p className="text-sm text-teal-700">Start by defining the core details of your product.</p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div className="space-y-2">
          <Label>Product Name *</Label>
          <Input
            placeholder="e.g., Ginger Tea Mix"
            value={data.name}
            onChange={(e) => updateData({ name: e.target.value })}
          />
        </div>

        <div className="space-y-2">
          <Label>SKU Code *</Label>
          <Input
            placeholder="e.g., PRD-GTM-001"
            value={data.sku_code}
            onChange={(e) => updateData({ sku_code: e.target.value })}
          />
        </div>

        <div className="space-y-2">
          <Label>Product Folder / Category</Label>
          {showNewFolder ? (
            <div className="flex gap-2">
              <Input
                placeholder="New folder name"
                value={newFolderName}
                onChange={(e) => setNewFolderName(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && handleAddFolder()}
              />
              <Button variant="outline" size="sm" onClick={handleAddFolder}>Add</Button>
              <Button variant="ghost" size="sm" onClick={() => setShowNewFolder(false)}>Cancel</Button>
            </div>
          ) : (
            <div className="flex gap-2">
              <Select value={data.product_folder} onValueChange={(val) => updateData({ product_folder: val })}>
                <SelectTrigger>
                  <SelectValue placeholder="Select folder" />
                </SelectTrigger>
                <SelectContent>
                  {folders?.map(folder => (
                    <SelectItem key={folder} value={folder}>
                      <div className="flex items-center gap-2">
                        <Folder className="w-4 h-4" />
                        {folder}
                      </div>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Button variant="outline" size="sm" onClick={() => setShowNewFolder(true)}>
                <Plus className="w-4 h-4" />
              </Button>
            </div>
          )}
        </div>

        <div className="space-y-2">
          <Label>Unit of Measure *</Label>
          <Select value={data.unit_of_measure} onValueChange={(val) => updateData({ unit_of_measure: val })}>
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="units">Units</SelectItem>
              <SelectItem value="kg">Kilograms (kg)</SelectItem>
              <SelectItem value="g">Grams (g)</SelectItem>
              <SelectItem value="lbs">Pounds (lbs)</SelectItem>
              <SelectItem value="oz">Ounces (oz)</SelectItem>
              <SelectItem value="L">Liters (L)</SelectItem>
              <SelectItem value="ml">Milliliters (ml)</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>

      <div className="space-y-2">
        <Label>Description</Label>
        <Textarea
          placeholder="Describe your product, its features, and intended use..."
          value={data.description}
          onChange={(e) => updateData({ description: e.target.value })}
          className="h-24"
        />
      </div>

      <div className="border-t border-slate-200 pt-4 mt-4">
        <h4 className="font-medium text-slate-900 mb-4">Inventory Settings</h4>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div className="space-y-2">
            <Label>Max Capacity *</Label>
            <Input
              type="number"
              placeholder="1000"
              value={data.max_capacity || ''}
              onChange={(e) => updateData({ max_capacity: parseFloat(e.target.value) || null })}
            />
            <p className="text-xs text-slate-500">Maximum stock capacity</p>
          </div>

          <div className="space-y-2">
            <Label>Min Threshold</Label>
            <Input
              type="number"
              placeholder="0"
              value={data.min_threshold || ''}
              onChange={(e) => updateData({ min_threshold: parseFloat(e.target.value) || null })}
            />
            <p className="text-xs text-slate-500">Low stock alert threshold</p>
          </div>

          <div className="space-y-2">
            <Label>Purchase Allowance</Label>
            <Input
              type="number"
              placeholder="0"
              value={data.purchase_allowance || ''}
              onChange={(e) => updateData({ purchase_allowance: parseFloat(e.target.value) || null })}
            />
            <p className="text-xs text-slate-500">Additional purchase buffer</p>
          </div>
        </div>
      </div>
    </div>
  );
}