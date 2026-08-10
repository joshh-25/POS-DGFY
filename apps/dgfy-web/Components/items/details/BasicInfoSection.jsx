import React from 'react';
import { Badge } from "@/components/ui/badge";
import { Folder } from 'lucide-react';
import { formatNumber } from '../../../src/lib/numberUtils';
import { getCategoryIcon, getCategoryColor, getCategoryLabel } from '@/components/utils/categoryHelpers';

export default function BasicInfoSection({ item }) {
  const CategoryIcon = getCategoryIcon(item);

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div>
          <label className="text-sm font-medium text-slate-600">Product Name</label>
          <div className="flex items-center gap-2 mt-1">
            <CategoryIcon className="w-4 h-4" />
            <span className="text-lg font-semibold text-slate-900">{item.name}</span>
          </div>
        </div>

        <div>
          <label className="text-sm font-medium text-slate-600">SKU Code</label>
          <p className="mt-1 text-slate-900 font-mono">{item.sku_code || 'N/A'}</p>
        </div>

        <div>
          <label className="text-sm font-medium text-slate-600">Category</label>
          <div className="mt-1">
            <Badge variant="outline" className={getCategoryColor(item)}>
              {getCategoryLabel(item)}
            </Badge>
          </div>
        </div>

        {item.product_folder && (
          <div>
            <label className="text-sm font-medium text-slate-600">Product Folder</label>
            <div className="flex items-center gap-2 mt-1">
              <Folder className="w-4 h-4 text-slate-500" />
              <span className="text-slate-900">{item.product_folder}</span>
            </div>
          </div>
        )}

        <div>
          <label className="text-sm font-medium text-slate-600">Unit of Measure</label>
          <p className="mt-1 text-slate-900">{item.unit_of_measure}</p>
        </div>

        {item.status && (
          <div>
            <label className="text-sm font-medium text-slate-600">Status</label>
            <div className="mt-1">
              <Badge
                variant="outline"
                className={
                  item.status === 'active' ? 'bg-green-100 text-green-800 border-green-300' :
                    item.status === 'draft' ? 'bg-yellow-100 text-yellow-800 border-yellow-300' :
                      'bg-slate-100 text-slate-800 border-slate-300'
                }
              >
                {item.status}
              </Badge>
            </div>
          </div>
        )}
      </div>

      {item.description && (
        <div>
          <label className="text-sm font-medium text-slate-600">Description</label>
          <p className="mt-1 text-slate-700 whitespace-pre-wrap">{item.description}</p>
        </div>
      )}

      {item.updated_at && (
        <div>
          <label className="text-sm font-medium text-slate-600">Last Updated</label>
          <p className="mt-1 text-slate-700">{new Date(item.updated_at).toLocaleString()}</p>
        </div>
      )}

      {item.status === 'draft' && item.wizard_metadata && (
        <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4">
          <h4 className="font-medium text-yellow-900 mb-2">Draft in Progress</h4>
          <div className="text-sm text-yellow-800 space-y-1">
            <p>Last completed step: {item.wizard_metadata.last_completed_step || 0} of 12</p>
            {item.wizard_metadata.last_saved_at && (
              <p>Last saved: {new Date(item.wizard_metadata.last_saved_at).toLocaleString()}</p>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
