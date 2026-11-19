import Database from "better-sqlite3";
import { homedir } from "node:os";
import { join } from "node:path";

const token = process.env.GITHUB_TOKEN;
const repository = "HorbachPavel/Planner-Data";
const dataPath = "data/focusflow.json";
const databasePath = process.env.ASSISTANT_DB_PATH
  ?? join(homedir(), "Library", "Application Support", "FocusFlow", "assistant.sqlite");

if (!token) {
  console.error("Set GITHUB_TOKEN to the token saved for Planner-Data.");
  process.exit(1);
}

const existing = await github("GET", dataPath);
if (existing.status === 200 && !process.argv.includes("--replace")) {
  console.log("Planner-Data already has a list file. Nothing was changed.");
  process.exit(0);
}

const db = new Database(databasePath, { readonly: true, fileMustExist: true });
const tasks = db.prepare("SELECT * FROM tasks").all();
const people = db.prepare("SELECT * FROM people").all();
const rollover = db.prepare("SELECT value FROM settings WHERE key = ?").get("horizonRolloverDate");
const document = {
  version: 1,
  horizonRolloverDate: rollover?.value ?? localDateKey(new Date()),
  tasks: tasks.map(taskFromRow),
  people: people.map(personFromRow),
};

const response = await github("PUT", dataPath, {
  message: "Import FocusFlow lists",
  content: Buffer.from(JSON.stringify(document, null, 2)).toString("base64"),
  ...(existing.status === 200 ? { sha: (await existing.json()).sha } : {}),
});
if (!response.ok) {
  console.error(`GitHub returned ${response.status}: ${(await response.text()).slice(0, 300)}`);
  process.exit(1);
}
console.log(`Imported ${document.tasks.length} tasks and ${document.people.length} people.`);

function taskFromRow(row) {
  return {
    id: row.id,
    title: row.title,
    notes: row.notes ?? "",
    status: row.status,
    horizon: row.horizon,
    list: row.list === "personal" ? "personal" : "work",
    sortOrder: row.sort_order ?? 0,
    flagColor: row.flag_color ?? null,
    completedAt: iso(row.completed_at),
    createdAt: iso(row.created_at) ?? new Date(0).toISOString(),
    updatedAt: iso(row.updated_at) ?? new Date(0).toISOString(),
  };
}

function personFromRow(row) {
  return {
    id: row.id,
    name: row.name,
    topics: row.topics ?? "",
    pinned: Boolean(row.pinned),
    sortOrder: row.sort_order ?? 0,
    createdAt: iso(row.created_at) ?? new Date(0).toISOString(),
    updatedAt: iso(row.updated_at) ?? new Date(0).toISOString(),
  };
}

function iso(value) {
  return typeof value === "number" ? new Date(value).toISOString() : null;
}

function localDateKey(date) {
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${date.getFullYear()}-${month}-${day}`;
}

async function github(method, path, body) {
  return fetch(`https://api.github.com/repos/${repository}/contents/${path}`, {
    method,
    headers: {
      Accept: "application/vnd.github+json",
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
      "User-Agent": "FocusFlow",
      "X-GitHub-Api-Version": "2022-11-28",
    },
    body: body ? JSON.stringify(body) : undefined,
  });
}
