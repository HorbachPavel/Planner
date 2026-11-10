import { NextRequest, NextResponse } from "next/server";
import { getSetting, setSetting } from "@/server/config";

const publicKeys = ["microsoftClientId", "microsoftTenantId"] as const;

export async function GET() {
  const values = Object.fromEntries(
    await Promise.all(publicKeys.map(async (key) => [key, await getSetting(key)])),
  );
  return NextResponse.json(values);
}

export async function POST(request: NextRequest) {
  try {
    const body = (await request.json()) as Record<string, unknown>;
    for (const key of publicKeys) {
      const value = body[key];
      if (typeof value === "string" && value.trim()) await setSetting(key, value.trim());
    }
    return NextResponse.json({ ok: true });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Couldn’t save settings." },
      { status: 400 },
    );
  }
}
