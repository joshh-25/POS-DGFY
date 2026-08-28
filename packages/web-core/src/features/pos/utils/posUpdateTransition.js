export const POS_UPDATE_TRANSITION_EVENT = 'dgfy-pos:update-transition';

// A one-shot signal that a natural navigation transition just started --
// login succeeding, logging out, a company switch, an admin re-unlock, or
// any other point where `locked` changes or the terminal re-enters its
// restoration/loading window. Unlike posUpdateSafety.js (continuous "is it
// safe right now" state, used only to inform the notice's message), this is
// a pulse with no state of its own: it just tells main.jsx's listener "this
// exact moment is safe to silently apply a pending update, because the user
// is already mid-transition and expects something to happen" -- as opposed
// to an idle screen, where a reload would come "out of nowhere" (#990,
// Pat's 2026-08-28 follow-up). Never fired for an idle screen with nothing
// changing, and never gates or gets read continuously.
export const publishPosUpdateTransition = (
  windowObj = typeof window === 'undefined' ? null : window
) => {
  if (typeof windowObj?.dispatchEvent !== 'function' || typeof windowObj?.CustomEvent !== 'function') return;
  windowObj.dispatchEvent(new windowObj.CustomEvent(POS_UPDATE_TRANSITION_EVENT));
};
