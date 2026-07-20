export type SourceType = "ga4" | "hubspot" | "posthog" | "searchconsole" | "googleads";

export interface FunnelStage {
  key: string;
  label: string;
  source: SourceType;
}

export interface CompanySourceConfig {
  ga4?: {
    // GA4 property ID (e.g. "properties/123456789"). Auth is via the shared
    // service account in GA4_SERVICE_ACCOUNT_ENV, added as Viewer on the property.
    propertyIdEnv: string;
  };
  hubspot?: {
    // Per-company HubSpot private app access token.
    tokenEnv: string;
  };
  posthog?: {
    // Per-company PostHog personal/project API key + project ID.
    apiKeyEnv: string;
    projectIdEnv: string;
    // Optional self-hosted PostHog host; defaults to https://app.posthog.com
    hostEnv?: string;
    // Event names vary per portco's tracking plan; default to sign_up / activated.
    signupEvent?: string;
    activationEvent?: string;
    // Optional: short_id of a saved PostHog funnel Insight (e.g. a company's own
    // marketing-visit -> paid attribution funnel) to surface as a secondary
    // snapshot funnel + channel-breakdown table on that company's dashboard tab.
    attributionFunnelInsightId?: string;
    // Optional: for self-serve/PLG companies with no HubSpot pipeline, sum a
    // numeric event property (e.g. Stripe payment amounts) as a real "New
    // Revenue" metric. `revenueAmountProperty` defaults to "amount".
    // `revenueSourceFilter` optionally restricts to events with a specific
    // property value (e.g. only server-verified payment events, not
    // client-captured ones with no reliable amount).
    revenueEvent?: string;
    revenueAmountProperty?: string;
    revenueSourceFilter?: { property: string; value: string };
    // Optional: when true and GA4 isn't connected, computes website traffic
    // (sessions, new/active users, top pages, channel mix) directly from
    // PostHog's own $pageview/session data instead. Kept as a fallback rather
    // than blended with GA4 -- the two use different session-counting
    // methodologies, so mixing them in one trend would be misleading if a
    // company later connects GA4 too.
    trackWebsiteTraffic?: boolean;
    // Restricts the "Top Pages" list (only) to these $host values -- e.g. the
    // marketing site, excluding the product/app itself, which usually
    // dominates raw pageview volume and isn't what "top pages" should mean.
    // If unset, "Top Pages" is simply omitted rather than showing product
    // pages mislabeled as marketing content.
    marketingHosts?: string[];
  };
  searchconsole?: {
    // Search Console site URL (e.g. "sc-domain:buildfire.com" or
    // "https://www.buildfire.com/"). Auth is via the same shared GA4 service
    // account, added as a user on the property in Search Console directly.
    siteUrlEnv: string;
  };
  googleads?: {
    // Google Ads customer ID for this company's ad account (10 digits, no
    // dashes, e.g. "1234567890"). Auth is via the shared OAuth refresh token in
    // GOOGLE_ADS_*_ENV constants below — that token belongs to a Google account
    // that must have Ads access to this customer ID (directly, or via the
    // shared manager/MCC account in GOOGLE_ADS_LOGIN_CUSTOMER_ID_ENV).
    customerIdEnv: string;
  };
}

export interface PortfolioCompany {
  id: string;
  name: string;
  slug: string;
  sources: CompanySourceConfig;
  funnel: FunnelStage[];
}

/** Shared Google service account credentials JSON, used for all GA4 pulls. */
export const GA4_SERVICE_ACCOUNT_ENV = "GA4_SERVICE_ACCOUNT_JSON";

/**
 * Shared Google Ads OAuth credentials. Unlike GA4/Search Console, the Ads API
 * doesn't support simple service-account auth for third-party/agency access —
 * these belong to one Google account (with Ads visibility into every portco's
 * account, typically via a manager/MCC account) and a Developer Token that
 * requires applying to Google for approval.
 */
