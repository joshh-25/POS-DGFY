import React from 'react';
import {
  ArrowLeft,
  ArrowUpRight,
  BadgeCheck,
  ChefHat,
  MapPin,
  Plus,
  ShieldAlert,
  ShoppingCart,
  Zap,
  Coffee,
  Sprout,
  Egg,
  Fish,
  Utensils,
  Droplet,
  Flame,
  Star,
  Lock,
  ChevronDown,
  Sliders,
  Info,
  Store
} from 'lucide-react';

const money = (value) => `PHP ${Number(value || 0).toFixed(2)}`;

const withAssetOrigin = (url) => {
  if (!url || typeof url !== 'string') return '';
  const trimmed = url.trim();
  if (trimmed.startsWith('/')) return trimmed;
  if (trimmed.startsWith('storefront-assets/')) return `/uploads/${trimmed}`;
  try {
    return new URL(trimmed).toString();
  } catch {
    return '';
  }
};

const asTitle = (value = '') => String(value || '')
  .split(/[_\s]+/)
  .filter(Boolean)
  .map((part) => part.charAt(0).toUpperCase() + part.slice(1).toLowerCase())
  .join(' ');

/* --- Modifier Group Slug Formatting Helper --- */
const formatGroupName = (name) => {
  const formatted = String(name || '').trim();
  const lower = formatted.toLowerCase();
  if (lower === 'breakfast_add_ons' || lower === 'breakfast_add-ons') {
    return 'Breakfast Add-ons';
  }
  if (lower === 'sauce_pairing' || lower === 'sauce_pairings') {
    return 'Sauce Pairing';
  }
  return formatted
    .split(/[_\s]+/)
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1).toLowerCase())
    .join(' ');
};

/* --- Badge / pill shared factory --- */
const detailBadgeStyle = (background, color, border) => ({
  display: 'inline-flex',
  alignItems: 'center',
  gap: 6,
  minHeight: 32,
  padding: '0 12px',
  borderRadius: 999,
  background,
  color,
  border: border ? `1px solid ${border}` : 'none',
  fontSize: 12,
  fontWeight: 700,
  letterSpacing: '0.02em',
  fontFamily: '"Inter", -apple-system, sans-serif'
});

/* --- Button base (shared) --- */
const actionButtonBase = {
  fontFamily: '"Inter", -apple-system, sans-serif',
  minHeight: 46,
  borderRadius: 18,
  fontSize: 16,
  fontWeight: 800,
  cursor: 'pointer',
  display: 'inline-flex',
  alignItems: 'center',
  justifyContent: 'center',
  gap: 8,
  padding: '0 24px',
  transition: 'all 200ms cubic-bezier(0.16, 1, 0.3, 1)',
  letterSpacing: '0.01em'
};

/* --- Allergen Icon Dynamic Selector --- */
const getAllergenIcon = (name) => {
  const normalized = String(name || '').toLowerCase();
  if (normalized.includes('caffeine') || normalized.includes('coffee')) return Coffee;
  if (normalized.includes('dairy') || normalized.includes('milk') || normalized.includes('lactose')) return Coffee;
  if (normalized.includes('soy')) return Sprout;
  if (normalized.includes('wheat') || normalized.includes('gluten')) return Sprout;
  if (normalized.includes('egg')) return Egg;
  if (normalized.includes('fish') || normalized.includes('seafood') || normalized.includes('shrimp') || normalized.includes('crustacean') || normalized.includes('shellfish')) return Fish;
  return ShieldAlert;
};

/* --- Modifier Option Icon Dynamic Selector --- */
const getModifierIcon = (name) => {
  const normalized = String(name || '').toLowerCase();
  if (normalized.includes('egg')) return Egg;
  if (normalized.includes('bacon') || normalized.includes('pork') || normalized.includes('meat') || normalized.includes('beef') || normalized.includes('chicken') || normalized.includes('danggit') || normalized.includes('fish')) return ChefHat;
  if (normalized.includes('spicy') || normalized.includes('hot') || normalized.includes('chili') || normalized.includes('pepper')) return Flame;
  if (normalized.includes('mayo') || normalized.includes('sauce') || normalized.includes('dip') || normalized.includes('syrup') || normalized.includes('honey') || normalized.includes('gravy')) return Droplet;
  if (normalized.includes('rice')) return Utensils;
  return null;
};

