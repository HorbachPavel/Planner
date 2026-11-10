import { NextRequest, NextResponse } from "next/server";
import { createTask, listTasks } from "@/server/tasks/service";

export const runtime = "nodejs";

export async function GET(request: NextRequest) {
  const includeArchived = request.nextUrl.searchParams.get("archived") === "true";
  return NextResponse.json(await listTasks(includeArchived));
}

export async function POST(request: NextRequest) {
  try {
    const task = await createTask(await request.json());
    return NextResponse.json(task, { status: 201 });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Couldn’t create the task." },
      { status: 400 },
    );
  }
}
