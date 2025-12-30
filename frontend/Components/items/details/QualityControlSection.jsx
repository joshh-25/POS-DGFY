import React from 'react';
import { ClipboardCheck, Calendar, Target, AlertTriangle } from 'lucide-react';

export default function QualityControlSection({ item }) {
  const qc = item.quality_control || {};

  const fields = [
    { label: 'Test Frequency', value: qc.test_frequency, icon: <Calendar className="w-4 h-4 text-blue-600" /> },
    { label: 'Acceptance Criteria', value: qc.acceptance_criteria, icon: <Target className="w-4 h-4 text-green-600" /> },
    { label: 'Sampling Plan', value: qc.sampling_plan, icon: <ClipboardCheck className="w-4 h-4 text-purple-600" /> },
    { label: 'Corrective Actions', value: qc.corrective_actions, icon: <AlertTriangle className="w-4 h-4 text-orange-600" /> },
  ];

  const visibleFields = fields.filter(f => f.value && f.value.trim() !== '');

  return (
    <div className="space-y-4">
      {visibleFields.map((field, index) => (
        <div key={index} className="bg-slate-50 rounded-lg p-4 border border-slate-200">
          <div className="flex items-center gap-2 mb-2">
            {field.icon}
            <label className="text-sm font-medium text-slate-700">{field.label}</label>
          </div>
          <p className="text-slate-900 whitespace-pre-wrap">{field.value}</p>
        </div>
      ))}

      {visibleFields.length === 0 && (
        <p className="text-slate-500 text-center py-4">No quality control information defined</p>
      )}
    </div>
  );
}
