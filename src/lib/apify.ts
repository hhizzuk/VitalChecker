import { ApifyClient } from "apify-client";

/** True when server-side Apify Store runs are allowed (news, Crunchbase, web scrape). */
export function isApifyConfigured(): boolean {
  const t = process.env.APIFY_API_TOKEN;
  return Boolean(t && t !== "your-apify-token-here" && t.length > 8);
}

/** Shared client for Store actors; null if not configured. */
export function getApifyClient(): ApifyClient | null {
  if (!isApifyConfigured()) return null;
  return new ApifyClient({ token: process.env.APIFY_API_TOKEN! });
}
