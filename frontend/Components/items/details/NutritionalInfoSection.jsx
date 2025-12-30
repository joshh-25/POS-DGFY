import React from 'react';
import { Utensils } from 'lucide-react';
import { formatNumber } from '../../../src/lib/numberUtils';

export default function NutritionalInfoSection({ item }) {
  const nutrition = item.nutritional_info || {};

  const nutritionFacts = [
    { label: 'Calories', value: nutrition.calories, unit: 'kcal', key: 'calories' },
    { label: 'Total Fat', value: nutrition.total_fat, unit: 'g', key: 'total_fat' },
    { label: 'Saturated Fat', value: nutrition.saturated_fat, unit: 'g', key: 'saturated_fat', indent: true },
    { label: 'Cholesterol', value: nutrition.cholesterol, unit: 'mg', key: 'cholesterol' },
    { label: 'Sodium', value: nutrition.sodium, unit: 'mg', key: 'sodium' },
    { label: 'Total Carbohydrates', value: nutrition.total_carbohydrates, unit: 'g', key: 'total_carbohydrates' },
    { label: 'Dietary Fiber', value: nutrition.dietary_fiber, unit: 'g', key: 'dietary_fiber', indent: true },
    { label: 'Sugars', value: nutrition.sugars, unit: 'g', key: 'sugars', indent: true },
    { label: 'Protein', value: nutrition.protein, unit: 'g', key: 'protein' },
  ];

  const hasAnyNutrition = nutritionFacts.some(fact => fact.value !== null && fact.value !== undefined && fact.value !== '');

  return (
    <div className="space-y-4">
      {nutrition.serving_size && (
        <div className="bg-slate-50 rounded-lg p-3 border border-slate-200">
          <label className="text-sm font-medium text-slate-600">Serving Size</label>
          <p className="text-lg font-semibold text-slate-900 mt-1">{nutrition.serving_size}</p>
        </div>
      )}

      {hasAnyNutrition && (
        <div className="bg-white rounded-lg border-2 border-slate-900">
          <div className="bg-slate-900 text-white p-3">
            <div className="flex items-center gap-2">
              <Utensils className="w-5 h-5" />
              <h3 className="text-xl font-bold">Nutrition Facts</h3>
            </div>
          </div>

          <div className="divide-y divide-slate-300">
            {nutritionFacts.map((fact, index) => {
              if (fact.value === null || fact.value === undefined || fact.value === '') return null;

              return (
                <div
                  key={fact.key}
                  className={`flex items-center justify-between p-3 ${fact.indent ? 'pl-8' : ''} ${
                    !fact.indent ? 'font-semibold' : ''
                  }`}
                >
                  <span className="text-slate-900">{fact.label}</span>
                  <span className="text-slate-900">
                    {formatNumber(fact.value, 1)}{fact.unit}
                  </span>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {!hasAnyNutrition && !nutrition.serving_size && (
        <p className="text-slate-500 text-center py-4">No nutritional information available</p>
      )}
    </div>
  );
}
