function toTime(value: string | Date | null | undefined): number {
  if (!value) return 0;
  const time = value instanceof Date ? value.getTime() : Date.parse(value);
  return Number.isFinite(time) ? time : 0;
}

export function sortByCompletedAtDesc<T extends { completedAt?: string | Date | null }>(
  tasks: T[],
): T[] {
  return [...tasks].sort((left, right) => toTime(right.completedAt) - toTime(left.completedAt));
}

export function formatCompletedAt(
  value: string | Date | null | undefined,
  locale?: string,
): string | null {
  const time = toTime(value);
  if (!time) return null;
  return new Date(time).toLocaleString(locale, {
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  });
}
