import {
  Coffee,
  CupSoda,
  Drumstick,
  Fish,
  Pizza,
  Sandwich,
  Soup,
  Sparkles,
  UtensilsCrossed
} from 'lucide-react';

export function buildFnbFallbackReasons({ fnbViewModel = null, categories = [] } = {}) {
  const reasons = [];
  if (Array.isArray(categories) && categories.length > 0) {
    reasons.push(...categories.slice(0, 2));
  }
  const menuSections = Array.isArray(fnbViewModel?.menuSections) ? fnbViewModel.menuSections : [];
  menuSections.slice(0, 2).forEach((section) => {
    const count = Number(section?.items?.length || 0);
    if (count > 0) reasons.push(`${section.sectionLabel || 'Menu'} favorites (${count})`);
  });
  const beverageCount = Number(fnbViewModel?.beverageCount || 0);
  if (beverageCount > 0) reasons.push(`${beverageCount} drinks ready to serve`);
  const readyNowCount = Number(fnbViewModel?.readyNowCount || 0);
  if (readyNowCount > 0) reasons.push(`${readyNowCount} items available now`);
  return [...new Set(reasons.map((entry) => String(entry || '').trim()).filter(Boolean))].slice(0, 4);
}

export const FNB_CATEGORY_ICON_MAP = Object.freeze({
  coffee: Coffee,
  drink: CupSoda,
  dessert: Sparkles,
  burger: Sandwich,
  chicken: Drumstick,
  pizza: Pizza,
  seafood: Fish,
  meal: UtensilsCrossed,
  snack: Soup,
  menu: Sparkles
});
