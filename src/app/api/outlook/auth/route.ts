import { NextResponse } from "next/server";
import { createAuthRequest } from "@/server/integrations/outlook/service";

export const runtime = "nodejs";

export async function GET() {
  try {
    const { url, verifier, state } = await createAuthRequest();
    const response = NextResponse.redirect(url);
    response.cookies.set("outlook_pkce", verifier, {
      httpOnly: true,
      sameSite: "lax",
      secure: false,
      maxAge: 600,
      path: "/",
    });
    response.cookies.set("outlook_state", state, {
      httpOnly: true,
      sameSite: "lax",
      secure: false,
      maxAge: 600,
      path: "/",
    });
    return response;
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Couldn’t start authorization." },
      { status: 400 },
    );
  }
}
