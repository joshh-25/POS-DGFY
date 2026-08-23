import React from 'react';
import { Badge } from "@/components/ui/badge";
import { CheckCircle, XCircle, Shield } from 'lucide-react';

export default function RegulatoryComplianceSection({ item }) {
  const compliance = item.regulatory_compliance || {};

  const certifications = [
    { label: 'FDA Approved', value: compliance.fda_approved, key: 'fda_approved' },
    { label: 'Organic Certified', value: compliance.organic_certified, key: 'organic_certified' },
    { label: 'Kosher Certified', value: compliance.kosher_certified, key: 'kosher_certified' },
    { label: 'Halal Certified', value: compliance.halal_certified, key: 'halal_certified' },
    { label: 'GMP Compliant', value: compliance.gmp_compliant, key: 'gmp_compliant' },
    { label: 'HACCP Plan', value: compliance.haccp_plan, key: 'haccp_plan' },
  ];

  const hasAnyCertification = certifications.some(cert => cert.value !== null && cert.value !== undefined);

  return (
    <div className="space-y-4">
      {hasAnyCertification && (
        <div className="bg-slate-50 rounded-lg p-4 border border-slate-200">
          <div className="flex items-center gap-2 mb-4">
            <Shield className="w-5 h-5 text-teal-600" />
            <h4 className="font-semibold text-slate-900">Certifications & Compliance</h4>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            {certifications.map((cert) => {
              if (cert.value === null || cert.value === undefined) return null;

              return (
                <div
                  key={cert.key}
                  className={`flex items-center justify-between p-3 rounded-lg border ${
                    cert.value
                      ? 'bg-green-50 border-green-200'
                      : 'bg-slate-50 border-slate-200'
                  }`}
                >
                  <span className={`font-medium ${cert.value ? 'text-green-900' : 'text-slate-700'}`}>
                    {cert.label}
                  </span>
                  {cert.value ? (
                    <CheckCircle className="w-5 h-5 text-green-600" />
                  ) : (
                    <XCircle className="w-5 h-5 text-slate-400" />
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}

      {!hasAnyCertification && (
        <p className="text-slate-500 text-center py-4">No regulatory compliance information available</p>
      )}
    </div>
  );
}
