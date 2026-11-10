import { RRule } from "rrule";

export type RecurrencePreset = "daily" | "weekdays" | "weekly" | "monthly";

export function presetToRule(preset: RecurrencePreset, start: Date): string {
  const options: Partial<ConstructorParameters<typeof RRule>[0]> = {
    dtstart: start,
  };
  if (preset === "daily") options.freq = RRule.DAILY;
  if (preset === "weekdays") {
    options.freq = RRule.WEEKLY;
    options.byweekday = [RRule.MO, RRule.TU, RRule.WE, RRule.TH, RRule.FR];
  }
  if (preset === "weekly") options.freq = RRule.WEEKLY;
  if (preset === "monthly") options.freq = RRule.MONTHLY;
  return new RRule(options as ConstructorParameters<typeof RRule>[0]).toString();
}

export function nextOccurrence(rule: string, after: Date): Date | null {
  try {
    return RRule.fromString(rule).after(after, false);
  } catch {
    return null;
  }
}
