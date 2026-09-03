import { CalendarDays, Check, MapPin, Package, ShoppingBag, Truck } from 'lucide-react';
import { getServicesFlowPresentation, getServicesLocalFlowOptions, isServicesLocalFlowMethod } from '../model/servicesLocalFlow.js';
import { ServiceBookingSectionHeader } from './ServiceBookingSectionHeader.jsx';
import { SERVICES_PALETTE } from '../../servicesPalette.js';

/**
 * Services' own handoff chooser. Laundry keeps these legacy-compatible
 * pickup/collection options; the calendar is handled separately below it.
 */
const ICONS = { package: Package, 'shopping-bag': ShoppingBag, truck: Truck };

const normalizeMethodKey = (value) => {
  const normalizedValue = String(value || '').trim().toLowerCase();
  if (!normalizedValue) return '';

  const presentation = getServicesFlowPresentation(normalizedValue);
  return isServicesLocalFlowMethod(normalizedValue) || presentation.profileKey === normalizedValue
    ? presentation.method
    : normalizedValue;
};

function HandoffOptionCard({
  active,
  icon,
  label,
  onClick,
  servicesPrimary = SERVICES_PALETTE.primary,
  servicesPrimarySoft = SERVICES_PALETTE.primarySoft,
  servicesPrimaryBorder = SERVICES_PALETTE.primaryBorder,
  servicesPrimaryShadow = SERVICES_PALETTE.primaryShadow,
  minHeight
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      style={{
        minHeight,
        width: '100%',
        borderRadius: 14,
        border: `1.5px solid ${active ? servicesPrimary : servicesPrimaryBorder}`,
        background: active ? servicesPrimarySoft : SERVICES_PALETTE.surface,
        padding: '12px 14px',
        display: 'flex',
        alignItems: 'center',
        gap: 12,
        cursor: 'pointer',
        textAlign: 'left',
        boxShadow: active ? `0 8px 20px ${servicesPrimaryShadow}` : 'none',
        boxSizing: 'border-box',
        transition: 'all 200ms ease',
      }}
    >
      <div style={{ width: 40, height: 40, borderRadius: 10, background: active ? SERVICES_PALETTE.primaryLight : SERVICES_PALETTE.page, display: 'grid', placeItems: 'center', color: active ? servicesPrimary : SERVICES_PALETTE.textPrimary, flexShrink: 0 }}>
        {icon}
      </div>
      <div style={{ flex: '1 1 0%', minWidth: 0, fontSize: 14, fontWeight: 700, lineHeight: 1.35, color: active ? SERVICES_PALETTE.textPrimary : SERVICES_PALETTE.textSecondary }}>
        {label}
      </div>
      <div style={{ width: 22, height: 22, borderRadius: '50%', border: `1px solid ${active ? servicesPrimary : servicesPrimaryBorder}`, background: active ? servicesPrimary : SERVICES_PALETTE.surface, color: '#fff', display: 'grid', placeItems: 'center', flexShrink: 0 }}>
        {active ? <Check data-testid="services-selected-check" size={12} strokeWidth={3.2} /> : null}
      </div>
    </button>
  );
}

function ProfileFlowCard({ icon, title, description, servicesPrimary, servicesPrimarySoft, servicesPrimaryBorder, servicesDisplayFont }) {
  return (
    <div role="status" style={{ minHeight: 76, width: '100%', borderRadius: 14, border: `1px solid ${servicesPrimaryBorder}`, background: servicesPrimarySoft, padding: '12px 14px', display: 'flex', alignItems: 'center', gap: 12, boxSizing: 'border-box' }}>
      <div style={{ width: 40, height: 40, borderRadius: 10, background: SERVICES_PALETTE.primaryLight, display: 'grid', placeItems: 'center', color: servicesPrimary, flexShrink: 0 }}>{icon}</div>
      <div style={{ display: 'grid', gap: 4, minWidth: 0 }}>
        <div style={{ fontSize: 14, fontWeight: 800, lineHeight: 1.25, color: SERVICES_PALETTE.textPrimary, fontFamily: servicesDisplayFont || 'inherit' }}>{title}</div>
        <div style={{ fontSize: 12, lineHeight: 1.35, color: SERVICES_PALETTE.textSecondary }}>{description}</div>
      </div>
    </div>
  );
}

