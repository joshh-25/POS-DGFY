import React from 'react';
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Calendar, Thermometer, Package } from 'lucide-react';

export default function ShelfLifeStep({ data, updateData }) {
  const shelfLife = data.shelf_life || {};

  const updateShelfLife = (field, value) => {
    updateData({
      shelf_life: {
        ...shelfLife,
        [field]: value
      }
    });
  };

  return (
    <div className="space-y-6">
      <div className="bg-teal-50 border border-teal-200 rounded-xl p-4">
        <h3 className="font-semibold text-teal-900 mb-1">Shelf Life & Storage Conditions</h3>
        <p className="text-sm text-teal-700">Critical for food safety, quality maintenance, and regulatory compliance.</p>
      </div>

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
                Ideal for items with expiry dates or varying costs per purchase.
              </p>
            </div>
          </div>
          <Switch
            id="fifo-toggle"
            checked={data.fifo_enabled || false}
            onCheckedChange={(checked) => updateData({ fifo_enabled: checked })}
          />
        </div>
      </div>


      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div className="space-y-2">
          <Label className="flex items-center gap-2">
            <Calendar className="w-4 h-4" />
            Shelf Life (Days)
          </Label>
          <Input
            type="number"
            min="1"
            placeholder="e.g., 365"
            value={shelfLife.duration_days || ''}
            onChange={(e) => updateShelfLife('duration_days', e.target.value === '' ? '' : parseInt(e.target.value) || 0)}
          />
          <p className="text-xs text-slate-500">Unopened shelf life from production date</p>
        </div>

        <div className="space-y-2">
          <Label>Opened Shelf Life (Days)</Label>
          <Input
            type="number"
            min="1"
            placeholder="e.g., 30"
            value={shelfLife.opened_shelf_life_days || ''}
            onChange={(e) => updateShelfLife('opened_shelf_life_days', e.target.value === '' ? '' : parseInt(e.target.value) || 0)}
          />
          <p className="text-xs text-slate-500">After opening/breaking seal</p>
        </div>

        <div className="space-y-2">
          <Label className="flex items-center gap-2">
            <Thermometer className="w-4 h-4" />
            Storage Temperature
          </Label>
          <Select
            value={shelfLife.storage_temperature}
            onValueChange={(val) => updateShelfLife('storage_temperature', val)}
          >
            <SelectTrigger>
              <SelectValue placeholder="Select temperature range" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="frozen">Frozen (-18°C or below)</SelectItem>
              <SelectItem value="refrigerated">Refrigerated (2-8°C)</SelectItem>
              <SelectItem value="cool">Cool (10-15°C)</SelectItem>
              <SelectItem value="room">Room Temperature (15-25°C)</SelectItem>
              <SelectItem value="ambient">Ambient (up to 30°C)</SelectItem>
            </SelectContent>
          </Select>
        </div>

        <div className="space-y-2">
          <Label>Storage Conditions</Label>
          <Textarea
            placeholder="e.g., Store in a cool, dry place away from direct sunlight"
            value={shelfLife.storage_conditions || ''}
            onChange={(e) => updateShelfLife('storage_conditions', e.target.value)}
            className="h-20"
          />
        </div>
      </div>

      {shelfLife.duration_days && (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div className="bg-emerald-50 border border-emerald-200 rounded-xl p-4">
            <p className="text-sm text-emerald-700 mb-1">Unopened</p>
            <p className="text-2xl font-bold text-emerald-900">{shelfLife.duration_days} days</p>
            <p className="text-xs text-emerald-600">
              ≈ {Math.floor(shelfLife.duration_days / 30)} months
            </p>
          </div>

          {shelfLife.opened_shelf_life_days && (
            <div className="bg-amber-50 border border-amber-200 rounded-xl p-4">
              <p className="text-sm text-amber-700 mb-1">After Opening</p>
              <p className="text-2xl font-bold text-amber-900">{shelfLife.opened_shelf_life_days} days</p>
              <p className="text-xs text-amber-600">Consume within period</p>
            </div>
          )}

          <div className="bg-blue-50 border border-blue-200 rounded-xl p-4">
            <p className="text-sm text-blue-700 mb-1">Storage</p>
            <p className="text-lg font-bold text-blue-900 capitalize">
              {shelfLife.storage_temperature?.replace('_', ' ') || 'Not set'}
            </p>
            <p className="text-xs text-blue-600">Required conditions</p>
          </div>
        </div>
      )}

      <div className="bg-blue-50 border border-blue-200 rounded-xl p-4">
        <h4 className="font-semibold text-blue-900 mb-2">Shelf Life Determination</h4>
        <p className="text-sm text-blue-700 mb-2">
          Shelf life should be determined through stability testing and microbial challenge studies.
        </p>
        <ul className="text-sm text-blue-700 space-y-1 list-disc list-inside">
          <li>Accelerated shelf life testing (ASLT)</li>
          <li>Real-time aging studies at various temperatures</li>
          <li>Periodic sensory evaluation and chemical testing</li>
          <li>Microbial stability assessment</li>
        </ul>
      </div>
    </div>
  );
}