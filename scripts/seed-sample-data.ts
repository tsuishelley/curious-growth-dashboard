/**
 * Populates Firestore with 30 days of realistic-looking sample metrics for
 * every portfolio company, so the dashboard is demoable before real API
 * credentials are wired up. Every seeded doc is marked `sample: true` and the
 * UI shows a "sample data" badge so it's never mistaken for real data.
 *
 * Usage: npm run seed
 */
import { config as loadEnv } from "dotenv";
loadEnv({ path: ".env.local" });

import { adminDb } from "../lib/firebase/admin";
import { portfolioCompanies } from "../lib/config/portfolio";
import { generateSampleSeries } from "../lib/sampleData";

async function main() {
  const db = adminDb();

  for (const company of portfolioCompanies) {
    console.log(`Seeding sample data for ${company.name}...`);
    const batch = db.batch();

    for (const metrics of generateSampleSeries(company)) {
      const ref = db.collection("companies").doc(company.id).collection("dailyMetrics").doc(metrics.date);
      batch.set(ref, metrics, { merge: true });
    }

    await batch.commit();
  }

  console.log("Done. Sample data seeded for:", portfolioCompanies.map((c) => c.name).join(", "));
}

main().catch((err) => {
  console.error("Seed failed:", err);
  process.exit(1);
});
