import React from 'react';
import { Package, Box, CheckCircle, Weight } from 'lucide-react';
import { Badge } from "@/components/ui/badge";

export default function PackagingInfoSection({ item }) {
  const packaging = item.packaging_info || {};

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {packaging.primary_packaging && (
          <div className="bg-slate-50 rounded-lg p-4 border border-slate-200">
            <div className="flex items-center gap-2 mb-2">
              <Package className="w-4 h-4 text-slate-500" />
              <label className="text-sm font-medium text-slate-600">Primary Packaging</label>
            </div>
            <p className="text-slate-900">{packaging.primary_packaging}</p>
          </div>
        )}

        {packaging.secondary_packaging && (
          <div className="bg-slate-50 rounded-lg p-4 border border-slate-200">
            <div className="flex items-center gap-2 mb-2">
              <Box className="w-4 h-4 text-slate-500" />
              <label className="text-sm font-medium text-slate-600">Secondary Packaging</label>
            </div>
            <p className="text-slate-900">{packaging.secondary_packaging}</p>
          </div>
        )}

        {packaging.packaging_material && (
          <div className="bg-slate-50 rounded-lg p-4 border border-slate-200">
            <label className="text-sm font-medium text-slate-600 block mb-2">Material</label>
            <p className="text-slate-900">{packaging.packaging_material}</p>
          </div>
        )}

        {packaging.net_weight && (
          <div className="bg-slate-50 rounded-lg p-4 border border-slate-200">
            <div className="flex items-center gap-2 mb-2">
              <Weight className="w-4 h-4 text-slate-500" />
              <label className="text-sm font-medium text-slate-600">Net Weight</label>
            </div>
            <p className="text-lg font-semibold text-slate-900">{packaging.net_weight}</p>
          </div>
        )}
      </div>

      {packaging.label_compliance !== null && packaging.label_compliance !== undefined && (
        <div className="bg-slate-50 rounded-lg p-4 border border-slate-200">
          <div className="flex items-center gap-3">
            <CheckCircle className={`w-5 h-5 ${packaging.label_compliance ? 'text-green-600' : 'text-slate-400'}`} />
            <div>
              <label className="text-sm font-medium text-slate-600">Label Compliance</label>
              <div className="mt-1">
                <Badge
                  variant="outline"
                  className={packaging.label_compliance
                    ? 'bg-green-100 text-green-800 border-green-300'
                    : 'bg-slate-100 text-slate-800 border-slate-300'
                  }
                >
                  {packaging.label_compliance ? 'Compliant' : 'Not Compliant'}
                </Badge>
              </div>
            </div>
          </div>
        </div>
      )}

      {!packaging.primary_packaging && !packaging.secondary_packaging && !packaging.packaging_material && !packaging.net_weight && packaging.label_compliance === null && packaging.label_compliance === undefined && (
        <p className="text-slate-500 text-center py-4">No packaging information available</p>
      )}
    </div>
  );
}
