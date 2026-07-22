export const SESSION_COOKIE_NAME = "__session";

// The domain allowed by default when ALLOWED_EMAIL_DOMAINS isn't set. Not a hard
// rule — just the fallback so the app keeps working out of the box for the team.
export const DEFAULT_EMAIL_DOMAIN = "curious.vc";

/**
 * Email domains allowed to sign in, from a comma-separated env var
 * (e.g. "curious.vc,partner.com"). Leading "@" and casing are tolerated.
 *
 * Falls back to DEFAULT_EMAIL_DOMAIN when unset, so the default whitelist is
 * "anyone on the curious.vc domain OR a listed guest" — the domain just isn't
 * hardcoded anymore, so it can be changed or extended without a code change.
 */
export function allowedEmailDomains(): string[] {
  const configured = (process.env.ALLOWED_EMAIL_DOMAINS ?? "")
    .split(",")
    .map((entry) => entry.trim().toLowerCase().replace(/^@/, ""))
    .filter(Boolean);
  return configured.length > 0 ? configured : [DEFAULT_EMAIL_DOMAIN];
}

/**
 * Individual addresses allowed to sign in alongside the allowed domains, read
 * from a comma-separated env var (e.g. "a@example.com,b@example.com").
 *
 * Kept in the environment rather than committed because this repo is public and
 * these are real people's addresses.
 *
 * Note that a guest gets exactly what a domain member gets: every company tab,
 * revenue and pipeline included. The dashboard has no per-company scoping, so
 * there is no way to admit someone to one portfolio company alone.
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
  const at = normalized.lastIndexOf("@");
  if (at === -1) return false;
  const domain = normalized.slice(at + 1);
  if (allowedEmailDomains().includes(domain)) return true;
  return guestAllowlist().includes(normalized);
}
