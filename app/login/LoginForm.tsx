"use client";

import { useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { signInWithPopup } from "firebase/auth";
import { getFirebaseAuth, getGoogleProvider } from "@/lib/firebase/client";

export default function LoginForm({ domains }: { domains: string[] }) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function handleSignIn() {
    setError(null);
    setLoading(true);
    try {
      const result = await signInWithPopup(getFirebaseAuth(), getGoogleProvider());
      const idToken = await result.user.getIdToken();

      const res = await fetch("/api/auth/session", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ idToken }),
      });

      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error ?? "Sign-in failed");
      }

      const next = searchParams.get("next") ?? "/dashboard/convox";
      router.push(next);
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Sign-in failed");
    } finally {
      setLoading(false);
    }
  }

  const domainHint = domains.map((d) => `@${d}`).join(" or ");

  return (
    <div className="w-full max-w-sm border border-rule bg-paper p-10">
      <h1 className="font-display text-3xl leading-tight text-ink">Growth at Curious</h1>
      <p className="mt-3 text-[14px] leading-relaxed text-ink-muted">
        Sign in with your {domainHint} account — or an approved guest account — to view portfolio company metrics.
      </p>

      <button
        onClick={handleSignIn}
        disabled={loading}
        className="label-mono mt-7 w-full bg-ink px-4 py-3 text-paper transition-colors hover:bg-accent disabled:opacity-50"
      >
        {loading ? "Signing in..." : "Sign in with Google"}
      </button>

      {error && <p className="mt-4 text-[12px] leading-relaxed text-accent">{error}</p>}
    </div>
  );
}
