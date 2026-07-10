import { redirect } from "next/navigation";
import { portfolioCompanies } from "@/lib/config/portfolio";

export default function HomePage() {
  redirect(`/dashboard/${portfolioCompanies[0].slug}`);
}
