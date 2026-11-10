import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getSetting, setSetting } from "@/server/config";

export const runtime = "nodejs";

const scratchpadKey = "scratchpad";

export async function GET() {
  return NextResponse.json({ text: (await getSetting(scratchpadKey)) ?? "" });
}

export async function PUT(request: NextRequest) {
  try {
    const body = (await request.json()) as { text?: unknown };
    const text = z.string().max(20_000).parse(body.text ?? "");
    await setSetting(scratchpadKey, text);
    return NextResponse.json({ ok: true });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Couldn’t save the note." },
      { status: 400 },
    );
  }
}
