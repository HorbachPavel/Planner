import { mkdtempSync, readdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { beforeEach, describe, expect, it } from "vitest";
import { db } from "@/db";
import { tasks } from "@/db/schema";
import { createTask } from "@/server/tasks/service";
import { runBackup } from "./auto";

const backupDir = mkdtempSync(join(tmpdir(), "focusflow-backup-"));
process.env.ASSISTANT_BACKUP_DIR = backupDir;

beforeEach(async () => {
  await db.delete(tasks);
});

describe("automatic backup", () => {
  it("writes a snapshot only after the data changes", async () => {
    await createTask({ title: "Сохранить меня" });
    expect(await runBackup()).toBe("written");
    expect(await runBackup()).toBe("unchanged");
    expect(jsonBackups()).toHaveLength(1);

    await createTask({ title: "Второе изменение" });
    expect(await runBackup()).toBe("written");
    expect(jsonBackups()).toHaveLength(2);
  });
});

function jsonBackups() {
  return readdirSync(backupDir).filter((name) => name.startsWith("focusflow-") && name.endsWith(".json"));
}
