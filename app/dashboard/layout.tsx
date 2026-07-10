import { redirect } from "next/navigation";
import { getVerifiedSession } from "@/lib/session";
import CompanyTabs from "@/components/CompanyTabs";

export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
  const session = await getVerifiedSession();
  if (!session) {
    redirect("/login");
  }

  return (
    <div className="min-h-screen">
      <CompanyTabs userEmail={session.email} />
      <main className="mx-auto max-w-6xl px-6 py-8">{children}</main>
    </div>
  );
}
