import { NextRequest, NextResponse } from "next/server";
import { archiveTask, updateTask } from "@/server/tasks/service";

export const runtime = "nodejs";

export async function PATCH(
  request: NextRequest,
  context: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await context.params;
    return NextResponse.json(await updateTask(id, await request.json()));
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Couldn’t update the task." },
      { status: 400 },
    );
  }
}

export async function DELETE(
  _request: NextRequest,
  context: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await context.params;
    await archiveTask(id);
    return new NextResponse(null, { status: 204 });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Couldn’t archive the task." },
      { status: 404 },
    );
  }
}
