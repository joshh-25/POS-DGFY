import React from 'react';
import { Coffee, Egg, Fish, ShieldAlert, Sprout } from 'lucide-react';

const FNB_BODY_FONT = '"Source Sans 3", "Segoe UI", sans-serif';

const asTitle = (value = '') => String(value || '')
  .split(/[_\s]+/)
  .filter(Boolean)
  .map((part) => part.charAt(0).toUpperCase() + part.slice(1).toLowerCase())
  .join(' ');

const getAllergenIcon = (name) => {
  const normalized = String(name || '').toLowerCase();
  if (normalized.includes('caffeine') || normalized.includes('coffee') || normalized.includes('dairy') || normalized.includes('milk') || normalized.includes('lactose')) return Coffee;
  if (normalized.includes('soy') || normalized.includes('wheat') || normalized.includes('gluten')) return Sprout;
  if (normalized.includes('egg')) return Egg;
  if (normalized.includes('fish') || normalized.includes('seafood') || normalized.includes('shrimp') || normalized.includes('crustacean') || normalized.includes('shellfish')) return Fish;
  return ShieldAlert;
};

/** Renders normalized F&B nutrition and allergen information with local tab state. */
export function FnbProductNutritionAllergens({ allergens, isMobileViewport, nutritionCards }) {
  const nutritionEntries = Array.isArray(nutritionCards)
    ? nutritionCards.filter((entry) => String(entry?.value || '').trim())
    : [];
  const allergenEntries = Array.isArray(allergens)
    ? allergens.map((entry) => (typeof entry === 'string' ? entry : String(entry?.allergen_name || '').trim())).filter(Boolean)
    : [];
  const [activeTab, setActiveTab] = React.useState(nutritionEntries.length > 0 ? 'nutrition' : 'allergens');

  if (nutritionEntries.length === 0 && allergenEntries.length === 0) return null;

  return (
    <div style={{ display: 'grid', gap: 16, paddingBottom: 8, paddingTop: 8 }}>
      <div style={{ display: 'flex', gap: 24 }}>
        {nutritionEntries.length > 0 ? (
          <TabButton active={activeTab === 'nutrition'} onClick={() => setActiveTab('nutrition')}>Nutrition</TabButton>
        ) : null}
        {allergenEntries.length > 0 ? (
          <TabButton active={activeTab === 'allergens'} onClick={() => setActiveTab('allergens')}>Allergens</TabButton>
        ) : null}
      </div>

      <div style={{ padding: '8px 0' }}>
        {activeTab === 'nutrition' && nutritionEntries.length > 0 ? (
          <div style={{ display: 'grid', gridTemplateColumns: isMobileViewport ? 'repeat(2, minmax(0, 1fr))' : 'repeat(4, minmax(0, 1fr))', rowGap: 20, columnGap: 16 }}>
            {nutritionEntries.map((entry) => (
              <div key={`tab-nutrition-${entry.label}`} style={{ display: 'grid', gap: 4 }}>
                <div style={{ fontSize: 12, fontWeight: 700, color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.05em' }}>{asTitle(entry.label)}</div>
                <div style={{ fontSize: 16, fontWeight: 800, color: '#1e293b' }}>{entry.value}</div>
              </div>
            ))}
          </div>
        ) : null}

        {activeTab === 'allergens' && allergenEntries.length > 0 ? (
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 16 }}>
            {allergenEntries.map((label, index) => {
              const AllergenIcon = getAllergenIcon(label);
              return (
                <div key={`tab-allergen-${index}-${label}`} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6, width: 64 }}>
                  <div style={{ width: 48, height: 48, borderRadius: '50%', background: '#fffbeb', border: '1px solid #fde68a', display: 'grid', placeItems: 'center', color: '#d97706', boxShadow: '0 4px 12px rgba(217, 119, 6, 0.05)' }}>
                    <AllergenIcon size={20} />
                  </div>
                  <span style={{ fontSize: 12, fontWeight: 700, color: '#334155', textAlign: 'center', textTransform: 'capitalize' }}>{label}</span>
                </div>
              );
            })}
          </div>
        ) : null}
      </div>
    </div>
  );
}

function TabButton({ active, children, onClick }) {
  return (
    <button
      type="button"
      onClick={onClick}
      style={{ fontFamily: FNB_BODY_FONT, fontSize: 16, fontWeight: 800, color: active ? '#15803d' : '#64748b', background: 'transparent', border: 'none', padding: '10px 0', cursor: 'pointer', borderBottom: active ? '3px solid #22C55E' : '3px solid transparent', transition: 'all 140ms ease' }}
    >
      {children}
    </button>
  );
}
