import { Company } from "../types";

interface YCRecord {
  name: string;
  slug?: string;
  website?: string;
  long_description?: string;
  one_liner?: string;
  team_size?: number | null;
  industry?: string;
  subindustry?: string;
  tags?: string[];
  batch?: string;
  status?: string;
  industries?: string[];
  regions?: string[];
  stage?: string;
  all_locations?: string;
  isHiring?: boolean;
  url?: string;
  launched_at?: number;
}

const YC_DATASET_URL = "https://yc-oss.github.io/api/companies/all.json";

let cachedDataset: { data: YCRecord[]; fetchedAt: number } | null = null;
const CACHE_MS = 1000 * 60 * 30;

async function loadYCDataset(): Promise<YCRecord[]> {
  if (cachedDataset && Date.now() - cachedDataset.fetchedAt < CACHE_MS) {
    return cachedDataset.data;
  }
  const res = await fetch(YC_DATASET_URL, {
    headers: { Accept: "application/json" },
  });
  if (!res.ok) {
    throw new Error(`YC dataset fetch failed: ${res.status} ${res.statusText}`);
  }
  const data = (await res.json()) as YCRecord[];
  cachedDataset = { data, fetchedAt: Date.now() };
  return data;
}

function recentBatchScore(batch: string | undefined): number {
  if (!batch) return 0;
  const m = batch.match(/(Winter|Spring|Summer|Fall|W|S|F)\s*(\d{2,4})/i);
  if (!m) return 0;
  const yr = parseInt(m[2], 10);
  const year = yr < 100 ? 2000 + yr : yr;
  const seasonOffset =
    /winter|^w/i.test(batch) ? 0 :
    /spring|^s\b/i.test(batch) ? 1 :
    /summer/i.test(batch) ? 2 : 3;
  return year * 4 + seasonOffset;
}

export async function fetchYCCompanies(keywords: string[] = []): Promise<Company[]> {
  const dataset = await loadYCDataset();
  const lowered = keywords.map((k) => k.toLowerCase()).filter(Boolean);

  const matches = dataset
    .map((c) => {
      const haystack = [
        c.name,
        c.one_liner,
        c.long_description,
        c.industry,
        c.subindustry,
        ...(c.tags || []),
        ...(c.industries || []),
      ]
        .filter(Boolean)
        .join(" ")
        .toLowerCase();

      let score = 0;
      for (const kw of lowered) {
        if (!kw) continue;
        if (haystack.includes(kw)) score += 1;
        if ((c.name || "").toLowerCase().includes(kw)) score += 2;
        if ((c.tags || []).some((t) => t.toLowerCase().includes(kw))) score += 1;
      }
      return { c, score };
    })
    .filter(({ c, score }) => (lowered.length === 0 || score > 0) && c.status !== "Inactive")
    .sort((a, b) => {
      if (b.score !== a.score) return b.score - a.score;
      return recentBatchScore(b.c.batch) - recentBatchScore(a.c.batch);
    })
    .slice(0, 25)
    .map(({ c }) => c);

  return matches.map((c) => ({
    name: c.name,
    url: c.website || c.url || "",
    description: c.one_liner || c.long_description?.slice(0, 240) || "",
    source: "yc",
    sourceData: {
      batch: c.batch,
      status: c.status,
      team_size: c.team_size,
      stage: c.stage,
      tags: c.tags,
      industry: c.industry,
      subindustry: c.subindustry,
      location: c.all_locations,
      regions: c.regions,
      isHiring: c.isHiring,
      yc_url: c.url,
    },
    signals: {
      launches: true,
      hiring: c.isHiring === true,
    },
  }));
}
