/**
 * Palestine-timezone-aware date helpers.
 *
 * Uses the built-in Intl.DateTimeFormat API (no external dependencies).
 * "Asia/Hebron" automatically handles DST transitions (UTC+2 winter, UTC+3 summer).
 */

const PALESTINE_TZ = "Asia/Hebron";

/** Extract Palestine-local {year, month, day} from a Date. */
export function getPalestineDateParts(d: Date): {
  year: number;
  month: number;
  day: number;
} {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: PALESTINE_TZ,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(d);

  return {
    year: parseInt(parts.find((p) => p.type === "year")!.value),
    month: parseInt(parts.find((p) => p.type === "month")!.value),
    day: parseInt(parts.find((p) => p.type === "day")!.value),
  };
}

/**
 * Compute the UTC offset (in ms) for a given Date in Palestine time.
 * offset = UTC timestamp - "local time expressed as UTC millis"
 */
function palestineOffsetMs(d: Date): number {
  const { year, month, day } = getPalestineDateParts(d);

  const timeParts = new Intl.DateTimeFormat("en-GB", {
    timeZone: PALESTINE_TZ,
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  }).formatToParts(d);

  const hour = parseInt(timeParts.find((p) => p.type === "hour")!.value);
  const minute = parseInt(timeParts.find((p) => p.type === "minute")!.value);
  const second = parseInt(timeParts.find((p) => p.type === "second")!.value);

  const localAsUTC = Date.UTC(year, month - 1, day, hour, minute, second, 0);
  return d.getTime() - localAsUTC;
}

/** Return a UTC Date representing midnight (00:00:00.000) in Palestine time for the given date. */
export function palestineStartOfDay(d: Date): Date {
  const { year, month, day } = getPalestineDateParts(d);
  const offset = palestineOffsetMs(d);
  return new Date(Date.UTC(year, month - 1, day, 0, 0, 0, 0) + offset);
}

/** Return a UTC Date representing 23:59:59.999 in Palestine time for the given date. */
export function palestineEndOfDay(d: Date): Date {
  const { year, month, day } = getPalestineDateParts(d);
  const offset = palestineOffsetMs(d);
  return new Date(Date.UTC(year, month - 1, day, 23, 59, 59, 999) + offset);
}

/** Compare two dates by their Palestine-local calendar day. */
export function isSamePalestineDay(a: Date, b: Date): boolean {
  const pa = getPalestineDateParts(a);
  const pb = getPalestineDateParts(b);
  return pa.year === pb.year && pa.month === pb.month && pa.day === pb.day;
}
