// Search and filter controls share one touch-friendly height across POS data pages.
export const POS_TOOLBAR_CONTROL_HEIGHT_CLASS = 'h-11 min-h-11 min-[1200px]:h-10 min-[1200px]:min-h-10';

// Filter launchers are slightly more compact on phones; tablet/desktop sizing is unchanged.
export const POS_FILTER_TRIGGER_HEIGHT_CLASS = 'h-10 min-h-10 md:h-11 md:min-h-11 min-[1200px]:h-10 min-[1200px]:min-h-10';

// POS keeps toolbar actions icon-only through tablet widths. This keeps the search
// control and its adjacent actions from colliding at tablet landscape sizes while
// preserving the full labels for desktop users. The labels remain available to
// assistive technology at every viewport.
export const POS_TOOLBAR_COMPACT_LABEL_CLASS = 'sr-only min-[1200px]:not-sr-only';
export const POS_TOOLBAR_ICON_ACTION_CLASS = 'w-11 min-w-11 shrink-0 justify-center px-0 min-[1200px]:w-auto min-[1200px]:min-w-0 min-[1200px]:px-3';
