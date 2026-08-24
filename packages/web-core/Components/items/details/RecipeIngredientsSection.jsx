import React from 'react';
import { Box, Archive } from 'lucide-react';
import { formatNumber } from '../../../src/lib/numberUtils';

export default function RecipeIngredientsSection({ item }) {
  const ingredients = item.ingredients || [];
  const packagingItems = item.packaging_items || [];

  return (
    <div className="space-y-6">
      {ingredients.length > 0 && (
        <div>
          <div className="flex items-center gap-2 mb-3">
            <Box className="w-5 h-5 text-blue-600" />
            <h4 className="font-semibold text-slate-900">Ingredients</h4>
          </div>
          <div className="space-y-2">
            {ingredients.map((ingredient, index) => (
              <div
                key={index}
                className="flex items-center justify-between p-3 bg-blue-50 border border-blue-200 rounded-lg"
              >
                <span className="text-slate-900">{ingredient.item_name || `Item #${ingredient.item_id}`}</span>
                <span className="font-medium text-blue-900">
                  {formatNumber(ingredient.quantity, 3)} {item.unit_of_measure || 'units'}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      {packagingItems.length > 0 && (
        <div>
          <div className="flex items-center gap-2 mb-3">
            <Archive className="w-5 h-5 text-purple-600" />
            <h4 className="font-semibold text-slate-900">Packaging Materials</h4>
          </div>
          <div className="space-y-2">
            {packagingItems.map((pkg, index) => (
              <div
                key={index}
                className="flex items-center justify-between p-3 bg-purple-50 border border-purple-200 rounded-lg"
              >
                <span className="text-slate-900">{pkg.item_name || `Item #${pkg.item_id}`}</span>
                <span className="font-medium text-purple-900">
                  {formatNumber(pkg.quantity, 3)} {item.unit_of_measure || 'units'}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      {ingredients.length === 0 && packagingItems.length === 0 && (
        <p className="text-slate-500 text-center py-4">No recipe components defined</p>
      )}
    </div>
  );
}
