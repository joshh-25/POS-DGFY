/**
 * Remove a URL's query component while preserving its path and fragment.
 * This is intentionally string based: telemetry may contain absolute,
 * relative, or malformed URL values, and sanitization must never throw.
 */
export const scrubTelemetryUrl = (value) => {
  if (typeof value !== 'string') return value;

  const fragmentIndex = value.indexOf('#');
  const beforeFragment = fragmentIndex === -1 ? value : value.slice(0, fragmentIndex);
  const fragment = fragmentIndex === -1 ? '' : value.slice(fragmentIndex);
  const queryIndex = beforeFragment.indexOf('?');

  return `${queryIndex === -1 ? beforeFragment : beforeFragment.slice(0, queryIndex)}${fragment}`;
};
