import type { PortfolioCompany } from "@/lib/config/portfolio";
import type { FunnelStageValue, PipelineMetrics, SourceStatus } from "@/lib/types";

const HUBSPOT_API_BASE = "https://api.hubapi.com";
const CLOSED_WON_STAGE = "closedwon";
const CLOSED_LOST_STAGE = "closedlost";
const MQL_LIFECYCLE_STAGE = "marketingqualifiedlead";
const MS_PER_DAY = 24 * 60 * 60 * 1000;
// Win rate / deal velocity are computed over a fixed trailing window rather
// than the daily sync's 1-day window, since most companies don't close deals
// every single day — a 1-day window would show `null` on most days.
const CLOSED_DEALS_WINDOW_DAYS = 30;

interface HubspotSearchResult {
  total: number;
  results: Array<{ properties?: Record<string, string> }>;
}

interface PipelineStage {
  id: string;
  label: string;
  displayOrder: number;
}

export interface HubspotResult {
  status: SourceStatus;
  pipeline: PipelineMetrics | null;
  /** Counts used for the Lead / MQL / Customer funnel stages. */
  funnelCounts: { lead: number; mql: number; customer: number } | null;
  /** Snapshot of currently open deals across every stage of the default HubSpot pipeline. */
  dealStageFunnel: FunnelStageValue[] | null;
}

/** Pulls new contacts/deals created in the trailing `days` days via a per-company private app token. */
export async function fetchHubspotMetrics(company: PortfolioCompany, days = 1): Promise<HubspotResult> {
  const config = company.sources.hubspot;
  if (!config) {
    return { status: { source: "hubspot", connected: false }, pipeline: null, funnelCounts: null, dealStageFunnel: null };
  }

  const token = process.env[config.tokenEnv];
  if (!token) {
    return {
      status: { source: "hubspot", connected: false, error: `Missing ${config.tokenEnv}` },
      pipeline: null,
      funnelCounts: null,
      dealStageFunnel: null,
    };
  }

  try {
    const sinceMs = Date.now() - days * MS_PER_DAY;
    const closedSinceMs = Date.now() - CLOSED_DEALS_WINDOW_DAYS * MS_PER_DAY;

    const [contacts, createdDeals, closedDeals, stageFunnel] = await Promise.all([
      searchObjects(token, "contacts", "createdate", sinceMs, ["lifecyclestage"]),
      searchObjects(token, "deals", "createdate", sinceMs, ["dealstage", "amount"]),
      searchObjects(token, "deals", "closedate", closedSinceMs, ["dealstage", "amount", "createdate", "closedate"]),
      fetchDealStageFunnel(token),
    ]);

    const newContacts = contacts.total;
    const newMqls = contacts.results.filter(
      (c) => (c.properties?.lifecyclestage ?? "").toLowerCase() === MQL_LIFECYCLE_STAGE
    ).length;

    const wonDealsList = createdDeals.results.filter((d) =>
      (d.properties?.dealstage ?? "").toLowerCase().includes(CLOSED_WON_STAGE)
    );

    const newDeals = createdDeals.total;
    const newPipelineValue = createdDeals.results.reduce((sum, d) => sum + Number(d.properties?.amount ?? 0), 0);
    const wonDeals = wonDealsList.length;
    const wonValue = wonDealsList.reduce((sum, d) => sum + Number(d.properties?.amount ?? 0), 0);

    // Win rate / deal velocity use the trailing CLOSED_DEALS_WINDOW_DAYS window
    // (not the daily sync's 1-day window, and not deals created+won in the same
    // window) since they reflect sales process performance, not daily volume.
    const closedWon = closedDeals.results.filter((d) =>
      (d.properties?.dealstage ?? "").toLowerCase().includes(CLOSED_WON_STAGE)
    );
    const closedLost = closedDeals.results.filter((d) =>
      (d.properties?.dealstage ?? "").toLowerCase().includes(CLOSED_LOST_STAGE)
    );
    const totalClosed = closedWon.length + closedLost.length;
    const winRate = totalClosed > 0 ? closedWon.length / totalClosed : null;

    const daysToCloseList = closedWon
      .map((d) => {
        // HubSpot returns createdate/closedate as ISO date strings, not epoch numbers.
        const created = d.properties?.createdate ? new Date(d.properties.createdate).getTime() : NaN;
        const closed = d.properties?.closedate ? new Date(d.properties.closedate).getTime() : NaN;
        return Number.isFinite(created) && Number.isFinite(closed) ? (closed - created) / MS_PER_DAY : null;
      })
      .filter((v): v is number => v !== null);
    const avgDaysToCloseDays =
      daysToCloseList.length > 0 ? daysToCloseList.reduce((sum, v) => sum + v, 0) / daysToCloseList.length : null;

    return {
      status: { source: "hubspot", connected: true },
      pipeline: {
        newContacts,
        newMqls,
        newDeals,
        newPipelineValue,
        wonDeals,
        wonValue,
        lostDeals: closedLost.length,
        winRate,
        avgDaysToCloseDays,
      },
      funnelCounts: { lead: newContacts, mql: newMqls, customer: wonDeals },
      dealStageFunnel: stageFunnel,
    };
  } catch (err) {
    return {
      status: {
        source: "hubspot",
        connected: false,
        error: err instanceof Error ? err.message : "HubSpot fetch failed",
      },
      pipeline: null,
      funnelCounts: null,
      dealStageFunnel: null,
    };
  }
}

