import React, { useMemo, useState } from 'react';
import BarcodeManager from '@/components/items/BarcodeManager';
import { normalizeWorkflowMode } from '@/src/features/settings/workflowMode.js';
import { ChevronDown, ChevronRight } from 'lucide-react';
import SummaryStep from './SummaryStep';

export function ProductWizardGroupStep({ sections = [], workflowMode, ...props }) {
  const normalizedMode = normalizeWorkflowMode(workflowMode);
  const visibleSections = useMemo(
    () => sections.filter((section) => (
      !(section?.excludeModes || []).includes(normalizedMode)
    )),
    [normalizedMode, sections]
  );
  const [expandedSections, setExpandedSections] = useState(() => (
    new Set(visibleSections.slice(0, 1).map((section) => section.key))
  ));

  const toggleSection = (sectionKey) => {
    setExpandedSections((current) => {
      const next = new Set(current);
      if (next.has(sectionKey)) {
        next.delete(sectionKey);
      } else {
        next.add(sectionKey);
      }
      return next;
    });
  };

  if (visibleSections.length === 1) {
    const [{ component: SectionComponent }] = visibleSections;
    return (
      <div className="product-wizard-single-section" data-product-wizard-group="true">
        <SectionComponent {...props} workflowMode={workflowMode} />
      </div>
    );
  }

  return (
    <div className="product-wizard-section-stack" data-product-wizard-group="true">
      {visibleSections.map(({ key, component: SectionComponent }, index) => {
        const isExpanded = expandedSections.has(key);
        const sectionId = `product-wizard-section-${key}`;
        const headingId = `${sectionId}-heading`;
        const label = visibleSections[index].label || key;
        const description = visibleSections[index].description;

        return (
          <section key={key} data-product-wizard-section={key} className="product-wizard-section-card">
            <button
              type="button"
              className="product-wizard-section-toggle"
              aria-expanded={isExpanded}
              aria-controls={sectionId}
              onClick={() => toggleSection(key)}
            >
              <span className="product-wizard-section-index" aria-hidden="true">{index + 1}</span>
              <span className="product-wizard-section-heading">
                <span id={headingId} className="product-wizard-section-label">{label}</span>
                {description && <span className="product-wizard-section-description">{description}</span>}
              </span>
              {isExpanded ? (
                <ChevronDown className="product-wizard-section-chevron" aria-hidden="true" />
              ) : (
                <ChevronRight className="product-wizard-section-chevron" aria-hidden="true" />
              )}
            </button>
            <div
              id={sectionId}
              role="region"
              aria-labelledby={headingId}
              hidden={!isExpanded}
              className="product-wizard-section-content"
            >
              <SectionComponent {...props} workflowMode={workflowMode} />
            </div>
          </section>
        );
      })}
    </div>
  );
}

export function ProductBarcodesAndReviewStep({ productItem, data, items }) {
  const hasSavedProduct = Boolean(productItem?.item_id || productItem?.id);

  return (
    <div className="space-y-8" data-product-wizard-group="barcodes-review">
      <section className="space-y-4 rounded-xl border border-slate-200 bg-slate-50 p-4" aria-labelledby="product-barcodes-heading">
        <div>
          <h3 id="product-barcodes-heading" className="font-semibold text-teal-900">Barcodes & Labels</h3>
          <p className="text-sm text-teal-700">
            Manage barcode identities and review the product before saving.
          </p>
        </div>
        {hasSavedProduct ? (
          <BarcodeManager item={productItem} />
        ) : (
          <p className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800">
            Save the product first, then reopen it to attach or print barcode labels.
          </p>
        )}
      </section>

      <SummaryStep data={data} items={items} />
    </div>
  );
}
