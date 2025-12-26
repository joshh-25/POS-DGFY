import React from 'react';
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Info } from 'lucide-react';

export default function NutritionalInfoStep({ data, updateData }) {
  const nutritionalInfo = data.nutritional_info || {};

  const updateNutrition = (field, value) => {
    updateData({
      nutritional_info: {
        ...nutritionalInfo,
        [field]: value
      }
    });
  };

  return (
    <div className="space-y-6">
      <div className="bg-teal-50 border border-teal-200 rounded-xl p-4">
        <h3 className="font-semibold text-teal-900 mb-1">Nutritional Information</h3>
        <p className="text-sm text-teal-700">Required for product labeling and regulatory compliance.</p>
      </div>

      <div className="space-y-4">
        <div className="space-y-2">
          <Label>Serving Size</Label>
          <Input
            placeholder="e.g., 1 cup (240ml)"
            value={nutritionalInfo.serving_size || ''}
            onChange={(e) => updateNutrition('serving_size', e.target.value)}
          />
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="space-y-2">
            <Label>Calories</Label>
            <Input
              type="number"
              min="0"
              placeholder="kcal"
              value={nutritionalInfo.calories || ''}
              onChange={(e) => updateNutrition('calories', e.target.value === '' ? '' : parseFloat(e.target.value) || 0)}
            />
          </div>

          <div className="space-y-2">
            <Label>Total Fat (g)</Label>
            <Input
              type="number"
              step="0.1"
              min="0"
              value={nutritionalInfo.total_fat || ''}
              onChange={(e) => updateNutrition('total_fat', e.target.value === '' ? '' : parseFloat(e.target.value) || 0)}
            />
          </div>

          <div className="space-y-2">
            <Label>Saturated Fat (g)</Label>
            <Input
              type="number"
              step="0.1"
              min="0"
              value={nutritionalInfo.saturated_fat || ''}
              onChange={(e) => updateNutrition('saturated_fat', e.target.value === '' ? '' : parseFloat(e.target.value) || 0)}
            />
          </div>

          <div className="space-y-2">
            <Label>Cholesterol (mg)</Label>
            <Input
              type="number"
              min="0"
              value={nutritionalInfo.cholesterol || ''}
              onChange={(e) => updateNutrition('cholesterol', e.target.value === '' ? '' : parseFloat(e.target.value) || 0)}
            />
          </div>

          <div className="space-y-2">
            <Label>Sodium (mg)</Label>
            <Input
              type="number"
              min="0"
              value={nutritionalInfo.sodium || ''}
              onChange={(e) => updateNutrition('sodium', e.target.value === '' ? '' : parseFloat(e.target.value) || 0)}
            />
          </div>

          <div className="space-y-2">
            <Label>Total Carbohydrates (g)</Label>
            <Input
              type="number"
              step="0.1"
              min="0"
              value={nutritionalInfo.total_carbohydrates || ''}
              onChange={(e) => updateNutrition('total_carbohydrates', e.target.value === '' ? '' : parseFloat(e.target.value) || 0)}
            />
          </div>

          <div className="space-y-2">
            <Label>Dietary Fiber (g)</Label>
            <Input
              type="number"
              step="0.1"
              min="0"
              value={nutritionalInfo.dietary_fiber || ''}
              onChange={(e) => updateNutrition('dietary_fiber', e.target.value === '' ? '' : parseFloat(e.target.value) || 0)}
            />
          </div>

          <div className="space-y-2">
            <Label>Sugars (g)</Label>
            <Input
              type="number"
              step="0.1"
              min="0"
              value={nutritionalInfo.sugars || ''}
              onChange={(e) => updateNutrition('sugars', e.target.value === '' ? '' : parseFloat(e.target.value) || 0)}
            />
          </div>

          <div className="space-y-2">
            <Label>Protein (g)</Label>
            <Input
              type="number"
              step="0.1"
              min="0"
              value={nutritionalInfo.protein || ''}
              onChange={(e) => updateNutrition('protein', e.target.value === '' ? '' : parseFloat(e.target.value) || 0)}
            />
          </div>
        </div>

        <div className="flex items-start gap-2 text-sm text-slate-600 bg-blue-50 p-3 rounded-lg">
          <Info className="w-4 h-4 mt-0.5 flex-shrink-0 text-blue-600" />
          <p>FDA requires nutritional labeling for most packaged foods. Values should be per serving and can be determined through lab testing or calculation based on ingredient composition.</p>
        </div>
      </div>
    </div>
  );
}