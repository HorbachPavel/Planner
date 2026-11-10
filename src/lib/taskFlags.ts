export const taskFlagColors = [
  "#e53935",
  "#fb8c00",
  "#43a047",
  "#1e88e5",
  "#8e24aa",
  "#d81b60",
] as const;

export type TaskFlagColor = (typeof taskFlagColors)[number];

export function nextTaskFlagColor(used: Array<string | null | undefined>): TaskFlagColor {
  const present = used.filter((color): color is string => Boolean(color));
  const unused = taskFlagColors.find((color) => !present.includes(color));
  if (unused) return unused;
  const last = present[present.length - 1];
  return taskFlagColors.find((color) => color !== last) ?? taskFlagColors[0];
}
