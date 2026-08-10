import React from 'react';
import {
  ChevronRight,
  Coffee,
  CupSoda,
  Droplets,
  HeartHandshake,
  MoreHorizontal,
  Scissors,
  Shirt,
  ShoppingCart,
  Snowflake,
  SprayCan,
  UtensilsCrossed,
  Wrench,
  Sandwich
} from 'lucide-react';

import { DiscoveryCategoryRail } from '../../Components/store/DiscoveryResponsiveLayout.jsx';

export function DiscoveryCategoryStage({
  desktopCategoryRailRef,
  discoveryViewportMode,
  handlePopularDiscoveryCategory,
  hasDesktopCategoryOverflow,
  isCategoryRowExpanded,
  isDiscoveryMobileViewport,
  mobileCategoryGroupIndex,
  mobileCategoryRailRef,
  setIsCategoryRowExpanded,
  setMobileCategoryGroupIndex,
  showDesktopCategoryOverflowCue
}) {
                        const primaryCats = [
                          { label: 'Food', icon: <UtensilsCrossed size={isDiscoveryMobileViewport ? 20 : 16} />, color: '#f97316', bg: '#fff7ed', border: '#fed7aa' },
                          { label: 'Grocery', icon: <ShoppingCart size={isDiscoveryMobileViewport ? 20 : 16} />, color: '#16a34a', bg: '#f0fdf4', border: '#bbf7d0' },
                          { label: 'Laundry', icon: <Droplets size={isDiscoveryMobileViewport ? 20 : 16} />, color: '#0284c7', bg: '#f0f9ff', border: '#bae6fd' },
                          { label: 'Salon', icon: <Scissors size={isDiscoveryMobileViewport ? 20 : 16} />, color: '#9333ea', bg: '#faf5ff', border: '#e9d5ff' },
                          { label: 'Pharmacy', icon: <HeartHandshake size={isDiscoveryMobileViewport ? 20 : 16} />, color: '#e11d48', bg: '#fff1f2', border: '#fecdd3' }
                        ];
                          const extendedCats = [
                          { label: 'Bakery', icon: <Coffee size={14} />, color: '#92400e', bg: '#fffbeb', border: '#fde68a' },
                          { label: 'Clothing', icon: <Shirt size={14} />, color: '#7c3aed', bg: '#f5f3ff', border: '#ddd6fe' },
                          { label: 'Drinks', icon: <CupSoda size={14} />, color: '#0891b2', bg: '#ecfeff', border: '#a5f3fc' },
                          { label: 'Food Stall', icon: <Sandwich size={14} />, color: '#d97706', bg: '#fffbeb', border: '#fde68a' },
                          { label: 'Frozen', icon: <Snowflake size={14} />, color: '#1a4e8d', bg: '#eff6ff', border: '#bfdbfe' },
                          { label: 'Beauty', icon: <SprayCan size={14} />, color: '#db2777', bg: '#fdf2f8', border: '#fbcfe8' },
                            { label: 'Hardware', icon: <Wrench size={14} />, color: '#64748b', bg: '#f8fafc', border: '#e2e8f0' }
                          ];
                            const mobileCategoryStep = 3;
                            const mobilePrimaryCount = 5;
                            const allMobileCategories = [...primaryCats, ...extendedCats];
                            const mobileOverflowCount = Math.max(0, allMobileCategories.length - mobilePrimaryCount);
                            const mobileOverflowGroups = Math.ceil(mobileOverflowCount / mobileCategoryStep);
                            const cardStyle = (cat) => ({
                              borderRadius: 999,
                              background: cat.bg,
                              color: cat.color,
                              padding: isDiscoveryMobileViewport ? '6px 12px' : '6px 14px',
                              minHeight: isDiscoveryMobileViewport ? 34 : 34,
                              height: 'auto',
                              fontSize: isDiscoveryMobileViewport ? 13 : 13,
                              lineHeight: 1.15,
                              fontWeight: isDiscoveryMobileViewport ? 600 : 600,
                              cursor: 'pointer',
                            display: 'flex',
                            flexDirection: 'row',
                            alignItems: 'center',
                            justifyContent: 'center',
                              gap: isDiscoveryMobileViewport ? 6 : 6,
                              flexShrink: 0,
                              width: 'auto',
                              border: `1.5px solid ${cat.border}`,
                              boxShadow: '0 2px 8px rgba(15,23,42,.04)',
                              transition: 'all 200ms ease'
                          });
                        const visibleCategories = isDiscoveryMobileViewport
                          ? allMobileCategories
                          : (isCategoryRowExpanded ? [...primaryCats, ...extendedCats] : primaryCats);
                        const desktopRailWidth = isCategoryRowExpanded ? 'min(100%, 980px)' : 'max-content';
                        return (
                          <DiscoveryCategoryRail viewportMode={discoveryViewportMode}>
                            <div style={{ marginTop: isDiscoveryMobileViewport ? 18 : 24 }}>
                              <div style={{ fontSize: 12, color: '#94a3b8', fontWeight: 800, letterSpacing: '0.08em', textTransform: 'uppercase', marginBottom: 14, display: isDiscoveryMobileViewport ? 'block' : 'none' }}>Categories</div>
                              <div style={{ display: 'flex', justifyContent: isDiscoveryMobileViewport ? 'flex-start' : 'center', width: '100%', minWidth: 0 }}>
                                <div
                                  style={{
                                    position: 'relative',
                                    display: 'flex',
                                    alignItems: 'center',
                                    justifyContent: isDiscoveryMobileViewport ? 'flex-start' : 'center',
                                    gap: isDiscoveryMobileViewport ? 10 : 10,
                                    width: isDiscoveryMobileViewport ? '100%' : desktopRailWidth,
                                    maxWidth: '100%',
                                    minWidth: 0,
                                    margin: isDiscoveryMobileViewport ? '0' : '0 auto'
                                  }}
                                >
                                  {!isDiscoveryMobileViewport && (
                                    <span style={{ fontSize: 12, lineHeight: 1, color: '#94a3b8', fontWeight: 600, letterSpacing: '0.04em', textTransform: 'uppercase', flexShrink: 0 }}>
                                      Categories
                                    </span>
                                  )}
                                  <div
                                    ref={isDiscoveryMobileViewport ? mobileCategoryRailRef : desktopCategoryRailRef}
                                    style={{
                                      display: 'flex',
                                      alignItems: 'center',
                                      justifyContent: isDiscoveryMobileViewport ? 'flex-start' : (isCategoryRowExpanded ? 'flex-start' : 'center'),
                                      gap: isDiscoveryMobileViewport ? 10 : 8,
                                      overflowX: 'auto',
                                      paddingBottom: isDiscoveryMobileViewport ? 8 : 2,
                                      width: isDiscoveryMobileViewport ? '100%' : (isCategoryRowExpanded ? '100%' : 'auto'),
                                      minWidth: 0,
                                      scrollbarWidth: 'none',
                                      msOverflowStyle: 'none'
                                    }}
                                  >
                                    {visibleCategories.map((cat, index) => (
                                      <button
                                        key={cat.label}
                                        type="button"
                                        data-mobile-category-index={isDiscoveryMobileViewport ? index : undefined}
                                        onClick={() => handlePopularDiscoveryCategory(cat.label)}
                                        style={cardStyle(cat)}
                                      >
                                        <div style={{
                                          display: 'flex',
                                          alignItems: 'center',
                                          justifyContent: 'center',
                                          width: isDiscoveryMobileViewport ? 16 : 18,
                                          height: isDiscoveryMobileViewport ? 16 : 18
                                        }}>
                                          {cat.icon}
                                        </div>
                                        <span style={{ display: 'block', textAlign: 'center', width: '100%', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{cat.label}</span>
                                      </button>
                                    ))}
                                      {isDiscoveryMobileViewport && mobileOverflowGroups > 0 && (
                                        <button
                                          type="button"
                                          onClick={() => {
                                            const nextGroup = (mobileCategoryGroupIndex + 1) % (mobileOverflowGroups + 1);
                                            setMobileCategoryGroupIndex(nextGroup);
                                            const targetIndex = nextGroup === 0
                                              ? 0
                                              : Math.min(
                                                allMobileCategories.length - 1,
                                                mobilePrimaryCount + ((nextGroup - 1) * mobileCategoryStep)
                                              );
                                            const railElement = mobileCategoryRailRef.current;
                                            if (!railElement) return;
                                            const targetButton = railElement.querySelector(`[data-mobile-category-index="${targetIndex}"]`);
                                            if (targetButton && typeof targetButton.scrollIntoView === 'function') {
                                              targetButton.scrollIntoView({
                                                behavior: 'smooth',
                                                block: 'nearest',
                                                inline: 'start'
                                              });
                                            }
                                          }}
                                        style={{
                                          position: 'sticky',
                                          right: 0,
                                          top: 0,
                                          height: 34,
                                          minWidth: 46,
                                          borderRadius: 999,
                                          display: 'inline-flex',
                                          alignItems: 'center',
                                          justifyContent: 'center',
                                          background: 'linear-gradient(90deg, rgba(255,255,255,0) 0%, rgba(255,255,255,.78) 40%, rgba(255,255,255,.98) 100%)',
                                          backdropFilter: 'blur(6px)',
                                          WebkitBackdropFilter: 'blur(6px)',
                                          pointerEvents: 'auto',
                                          color: '#94a3b8',
                                          border: '1px solid rgba(226,232,240,.85)',
                                          boxShadow: '0 6px 16px rgba(15,23,42,.08)',
                                          cursor: 'pointer'
                                        }}
                                        aria-label="Show more categories"
                                      >
                                        <ChevronRight size={16} />
                                      </button>
                                    )}
                                    {!isDiscoveryMobileViewport && (
                                      <button
                                        type="button"
                                        onClick={() => setIsCategoryRowExpanded(!isCategoryRowExpanded)}
                                        style={{
                                          ...cardStyle({ bg: '#fff', color: '#64748b', border: '#dbe3ee' }),
                                          border: '1.5px solid #dbe3ee',
                                          minHeight: 34,
                                          minWidth: 84
                                        }}
                                      >
                                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                                          <MoreHorizontal size={16} />
                                        </div>
                                        {isCategoryRowExpanded ? 'Less' : 'More'}
                                      </button>
                                    )}
                                  </div>
                                  {!isDiscoveryMobileViewport && isCategoryRowExpanded && hasDesktopCategoryOverflow && showDesktopCategoryOverflowCue && (
                                    <button
                                      type="button"
                                      onClick={() => desktopCategoryRailRef.current?.scrollBy({ left: 220, behavior: 'smooth' })}
                                      aria-label="Show more categories"
                                      style={{
                                        flexShrink: 0,
                                        width: 34,
                                        height: 34,
                                        borderRadius: 999,
                                        border: '1px solid rgba(226,232,240,.9)',
                                        background: '#ffffff',
                                        color: '#64748b',
                                        display: 'inline-flex',
                                        alignItems: 'center',
                                        justifyContent: 'center',
                                        boxShadow: '0 6px 16px rgba(15,23,42,.08)',
                                        cursor: 'pointer'
                                      }}
                                    >
                                      <ChevronRight size={16} />
                                    </button>
                                  )}
                                  </div>
                              </div>

                            </div>
                          </DiscoveryCategoryRail>
                        );
}
