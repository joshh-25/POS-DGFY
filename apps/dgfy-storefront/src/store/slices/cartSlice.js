/**
 * cartSlice — the storefront cart line items.
 *
 * Wave 3 (money path). Migrated from `const [cart, setCart] = useState([])` in
 * StorefrontApp.jsx via the in-place bridge: the shell keeps the local names
 * `cart` (= `s.cart.items`) and `setCart` (= `cartSet`), so every read, memo
 * dependency, prop pass, and handler is untouched.
 *
 * `cartSet` is intentionally useState-compatible: it accepts either the next
 * items array (`setCart([])`) or an updater `(prevItems) => nextItems`
 * (`setCart(prev => …)`), matching all existing call sites exactly.
 *
 * Note: cart persistence is still handled by the existing
 * `useStorefrontCartPersistence` hook (unchanged). zustand `persist` middleware
 * is intentionally NOT wired here yet — swapping the persistence mechanism is a
 * separate, QA-gated step.
 */

export const cartInitialState = {
  cart: { items: [], imageErrors: new Set() }
};

export const createCartSlice = (set) => ({
  ...cartInitialState,

  cartSet: (next) =>
    set((s) => ({
      cart: {
        ...s.cart,
        items: typeof next === 'function' ? next(s.cart.items) : next
      }
    })),

  cartSetImageErrors: (next) =>
    set((s) => ({
      cart: {
        ...s.cart,
        imageErrors: typeof next === 'function' ? next(s.cart.imageErrors) : next
      }
    }))
});