export const GOOGLE_ADS_DEVELOPER_TOKEN_ENV = "GOOGLE_ADS_DEVELOPER_TOKEN";
export const GOOGLE_ADS_CLIENT_ID_ENV = "GOOGLE_ADS_CLIENT_ID";
export const GOOGLE_ADS_CLIENT_SECRET_ENV = "GOOGLE_ADS_CLIENT_SECRET";
export const GOOGLE_ADS_REFRESH_TOKEN_ENV = "GOOGLE_ADS_REFRESH_TOKEN";
/** Manager (MCC) account ID, digits only, sent as the `login-customer-id` header. */
export const GOOGLE_ADS_LOGIN_CUSTOMER_ID_ENV = "GOOGLE_ADS_LOGIN_CUSTOMER_ID";

export const portfolioCompanies: PortfolioCompany[] = [
  {
    id: "convox",
    name: "Convox",
    slug: "convox",
    sources: {
      ga4: { propertyIdEnv: "CONVOX_GA4_PROPERTY_ID" },
      posthog: {
        apiKeyEnv: "CONVOX_POSTHOG_API_KEY",
        projectIdEnv: "CONVOX_POSTHOG_PROJECT_ID",
        hostEnv: "CONVOX_POSTHOG_HOST",
        // Convox's tracking plan uses "signup" (not "sign_up"). "payment_success"
        // is the terminal step of Convox's own internal attribution funnel
        // (www visit -> signup -> onboarding -> paid), so it's used as the
        // "activated" milestone here rather than an early onboarding step.
        signupEvent: "signup",
        activationEvent: "payment_success",
        attributionFunnelInsightId: "oE4iEQUB",
        revenueEvent: "payment_success",
        revenueSourceFilter: { property: "source", value: "stripe_pipeline" },
        trackWebsiteTraffic: true,
        // console.convox.com (the product) dominates raw pageview volume;
        // these are the actual marketing-site hosts.
        marketingHosts: ["www.convox.com", "convox.com", "convox.webflow.io"],
      },
      searchconsole: { siteUrlEnv: "CONVOX_SEARCH_CONSOLE_SITE_URL" },
      googleads: { customerIdEnv: "CONVOX_GOOGLE_ADS_CUSTOMER_ID" },
    },
    funnel: [
      { key: "visitor", label: "Visitor", source: "ga4" },
      { key: "signup", label: "Signup", source: "posthog" },
      { key: "activated", label: "Activated", source: "posthog" },
    ],
  },
  {
    id: "polymer",
    name: "Polymer",
    slug: "polymer",
    sources: {
      ga4: { propertyIdEnv: "POLYMER_GA4_PROPERTY_ID" },
      posthog: {
        apiKeyEnv: "POLYMER_POSTHOG_API_KEY",
        projectIdEnv: "POLYMER_POSTHOG_PROJECT_ID",
        hostEnv: "POLYMER_POSTHOG_HOST",
        // Polymer's tracking plan uses "user_signed_up" (not "sign_up").
        // "job_created" (first job posting) is the chosen activation milestone.
        signupEvent: "user_signed_up",
        activationEvent: "job_created",
        // Polymer's own saved funnel: signup -> create job -> publish job ->
        // published, a healthy in-app funnel with no cross-domain identity gap
        // (unlike Convox's, this one has no channel breakdown).
        attributionFunnelInsightId: "fmKTKyxE",
        trackWebsiteTraffic: true,
      },
      searchconsole: { siteUrlEnv: "POLYMER_SEARCH_CONSOLE_SITE_URL" },
      googleads: { customerIdEnv: "POLYMER_GOOGLE_ADS_CUSTOMER_ID" },
    },
    funnel: [
      { key: "visitor", label: "Visitor", source: "ga4" },
      { key: "signup", label: "Signup", source: "posthog" },
      { key: "activated", label: "Activated", source: "posthog" },
    ],
  },
  {
    id: "buildfire",
    name: "Buildfire",
    slug: "buildfire",
    sources: {
      ga4: { propertyIdEnv: "BUILDFIRE_GA4_PROPERTY_ID" },
      hubspot: { tokenEnv: "BUILDFIRE_HUBSPOT_TOKEN" },
      searchconsole: { siteUrlEnv: "BUILDFIRE_SEARCH_CONSOLE_SITE_URL" },
      googleads: { customerIdEnv: "BUILDFIRE_GOOGLE_ADS_CUSTOMER_ID" },
    },
    funnel: [
      { key: "visitor", label: "Visitor", source: "ga4" },
      { key: "lead", label: "Lead", source: "hubspot" },
      { key: "mql", label: "MQL", source: "hubspot" },
      { key: "customer", label: "Customer", source: "hubspot" },
    ],
  },
  {
    id: "avenue",
    name: "Avenue",
    slug: "avenue",
    // Self-serve for now: signups/activation tracked in PostHog (project 198634,
    // org "AvenueHQ", US cloud). Avenue is nominally hybrid, but there's no
    // HubSpot access yet -- add `hubspot: { tokenEnv: "AVENUE_HUBSPOT_TOKEN" }`
    // and its pipeline KPIs + deal-stage funnel light up automatically once a
    // token exists. Every source returns "not connected" until its env var is
    // set, so this tab fills in partial data as credentials land.
    sources: {
      ga4: { propertyIdEnv: "AVENUE_GA4_PROPERTY_ID" },
      posthog: {
        apiKeyEnv: "AVENUE_POSTHOG_API_KEY",
        projectIdEnv: "AVENUE_POSTHOG_PROJECT_ID",
        hostEnv: "AVENUE_POSTHOG_HOST",
        // Confirmed against Avenue's tracking plan (project 198634, US cloud):
        // "sign_up" is the real signup event (~36/30d). "onboarding_completed" is
        // the activation milestone -- but heads up, it has fired only once
        // (2025-11-24) and not since, so activation rate reads 0 until that
        // instrumentation is fixed on Avenue's side. No PostHog revenue/payment
        // event exists yet, so `revenueEvent` is intentionally unset (New Revenue
        // stays off for Avenue).
        signupEvent: "sign_up",
        activationEvent: "onboarding_completed",
        // Avenue has no GA4 connected yet but plenty of PostHog $pageview data,
        // so derive website traffic (sessions, users, channel mix) and the
        // funnel's "Visitor" stage from PostHog as a fallback -- otherwise those
        // would all read 0. Swap back to GA4 automatically if a GA4 property is
        // later added (GA4 wins when both are present).
        trackWebsiteTraffic: true,
      },
      searchconsole: { siteUrlEnv: "AVENUE_SEARCH_CONSOLE_SITE_URL" },
      googleads: { customerIdEnv: "AVENUE_GOOGLE_ADS_CUSTOMER_ID" },
    },
    funnel: [
      { key: "visitor", label: "Visitor", source: "ga4" },
      { key: "signup", label: "Signup", source: "posthog" },
      { key: "activated", label: "Activated", source: "posthog" },
    ],
  },
  {
    id: "uservoice",
    name: "Uservoice",
    slug: "uservoice",
    sources: {
      ga4: { propertyIdEnv: "USERVOICE_GA4_PROPERTY_ID" },
      hubspot: { tokenEnv: "USERVOICE_HUBSPOT_TOKEN" },
      searchconsole: { siteUrlEnv: "USERVOICE_SEARCH_CONSOLE_SITE_URL" },
      googleads: { customerIdEnv: "USERVOICE_GOOGLE_ADS_CUSTOMER_ID" },
    },
    funnel: [
      { key: "visitor", label: "Visitor", source: "ga4" },
      { key: "lead", label: "Lead", source: "hubspot" },
      { key: "mql", label: "MQL", source: "hubspot" },
      { key: "customer", label: "Customer", source: "hubspot" },
    ],
  },
];

export function getCompanyBySlug(slug: string): PortfolioCompany | undefined {
  return portfolioCompanies.find((c) => c.slug === slug);
}
