import { Suspense } from "react";
import { allowedEmailDomains } from "@/lib/auth";
import LoginForm from "./LoginForm";

export const dynamic = "force-dynamic";

export default function LoginPage() {
  // Read on the server so the allowed-domain hint stays in sync with the actual
  // ALLOWED_EMAIL_DOMAINS enforcement, without exposing a separate client var.
  const domains = allowedEmailDomains();

  return (
    <div className="flex min-h-screen items-center justify-center bg-canvas">
      <Suspense fallback={null}>
        <LoginForm domains={domains} />
      </Suspense>
    </div>
  );
}
