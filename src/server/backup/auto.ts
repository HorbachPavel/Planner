import { existsSync, mkdirSync, readdirSync, readFileSync, statSync, unlinkSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import { createSnapshot } from "./snapshot";

const intervalMs = 3 * 60 * 1000;
const maxSnapshots = 200;

type BackupState = { directory: string; hash: string; at: string; file: string };
type BackupTarget = { directory: string; oneDrive: boolean; note: string };

const globalForBackup = globalThis as typeof globalThis & {
  __focusFlowBackup?: boolean;
};

export function resolveBackupDir(): BackupTarget {
  const configured = process.env.ASSISTANT_BACKUP_DIR;
  if (configured) {
    return {
      directory: configured,
      oneDrive: configured.includes("OneDrive"),
      note: configured.includes("OneDrive")
        ? oneDriveNote(configured)
        : "The backup folder was set manually.",
    };
  }

  const cloudRoot = join(homedir(), "Library", "CloudStorage");
  if (existsSync(cloudRoot)) {
    for (const name of readdirSync(cloudRoot)) {
      if (!name.startsWith("OneDrive")) continue;
      const selected = join(cloudRoot, name, "Focus Flow BackUps");
      if (existsSync(selected)) {
        return { directory: selected, oneDrive: true, note: oneDriveNote(name) };
      }
    }
  }

  return {
    directory: join(homedir(), "Library", "Application Support", "FocusFlow", "backups"),
    oneDrive: false,
    note: "The “Focus Flow BackUps” folder was not found in OneDrive. Copies stay on this Mac and are available only to your macOS account.",
  };
}

export async function runBackup(): Promise<"written" | "unchanged"> {
  const target = resolveBackupDir();
  const snapshot = await createSnapshot();
  const state = readState(target.directory);
  if (
    state?.hash === snapshot.hash &&
    state.directory === target.directory &&
    existsSync(state.file)
  ) {
    return "unchanged";
  }

  mkdirSync(target.directory, { recursive: true, mode: 0o700 });
  const stamp = new Date().toISOString().replaceAll(":", "-");
  const file = join(target.directory, `focusflow-${stamp}.json`);
  writeFileSync(
    file,
    JSON.stringify({ ...snapshot.data, exportedAt: new Date().toISOString() }, null, 2),
    { mode: 0o600 },
  );
  writeState(target.directory, { directory: target.directory, hash: snapshot.hash, at: new Date().toISOString(), file });
  pruneSnapshots(target.directory);
  return "written";
}

export function backupStatus() {
  const target = resolveBackupDir();
  const state = readState(target.directory);
  return {
    directory: target.directory,
    oneDrive: target.oneDrive,
    note: target.note,
    lastBackupAt: state?.directory === target.directory ? state.at : null,
  };
}

export function startAutoBackup() {
  if (process.env.VITEST || globalForBackup.__focusFlowBackup) return;
  globalForBackup.__focusFlowBackup = true;
  void runBackup().catch((error) => console.error("FocusFlow backup failed", error));
  setInterval(() => {
    void runBackup().catch((error) => console.error("FocusFlow backup failed", error));
  }, intervalMs);
}

function statePath(directory: string) {
  return join(directory, ".backup-state.json");
}

function readState(directory: string): BackupState | null {
  try {
    return JSON.parse(readFileSync(statePath(directory), "utf8")) as BackupState;
  } catch {
    return null;
  }
}

function writeState(directory: string, state: BackupState) {
  mkdirSync(directory, { recursive: true, mode: 0o700 });
  writeFileSync(statePath(directory), JSON.stringify(state), { mode: 0o600 });
}

function pruneSnapshots(directory: string) {
  const files = readdirSync(directory)
    .filter((name) => name.startsWith("focusflow-") && name.endsWith(".json"))
    .map((name) => ({ name, mtime: statSync(join(directory, name)).mtimeMs }))
    .sort((a, b) => b.mtime - a.mtime);
  for (const file of files.slice(maxSnapshots)) unlinkSync(join(directory, file.name));
}

function oneDriveNote(name: string) {
  const personal = /personal/i.test(name);
  return personal
    ? "Copies are saved to your personal OneDrive. The app does not create a sharing link."
    : "Copies are saved to your OneDrive. The app does not create a sharing link. For a work OneDrive, your organization’s admin may be able to access the files.";
}
