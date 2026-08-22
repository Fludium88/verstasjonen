const DEFAULT_TIME_ZONE = 'Europe/Oslo';

export function normalizeTimeZone(timeZone?: string | null): string {
  const candidate = timeZone?.trim() || DEFAULT_TIME_ZONE;
  try {
    new Intl.DateTimeFormat('en-CA', { timeZone: candidate }).format(new Date(0));
    return candidate;
  } catch {
    return DEFAULT_TIME_ZONE;
  }
}

function getDateTimeParts(date: Date, timeZone: string) {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: normalizeTimeZone(timeZone),
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(date);

  const value = (type: Intl.DateTimeFormatPartTypes) =>
    Number(parts.find((part) => part.type === type)?.value ?? 0);

  return {
    year: value('year'),
    month: value('month'),
    day: value('day'),
    hour: value('hour') % 24,
    minute: value('minute'),
    second: value('second'),
  };
}

export function getLocalDateKey(date: Date | string | number, timeZone = DEFAULT_TIME_ZONE): string {
  const instant = date instanceof Date ? date : new Date(date);
  if (Number.isNaN(instant.getTime())) return '';
  const parts = getDateTimeParts(instant, timeZone);
  return `${parts.year}-${String(parts.month).padStart(2, '0')}-${String(parts.day).padStart(2, '0')}`;
}

export function addLocalDateDays(dateKey: string, days: number): string {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(dateKey);
  if (!match) throw new Error(`Invalid local date: ${dateKey}`);
  const shifted = new Date(Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3]) + days));
  return shifted.toISOString().slice(0, 10);
}

export function isValidLocalDate(dateKey: string): boolean {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(dateKey);
  if (!match) return false;
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const check = new Date(Date.UTC(year, month - 1, day));
  return (
    check.getUTCFullYear() === year &&
    check.getUTCMonth() === month - 1 &&
    check.getUTCDate() === day
  );
}

/** Converts a wall-clock time in an IANA time zone to its UTC instant. */
export function zonedDateTimeToUtc(
  dateKey: string,
  timeZone = DEFAULT_TIME_ZONE,
  hour = 0,
  minute = 0,
  second = 0
): Date {
  if (!isValidLocalDate(dateKey)) throw new Error(`Invalid local date: ${dateKey}`);
  const [year, month, day] = dateKey.split('-').map(Number);
  const wantedWallTime = Date.UTC(year, month - 1, day, hour, minute, second);
  let candidateMs = wantedWallTime;

  // Offsets can change close to the target because of daylight-saving transitions.
  // Re-evaluating against the candidate converges for all ordinary IANA transitions.
  for (let i = 0; i < 4; i++) {
    const candidate = new Date(candidateMs);
    const parts = getDateTimeParts(candidate, timeZone);
    const representedWallTime = Date.UTC(
      parts.year,
      parts.month - 1,
      parts.day,
      parts.hour,
      parts.minute,
      parts.second
    );
    const correction = wantedWallTime - representedWallTime;
    if (correction === 0) return candidate;
    candidateMs += correction;
  }

  return new Date(candidateMs);
}

export function getLocalDayBounds(
  dateKey: string,
  timeZone = DEFAULT_TIME_ZONE
): { startUtc: Date; endUtc: Date; durationMinutes: number } {
  const zone = normalizeTimeZone(timeZone);
  const startUtc = zonedDateTimeToUtc(dateKey, zone);
  const endUtc = zonedDateTimeToUtc(addLocalDateDays(dateKey, 1), zone);
  return {
    startUtc,
    endUtc,
    durationMinutes: Math.round((endUtc.getTime() - startUtc.getTime()) / 60000),
  };
}

export function formatLocalTime(
  date: Date | string | number,
  timeZone = DEFAULT_TIME_ZONE,
  options: Intl.DateTimeFormatOptions = {}
): string {
  const instant = date instanceof Date ? date : new Date(date);
  if (Number.isNaN(instant.getTime())) return '';
  return new Intl.DateTimeFormat('nb-NO', {
    timeZone: normalizeTimeZone(timeZone),
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
    ...options,
  }).format(instant);
}

