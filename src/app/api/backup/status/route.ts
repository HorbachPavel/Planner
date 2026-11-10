import { NextResponse } from "next/server";
import { backupStatus, runBackup } from "@/server/backup/auto";

export const runtime = "nodejs";

export function GET() {
  return NextResponse.json(backupStatus());
}

export async function POST() {
  try {
    const result = await runBackup();
    return NextResponse.json({ result, ...backupStatus() });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Couldn’t create a backup." },
      { status: 500 },
    );
  }
}
