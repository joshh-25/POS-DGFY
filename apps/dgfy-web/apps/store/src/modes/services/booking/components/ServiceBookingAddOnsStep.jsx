import { useState } from 'react';
import { CalendarClock, Check, ChevronDown, ChevronUp } from 'lucide-react';
import { SERVICE_ADD_ON_OPTIONS } from '../model/serviceBookingSummary.js';

/**
 * New "Step 2: Add-ons" — card-based listing of the customer's selected service(s), replacing
 * the old row-based recap. No new data source: renders `serviceLines` (already-computed from
 * `reviewServiceLines`/`serviceCartLines` in useServiceBookingDerivations.js / the shell), same
 * data the old row-based Step 2 used, just displayed as cards per the reference design instead
 * of label/value rows. The per-card add-ons accordion toggles are real (lifted to
 * `serviceLineAddOns`/`setServiceLineAddOns` in StorefrontApp.jsx so the booking summary can
 * group cart lines by their exact add-on combination) — only the add-on catalog itself
 * (`SERVICE_ADD_ON_OPTIONS`) is a fixed placeholder, since no per-service add-on data model
 * exists in the backend yet.
 */
export function ServiceBookingAddOnsStep({
  STYLES,
  GhostButton,
  PrimaryButton,
  isMobileViewport,
  servicesPrimary,
  servicesPrimarySoft,
  servicesPrimaryBorder,
  serviceLines,
  onEditLine,
  serviceLineAddOns,
  setServiceLineAddOns,
  specialInstructions,
  setSpecialInstructions,
  setServiceBookingStep,
}) {
  const [expandedKeys, setExpandedKeys] = useState(() => new Set());
  const toggleExpanded = (key) => {
    setExpandedKeys((previous) => {
      const next = new Set(previous);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  };
  const toggleAddOn = (lineKey, addOnKey) => {
    setServiceLineAddOns((previous) => {
      const current = previous[lineKey] || {};
      return { ...previous, [lineKey]: { ...current, [addOnKey]: !current[addOnKey] } };
    });
  };

  return (
    <div style={{ display: 'grid', gap: 20 }}>
      <section style={{ border: '1px solid #e2e8f0', borderRadius: 16, background: '#fff', padding: isMobileViewport ? 14 : 18, display: 'grid', gap: 14 }}>
        <div style={{ fontSize: 18, fontWeight: 800, color: servicesPrimary }}>Step 2: Add-ons</div>
        <div style={{ marginTop: -4, fontSize: 12, color: STYLES.colors.muted }}>
          Choose and select additional services based on the selected packages.
        </div>

        <div style={{ display: 'grid', gap: 14 }}>
          {serviceLines.map((line) => {
            const isExpanded = expandedKeys.has(line.key);
            const lineAddOns = serviceLineAddOns[line.key] || {};
            const hasSelectedAddOns = SERVICE_ADD_ON_OPTIONS.some((addOn) => lineAddOns[addOn.key]);
            return (
              <div
                key={line.key}
                style={{
                  border: `1px solid ${isExpanded ? servicesPrimary : '#e2e8f0'}`,
                  borderRadius: 18,
                  background: '#fff',
                  overflow: 'hidden',
                }}
              >
                <div
                  style={{
                    display: 'grid',
                    gridTemplateColumns: 'auto minmax(0, 1fr) auto',
                    gap: 14,
                    alignItems: 'center',
                    padding: isMobileViewport ? 14 : 16,
                  }}
                >
                  <button
                    type="button"
                    onClick={() => onEditLine(line)}
                    style={{ display: 'contents', cursor: 'pointer', background: 'none', border: 'none', padding: 0, textAlign: 'left' }}
                  >
                    <div
                      style={{
                        width: isMobileViewport ? 48 : 56,
                        height: isMobileViewport ? 48 : 56,
                        borderRadius: 14,
                        background: servicesPrimarySoft,
                        border: `1px solid ${servicesPrimaryBorder}`,
                        display: 'grid',
                        placeItems: 'center',
                        color: servicesPrimary,
                        flexShrink: 0,
                      }}
                    >
                      <CalendarClock size={isMobileViewport ? 22 : 26} />
                    </div>

                    <div style={{ minWidth: 0 }}>
                      <div style={{ fontSize: isMobileViewport ? 16 : 18, fontWeight: 900, color: STYLES.colors.dark, lineHeight: 1.25 }}>
                        {line.title}
                      </div>
                    </div>
                  </button>

                  <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexShrink: 0 }}>
                    {hasSelectedAddOns ? (
                      <span
                        style={{
                          width: 'fit-content',
                          fontSize: 11,
                          fontWeight: 700,
                          color: '#fff',
                          background: '#ea580c',
                          border: '1px solid #ea580c',
                          borderRadius: 999,
                          padding: '4px 10px',
                          whiteSpace: 'nowrap',
                        }}
                      >
                        With Add-ons
                      </span>
                    ) : (
                      <span
                        style={{
                          width: 'fit-content',
                          fontSize: 11,
                          fontWeight: 700,
                          color: '#64748b',
                          background: '#f8fafc',
                          border: '1px solid #dbe5ee',
                          borderRadius: 999,
                          padding: '4px 10px',
                          whiteSpace: 'nowrap',
                        }}
                      >
                        Without Add-ons
                      </span>
                    )}
                    <button
                      type="button"
                      onClick={() => toggleExpanded(line.key)}
                      aria-label={isExpanded ? 'Collapse add-ons' : 'Expand add-ons'}
                      style={{ border: 'none', background: 'none', padding: 4, cursor: 'pointer', display: 'grid', placeItems: 'center', color: '#64748b' }}
                    >
                      {isExpanded ? <ChevronUp size={20} /> : <ChevronDown size={20} />}
                    </button>
                  </div>
                </div>

                {isExpanded && (
                  <div style={{ borderTop: '1px solid #e2e8f0', background: '#fcfdff', padding: isMobileViewport ? 14 : 16, display: 'grid', gap: 10 }}>
                    <div style={{ fontSize: 13, fontWeight: 800, color: STYLES.colors.dark }}>Optional add-ons</div>
                    {SERVICE_ADD_ON_OPTIONS.map((addOn) => {
                      const checked = Boolean(lineAddOns[addOn.key]);
                      return (
                        <button
                          key={addOn.key}
                          type="button"
                          onClick={() => toggleAddOn(line.key, addOn.key)}
                          style={{
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'space-between',
                            gap: 12,
                            border: `1px solid ${checked ? servicesPrimaryBorder : '#e2e8f0'}`,
                            background: checked ? servicesPrimarySoft : '#fff',
                            borderRadius: 12,
                            padding: '10px 14px',
                            cursor: 'pointer',
                            textAlign: 'left',
                            width: '100%',
                          }}
                        >
                          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                            <div style={{ width: 18, height: 18, borderRadius: 5, background: checked ? servicesPrimary : '#fff', border: `1px solid ${checked ? servicesPrimary : '#cbd5e1'}`, display: 'grid', placeItems: 'center', flexShrink: 0 }}>
                              {checked ? <Check size={13} color="#fff" strokeWidth={3} /> : null}
                            </div>
                            <span style={{ fontSize: 13, fontWeight: 600, color: '#1e293b' }}>{addOn.label}</span>
                          </div>
                          <span style={{ fontSize: 13, fontWeight: 800, color: '#1e293b' }}>{addOn.amount}</span>
                        </button>
                      );
                    })}
                    <div style={{ fontSize: 12, color: STYLES.colors.muted }}>
                      Selected add-ons are included in the sample total.
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>

        <label style={{ display: 'grid', gap: 6 }}>
          <span style={{ fontSize: 13, fontWeight: 800, color: STYLES.colors.dark }}>Special instructions (optional)</span>
          <textarea
            value={specialInstructions}
            onChange={(event) => setSpecialInstructions(event.target.value.slice(0, 250))}
            placeholder="e.g., Please call upon arrival"
            rows={3}
            maxLength={250}
            style={{ minHeight: 84, border: '1px solid #e2e8f0', borderRadius: 12, padding: '10px 12px', background: '#fff', resize: 'vertical', boxSizing: 'border-box', fontSize: 13, fontFamily: 'inherit', color: STYLES.colors.dark }}
          />
          <span style={{ justifySelf: 'end', fontSize: 11, color: STYLES.colors.muted }}>
            {specialInstructions.length}/250 characters
          </span>
        </label>

        <div style={{ display: 'grid', gridTemplateColumns: isMobileViewport ? '1fr' : '1fr 1fr', gap: 12 }}>
          <GhostButton onClick={() => setServiceBookingStep(1)} style={{ minHeight: isMobileViewport ? 38 : 44, fontSize: isMobileViewport ? 14 : 15 }}>Back</GhostButton>
          <PrimaryButton onClick={() => setServiceBookingStep(3)} style={{ minHeight: isMobileViewport ? 38 : 44, fontSize: isMobileViewport ? 14 : 15 }}>
            Continue
          </PrimaryButton>
        </div>
      </section>
    </div>
  );
}
