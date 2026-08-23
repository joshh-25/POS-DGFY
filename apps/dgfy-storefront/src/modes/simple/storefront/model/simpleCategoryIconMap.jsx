import {
  Coffee,
  CupSoda,
  Drumstick,
  Fish,
  Pizza,
  Sandwich,
  Soup,
  Sparkles,
  UtensilsCrossed,
} from 'lucide-react';

/**
 * Simple/MSME owns its category icon vocabulary. The incoming catalog model
 * still exposes legacy icon tokens, but the view no longer imports an F&B
 * presentation constant to render them.
 */
export const SIMPLE_CATEGORY_ICON_MAP = Object.freeze({
  coffee: Coffee,
  drink: CupSoda,
  dessert: Sparkles,
  burger: Sandwich,
  chicken: Drumstick,
  pizza: Pizza,
  seafood: Fish,
  meal: UtensilsCrossed,
  snack: Soup,
  menu: Sparkles,
});
