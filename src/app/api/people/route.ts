import { NextRequest, NextResponse } from "next/server";
import { createPerson, listPeople } from "@/server/people/service";

export const runtime = "nodejs";

export async function GET() {
  return NextResponse.json(await listPeople(), {
    headers: { "Cache-Control": "no-store" },
  });
}

export async function POST(request: NextRequest) {
  try {
    return NextResponse.json(await createPerson(await request.json()), { status: 201 });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Couldn’t add the person." },
      { status: 400 },
    );
  }
}
