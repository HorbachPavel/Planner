export function localDateKey(date = new Date()): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

export function daysBetweenLocalDates(fromKey: string, toKey: string): number {
  const from = parseLocalDateKey(fromKey);
  const to = parseLocalDateKey(toKey);
  return Math.round((to.getTime() - from.getTime()) / 86_400_000);
}

function parseLocalDateKey(key: string): Date {
  const [year, month, day] = key.split("-").map(Number);
  return new Date(year, month - 1, day, 12, 0, 0);
}

/** Number of calendar weeks (Monday to Sunday) between two local dates. */
export function weeksBetweenLocalDates(fromKey: string, toKey: string): number {
  const from = mondayOf(parseLocalDateKey(fromKey));
  const to = mondayOf(parseLocalDateKey(toKey));
  return Math.round((to.getTime() - from.getTime()) / (7 * 86_400_000));
}

function mondayOf(date: Date): Date {
  const monday = new Date(date);
  const daysSinceMonday = (date.getDay() + 6) % 7; // Sunday is 0 in JavaScript
  monday.setDate(date.getDate() - daysSinceMonday);
  return monday;
}
