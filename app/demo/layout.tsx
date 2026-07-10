import Link from "next/link";
import { portfolioCompanies } from "@/lib/config/portfolio";

export default function DemoLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen">
      <header className="border-b border-slate-200 bg-white">
        <div className="mx-auto max-w-6xl px-6 pt-4">
          <div className="flex items-center justify-between">
            <h1 className="text-lg font-semibold text-slate-900">Curious Growth Dashboard</h1>
            <span className="rounded-full bg-amber-50 px-2.5 py-1 text-xs font-medium text-amber-700">
              Demo preview — no login, randomly generated data
            </span>
          </div>
        </div>
        <nav className="mx-auto flex max-w-6xl gap-1 px-6">
          {portfolioCompanies.map((company) => (
            <Link
              key={company.id}
              href={`/demo/${company.slug}`}
              className="rounded-t-md border-b-2 border-transparent px-4 py-2 text-sm font-medium text-slate-500 hover:border-brand-500 hover:text-brand-600"
            >
              {company.name}
            </Link>
          ))}
        </nav>
      </header>
      <main className="mx-auto max-w-6xl px-6 py-8">{children}</main>
    </div>
  );
}
