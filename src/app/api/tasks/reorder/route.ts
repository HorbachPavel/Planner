import { NextRequest, NextResponse } from "next/server";
import { reorderTasks } from "@/server/tasks/service";

export const runtime = "nodejs";

export async function POST(request: NextRequest) {
  try {
    const body = (await request.json()) as {
      ids?: string[];
      movedId?: string;
      horizon?: "overdue" | "today" | "tomorrow" | "this_week" | "next_week" | "later";
    };
    await reorderTasks(
      body.ids ?? [],
      body.movedId && body.horizon ? { movedId: body.movedId, horizon: body.horizon } : undefined,
    );
    return NextResponse.json({ ok: true });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Couldn’t change the order." },
      { status: 400 },
    );
  }
}
