import { NextRequest, NextResponse } from "next/server";
import { adminAuth } from "@/lib/firebase/admin";
import { ALLOWED_EMAIL_DOMAIN, isAllowedEmail, SESSION_COOKIE_NAME } from "@/lib/auth";

// Firebase Admin needs the Node.js runtime (not Edge).
export const runtime = "nodejs";

const SESSION_EXPIRES_IN_MS = 14 * 24 * 60 * 60 * 1000; // 14 days

export async function POST(request: NextRequest) {
  const { idToken } = await request.json();
  if (!idToken) {
    return NextResponse.json({ error: "Missing idToken" }, { status: 400 });
  }

  try {
    const decoded = await adminAuth().verifyIdToken(idToken);
    if (!isAllowedEmail(decoded.email)) {
      // Name the address that was rejected: Google sign-in succeeding and the
      // dashboard still refusing is otherwise indistinguishable from a broken
      // login, and "restricted to curious.vc" reads as a flat no to an approved
      // guest. Only ever echoes the caller's own verified email back to them.
      return NextResponse.json(
        {
          error: `${decoded.email ?? "That account"} is not approved for this dashboard. ` +
            `Ask Shelley to add it, or sign in with your @${ALLOWED_EMAIL_DOMAIN} account.`,
        },
        { status: 403 }
      );
    }

    const sessionCookie = await adminAuth().createSessionCookie(idToken, {
      expiresIn: SESSION_EXPIRES_IN_MS,
    });

    const response = NextResponse.json({ ok: true });
    response.cookies.set(SESSION_COOKIE_NAME, sessionCookie, {
      maxAge: SESSION_EXPIRES_IN_MS / 1000,
      httpOnly: true,
      secure: true,
      sameSite: "lax",
      path: "/",
    });
    return response;
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Invalid token" },
      { status: 401 }
    );
  }
}

export async function DELETE() {
  const response = NextResponse.json({ ok: true });
  response.cookies.delete(SESSION_COOKIE_NAME);
  return response;
}
