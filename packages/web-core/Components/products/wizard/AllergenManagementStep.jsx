import React from 'react';
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { AlertTriangle, Plus, X } from 'lucide-react';
import { cn } from "../../../src/lib/utils.js";

const MAJOR_ALLERGENS = [
  { id: 'milk', label: 'Milk', icon: '🥛' },
  { id: 'eggs', label: 'Eggs', icon: '🥚' },
  { id: 'fish', label: 'Fish', icon: '🐟' },
  { id: 'shellfish', label: 'Shellfish', icon: '🦐' },
  { id: 'tree_nuts', label: 'Tree Nuts', icon: '🌰' },
  { id: 'peanuts', label: 'Peanuts', icon: '🥜' },
  { id: 'wheat', label: 'Wheat', icon: '🌾' },
  { id: 'soybeans', label: 'Soybeans', icon: '🫘' },
  { id: 'sesame', label: 'Sesame', icon: '🫘' }
];

export default function AllergenManagementStep({ data, updateData }) {
  const allergens = data.allergens || [];
  const mayContain = data.may_contain_allergens || [];

  const toggleAllergen = (allergenId) => {
    const updated = allergens.includes(allergenId)
      ? allergens.filter(a => a !== allergenId)
      : [...allergens, allergenId];
    updateData({ allergens: updated });
  };

  const addMayContain = (allergenId) => {
    if (!mayContain.includes(allergenId)) {
      updateData({ may_contain_allergens: [...mayContain, allergenId] });
    }
  };

  const removeMayContain = (allergenId) => {
    updateData({ may_contain_allergens: mayContain.filter(a => a !== allergenId) });
  };

  return (
    <div className="space-y-6">
      <div className="bg-teal-50 border border-teal-200 rounded-xl p-4">
        <h3 className="font-semibold text-teal-900 mb-1">Allergen Management & Validation</h3>
        <p className="text-sm text-teal-700">Critical for food safety and regulatory compliance. Identify all allergens present and potential cross-contamination risks.</p>
      </div>

      <div className="space-y-6">
        <div className="space-y-3">
          <div className="flex items-center gap-2">
            <Label className="text-base font-semibold">Contains (Major Allergens)</Label>
            <Badge variant="outline" className="bg-red-50 text-red-700 border-red-200">
              <AlertTriangle className="w-3 h-3 mr-1" />
              Required Declaration
            </Badge>
          </div>
          <p className="text-sm text-slate-600">Select all allergens present in this product</p>
          
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            {MAJOR_ALLERGENS.map(allergen => {
              const isSelected = allergens.includes(allergen.id);
              return (
                <div
                  key={allergen.id}
                  onClick={() => toggleAllergen(allergen.id)}
                  className={cn(
                    "flex items-center gap-3 p-4 rounded-lg border-2 cursor-pointer transition-all",
                    isSelected
                      ? "border-red-500 bg-red-50"
                      : "border-slate-200 hover:border-slate-300 bg-white"
                  )}
                >
                  <Checkbox checked={isSelected} />
                  <span className="text-2xl">{allergen.icon}</span>
                  <span className="font-medium text-slate-900">{allergen.label}</span>
                </div>
              );
            })}
          </div>
        </div>

        <div className="space-y-3">
          <div className="flex items-center gap-2">
            <Label className="text-base font-semibold">May Contain (Cross-Contamination)</Label>
            <Badge variant="outline" className="bg-amber-50 text-amber-700 border-amber-200">
              Precautionary Statement
            </Badge>
          </div>
          <p className="text-sm text-slate-600">Allergens that might be present due to shared equipment or facilities</p>
          
          <div className="flex flex-wrap gap-2">
            {MAJOR_ALLERGENS.filter(a => !allergens.includes(a.id)).map(allergen => (
              <Button
                key={allergen.id}
                variant={mayContain.includes(allergen.id) ? "default" : "outline"}
                size="sm"
                onClick={() => 
                  mayContain.includes(allergen.id) 
                    ? removeMayContain(allergen.id) 
                    : addMayContain(allergen.id)
                }
                className={cn(
                  mayContain.includes(allergen.id) && "bg-amber-500 hover:bg-amber-600"
                )}
              >
                {allergen.icon} {allergen.label}
                {mayContain.includes(allergen.id) && <X className="w-3 h-3 ml-1" />}
              </Button>
            ))}
          </div>
        </div>

        {allergens.length > 0 && (
          <div className="bg-red-50 border border-red-200 rounded-xl p-4">
            <h4 className="font-semibold text-red-900 mb-2 flex items-center gap-2">
              <AlertTriangle className="w-5 h-5" />
              Allergen Declaration Required
            </h4>
            <p className="text-sm text-red-700 mb-3">
              This product contains: <span className="font-bold">{allergens.map(a => 
                MAJOR_ALLERGENS.find(ma => ma.id === a)?.label
              ).join(', ')}</span>
            </p>
            <p className="text-xs text-red-600">
              ⚠️ Must be clearly labeled on packaging in compliance with FALCPA (Food Allergen Labeling and Consumer Protection Act)
            </p>
          </div>
        )}

        {mayContain.length > 0 && (
          <div className="bg-amber-50 border border-amber-200 rounded-xl p-4">
            <h4 className="font-semibold text-amber-900 mb-2">Precautionary Allergen Labeling</h4>
            <p className="text-sm text-amber-700">
              May contain: <span className="font-bold">{mayContain.join(', ')}</span>
            </p>
          </div>
        )}
      </div>
    </div>
  );
}