/**
 * Tests a single company/source credential in isolation, without needing
 * Firebase set up. Useful while wiring up credentials one at a time.
 *
 * Usage: npm run test:source <company-slug> <ga4|hubspot|posthog|searchconsole>
 * Example: npm run test:source buildfire hubspot
 */
import { config as loadEnv } from "dotenv";
loadEnv({ path: ".env.local" });

import { getCompanyBySlug } from "../lib/config/portfolio";
import { fetchGa4Metrics } from "../lib/sources/ga4";
import { fetchHubspotMetrics } from "../lib/sources/hubspot";
import { fetchPosthogMetrics } from "../lib/sources/posthog";
import { fetchSearchConsoleMetrics } from "../lib/sources/searchconsole";

async function main() {
  const [slug, source] = process.argv.slice(2);

  if (!slug || !source) {
    console.error("Usage: npm run test:source <company-slug> <ga4|hubspot|posthog|searchconsole>");
    process.exit(1);
  }

  const company = getCompanyBySlug(slug);
  if (!company) {
    console.error(`Unknown company slug "${slug}". Check lib/config/portfolio.ts for valid slugs.`);
    process.exit(1);
  }

  console.log(`Testing ${source} for ${company.name}...\n`);

  let result;
  if (source === "ga4") result = await fetchGa4Metrics(company, 7);
  else if (source === "hubspot") result = await fetchHubspotMetrics(company, 7);
  else if (source === "posthog") result = await fetchPosthogMetrics(company, 7);
  else if (source === "searchconsole") result = await fetchSearchConsoleMetrics(company, 7);
  else {
    console.error(`Unknown source "${source}". Must be ga4, hubspot, posthog, or searchconsole.`);
    process.exit(1);
  }

  console.log(JSON.stringify(result, null, 2));

  if (!result.status.connected) {
    console.error(`\n❌ Not connected: ${result.status.error}`);
    process.exit(1);
  }
  console.log("\n✅ Connected successfully.");
}

main().catch((err) => {
  console.error("Test failed:", err);
  process.exit(1);
});
