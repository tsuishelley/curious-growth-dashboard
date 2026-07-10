export const SESSION_COOKIE_NAME = "__session";
export const ALLOWED_EMAIL_DOMAIN = "curious.vc";

export function isAllowedEmail(email: string | null | undefined): boolean {
  if (!email) return false;
  return email.toLowerCase().endsWith(`@${ALLOWED_EMAIL_DOMAIN}`);
}
