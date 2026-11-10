import { NextRequest, NextResponse } from "next/server";
import { deletePerson, updatePerson } from "@/server/people/service";

export const runtime = "nodejs";

export async function PATCH(
  request: NextRequest,
  context: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await context.params;
    return NextResponse.json(await updatePerson(id, await request.json()));
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Couldn’t save." },
      { status: 400 },
    );
  }
}

export async function DELETE(
  _request: NextRequest,
  context: { params: Promise<{ id: string }> },
) {
  const { id } = await context.params;
  await deletePerson(id);
  return new NextResponse(null, { status: 204 });
}
