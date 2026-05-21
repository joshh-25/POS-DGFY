import React from 'react';
import { Badge } from "@/components/ui/badge";
import { AlertTriangle, AlertCircle } from 'lucide-react';
import { formatAllergenName } from './helpers';

export default function AllergenSection({ item }) {
  const allergens = item.allergens || [];
  const mayContain = item.may_contain_allergens || [];

  return (
    <div className="space-y-6">
      {allergens.length > 0 && (
        <div>
          <div className="flex items-center gap-2 mb-3">
            <AlertTriangle className="w-5 h-5 text-red-600" />
            <h4 className="font-semibold text-red-900">Contains Allergens</h4>
          </div>
          <div className="flex flex-wrap gap-2">
            {allergens.map((allergen, index) => (
              <Badge
                key={index}
                variant="outline"
                className="bg-red-100 text-red-800 border-red-300 px-3 py-1 text-sm font-medium"
              >
                {formatAllergenName(allergen)}
              </Badge>
            ))}
          </div>
        </div>
      )}

      {mayContain.length > 0 && (
        <div>
          <div className="flex items-center gap-2 mb-3">
            <AlertCircle className="w-5 h-5 text-yellow-600" />
            <h4 className="font-semibold text-yellow-900">May Contain Allergens</h4>
          </div>
          <div className="flex flex-wrap gap-2">
            {mayContain.map((allergen, index) => (
              <Badge
                key={index}
                variant="outline"
                className="bg-yellow-100 text-yellow-800 border-yellow-300 px-3 py-1 text-sm font-medium"
              >
                {formatAllergenName(allergen)}
              </Badge>
            ))}
          </div>
        </div>
      )}

      {allergens.length === 0 && mayContain.length === 0 && (
        <div className="bg-green-50 border border-green-200 rounded-lg p-4 text-center">
          <p className="text-green-800 font-medium">No allergen information specified</p>
        </div>
      )}
    </div>
  );
}
