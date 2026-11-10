import { createHash } from "node:crypto";
import { db } from "@/db";
import { outlookEvents } from "@/db/schema";

export async function importIcs(text: string): Promise<number> {
  const unfolded = text.replace(/\r?\n[ \t]/g, "");
  const chunks = unfolded.split("BEGIN:VEVENT").slice(1);
  const syncedAt = new Date();
  const events = chunks.flatMap((chunk) => {
    const content = chunk.split("END:VEVENT")[0] ?? "";
    const uid = valueOf(content, "UID");
    const start = parseIcsDate(valueOf(content, "DTSTART"));
    const end = parseIcsDate(valueOf(content, "DTEND"));
    if (!start || !end) return [];
    return [{
      id: `ics-${createHash("sha256").update(uid || `${start}-${end}`).digest("hex").slice(0, 24)}`,
      subject: unescapeIcs(valueOf(content, "SUMMARY") || "Busy"),
      startsAt: start,
      endsAt: end,
      isAllDay: /^\d{8}$/.test(valueOf(content, "DTSTART")),
      showAs: "busy",
      webLink: null,
      syncedAt,
    }];
  });
  if (events.length) {
    await db.insert(outlookEvents).values(events).onConflictDoUpdate({
      target: outlookEvents.id,
      set: { syncedAt },
    });
  }
  return events.length;
}

function valueOf(content: string, name: string): string {
  const line = content.split(/\r?\n/).find((item) => item.startsWith(`${name}:`) || item.startsWith(`${name};`));
  return line?.slice(line.indexOf(":") + 1).trim() ?? "";
}

function parseIcsDate(value: string): Date | null {
  const match = value.match(/^(\d{4})(\d{2})(\d{2})(?:T(\d{2})(\d{2})(\d{2})Z?)?$/);
  if (!match) return null;
  const [, year, month, day, hour = "00", minute = "00", second = "00"] = match;
  const date = value.endsWith("Z")
    ? new Date(Date.UTC(+year, +month - 1, +day, +hour, +minute, +second))
    : new Date(+year, +month - 1, +day, +hour, +minute, +second);
  return Number.isNaN(date.getTime()) ? null : date;
}

function unescapeIcs(value: string) {
  return value.replace(/\\n/gi, " ").replace(/\\,/g, ",").replace(/\\\\/g, "\\");
}
