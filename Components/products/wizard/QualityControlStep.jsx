import React from 'react';
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ClipboardCheck } from 'lucide-react';

export default function QualityControlStep({ data, updateData }) {
  const qc = data.quality_control || {};

  const updateQC = (field, value) => {
    updateData({
      quality_control: {
        ...qc,
        [field]: value
      }
    });
  };

  return (
    <div className="space-y-6">
      <div className="bg-teal-50 border border-teal-200 rounded-xl p-4">
        <h3 className="font-semibold text-teal-900 mb-1 flex items-center gap-2">
          <ClipboardCheck className="w-5 h-5" />
          Quality Control & Testing Validations
        </h3>
        <p className="text-sm text-teal-700">Define testing requirements and acceptance criteria to ensure consistent quality.</p>
      </div>

      <div className="space-y-4">
        <div className="space-y-2">
          <Label>Test Frequency</Label>
          <Select value={qc.test_frequency} onValueChange={(val) => updateQC('test_frequency', val)}>
            <SelectTrigger>
              <SelectValue placeholder="Select testing frequency" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="every_batch">Every Batch</SelectItem>
              <SelectItem value="daily">Daily</SelectItem>
              <SelectItem value="weekly">Weekly</SelectItem>
              <SelectItem value="bi_weekly">Bi-Weekly</SelectItem>
              <SelectItem value="monthly">Monthly</SelectItem>
              <SelectItem value="quarterly">Quarterly</SelectItem>
            </SelectContent>
          </Select>
        </div>

        <div className="space-y-2">
          <Label>Sampling Plan</Label>
          <Textarea
            placeholder="Describe sampling methodology (e.g., Random sampling of 10% of batch, minimum 3 units per production run)"
            value={qc.sampling_plan || ''}
            onChange={(e) => updateQC('sampling_plan', e.target.value)}
            className="h-20"
          />
        </div>

        <div className="space-y-2">
          <Label>Acceptance Criteria</Label>
          <Textarea
            placeholder="Define pass/fail criteria (e.g., pH 6.5-7.5, moisture content <5%, no off-odors, color within Pantone range)"
            value={qc.acceptance_criteria || ''}
            onChange={(e) => updateQC('acceptance_criteria', e.target.value)}
            className="h-24"
          />
        </div>

        <div className="space-y-2">
          <Label>Corrective Actions</Label>
          <Textarea
            placeholder="Document procedures when products fail QC (e.g., quarantine batch, reprocess, destroy, notify supervisor)"
            value={qc.corrective_actions || ''}
            onChange={(e) => updateQC('corrective_actions', e.target.value)}
            className="h-24"
          />
        </div>
      </div>

      <div className="bg-blue-50 border border-blue-200 rounded-xl p-4">
        <h4 className="font-semibold text-blue-900 mb-2">Recommended Tests</h4>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-sm text-blue-700">
          <div>
            <p className="font-semibold mb-1">Physical Tests:</p>
            <ul className="space-y-1 list-disc list-inside">
              <li>Visual inspection</li>
              <li>Weight verification</li>
              <li>Texture analysis</li>
              <li>Color measurement</li>
            </ul>
          </div>
          <div>
            <p className="font-semibold mb-1">Chemical Tests:</p>
            <ul className="space-y-1 list-disc list-inside">
              <li>pH measurement</li>
              <li>Moisture content</li>
              <li>Brix/Sugar content</li>
              <li>Water activity</li>
            </ul>
          </div>
          <div>
            <p className="font-semibold mb-1">Microbiological:</p>
            <ul className="space-y-1 list-disc list-inside">
              <li>Total plate count</li>
              <li>Yeast and mold</li>
              <li>Pathogen testing</li>
              <li>Coliform screening</li>
            </ul>
          </div>
          <div>
            <p className="font-semibold mb-1">Sensory:</p>
            <ul className="space-y-1 list-disc list-inside">
              <li>Taste evaluation</li>
              <li>Aroma assessment</li>
              <li>Texture evaluation</li>
              <li>Appearance check</li>
            </ul>
          </div>
        </div>
      </div>
    </div>
  );
}