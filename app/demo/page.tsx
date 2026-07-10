import { redirect } from "next/navigation";
import { portfolioCompanies } from "@/lib/config/portfolio";

export default function DemoHomePage() {
  redirect(`/demo/${portfolioCompanies[0].slug}`);
}
