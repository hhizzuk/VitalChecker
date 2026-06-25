import { getApifyClient } from "../apify";
import { Company } from "../types";

interface CrunchbaseResult {
  name?: string;
  legalName?: string;
  description?: string;
  crunchbaseUrl?: string;
  crunchbaseSlug?: string;
  website?: string;
  linkedinUrl?: string;
  twitterUrl?: string;
  founded?: string;
  foundedYear?: number;
  headquarters?: string;
  city?: string;
  region?: string;
  country?: string;
  industry?: string;
  categories?: string[];
  fundingTotal?: string;
  fundingTotalUsd?: number;
  fundingRounds?: number;
  lastFundingRound?: string;
  lastFundingDate?: string;
  lastFundingAmount?: string;
  investors?: string[];
  leadInvestors?: string[];
  numInvestors?: number;
  employeeCount?: number;
  employeeCountRange?: string;
  revenueRange?: string;
  operatingStatus?: string;
  ipoStatus?: string;
}

// sovereigntaylor/crunchbase-scraper — 560+ runs, ~99% success rate over 30 days,
// supports searchQuery + fundingStage + maxResults inputs and returns rich
// funding/investor/employee fields.
const CRUNCHBASE_ACTOR = "sovereigntaylor/crunchbase-scraper";

export async function fetchCrunchbaseCompanies(keywords: string[] = []): Promise<Company[]> {
  const client = getApifyClient();
  if (!client) {
    throw new Error("Crunchbase source requires APIFY_API_TOKEN in .env.local");
  }

  const searchQuery = keywords.length > 0 ? keywords.slice(0, 4).join(" ") : "AI startup";

  const run = await client.actor(CRUNCHBASE_ACTOR).call(
    {
      searchQuery,
      maxResults: 25,
    },
    { timeout: 90 }
  );

  const { items } = await client.dataset(run.defaultDatasetId).listItems();

  const seen = new Set<string>();
  const companies: Company[] = [];

  for (const raw of items) {
    const r = raw as CrunchbaseResult;
    const name = r.name || r.legalName;
    if (!name) continue;
    const key = name.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);

    const stage = r.lastFundingRound || r.ipoStatus || r.operatingStatus;

    companies.push({
      name,
      url: r.website || r.crunchbaseUrl || "",
      description: r.description || `${r.industry || ""}${r.headquarters ? ` — ${r.headquarters}` : ""}`.trim(),
      source: "crunchbase",
      sourceData: {
        crunchbase_url: r.crunchbaseUrl,
        founded: r.founded,
        founded_year: r.foundedYear,
        headquarters: r.headquarters,
        city: r.city,
        country: r.country,
        industry: r.industry,
        categories: r.categories,
        funding_total: r.fundingTotal,
        funding_total_usd: r.fundingTotalUsd,
        funding_rounds: r.fundingRounds,
        last_funding_round: r.lastFundingRound,
        last_funding_date: r.lastFundingDate,
        last_funding_amount: r.lastFundingAmount,
        stage,
        investors: r.investors?.slice(0, 8),
        lead_investors: r.leadInvestors,
        num_investors: r.numInvestors,
        employee_count: r.employeeCount,
        employee_count_range: r.employeeCountRange,
        revenue_range: r.revenueRange,
        operating_status: r.operatingStatus,
        linkedin: r.linkedinUrl,
      },
      signals: {
        funding: true,
      },
    });

    if (companies.length >= 20) break;
  }

  return companies;
}
