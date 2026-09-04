import { useState } from 'react';
import { CalendarClock, ChevronDown, ChevronUp } from 'lucide-react';
import { ServiceBookingStepActions } from './ServiceBookingStepActions.jsx';
import { SERVICES_PALETTE } from '../../servicesPalette.js';
import {
  normalizeServiceOptionGroups,
  resolveSelectedServiceOptions
} from '../../storefront/model/serviceOptionSelection.js';

export function ServiceBookingAddOnsStep({
  GhostButton,
  PrimaryButton,
  primaryButtonProps,
  isMobileViewport,
  money,
  servicesPrimary = SERVICES_PALETTE.primary,
  servicesPrimarySoft = SERVICES_PALETTE.primarySoft,
  servicesPrimaryBorder = SERVICES_PALETTE.primaryBorder,
  servicesDisplayFont,
  serviceLines,
  serviceOrderMethod,
  onEditLine,
  onUpdateLineOptions,
  specialInstructions,
  setSpecialInstructions,
  setServiceBookingStep,
  referenceStyle = false,
}) {
  const isCustomerLocationFlow = serviceOrderMethod === 'on_site';
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
    <div style={{ display: 'grid', gap: isMobileViewport ? 16 : 20 }}>
      <section style={{ border: `1px solid ${SERVICES_PALETTE.border}`, borderRadius: referenceStyle ? 18 : (isMobileViewport ? 18 : 16), background: SERVICES_PALETTE.surface, padding: referenceStyle ? (isMobileViewport ? 22 : 32) : (isMobileViewport ? 16 : 18), display: 'grid', gap: referenceStyle ? 24 : (isMobileViewport ? 18 : 14), boxSizing: 'border-box' }}>
        <div style={{ fontSize: referenceStyle ? 20 : (isMobileViewport ? 20 : 18), lineHeight: 1.2, fontWeight: referenceStyle ? 700 : 800, color: SERVICES_PALETTE.textPrimary, fontFamily: servicesDisplayFont || 'inherit' }}>
          {isMobileViewport && isCustomerLocationFlow ? 'Service Add-ons and Instructions' : 'Add-ons'}
        </div>
        <div style={{ marginTop: isMobileViewport ? 0 : (referenceStyle ? -12 : -4), fontSize: referenceStyle ? 14.4 : (isMobileViewport ? 13 : 12), lineHeight: referenceStyle ? 1.6 : 1.5, color: SERVICES_PALETTE.textMuted }}>
          {isMobileViewport && isCustomerLocationFlow
            ? 'Review the selected service package and add any visit instructions.'
            : 'Review the service options selected from the catalog. Only options configured in Admin are shown.'}
        </div>

        <div style={{ display: 'grid', gap: isMobileViewport ? 12 : 14 }}>
          {serviceLines.map((line) => {
            const selectedOptions = Array.isArray(line.selectedOptions) ? line.selectedOptions : [];
            const selectedAddOns = selectedOptions.filter((option) => option.group_type === 'addon');
            const serviceOptionGroups = normalizeServiceOptionGroups({
              service_option_groups: line.serviceOptionGroups || line.service_option_groups
            });
            const addOnGroups = serviceOptionGroups.filter((group) => group.group_type === 'addon');
            const availableAddOnGroups = addOnGroups.filter((group) => Array.isArray(group.options) && group.options.length > 0);
            const hasAvailableAddOns = availableAddOnGroups.length > 0 || selectedAddOns.length > 0;
            const isExpanded = hasAvailableAddOns && expandedKeys.has(line.key);
            const addOnSelection = Object.fromEntries(addOnGroups.map((group) => [
              String(group.group_id),
              selectedAddOns
                .filter((option) => Number(option.group_id) === Number(group.group_id))
                .map((option) => Number(option.option_id))
            ]));
            const updateAddOnSelection = (group, nextIds) => {
              if (typeof onUpdateLineOptions !== 'function') return;
              const nextSelectedAddOns = resolveSelectedServiceOptions(addOnGroups, {
                ...addOnSelection,
                [String(group.group_id)]: nextIds
              });
              onUpdateLineOptions(line.key, [
                ...selectedOptions.filter((option) => option.group_type !== 'addon'),
                ...nextSelectedAddOns
              ], serviceOptionGroups);
            };
            const formatAdjustment = (centavos) => {
              const value = Number(centavos || 0) / 100;
              if (!value) return '';
              return `${value > 0 ? '+' : '-'}${money(Math.abs(value))}`;
            };
            return (
              <div
                key={line.key}
                style={{
                  border: `1px solid ${isExpanded ? servicesPrimary : SERVICES_PALETTE.border}`,
                  borderRadius: 18,
                  background: SERVICES_PALETTE.surface,
                  overflow: 'hidden',
                  position: 'relative',
                }}
              >
                <div
                  style={{
                    display: 'grid',
                    gridTemplateColumns: `${referenceStyle ? 40 : (isMobileViewport ? 48 : 56)}px minmax(0, 1fr) auto`,
                    columnGap: isMobileViewport ? 12 : 14,
                    alignItems: 'center',
                    padding: isMobileViewport ? '14px 14px 13px' : 16,
                  }}
                >
                  <button
                    type="button"
                    onClick={() => onEditLine(line)}
                    aria-label={`Edit ${line.title}`}
                    style={isMobileViewport
                      ? { gridColumn: hasAvailableAddOns ? '1 / 3' : '1 / -1', display: 'grid', gridTemplateColumns: 'subgrid', alignItems: 'start', width: '100%', minWidth: 0, cursor: 'pointer', background: 'none', border: 'none', padding: 0, textAlign: 'left', font: 'inherit' }
                      : { display: 'contents', cursor: 'pointer', background: 'none', border: 'none', padding: 0, textAlign: 'left', font: 'inherit' }}
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

                    <div style={isMobileViewport
                      ? { minWidth: 0, display: 'grid', alignContent: 'start', justifyItems: 'start', gap: 6 }
                      : { minWidth: 0 }}>
                      <div style={{ fontSize: referenceStyle ? 16 : (isMobileViewport ? 16 : 18), fontWeight: 900, color: SERVICES_PALETTE.textPrimary, lineHeight: 1.25 }}>
                        {line.title}
                      </div>
                      {isMobileViewport ? (
                        <span
                          style={{
                            width: 'fit-content',
                            fontSize: 11,
                            fontWeight: 800,
                            color: hasAvailableAddOns ? '#fff' : SERVICES_PALETTE.textMuted,
                            background: hasAvailableAddOns ? servicesPrimary : SERVICES_PALETTE.page,
                            border: `1px solid ${hasAvailableAddOns ? servicesPrimary : SERVICES_PALETTE.border}`,
                            borderRadius: 999,
                            padding: '4px 10px',
                            whiteSpace: 'nowrap',
                          }}
                        >
                          {hasAvailableAddOns ? 'With Add-ons' : 'No add-ons available'}
                        </span>
                      ) : null}
                    </div>
                  </button>

                  {!isMobileViewport ? (
                    <div style={{ gridColumn: '3', display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: 10, flexShrink: 0 }}>
                      <span
                        style={{
                          width: 'fit-content',
                          fontSize: 11,
                          fontWeight: 800,
                          color: hasAvailableAddOns ? '#fff' : SERVICES_PALETTE.textMuted,
                          background: hasAvailableAddOns ? servicesPrimary : SERVICES_PALETTE.page,
                          border: `1px solid ${hasAvailableAddOns ? servicesPrimary : SERVICES_PALETTE.border}`,
                          borderRadius: 999,
                          padding: '4px 10px',
                          whiteSpace: 'nowrap',
                        }}
                      >
                        {hasAvailableAddOns ? 'With Add-ons' : 'No add-ons available'}
                      </span>
                      {hasAvailableAddOns ? (
                        <button
                          type="button"
                          onClick={() => toggleExpanded(line.key)}
                          aria-label={isExpanded ? 'Collapse service options' : 'Expand service options'}
                          style={{ width: 28, height: 28, border: 'none', background: 'none', padding: 4, cursor: 'pointer', display: 'grid', placeItems: 'center', color: SERVICES_PALETTE.textMuted, flexShrink: 0 }}
                        >
                          {isExpanded ? <ChevronUp size={20} /> : <ChevronDown size={20} />}
                        </button>
                      ) : null}
                    </div>
                  ) : hasAvailableAddOns ? (
                    <button
                      type="button"
                      onClick={() => toggleExpanded(line.key)}
                      aria-label={isExpanded ? 'Collapse service options' : 'Expand service options'}
                      style={{ gridColumn: '3', alignSelf: 'start', width: 28, height: 28, border: 'none', background: 'none', padding: 4, cursor: 'pointer', display: 'grid', placeItems: 'center', color: SERVICES_PALETTE.textMuted, flexShrink: 0 }}
                    >
                      {isExpanded ? <ChevronUp size={20} /> : <ChevronDown size={20} />}
                    </button>
                  ) : null}
                </div>

                {isExpanded ? (
                  <div style={{ borderTop: `1px solid ${SERVICES_PALETTE.border}`, background: SERVICES_PALETTE.primarySoft, padding: isMobileViewport ? 14 : 16, display: 'grid', gap: 10 }}>
                    {availableAddOnGroups.length > 0 ? (
                      <>
                        <div style={{ fontSize: 13, fontWeight: 800, color: SERVICES_PALETTE.textPrimary }}>Optional add-ons</div>
                        <div style={{ display: 'grid', gap: 10 }}>
                          {availableAddOnGroups.map((group) => {
                            const groupKey = String(group.group_id);
                            const selectedIds = Array.isArray(addOnSelection[groupKey]) ? addOnSelection[groupKey] : [];
                            const minimumSelections = group.is_required ? Math.max(1, group.min_selections) : group.min_selections;
                            return (
                              <div key={groupKey} style={{ display: 'grid', gap: 8 }}>
                                {availableAddOnGroups.length > 1 ? (
                                  <div style={{ fontSize: 12, fontWeight: 800, color: servicesPrimary }}>
                                    {group.name}{group.is_required ? ' *' : ''}
                                  </div>
                                ) : null}
                                {group.options.map((option) => {
                                  const checked = selectedIds.includes(option.option_id);
                                  const reachedMaximum = !checked && group.selection_type === 'multi' && selectedIds.length >= group.max_selections;
                                  const reachedMinimum = checked && selectedIds.length <= minimumSelections;
                                  const disabled = reachedMaximum || reachedMinimum;
                                  const optionPrice = formatAdjustment(option.price_adjustment_centavos);
                                  return (
                                    <label
                                      key={option.option_id}
                                      style={{
                                        display: 'grid',
                                        gridTemplateColumns: '20px minmax(0, 1fr) auto',
                                        alignItems: 'center',
                                        gap: 10,
                                        minHeight: 46,
                                        border: `1px solid ${checked ? servicesPrimary : servicesPrimaryBorder}`,
                                        borderRadius: 12,
                                        background: checked ? servicesPrimarySoft : SERVICES_PALETTE.surface,
                                        padding: '8px 12px',
                                        boxSizing: 'border-box',
                                        cursor: disabled ? 'not-allowed' : 'pointer',
                                        opacity: disabled && !checked ? 0.6 : 1,
                                      }}
                                    >
                                      <input
                                        type="checkbox"
                                        aria-label={option.name}
                                        checked={checked}
                                        disabled={disabled}
                                        onChange={() => {
                                          const nextIds = checked
                                            ? selectedIds.filter((optionId) => optionId !== option.option_id)
                                            : group.selection_type === 'multi'
                                              ? [...selectedIds, option.option_id]
                                              : [option.option_id];
                                          updateAddOnSelection(group, nextIds);
                                        }}
                                        style={{ width: 18, height: 18, margin: 0, accentColor: servicesPrimary }}
                                      />
                                      <span style={{ minWidth: 0, display: 'grid', gap: 2, color: SERVICES_PALETTE.textPrimary, fontSize: 13, fontWeight: 700 }}>
                                        <span>{option.name}</span>
                                        {option.description ? <span style={{ color: SERVICES_PALETTE.textMuted, fontSize: 11, fontWeight: 500 }}>{option.description}</span> : null}
                                      </span>
                                      {optionPrice ? <span style={{ color: servicesPrimary, fontSize: 13, fontWeight: 800, whiteSpace: 'nowrap' }}>{optionPrice}</span> : null}
                                    </label>
                                  );
                                })}
                              </div>
                            );
                          })}
                        </div>
                        {selectedAddOns.length === 0 ? (
                          <div style={{ color: SERVICES_PALETTE.textMuted, fontSize: 12 }}>No add-ons selected.</div>
                        ) : null}
                      </>
                    ) : (
                      <div style={{ color: SERVICES_PALETTE.textMuted, fontSize: 12 }}>
                        Selected add-ons are no longer available for this service.
                      </div>
                    )}
                  </div>
                ) : null}
              </div>
            );
          })}
        </div>

        <label style={{ display: 'grid', gap: isMobileViewport ? 8 : 6 }}>
          <span style={{ fontSize: isMobileViewport ? 12 : 13, lineHeight: 1.35, fontWeight: 800, color: SERVICES_PALETTE.textPrimary }}>Special instructions (optional)</span>
          <textarea
            value={specialInstructions}
            onChange={(event) => setSpecialInstructions(event.target.value.slice(0, 250))}
            placeholder="e.g., Please call upon arrival"
            rows={3}
            maxLength={250}
            style={{ minHeight: isMobileViewport ? 96 : 84, border: `1px solid ${SERVICES_PALETTE.border}`, borderRadius: 12, padding: '10px 12px', background: SERVICES_PALETTE.surface, resize: 'vertical', boxSizing: 'border-box', fontSize: 13, fontFamily: 'inherit', color: SERVICES_PALETTE.textPrimary }}
          />
          <span style={{ justifySelf: 'end', fontSize: 11, color: SERVICES_PALETTE.textMuted }}>
            {specialInstructions.length}/250 characters
          </span>
        </label>

        <ServiceBookingStepActions
          GhostButton={GhostButton}
          PrimaryButton={PrimaryButton}
          primaryButtonProps={primaryButtonProps}
          isMobileViewport={isMobileViewport}
          referenceStyle={referenceStyle}
          onBack={() => setServiceBookingStep(1)}
          onContinue={() => setServiceBookingStep(3)}
        />
      </section>
    </div>
  );
}