export function ServiceBookingFulfillmentChoices({
  isMobileViewport,
  onOrderMethodChange,
  serviceOrderMethod,
  serviceFlowMethod = '',
  serviceFlowProfileMethod = '',
  servicesPrimary,
  servicesPrimaryShadow,
  servicesPrimarySoft = SERVICES_PALETTE.primarySoft,
  servicesPrimaryBorder = SERVICES_PALETTE.primaryBorder,
  servicesDisplayFont,
}) {
  const minHeight = isMobileViewport ? 64 : 68;
  const profileMethod = String(serviceFlowProfileMethod || '').trim().toLowerCase();
  // The summary and validation use the resolved flow method. During route/state
  // transitions the raw order method can briefly be empty, so use the resolved
  // method as the visual source of truth to keep the card highlight in sync.
  const selectedMethod = normalizeMethodKey(serviceOrderMethod || serviceFlowMethod || serviceFlowProfileMethod);

  if (profileMethod && profileMethod !== 'hybrid') {
    const copy = {
      appointment: ['Appointment at the business', 'Choose a branch and an appointment date and time.', <CalendarDays key="appointment-icon" size={20} />],
      on_site: ["Service at the customer's address", 'Choose a service visit date and time, then provide the address.', <MapPin key="on-site-icon" size={20} />],
      online: ['Online service', 'Choose an appointment date and time for the online session.', <CalendarDays key="online-icon" size={20} />]
    }[profileMethod];
    if (copy) {
      return (
        <div style={{ display: 'grid', gap: 16 }}>
          <ServiceBookingSectionHeader
            title="1. Service flow"
            showIcon={false}
            servicesPrimary={servicesPrimary}
            servicesPrimarySoft={servicesPrimarySoft}
            servicesPrimaryBorder={servicesPrimaryBorder}
            servicesDisplayFont={servicesDisplayFont}
          />
          <ProfileFlowCard
            icon={copy[2]}
            title={copy[0]}
            description={copy[1]}
            servicesPrimary={servicesPrimary}
            servicesPrimarySoft={servicesPrimarySoft}
            servicesPrimaryBorder={servicesPrimaryBorder}
            servicesDisplayFont={servicesDisplayFont}
          />
        </div>
      );
    }
  }

  if (profileMethod === 'hybrid') {
    const options = [
      { method: 'appointment', label: 'Visit the branch', description: 'Choose a branch for the appointment.', icon: <CalendarDays size={20} /> },
      { method: 'on_site', label: 'At my address', description: 'A service team member visits you.', icon: <MapPin size={20} /> }
    ];
    return (
      <div style={{ display: 'grid', gap: 16 }}>
        <ServiceBookingSectionHeader
          title="1. Service location"
          showIcon={false}
          servicesPrimary={servicesPrimary}
          servicesPrimarySoft={servicesPrimarySoft}
          servicesPrimaryBorder={servicesPrimaryBorder}
          servicesDisplayFont={servicesDisplayFont}
        />
        <div style={{ display: 'grid', gridTemplateColumns: isMobileViewport ? '1fr' : '1fr 1fr', gap: 16 }}>
          {options.map((option) => {
            const isActive = selectedMethod === normalizeMethodKey(option.method);
            return (
              <HandoffOptionCard
                key={option.method}
                active={isActive}
                icon={option.icon}
                label={<span style={{ display: 'grid', gap: 3 }}><span>{option.label}</span><small style={{ fontSize: 11, fontWeight: 600, color: isActive ? SERVICES_PALETTE.textSecondary : SERVICES_PALETTE.textMuted }}>{option.description}</small></span>}
                onClick={() => onOrderMethodChange(option.method)}
                servicesPrimary={servicesPrimary}
                servicesPrimarySoft={servicesPrimarySoft}
                servicesPrimaryBorder={servicesPrimaryBorder}
                servicesPrimaryShadow={servicesPrimaryShadow}
                minHeight={minHeight}
              />
            );
          })}
        </div>
      </div>
    );
  }

  const options = getServicesLocalFlowOptions({ includePlanned: false });

  return (
    <div style={{ display: 'grid', gap: 16 }}>
      <ServiceBookingSectionHeader
        icon={<ShoppingBag size={19} />}
        title="1. Service flow"
        showIcon={false}
        servicesPrimary={servicesPrimary}
        servicesPrimarySoft={servicesPrimarySoft}
        servicesPrimaryBorder={servicesPrimaryBorder}
        servicesDisplayFont={servicesDisplayFont}
      />
      <div style={{ display: 'grid', gridTemplateColumns: isMobileViewport ? '1fr' : '1fr 1fr', gap: 16 }}>
        {options.map(({ profileKey, method, label, icon }) => {
          const Icon = ICONS[icon] || Package;
          const isActive = selectedMethod === normalizeMethodKey(method);
          return (
            <HandoffOptionCard
              key={profileKey}
              active={isActive}
              icon={<Icon size={20} />}
              label={label}
              onClick={() => onOrderMethodChange(method)}
              servicesPrimary={servicesPrimary}
              servicesPrimarySoft={servicesPrimarySoft}
              servicesPrimaryBorder={servicesPrimaryBorder}
              servicesPrimaryShadow={servicesPrimaryShadow}
              minHeight={minHeight}
            />
          );
        })}
      </div>
    </div>
  );
}
