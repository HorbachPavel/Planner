import { localDateKey } from "./localDate";

export function backupFileName(date = new Date()): string {
  const half = date.getHours() < 12 ? "am" : "pm";
  return `${localDateKey(date)}-${half}.json`;
}

export function backupPath(date = new Date()): string {
  return `data/backups/${backupFileName(date)}`;
}

export function retainedBackupNames(now = new Date()): Set<string> {
  const names = new Set<string>();
  for (const offset of [0, 1]) {
    const day = new Date(now);
    day.setHours(12, 0, 0, 0);
    day.setDate(day.getDate() - offset);
    const key = localDateKey(day);
    names.add(`${key}-am.json`);
    names.add(`${key}-pm.json`);
  }
  return names;
}

export function expiredBackupPaths(paths: string[], now = new Date()): string[] {
  const retained = retainedBackupNames(now);
  return paths.filter((path) => {
    const name = path.split("/").pop() ?? "";
    return /^\d{4}-\d{2}-\d{2}-(am|pm)\.json$/.test(name) && !retained.has(name);
  });
}
