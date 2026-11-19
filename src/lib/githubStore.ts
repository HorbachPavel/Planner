import { backupPath, expiredBackupPaths } from "./backups";
import { emptyDocument, type PlannerDocument } from "./plannerDocument";

const repository = "HorbachPavel/Planner-Data";
const dataPath = "data/focusflow.json";

export type RemoteDocument = {
  document: PlannerDocument;
  sha: string | null;
};

type ContentResponse = {
  sha?: string;
  content?: string;
  path?: string;
  name?: string;
  message?: string;
};

export async function readDocument(token: string): Promise<RemoteDocument> {
  const response = await github(token, dataPath);
  if (response.status === 404) return { document: emptyDocument(), sha: null };
  const body = await readJson<ContentResponse>(response);
  if (!response.ok || !body.content || !body.sha) {
    throw new Error(githubError(response.status, body.message));
  }
  return { document: parseDocument(decode(body.content)), sha: body.sha };
}

export class GithubSaveError extends Error {
  sha: string | null;
  constructor(message: string, sha: string | null) {
    super(message);
    this.name = "GithubSaveError";
    this.sha = sha;
  }
}

export async function writeDocument(token: string, document: PlannerDocument, sha: string | null, now = new Date()): Promise<string> {
  const content = encode(JSON.stringify(document, null, 2));
  const nextSha = await putFile(token, dataPath, content, sha, "Update FocusFlow");
  try {
    await writeBackup(token, content, now);
  } catch (error) {
    const message = error instanceof Error ? error.message : "The backup was not saved.";
    throw new GithubSaveError(message, nextSha);
  }
  return nextSha;
}

async function writeBackup(token: string, content: string, now: Date): Promise<void> {
  const path = backupPath(now);
  const current = await github(token, path);
  let sha: string | null = null;
  if (current.status !== 404) {
    const currentBody = await readJson<ContentResponse>(current);
    if (!current.ok) throw new Error(githubError(current.status, currentBody.message));
    sha = currentBody.sha ?? null;
  }
  await putFile(token, path, content, sha, "Update FocusFlow backup");
  const listing = await github(token, "data/backups");
  if (listing.status === 404) return;
  const files = await readJson<ContentResponse[] | ContentResponse>(listing);
  if (!listing.ok || !Array.isArray(files)) return;
  const expired = new Set(expiredBackupPaths(files.flatMap((file) => file.path ? [file.path] : []), now));
  await Promise.all(files.filter((file) => file.path && file.sha && expired.has(file.path)).map((file) => removeFile(token, file.path!, file.sha!)));
}

async function putFile(token: string, path: string, content: string, sha: string | null, message: string): Promise<string> {
  const response = await github(token, path, {
    method: "PUT",
    body: JSON.stringify({ message, content, ...(sha ? { sha } : {}) }),
  });
  const body = (await response.json()) as { content?: { sha?: string }; message?: string };
  if (response.status === 409) throw new Error("The list was changed from another device. Open FocusFlow again.");
  if (!response.ok) throw new Error(githubError(response.status, body.message));
  if (!body.content?.sha) throw new Error("GitHub did not confirm the save.");
  return body.content.sha;
}

async function removeFile(token: string, path: string, sha: string): Promise<void> {
  await github(token, path, {
    method: "DELETE",
    body: JSON.stringify({ message: "Remove an old FocusFlow backup", sha }),
  });
}

async function github(token: string, path: string, init: RequestInit = {}): Promise<Response> {
  return fetch(`https://api.github.com/repos/${repository}/contents/${path}`, {
    ...init,
    headers: {
      Accept: "application/vnd.github+json",
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
      "User-Agent": "FocusFlow",
      "X-GitHub-Api-Version": "2022-11-28",
      ...init.headers,
    },
  });
}

function parseDocument(text: string): PlannerDocument {
  const parsed = JSON.parse(text) as Partial<PlannerDocument>;
  if (parsed.version !== 1 || !Array.isArray(parsed.tasks) || !Array.isArray(parsed.people)) {
    throw new Error("The list file has an unexpected format.");
  }
  return {
    version: 1,
    horizonRolloverDate: parsed.horizonRolloverDate ?? null,
    tasks: parsed.tasks,
    people: parsed.people,
  };
}

function encode(value: string): string {
  const bytes = new TextEncoder().encode(value);
  let binary = "";
  bytes.forEach((byte) => {
    binary += String.fromCharCode(byte);
  });
  return btoa(binary);
}

function decode(value: string): string {
  const binary = atob(value.replace(/\n/g, ""));
  const bytes = Uint8Array.from(binary, (char) => char.charCodeAt(0));
  return new TextDecoder().decode(bytes);
}

async function readJson<T>(response: Response): Promise<T> {
  return (await response.json()) as T;
}

function githubError(status: number, message?: string): string {
  if (status === 401) return "The GitHub token was not accepted.";
  return message || `GitHub returned ${status}.`;
}
