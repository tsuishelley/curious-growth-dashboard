export const SESSION_COOKIE_NAME = "__session";
export const ALLOWED_EMAIL_DOMAIN = "curious.vc";

/**
 * Individual addresses allowed to sign in alongside ALLOWED_EMAIL_DOMAIN, read
 * from a comma-separated env var (e.g. "a@example.com,b@example.com").
 *
 * Kept in the environment rather than committed because this repo is public and
 * these are real people's addresses.
 *
 * Note that a guest gets exactly what a @curious.vc member gets: every company
 * tab, revenue and pipeline included. The dashboard has no per-company scoping,
 * so there is no way to admit someone to one portfolio company alone.
 */
function guestAllowlist(): string[] {
  return (process.env.ALLOWED_GUEST_EMAILS ?? "")
    .split(",")
    .map((entry) => entry.trim().toLowerCase())
    .filter(Boolean);
}

export function isAllowedEmail(email: string | null | undefined): boolean {
  if (!email) return false;
  const normalized = email.trim().toLowerCase();
  if (normalized.endsWith(`@${ALLOWED_EMAIL_DOMAIN}`)) return true;
  return guestAllowlist().includes(normalized);
}
