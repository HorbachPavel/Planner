import { NextRequest, NextResponse } from "next/server";
import { importIcs } from "@/server/integrations/outlook/ics";

export const runtime = "nodejs";

export async function POST(request: NextRequest) {
  try {
    let content: string;
    if (request.headers.get("content-type")?.includes("multipart/form-data")) {
      const data = await request.formData();
      const file = data.get("file");
      if (!(file instanceof File)) throw new Error("Add an .ics file in the file field.");
      content = await file.text();
    } else {
      content = await request.text();
    }
    if (!content.includes("BEGIN:VCALENDAR")) throw new Error("This file does not look like an iCalendar file.");
    return NextResponse.json({ count: await importIcs(content) });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Couldn’t import the calendar." },
      { status: 400 },
    );
  }
}
