const DEFAULT_TIMEZONE = 'Asia/Manila';
const pad = (value) => String(value).padStart(2, '0');

export const getScheduleTimezone = (storefrontHours) => storefrontHours?.timezone || DEFAULT_TIMEZONE;

export function getBranchWallDate(instant, timezone) {
  const parts = Object.fromEntries(new Intl.DateTimeFormat('en-US', {
    timeZone: timezone,
    year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', hourCycle: 'h23'
  }).formatToParts(instant).map((part) => [part.type, part.value]));
  return new Date(Number(parts.year), Number(parts.month) - 1, Number(parts.day), Number(parts.hour), Number(parts.minute));
}

const wallKey = (date) => `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;

/** Interpret a wall-clock selection in the branch's IANA timezone, never the shopper's timezone. */
export function branchWallToInstant(wallDate, timezone) {
  const target = Date.UTC(wallDate.getFullYear(), wallDate.getMonth(), wallDate.getDate(), wallDate.getHours(), wallDate.getMinutes());
  let candidate = target;
  for (let attempt = 0; attempt < 3; attempt += 1) {
    const rendered = getBranchWallDate(new Date(candidate), timezone);
    const renderedAsUtc = Date.UTC(rendered.getFullYear(), rendered.getMonth(), rendered.getDate(), rendered.getHours(), rendered.getMinutes());
    const delta = target - renderedAsUtc;
    if (delta === 0) break;
    candidate += delta;
  }
  const result = new Date(candidate);
  return wallKey(getBranchWallDate(result, timezone)) === wallKey(wallDate) ? result : null;
}

export function branchScheduleToIso(value, storefrontHours) {
  const match = String(value || '').match(/^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})$/);
  if (!match) return new Date(value).toISOString();
  const wallDate = new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3]), Number(match[4]), Number(match[5]));
  const instant = branchWallToInstant(wallDate, getScheduleTimezone(storefrontHours));
  if (!instant) throw new RangeError('The selected branch date and time is unavailable.');
  return instant.toISOString();
}
