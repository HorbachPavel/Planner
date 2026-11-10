import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { settings } from "@/db/schema";

const execFileAsync = promisify(execFile);
const service = "FocusFlow Local Assistant";

export async function getSecret(account: string): Promise<string | null> {
  const envKey = `ASSISTANT_${account.toUpperCase().replaceAll("-", "_")}`;
  if (process.env[envKey]) return process.env[envKey]!;
  if (process.platform !== "darwin") return null;
  try {
    const { stdout } = await execFileAsync("security", [
      "find-generic-password",
      "-s",
      service,
      "-a",
      account,
      "-w",
    ]);
    return stdout.trim() || null;
  } catch {
    return null;
  }
}

export async function setSecret(account: string, value: string): Promise<void> {
  if (process.platform !== "darwin") {
    throw new Error("Secrets are only supported through the macOS Keychain.");
  }
  await execFileAsync("security", [
    "add-generic-password",
    "-U",
    "-s",
    service,
    "-a",
    account,
    "-w",
    value,
  ]);
}

export async function getSetting(key: string): Promise<string | null> {
  const [row] = await db.select().from(settings).where(eq(settings.key, key)).limit(1);
  return row?.value ?? null;
}

export async function setSetting(key: string, value: string): Promise<void> {
  await db
    .insert(settings)
    .values({ key, value, updatedAt: new Date() })
    .onConflictDoUpdate({
      target: settings.key,
      set: { value, updatedAt: new Date() },
    });
}
