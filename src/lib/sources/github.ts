import { Company } from "../types";

interface TrendingRepo {
  name?: string;
  fullName?: string;
  full_name?: string;
  repo?: string;
  description?: string | null;
  stars?: number;
  stargazers_count?: number;
  totalStars?: number;
  forks?: number;
  forks_count?: number;
  language?: string | null;
  url?: string;
  html_url?: string;
  owner?: string | { login?: string };
  author?: string;
  currentPeriodStars?: number;
  todayStars?: number;
  starsToday?: number;
  starsThisPeriod?: number;
}

export async function fetchGitHubCompanies(keywords: string[] = []): Promise<Company[]> {
  const apifyToken = process.env.APIFY_API_TOKEN;
  if (!apifyToken || apifyToken === "your-apify-token-here") {
    throw new Error("APIFY_API_TOKEN missing — required for GitHub trending scraper");
  }

  const { ApifyClient } = await import("apify-client");
  const client = new ApifyClient({ token: apifyToken });

  const run = await client.actor("mohamedgb00714/github-trending-scraper").call(
    {
      dateRange: "weekly",
      maxItems: 50,
    },
    { timeout: 90 }
  );

  if (run.status !== "SUCCEEDED") {
    throw new Error(`GitHub trending scraper run did not succeed (status: ${run.status})`);
  }

  const { items } = await client.dataset(run.defaultDatasetId).listItems();
  const repos = items as TrendingRepo[];

  const lowerKeywords = keywords
    .map((k) => k.toLowerCase())
    .filter((k) => k.length > 2);

  const seen = new Set<string>();
  const companies: Company[] = [];

  for (const repo of repos) {
    const fullName =
      repo.fullName ||
      repo.full_name ||
      repo.repo ||
      repo.name ||
      "";
    if (!fullName) continue;

    const ownerName =
      typeof repo.owner === "string"
        ? repo.owner
        : repo.owner?.login || repo.author || fullName.split("/")[0] || fullName;

    const stars =
      repo.stars ?? repo.stargazers_count ?? repo.totalStars ?? 0;
    const forks = repo.forks ?? repo.forks_count ?? 0;
    const trendingStars =
      repo.currentPeriodStars ??
      repo.starsThisPeriod ??
      repo.todayStars ??
      repo.starsToday;
    const url =
      repo.url ||
      repo.html_url ||
      (fullName.includes("/") ? `https://github.com/${fullName}` : "");
    const description = repo.description || fullName;
    const language = repo.language ?? null;

    const blob = `${fullName} ${description} ${language || ""}`.toLowerCase();
    const matchedKeywords = lowerKeywords.filter((k) => blob.includes(k));

    const key = ownerName.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);

    companies.push({
      name: ownerName,
      url,
      description,
      source: "github",
      sourceData: {
        repo: fullName,
        repo_url: url.startsWith("https://github.com") ? url : `https://github.com/${fullName}`,
        stars,
        forks,
        language,
        trending_stars: trendingStars,
        trending_period: "weekly",
        matched_keywords: matchedKeywords,
      },
      signals: {
        github: true,
      },
    });
  }

  if (lowerKeywords.length > 0) {
    companies.sort((a, b) => {
      const am = (a.sourceData.matched_keywords as string[] | undefined)?.length || 0;
      const bm = (b.sourceData.matched_keywords as string[] | undefined)?.length || 0;
      if (am !== bm) return bm - am;
      const as = (a.sourceData.stars as number | undefined) || 0;
      const bs = (b.sourceData.stars as number | undefined) || 0;
      return bs - as;
    });
  }

  return companies;
}
