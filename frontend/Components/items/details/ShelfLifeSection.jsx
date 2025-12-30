import React from 'react';
import { Calendar, Thermometer, Package } from 'lucide-react';
import { formatNumber } from '../../../src/lib/numberUtils';

export default function ShelfLifeSection({ item }) {
  const shelfLife = item.shelf_life || {};

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
      {shelfLife.duration_days && (
        <div className="bg-slate-50 rounded-lg p-4 border border-slate-200">
          <div className="flex items-center gap-2 mb-2">
            <Calendar className="w-4 h-4 text-slate-500" />
            <label className="text-sm font-medium text-slate-600">Shelf Life (Unopened)</label>
          </div>
          <p className="text-2xl font-bold text-slate-900">
            {formatNumber(shelfLife.duration_days, 0)} days
          </p>
        </div>
      )}

      {shelfLife.opened_shelf_life_days && (
        <div className="bg-slate-50 rounded-lg p-4 border border-slate-200">
          <div className="flex items-center gap-2 mb-2">
            <Package className="w-4 h-4 text-slate-500" />
            <label className="text-sm font-medium text-slate-600">Shelf Life (Opened)</label>
          </div>
          <p className="text-2xl font-bold text-slate-900">
            {formatNumber(shelfLife.opened_shelf_life_days, 0)} days
          </p>
        </div>
      )}

      {shelfLife.storage_temperature && (
        <div className="bg-blue-50 rounded-lg p-4 border border-blue-200">
          <div className="flex items-center gap-2 mb-2">
            <Thermometer className="w-4 h-4 text-blue-600" />
            <label className="text-sm font-medium text-blue-700">Storage Temperature</label>
          </div>
          <p className="text-lg font-semibold text-blue-900">{shelfLife.storage_temperature}</p>
        </div>
      )}

      {shelfLife.storage_conditions && (
        <div className="bg-slate-50 rounded-lg p-4 border border-slate-200">
          <label className="text-sm font-medium text-slate-600 block mb-2">Storage Conditions</label>
          <p className="text-slate-900">{shelfLife.storage_conditions}</p>
        </div>
      )}

      {!shelfLife.duration_days && !shelfLife.opened_shelf_life_days && !shelfLife.storage_temperature && !shelfLife.storage_conditions && (
        <div className="col-span-2">
          <p className="text-slate-500 text-center py-4">No shelf life information available</p>
        </div>
      )}
    </div>
  );
}
