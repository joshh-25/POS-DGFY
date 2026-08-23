import React from 'react';
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { Badge } from "@/components/ui/badge";
import { ShieldCheck, CheckCircle, XCircle } from 'lucide-react';
import { cn } from "../../../src/lib/utils.js";

export default function RegulatoryComplianceStep({ data, updateData }) {
  const compliance = data.regulatory_compliance || {};

  const updateCompliance = (field, value) => {
    updateData({
      regulatory_compliance: {
        ...compliance,
        [field]: value
      }
    });
  };

  const regulations = [
    {
      id: 'fda_approved',
      label: 'FDA Approved',
      description: 'Product meets FDA regulations for food safety and labeling',
      critical: true
    },
    {
      id: 'gmp_compliant',
      label: 'GMP Compliant',
      description: 'Good Manufacturing Practices certified',
      critical: true
    },
    {
      id: 'haccp_plan',
      label: 'HACCP Plan',
      description: 'Hazard Analysis Critical Control Points plan implemented',
      critical: true
    },
    {
      id: 'organic_certified',
      label: 'USDA Organic',
      description: 'Certified organic by USDA standards',
      critical: false
    },
    {
      id: 'kosher_certified',
      label: 'Kosher Certified',
      description: 'Meets kosher dietary requirements',
      critical: false
    },
    {
      id: 'halal_certified',
      label: 'Halal Certified',
      description: 'Meets halal dietary requirements',
      critical: false
    }
  ];

  const criticalCompliance = regulations
    .filter(r => r.critical)
    .every(r => compliance[r.id]);

  return (
    <div className="space-y-6">
      <div className="bg-teal-50 border border-teal-200 rounded-xl p-4">
        <h3 className="font-semibold text-teal-900 mb-1 flex items-center gap-2">
          <ShieldCheck className="w-5 h-5" />
          Regulatory Compliance Validations
        </h3>
        <p className="text-sm text-teal-700">Ensure compliance with food safety regulations and certifications.</p>
      </div>

      <div className="space-y-3">
        {regulations.map(regulation => {
          const isChecked = compliance[regulation.id] || false;
          return (
            <div
              key={regulation.id}
              onClick={() => updateCompliance(regulation.id, !isChecked)}
              className={cn(
                "flex items-start gap-3 p-4 rounded-lg border-2 cursor-pointer transition-all",
                isChecked
                  ? "border-emerald-500 bg-emerald-50"
                  : "border-slate-200 bg-white hover:border-slate-300"
              )}
            >
              <Checkbox checked={isChecked} className="mt-1" />
              <div className="flex-1">
                <div className="flex items-center gap-2 mb-1">
                  {isChecked ? (
                    <CheckCircle className="w-5 h-5 text-emerald-600" />
                  ) : (
                    <XCircle className="w-5 h-5 text-slate-400" />
                  )}
                  <span className="font-semibold text-slate-900">{regulation.label}</span>
                  {regulation.critical && (
                    <Badge variant="outline" className="bg-red-50 text-red-700 border-red-200 text-xs">
                      Required
                    </Badge>
                  )}
                </div>
                <p className="text-sm text-slate-600">{regulation.description}</p>
              </div>
            </div>
          );
        })}
      </div>

      {!criticalCompliance && (
        <div className="bg-red-50 border border-red-200 rounded-xl p-4">
          <h4 className="font-semibold text-red-900 mb-2 flex items-center gap-2">
            <XCircle className="w-5 h-5" />
            Critical Compliance Missing
          </h4>
          <p className="text-sm text-red-700">
            FDA approval, GMP compliance, and HACCP plan are required for food products. 
            Ensure all critical certifications are obtained before production.
          </p>
        </div>
      )}

      {criticalCompliance && (
        <div className="bg-emerald-50 border border-emerald-200 rounded-xl p-4">
          <h4 className="font-semibold text-emerald-900 mb-2 flex items-center gap-2">
            <CheckCircle className="w-5 h-5" />
            Critical Compliance Met
          </h4>
          <p className="text-sm text-emerald-700">
            All required regulatory certifications are in place. Product is compliant for production and sale.
          </p>
        </div>
      )}

      <div className="bg-blue-50 border border-blue-200 rounded-xl p-4">
        <h4 className="font-semibold text-blue-900 mb-2">Key Regulations</h4>
        <ul className="text-sm text-blue-700 space-y-1 list-disc list-inside">
          <li><strong>FSMA:</strong> Food Safety Modernization Act - preventive controls</li>
          <li><strong>FALCPA:</strong> Food Allergen Labeling and Consumer Protection Act</li>
          <li><strong>21 CFR Part 117:</strong> Current Good Manufacturing Practice (CGMP)</li>
          <li><strong>FDA Food Code:</strong> Guidance for retail and food service</li>
          <li><strong>USDA Organic:</strong> National Organic Program standards (if applicable)</li>
        </ul>
      </div>
    </div>
  );
}