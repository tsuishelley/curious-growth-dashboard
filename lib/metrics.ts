import { adminDb } from "@/lib/firebase/admin";
import type { DailyMetrics } from "@/lib/types";

/** Returns the trailing `days` daily snapshots for a company, oldest first. */
export async function getCompanyMetrics(companyId: string, days = 30): Promise<DailyMetrics[]> {
  const snapshot = await adminDb()
    .collection("companies")
    .doc(companyId)
    .collection("dailyMetrics")
    .orderBy("date", "desc")
    .limit(days)
    .get();

  const docs = snapshot.docs.map((doc) => doc.data() as DailyMetrics);
  return docs.reverse();
}
