import { NextRequest, NextResponse } from "next/server";
import { deleteTimeBlock } from "@/server/calendar/service";

export async function DELETE(
  _request: NextRequest,
  context: { params: Promise<{ id: string }> },
) {
  const { id } = await context.params;
  await deleteTimeBlock(id);
  return new NextResponse(null, { status: 204 });
}
