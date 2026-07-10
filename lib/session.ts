import "server-only";
import { cookies } from "next/headers";
import { adminAuth } from "@/lib/firebase/admin";
import { isAllowedEmail, SESSION_COOKIE_NAME } from "@/lib/auth";

export interface VerifiedSession {
  uid: string;
  email: string;
}

/** Verifies the session cookie server-side. Returns null if missing/invalid/wrong domain. */
export async function getVerifiedSession(): Promise<VerifiedSession | null> {
  const cookieStore = cookies();
  const sessionCookie = cookieStore.get(SESSION_COOKIE_NAME)?.value;
  if (!sessionCookie) return null;

  try {
    const decoded = await adminAuth().verifySessionCookie(sessionCookie, true);
    if (!isAllowedEmail(decoded.email)) return null;
    return { uid: decoded.uid, email: decoded.email! };
  } catch {
    return null;
  }
}
