import type { PortfolioCompany } from "@/lib/config/portfolio";
import type { PostHogRevenueMetrics, SignupMetrics, SourceStatus } from "@/lib/types";

const DEFAULT_HOST = "https://app.posthog.com";
const DEFAULT_SIGNUP_EVENT = "sign_up";
const DEFAULT_ACTIVATION_EVENT = "activated";
// Cohort activation is a rolling conversion, not a daily delta, so it's always
// computed over this fixed trailing window regardless of the sync's `days`
// argument -- mirrors how HubSpot's win rate uses its own fixed 30-day window.
const ACTIVATION_COHORT_WINDOW_DAYS = 30;
const DEFAULT_REVENUE_AMOUNT_PROPERTY = "amount";
// HogQL property keys are inlined into the query string (can't be parameterized
// like values), so restrict to a safe identifier charset -- these only ever
// come from our own trusted config, but this guards against a typo producing
// a broken/injectable query rather than a clear error.
const SAFE_IDENTIFIER = /^[a-zA-Z_][a-zA-Z0-9_]*$/;

export interface PosthogResult {
  status: SourceStatus;
  signups: SignupMetrics | null;
  revenue: PostHogRevenueMetrics | null;
}

/** Pulls signup/activation event counts for the trailing `days` days via a per-company project API key. */
export async function fetchPosthogMetrics(company: PortfolioCompany, days = 1): Promise<PosthogResult> {
  const config = company.sources.posthog;
  if (!config) {
    return { status: { source: "posthog", connected: false }, signups: null, revenue: null };
  }

  const apiKey = process.env[config.apiKeyEnv];
  const projectId = process.env[config.projectIdEnv];
  const host = (config.hostEnv && process.env[config.hostEnv]) || DEFAULT_HOST;

  if (!apiKey || !projectId) {
    return {
      status: {
        source: "posthog",
        connected: false,
        error: `Missing ${config.apiKeyEnv} or ${config.projectIdEnv}`,
      },
      signups: null,
      revenue: null,
    };
  }

  try {
    const signupEvent = config.signupEvent ?? DEFAULT_SIGNUP_EVENT;
    const activationEvent = config.activationEvent ?? DEFAULT_ACTIVATION_EVENT;

    const [signups, activated, cohort, revenue] = await Promise.all([
      countEvents(host, projectId, apiKey, signupEvent, days),
      countEvents(host, projectId, apiKey, activationEvent, days),
      countCohortActivation(host, projectId, apiKey, signupEvent, activationEvent, ACTIVATION_COHORT_WINDOW_DAYS),
      config.revenueEvent
        ? sumRevenue(host, projectId, apiKey, config.revenueEvent, days, {
            amountProperty: config.revenueAmountProperty ?? DEFAULT_REVENUE_AMOUNT_PROPERTY,
            sourceFilter: config.revenueSourceFilter,
          })
        : Promise.resolve(null),
    ]);

    const activationRate = signups > 0 ? activated / signups : 0;

    return {
      status: { source: "posthog", connected: true },
      signups: {
        signups,
        activatedUsers: activated,
        activationRate,
        cohortSignups: cohort.cohortSignups,
        cohortActivated: cohort.cohortActivated,
        cohortActivationRate: cohort.cohortActivationRate,
      },
      revenue,
    };
  } catch (err) {
    return {
      status: {
        source: "posthog",
        connected: false,
        error: err instanceof Error ? err.message : "PostHog fetch failed",
      },
      signups: null,
      revenue: null,
    };
  }
}

async function countEvents(
  host: string,
  projectId: string,
  apiKey: string,
  eventName: string,
  days: number
): Promise<number> {
  const after = new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString();

  const res = await fetch(`${host}/api/projects/${projectId}/query/`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      query: {
        kind: "HogQLQuery",
        query: "select count() from events where event = {event} and timestamp >= {after}",
        values: { event: eventName, after },
      },
    }),
  });

  if (!res.ok) {
    throw new Error(`PostHog query for "${eventName}" failed: ${res.status}`);
  }

  const body = await res.json();
  return Number(body.results?.[0]?.[0] ?? 0);
}

/**
 * Real cohort activation over the trailing `windowDays`: of the distinct persons
 * who fired the signup event in the window, how many have since fired the
 * activation event. Counting distinct persons within a single signup cohort (not
 * two independent event tallies) guarantees the rate stays in [0, 1] -- unlike the
 * legacy `activated/signups` event ratio, which could exceed 100% whenever
 * already-signed-up users activated during the window.
 */
async function countCohortActivation(
  host: string,
  projectId: string,
  apiKey: string,
  signupEvent: string,
  activationEvent: string,
  windowDays: number
): Promise<{ cohortSignups: number; cohortActivated: number; cohortActivationRate: number | null }> {
  const after = new Date(Date.now() - windowDays * 24 * 60 * 60 * 1000).toISOString();

  const res = await fetch(`${host}/api/projects/${projectId}/query/`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      query: {
        kind: "HogQLQuery",
        // Denominator: distinct persons who signed up in the window. Numerator:
        // those same persons who also have an activation event at/after the window
        // start (activation follows signup, so this scopes to their own journey).
        query:
          "select count(distinct person_id), " +
          "count(distinct if(person_id in (" +
          "select distinct person_id from events where event = {activationEvent} and timestamp >= {after}" +
          "), person_id, NULL)) " +
          "from events where event = {signupEvent} and timestamp >= {after}",
        values: { signupEvent, activationEvent, after },
      },
    }),
  });

  if (!res.ok) {
    throw new Error(`PostHog cohort activation query failed: ${res.status}`);
  }

  const body = await res.json();
  const [cohortSignups, cohortActivated] = body.results?.[0] ?? [0, 0];
  const signups = Number(cohortSignups ?? 0);
  const activated = Number(cohortActivated ?? 0);
  return {
    cohortSignups: signups,
    cohortActivated: activated,
    cohortActivationRate: signups > 0 ? activated / signups : null,
  };
}

async function sumRevenue(
  host: string,
  projectId: string,
  apiKey: string,
  eventName: string,
  days: number,
  opts: { amountProperty: string; sourceFilter?: { property: string; value: string } }
): Promise<PostHogRevenueMetrics> {
  if (!SAFE_IDENTIFIER.test(opts.amountProperty)) {
    throw new Error(`Invalid revenueAmountProperty "${opts.amountProperty}"`);
  }
  if (opts.sourceFilter && !SAFE_IDENTIFIER.test(opts.sourceFilter.property)) {
    throw new Error(`Invalid revenueSourceFilter property "${opts.sourceFilter.property}"`);
  }

  const after = new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString();
  const filterClause = opts.sourceFilter ? `and properties.${opts.sourceFilter.property} = {filterValue}` : "";

  const res = await fetch(`${host}/api/projects/${projectId}/query/`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      query: {
        kind: "HogQLQuery",
        query: `select count(), sum(toFloat(properties.${opts.amountProperty})) from events where event = {event} and timestamp >= {after} ${filterClause}`,
        values: { event: eventName, after, filterValue: opts.sourceFilter?.value },
      },
    }),
  });

  if (!res.ok) {
    throw new Error(`PostHog revenue query for "${eventName}" failed: ${res.status}`);
  }

  const body = await res.json();
  const [count, amount] = body.results?.[0] ?? [0, 0];
  return { count: Number(count ?? 0), amount: Number(amount ?? 0) };
}
