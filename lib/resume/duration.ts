function monthIndex(value: string): number | null {
  const match = /^(\d{4})-(0[1-9]|1[0-2])$/.exec(value);
  return match ? Number(match[1]) * 12 + Number(match[2]) - 1 : null;
}

/** Month-only resume dates include both the starting and ending month. */
export function formatResumeDuration(
  startDate: string,
  endDate: string,
  now: Date = new Date(),
): string | null {
  const start = monthIndex(startDate);
  const end = endDate
    ? monthIndex(endDate)
    : now.getFullYear() * 12 + now.getMonth();
  if (start === null || end === null || !Number.isFinite(end) || end < start) {
    return null;
  }

  const totalMonths = end - start + 1;
  const years = Math.floor(totalMonths / 12);
  const months = totalMonths % 12;
  return [
    years ? `${years} ${years === 1 ? "year" : "years"}` : "",
    months ? `${months} ${months === 1 ? "month" : "months"}` : "",
  ]
    .filter(Boolean)
    .join(" ");
}

export function formatResumeDateRange(
  startDate: string,
  endDate: string,
): string {
  return startDate ? `${startDate} – ${endDate || "Present"}` : endDate;
}

export function formatResumePeriod(
  startDate: string,
  endDate: string,
  now: Date = new Date(),
): string {
  const dates = formatResumeDateRange(startDate, endDate);
  const duration = formatResumeDuration(startDate, endDate, now);
  return duration ? `${dates} (${duration})` : dates;
}
