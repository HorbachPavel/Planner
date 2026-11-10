import { NextResponse } from "next/server";
import { syncOutlookEvents } from "@/server/integrations/outlook/service";

export const runtime = "nodejs";

export async function POST() {
  try {
    return NextResponse.json({ count: await syncOutlookEvents() });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Couldn’t sync Outlook." },
      { status: 400 },
    );
  }
}
