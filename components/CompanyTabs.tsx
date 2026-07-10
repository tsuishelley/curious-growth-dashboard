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
    <header className="border-b border-slate-200 bg-white">
      <div className="mx-auto flex max-w-6xl items-center justify-between px-6 pt-4">
        <h1 className="text-lg font-semibold text-slate-900">Curious Growth Dashboard</h1>
        <div className="flex items-center gap-4 text-sm text-slate-500">
          <span>{userEmail}</span>
          <button onClick={handleSignOut} className="font-medium text-slate-700 hover:text-slate-900">
            Sign out
          </button>
        </div>
      </div>
      <nav className="mx-auto flex max-w-6xl gap-1 px-6">
        {portfolioCompanies.map((company) => {
          const href = `/dashboard/${company.slug}`;
          const active = pathname === href;
          return (
            <Link
              key={company.id}
              href={href}
              className={`rounded-t-md px-4 py-2 text-sm font-medium transition ${
                active
                  ? "border-b-2 border-brand-500 text-brand-600"
                  : "border-b-2 border-transparent text-slate-500 hover:text-slate-800"
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
