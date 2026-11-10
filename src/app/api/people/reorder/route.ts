import { NextRequest, NextResponse } from "next/server";
import { reorderPeople } from "@/server/people/service";

export const runtime = "nodejs";

export async function POST(request: NextRequest) {
  try {
    const body = (await request.json()) as { ids?: string[]; movedId?: string; pinned?: boolean };
    await reorderPeople(
      body.ids ?? [],
      body.movedId !== undefined && body.pinned !== undefined
        ? { movedId: body.movedId, pinned: body.pinned }
        : undefined,
    );
    return NextResponse.json({ ok: true });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Couldn’t change the order." },
      { status: 400 },
    );
  }
}
