import Link from "next/link";
import { portfolioCompanies } from "@/lib/config/portfolio";

export default function DemoLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen">
      <header className="border-b border-rule bg-paper">
        <div className="mx-auto flex max-w-6xl items-baseline justify-between px-8 pt-10">
          <h1 className="font-display text-4xl leading-none tracking-tight text-ink">Growth at Curious</h1>
          <span className="label-mono bg-accent-soft px-2 py-1 text-accent">
            Demo preview — randomly generated data
          </span>
        </div>
        <nav className="mx-auto flex max-w-6xl gap-7 px-8 pt-7">
          {portfolioCompanies.map((company) => (
            <Link
              key={company.id}
              href={`/demo/${company.slug}`}
              className="label-mono border-b-2 border-transparent pb-3 text-ink-faint transition-colors hover:border-accent hover:text-accent"
            >
              {company.name}
            </Link>
          ))}
        </nav>
      </header>
      <main className="mx-auto max-w-6xl px-8 py-10">{children}</main>
    </div>
  );
}
