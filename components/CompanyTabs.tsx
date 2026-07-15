"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { portfolioCompanies } from "@/lib/config/portfolio";

export default function CompanyTabs({ userEmail }: { userEmail: string }) {
  const pathname = usePathname();
  const router = useRouter();

  async function handleSignOut() {
    await fetch("/api/auth/logout", { method: "POST" });
    router.push("/login");
    router.refresh();
  }

  return (
    <header className="border-b border-rule bg-paper">
      <div className="mx-auto flex max-w-6xl items-baseline justify-between px-8 pt-10">
        <h1 className="font-display text-4xl leading-none tracking-tight text-ink">Growth at Curious</h1>
        <div className="flex items-baseline gap-4 text-xs">
          <span className="text-ink-faint">{userEmail}</span>
          <button onClick={handleSignOut} className="font-bold text-ink hover:text-accent">
            Sign Out
          </button>
        </div>
      </div>
      <nav className="mx-auto flex max-w-6xl gap-7 px-8 pt-7">
        {portfolioCompanies.map((company) => {
          const href = `/dashboard/${company.slug}`;
          const active = pathname === href;
          return (
            <Link
              key={company.id}
              href={href}
              className={`label-mono border-b-2 pb-3 transition-colors ${
                active
                  ? "border-accent font-medium text-accent"
                  : "border-transparent text-ink-faint hover:text-ink"
              }`}
            >
              {company.name}
            </Link>
          );
        })}
      </nav>
    </header>
  );
}
