import { NextRequest, NextResponse } from "next/server";
import { createTimeBlock, listCalendar } from "@/server/calendar/service";

export const runtime = "nodejs";

export async function GET(request: NextRequest) {
  const from = new Date(
    request.nextUrl.searchParams.get("from") ??
      new Date(Date.now() - 7 * 86_400_000).toISOString(),
  );
  const to = new Date(
    request.nextUrl.searchParams.get("to") ??
      new Date(Date.now() + 30 * 86_400_000).toISOString(),
  );
  return NextResponse.json(await listCalendar(from, to));
}

export async function POST(request: NextRequest) {
  try {
    return NextResponse.json(await createTimeBlock(await request.json()), { status: 201 });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Couldn’t add the block." },
      { status: 400 },
    );
  }
}
