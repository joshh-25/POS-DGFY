import { useState } from 'react';
import { CalendarClock, ChevronDown, ChevronUp } from 'lucide-react';

export function ServiceBookingAddOnsStep({
  STYLES,
  GhostButton,
  PrimaryButton,
  primaryButtonProps,
  isMobileViewport,
  money,
  servicesPrimary,
  servicesPrimarySoft,
  servicesPrimaryBorder,
  servicesDisplayFont,
  serviceLines,
  onEditLine,
  specialInstructions,
  setSpecialInstructions,
  setServiceBookingStep,
  referenceStyle = false,
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

  return (
    <div style={{ display: 'grid', gap: 20 }}>
      <section style={{ border: '1px solid #e2e8f0', borderRadius: referenceStyle ? 18 : 16, background: '#fff', padding: referenceStyle ? (isMobileViewport ? 22 : 32) : (isMobileViewport ? 14 : 18), display: 'grid', gap: referenceStyle ? 24 : 14 }}>
        <div style={{ fontSize: referenceStyle ? 20 : 18, fontWeight: referenceStyle ? 700 : 800, color: '#101010', fontFamily: referenceStyle ? servicesDisplayFont : undefined }}>Add-ons</div>
        <div style={{ marginTop: referenceStyle ? -12 : -4, fontSize: referenceStyle ? 14.4 : 12, lineHeight: referenceStyle ? 1.6 : undefined, color: referenceStyle ? '#58717a' : STYLES.colors.muted }}>
          Review the service options selected from the catalog. Only options configured in Admin are shown.
        </div>

        <div style={{ display: 'grid', gap: 14 }}>
          {serviceLines.map((line) => {
            const isExpanded = expandedKeys.has(line.key);
            const selectedOptions = Array.isArray(line.selectedOptions) ? line.selectedOptions : [];
            const selectedAddOns = selectedOptions.filter((option) => option.group_type === 'addon');
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
                    gridTemplateColumns: isMobileViewport ? 'auto minmax(0, 1fr)' : 'auto minmax(0, 1fr) auto',
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
                        width: referenceStyle ? 40 : (isMobileViewport ? 48 : 56),
                        height: referenceStyle ? 40 : (isMobileViewport ? 48 : 56),
                        borderRadius: 14,
                        background: servicesPrimarySoft,
                        border: `1px solid ${servicesPrimaryBorder}`,
                        display: 'grid',
                        placeItems: 'center',
                        color: servicesPrimary,
                        flexShrink: 0,
                      }}
                    >
                      <CalendarClock size={referenceStyle ? 18 : (isMobileViewport ? 22 : 26)} />
                    </div>

                    <div style={{ minWidth: 0 }}>
                      <div style={{ fontSize: referenceStyle ? 16 : (isMobileViewport ? 16 : 18), fontWeight: 900, color: STYLES.colors.dark, lineHeight: 1.25 }}>
                        {line.title}
                      </div>
                    </div>
                  </button>

                  <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexShrink: 0, gridColumn: isMobileViewport ? '2' : undefined, justifySelf: isMobileViewport ? 'end' : undefined }}>
                    <span
                      style={{
                        width: 'fit-content',
                        fontSize: 11,
                        fontWeight: 700,
                        color: selectedAddOns.length > 0 ? '#fff' : '#64748b',
                        background: selectedAddOns.length > 0 ? servicesPrimary : '#f8fafc',
                        border: `1px solid ${selectedAddOns.length > 0 ? servicesPrimary : '#dbe5ee'}`,
                        borderRadius: 999,
                        padding: '4px 10px',
                        whiteSpace: 'nowrap',
                      }}
                    >
                      {selectedAddOns.length > 0 ? 'With Add-ons' : 'Without Add-ons'}
                    </span>
                    <button
                      type="button"
                      onClick={() => toggleExpanded(line.key)}
                      aria-label={isExpanded ? 'Collapse service options' : 'Expand service options'}
                      style={{ border: 'none', background: 'none', padding: 4, cursor: 'pointer', display: 'grid', placeItems: 'center', color: '#64748b' }}
                    >
                      {isExpanded ? <ChevronUp size={20} /> : <ChevronDown size={20} />}
                    </button>
                  </div>
                </div>

                {isExpanded ? (
                  <div style={{ borderTop: '1px solid #e2e8f0', background: '#fcfdff', padding: isMobileViewport ? 14 : 16, display: 'grid', gap: 10 }}>
                    <div style={{ fontSize: 13, fontWeight: 800, color: STYLES.colors.dark }}>Selected service options</div>
                    {selectedOptions.length > 0 ? selectedOptions.map((option) => (
                      <div key={option.option_id} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, border: `1px solid ${servicesPrimaryBorder}`, background: servicesPrimarySoft, borderRadius: 12, padding: '10px 14px' }}>
                        <div style={{ minWidth: 0 }}>
                          <div style={{ fontSize: 11, fontWeight: 800, color: servicesPrimary, textTransform: 'uppercase', letterSpacing: '0.06em' }}>
                            {option.group_name || (option.group_type === 'variation' ? 'Service option' : 'Add-on')}
                          </div>
                          <div style={{ fontSize: 13, fontWeight: 700, color: '#1e293b' }}>{option.name}</div>
                        </div>
                        {Number(option.price_adjustment_centavos || 0) !== 0 ? (
                          <span style={{ fontSize: 13, fontWeight: 800, color: '#1e293b', whiteSpace: 'nowrap' }}>
                            {Number(option.price_adjustment_centavos) > 0 ? '+' : '-'}{money(Math.abs(Number(option.price_adjustment_centavos)) / 100)}
                          </span>
                        ) : null}
                      </div>
                    )) : (
                      <div style={{ border: '1px dashed #cbd5e1', borderRadius: 12, padding: '12px 14px', color: STYLES.colors.muted, fontSize: 12 }}>
                        This service has no configured option selected.
                      </div>
                    )}
                  </div>
                ) : null}
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

        {!referenceStyle || !isMobileViewport ? <div style={{ display: 'grid', gridTemplateColumns: isMobileViewport ? '1fr' : '1fr 1fr', gap: 16 }}>
          <GhostButton onClick={() => setServiceBookingStep(1)} style={{ minHeight: referenceStyle ? 51 : (isMobileViewport ? 38 : 44), fontSize: referenceStyle ? 16 : (isMobileViewport ? 14 : 15), borderRadius: referenceStyle ? 12 : undefined }}>Back</GhostButton>
          <PrimaryButton {...primaryButtonProps} onClick={() => setServiceBookingStep(3)} style={{ minHeight: referenceStyle ? 51 : (isMobileViewport ? 38 : 44), fontSize: referenceStyle ? 16 : (isMobileViewport ? 14 : 15), borderRadius: referenceStyle ? 12 : undefined }}>
            Continue
          </PrimaryButton>
        </div> : null}
      </section>
    </div>
  );
}
