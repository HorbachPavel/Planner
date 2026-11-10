import { createHash } from "node:crypto";
import { db } from "@/db";
import { people, settings, tasks, timeBlocks } from "@/db/schema";

const bookkeepingKeys = new Set(["backupHash", "backupAt"]);

export async function createSnapshot() {
  const [taskRows, blockRows, peopleRows, settingRows] = await Promise.all([
    db.select().from(tasks),
    db.select().from(timeBlocks),
    db.select().from(people),
    db.select().from(settings),
  ]);
  const data = {
    version: 1 as const,
    tasks: taskRows,
    timeBlocks: blockRows,
    people: peopleRows,
    settings: settingRows.filter((row) => !bookkeepingKeys.has(row.key)),
  };
  const hash = createHash("sha256").update(JSON.stringify(data)).digest("hex");
  return { data, hash };
}
