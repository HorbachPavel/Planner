import { NextRequest, NextResponse } from "next/server";
import { finishAuth } from "@/server/integrations/outlook/service";

export const runtime = "nodejs";

export async function GET(request: NextRequest) {
  const code = request.nextUrl.searchParams.get("code");
  const state = request.nextUrl.searchParams.get("state");
  const error = request.nextUrl.searchParams.get("error_description");
  const verifier = request.cookies.get("outlook_pkce")?.value;
  const expectedState = request.cookies.get("outlook_state")?.value;
  if (error) return NextResponse.redirect(new URL(`/?outlookError=${encodeURIComponent(error)}`, request.url));
  if (!code || !verifier || !state || state !== expectedState) {
    return NextResponse.json({ error: "Invalid OAuth callback." }, { status: 400 });
  }
  try {
    await finishAuth(code, verifier);
    const response = NextResponse.redirect(new URL("/?outlook=connected", request.url));
    response.cookies.delete("outlook_pkce");
    response.cookies.delete("outlook_state");
    return response;
  } catch (authError) {
    return NextResponse.json(
      { error: authError instanceof Error ? authError.message : "Authorization failed." },
      { status: 400 },
    );
  }
}