/** Snapshot of currently-open deal counts across every stage of HubSpot's default deal pipeline, in stage order. */
async function fetchDealStageFunnel(token: string): Promise<FunnelStageValue[] | null> {
  const pipelinesRes = await fetch(`${HUBSPOT_API_BASE}/crm/v3/pipelines/deals`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!pipelinesRes.ok) throw new Error(`HubSpot pipelines fetch failed: ${pipelinesRes.status}`);
  const pipelinesBody = await pipelinesRes.json();
  const defaultPipeline = pipelinesBody.results?.[0];
  if (!defaultPipeline) return null;

  const stages: PipelineStage[] = [...defaultPipeline.stages]
    .sort((a: PipelineStage, b: PipelineStage) => a.displayOrder - b.displayOrder);

  const openDeals = await searchObjects(token, "deals", null, null, ["dealstage"]);

  const countsByStage = new Map<string, number>();
  for (const deal of openDeals.results) {
    const stageId = deal.properties?.dealstage;
    if (!stageId) continue;
    countsByStage.set(stageId, (countsByStage.get(stageId) ?? 0) + 1);
  }

  return stages.map((stage) => ({
    key: stage.id,
    label: stage.label,
    count: countsByStage.get(stage.id) ?? 0,
  }));
}

// HubSpot's CRM search API returns at most 100 results per page. We paginate
// through every page so property-based breakdowns (MQL count, won/lost for win
// rate, open deals per stage) are computed over the FULL result set — otherwise
// a company with >100 deals in the window gets a win rate off a truncated slice.
// MAX_PAGES caps a pathological pull (e.g. tens of thousands of open deals) at
// 5,000 records rather than looping unbounded.
const MAX_PAGES = 50;

async function searchObjects(
  token: string,
  objectType: "contacts" | "deals",
  dateProperty: string | null,
  sinceMs: number | null,
  properties: string[]
): Promise<HubspotSearchResult> {
  const results: Array<{ properties?: Record<string, string> }> = [];
  let after: string | undefined;
  let total = 0;
  let pages = 0;

  do {
    const res = await fetch(`${HUBSPOT_API_BASE}/crm/v3/objects/${objectType}/search`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        filterGroups:
          dateProperty && sinceMs
            ? [{ filters: [{ propertyName: dateProperty, operator: "GTE", value: String(sinceMs) }] }]
            : [],
        properties,
        limit: 100,
        after,
      }),
    });

    if (!res.ok) {
      throw new Error(`HubSpot ${objectType} search failed: ${res.status}`);
    }

    const body = await res.json();
    total = body.total ?? total;
    results.push(...(body.results ?? []));
    after = body.paging?.next?.after;
    pages++;
  } while (after && pages < MAX_PAGES);

  return { total: total || results.length, results };
}
