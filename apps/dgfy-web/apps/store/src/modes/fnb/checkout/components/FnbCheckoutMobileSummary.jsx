/**
 * Mobile F&B checkout summary boundary for the sheet and persistent footer.
 */
export function FnbCheckoutMobileSummary({ children, isResponsive }) {
  if (!isResponsive) return null;
  return children;
}
