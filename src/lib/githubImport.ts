import { parseDocument } from "./plannerChanges";
import type { PlannerDocument } from "./plannerDocument";

// One-time import from the old storage. It only reads; nothing is changed on GitHub.

const listUrl = "https://api.github.com/repos/HorbachPavel/Planner-Data/contents/data/focusflow.json";

export async function readGithubList(token: string): Promise<PlannerDocument> {
  const response = await fetch(listUrl, {
    cache: "no-store",
    headers: {
      Accept: "application/vnd.github+json",
      Authorization: `Bearer ${token}`,
      "X-GitHub-Api-Version": "2022-11-28",
    },
  });
  const body = (await response.json()) as { content?: string; message?: string };
  if (response.status === 401) throw new Error("The GitHub token was not accepted.");
  if (!response.ok || !body.content) throw new Error(body.message || `GitHub returned ${response.status}.`);
  const binary = atob(body.content.replace(/\n/g, ""));
  return parseDocument(new TextDecoder().decode(Uint8Array.from(binary, (char) => char.charCodeAt(0))));
}