export function FnbProductDetailsPage({
  item,
  storeName,
  storeLogoUrl,
  branchLabel,
  onBack,
  quantity,
  setQuantity,
  selectedModifiers,
  modifierGroups,
  modifierCounts,
  onToggleModifier,
  onAddToCart,
  onBuyNow,
  available,
  unitPrice,
  totalPrice,
  nutritionCards,
  allergens,
  relatedItems,
  onSelectRelatedItem,
  onQuickAdd,
  isMobileViewport,
  ratingScore = null,
  reviewCount = null
}) {
  const [activeTab, setActiveTab] = React.useState('nutrition');
  const [isDescExpanded, setIsDescExpanded] = React.useState(false);
  const descRef = React.useRef(null);
  const [showReadMore, setShowReadMore] = React.useState(false);

  const descriptionText = String(item?.descriptionPreview || item?.description || '').trim();

  React.useEffect(() => {
    if (descRef.current && !isDescExpanded) {
      const isOverflowing = descRef.current.scrollHeight > descRef.current.clientHeight;
      setShowReadMore(isOverflowing);
    }
  }, [descriptionText, isDescExpanded]);
  const [expandedGroups, setExpandedGroups] = React.useState(() => {
    const initial = {};
    if (Array.isArray(modifierGroups) && modifierGroups.length > 0) {
      initial[modifierGroups[0].modifier_group_id] = true;
    }
    return initial;
  });

  /* --- Empty / not-found state --- */
  if (!item) {
    return (
      <section style={{
        fontFamily: '"Inter", -apple-system, sans-serif',
        width: '100vw',
        marginLeft: 'calc(50% - 50vw)',
        background: '#ffffff',
        minHeight: '100vh',
        padding: isMobileViewport ? '32px 16px 48px' : '56px 24px 72px',
        boxSizing: 'border-box'
      }}>
        <div style={{
          maxWidth: 920,
          margin: '0 auto',
          border: '1px solid rgba(226, 232, 240, 0.8)',
          borderRadius: 28,
          background: '#fff',
          padding: isMobileViewport ? 24 : 40,
          display: 'grid',
          gap: 16,
          boxShadow: '0 20px 48px rgba(15,23,42,0.04)'
        }}>
          <div style={{ width: 56, height: 56, borderRadius: 18, background: '#fff', color: '#f97316', display: 'grid', placeItems: 'center', border: '1px solid #fed7aa' }}>
            <ChefHat size={24} />
          </div>
          <h2 style={{ margin: 0, fontSize: isMobileViewport ? 28 : 36, lineHeight: 1.05, fontWeight: 900, color: '#0f172a' }}>Item not available</h2>
          <p style={{ margin: 0, maxWidth: 560, fontSize: 16, lineHeight: 1.65, color: '#475569' }}>The item link is valid but the product is no longer available in the current storefront catalog.</p>
          <div>
            <button
              type="button"
              onClick={onBack}
              style={{
                ...actionButtonBase,
                minHeight: 48,
                border: 'none',
                background: '#22C55E',
                color: '#fff',
                boxShadow: '0 14px 28px rgba(34,197,94,0.24)'
              }}
            >
              <ArrowLeft size={16} />
              Back to Menu
            </button>
          </div>
        </div>
      </section>
    );
  }

  /* --- Derived display values --- */
  const imageUrl = withAssetOrigin(item.image_url);
  const description = String(item.descriptionPreview || item.description || '').trim();
  const sectionLabel = String(item.sectionLabel || item.folder_name || item.category || 'Menu').trim();
  const availabilityLabel = String(item.inventory_display?.label || (available ? 'Available' : 'Availability not provided')).trim();

  const nutritionEntries = Array.isArray(nutritionCards)
    ? nutritionCards.filter((entry) => String(entry?.value || '').trim())
    : [];

  const allergenEntries = Array.isArray(allergens)
    ? allergens
      .map((entry) => (typeof entry === 'string' ? entry : String(entry?.allergen_name || '').trim()))
      .filter(Boolean)
    : [];

  const selectedModifiersTotal = Array.isArray(selectedModifiers)
    ? selectedModifiers.reduce((sum, entry) => sum + Number(entry?.price_delta || 0), 0)
    : 0;

  const hasInfoSection = nutritionEntries.length > 0 || allergenEntries.length > 0;
  const hasReviewSummary = Number.isFinite(Number(ratingScore)) && Number(ratingScore) > 0
    && Number.isFinite(Number(reviewCount)) && Number(reviewCount) > 0;
  const desktopSummaryTop = isMobileViewport ? 'auto' : 88;
  const hasModifiers = Array.isArray(modifierGroups) && modifierGroups.length > 0;

  const renderNutritionAndAllergens = () => {
    if (!hasInfoSection) return null;
    return (
      <div style={{ display: 'grid', gap: 16, paddingBottom: 8, paddingTop: 8 }}>
        <div style={{ display: 'flex', gap: 24 }}>
          {nutritionEntries.length > 0 && (
            <button
              type="button"
              onClick={() => setActiveTab('nutrition')}
              style={{
                fontFamily: '"Inter", -apple-system, sans-serif',
                fontSize: 16,
                fontWeight: 800,
                color: activeTab === 'nutrition' ? '#15803d' : '#64748b',
                background: 'transparent',
                border: 'none',
                padding: '10px 0',
                cursor: 'pointer',
                borderBottom: activeTab === 'nutrition' ? '3px solid #22C55E' : '3px solid transparent',
                transition: 'all 140ms ease'
              }}
            >
              Nutrition
            </button>
          )}
          {allergenEntries.length > 0 && (
            <button
              type="button"
              onClick={() => setActiveTab('allergens')}
              style={{
                fontFamily: '"Inter", -apple-system, sans-serif',
                fontSize: 16,
                fontWeight: 800,
                color: activeTab === 'allergens' ? '#15803d' : '#64748b',
                background: 'transparent',
                border: 'none',
                padding: '10px 0',
                cursor: 'pointer',
                borderBottom: activeTab === 'allergens' ? '3px solid #22C55E' : '3px solid transparent',
                transition: 'all 140ms ease'
              }}
            >
              Allergens
            </button>
          )}
        </div>

        {/* Tab content panel */}
        <div style={{ padding: '8px 0' }}>
          {activeTab === 'nutrition' && nutritionEntries.length > 0 && (
            <div style={{
              display: 'grid',
              gridTemplateColumns: isMobileViewport ? 'repeat(2, minmax(0, 1fr))' : 'repeat(4, minmax(0, 1fr))',
              rowGap: 20,
              columnGap: 16
            }}>
              {nutritionEntries.map((entry) => (
                <div key={`tab-nutrition-${entry.label}`} style={{ display: 'grid', gap: 4 }}>
                  <div style={{ fontSize: 12, fontWeight: 700, color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                    {asTitle(entry.label)}
                  </div>
                  <div style={{ fontSize: 16, fontWeight: 800, color: '#1e293b' }}>{entry.value}</div>
                </div>
              ))}
            </div>
          )}

          {activeTab === 'allergens' && allergenEntries.length > 0 && (
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 16 }}>
              {allergenEntries.map((label, index) => {
                const AllergenIcon = getAllergenIcon(label);
                return (
                  <div key={`tab-allergen-${index}-${label}`} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6, width: 64 }}>
                    <div style={{
                      width: 48,
                      height: 48,
                      borderRadius: '50%',
                      background: '#fffbeb',
                      border: '1px solid #fde68a',
                      display: 'grid',
                      placeItems: 'center',
                      color: '#d97706',
                      boxShadow: '0 4px 12px rgba(217, 119, 6, 0.05)'
                    }}>
                      <AllergenIcon size={20} />
                    </div>
                    <span style={{ fontSize: 12, fontWeight: 700, color: '#334155', textAlign: 'center', textTransform: 'capitalize' }}>
                      {label}
                    </span>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>
    );
  };

  /* --- Spacing tokens (8px grid) --- */
  const sp = (n) => n * 8;

  const toggleGroupExpand = (groupId) => {
    setExpandedGroups((prev) => ({ ...prev, [groupId]: !prev[groupId] }));
  };

  const standardImageHeight = isMobileViewport ? 300 : 450;

  return (
    <section style={{
      fontFamily: '"Inter", -apple-system, sans-serif',
      width: '100vw',
      marginLeft: 'calc(50% - 50vw)',
      background: '#ffffff',
      minHeight: '100vh',
      paddingBottom: isMobileViewport ? 140 : 64,
      boxSizing: 'border-box'
    }}>

      {/* -- Sticky Navbar (Solid Modern Flush Header) -- */}
      <div style={{
        position: 'sticky',
        top: 0,
        zIndex: 50,
        margin: 0,
        borderRadius: 0,
        background: '#ffffff',
        border: 'none',
        borderBottom: '1px solid rgba(226, 232, 240, 0.8)',
        boxShadow: '0 4px 20px rgba(15, 23, 42, 0.02)',
        transition: 'all 300ms cubic-bezier(0.16, 1, 0.3, 1)'
      }}>
        <div style={{
          maxWidth: 1320,
          margin: '0 auto',
          padding: isMobileViewport ? `${sp(2)}px ${sp(2)}px` : `${sp(2)}px ${sp(3)}px`,
          display: 'grid',
          gridTemplateColumns: isMobileViewport ? '1fr' : '1fr auto 1fr',
          gap: sp(2),
          alignItems: 'center'
        }}>
          {/* Back button + label */}
          <div style={{ display: 'flex', alignItems: 'center', gap: sp(2), minWidth: 0 }}>
            <button
              type="button"
              onClick={onBack}
              aria-label="Back to menu"
              style={{
                width: 40,
                height: 40,
                borderRadius: '50%',
                border: '1px solid rgba(226, 232, 240, 0.8)',
                background: '#fff',
                color: '#15803d',
                display: 'inline-grid',
                placeItems: 'center',
                cursor: 'pointer',
                flexShrink: 0,
                boxShadow: '0 2px 8px rgba(0,0,0,0.02)',
                transition: 'all 120ms ease'
              }}
            >
              <ArrowLeft size={16} />
            </button>
            <div style={{ display: 'grid', gap: 2, minWidth: 0 }}>
              <div style={{ fontSize: 14, fontWeight: 800, color: '#0f172a', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>Back to Menu</div>
              {!isMobileViewport ? (
                <div style={{ fontSize: 12, color: '#64748b' }}>Review before adding to cart</div>
              ) : null}
            </div>
          </div>

          {/* Store name centered (desktop only) */}
          {!isMobileViewport ? (
            <div style={{ display: 'inline-flex', alignItems: 'center', gap: 8, justifyContent: 'center', minWidth: 0 }}>
              <div style={{
                width: 36,
                height: 36,
                borderRadius: '50%',
                overflow: 'hidden',
                border: '1px solid rgba(226, 232, 240, 0.8)',
                display: 'grid',
                placeItems: 'center',
                boxShadow: '0 2px 6px rgba(0,0,0,0.01)',
                background: '#f8fafc',
                flexShrink: 0
              }}>
                {storeLogoUrl ? (
                  <img src={storeLogoUrl} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                ) : (
                  <Store size={16} color="#475569" />
                )}
              </div>
              <div style={{ fontSize: 20, fontWeight: 800, color: '#0f172a', letterSpacing: '-0.02em', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{storeName}</div>
            </div>
          ) : null}

          {/* Branch + support + Cart */}
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: isMobileViewport ? 'flex-start' : 'flex-end', gap: 16 }}>
            <div style={{ display: 'inline-flex', alignItems: 'center', gap: 4, fontSize: 12, color: '#475569', fontWeight: 600 }}>
              <MapPin size={16} color="#64748b" />
              <span>{branchLabel || 'Main Branch'}</span>
            </div>

          </div>
        </div>
      </div>

      {/* -- Page content -- */}
      <div style={{
        maxWidth: 1320,
        margin: '0 auto',
        padding: isMobileViewport ? `${sp(2)}px ${sp(2)}px ${sp(5)}px` : `${sp(3)}px ${sp(3)}px ${sp(4)}px`,
        boxSizing: 'border-box'
      }}>

        {/* Breadcrumb */}
        <nav
          aria-label="breadcrumb"
          style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 8, marginBottom: sp(2), fontSize: 12, color: '#64748b', fontWeight: 600 }}
        >
          <span style={{ color: '#64748b' }}>Menu</span>
          <span aria-hidden="true" style={{ color: '#cbd5e1', fontSize: 14 }}>{'>'}</span>
          <span style={{ color: '#64748b' }}>{sectionLabel}</span>
          <span aria-hidden="true" style={{ color: '#cbd5e1', fontSize: 14 }}>{'>'}</span>
          <span style={{ color: '#15803d' }} aria-current="page">{item.name}</span>
        </nav>

        {/* -- Main 2-col grid -- */}
        <div style={{
          display: 'grid',
          gridTemplateColumns: isMobileViewport ? '1fr' : 'minmax(0, 1.05fr) minmax(340px, 0.95fr)',
          gap: isMobileViewport ? sp(2) : sp(4),
          alignItems: 'start'
        }}>

          {/* -- LEFT COLUMN: Image + Info -- */}
          <div style={{ display: 'grid', gap: sp(2) }}>

            {/* Product image (Strictly standard dimension container to prevent visual shifts) */}
            <div style={{
              position: 'relative',
              borderRadius: 24,
              overflow: 'hidden',
              width: '100%',
              height: standardImageHeight,
              background: '#f8fafc',
              border: '1px solid rgba(226, 232, 240, 0.8)',
              boxShadow: '0 20px 48px rgba(15, 23, 42, 0.06)'
            }}>
              {/* Fullscreen Button Overlay */}
              <button
                type="button"
                aria-label="View larger image"
                style={{
                  position: 'absolute',
                  top: 16,
                  right: 16,
                  width: 38,
                  height: 38,
                  borderRadius: '50%',
                  background: 'rgba(255, 255, 255, 0.85)',
                  backdropFilter: 'blur(8px)',
                  border: '1px solid rgba(255, 255, 255, 0.6)',
                  display: 'grid',
                  placeItems: 'center',
                  color: '#475569',
                  cursor: 'pointer',
                  boxShadow: '0 4px 12px rgba(15, 23, 42, 0.08)',
                  transition: 'transform 120ms ease',
                  zIndex: 10
                }}
              >
                <ArrowUpRight size={20} />
              </button>

              {/* Slide Navigation Arrows */}
              {imageUrl && (
                <>
                  <button
                    type="button"
                    aria-label="Previous slide"
                    style={{
                      position: 'absolute',
                      left: 16,
                      top: '50%',
                      transform: 'translateY(-50%)',
                      width: 36,
                      height: 36,
                      borderRadius: '50%',
                      background: 'rgba(255, 255, 255, 0.85)',
                      backdropFilter: 'blur(8px)',
                      border: '1px solid rgba(255, 255, 255, 0.6)',
                      display: 'grid',
                      placeItems: 'center',
                      color: '#475569',
                      boxShadow: '0 4px 12px rgba(15, 23, 42, 0.08)',
                      cursor: 'pointer',
                      zIndex: 10
                    }}
                  >
                    {'<'}
                  </button>
                  <button
                    type="button"
                    aria-label="Next slide"
                    style={{
                      position: 'absolute',
                      right: 16,
                      top: '50%',
                      transform: 'translateY(-50%)',
                      width: 36,
                      height: 36,
                      borderRadius: '50%',
                      background: 'rgba(255, 255, 255, 0.85)',
                      backdropFilter: 'blur(8px)',
                      border: '1px solid rgba(255, 255, 255, 0.6)',
                      display: 'grid',
                      placeItems: 'center',
                      color: '#475569',
                      boxShadow: '0 4px 12px rgba(15, 23, 42, 0.08)',
                      cursor: 'pointer',
                      zIndex: 10
                    }}
                  >
                    {'>'}
                  </button>
                </>
              )}

              {/* Core Image Element (Strictly fitted via cover objectFit to enforce standard dimensions) */}
              {imageUrl ? (
                <img
                  src={imageUrl}
                  alt={item.name}
                  style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }}
                />
              ) : (
                <div style={{ width: '100%', height: '100%', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 12, color: '#64748b' }}>
                  <ChefHat size={44} strokeWidth={1.5} />
                  <span style={{ fontSize: 14, fontWeight: 600 }}>No image available</span>
                </div>
              )}

              {/* Scrim Overlay */}
              <div style={{ position: 'absolute', inset: 0, background: 'linear-gradient(160deg, rgba(15,23,42,0.1) 0%, transparent 40%)', pointerEvents: 'none' }} />

              {/* Media Badges */}
              <div style={{ position: 'absolute', top: 16, left: 16, display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                <span style={detailBadgeStyle('rgba(21,128,61,0.92)', '#fff')}>{sectionLabel}</span>
                <span style={detailBadgeStyle(
                  available ? 'rgba(240,253,244,0.95)' : 'rgba(254,242,242,0.95)',
                  available ? '#15803d' : '#b91c1c',
                  available ? '#86efac' : '#fecaca'
                )}>
                  {available ? <BadgeCheck size={12} /> : <ShieldAlert size={12} />}
                  {availabilityLabel}
                </span>
              </div>

              {/* Custom dynamic thumbnails gallery representation */}
              {imageUrl && (
                <div style={{
                  position: 'absolute',
                  bottom: 16,
                  left: 16,
                  display: 'flex',
                  gap: 8,
                  zIndex: 10
                }}>
                  {/* Primary Thumbnail active */}
                  <div style={{
                    width: 48,
                    height: 48,
                    borderRadius: 10,
                    border: '2px solid #22C55E',
                    overflow: 'hidden',
                    boxShadow: '0 4px 12px rgba(0,0,0,0.15)',
                    background: '#fff',
                    cursor: 'pointer'
                  }}>
                    <img src={imageUrl} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                  </div>
                </div>
              )}
            </div>

            {/* Tabbed Switcher for Nutrition & Allergens (Dynamic and completely containerless) */}
            {hasModifiers && renderNutritionAndAllergens()}


            {Array.isArray(relatedItems) && relatedItems.length > 0 ? (
              <div style={{
                display: 'grid',
                gap: 16,
                borderTop: '1px solid rgba(226, 232, 240, 0.6)',
                paddingTop: 24,
                marginTop: 24
              }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 16 }}>
                  <h3 style={{ margin: 0, fontSize: 16, fontWeight: 800, color: '#0f172a' }}>Recommended Pairings</h3>
                </div>
                <div style={{
                  display: 'grid',
                  gridTemplateColumns: isMobileViewport ? '1fr' : 'repeat(3, 1fr)',
                  gap: 16
                }}>
                  {relatedItems.slice(0, 3).map((recommended) => {
                    const recImgUrl = withAssetOrigin(recommended.image_url);
                    return (
                      <div
                        key={`recommended-${recommended.item_id}`}
                        onClick={() => onSelectRelatedItem?.(recommended)}
                        style={{
                          display: 'flex',
                          flexDirection: 'column',
                          gap: 8,
                          cursor: 'pointer',
                          background: '#ffffff',
                          border: '1px solid rgba(226, 232, 240, 0.8)',
                          borderRadius: 18,
                          padding: 12
                        }}
                      >
                        <div style={{ width: '100%', height: 110, borderRadius: 12, overflow: 'hidden', background: '#f8fafc', flexShrink: 0 }}>
                          {recImgUrl ? (
                            <img src={recImgUrl} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                          ) : (
                            <div style={{ width: '100%', height: '100%', display: 'grid', placeItems: 'center', color: '#64748b' }}>
                              <ChefHat size={20} />
                            </div>
                          )}
                        </div>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: 4, minWidth: 0, flexGrow: 1 }}>
                          <div style={{ fontSize: 14, fontWeight: 700, color: '#1e293b', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                            {recommended.name}
                          </div>
                          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 4, marginTop: 'auto' }}>
                            <div style={{ fontSize: 12, fontWeight: 800, color: '#f97316' }}>{money(recommended.default_sale_price)}</div>
                            <button
                              type="button"
                              aria-label={`Add ${recommended.name} to cart`}
                              onClick={(event) => {
                                event.stopPropagation();
                                onQuickAdd?.(recommended);
                              }}
                              style={{
                                width: 28,
                                height: 28,
                                borderRadius: '50%',
                                background: '#f0fdf4',
                                border: '1px solid #86efac',
                                color: '#15803d',
                                display: 'grid',
                                placeItems: 'center',
                                cursor: 'pointer',
                                flexShrink: 0
                              }}
                            >
                              <Plus size={16} />
                            </button>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            ) : null}
          </div>

          {/* -- RIGHT COLUMN: Summary + Sticky Actions (Consolidated clean cardless panel) -- */}
          <div style={{ display: 'grid', gap: sp(2), position: isMobileViewport ? 'static' : 'sticky', top: desktopSummaryTop, alignSelf: 'start' }}>

            <div style={{
              padding: isMobileViewport ? '8px 4px' : '16px 8px',
              display: 'grid',
              gap: sp(2)
            }}>
              {/* Title Block & star reviews */}
              <div style={{ display: 'grid', gap: sp(1) }}>
                <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 16 }}>
                  <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 12 }}>
                    <h1 style={{ margin: 0, fontSize: isMobileViewport ? 24 : 32, lineHeight: 1.15, fontWeight: 900, color: '#0f172a', letterSpacing: '-0.025em', display: 'inline-flex', alignItems: 'center', flexWrap: 'wrap', gap: 12 }}>
                      {item.name}
                      {hasReviewSummary ? (
                        <span style={{
                          display: 'inline-flex',
                          alignItems: 'center',
                          gap: 4,
                          fontSize: 14,
                          fontWeight: 800,
                          color: '#b45309',
                          background: '#fef3c7',
                          padding: '4px 8px',
                          borderRadius: 12,
                          lineHeight: 1
                        }}>
                          <Star size={16} fill="#d97706" color="#d97706" />
                          <span>{Number(ratingScore).toFixed(1)}</span>
                          <span style={{ color: '#b45309', fontWeight: 600, fontSize: 12 }}>({Number(reviewCount)})</span>
                        </span>
                      ) : null}
                    </h1>
                  </div>

                </div>

                {/* Collapsible description panel */}
                {description ? (
                  <div style={{ display: 'grid', gap: 4, marginTop: 4 }}>
                    <p
                      ref={descRef}
                      style={{
                        margin: 0,
                        fontSize: 14,
                        lineHeight: 1.6,
                        color: '#64748b',
                        display: '-webkit-box',
                        WebkitLineClamp: isDescExpanded ? 'none' : 3,
                        WebkitBoxOrient: 'vertical',
                        overflow: 'hidden',
                        textOverflow: 'ellipsis'
                      }}
                    >
                      {description}
                    </p>
                    {showReadMore ? (
                      <button
                        type="button"
                        onClick={() => setIsDescExpanded(!isDescExpanded)}
                        style={{
                          background: 'transparent',
                          border: 'none',
                          padding: '4px 0',
                          fontSize: 12,
                          fontWeight: 700,
                          color: '#22C55E',
                          cursor: 'pointer',
                          display: 'inline-flex',
                          alignItems: 'center',
                          gap: 4,
                          width: 'fit-content'
                        }}
                      >
                        {isDescExpanded ? 'Read less' : 'Read more'}
                        <ChevronDown size={16} style={{ transform: isDescExpanded ? 'rotate(180deg)' : 'none', transition: 'transform 120ms' }} />
                      </button>
                    ) : null}
                  </div>
                ) : null}
              </div>

              {/* Price & Quantity stepper row */}
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 16, paddingTop: sp(2) }}>
                <div style={{ fontSize: isMobileViewport ? 24 : 32, fontWeight: 900, color: '#f97316', lineHeight: 1, letterSpacing: '-0.02em' }}>
                  {money(unitPrice)}
                </div>

                {/* Stepper selector */}
                <div style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: 12,
                  padding: '6px 12px',
                  borderRadius: 999,
                  border: '1px solid rgba(226, 232, 240, 0.8)',
                  background: '#fff',
                  boxShadow: '0 2px 8px rgba(0,0,0,0.02)'
                }}>
                  <button
                    type="button"
                    aria-label="Decrease quantity"
                    onClick={() => setQuantity(Math.max(1, Number(quantity || 1) - 1))}
                    style={{
                      border: 'none',
                      background: 'transparent',
                      color: '#475569',
                      fontSize: 20,
                      fontWeight: 600,
                      cursor: 'pointer',
                      padding: '0 8px',
                      display: 'grid',
                      placeItems: 'center'
                    }}
                  >
                    -
                  </button>
                  <span style={{ fontSize: 16, fontWeight: 800, color: '#0f172a', minWidth: 20, textAlign: 'center' }}>
                    {Math.max(1, Number(quantity || 1))}
                  </span>
                  <button
                    type="button"
                    aria-label="Increase quantity"
                    onClick={() => setQuantity(Math.max(1, Number(quantity || 1) + 1))}
                    style={{
                      border: 'none',
                      background: 'transparent',
                      color: '#475569',
                      fontSize: 20,
                      fontWeight: 600,
                      cursor: 'pointer',
                      padding: '0 8px',
                      display: 'grid',
                      placeItems: 'center'
                    }}
                  >
                    +
                  </button>
                </div>
              </div>

              {/* Repositioned Nutrition & Allergens (if no modifiers are present) */}
              {!hasModifiers && renderNutritionAndAllergens()}


              {/* Customization accordions customize engine */}
              {Array.isArray(modifierGroups) && modifierGroups.length > 0 ? (
                <div style={{ display: 'grid', gap: 16, borderTop: '1px solid rgba(226,232,240,0.6)', paddingTop: sp(2) }}>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
                    <div style={{ display: 'inline-flex', alignItems: 'center', gap: 8, fontSize: 14, fontWeight: 800, color: '#0f172a' }}>
                      <Sliders size={16} color="#475569" />
                      Customize Order
                    </div>
                    <div style={{ display: 'inline-flex', alignItems: 'center', gap: 4, fontSize: 12, color: '#64748b', fontWeight: 600 }}>
                      <span style={{ borderRadius: 999, padding: '2px 8px', background: '#ffedd5', color: '#c2410c', border: '1px solid #fed7aa', fontWeight: 800 }}>Optional</span>
                      <Info size={16} />
                    </div>
                  </div>

                  {/* Accordion List */}
                  <div style={{ display: 'grid', gap: 12 }}>
                    {modifierGroups.map((group) => {
                      const isExpanded = !!expandedGroups[group.modifier_group_id];
                      return (
                        <div
                          key={`modifier-group-${group.modifier_group_id}`}
                          style={{
                            border: '1px solid rgba(226, 232, 240, 0.8)',
                            borderRadius: 16,
                            background: '#f8fafc',
                            overflow: 'hidden'
                          }}
                        >
                          {/* Accordion Trigger Header */}
                          <button
                            type="button"
                            onClick={() => toggleGroupExpand(group.modifier_group_id)}
                            style={{
                              width: '100%',
                              background: '#ffffff',
                              border: 'none',
                              padding: '14px 16px',
                              display: 'flex',
                              alignItems: 'center',
                              justifyContent: 'space-between',
                              gap: 12,
                              cursor: 'pointer',
                              textAlign: 'left'
                            }}
                          >
                            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                              <span style={{ fontSize: 14, fontWeight: 800, color: '#334155' }}>
                                {formatGroupName(group.group_name)}
                              </span>
                              <span style={{
                                fontSize: 10,
                                fontWeight: 700,
                                color: Number(group.min_select || 0) > 0 ? '#166534' : '#c2410c',
                                background: Number(group.min_select || 0) > 0 ? '#dcfce7' : '#ffedd5',
                                border: `1px solid ${Number(group.min_select || 0) > 0 ? '#86efac' : '#fed7aa'}`,
                                borderRadius: 999,
                                padding: '2px 8px'
                              }}>
                                {Number(group.min_select || 0) > 0 ? 'Required' : 'Optional'}
                              </span>
                            </div>
                            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                              <span style={{ fontSize: 12, fontWeight: 700, color: '#475569' }}>
                                {Number(group.max_select || 0) === 1 ? 'Pick one' : `${Number(modifierCounts?.[group.modifier_group_id] || 0)} selected`}
                              </span>
                              <ChevronDown
                                size={16}
                                color="#64748b"
                                style={{
                                  transform: isExpanded ? 'rotate(180deg)' : 'none',
                                  transition: 'transform 160ms ease'
                                }}
                              />
                            </div>
                          </button>

                          {/* Accordion panel body options list */}
                          {isExpanded && (
                            <div style={{ padding: '8px 16px 16px', display: 'grid', gap: 4, background: '#ffffff', borderTop: '1px solid rgba(226, 232, 240, 0.6)' }}>
                              {group.options.map((option) => {
                                const selected = (selectedModifiers || []).some(
                                  (entry) =>
                                    Number(entry.modifier_group_id) === Number(group.modifier_group_id) &&
                                    Number(entry.modifier_option_id) === Number(option.modifier_option_id)
                                );
                                const OptionIcon = getModifierIcon(option.option_name);

                                return (
                                  <label
                                    key={`option-${group.modifier_group_id}-${option.modifier_option_id}`}
                                    style={{
                                      display: 'grid',
                                      gridTemplateColumns: OptionIcon ? 'auto auto 1fr auto' : 'auto 1fr auto',
                                      gap: 12,
                                      alignItems: 'center',
                                      minHeight: 40,
                                      padding: '4px 0',
                                      cursor: 'pointer',
                                      transition: 'all 120ms ease',
                                      opacity: selected ? 1 : 0.85
                                    }}
                                  >
                                    <input
                                      type={Number(group.max_select || 0) === 1 ? 'radio' : 'checkbox'}
                                      checked={selected}
                                      onChange={() => onToggleModifier(group, option)}
                                      style={{ width: 18, height: 18, accentColor: '#f97316', cursor: 'pointer' }}
                                    />
                                    {OptionIcon && (
                                      <span style={{
                                        width: 24,
                                        height: 24,
                                        borderRadius: '50%',
                                        background: selected ? '#fff' : '#f8fafc',
                                        border: '1px solid rgba(226, 232, 240, 0.8)',
                                        display: 'grid',
                                        placeItems: 'center',
                                        color: '#f97316'
                                      }}>
                                        <OptionIcon size={12} />
                                      </span>
                                    )}
                                    <span style={{ fontSize: 14, fontWeight: 600, color: selected ? '#0f172a' : '#475569' }}>
                                      {option.option_name}
                                    </span>
                                    <span style={{ fontSize: 12, fontWeight: 700, color: selected ? '#ea580c' : '#64748b', whiteSpace: 'nowrap' }}>
                                      +{money(option.price_delta || 0).replace('PHP ', '')}
                                    </span>
                                  </label>
                                );
                              })}
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                </div>
              ) : null}

              {/* Total + CTA buttons */}
              <div style={{ display: 'grid', gap: 16, borderTop: '1px solid rgba(226,232,240,0.6)', paddingTop: sp(2) }}>
                {/* Clean borderless total row */}
                <div style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  gap: sp(1.5),
                  padding: '8px 0'
                }}>
                  <div style={{ display: 'grid', gap: 2 }}>
                    <div style={{ fontSize: 12, fontWeight: 700, color: '#475569', textTransform: 'uppercase', letterSpacing: '0.07em' }}>Total</div>
                    <div style={{ fontSize: 12, color: '#64748b' }}>Base price plus selected add-ons</div>
                  </div>
                  <div style={{ textAlign: 'right' }}>
                    {selectedModifiersTotal > 0 ? (
                      <div style={{ fontSize: 12, fontWeight: 700, color: '#15803d' }}>+{money(selectedModifiersTotal).replace('PHP ', 'PHP ')}</div>
                    ) : null}
                    <div style={{ fontSize: 24, fontWeight: 900, color: '#0f172a', lineHeight: 1.1, letterSpacing: '-0.02em' }}>{money(totalPrice)}</div>
                  </div>
                </div>

                {/* Action buttons (Clean CTAs with specific icons) */}
                <div style={{ display: 'grid', gridTemplateColumns: isMobileViewport ? '1fr' : '1fr 1fr', gap: 12 }}>
                  {/* Add to Cart - filled green (primary) */}
                  <button
                    type="button"
                    onClick={onAddToCart}
                    disabled={!available}
                    style={{
                      ...actionButtonBase,
                      border: 'none',
                      background: available ? '#26884c' : '#cbd5e1',
                      color: '#fff',
                      boxShadow: 'none',
                      opacity: available ? 1 : 0.65
                    }}
                  >
                    <ShoppingCart size={16} />
                    Add to Cart
                  </button>

                  {/* Buy Now - orange, no gradient */}
                  <button
                    type="button"
                    onClick={onBuyNow}
                    disabled={!available}
                    style={{
                      ...actionButtonBase,
                      border: 'none',
                      background: available ? '#f97316' : '#cbd5e1',
                      color: '#fff',
                      boxShadow: 'none',
                      opacity: available ? 1 : 0.65
                    }}
                  >
                    <Zap size={16} />
                    Buy Now
                  </button>
                </div>

                {/* Bottom Secure Checkout Locks badge */}
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, fontSize: 12, color: '#64748b', fontWeight: 600, marginTop: 8 }}>
                  <Lock size={16} color="#64748b" />
                  Secure checkout • 100% safe
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* -- Mobile sticky CTA bar -- */}
      {isMobileViewport ? (
        <div
          style={{
            position: 'fixed',
            left: sp(2),
            right: sp(2),
            bottom: sp(2),
            zIndex: 60,
            borderRadius: 20,
            border: '1px solid rgba(226,232,240,0.9)',
            background: 'rgba(255,255,255,0.97)',
            backdropFilter: 'blur(18px)',
            boxShadow: '0 16px 40px rgba(15,23,42,0.18)',
            padding: sp(2),
            display: 'grid',
            gap: sp(1)
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: sp(2) }}>
            <div style={{ minWidth: 0 }}>
              <div style={{ fontSize: 12, fontWeight: 700, color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.07em' }}>Total</div>
              <div style={{ fontSize: 24, fontWeight: 900, color: '#0f172a', lineHeight: 1.1, letterSpacing: '-0.02em' }}>{money(totalPrice)}</div>
            </div>
            <button
              type="button"
              onClick={onAddToCart}
              disabled={!available}
              style={{
                ...actionButtonBase,
                minHeight: 44,
                borderRadius: 18,
                minWidth: 160,
                border: 'none',
                background: available ? '#26884c' : '#cbd5e1',
                color: '#fff',
                boxShadow: 'none',
                opacity: available ? 1 : 0.65,
                flexShrink: 0
              }}
            >
              <ShoppingCart size={16} />
              Add to Cart
            </button>
          </div>
        </div>
      ) : null}
    </section>
  );
}

