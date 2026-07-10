import type { SourceType } from "@/lib/config/portfolio";

export const SOURCE_LABELS: Record<SourceType, string> = {
  ga4: "GA4",
  hubspot: "HubSpot",
  posthog: "PostHog",
  searchconsole: "Search Console",
  googleads: "Google Ads",
};
