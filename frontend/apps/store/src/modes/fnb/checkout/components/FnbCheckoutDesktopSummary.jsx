/**
 * Desktop-only F&B checkout summary boundary.
 * This intentionally preserves the existing sticky summary layout.
 */
export function FnbCheckoutDesktopSummary({ children, isDesktop }) {
  if (!isDesktop) return null;
  return (
    <aside style={{ display: 'grid', gap: 14, position: 'sticky', top: 8 }}>
      {children}
    </aside>
  );
}
