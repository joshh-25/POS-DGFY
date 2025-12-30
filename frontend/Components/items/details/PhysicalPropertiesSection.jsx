import React from 'react';
import { Droplet, Palette, TestTube } from 'lucide-react';

export default function PhysicalPropertiesSection({ item }) {
  const props = item.physical_properties || {};

  const properties = [
    { label: 'Texture', value: props.texture, icon: <TestTube className="w-4 h-4" /> },
    { label: 'Color', value: props.color, icon: <Palette className="w-4 h-4" /> },
    { label: 'pH Level', value: props.ph_level, icon: <Droplet className="w-4 h-4" />, suffix: 'pH' },
    { label: 'Water Activity', value: props.water_activity, icon: <Droplet className="w-4 h-4" />, suffix: 'aw' },
    { label: 'Viscosity', value: props.viscosity, icon: <Droplet className="w-4 h-4" /> },
  ];

  const visibleProperties = properties.filter(p => p.value !== null && p.value !== undefined && p.value !== '');

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
      {visibleProperties.map((property, index) => (
        <div key={index} className="bg-slate-50 rounded-lg p-4 border border-slate-200">
          <div className="flex items-center gap-2 mb-2 text-slate-600">
            {property.icon}
            <label className="text-sm font-medium">{property.label}</label>
          </div>
          <p className="text-lg font-semibold text-slate-900">
            {property.value} {property.suffix || ''}
          </p>
        </div>
      ))}

      {visibleProperties.length === 0 && (
        <div className="col-span-2">
          <p className="text-slate-500 text-center py-4">No physical properties defined</p>
        </div>
      )}
    </div>
  );
}
