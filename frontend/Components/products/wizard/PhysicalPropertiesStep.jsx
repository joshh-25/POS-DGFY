import React from 'react';
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Slider } from "@/components/ui/slider";
import { Info } from 'lucide-react';
import { formatNumber } from '../../../src/lib/numberUtils.js';

export default function PhysicalPropertiesStep({ data, updateData }) {
  const properties = data.physical_properties || {};

  const updateProperty = (field, value) => {
    updateData({
      physical_properties: {
        ...properties,
        [field]: value
      }
    });
  };

  return (
    <div className="space-y-6">
      <div className="bg-teal-50 border border-teal-200 rounded-xl p-4">
        <h3 className="font-semibold text-teal-900 mb-1">Physical & Chemical Properties</h3>
        <p className="text-sm text-teal-700">Define measurable characteristics to ensure product consistency and quality.</p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div className="space-y-2">
          <Label>Texture / Consistency</Label>
          <Input
            placeholder="e.g., Smooth powder, Viscous liquid"
            value={properties.texture || ''}
            onChange={(e) => updateProperty('texture', e.target.value)}
          />
        </div>

        <div className="space-y-2">
          <Label>Color Specification</Label>
          <Input
            placeholder="e.g., Golden brown, Pantone 123C"
            value={properties.color || ''}
            onChange={(e) => updateProperty('color', e.target.value)}
          />
        </div>

        <div className="space-y-2">
          <Label>Viscosity</Label>
          <Input
            placeholder="e.g., 1000 cP at 25°C"
            value={properties.viscosity || ''}
            onChange={(e) => updateProperty('viscosity', e.target.value)}
          />
        </div>

        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <Label>pH Level</Label>
            <span className="text-lg font-bold text-teal-600">
              {formatNumber(properties.ph_level, 1)}
            </span>
          </div>
          <Slider
            value={[properties.ph_level || 7]}
            onValueChange={([val]) => updateProperty('ph_level', val)}
            min={0}
            max={14}
            step={0.1}
            className="w-full"
          />
          <div className="flex justify-between text-xs text-slate-500">
            <span>Acidic (0)</span>
            <span>Neutral (7)</span>
            <span>Basic (14)</span>
          </div>
        </div>

        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <Label>Water Activity (aW)</Label>
            <span className="text-lg font-bold text-teal-600">
              {formatNumber(properties.water_activity, 3)}
            </span>
          </div>
          <Slider
            value={[properties.water_activity || 0.6]}
            onValueChange={([val]) => updateProperty('water_activity', val)}
            min={0}
            max={1}
            step={0.001}
            className="w-full"
          />
          <div className="flex items-start gap-2 text-xs text-slate-600 bg-blue-50 p-2 rounded">
            <Info className="w-3 h-3 mt-0.5 flex-shrink-0 text-blue-600" />
            <p>Water activity affects shelf life and microbial growth. &lt;0.6 is generally stable.</p>
          </div>
        </div>
      </div>

      <div className="bg-blue-50 border border-blue-200 rounded-xl p-4">
        <h4 className="font-semibold text-blue-900 mb-2">Quality Control Standards</h4>
        <p className="text-sm text-blue-700">
          These properties should be measured and verified for each batch to ensure consistency. 
          Establish acceptable ranges and document any deviations.
        </p>
      </div>
    </div>
  );
}