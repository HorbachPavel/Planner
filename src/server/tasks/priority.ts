import type { Task } from "@/db/schema";

export type PriorityResult = {
  score: number;
  bucket: "now" | "next" | "later";
  reasons: string[];
};

const DAY = 86_400_000;

export function calculatePriority(
  task: Pick<
    Task,
    "status" | "importance" | "energy" | "estimateMinutes" | "dueAt" | "priorityOverride"
  >,
  now = new Date(),
): PriorityResult {
  if (task.priorityOverride !== null) {
    return classify(task.priorityOverride, ["Priority was set manually"]);
  }

  let score = task.importance * 12;
  const reasons = [`Importance ${task.importance}/5`];

  if (task.dueAt) {
    const days = (task.dueAt.getTime() - now.getTime()) / DAY;
    if (days < 0) {
      score += 45 + Math.min(20, Math.abs(days) * 2);
      reasons.push("Overdue");
    } else if (days < 1) {
      score += 38;
      reasons.push("Due today");
    } else if (days <= 3) {
      score += 26;
      reasons.push("Due in the next 3 days");
    } else if (days <= 7) {
      score += 14;
      reasons.push("Due this week");
    }
  }

  if (task.estimateMinutes && task.estimateMinutes <= 15) {
    score += 8;
    reasons.push("Quick to finish");
  } else if (task.estimateMinutes && task.estimateMinutes > 120) {
    score -= 8;
    reasons.push("A large task is better split up");
  }

  if (task.energy <= 2) {
    score += 4;
    reasons.push("Low barrier to start");
  }
  if (task.status === "in_progress") {
    score += 18;
    reasons.push("Already started");
  }
  if (task.status === "blocked") {
    score -= 50;
    reasons.push("Blocked");
  }

  return classify(Math.max(0, Math.round(score)), reasons);
}

function classify(score: number, reasons: string[]): PriorityResult {
  return {
    score,
    bucket: score >= 65 ? "now" : score >= 38 ? "next" : "later",
    reasons,
  };
}
